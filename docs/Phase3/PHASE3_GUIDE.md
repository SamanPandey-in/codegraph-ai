# CodeGraph AI — Phase 3 Implementation Guide

## What Phase 3 Is

Phase 2 gave you a working agentic pipeline with AI explanations, NLQ, dead code detection, and impact analysis. Phase 3 is the step from "impressive demo" to "product people pay for." It has four pillars:

1. **Intelligence depth** — function-level graph, streaming AI, multi-language parsing
2. **User product** — saved queries UI, query history, re-analyze, starred repos
3. **Collaboration** — shareable graph links, GitHub PR integration, team workspaces
4. **Production hardening** — test suite, error monitoring, CI/CD, plan enforcement

Build in this order. Each section is independent.

---

## Section 1 — Complete Phase 2 First (1 hour)

Before starting Phase 3, close the five open gaps from the audit. These are not Phase 3 work — they are Phase 2 bugs that make the AI panel silent.

### 1.1 Fix QueryBar loading state

**File:** `client/src/features/ai/components/QueryBar.jsx`

Change line 22:
```js
// Before
const isLoading = status === 'pending';

// After
const isLoading = status === 'loading';
```

### 1.2 Wire AiPanel dispatches

**File:** `client/src/features/ai/components/AiPanel.jsx`

Replace the entire file content:

```jsx
import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { X, AlertTriangle, Loader2, Zap } from 'lucide-react';
import {
  explainNode,
  analyzeImpact,
  selectAiExplainState,
  selectAiImpactState,
} from '../slices/aiSlice';
import { selectGraphData } from '../../graph/slices/graphSlice';

export default function AiPanel({ nodeId, graph, onClose }) {
  const dispatch = useDispatch();
  const graphData = useSelector(selectGraphData);
  const explainState = useSelector(selectAiExplainState);
  const impactState = useSelector(selectAiImpactState);

  const jobId = graphData?.jobId;

  // Auto-fetch explanation when selected node changes
  useEffect(() => {
    if (!nodeId || !jobId) return;
    dispatch(explainNode({ jobId, filePath: nodeId, nodeLabel: nodeId }));
  }, [nodeId, jobId, dispatch]);

  if (!nodeId || !graph?.[nodeId]) return null;

  const { deps = [], type, declarations = [], summary } = graph[nodeId];
  const usedBy = Object.entries(graph)
    .filter(([, value]) => value.deps?.includes(nodeId))
    .map(([file]) => file);

  const explanation = explainState?.data?.answer || null;
  const isExplaining = explainState?.status === 'loading';
  const explainError = explainState?.status === 'failed';

  const impactedFiles = impactState?.data?.affectedFiles || [];
  const isImpacting = impactState?.status === 'loading';

  return (
    <div className="absolute top-2 right-2 z-10 w-80 max-h-[85vh] overflow-y-auto rounded-xl border border-border bg-card/95 backdrop-blur-sm p-4 text-xs shadow-xl transition-all">
      <div className="flex items-start justify-between gap-2 mb-3">
        <span className="font-mono font-semibold text-foreground truncate">{nodeId}</span>
        <button onClick={onClose} className="shrink-0 text-muted-foreground hover:text-foreground">
          <X className="size-3.5" />
        </button>
      </div>

      <p className="mb-3 text-muted-foreground">
        Type: <span className="capitalize text-foreground/80">{type}</span>
      </p>

      {/* Pre-loaded enrichment summary (from EnrichmentAgent, instant) */}
      {summary && !explanation && !isExplaining && (
        <div className="mb-3 rounded-lg border border-border bg-background/40 p-3">
          <p className="mb-1 text-muted-foreground/60 uppercase tracking-wider text-[10px]">Summary</p>
          <p className="text-foreground/90 leading-relaxed">{summary}</p>
        </div>
      )}

      {/* AI Explanation (fetched on node click) */}
      <div className="mb-3 rounded-lg border border-border bg-background/40 p-3">
        <p className="mb-2 text-muted-foreground/60 uppercase tracking-wider text-[10px] flex items-center gap-1">
          <Zap className="size-3" /> AI Explanation
        </p>
        {isExplaining && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            <span>Analyzing...</span>
          </div>
        )}
        {explainError && (
          <p className="text-red-400 flex items-center gap-1">
            <AlertTriangle className="size-3" /> Failed to load explanation
          </p>
        )}
        {explanation && !isExplaining && (
          <p className="text-foreground/90 leading-relaxed">{explanation}</p>
        )}
      </div>

      {/* Declarations */}
      {declarations.length > 0 && (
        <div className="mb-3">
          <p className="mb-1 text-muted-foreground/60 uppercase tracking-wider text-[10px]">
            Declarations ({declarations.length})
          </p>
          <ul className="flex flex-wrap gap-1">
            {declarations.map((d) => (
              <li key={`${d.kind}:${d.name}`} className="bg-muted rounded px-1.5 py-0.5 font-mono text-[10px]">
                {d.name}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Impact analysis */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <p className="text-muted-foreground/60 uppercase tracking-wider text-[10px]">Impact Analysis</p>
          <button
            onClick={() => jobId && dispatch(analyzeImpact({ jobId, filePath: nodeId }))}
            disabled={isImpacting || !jobId}
            className="text-[10px] text-amber-400/70 hover:text-amber-400 disabled:opacity-40 transition-colors"
          >
            {isImpacting ? 'Running...' : 'Simulate change →'}
          </button>
        </div>
        {impactedFiles.length > 0 && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2">
            <ul className="flex flex-col gap-0.5 max-h-24 overflow-y-auto">
              {impactedFiles.map((file) => (
                <li key={file} className="font-mono text-amber-200/80 truncate">{file}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Deps + Used By */}
      {deps.length > 0 && (
        <div className="mb-3">
          <p className="mb-1 text-muted-foreground/60 uppercase tracking-wider text-[10px]">Imports ({deps.length})</p>
          <ul className="flex flex-col gap-0.5 max-h-28 overflow-y-auto">
            {deps.map((dep) => <li key={dep} className="font-mono text-gold/80 truncate">{dep}</li>)}
          </ul>
        </div>
      )}
      {usedBy.length > 0 && (
        <div>
          <p className="mb-1 text-muted-foreground/60 uppercase tracking-wider text-[10px]">Used by ({usedBy.length})</p>
          <ul className="flex flex-col gap-0.5 max-h-28 overflow-y-auto">
            {usedBy.map((file) => <li key={file} className="font-mono text-foreground/70 truncate">{file}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
```

