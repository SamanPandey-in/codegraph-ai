# CodeGraph AI — Agentic AI++ Architecture

## System Philosophy

This document converts CodeGraph AI from a monolithic Express service into a **supervised multi-agent system** where every unit of work is owned by a specialized agent, validated by a parent Supervisor, and scored for confidence before the pipeline advances. The result is a system that degrades gracefully instead of failing silently, produces auditable confidence trails for every analysis, and scales each stage independently.

The guiding principle is: **no agent's output is ever trusted by the next agent without the Supervisor's stamp**. If the stamp is weak, the Supervisor retries, compensates, or halts — the user always knows why.

---

## Database Architecture

### Decision: PostgreSQL + pgvector + Redis

Do not use separate databases for each concern. At this stage of the product, operational overhead beats theoretical purity. The right stack is:

| Layer | Technology | Reason |
|---|---|---|
| Primary store | **PostgreSQL 16** | ACID, JSONB for graph data, relations for users/repos |
| Vector search | **pgvector extension** | Semantic search on embeddings, no Pinecone bill |
| Job queues | **Redis 7 + BullMQ** | Durable queues, priority, concurrency, retries |
| Session cache | **Redis** | JWT blacklist, GitHub tokens, NLQ response cache |
| Full-text search | **PostgreSQL tsvector** | File path + declaration search, no Elasticsearch |

Add Neo4j only when your repos exceed 50,000 files and traversal queries exceed 200ms. At that point you migrate the `graph_edges` table. Until then, PostgreSQL JSONB + recursive CTEs handle every graph query in this product.

### Complete Schema

```sql
-- USERS
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  github_id     TEXT UNIQUE,
  username      TEXT NOT NULL,
  email         TEXT,
  avatar_url    TEXT,
  plan          TEXT NOT NULL DEFAULT 'free',   -- free | pro | team
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- REPOSITORIES (one record per unique repo ever scanned)
CREATE TABLE repositories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source          TEXT NOT NULL,              -- 'github' | 'local'
  full_name       TEXT NOT NULL,              -- 'facebook/react' or '/home/user/myapp'
  github_owner    TEXT,
  github_repo     TEXT,
  default_branch  TEXT,
  last_scanned_at TIMESTAMPTZ,
  scan_count      INTEGER NOT NULL DEFAULT 0,
  is_starred      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_id, full_name)
);

-- ANALYSIS JOBS (one per scan run)
CREATE TYPE job_status AS ENUM (
  'queued', 'ingesting', 'scanning', 'parsing',
  'building', 'enriching', 'embedding', 'persisting',
  'completed', 'failed', 'partial'
);

CREATE TABLE analysis_jobs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id     UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES users(id),
  branch            TEXT,
  status            job_status NOT NULL DEFAULT 'queued',
  overall_confidence NUMERIC(4,3),           -- 0.000–1.000
  agent_trace       JSONB NOT NULL DEFAULT '[]', -- array of AgentResult objects
  file_count        INTEGER,
  node_count        INTEGER,
  edge_count        INTEGER,
  error_summary     TEXT,
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- GRAPH NODES (files)
CREATE TABLE graph_nodes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id        UUID NOT NULL REFERENCES analysis_jobs(id) ON DELETE CASCADE,
  file_path     TEXT NOT NULL,
  file_type     TEXT NOT NULL,               -- component|page|hook|service|util|config|module
  declarations  JSONB NOT NULL DEFAULT '[]', -- [{ name, kind }]
  metrics       JSONB NOT NULL DEFAULT '{}', -- { loc, complexity, importCount }
  is_dead_code  BOOLEAN NOT NULL DEFAULT FALSE,
  summary       TEXT,                        -- AI-generated one-liner
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (job_id, file_path)
);

-- GRAPH EDGES (import relationships)
CREATE TABLE graph_edges (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      UUID NOT NULL REFERENCES analysis_jobs(id) ON DELETE CASCADE,
  source_path TEXT NOT NULL,
  target_path TEXT NOT NULL,
  edge_type   TEXT NOT NULL DEFAULT 'import', -- import | reexport | dynamic
  UNIQUE (job_id, source_path, target_path)
);

CREATE INDEX idx_edges_job_source ON graph_edges(job_id, source_path);
CREATE INDEX idx_edges_job_target ON graph_edges(job_id, target_path);

-- VECTOR EMBEDDINGS (for semantic NLQ)
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE file_embeddings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      UUID NOT NULL REFERENCES analysis_jobs(id) ON DELETE CASCADE,
  file_path   TEXT NOT NULL,
  embedding   vector(1536),                  -- OpenAI text-embedding-3-small
  UNIQUE (job_id, file_path)
);

CREATE INDEX idx_embeddings_job ON file_embeddings(job_id);
CREATE INDEX idx_embeddings_ivfflat ON file_embeddings
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- SAVED QUERIES (user's NLQ history per repo)
CREATE TABLE saved_queries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id      UUID REFERENCES analysis_jobs(id) ON DELETE SET NULL,
  question    TEXT NOT NULL,
  answer      TEXT NOT NULL,
  highlights  JSONB NOT NULL DEFAULT '[]',   -- [filePath]
  confidence  TEXT,                          -- high | medium | low
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- AGENT AUDIT LOG (immutable trace)
CREATE TABLE agent_audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          UUID NOT NULL REFERENCES analysis_jobs(id) ON DELETE CASCADE,
  agent_id        TEXT NOT NULL,
  attempt         INTEGER NOT NULL DEFAULT 1,
  status          TEXT NOT NULL,             -- success|partial|failed
  confidence      NUMERIC(4,3),
  input_hash      TEXT,                      -- SHA-256 of input, for dedup
  metrics         JSONB,
  errors          JSONB,
  warnings        JSONB,
  processing_ms   INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## Agent Definitions

Every agent in this system implements one interface:

```typescript
interface Agent {
  readonly agentId: string;
  readonly maxRetries: number;
  readonly timeoutMs: number;
  process(input: AgentInput, context: JobContext): Promise<AgentResult>;
}

