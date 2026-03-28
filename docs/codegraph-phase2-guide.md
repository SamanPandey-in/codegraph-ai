# CodeGraph AI — Phase 2 Implementation Guide

## What Phase 1 Delivered (Current State)

Before building Phase 2, it helps to be precise about what exists so nothing is duplicated or broken.

**Server** (`server/src/analyze/`):
- Babel AST parser extracting file-level `imports` and `require()` calls for JS/TS/JSX/TSX
- `buildDependencyGraph` produces `{ [filePath]: { deps: string[], type: string } }`
- GitHub API integration (public repos, OAuth-owned repos, branch selection)
- Local directory picker with path sandboxing
- Auth: GitHub OAuth via Passport + JWT in HTTP-only cookie

**Client** (`client/src/features/graph/`):
- React Flow canvas with Dagre left-to-right layout
- Nodes color-coded by inferred type: `component`, `page`, `hook`, `service`, `util`, `config`, `module`
- Click-to-inspect panel showing a node's direct `deps` and `usedBy` list
- Redux slice (`graphSlice`) holding `data`, `selectedNodeId`, `status`, `error`

**What does NOT exist yet**: any AI layer, NLQ search, dead-code detection, impact simulation, function-level detail, or caching.

---

## Phase 2 Goals

| Feature | Value | Complexity |
|---|---|---|
| AI File Explanation | Explains any file in plain English | Medium |
| Natural Language Query (NLQ) | "Where is auth?" highlights nodes | Medium |
| Dead Code Detection | Flags unreachable files visually | Low |
| Impact Analysis | Shows what breaks if a file changes | Low-Medium |
| Function-Level Node Detail | Lists functions/classes inside each file | Medium |

These five features share two new server modules (AI service + graph intelligence service) and one new client feature folder. They can be built in the order listed — each one is independently valuable and doesn't block the next.

---

## New Folder Structure

Only show additions; existing structure is unchanged.

```
codegraph-ai/
├── server/
│   └── src/
│       ├── ai/                          ← NEW
│       │   ├── index.js
│       │   ├── routes/ai.routes.js
│       │   ├── controllers/ai.controller.js
│       │   └── services/
│       │       ├── openai.service.js    ← LLM wrapper + caching
│       │       └── nlq.service.js       ← keyword/semantic matching
│       └── analyze/
│           └── services/
│               └── astParser.service.js ← extend with function extraction
│
└── client/
    └── src/
        └── features/
            └── ai/                      ← NEW
                ├── index.js
                ├── components/
                │   ├── AiPanel.jsx      ← explanation + NLQ UI
                │   └── QueryBar.jsx     ← search input
                ├── services/aiService.js
                └── slices/aiSlice.js
```

---

## Step 1 — Extend the Parser (Function-Level Data)

The current `astParser.service.js` only stores `{ deps, type }` per file. Phase 2 needs `functions` and `exports` too. This enriches the AI prompts and the node detail panel.

**File:** `server/src/analyze/services/astParser.service.js`

Add a new helper after `extractImports`:

```js
// Extract top-level function and class names from a file's AST
function extractDeclarations(ast) {
  const names = [];

  for (const node of ast.program.body) {
    // function foo() {} / async function foo() {}
    if (node.type === 'FunctionDeclaration' && node.id?.name) {
      names.push({ name: node.id.name, kind: 'function' });
    }

    // class Foo {}
    if (node.type === 'ClassDeclaration' && node.id?.name) {
      names.push({ name: node.id.name, kind: 'class' });
    }

    // export default function foo() {} / export default class Foo {}
    if (node.type === 'ExportDefaultDeclaration') {
      const decl = node.declaration;
      if (
        (decl.type === 'FunctionDeclaration' || decl.type === 'ClassDeclaration') &&
        decl.id?.name
      ) {
        names.push({ name: decl.id.name, kind: decl.type === 'ClassDeclaration' ? 'class' : 'function' });
      }
    }

    // export function foo() {} / export const foo = () => {}
    if (node.type === 'ExportNamedDeclaration' && node.declaration) {
      const decl = node.declaration;
      if (decl.type === 'FunctionDeclaration' && decl.id?.name) {
        names.push({ name: decl.id.name, kind: 'function' });
      }
      if (decl.type === 'VariableDeclaration') {
        for (const v of decl.declarations) {
          if (
            v.id?.name &&
            (v.init?.type === 'ArrowFunctionExpression' ||
              v.init?.type === 'FunctionExpression')
          ) {
            names.push({ name: v.id.name, kind: 'function' });
          }
        }
      }
    }

    // const foo = () => {}  (unexported arrow functions at module root)
    if (node.type === 'VariableDeclaration') {
      for (const v of node.declarations) {
        if (
          v.id?.name &&
          (v.init?.type === 'ArrowFunctionExpression' ||
            v.init?.type === 'FunctionExpression')
        ) {
          names.push({ name: v.id.name, kind: 'function' });
        }
      }
    }
  }

  return names;
}
```