### 1.3 Align API base URL

**File:** `client/src/features/dashboard/services/dashboardService.js`

Change line 4–7:
```js
// Before
const BASE_URL = import.meta.env.VITE_API_BASE_URL
  ? `${import.meta.env.VITE_API_BASE_URL}/api`
  : 'http://localhost:5000/api';

// After — matches graphService and aiService pattern
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '';
```

Then update the axios instance:
```js
const dashboardClient = axios.create({
  baseURL: apiBaseUrl,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});
```

And update the service methods to use full paths:
```js
// getAnalyzedRepositories
const { data } = await dashboardClient.get('/api/repositories', { params: { page, limit } });

// getRepositoryJobs
const { data } = await dashboardClient.get(`/api/repositories/${repositoryId}/jobs`, { params: { page, limit } });
```

---

## Section 2 — Function-Level Graph Expansion

Currently every node is a file. Phase 3 lets users click a file node to "expand" it into its constituent functions/classes as child nodes. This is the most visually impressive Phase 3 feature.

### 2.1 GraphBuilderAgent — function node output

**File:** `server/src/agents/graph/GraphBuilderAgent.js`

Extend the graph output to include function-level nodes in a separate map:

```js
// Add to graph output:
functionNodes: {
  'src/auth/authService.js': [
    { name: 'login', kind: 'function', calls: ['verifyCredentials', 'createToken'] },
    { name: 'logout', kind: 'function', calls: [] },
  ]
}
```