interface AgentResult {
  agentId: string;
  jobId: string;
  status: 'success' | 'partial' | 'failed';
  confidence: number;           // 0.000 – 1.000
  data: Record<string, unknown>;
  errors: AgentError[];
  warnings: string[];
  metrics: Record<string, number>;
  processingTimeMs: number;
  retryCount: number;
}
```

### Confidence Threshold Table (Supervisor uses this)

| Score | Label | Supervisor Action |
|---|---|---|
| ≥ 0.85 | **HIGH** | PROCEED immediately |
| 0.65 – 0.84 | **MEDIUM** | PROCEED with warning logged |
| 0.40 – 0.64 | **LOW** | RETRY up to `maxRetries`; if still low, PROCEED_DEGRADED |
| < 0.40 | **CRITICAL** | ABORT job, notify user with reason |

---

### Agent 1 — IngestionAgent

**Role:** Fetch the repository from GitHub or validate a local path. Produce a temp directory containing the raw source tree.

**Input contract:**
```json
{
  "source": "github | local",
  "localPath": "/optional/path",
  "github": {
    "owner": "facebook",
    "repo": "react",
    "branch": "main",
    "token": "ghp_..."
  }
}
```

**Output contract:**
```json
{
  "extractedPath": "/tmp/codegraph-abc123/repo",
  "repoMeta": {
    "fullName": "facebook/react",
    "branch": "main",
    "defaultBranch": "main",
    "isPrivate": false,
    "estimatedFileCount": 847
  },
  "tempRoot": "/tmp/codegraph-abc123"
}
```

**Confidence formula:**
```
confidence = base
  × (archive_extracted_cleanly ? 1.0 : 0.3)
  × (repo_has_markers ? 1.0 : 0.7)        ← .git, package.json, etc.
  × min(1.0, 500 / max(estimatedFileCount, 500))  ← penalise if tiny (possible error)
```

**Retry logic:** On GitHub 429 rate-limit, wait `Retry-After` header seconds then retry. On 401, abort immediately (re-auth required). On network timeout, retry with exponential backoff up to `maxRetries: 3`.

**Cleanup responsibility:** This agent registers the `tempRoot` path in the job context. The Supervisor calls `IngestionAgent.cleanup(tempRoot)` after the PersistenceAgent completes, regardless of success or failure.

**File:** `server/src/agents/ingestion/IngestionAgent.js`

```js
import { mkdtemp, rm, writeFile, readdir, stat } from 'fs/promises';
import path from 'path';
import os from 'os';
import AdmZip from 'adm-zip';
import { BaseAgent } from '../core/BaseAgent.js';
import { scoreIngestion } from '../core/confidence.js';

export class IngestionAgent extends BaseAgent {
  agentId = 'ingestion-agent';
  maxRetries = 3;
  timeoutMs = 120_000; // 2 minutes for large repos

  async process(input, context) {
    const start = Date.now();
    const errors = [];
    const warnings = [];
    let extractedPath = null;
    let tempRoot = null;
    let repoMeta = {};

    try {
      if (input.source === 'local') {
        const result = await this._handleLocal(input.localPath);
        extractedPath = result.path;
        repoMeta = result.meta;
      } else {
        const result = await this._handleGitHub(input.github, context);
        extractedPath = result.extractedPath;
        tempRoot = result.tempRoot;
        repoMeta = result.meta;
      }

      const confidence = scoreIngestion({ repoMeta, extractedPath, errors });

      return this.buildResult({
        jobId: context.jobId,
        status: errors.length === 0 ? 'success' : 'partial',
        confidence,
        data: { extractedPath, tempRoot, repoMeta },
        errors,
        warnings,
        metrics: { estimatedFileCount: repoMeta.estimatedFileCount || 0 },
        processingTimeMs: Date.now() - start,
      });
    } catch (err) {
      return this.buildResult({
        jobId: context.jobId,
        status: 'failed',
        confidence: 0,
        data: {},
        errors: [{ code: err.statusCode || 500, message: err.message }],
        warnings,
        metrics: {},
        processingTimeMs: Date.now() - start,
      });
    }
  }

  async _handleGitHub({ owner, repo, branch, token }, context) {
    const archiveUrl = `https://api.github.com/repos/${owner}/${repo}/zipball/${branch}`;
    // ... fetch + AdmZip extract (same as existing analyze.service.js logic)
    // Returns { extractedPath, tempRoot, meta }
  }

  async _handleLocal(localPath) {
    // Validate + return { path, meta }
  }

  async cleanup(tempRoot) {
    if (tempRoot) await rm(tempRoot, { recursive: true, force: true });
  }
}
```

---

### Agent 2 — ScannerAgent

**Role:** Walk the extracted directory tree, apply ignore rules, and produce a manifest of all files eligible for parsing. Detects language composition and repo structure type (monorepo, single-package, etc.).

**Input contract:**
```json
{
  "extractedPath": "/tmp/codegraph-abc123/repo",
  "repoMeta": { "fullName": "facebook/react" }
}
```

**Output contract:**
```json
{
  "manifest": [
    { "absolutePath": "/tmp/.../src/auth.js", "relativePath": "src/auth.js", "sizeBytes": 4210 }
  ],
  "summary": {
    "totalFiles": 847,
    "eligibleFiles": 412,
    "skippedFiles": 435,
    "skipReasons": { "node_modules": 280, "dist": 100, "extension": 55 },
    "languageBreakdown": { ".ts": 180, ".tsx": 120, ".js": 112 },
    "isMonorepo": true,
    "packages": ["packages/core", "packages/ui"]
  }
}
```

**Confidence formula:**
```
eligible_ratio = eligibleFiles / max(totalFiles, 1)
confidence = (eligible_ratio > 0.05 ? 1.0 : eligible_ratio / 0.05)
           × (eligibleFiles > 0 ? 1.0 : 0.0)
           × (no_permission_errors ? 1.0 : 0.7)
```

A repo with zero eligible files gets `confidence: 0.0` — the Supervisor aborts and tells the user there are no JS/TS files.

**Key logic:** The `SKIP_DIRS` set is read from a config file, not hardcoded, making it overridable per-repo via a future `.codegraph.json` config file:

```js
const DEFAULT_SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next',
  'coverage', '__pycache__', '.turbo', 'out', '.vercel'
]);

