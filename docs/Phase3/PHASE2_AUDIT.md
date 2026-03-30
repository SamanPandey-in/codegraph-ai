# Phase 2 Audit — CodeGraph AI

**Audit date:** March 2026  
**Codebase:** `codegraph-ai-main__1_.zip`

---

## Executive Summary

Phase 2 is approximately **85% complete**. The entire backend — all 9 agents, the SupervisorAgent pipeline, BullMQ queue, PostgreSQL schema, Redis caching, and every API route — is fully implemented and production-grade. The client-side infrastructure (Redux slices, services, SSE streaming, component files) is also in place. What is missing is the **dispatch wiring inside AiPanel** and one **status string bug in QueryBar**, meaning the AI panel opens on node click but silently shows nothing, and the query loading spinner never activates. These are small gaps but they are the most visible parts of Phase 2 to a user.

---

## What Is Complete

### Server — fully done

| Item | File | Status |
|---|---|---|
| PostgreSQL schema | `server/src/infrastructure/migrations/001_initial.sql` | ✅ Complete — all 7 tables including pgvector |
| DB + Redis connections | `server/src/infrastructure/connections.js` | ✅ pg Pool + ioredis singletons |
| Redis cache layer | `server/src/infrastructure/cache.js` | ✅ TTL jitter, versioning, pattern invalidation |
| BullMQ queue | `server/src/queue/analysisQueue.js` | ✅ Worker + `enqueueAnalysisJob` helper |
| BaseAgent | `server/src/agents/core/BaseAgent.js` | ✅ `buildResult()` contract |
| SupervisorAgent | `server/src/agents/core/SupervisorAgent.js` | ✅ Full pipeline, weighted confidence, retries |
| AuditLogger | `server/src/agents/core/AuditLogger.js` | ✅ SHA-256 input hash, writes to `agent_audit_log` |
| JobStatusEmitter | `server/src/agents/core/JobStatusEmitter.js` | ✅ Redis pub/sub for SSE |
| confidence.js | `server/src/agents/core/confidence.js` | ✅ Thresholds, weights, per-agent scoring functions |
| IngestionAgent | `server/src/agents/ingestion/IngestionAgent.js` | ✅ GitHub archive + local path handling |
| ScannerAgent | `server/src/agents/scanner/ScannerAgent.js` | ✅ File tree walk + language breakdown |
| ParserAgent | `server/src/agents/parser/ParserAgent.js` | ✅ Uses real `worker_threads`, pLimit concurrency |
| parseWorker.js | `server/src/agents/parser/parseWorker.js` | ✅ Babel AST, imports + declarations + metrics |
| GraphBuilderAgent | `server/src/agents/graph/GraphBuilderAgent.js` | ✅ Import resolution, Tarjan cycles, topology |
| EnrichmentAgent | `server/src/agents/enrichment/EnrichmentAgent.js` | ✅ GPT-4o-mini summaries, cheap fallback, Redis cache |
| EmbeddingAgent | `server/src/agents/embedding/EmbeddingAgent.js` | ✅ `text-embedding-3-small`, batched, pgvector |
| PersistenceAgent | `server/src/agents/persistence/PersistenceAgent.js` | ✅ Bulk unnest insert, savepoints, embeddings |
| QueryAgent | `server/src/agents/query/QueryAgent.js` | ✅ Vector similarity → rerank → LLM, saves to `saved_queries` |
| AnalysisAgent | `server/src/agents/analysis/AnalysisAgent.js` | ✅ Dead code + BFS impact analysis |
| `/api/jobs/:id/stream` | `server/src/api/jobs/routes/jobs.routes.js` | ✅ SSE with Redis pub/sub subscriber |
| `/api/graph/:jobId` | `server/src/api/graph/routes/graph.routes.js` | ✅ Loads from DB, Redis cache with TTL |
| `/api/ai/query` | `server/src/api/ai/routes/ai.routes.js` | ✅ QueryAgent + rate limiter |
| `/api/ai/impact` | `server/src/api/ai/routes/ai.routes.js` | ✅ AnalysisAgent + auth guard |
| `/api/repositories` | `server/src/api/repositories/routes/repositories.routes.js` | ✅ Paginated, LATERAL join, cached |
| `/api/repositories/:id/jobs` | same file | ✅ Job history per repo, cached |
| `analyze.controller.js` | `server/src/analyze/controllers/analyze.controller.js` | ✅ Async — enqueues job, returns `jobId` immediately |
| `app.js` | `server/app.js` | ✅ All routers registered |
| `docker-compose.yml` | root | ✅ pgvector image, Redis 7, backend with migrate script |
| `package.json` | `server/package.json` | ✅ bullmq, openai, pg, pgvector, ioredis all installed |
| `.env.example` | `server/.env.example` | ✅ All keys documented |