The `parseWorker.js` already extracts `declarations` per file. Extend it to also record which other declaration names are called inside each function body by doing a second walk of the function's body AST node.

### 2.2 Store function nodes in DB

**Migration:** `server/src/infrastructure/migrations/002_function_nodes.sql`

```sql
CREATE TABLE function_nodes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      UUID NOT NULL REFERENCES analysis_jobs(id) ON DELETE CASCADE,
  file_path   TEXT NOT NULL,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL,       -- function | class | arrow
  calls       JSONB DEFAULT '[]',  -- names of other functions called
  loc         INTEGER,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (job_id, file_path, name)
);
CREATE INDEX idx_fn_nodes_job_file ON function_nodes(job_id, file_path);
```

Add an endpoint:
```
GET /api/graph/:jobId/functions/:filePath
→ [{ name, kind, calls, loc }]
```

### 2.3 GraphView — expandable nodes

**File:** `client/src/features/graph/components/GraphView.jsx`

Add a double-click handler that fetches and renders function sub-nodes:

```jsx
const onNodeDoubleClick = useCallback(async (_e, node) => {
  if (expandedNodes.has(node.id)) return;  // already expanded
  const fns = await graphService.getFunctionNodes(jobId, node.id);
  // Add function nodes as children in React Flow
  setNodes(prev => [...prev, ...fns.map(fn => ({
    id: `${node.id}::${fn.name}`,
    data: { label: fn.name, kind: fn.kind },
    position: { x: node.position.x + 50, y: node.position.y + 50 + fns.indexOf(fn) * 40 },
    parentNode: node.id,
    style: { fontSize: 10, padding: '2px 6px', borderRadius: 4 },
  }))]);
  setExpandedNodes(prev => new Set([...prev, node.id]));
}, [expandedNodes, jobId]);
```

---

## Section 3 — Streaming AI Explanations

Currently the explain call blocks until the full response arrives. Phase 3 streams tokens from OpenAI so users see text appearing as it generates.

### 3.1 Server — streaming endpoint

**New file:** `server/src/api/ai/routes/ai.routes.js` — add route:

```js
router.post('/explain/stream', async (req, res, next) => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'Authentication required.' });

  const { question, jobId } = req.body;
  if (!question || !jobId) return res.status(400).json({ error: 'question and jobId are required.' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.flushHeaders();

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const stream = await openai.chat.completions.stream({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      max_tokens: 500,
      messages: [{ role: 'user', content: question }],
    });

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || '';
      if (text) res.write(`data: ${JSON.stringify({ text })}\n\n`);
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});
```

### 3.2 Client — streaming aiService method

**File:** `client/src/features/ai/services/aiService.js`

```js
streamExplain({ question, jobId, onChunk, onDone, onError }) {
  const url = `${apiBaseUrl}/api/ai/explain/stream`;
  const body = JSON.stringify({ question, jobId });

  fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body,
  }).then(async (res) => {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6);
        if (payload === '[DONE]') { onDone?.(); return; }
        try {
          const { text, error } = JSON.parse(payload);
          if (error) { onError?.(error); return; }
          if (text) onChunk?.(text);
        } catch {}
      }
    }
  }).catch(onError);
},
```

### 3.3 AiPanel — streaming UI state

Add a local `streamedText` state to AiPanel that accumulates chunks:

```jsx
const [streamedText, setStreamedText] = useState('');
const [isStreaming, setIsStreaming] = useState(false);

useEffect(() => {
  if (!nodeId || !jobId) return;
  setStreamedText('');
  setIsStreaming(true);

  aiService.streamExplain({
    question: `Explain the file ${nodeId} — its purpose, key functions, dependencies, and risks.`,
    jobId,
    onChunk: (text) => setStreamedText(prev => prev + text),
    onDone: () => setIsStreaming(false),
    onError: () => setIsStreaming(false),
  });
}, [nodeId, jobId]);
```

---

## Section 4 — Multi-Language Parser Support