const ALLOWED_EXTENSIONS = new Set(['.js', '.ts', '.jsx', '.tsx']);
```

**File:** `server/src/agents/scanner/ScannerAgent.js`

---

### Agent 3 — ParserAgent

**Role:** Parse every file in the manifest into an AST, extract imports, exports, function/class declarations, and basic metrics (lines of code, cyclomatic complexity estimate). Runs each file in a `worker_threads` pool for true parallelism.

**Input contract:**
```json
{
  "manifest": [ { "absolutePath": "...", "relativePath": "..." } ],
  "extractedPath": "/tmp/codegraph-abc123/repo"
}
```

**Output contract:**
```json
{
  "parsedFiles": [
    {
      "relativePath": "src/auth/authService.js",
      "imports": ["./tokenStore", "../utils/crypto"],
      "exports": ["login", "logout", "refreshToken"],
      "declarations": [
        { "name": "login", "kind": "function" },
        { "name": "AuthService", "kind": "class" }
      ],
      "metrics": { "loc": 142, "importCount": 6, "exportCount": 3 },
      "parseError": null
    }
  ],
  "summary": {
    "totalAttempted": 412,
    "successCount": 407,
    "partialCount": 3,
    "failedCount": 2,
    "syntaxErrorFiles": ["legacy/oldModule.js"]
  }
}
```

**Confidence formula:**
```
parse_rate = successCount / totalAttempted
error_penalty = min(0.3, failedCount / totalAttempted)
confidence = parse_rate × (1 - error_penalty)
```

**Worker thread design:**

```js
// server/src/agents/parser/parseWorker.js  (runs in worker thread)
import { workerData, parentPort } from 'worker_threads';
import { parse } from '@babel/parser';
import { readFile } from 'fs/promises';

const { filePath, relativePath } = workerData;

async function run() {
  const code = await readFile(filePath, 'utf8');
  const ast = parse(code, {
    sourceType: 'module', errorRecovery: true,
    plugins: ['typescript', 'jsx', 'decorators-legacy', 'classProperties', 'dynamicImport'],
  });
  const imports = extractImports(ast);
  const declarations = extractDeclarations(ast);
  const metrics = extractMetrics(code, ast);
  parentPort.postMessage({ relativePath, imports, declarations, metrics, parseError: null });
}

run().catch((err) =>
  parentPort.postMessage({ relativePath, imports: [], declarations: [], metrics: {}, parseError: err.message })
);
```

```js
// server/src/agents/parser/ParserAgent.js
import { Worker } from 'worker_threads';
import pLimit from 'p-limit';
import { BaseAgent } from '../core/BaseAgent.js';

const WORKER_CONCURRENCY = Math.max(4, os.cpus().length - 1);

export class ParserAgent extends BaseAgent {
  agentId = 'parser-agent';
  maxRetries = 2;
  timeoutMs = 300_000;  // 5 minutes for large repos

  async process({ manifest, extractedPath }, context) {
    const limit = pLimit(WORKER_CONCURRENCY);
    const results = await Promise.all(
      manifest.map((file) =>
        limit(() => this._parseInWorker(file))
      )
    );
    // aggregate, score, return AgentResult
  }

  _parseInWorker(file) {
    return new Promise((resolve) => {
      const worker = new Worker('./parseWorker.js', {
        workerData: { filePath: file.absolutePath, relativePath: file.relativePath },
      });
      worker.once('message', resolve);
      worker.once('error', (err) =>
        resolve({ relativePath: file.relativePath, parseError: err.message, imports: [], declarations: [], metrics: {} })
      );
    });
  }
}
```

---

### Agent 4 — GraphBuilderAgent

**Role:** Take parsed file data and construct the dependency graph: resolve relative import specifiers to real file paths, build adjacency list, detect cycles, and compute node-level topology metrics (in-degree, out-degree, betweenness centrality approximation).

**Input contract:**
```json
{
  "parsedFiles": [ { "relativePath": "...", "imports": [...], "declarations": [...] } ],
  "extractedPath": "..."
}
```

**Output contract:**
```json
{
  "graph": {
    "src/auth/authService.js": {
      "deps": ["src/utils/crypto.js", "src/auth/tokenStore.js"],
      "type": "service",
      "declarations": [{ "name": "login", "kind": "function" }],
      "metrics": { "loc": 142, "inDegree": 3, "outDegree": 2 }
    }
  },
  "edges": [
    { "source": "src/auth/authService.js", "target": "src/utils/crypto.js", "type": "import" }
  ],
  "topology": {
    "nodeCount": 412,
    "edgeCount": 890,
    "cyclesDetected": 2,
    "cycles": [["src/a.js", "src/b.js"]],
    "unresolvedImports": 23,
    "deadCodeCandidates": ["src/legacy/oldHelper.js"]
  }
}
```

**Confidence formula:**
```
resolution_rate = resolved_edges / total_import_specifiers
cycle_penalty = min(0.15, cyclesDetected * 0.03)
confidence = resolution_rate × (1 - cycle_penalty)
```

Low resolution rates mean the repo uses many path aliases (e.g. `@/components`) that the resolver can't handle. The agent logs each unresolved specifier pattern so Phase 3 can add alias configuration.

**Cycle detection:** Tarjan's strongly connected components algorithm, O(V+E), runs inline after the adjacency list is built. Cycles are warnings, not errors — many real codebases have them.

**File:** `server/src/agents/graph/GraphBuilderAgent.js`

---

### Agent 5 — EnrichmentAgent

**Role:** Attach semantic metadata to each node using the LLM. This is the first agent that calls OpenAI. It generates a one-sentence summary per file and infers architectural role beyond the basic type labels. Runs in batches to control cost.

**Input contract:**
```json
{
  "graph": { "...": { "deps": [], "type": "service", "declarations": [] } },
  "extractedPath": "..."
}
```

**Output contract:**
```json
{
  "enriched": {
    "src/auth/authService.js": {
      "summary": "Handles user login, logout, and JWT refresh for the auth flow.",
      "architecturalRole": "domain-service",
      "riskFlags": ["high-centrality", "no-test-file"],
      "complexityScore": 0.72
    }
  },
  "batchStats": {
    "totalFiles": 412,
    "enrichedCount": 400,
    "skippedCount": 12,
    "totalTokensUsed": 18400,
    "estimatedCostUsd": 0.0037
  }
}
```

**Confidence formula:**
```
enrich_rate = enrichedCount / totalFiles
api_success = 1 - (api_errors / batches_attempted)
confidence = enrich_rate × api_success
```

**Cost control:** Files under 50 lines get their summary generated from declarations + imports only (no LLM call — a template string). LLM is only invoked for files over 50 lines, saving ~60% of tokens.

```js
function cheapSummary(node) {
  const verbs = node.declarations.map((d) => d.name).slice(0, 3).join(', ');
  return `${node.type} providing: ${verbs || 'utilities'}.`;
}