Update `buildDependencyGraph` to call it and store the result:

```js
// Inside the limit(async () => { ... }) block, replace the graph assignment:

const code = await fs.readFile(filePath, 'utf8');
let ast;
try {
  ast = parse(code, {
    sourceType: 'module',
    errorRecovery: true,
    plugins: ['typescript', 'jsx', 'decorators-legacy', 'classProperties', 'dynamicImport'],
  });
} catch {
  ast = null;
}

// Re-use the AST for both imports and declarations
const specifiers = ast ? extractImportsFromAST(ast) : [];
const declarations = ast ? extractDeclarations(ast) : [];

// ... resolve deps as before ...

graph[key] = {
  deps: [...new Set(deps)],
  type: inferFileType(key),
  declarations,          // ← NEW: [{ name, kind }]
};
```

> **Note:** Refactor `extractImports` to accept a pre-parsed AST (`extractImportsFromAST`) so the file is only read and parsed once.

This change is backward-compatible — the frontend `NodeDetail` panel simply ignores `declarations` until it is updated in a later step.

---

## Step 2 — AI Service (Server)

### 2a. Install dependencies

```bash
cd server
npm install openai ioredis
```

`openai` is the official SDK. `ioredis` connects to Redis for response caching. If you don't have Redis running locally, replace the cache layer with a simple `Map` for development and add Redis for production.

### 2b. Add environment variables

In `server/.env`:

```
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini          # cheapest model with good quality
AI_CACHE_TTL_SECONDS=3600         # cache explanations for 1 hour
REDIS_URL=redis://localhost:6379  # omit to use in-memory cache
```

### 2c. Create `openai.service.js`

**File:** `server/src/ai/services/openai.service.js`

```js
import OpenAI from 'openai';
import { createClient } from 'ioredis';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const TTL = parseInt(process.env.AI_CACHE_TTL_SECONDS || '3600', 10);

// Fallback to in-memory cache if Redis is not configured
let cache;
if (process.env.REDIS_URL) {
  cache = createClient({ url: process.env.REDIS_URL });
  cache.on('error', (err) => console.warn('[redis]', err.message));
} else {
  const mem = new Map();
  cache = {
    get: async (k) => mem.get(k) ?? null,
    set: async (k, v) => mem.set(k, v),
  };
}

async function getCached(key) {
  try {
    const val = await cache.get(key);
    return val ? JSON.parse(val) : null;
  } catch {
    return null;
  }
}

async function setCached(key, value) {
  try {
    const serialized = JSON.stringify(value);
    if (cache.setex) {
      await cache.setex(key, TTL, serialized);
    } else {
      await cache.set(key, serialized);
    }
  } catch {
    // Cache write failure is non-fatal
  }
}

// Explain a single file given its path, content snippet, deps, and declarations
export async function explainFile({ filePath, content, deps, declarations, type }) {
  const cacheKey = `explain:${filePath}:${content.length}`;
  const cached = await getCached(cacheKey);
  if (cached) return cached;

  const declarationList = declarations?.length
    ? declarations.map((d) => `${d.kind} ${d.name}`).join(', ')
    : 'none found';

  const prompt = `You are a senior engineer reviewing a codebase. Explain the following file concisely for a developer who is onboarding.

File: ${filePath}
Type: ${type}
Exports / Declarations: ${declarationList}
Imports from: ${deps.slice(0, 10).join(', ') || 'nothing'}

File content (first 3000 chars):
\`\`\`
${content.slice(0, 3000)}
\`\`\`

Respond with a JSON object with exactly these keys:
{
  "purpose": "One sentence: what this file does and why it exists.",
  "keyFunctions": ["up to 5 bullet strings describing the most important functions/exports"],
  "dependencies": "One sentence summarising what it relies on.",
  "risks": "One sentence: potential issues, tech debt, or things to watch out for. Say 'None obvious.' if clean."
}
Only respond with the JSON object — no markdown fences, no preamble.`;

  const response = await openai.chat.completions.create({
    model: MODEL,
    max_tokens: 400,
    temperature: 0.2,
    messages: [{ role: 'user', content: prompt }],
  });

  let result;
  try {
    result = JSON.parse(response.choices[0].message.content.trim());
  } catch {
    result = {
      purpose: response.choices[0].message.content.trim(),
      keyFunctions: [],
      dependencies: '',
      risks: '',
    };
  }

  await setCached(cacheKey, result);
  return result;
}