The current parser only handles JS/TS/JSX/TSX via Babel. Phase 3 adds Python and Go.

### 4.1 ScannerAgent — extend allowed extensions

**File:** `server/src/agents/scanner/ScannerAgent.js`

```js
const ALLOWED_EXTENSIONS = new Set([
  '.js', '.ts', '.jsx', '.tsx',   // existing
  '.py',                           // Python
  '.go',                           // Go
]);
```

### 4.2 Language router in ParserAgent

**File:** `server/src/agents/parser/ParserAgent.js`

```js
_parseInWorker(filePath, relativePath) {
  const ext = path.extname(filePath).toLowerCase();
  const workerFile = ext === '.py' ? './pythonWorker.js'
                   : ext === '.go' ? './goWorker.js'
                   : './parseWorker.js';

  return new Promise((resolve) => {
    const worker = new Worker(new URL(workerFile, import.meta.url), {
      workerData: { filePath, relativePath },
    });
    worker.once('message', resolve);
    worker.once('error', (err) => resolve({
      relativePath, imports: [], declarations: [], metrics: {}, parseError: err.message
    }));
  });
}
```

### 4.3 Python worker

**New file:** `server/src/agents/parser/pythonWorker.js`

Python imports are much simpler to parse with regex than with a full AST (avoiding a native module dependency):

```js
import { readFile } from 'fs/promises';
import { parentPort, workerData } from 'worker_threads';

const { filePath, relativePath } = workerData;

async function run() {
  const code = await readFile(filePath, 'utf8');
  const lines = code.split('\n');
  const loc = lines.length;

  const imports = [];
  const declarations = [];
  const seenDecl = new Set();

  for (const line of lines) {
    // import foo, from foo import bar, from . import baz
    const imp = line.match(/^(?:from\s+([\w.]+)\s+)?import\s+([\w,\s*]+)/);
    if (imp) imports.push(imp[1] || imp[2].split(',')[0].trim());

    // def foo( and class Foo(
    const fn = line.match(/^(?:async\s+)?def\s+(\w+)\s*\(/);
    if (fn && !seenDecl.has(fn[1])) { declarations.push({ name: fn[1], kind: 'function' }); seenDecl.add(fn[1]); }

    const cls = line.match(/^class\s+(\w+)[\s:(]/);
    if (cls && !seenDecl.has(cls[1])) { declarations.push({ name: cls[1], kind: 'class' }); seenDecl.add(cls[1]); }
  }

  parentPort.postMessage({ relativePath, imports, declarations, metrics: { loc }, parseError: null });
}

run().catch((err) => parentPort.postMessage({
  relativePath, imports: [], declarations: [], metrics: {}, parseError: err.message
}));
```

---

## Section 5 — Saved Queries UI

The `saved_queries` table already exists and the `QueryAgent` writes to it. Phase 3 surfaces this history in the UI.

### 5.1 Server — saved queries endpoint

**New route in** `server/src/api/ai/routes/ai.routes.js`:

```js
// GET /api/ai/queries?jobId=...&page=1&limit=20
router.get('/queries', async (req, res, next) => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'Authentication required.' });

  const jobId = String(req.query?.jobId || '').trim();
  const page = Math.max(1, parseInt(req.query?.page) || 1);
  const limit = Math.min(50, parseInt(req.query?.limit) || 20);
  const offset = (page - 1) * limit;

  try {
    const result = await pgPool.query(
      `SELECT id, question, answer, highlights, confidence, created_at
       FROM saved_queries
       WHERE user_id = $1 ${jobId ? 'AND job_id = $2' : ''}
       ORDER BY created_at DESC
       LIMIT ${jobId ? '$3' : '$2'} OFFSET ${jobId ? '$4' : '$3'}`,
      jobId ? [userId, jobId, limit, offset] : [userId, limit, offset]
    );

    return res.json({ queries: result.rows, page, limit });
  } catch (err) {
    return next(err);
  }
});
```

### 5.2 Client — query history panel

**New file:** `client/src/features/ai/components/QueryHistory.jsx`