// In EnrichmentAgent:
for (const [path, node] of Object.entries(graph)) {
  if ((node.metrics?.loc || 0) < 50) {
    enriched[path] = { summary: cheapSummary(node), architecturalRole: node.type };
    continue;
  }
  batch.push({ path, node });  // send to LLM
}
```

**File:** `server/src/agents/enrichment/EnrichmentAgent.js`

---

### Agent 6 — EmbeddingAgent

**Role:** Generate vector embeddings for every file so the NLQ system can perform semantic similarity search. Batches requests to `text-embedding-3-small` (1536 dimensions, $0.02/1M tokens).

**Input contract:**
```json
{
  "graph": { "...": { "summary": "...", "declarations": [], "deps": [] } },
  "jobId": "uuid"
}
```

**Output contract:**
```json
{
  "embeddings": {
    "src/auth/authService.js": [0.021, -0.048, 0.003, "... 1536 floats"]
  },
  "stats": {
    "attempted": 400,
    "succeeded": 400,
    "failed": 0,
    "totalTokens": 12200
  }
}
```

**Text to embed per file:**
```
File: src/auth/authService.js
Type: service
Summary: Handles user login, logout, and JWT refresh for the auth flow.
Exports: login, logout, refreshToken, AuthService
Imports from: src/utils/crypto.js, src/auth/tokenStore.js
```

This structured text produces much better embeddings than raw code.

**Batching:** OpenAI's embedding endpoint accepts up to 2048 inputs per call. Send files in batches of 100 for safety.

**Confidence formula:**
```
success_rate = succeeded / attempted
confidence = success_rate  (binary — either embedding works or it doesn't)
```

**File:** `server/src/agents/embedding/EmbeddingAgent.js`

---

### Agent 7 — PersistenceAgent

**Role:** Write all outputs from the previous agents into PostgreSQL. This is the only agent that touches the database directly. It runs inside a single transaction per job, with a savepoint strategy so partial writes are recoverable.

**Input contract:**
```json
{
  "jobId": "uuid",
  "repositoryId": "uuid",
  "graph": {},
  "edges": [],
  "enriched": {},
  "embeddings": {},
  "topology": {}
}
```

**Output contract:**
```json
{
  "written": {
    "nodes": 412,
    "edges": 890,
    "embeddings": 400
  },
  "durationMs": 840
}
```

**Transaction strategy:**

```js
const client = await pool.connect();
try {
  await client.query('BEGIN');

  // 1. Upsert graph nodes (bulk insert via COPY or unnest)
  await this._insertNodes(client, jobId, graph, enriched);
  await client.query('SAVEPOINT after_nodes');

  // 2. Insert edges
  await this._insertEdges(client, jobId, edges);
  await client.query('SAVEPOINT after_edges');

  // 3. Insert embeddings using pgvector
  await this._insertEmbeddings(client, jobId, embeddings);

  // 4. Update job status
  await client.query(
    `UPDATE analysis_jobs SET status = 'completed', overall_confidence = $1,
     file_count = $2, node_count = $3, edge_count = $4, completed_at = NOW()
     WHERE id = $5`,
    [overallConfidence, fileCount, nodeCount, edgeCount, jobId]
  );

  await client.query('COMMIT');
} catch (err) {
  await client.query('ROLLBACK');
  throw err;
} finally {
  client.release();
}
```

**Bulk insert for speed:** Use PostgreSQL `unnest()` for batch inserts rather than individual `INSERT` statements. For 412 nodes, this reduces DB round-trips from 412 to 1.

```js
await client.query(`
  INSERT INTO graph_nodes (job_id, file_path, file_type, declarations, metrics, summary, is_dead_code)
  SELECT $1, unnest($2::text[]), unnest($3::text[]),
         unnest($4::jsonb[]), unnest($5::jsonb[]),
         unnest($6::text[]), unnest($7::boolean[])
  ON CONFLICT (job_id, file_path) DO UPDATE
    SET file_type = EXCLUDED.file_type,
        declarations = EXCLUDED.declarations,
        metrics = EXCLUDED.metrics,
        summary = EXCLUDED.summary
`, [jobId, paths, types, declarations, metrics, summaries, deadFlags]);
```

**Confidence formula:**
```
write_rate = records_written / records_attempted
confidence = write_rate  (any DB error is critical)
```

**File:** `server/src/agents/persistence/PersistenceAgent.js`

---

### Agent 8 — QueryAgent

**Role:** Handle real-time NLQ requests. Given a user's question and a `jobId`, retrieve candidate files via vector similarity search (pgvector), rerank by keyword score, then call the LLM with only the top-8 files as context. Returns answer + highlighted file paths.

This agent runs **on-demand** (per user query), not as part of the pipeline.

**Input contract:**
```json
{
  "question": "where is authentication handled?",
  "jobId": "uuid",
  "userId": "uuid"
}
```

**Output contract:**
```json
{
  "answer": "Authentication is primarily handled in src/auth/authService.js which provides login, logout, and JWT refresh. The middleware in src/auth/middleware/authGuard.js protects routes.",
  "highlightedFiles": ["src/auth/authService.js", "src/auth/middleware/authGuard.js"],
  "confidence": "high",
  "retrievedFiles": 8,
  "queryEmbeddingTokens": 12,
  "completionTokens": 95
}
```

**Retrieval pipeline:**

```js
async process({ question, jobId, userId }) {
  // 1. Embed the question
  const queryEmbedding = await this._embed(question);

  // 2. Vector similarity search in pgvector
  const semanticCandidates = await this.db.query(`
    SELECT fe.file_path, fe.embedding <=> $1 AS distance,
           gn.file_type, gn.declarations, gn.summary
    FROM file_embeddings fe
    JOIN graph_nodes gn ON gn.job_id = fe.job_id AND gn.file_path = fe.file_path
    WHERE fe.job_id = $2
    ORDER BY fe.embedding <=> $1
    LIMIT 20
  `, [JSON.stringify(queryEmbedding), jobId]);

  // 3. Keyword rerank on top-20 semantic results
  const reranked = this._keywordRerank(question, semanticCandidates.rows);
  const top8 = reranked.slice(0, 8);

  // 4. LLM call with structured context
  const result = await this._callLLM(question, top8);

  // 5. Persist to saved_queries
  await this._saveQuery({ userId, jobId, question, result });

  return this.buildResult({ confidence: result.confidence === 'high' ? 0.9 : 0.6, data: result });
}
```

**Cache layer:** Redis caches query results with key `nlq:{jobId}:{sha256(question)}` for 1 hour. Identical questions on the same job never hit OpenAI twice.

**File:** `server/src/agents/query/QueryAgent.js`

---

### Agent 9 — AnalysisAgent

**Role:** Compute all graph intelligence features: dead code detection, impact analysis, cycle reporting, and complexity hotspot identification. Pure computation, no LLM. Runs on-demand per user action.

**Operations:**

```js
// Dead code: files with inDegree === 0 (excluding known entry points)
detectDeadCode(graph, topology) {
  const ENTRY_POINTS = /^(index|main|app)\.(jsx?|tsx?)$/i;
  return Object.entries(graph)
    .filter(([path, node]) =>
      node.metrics.inDegree === 0 && !ENTRY_POINTS.test(path.split('/').pop())
    )
    .map(([path]) => path);
}

// Impact: BFS through reverse adjacency list
getImpactedFiles(filePath, reverseAdjacency) {
  const affected = new Set();
  const queue = [filePath];
  while (queue.length) {
    const curr = queue.shift();
    for (const dep of reverseAdjacency[curr] || []) {
      if (!affected.has(dep)) { affected.add(dep); queue.push(dep); }
    }
  }
  return [...affected];
}

// Complexity hotspots: nodes where loc > p90 AND inDegree > p75
getHotspots(graph) { ... }
```

**Confidence formula:** Always `0.95` — this is deterministic computation with no external dependencies. The only failure mode is a malformed graph, which the GraphBuilderAgent should have caught.

**File:** `server/src/agents/analysis/AnalysisAgent.js`

---

## The Supervisor Agent (Parent Orchestrator)

This is the most critical component. It does not do any domain work itself. It owns the job lifecycle, validates every agent output, applies the confidence scoring rules, decides retry vs escalate, computes the overall pipeline confidence, and writes the audit trail.

### Supervisor Confidence Aggregation

The overall job confidence is a **weighted geometric mean** of agent confidences, not an average. This means one critically weak agent pulls the whole score down — which is correct behavior.

```
weights = {
  ingestion:   0.10,
  scanner:     0.10,
  parser:      0.25,  ← most important: bad parse = bad everything
  graphBuilder: 0.25,
  enrichment:  0.10,
  embedding:   0.10,
  persistence: 0.10
}

overallConfidence = product(agent.confidence^weight for each agent)
```

### Supervisor Implementation

**File:** `server/src/agents/core/SupervisorAgent.js`

```js
import { IngestionAgent }   from '../ingestion/IngestionAgent.js';
import { ScannerAgent }     from '../scanner/ScannerAgent.js';
import { ParserAgent }      from '../parser/ParserAgent.js';
import { GraphBuilderAgent } from '../graph/GraphBuilderAgent.js';
import { EnrichmentAgent }  from '../enrichment/EnrichmentAgent.js';
import { EmbeddingAgent }   from '../embedding/EmbeddingAgent.js';
import { PersistenceAgent } from '../persistence/PersistenceAgent.js';
import { AuditLogger }      from './AuditLogger.js';
import { JobStatusEmitter } from './JobStatusEmitter.js';

const WEIGHTS = {
  'ingestion-agent':    0.10,
  'scanner-agent':      0.10,
  'parser-agent':       0.25,
  'graph-builder-agent': 0.25,
  'enrichment-agent':   0.10,
  'embedding-agent':    0.10,
  'persistence-agent':  0.10,
};

const THRESHOLDS = {
  PROCEED:          0.85,
  PROCEED_WARN:     0.65,
  RETRY:            0.40,
};

export class SupervisorAgent {
  constructor({ db, redis }) {
    this.db = db;
    this.redis = redis;
    this.logger = new AuditLogger(db);
    this.emitter = new JobStatusEmitter(redis);

    this.agents = {
      ingestion:    new IngestionAgent(),
      scanner:      new ScannerAgent(),
      parser:       new ParserAgent(),
      graphBuilder: new GraphBuilderAgent(),
      enrichment:   new EnrichmentAgent(),
      embedding:    new EmbeddingAgent(),
      persistence:  new PersistenceAgent({ db }),
    };
  }

  async runPipeline(jobId, input) {
    const context = { jobId, startedAt: Date.now() };
    const agentTrace = [];
    const pipelineData = {};
    let ingestionAgent = this.agents.ingestion;

    await this._updateJobStatus(jobId, 'ingesting');

    try {
      // ── Stage 1: Ingest ──────────────────────────────────
      const ingestionResult = await this._runWithSupervision(
        this.agents.ingestion, input, context
      );
      agentTrace.push(ingestionResult);
      if (ingestionResult.status === 'failed') return this._abort(jobId, ingestionResult, agentTrace);
      Object.assign(pipelineData, ingestionResult.data);

      // ── Stage 2: Scan ────────────────────────────────────
      await this._updateJobStatus(jobId, 'scanning');
      const scanResult = await this._runWithSupervision(
        this.agents.scanner,
        { extractedPath: pipelineData.extractedPath, repoMeta: pipelineData.repoMeta },
        context
      );
      agentTrace.push(scanResult);
      if (scanResult.status === 'failed') return this._abort(jobId, scanResult, agentTrace);
      Object.assign(pipelineData, scanResult.data);

      // ── Stage 3: Parse ───────────────────────────────────
      await this._updateJobStatus(jobId, 'parsing');
      const parseResult = await this._runWithSupervision(
        this.agents.parser,
        { manifest: pipelineData.manifest, extractedPath: pipelineData.extractedPath },
        context
      );
      agentTrace.push(parseResult);
      if (parseResult.status === 'failed') return this._abort(jobId, parseResult, agentTrace);
      Object.assign(pipelineData, parseResult.data);

      // ── Stage 4: Build Graph ─────────────────────────────
      await this._updateJobStatus(jobId, 'building');
      const graphResult = await this._runWithSupervision(
        this.agents.graphBuilder,
        { parsedFiles: pipelineData.parsedFiles, extractedPath: pipelineData.extractedPath },
        context
      );
      agentTrace.push(graphResult);
      if (graphResult.status === 'failed') return this._abort(jobId, graphResult, agentTrace);
      Object.assign(pipelineData, graphResult.data);

      // ── Stage 5: Enrich (non-blocking on low confidence) ─
      await this._updateJobStatus(jobId, 'enriching');
      const enrichResult = await this._runWithSupervision(
        this.agents.enrichment,
        { graph: pipelineData.graph, extractedPath: pipelineData.extractedPath },
        context,
        { abortOnCritical: false }   // enrichment failure is degraded, not fatal
      );
      agentTrace.push(enrichResult);
      Object.assign(pipelineData, enrichResult.data);

      // ── Stage 6: Embed ────────────────────────────────────
      await this._updateJobStatus(jobId, 'embedding');
      const embedResult = await this._runWithSupervision(
        this.agents.embedding,
        { graph: pipelineData.graph, enriched: pipelineData.enriched, jobId },
        context,
        { abortOnCritical: false }
      );
      agentTrace.push(embedResult);
      Object.assign(pipelineData, embedResult.data);

      // ── Stage 7: Persist ──────────────────────────────────
      await this._updateJobStatus(jobId, 'persisting');
      const persistResult = await this._runWithSupervision(
        this.agents.persistence,
        {
          jobId,
          repositoryId: input.repositoryId,
          graph: pipelineData.graph,
          edges: pipelineData.edges,
          enriched: pipelineData.enriched,
          embeddings: pipelineData.embeddings,
          topology: pipelineData.topology,
        },
        context
      );
      agentTrace.push(persistResult);
      if (persistResult.status === 'failed') return this._abort(jobId, persistResult, agentTrace);

      // ── Compute overall confidence ────────────────────────
      const overallConfidence = this._computeOverallConfidence(agentTrace);

      await this._updateJobStatus(jobId, 'completed', {
        overallConfidence,
        agentTrace,
        fileCount: pipelineData.manifest?.length || 0,
        nodeCount: Object.keys(pipelineData.graph || {}).length,
        edgeCount: pipelineData.edges?.length || 0,
      });

      // ── Cleanup temp files ────────────────────────────────
      await ingestionAgent.cleanup(pipelineData.tempRoot);

      return { jobId, overallConfidence, status: 'completed' };

    } catch (err) {
      await this._abort(jobId, { errors: [{ message: err.message }] }, agentTrace);
      await ingestionAgent.cleanup(pipelineData.tempRoot).catch(() => {});
      throw err;
    }
  }

  // ── Core supervision method ─────────────────────────────────────────────────
  async _runWithSupervision(agent, input, context, opts = { abortOnCritical: true }) {
    let attempt = 0;
    let lastResult;

    while (attempt <= agent.maxRetries) {
      attempt++;
      const result = await this._runWithTimeout(agent, input, context);
      result.retryCount = attempt - 1;

      await this.logger.log({ ...result, attempt, jobId: context.jobId });

      const decision = this._decide(result.confidence);

      if (decision === 'PROCEED' || decision === 'PROCEED_WARN') {
        if (decision === 'PROCEED_WARN') {
          console.warn(`[Supervisor] ${agent.agentId} confidence ${result.confidence.toFixed(3)} — proceeding with warning`);
        }
        return result;
      }

      if (decision === 'RETRY' && attempt <= agent.maxRetries) {
        console.warn(`[Supervisor] ${agent.agentId} confidence ${result.confidence.toFixed(3)} — retry ${attempt}/${agent.maxRetries}`);
        await this._sleep(Math.pow(2, attempt) * 500);  // exponential backoff
        lastResult = result;
        continue;
      }

      // ABORT
      if (opts.abortOnCritical) {
        result.status = 'failed';
      } else {
        // Non-critical agent: degrade gracefully
        result.status = 'partial';
        console.warn(`[Supervisor] ${agent.agentId} critically low confidence — degraded mode`);
      }
      return result;
    }

    return lastResult;
  }

  async _runWithTimeout(agent, input, context) {
    return Promise.race([
      agent.process(input, context),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`${agent.agentId} timed out after ${agent.timeoutMs}ms`)), agent.timeoutMs)
      ),
    ]).catch((err) => agent.buildResult({
      jobId: context.jobId,
      status: 'failed',
      confidence: 0,
      data: {},
      errors: [{ message: err.message }],
      warnings: [],
      metrics: {},
      processingTimeMs: agent.timeoutMs,
    }));
  }

  _decide(confidence) {
    if (confidence >= THRESHOLDS.PROCEED)      return 'PROCEED';
    if (confidence >= THRESHOLDS.PROCEED_WARN) return 'PROCEED_WARN';
    if (confidence >= THRESHOLDS.RETRY)        return 'RETRY';
    return 'ABORT';
  }

  _computeOverallConfidence(agentTrace) {
    let logSum = 0;
    let weightSum = 0;
    for (const result of agentTrace) {
      const w = WEIGHTS[result.agentId] || 0.1;
      logSum += w * Math.log(Math.max(result.confidence, 0.001));
      weightSum += w;
    }
    return parseFloat(Math.exp(logSum / weightSum).toFixed(3));
  }

  async _abort(jobId, result, agentTrace) {
    const summary = result.errors?.map((e) => e.message).join('; ') || 'Agent failed';
    await this._updateJobStatus(jobId, 'failed', { errorSummary: summary, agentTrace });
    return { jobId, status: 'failed', error: summary };
  }

  async _updateJobStatus(jobId, status, extra = {}) {
    // DB update + SSE emit to frontend
    await this.emitter.emit(jobId, { status, ...extra });
  }

  _sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
}
```

### BaseAgent

**File:** `server/src/agents/core/BaseAgent.js`

```js
export class BaseAgent {
  agentId = 'base-agent';
  maxRetries = 1;
  timeoutMs = 60_000;