// Answer a natural-language question about the codebase
export async function queryCodebase({ question, relevantFiles }) {
  const cacheKey = `nlq:${question}:${relevantFiles.map((f) => f.path).join(',')}`;
  const cached = await getCached(cacheKey);
  if (cached) return cached;

  const fileList = relevantFiles
    .slice(0, 8)
    .map((f) => `- ${f.path} (${f.type}): deps [${f.deps.slice(0, 5).join(', ')}]`)
    .join('\n');

  const prompt = `You are helping a developer navigate a codebase. Answer the question based only on the file information provided.

Question: "${question}"

Most relevant files:
${fileList}

Respond with a JSON object:
{
  "answer": "2-4 sentence plain English answer.",
  "highlightedFiles": ["list of file paths most relevant to the answer, max 5"],
  "confidence": "high | medium | low"
}
Only respond with the JSON object.`;

  const response = await openai.chat.completions.create({
    model: MODEL,
    max_tokens: 300,
    temperature: 0.1,
    messages: [{ role: 'user', content: prompt }],
  });

  let result;
  try {
    result = JSON.parse(response.choices[0].message.content.trim());
  } catch {
    result = { answer: response.choices[0].message.content.trim(), highlightedFiles: [], confidence: 'low' };
  }

  await setCached(cacheKey, result);
  return result;
}
```

### 2d. Create `nlq.service.js`

This service does the lightweight pre-filtering before the LLM call, keeping token usage low.

**File:** `server/src/ai/services/nlq.service.js`

```js
// Score each graph node against a query using keyword overlap.
// Returns top-N nodes sorted by relevance score.
export function rankFilesByQuery(graph, query, topN = 8) {
  const tokens = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2);

  const scored = Object.entries(graph).map(([filePath, node]) => {
    const pathTokens = filePath.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/);
    const depTokens = node.deps.flatMap((d) =>
      d.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/),
    );
    const declTokens = (node.declarations || []).map((d) => d.name.toLowerCase());

    const allTokens = new Set([...pathTokens, ...depTokens, ...declTokens]);
    const score = tokens.reduce((acc, t) => {
      if (allTokens.has(t)) return acc + 2;
      // Partial match (substring)
      for (const at of allTokens) {
        if (at.includes(t) || t.includes(at)) return acc + 1;
      }
      return acc;
    }, 0);

    return { path: filePath, score, ...node };
  });

  return scored
    .filter((f) => f.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}
```

---

## Step 3 — AI Routes and Controller (Server)

### 3a. Controller

**File:** `server/src/ai/controllers/ai.controller.js`

```js
import { readFile } from 'fs/promises';
import path from 'path';
import { explainFile, queryCodebase } from '../services/openai.service.js';
import { rankFilesByQuery } from '../services/nlq.service.js';