A slide-in list of previous queries per repo. Clicking one re-runs it via `dispatch(queryGraph(...))` and highlights the same files. Show it as a collapsible section below the QueryBar in `GraphPage.jsx`.

```jsx
export default function QueryHistory({ jobId }) {
  const [queries, setQueries] = useState([]);
  const dispatch = useDispatch();

  useEffect(() => {
    if (!jobId) return;
    fetch(`/api/ai/queries?jobId=${jobId}`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => setQueries(data.queries || []));
  }, [jobId]);

  if (queries.length === 0) return null;

  return (
    <div className="mt-2 border-t border-border pt-2">
      <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider mb-1">Recent queries</p>
      <ul className="flex flex-col gap-1">
        {queries.slice(0, 5).map(q => (
          <li key={q.id}>
            <button
              onClick={() => dispatch(queryGraph({ question: q.question, jobId }))}
              className="w-full text-left text-xs text-muted-foreground hover:text-foreground truncate py-0.5"
            >
              {q.question}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

---

## Section 6 — Dashboard Re-Analyze + Starred Repos

### 6.1 Re-analyze from Dashboard

**File:** `client/src/features/dashboard/pages/DashboardPage.jsx`

Add a re-analyze action to each repo card. It reads the last scan config from the repo record and dispatches a new analysis:

```jsx
// In the repo card action buttons:
<Button
  size="sm"
  variant="outline"
  onClick={() => {
    const config = repo.source === 'local'
      ? { source: 'local', localPath: repo.fullName }
      : { source: 'github', github: { owner: repo.owner, repo: repo.name, branch: repo.branch } };

    dispatch(analyzeCodebase(config));
    navigate('/analyze');
  }}
>
  Re-analyze