  // Subclasses implement this
  async process(input, context) {
    throw new Error('process() not implemented');
  }

  buildResult({ jobId, status, confidence, data, errors, warnings, metrics, processingTimeMs, retryCount = 0 }) {
    return {
      agentId: this.agentId,
      jobId,
      status,
      confidence: Math.min(1, Math.max(0, parseFloat(confidence.toFixed(3)))),
      data,
      errors: errors || [],
      warnings: warnings || [],
      metrics: metrics || {},
      processingTimeMs,
      retryCount,
    };
  }
}
```

---

## Communication Layer

### BullMQ Job Queue

Analysis jobs are submitted to a BullMQ queue. This means the HTTP request returns immediately with a `jobId`, and the pipeline runs asynchronously. The frontend polls for status via SSE.

```js
// server/src/queue/analysisQueue.js
import { Queue, Worker } from 'bullmq';
import { SupervisorAgent } from '../agents/core/SupervisorAgent.js';
import { db, redis } from '../infrastructure/connections.js';

export const analysisQueue = new Queue('code-analysis', {
  connection: redis,
  defaultJobOptions: {
    attempts: 1,           // Supervisor handles retries internally
    removeOnComplete: 100,
    removeOnFail: 200,
  },
});

// Worker: one per CPU core
export const analysisWorker = new Worker(
  'code-analysis',
  async (job) => {
    const supervisor = new SupervisorAgent({ db, redis });
    return supervisor.runPipeline(job.data.jobId, job.data.input);
  },
  {
    connection: redis,
    concurrency: 3,       // 3 repos analyzed in parallel per server instance
  }
);