### Client — mostly done

| Item | File | Status |
|---|---|---|
| `aiSlice.js` | `client/src/features/ai/slices/aiSlice.js` | ✅ All 3 thunks, selectors, reset action |
| `aiService.js` | `client/src/features/ai/services/aiService.js` | ✅ queryGraph, explainNode, analyzeImpact |
| `aiReducer` in store | `client/src/app/store.js` | ✅ Registered |
| `JobProgressBar.jsx` | `client/src/features/jobs/components/JobProgressBar.jsx` | ✅ All stage labels + agent confidence pills |
| `graphSlice.js` | `client/src/features/graph/slices/graphSlice.js` | ✅ SSE polling, `loadSavedGraph` thunk, `updateAnalysisJob` |
| `graphService.js` | `client/src/features/graph/services/graphService.js` | ✅ `waitForJobCompletion` (EventSource), `getGraph` |
| `GraphView.jsx` | `client/src/features/graph/components/GraphView.jsx` | ✅ Highlight + dead code styling wired from Redux |
| `GraphPage.jsx` | `client/src/features/graph/pages/GraphPage.jsx` | ✅ QueryBar shown, `loadSavedGraph` via URL `?jobId=` |
| `AnalyzePage.jsx` | `client/src/features/graph/pages/AnalyzePage.jsx` | ✅ `JobProgressBar` shown during loading |
| `dashboardSlice.js` | `client/src/features/dashboard/slices/dashboardSlice.js` | ✅ `fetchAnalyzedRepositories`, `fetchRepositoryJobs` |
| `dashboardService.js` | `client/src/features/dashboard/services/dashboardService.js` | ✅ Hits `/api/repositories` + `/api/repositories/:id/jobs` |

---

## What Is Missing — Phase 2 Completion Gaps

### Gap 1 — AiPanel never dispatches `explainNode` (critical UX break)

**File:** `client/src/features/ai/components/AiPanel.jsx`

The panel reads from `selectAiExplainState` and `selectAiImpactState` but there is no `useDispatch` call and no `useEffect` that fires when `nodeId` changes. The result: clicking any node opens the panel showing only static data (type, declarations, deps, usedBy). The "AI Explanation" section only renders if `explainState.data` happens to be populated from a previous QueryBar search — which is coincidental.

**What needs to be added:**

```jsx
import { useDispatch, useSelector } from 'react-redux';
import { useEffect } from 'react';
import { explainNode, analyzeImpact } from '../slices/aiSlice';

export default function AiPanel({ nodeId, graph, onClose }) {
  const dispatch = useDispatch();
  const jobId = useSelector((state) => state.graph.data?.jobId);

  // Auto-fetch explanation when selected node changes
  useEffect(() => {
    if (!nodeId || !jobId) return;
    dispatch(explainNode({ jobId, filePath: nodeId, nodeLabel: nodeId }));
  }, [nodeId, jobId, dispatch]);

  // ... rest of component
```

Also needs a "Simulate change impact" button that dispatches `analyzeImpact`:

```jsx
<button
  onClick={() => dispatch(analyzeImpact({ jobId, filePath: nodeId }))}
  disabled={impactState.status === 'loading'}
>
  Simulate change →
</button>
```

---

### Gap 2 — QueryBar loading state never activates (bug)

**File:** `client/src/features/ai/components/QueryBar.jsx`, line 22

```js
// Current — WRONG
const isLoading = status === 'pending';

// Correct — matches what aiSlice sets
const isLoading = status === 'loading';
```

The `aiSlice.js` `extraReducers` sets `state.query.status = 'loading'` on `.pending`. The QueryBar checks for `'pending'`. These strings never match, so the ask button spinner and disabled state never fire during an in-flight request.

---