</Button>
```

### 6.2 Star a repository

**Server:** Add `PATCH /api/repositories/:id/star` that toggles `is_starred` in the `repositories` table.

**Client:** Add a star icon button to each repo card in DashboardPage. Starred repos float to the top of the list.

```js
// server route:
router.patch('/:id/star', async (req, res, next) => {
  const authUser = getAuthUser(req);
  if (!authUser?.id) return res.status(401).json({ error: 'Authentication required.' });

  const userId = await resolveDatabaseUserId(authUser);
  const { id } = req.params;

  const result = await pgPool.query(
    `UPDATE repositories
     SET is_starred = NOT is_starred
     WHERE id = $1 AND owner_id = $2
     RETURNING id, is_starred`,
    [id, userId]
  );

  if (result.rowCount === 0) return res.status(404).json({ error: 'Repository not found.' });
  return res.json(result.rows[0]);
});
```

---

## Section 7 — Shareable Graph Links

Currently graphs are private to the session. Phase 3 adds public/unlisted share links.

### 7.1 DB

**Migration:** `server/src/infrastructure/migrations/003_share_tokens.sql`

```sql
CREATE TABLE graph_shares (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id     UUID NOT NULL REFERENCES analysis_jobs(id) ON DELETE CASCADE,
  token      TEXT NOT NULL UNIQUE,      -- random 32-char URL-safe token
  visibility TEXT NOT NULL DEFAULT 'unlisted',  -- unlisted | public
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_shares_token ON graph_shares(token);
```

### 7.2 Server

```
POST /api/graph/:jobId/share   → { shareUrl: 'https://.../?share=TOKEN' }
GET  /api/share/:token         → graph data (no auth required if unlisted)
```

```js
// POST /api/graph/:jobId/share
import crypto from 'crypto';

router.post('/:jobId/share', async (req, res, next) => {
  const token = crypto.randomBytes(24).toString('base64url');
  await pgPool.query(
    `INSERT INTO graph_shares (job_id, token) VALUES ($1, $2)`,
    [req.params.jobId, token]
  );
  const shareUrl = `${process.env.CLIENT_URL}/?share=${token}`;
  return res.json({ shareUrl, token });
});

// GET /api/share/:token  (no auth)
router.get('/share/:token', async (req, res, next) => {
  const share = await pgPool.query(
    `SELECT gn.job_id FROM graph_shares gn WHERE gn.token = $1
     AND (gn.expires_at IS NULL OR gn.expires_at > NOW())`,
    [req.params.token]
  );
  if (share.rowCount === 0) return res.status(404).json({ error: 'Share link not found or expired.' });
  // Load graph same as /api/graph/:jobId
});
```

### 7.3 Client — share button in GraphToolbar

**File:** `client/src/features/graph/components/GraphToolbar.jsx`

Add a share button that calls the API and copies the URL to clipboard:

```jsx
const handleShare = async () => {
  const { shareUrl } = await graphService.shareGraph(jobId);
  await navigator.clipboard.writeText(shareUrl);
  toast('Share link copied to clipboard');
};
```

---

## Section 8 — GitHub PR Integration

When a pull request is opened, automatically analyze the diff and post a comment showing which files in the graph are impacted.

### 8.1 Webhook endpoint

**New file:** `server/src/api/webhooks/github.webhook.js`

```js
import crypto from 'crypto';
import { Router } from 'express';
import { pgPool } from '../../infrastructure/connections.js';
import { enqueueAnalysisJob } from '../../queue/analysisQueue.js';

const router = Router();

function verifySignature(payload, signature, secret) {
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(payload).digest('hex')}`;
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

router.post('/github', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['x-hub-signature-256'];
  if (!verifySignature(req.body, sig, process.env.GITHUB_WEBHOOK_SECRET)) {
    return res.status(401).send('Invalid signature');
  }

  const event = req.headers['x-github-event'];
  const payload = JSON.parse(req.body);

  if (event === 'pull_request' && ['opened', 'synchronize'].includes(payload.action)) {
    const { owner, name: repo } = payload.repository;
    const branch = payload.pull_request.head.ref;

    // Find the repository record by owner/name
    const repoResult = await pgPool.query(
      `SELECT id, owner_id FROM repositories
       WHERE github_owner = $1 AND github_repo = $2
       LIMIT 1`,
      [owner, repo]
    );

    if (repoResult.rowCount > 0) {
      const { id: repositoryId, owner_id: userId } = repoResult.rows[0];
      const jobResult = await pgPool.query(
        `INSERT INTO analysis_jobs (repository_id, user_id, branch, status)
         VALUES ($1, $2, $3, 'queued') RETURNING id`,
        [repositoryId, userId, branch]
      );
      const jobId = jobResult.rows[0].id;
      await enqueueAnalysisJob({
        jobId,
        input: { source: 'github', github: { owner, repo, branch }, repositoryId, userId },
      });
    }
  }

  return res.status(200).send('OK');
});
```

Register in `app.js`:
```js
import webhookRouter from './src/api/webhooks/github.webhook.js';
app.use('/api/webhooks', webhookRouter);
```

Add env var:
```
GITHUB_WEBHOOK_SECRET=your_webhook_secret
```

---

## Section 9 — Test Suite

### 9.1 Install test dependencies

```bash
cd server
npm install --save-dev vitest @vitest/coverage-v8 supertest
```

### 9.2 Test structure

```
server/
└── src/
    └── agents/
        ├── core/__tests__/
        │   ├── SupervisorAgent.test.js
        │   └── confidence.test.js
        ├── parser/__tests__/
        │   └── ParserAgent.test.js
        └── graph/__tests__/
            └── GraphBuilderAgent.test.js
```

### 9.3 Key tests to write

**`confidence.test.js`** — verify all scoring formulas:
```js
import { describe, it, expect } from 'vitest';
import { scoreParser, scoreEnrichment, computeOverallConfidence } from '../confidence.js';

describe('scoreParser', () => {
  it('returns 1.0 when all files parse successfully', () => {
    expect(scoreParser({ totalAttempted: 100, successCount: 100, failedCount: 0 })).toBe(1);
  });

  it('penalises high failure rate', () => {
    const score = scoreParser({ totalAttempted: 100, successCount: 70, failedCount: 30 });
    expect(score).toBeLessThan(0.75);
  });

  it('returns 0 when all files fail', () => {
    expect(scoreParser({ totalAttempted: 10, successCount: 0, failedCount: 10 })).toBe(0);
  });
});

describe('computeOverallConfidence', () => {
  it('weights parser at 0.25 and penalises low parser score', () => {
    const trace = [
      { agentId: 'parser-agent', confidence: 0.3 },
      { agentId: 'graph-builder-agent', confidence: 0.95 },
      { agentId: 'persistence-agent', confidence: 1.0 },
    ];
    const score = computeOverallConfidence(trace);
    expect(score).toBeLessThan(0.65); // low parser drags it down
  });
});
```

**`SupervisorAgent.test.js`** — mock agents and verify retry + abort:
```js
import { describe, it, expect, vi } from 'vitest';
import { SupervisorAgent } from '../SupervisorAgent.js';

const mockAgent = (confidence, status = 'success') => ({
  agentId: 'test-agent',
  maxRetries: 2,
  timeoutMs: 5000,
  process: vi.fn().mockResolvedValue({
    agentId: 'test-agent',
    jobId: 'test-job',
    status,
    confidence,
    data: { extractedPath: '/tmp/test', repoMeta: {} },
    errors: [],
    warnings: [],
    metrics: {},
    processingTimeMs: 10,
    retryCount: 0,
  }),
  buildResult: vi.fn(),
});

describe('SupervisorAgent._decide', () => {
  const supervisor = new SupervisorAgent({});

  it('returns PROCEED for high confidence', () => {
    expect(supervisor._decide(0.9)).toBe('PROCEED');
  });

  it('returns PROCEED_WARN for medium confidence', () => {
    expect(supervisor._decide(0.7)).toBe('PROCEED_WARN');
  });

  it('returns RETRY for low confidence', () => {
    expect(supervisor._decide(0.5)).toBe('RETRY');
  });

  it('returns ABORT for critical confidence', () => {
    expect(supervisor._decide(0.2)).toBe('ABORT');
  });
});
```

### 9.4 `vitest.config.js`

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/agents/**/*.js'],
      exclude: ['**/__tests__/**'],
      thresholds: { lines: 70, functions: 70, branches: 60 },
    },
  },
});
```

---

## Section 10 — Production Hardening

### 10.1 Error monitoring — Sentry

```bash
cd server && npm install @sentry/node @sentry/tracing
cd client && npm install @sentry/react @sentry/tracing
```

**Server:** `server/index.js`

```js
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
});