analysisWorker.on('failed', (job, err) => {
  console.error(`[Queue] Job ${job.id} failed:`, err.message);
});
```

### Server-Sent Events for Real-Time Status

```js
// server/src/api/jobs/jobs.routes.js
router.get('/:jobId/stream', authMiddleware, async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sub = redis.subscribe(`job:${req.params.jobId}`, (message) => {
    res.write(`data: ${message}\n\n`);
    const parsed = JSON.parse(message);
    if (['completed', 'failed', 'partial'].includes(parsed.status)) {
      sub.unsubscribe();
      res.end();
    }
  });

  req.on('close', () => sub.unsubscribe());
});
```

---

## Complete Folder Structure

```
codegraph-ai/
│
├── server/
│   ├── src/
│   │   ├── agents/
│   │   │   ├── core/
│   │   │   │   ├── BaseAgent.js           ← interface + buildResult()
│   │   │   │   ├── SupervisorAgent.js     ← orchestration + confidence
│   │   │   │   ├── AuditLogger.js         ← writes agent_audit_log
│   │   │   │   ├── JobStatusEmitter.js    ← Redis pub/sub for SSE
│   │   │   │   └── confidence.js          ← scoring formulas per agent
│   │   │   │
│   │   │   ├── ingestion/
│   │   │   │   └── IngestionAgent.js
│   │   │   ├── scanner/
│   │   │   │   └── ScannerAgent.js
│   │   │   ├── parser/
│   │   │   │   ├── ParserAgent.js
│   │   │   │   └── parseWorker.js         ← worker_thread entry point
│   │   │   ├── graph/
│   │   │   │   ├── GraphBuilderAgent.js
│   │   │   │   └── algorithms/
│   │   │   │       ├── tarjan.js          ← cycle detection
│   │   │   │       └── topology.js        ← in/out degree, betweenness
│   │   │   ├── enrichment/
│   │   │   │   └── EnrichmentAgent.js
│   │   │   ├── embedding/
│   │   │   │   └── EmbeddingAgent.js
│   │   │   ├── persistence/
│   │   │   │   └── PersistenceAgent.js
│   │   │   ├── query/
│   │   │   │   └── QueryAgent.js          ← on-demand, not in pipeline
│   │   │   └── analysis/
│   │   │       └── AnalysisAgent.js       ← on-demand
│   │   │
│   │   ├── queue/
│   │   │   ├── analysisQueue.js           ← BullMQ queue + worker
│   │   │   └── queueDashboard.js          ← Bull Board UI (optional)
│   │   │
│   │   ├── infrastructure/
│   │   │   ├── connections.js             ← pg Pool + ioredis client
│   │   │   └── migrations/
│   │   │       └── 001_initial.sql        ← schema above
│   │   │
│   │   ├── analyze/                       ← existing, now just HTTP layer
│   │   │   └── routes/analyze.routes.js   ← enqueues job, returns jobId
│   │   │
│   │   ├── api/
│   │   │   ├── jobs/
│   │   │   │   └── jobs.routes.js         ← GET /jobs/:id/stream (SSE)
│   │   │   ├── graph/
│   │   │   │   └── graph.routes.js        ← GET graph from DB by jobId
│   │   │   └── ai/
│   │   │       └── ai.routes.js           ← NLQ, impact (calls QueryAgent)
│   │   │
│   │   ├── auth/                          ← existing, unchanged
│   │   ├── middleware/                    ← existing
│   │   └── utils/                         ← existing
│   │
│   └── app.js                             ← register all new routers
│
└── client/
    └── src/
        └── features/
            ├── jobs/
            │   ├── components/
            │   │   └── JobProgressBar.jsx ← consumes SSE stream
            │   └── slices/jobSlice.js
            ├── graph/                     ← existing, now loads from DB
            └── ai/                        ← from Phase 2 guide