// POST /api/ai/explain
// Body: { filePath, repoRoot, graph }
export async function explainController(req, res, next) {
  try {
    const { filePath, repoRoot, graph } = req.body;

    if (!filePath || !graph) {
      return res.status(400).json({ error: 'filePath and graph are required.' });
    }

    const node = graph[filePath];
    if (!node) {
      return res.status(404).json({ error: 'File not found in graph.' });
    }

    // Read file content from disk only for local repos
    let content = '';
    if (repoRoot && !repoRoot.startsWith('github:')) {
      try {
        const abs = path.resolve(repoRoot, filePath);
        content = await readFile(abs, 'utf8');
      } catch {
        content = '(file content unavailable)';
      }
    }

    const result = await explainFile({
      filePath,
      content,
      deps: node.deps || [],
      declarations: node.declarations || [],
      type: node.type,
    });

    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

// POST /api/ai/query
// Body: { question, graph }
export async function queryController(req, res, next) {
  try {
    const { question, graph } = req.body;

    if (!question || !graph) {
      return res.status(400).json({ error: 'question and graph are required.' });
    }

    const relevantFiles = rankFilesByQuery(graph, question);

    if (relevantFiles.length === 0) {
      return res.json({
        answer: "I couldn't find any files closely related to your query. Try different keywords.",
        highlightedFiles: [],
        confidence: 'low',
      });
    }

    const result = await queryCodebase({ question, relevantFiles });
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

// GET /api/ai/dead-code?graph=...  (or POST with graph in body)
// Pure computation — no LLM needed
export async function deadCodeController(req, res, next) {
  try {
    const graph = req.body?.graph;
    if (!graph) return res.status(400).json({ error: 'graph is required.' });

    // Build a set of all files that are imported by at least one other file
    const referenced = new Set();
    for (const node of Object.values(graph)) {
      for (const dep of node.deps || []) {
        referenced.add(dep);
      }
    }

    const deadFiles = Object.keys(graph).filter((f) => !referenced.has(f));

    return res.json({ deadFiles });
  } catch (err) {
    return next(err);
  }
}

// POST /api/ai/impact
// Body: { filePath, graph }
// Returns all files that (transitively) depend on filePath
export async function impactController(req, res, next) {
  try {
    const { filePath, graph } = req.body;
    if (!filePath || !graph) return res.status(400).json({ error: 'filePath and graph are required.' });

    // Build reverse adjacency list: file → files that import it
    const reverseDeps = {};
    for (const [source, node] of Object.entries(graph)) {
      for (const dep of node.deps || []) {
        if (!reverseDeps[dep]) reverseDeps[dep] = [];
        reverseDeps[dep].push(source);
      }
    }

    // BFS from the target file through the reverse graph
    const affected = new Set();
    const queue = [filePath];
    while (queue.length > 0) {
      const current = queue.shift();
      for (const dependent of reverseDeps[current] || []) {
        if (!affected.has(dependent)) {
          affected.add(dependent);
          queue.push(dependent);
        }
      }
    }

    return res.json({ affectedFiles: [...affected] });
  } catch (err) {
    return next(err);
  }
}
```

### 3b. Routes

**File:** `server/src/ai/routes/ai.routes.js`

```js
import { Router } from 'express';
import {
  explainController,
  queryController,
  deadCodeController,
  impactController,
} from '../controllers/ai.controller.js';

export const aiRouter = Router();

aiRouter.post('/explain', explainController);
aiRouter.post('/query', queryController);
aiRouter.post('/dead-code', deadCodeController);
aiRouter.post('/impact', impactController);
```

**File:** `server/src/ai/index.js`

```js
export { aiRouter } from './routes/ai.routes.js';
```

### 3c. Register the router in `app.js`

```js
// In server/app.js, add after the existing imports:
import { aiRouter } from './src/ai/index.js';

// And after app.use('/api/analyze', analyzeRouter):
app.use('/api/ai', aiRouter);
```

---

## Step 4 — Client: Redux Slice for AI

**File:** `client/src/features/ai/slices/aiSlice.js`

```js
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { aiService } from '../services/aiService';

export const explainNode = createAsyncThunk(
  'ai/explainNode',
  async ({ filePath, repoRoot, graph }, { rejectWithValue }) => {
    try {
      return await aiService.explain({ filePath, repoRoot, graph });
    } catch (err) {
      return rejectWithValue(err.message);
    }
  },
);

export const queryGraph = createAsyncThunk(
  'ai/queryGraph',
  async ({ question, graph }, { rejectWithValue }) => {
    try {
      return await aiService.query({ question, graph });
    } catch (err) {
      return rejectWithValue(err.message);
    }
  },
);

export const analyzeImpact = createAsyncThunk(
  'ai/analyzeImpact',
  async ({ filePath, graph }, { rejectWithValue }) => {
    try {
      return await aiService.impact({ filePath, graph });
    } catch (err) {
      return rejectWithValue(err.message);
    }
  },
);

const aiSlice = createSlice({
  name: 'ai',
  initialState: {
    explanation: null,         // { purpose, keyFunctions, dependencies, risks }
    explainStatus: 'idle',
    explainError: null,
    queryResult: null,         // { answer, highlightedFiles, confidence }
    queryStatus: 'idle',
    queryError: null,
    impactFiles: [],           // string[]
    impactStatus: 'idle',
    deadFiles: [],             // computed on client from graph
    highlightedNodeIds: [],    // nodes highlighted by NLQ or impact
  },
  reducers: {
    clearExplanation(state) {
      state.explanation = null;
      state.explainStatus = 'idle';
      state.explainError = null;
    },
    clearQuery(state) {
      state.queryResult = null;
      state.queryStatus = 'idle';
      state.highlightedNodeIds = [];
    },
    clearImpact(state) {
      state.impactFiles = [];
      state.impactStatus = 'idle';
      state.highlightedNodeIds = [];
    },
    setDeadFiles(state, action) {
      state.deadFiles = action.payload;
    },
    setHighlightedNodes(state, action) {
      state.highlightedNodeIds = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(explainNode.pending, (state) => {
        state.explainStatus = 'loading';
        state.explanation = null;
        state.explainError = null;
      })
      .addCase(explainNode.fulfilled, (state, action) => {
        state.explainStatus = 'succeeded';
        state.explanation = action.payload;
      })
      .addCase(explainNode.rejected, (state, action) => {
        state.explainStatus = 'failed';
        state.explainError = action.payload;
      })
      .addCase(queryGraph.pending, (state) => {
        state.queryStatus = 'loading';
        state.queryResult = null;
      })
      .addCase(queryGraph.fulfilled, (state, action) => {
        state.queryStatus = 'succeeded';
        state.queryResult = action.payload;
        state.highlightedNodeIds = action.payload.highlightedFiles || [];
      })
      .addCase(queryGraph.rejected, (state, action) => {
        state.queryStatus = 'failed';
        state.queryError = action.payload;
      })
      .addCase(analyzeImpact.pending, (state) => {
        state.impactStatus = 'loading';
        state.impactFiles = [];
        state.highlightedNodeIds = [];
      })
      .addCase(analyzeImpact.fulfilled, (state, action) => {
        state.impactStatus = 'succeeded';
        state.impactFiles = action.payload.affectedFiles;
        state.highlightedNodeIds = action.payload.affectedFiles;
      })
      .addCase(analyzeImpact.rejected, (state, action) => {
        state.impactStatus = 'failed';
      });
  },
});

export const {
  clearExplanation, clearQuery, clearImpact, setDeadFiles, setHighlightedNodes,
} = aiSlice.actions;

export const selectExplanation = (state) => state.ai.explanation;
export const selectExplainStatus = (state) => state.ai.explainStatus;
export const selectQueryResult = (state) => state.ai.queryResult;
export const selectQueryStatus = (state) => state.ai.queryStatus;
export const selectImpactFiles = (state) => state.ai.impactFiles;
export const selectHighlightedNodeIds = (state) => state.ai.highlightedNodeIds;
export const selectDeadFiles = (state) => state.ai.deadFiles;

export default aiSlice.reducer;
```

**File:** `client/src/features/ai/services/aiService.js`

```js
import axios from 'axios';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export const aiService = {
  explain: ({ filePath, repoRoot, graph }) =>
    axios.post(`${BASE}/api/ai/explain`, { filePath, repoRoot, graph }, { withCredentials: true })
      .then((r) => r.data),

  query: ({ question, graph }) =>
    axios.post(`${BASE}/api/ai/query`, { question, graph }, { withCredentials: true })
      .then((r) => r.data),

  impact: ({ filePath, graph }) =>
    axios.post(`${BASE}/api/ai/impact`, { filePath, graph }, { withCredentials: true })
      .then((r) => r.data),

  deadCode: ({ graph }) =>
    axios.post(`${BASE}/api/ai/dead-code`, { graph }, { withCredentials: true })
      .then((r) => r.data),
};
```

Register the reducer in the store:

```js
// client/src/app/store.js — add to the existing reducers object:
import aiReducer from '../features/ai/slices/aiSlice';

// Inside configureStore({ reducer: { ... } }):
ai: aiReducer,
```

---

## Step 5 — Client: AI Panel Component

This replaces and extends the existing `NodeDetail` panel in `GraphView.jsx`.

**File:** `client/src/features/ai/components/AiPanel.jsx`

```jsx
import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { X, Loader2, Zap, AlertTriangle } from 'lucide-react';
import {
  explainNode, analyzeImpact, clearExplanation, clearImpact,
  selectExplanation, selectExplainStatus, selectImpactFiles, selectImpactStatus,
} from '../slices/aiSlice';
import { selectGraphData } from '../../graph/slices/graphSlice';

export default function AiPanel({ nodeId, onClose }) {
  const dispatch = useDispatch();
  const rawData = useSelector(selectGraphData);
  const explanation = useSelector(selectExplanation);
  const explainStatus = useSelector(selectExplainStatus);
  const impactFiles = useSelector(selectImpactFiles);
  const impactStatus = useSelector(selectImpactStatus);

  const graph = rawData?.graph ?? {};
  const node = graph[nodeId];

  // Fetch explanation whenever the selected node changes
  useEffect(() => {
    if (!nodeId || !node) return;
    dispatch(clearExplanation());
    dispatch(clearImpact());
    dispatch(explainNode({ filePath: nodeId, repoRoot: rawData?.rootDir, graph }));
  }, [nodeId]);

  if (!nodeId || !node) return null;

  const { deps = [], type, declarations = [] } = node;
  const usedBy = Object.entries(graph)
    .filter(([, v]) => v.deps?.includes(nodeId))
    .map(([k]) => k);

  return (
    <div className="absolute top-2 right-2 z-10 w-80 max-h-[85vh] overflow-y-auto rounded-xl border border-border bg-card/95 backdrop-blur-sm p-4 text-xs shadow-xl flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono font-semibold text-foreground truncate text-sm">{nodeId}</span>
        <button onClick={onClose} className="shrink-0 text-muted-foreground hover:text-foreground">
          <X className="size-3.5" />
        </button>
      </div>

      <p className="text-muted-foreground">
        Type: <span className="capitalize text-foreground/80">{type}</span>
      </p>

      {/* Declarations */}
      {declarations.length > 0 && (
        <div>
          <p className="mb-1 text-muted-foreground/60 uppercase tracking-wider text-[10px]">
            Exports ({declarations.length})
          </p>
          <ul className="flex flex-wrap gap-1">
            {declarations.map((d) => (
              <li key={d.name} className="bg-muted rounded px-1.5 py-0.5 font-mono text-[10px]">
                {d.kind === 'class' ? '🏛 ' : '⚡ '}{d.name}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* AI Explanation */}
      <div className="border border-border rounded-lg p-3 bg-background/40">
        <p className="mb-2 text-muted-foreground/60 uppercase tracking-wider text-[10px] flex items-center gap-1">
          <Zap className="size-3" /> AI Explanation
        </p>
        {explainStatus === 'loading' && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            <span>Analyzing...</span>
          </div>
        )}
        {explainStatus === 'failed' && (
          <p className="text-red-400 flex items-center gap-1">
            <AlertTriangle className="size-3" /> Failed to load explanation
          </p>
        )}
        {explainStatus === 'succeeded' && explanation && (
          <div className="flex flex-col gap-2">
            <p className="text-foreground/90 leading-relaxed">{explanation.purpose}</p>
            {explanation.keyFunctions?.length > 0 && (
              <div>
                <p className="text-muted-foreground/60 mb-1">Key functions:</p>
                <ul className="list-disc list-inside flex flex-col gap-0.5 text-foreground/70">
                  {explanation.keyFunctions.map((fn, i) => <li key={i}>{fn}</li>)}
                </ul>
              </div>
            )}
            {explanation.risks && explanation.risks !== 'None obvious.' && (
              <p className="text-amber-400/80">⚠ {explanation.risks}</p>
            )}
          </div>
        )}
      </div>

      {/* Impact Analysis */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <p className="text-muted-foreground/60 uppercase tracking-wider text-[10px]">Impact Analysis</p>
          <button
            onClick={() => dispatch(analyzeImpact({ filePath: nodeId, graph }))}
            className="text-[10px] text-gold/70 hover:text-gold transition-colors"
          >
            {impactStatus === 'loading' ? 'Running...' : 'Simulate change →'}
          </button>
        </div>
        {impactStatus === 'succeeded' && (
          impactFiles.length === 0
            ? <p className="text-muted-foreground">No files depend on this one.</p>
            : (
              <ul className="flex flex-col gap-0.5 max-h-24 overflow-y-auto">
                {impactFiles.map((f) => (
                  <li key={f} className="font-mono text-red-400/80 truncate">{f}</li>
                ))}
              </ul>
            )
        )}
      </div>

      {/* Deps + Used By */}
      {deps.length > 0 && (
        <div>
          <p className="mb-1 text-muted-foreground/60 uppercase tracking-wider text-[10px]">Imports ({deps.length})</p>
          <ul className="flex flex-col gap-0.5 max-h-24 overflow-y-auto">
            {deps.map((d) => <li key={d} className="font-mono text-gold/80 truncate">{d}</li>)}
          </ul>
        </div>
      )}
      {usedBy.length > 0 && (
        <div>
          <p className="mb-1 text-muted-foreground/60 uppercase tracking-wider text-[10px]">Used by ({usedBy.length})</p>
          <ul className="flex flex-col gap-0.5 max-h-24 overflow-y-auto">
            {usedBy.map((d) => <li key={d} className="font-mono text-foreground/70 truncate">{d}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
```

---

## Step 6 — Client: Query Bar (NLQ)

**File:** `client/src/features/ai/components/QueryBar.jsx`

```jsx
import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Search, Loader2, X } from 'lucide-react';
import { queryGraph, clearQuery, selectQueryResult, selectQueryStatus } from '../slices/aiSlice';
import { selectGraphData } from '../../graph/slices/graphSlice';

export default function QueryBar() {
  const dispatch = useDispatch();
  const [question, setQuestion] = useState('');
  const rawData = useSelector(selectGraphData);
  const queryResult = useSelector(selectQueryResult);
  const queryStatus = useSelector(selectQueryStatus);
  const graph = rawData?.graph ?? {};

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!question.trim() || Object.keys(graph).length === 0) return;
    dispatch(queryGraph({ question: question.trim(), graph }));
  };

  const handleClear = () => {
    setQuestion('');
    dispatch(clearQuery());
  };

  return (
    <div className="flex flex-col gap-2 w-full max-w-xl">
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask: where is auth handled?"
            className="w-full pl-8 pr-4 py-2 text-sm rounded-lg border border-border bg-card/80 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-gold/50"
          />
        </div>
        <button
          type="submit"
          disabled={queryStatus === 'loading' || !question.trim()}
          className="px-3 py-2 rounded-lg text-xs bg-gold/10 text-gold border border-gold/20 hover:bg-gold/20 disabled:opacity-40 transition-colors"
        >
          {queryStatus === 'loading' ? <Loader2 className="size-3 animate-spin" /> : 'Ask'}
        </button>
        {queryResult && (
          <button type="button" onClick={handleClear} className="text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        )}
      </form>

      {queryResult && (
        <div className="rounded-lg border border-border bg-card/80 p-3 text-xs">
          <p className="text-foreground/90 leading-relaxed mb-1">{queryResult.answer}</p>
          {queryResult.highlightedFiles?.length > 0 && (
            <p className="text-muted-foreground">
              Highlighting {queryResult.highlightedFiles.length} relevant file(s) in graph.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
```

---

## Step 7 — Wire Highlights into GraphView

The existing `GraphView.jsx` needs to (a) visually highlight nodes returned by NLQ or impact analysis, (b) flag dead code nodes, and (c) swap `NodeDetail` for `AiPanel`.

Make these targeted changes to `GraphView.jsx`:

**Add imports at top:**
```jsx
import { useSelector } from 'react-redux';
import { selectHighlightedNodeIds, selectDeadFiles } from '../../ai/slices/aiSlice';
import AiPanel from '../../ai/components/AiPanel';
```

**Inside `GraphView` component, add selectors:**
```jsx
const highlightedNodeIds = useSelector(selectHighlightedNodeIds);
const deadFiles = useSelector(selectDeadFiles);
const highlightSet = new Set(highlightedNodeIds);
const deadSet = new Set(deadFiles);
```

**Update `graphToFlow` to accept highlight/dead sets:**
```js
function graphToFlow(graph, highlightSet = new Set(), deadSet = new Set()) {
  const nodes = Object.entries(graph).map(([file, { type }]) => {
    const isHighlighted = highlightSet.has(file);
    const isDead = deadSet.has(file);
    return {
      id: file,
      data: { label: file },
      position: { x: 0, y: 0 },
      style: {
        ...typeStyle(type),
        // Dead code: muted appearance
        ...(isDead && { opacity: 0.4, border: '1px dashed #555' }),
        // Highlighted: glow ring
        ...(isHighlighted && { boxShadow: '0 0 0 2px #D4AF37, 0 0 12px #D4AF3766' }),
      },
    };
  });
  // ... rest of function unchanged
}
```

**Pass the sets when calling `graphToFlow`:**
```jsx
const { nodes: initialNodes, edges: initialEdges } = useMemo(
  () => graphToFlow(graph, highlightSet, deadSet),
  [graph, highlightSet, deadSet],
);
```

**Replace `<NodeDetail ... />` with `<AiPanel ... />`:**
```jsx
<AiPanel
  nodeId={selectedNodeId}
  onClose={() => dispatch(selectNode(null))}
/>
```

---

## Step 8 — Dead Code Detection on Graph Load

Dead code is a pure graph computation — no LLM needed. Trigger it automatically when the graph loads by dispatching from `GraphView` or the `AnalyzePage`.

Add this to `GraphView.jsx` (or `AnalyzePage.jsx`) inside a `useEffect`:

```jsx
import { setDeadFiles } from '../../ai/slices/aiSlice';
import { aiService } from '../../ai/services/aiService';

useEffect(() => {
  if (Object.keys(graph).length === 0) return;
  // Client-side dead code detection (no server round-trip needed)
  const referenced = new Set();
  for (const node of Object.values(graph)) {
    for (const dep of node.deps || []) referenced.add(dep);
  }
  const dead = Object.keys(graph).filter((f) => !referenced.has(f));
  dispatch(setDeadFiles(dead));
}, [graph]);
```

This runs on the client, which is fast enough for any realistic repo size and avoids an extra API call.

---

## Step 9 — Add QueryBar to the Graph Page

In `client/src/features/graph/pages/AnalyzePage.jsx` (or wherever the graph toolbar lives), import and render `QueryBar` above or within the graph toolbar area:

```jsx
import QueryBar from '../../ai/components/QueryBar';

// Inside your JSX, above the ReactFlow canvas:
<div className="flex items-center gap-4 px-4 py-2 border-b border-border">
  <QueryBar />
  {/* existing toolbar buttons */}
</div>
```

---

## Step 10 — Guard the AI Routes

The AI endpoints receive the full graph in the request body. Add a basic size guard to prevent abuse:

```js
// In server/src/ai/routes/ai.routes.js, add before route definitions:
import rateLimit from 'express-rate-limit';

const aiLimiter = rateLimit({
  windowMs: 60_000,   // 1 minute
  max: 30,            // 30 AI requests per minute per IP
  message: { error: 'Too many AI requests. Please slow down.' },
});

aiRouter.use(aiLimiter);
```

Also add a graph size guard in the controller to cap token usage:

```js
// At the top of explainController and queryController:
const fileCount = Object.keys(graph).length;
if (fileCount > 2000) {
  return res.status(400).json({ error: 'Graph too large. Max 2000 files for AI features.' });
}
```

---

## Build Order Summary

| Step | What to do | Time estimate |
|---|---|---|
| 1 | Extend `astParser.service.js` with `declarations` | 30 min |
| 2 | Create `openai.service.js` + `nlq.service.js` | 1 hr |
| 3 | Create `ai.controller.js` + `ai.routes.js`, wire into `app.js` | 30 min |
| 4 | Create `aiSlice.js` + `aiService.js`, add to store | 30 min |
| 5 | Build `AiPanel.jsx` | 45 min |
| 6 | Build `QueryBar.jsx` | 30 min |
| 7 | Update `GraphView.jsx` for highlights + dead code | 30 min |
| 8 | Dead code `useEffect` | 15 min |
| 9 | Wire `QueryBar` into graph page | 15 min |
| 10 | Rate limiting + size guards | 15 min |
| — | **Total** | **~5 hours** |

---

## Common Pitfalls to Avoid

**Sending the whole graph to OpenAI.** The graph object for a 500-file repo can easily exceed 50k tokens. Always pre-filter with `rankFilesByQuery` before the LLM call, and cap file content at 3000 characters.

**Re-fetching explanations on every node click.** The Redux slice sets `explainStatus` to `'loading'` and clears the explanation on every `explainNode` dispatch. Consider checking if the current `selectedNodeId` already has a cached explanation in a local `Map` before dispatching.

**Forgetting to send `withCredentials: true`.** The GitHub token lives in an HTTP-only cookie. Every AI request that might need server-side auth must include credentials. The `aiService` already handles this.

**Dead code false positives.** Entry-point files (like `main.jsx`, `App.jsx`, `index.js`) are intentionally unreferenced — they're roots of the graph, not dead code. Consider filtering out files that match these names from the dead-code list.

**Parser not finding GitHub file content.** The `explainController` only reads files from disk for local repos. For GitHub repos (where `repoRoot` starts with `github:`), either skip the content (the AI still has function names and deps) or download the specific file via the GitHub API before calling the LLM.

---

## Testing Phase 2

### Server endpoints (curl)

```bash
# Check a node explanation
curl -X POST http://localhost:3000/api/ai/explain \
  -H 'Content-Type: application/json' \
  -d '{"filePath":"src/auth/services/auth.service.js","repoRoot":"/path/to/repo","graph":{...}}'

# NLQ query
curl -X POST http://localhost:3000/api/ai/query \
  -H 'Content-Type: application/json' \
  -d '{"question":"where is authentication handled","graph":{...}}'

# Dead code
curl -X POST http://localhost:3000/api/ai/dead-code \
  -H 'Content-Type: application/json' \
  -d '{"graph":{...}}'

# Impact
curl -X POST http://localhost:3000/api/ai/impact \
  -H 'Content-Type: application/json' \
  -d '{"filePath":"src/utils/auth.js","graph":{...}}'
```

### Demo script for judges

1. Load the CodeGraph AI repo itself as the analysis target.
2. In the QueryBar type: "where is the graph parsing logic?" — the nodes for `astParser.service.js` and `analyze.service.js` should glow.
3. Click `astParser.service.js` — the AI panel explains it in plain English within 2–3 seconds.
4. Click "Simulate change →" — the impact panel lists every controller and service that transitively depends on the parser.
5. Point out the dashed/faded nodes (dead code).

---

## What Phase 3 Can Add

- **Embeddings-based NLQ**: Replace keyword ranking with OpenAI `text-embedding-3-small` vectors stored in Pinecone for semantic search across large repos.
- **Streaming explanations**: Use `openai.chat.completions.stream()` and Server-Sent Events to show explanation text as it generates.
- **PR impact preview**: GitHub webhook → re-analyze on push → diff the graph and show what changed.
- **Function-level graph expansion**: Click a file node to expand it into its constituent function nodes.
- **Refactor suggestions**: Ask the AI to suggest how to break apart high-dependency files.