// Add before error handler in app.js:
app.use(Sentry.Handlers.errorHandler());
```

**Client:** `client/src/main.jsx`

```jsx
import * as Sentry from '@sentry/react';

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  tracesSampleRate: 0.1,
});
```

### 10.2 GitHub Actions CI

**New file:** `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  server:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: ankane/pgvector
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: codegraph_test
        ports: ['5432:5432']
      redis:
        image: redis:7
        ports: ['6379:6379']
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: cd server && npm ci
      - run: cd server && DATABASE_URL=postgres://postgres:postgres@localhost:5432/codegraph_test npm run migrate
        env:
          DATABASE_URL: postgres://postgres:postgres@localhost:5432/codegraph_test
      - run: cd server && npm run test:coverage
        env:
          DATABASE_URL: postgres://postgres:postgres@localhost:5432/codegraph_test
          REDIS_URL: redis://localhost:6379
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          JWT_SECRET: test_secret

  client:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: cd client && npm ci
      - run: cd client && npm run build
```

### 10.3 Plan enforcement

The `users.plan` column already exists. Add middleware to gate AI features:

**New file:** `server/src/middleware/planGuard.middleware.js`

```js
import { pgPool } from '../infrastructure/connections.js';

const PLAN_LIMITS = {
  free: { reposPerMonth: 3, aiQueriesPerDay: 10 },
  pro:  { reposPerMonth: Infinity, aiQueriesPerDay: 200 },
  team: { reposPerMonth: Infinity, aiQueriesPerDay: 1000 },
};