### Gap 3 — No dedicated `/api/ai/explain` endpoint

**Files:** `server/src/api/ai/routes/ai.routes.js`

The current flow works but is approximate: `aiService.explainNode()` constructs a question string and sends it to `/api/ai/query`. This means:

- The explanation is a generic NLQ answer, not a structured `{ purpose, keyFunctions, dependencies, risks }` object.
- The `EnrichmentAgent` already stored a one-line `summary` in `graph_nodes.summary`, which is returned in the graph payload and available at `graph[nodeId].summary`. The AiPanel could display this summary directly from Redux state without any extra API call — no endpoint needed.

**Simplest fix:** In `AiPanel.jsx`, display the pre-stored summary directly:

```jsx
const nodeData = graph[nodeId];
const enrichedSummary = nodeData?.summary;   // already in Redux from getGraph

// Render it immediately, no loading state needed:
{enrichedSummary && (
  <div className="mb-3 rounded-lg border border-border bg-background/40 p-3">
    <p className="mb-1 text-muted-foreground/60 uppercase tracking-wider text-[10px]">Summary</p>
    <p className="text-foreground/90 leading-relaxed">{enrichedSummary}</p>
  </div>
)}
```

The `explainNode` dispatch (Gap 1) then serves as a deeper "ask AI about this file" enrichment on top.

---

### Gap 4 — Dashboard shows a "pending" placeholder card

**File:** `client/src/features/dashboard/pages/DashboardPage.jsx`, ~line 493

There is a `CardTitle` with text "Database history integration pending" visible in certain state branches. The backend endpoint `/api/repositories` is fully implemented and the `dashboardService` correctly calls it. This placeholder appears to render when `status === 'failed'` with a `NOT_READY` error code, which the `dashboardSlice` sets when the response is 404 or 501.

Since the endpoint exists, this should not trigger — but verify `VITE_API_BASE_URL` is set correctly in `client/.env` (it defaults to `'http://localhost:5000/api'` in `dashboardService.js`, which differs from the graphService which uses `''` as base and appends full paths). If the API base URL is misconfigured this hits 404 and shows the placeholder.

**Fix:** Standardise `VITE_API_BASE_URL` across all services. The `dashboardService` uses `http://localhost:5000/api` as fallback while `aiService` and `graphService` use `''` (relative). Align them all to use relative paths or set `VITE_API_BASE_URL=http://localhost:5000` consistently.

---

### Gap 5 — `explainNode` result structure mismatch in AiPanel

**File:** `client/src/features/ai/components/AiPanel.jsx`

```js
const explanation = explainState?.data?.answer || explainState?.data?.explanation || null;
```

The `QueryAgent` returns `{ answer, highlightedFiles, confidence }`. So `explainState.data.answer` will work once Gap 1 is fixed. However `explainState.data.explanation` does not exist in the response schema — it's a dead fallback. This is cosmetically harmless but confirms the explain flow was designed for a structured response that was never implemented server-side.

---

## Gap Fix Priority

| Priority | Gap | Time to fix |
|---|---|---|
| P0 | Gap 2 — QueryBar `'pending'` → `'loading'` | 2 minutes |
| P0 | Gap 1 — AiPanel `useEffect` + `analyzeImpact` button | 30 minutes |
| P1 | Gap 3 — Display `graph[nodeId].summary` directly in AiPanel | 15 minutes |
| P2 | Gap 4 — Dashboard API base URL alignment | 10 minutes |
| P3 | Gap 5 — Clean up dead `explanation` fallback key | 5 minutes |

Total to complete Phase 2: **~1 hour of targeted client-side changes.**

---

## Phase 2 Completion Checklist

- [x] `AiPanel.jsx`: Add `useDispatch`, `useEffect` to auto-call `explainNode` on `nodeId` change
- [x] `AiPanel.jsx`: Add "Simulate change" button that dispatches `analyzeImpact`
- [x] `AiPanel.jsx`: Display `graph[nodeId].summary` as instant pre-loaded enrichment summary
- [x] `QueryBar.jsx`: Fix `isLoading = status === 'loading'` (not `'pending'`)
- [x] `client/.env` / `dashboardService.js`: Align base URL to `''` (relative) across all services
- [x] `AiPanel.jsx`: Remove dead `.explanation` fallback key