```

---

## API Contract (Updated)

The analyze endpoint no longer does synchronous work. It enqueues a job and returns immediately.

```
POST /api/analyze
→ { jobId: "uuid", estimatedSeconds: 45 }

GET  /api/jobs/:jobId
→ { status, overallConfidence, agentTrace, fileCount, nodeCount, edgeCount }

GET  /api/jobs/:jobId/stream          ← SSE
→ stream of { status, currentAgent, confidence } events

GET  /api/graph/:jobId
→ { graph: {}, edges: [], topology: {} }

POST /api/ai/query
→ { question, jobId } → { answer, highlightedFiles, confidence }

POST /api/ai/impact
→ { filePath, jobId } → { affectedFiles }

GET  /api/repositories
→ list of user's previously scanned repos with last job status

GET  /api/repositories/:repoId/jobs
→ list of all analysis jobs for a repo (for history/quick access)
```

---

## Client: Job Progress Component

```jsx
// client/src/features/jobs/components/JobProgressBar.jsx
import { useEffect, useState } from 'react';

const STAGE_LABELS = {
  ingesting:  { label: 'Fetching repository', icon: '⬇️' },
  scanning:   { label: 'Scanning files',       icon: '🔍' },
  parsing:    { label: 'Parsing AST',           icon: '🧱' },
  building:   { label: 'Building graph',        icon: '🕸️' },
  enriching:  { label: 'AI enrichment',         icon: '✨' },
  embedding:  { label: 'Generating embeddings', icon: '🧬' },
  persisting: { label: 'Saving results',        icon: '💾' },
  completed:  { label: 'Analysis complete',     icon: '✅' },
  failed:     { label: 'Analysis failed',       icon: '❌' },
};