export function requirePlan(...allowedPlans) {
  return async (req, res, next) => {
    const userId = req.userId; // set by auth middleware
    if (!userId) return res.status(401).json({ error: 'Authentication required.' });

    const result = await pgPool.query('SELECT plan FROM users WHERE id = $1', [userId]);
    const plan = result.rows[0]?.plan || 'free';

    if (!allowedPlans.includes(plan)) {
      return res.status(403).json({
        error: 'This feature requires a higher plan.',
        currentPlan: plan,
        requiredPlans: allowedPlans,
        upgradeUrl: '/settings/billing',
      });
    }

    req.userPlan = plan;
    req.planLimits = PLAN_LIMITS[plan];
    return next();
  };
}
```

Apply to AI routes:
```js
// In ai.routes.js
import { requirePlan } from '../../../middleware/planGuard.middleware.js';

router.post('/query', aiLimiter, requirePlan('pro', 'team'), async (req, res, next) => { ... });
```

### 10.4 Rate limit by user (not IP)

The current AI rate limiter uses IP. Replace with user ID for accuracy:

```js
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.AI_RATE_LIMIT_PER_MINUTE || 30),
  keyGenerator: (req) => {
    // Use user ID from JWT if available, fall back to IP
    const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
    if (token && process.env.JWT_SECRET) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded?.id) return `user:${decoded.id}`;
      } catch {}
    }
    return req.ip;
  },
});
```

---

## Phase 3 Build Order Summary

| Week | Focus | Outcome |
|---|---|---|
| Week 1 | Section 1 (Phase 2 gaps) | AI panel fully works on node click - Done |
| Week 1 | Section 3 (streaming explanations) | Streaming text in AiPanel - Done |
| Week 2 | Section 2 (function-level graph) | Double-click to expand file nodes - Done |
| Week 2 | Section 5 (saved queries UI) | Query history visible in graph view - Done |
| Week 3 | Section 4 (multi-language) | Python/Go repos parse correctly - Done |
| Week 3 | Section 6 (dashboard improvements) | Re-analyze + starred repos - Done |
| Week 4 | Section 7 (shareable links) | Share button in toolbar - Done |
| Week 4 | Section 9 (test suite) | 70%+ coverage on agents - Done |
| Week 5 | Section 8 (PR integration) | GitHub webhook auto-analyzes PRs - Done |
| Week 5 | Section 10 (production hardening) | Sentry, CI, plan gates |

---

## New Environment Variables for Phase 3

Add to `server/.env`:

```bash
# Phase 3 additions
GITHUB_WEBHOOK_SECRET=your_webhook_secret_here
SENTRY_DSN=https://...@sentry.io/...

# Plan enforcement
DEFAULT_USER_PLAN=free
AI_QUERIES_PER_DAY_FREE=10
AI_QUERIES_PER_DAY_PRO=200

# Streaming
OPENAI_STREAM_ENABLED=true
```

Add to `client/.env`:
```bash
VITE_SENTRY_DSN=https://...@sentry.io/...
VITE_SHARE_BASE_URL=https://yourdomain.com
```

---

## New Files Created in Phase 3

```
server/
├── src/
│   ├── agents/
│   │   └── parser/
│   │       └── pythonWorker.js          ← Section 4
│   ├── api/
│   │   ├── ai/routes/ai.routes.js       ← extend: streaming + query history
│   │   ├── graph/routes/graph.routes.js ← extend: share + function nodes
│   │   └── webhooks/
│   │       └── github.webhook.js        ← Section 8
│   ├── middleware/
│   │   └── planGuard.middleware.js      ← Section 10
│   └── infrastructure/
│       └── migrations/
│           ├── 002_function_nodes.sql   ← Section 2
│           └── 003_share_tokens.sql     ← Section 7
│
client/
└── src/
    └── features/
        └── ai/
            └── components/
                └── QueryHistory.jsx     ← Section 5

.github/
└── workflows/
    └── ci.yml                           ← Section 10
```