export function JobProgressBar({ jobId, onComplete }) {
  const [stage, setStage] = useState('queued');
  const [confidence, setConfidence] = useState(null);
  const [agentTrace, setAgentTrace] = useState([]);

  useEffect(() => {
    if (!jobId) return;
    const es = new EventSource(`/api/jobs/${jobId}/stream`, { withCredentials: true });

    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      setStage(data.status);
      if (data.overallConfidence) setConfidence(data.overallConfidence);
      if (data.agentTrace) setAgentTrace(data.agentTrace);
      if (['completed', 'failed', 'partial'].includes(data.status)) {
        es.close();
        onComplete?.(data);
      }
    };

    return () => es.close();
  }, [jobId]);

  const info = STAGE_LABELS[stage] || { label: stage, icon: '⏳' };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-sm">
        <span>{info.icon}</span>
        <span className="text-foreground">{info.label}</span>
        {confidence && (
          <span className="ml-auto text-xs text-muted-foreground">
            Confidence: {(confidence * 100).toFixed(0)}%
          </span>
        )}
      </div>

      {/* Per-agent confidence pills */}
      {agentTrace.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {agentTrace.map((r) => (
            <span
              key={r.agentId}
              className={`text-[10px] px-2 py-0.5 rounded-full border ${
                r.confidence >= 0.85 ? 'border-green-500/30 text-green-400' :
                r.confidence >= 0.65 ? 'border-yellow-500/30 text-yellow-400' :
                                       'border-red-500/30 text-red-400'
              }`}
            >
              {r.agentId.replace('-agent', '')} {(r.confidence * 100).toFixed(0)}%
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
```

---

## Environment Variables (Complete)

```bash
# server/.env

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/codegraph

# Redis
REDIS_URL=redis://localhost:6379

# Auth
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
JWT_SECRET=...
CLIENT_URL=http://localhost:5173

# AI
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small

# Supervisor tuning
AGENT_CONFIDENCE_ABORT=0.40
AGENT_CONFIDENCE_RETRY=0.65
AGENT_CONFIDENCE_PROCEED=0.85

# Parser
PARSER_WORKER_CONCURRENCY=4      # default: cpu_count - 1

# Queue
QUEUE_CONCURRENCY=3
QUEUE_JOB_TIMEOUT_MS=600000      # 10 minutes max per job

# Rate limiting
AI_RATE_LIMIT_PER_MINUTE=30
ANALYZE_RATE_LIMIT_PER_MINUTE=10
```

---

## Why This Architecture Wins

### For a Job Proposal

This system demonstrates four engineering maturity signals that most candidates never show together:

**Reliability engineering.** The Supervisor's confidence scoring means the system knows when it's uncertain and says so — rather than returning garbage with a 200 status. This is the difference between a prototype and a product.

**Systems design depth.** Using `worker_threads` for the parser (not `child_process`, not `Promise.all` over sync parsing) shows understanding of Node's event loop and CPU-bound vs I/O-bound workload classification.

**Database architecture judgment.** Choosing PostgreSQL + pgvector over a stack of five different databases shows you can evaluate tradeoffs, not just reach for what's fashionable. The `unnest()` bulk insert pattern is production Postgres, not tutorial Postgres.

**Agentic AI design.** The agent contract — every agent returns `{ confidence, status, data, errors }` and is individually retried — is the same pattern used in real LLM orchestration systems (LangGraph, CrewAI, AutoGen). Building it from scratch in raw Node shows you understand the pattern, not just the framework.

### For a Product to Sell

**Auditability is a feature.** The `agent_audit_log` table and the `agentTrace` returned to the frontend mean users can see exactly why an analysis produced low confidence. Enterprise buyers love this. It turns "why is my graph incomplete?" from a support ticket into a self-serve answer.

**Graceful degradation.** A repo with no TypeScript LSP data still produces a graph. A repo where OpenAI rate-limits still produces a graph without summaries. A repo where embedding fails still works for NLQ via keyword fallback. The system ships a useful result even when individual agents fail.

**Horizontal scalability.** Because the pipeline runs in BullMQ workers, scaling from 3 concurrent analyses to 30 is `QUEUE_CONCURRENCY=30` and another server instance. The architecture doesn't change.

**Pricing hook.** The `plan` field in the `users` table and the `batchStats.totalTokensUsed` in the EnrichmentAgent output give you the exact data to implement usage-based billing later. Free tier: 3 repos, no embeddings. Pro: unlimited repos, full embeddings + NLQ.
