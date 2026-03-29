# Phase 2

## Sprint 1 : Infrastructure foundation - replace the monolith with agents

Why Sprint 1 before any AI features: The existing analyze.service.js is a synchronous monolith — it blocks the HTTP response for the entire duration of parsing. Adding AI features on top of that means the HTTP request would have to wait 30 seconds for parsing plus 5–10 seconds for LLM calls. That's a broken user experience. Sprint 1 converts the system to async (BullMQ queue → SSE stream) so Phase 2's AI work can happen in the background without ever touching the HTTP layer. This also means the client gets real-time progress per agent instead of a spinner.

### Install server deps:
npm install pg ioredis bullmq openai @pgvector/pg

### Run DB migrations:
Run this in your project root:
```
docker run -d ^
  --name codegraph-postgres ^
  -e POSTGRES_USER=postgres ^
  -e POSTGRES_PASSWORD=postgres ^
  -e POSTGRES_DB=codegraph ^
  -p 5433:5432 ^
  ankane/pgvector
```
Using 5433 as 5432 maybe used by local PostgreSQL

Verify it:
```
docker ps
```

Now run migration:
``` 
psql -h localhost -p 5433 -U postgres -d codegraph -f ./server/src/infrastructure/migrations/001_initial.sql
```
Enter password `postgres`

### Further onwards:
```
docker start codegraph-postgres
docker stop codegraph-postgres
```

### Create infrastructure/connections.js - new
pg Pool + ioredis client, both exported as singletons

### Create BaseAgent.js and confidence.js - new
server/src/agents/core/ — buildResult(), scoring formulas per agent

### Create AuditLogger + JobStatusEmitter - new
AuditLogger writes to agent_audit_log; Emitter does Redis pub/sub for SSE

### Extract IngestionAgent from analyze.service.js - refactor
Move _handleGitHub + _handleLocal into agent class; keep original file temporarily

### Extract ScannerAgent from fileScanner.service.js - refactor
Wrap scanFiles() in agent class; add monorepo detection + language breakdown

### Extract ParserAgent from astParser.service.js + add worker thread - refactor
Move parse logic to parseWorker.js (worker_threads); ParserAgent spawns pool; also add declarations extraction here

### Extract GraphBuilderAgent from astParser.service.js - refactor
buildDependencyGraph() becomes GraphBuilderAgent; add Tarjan cycle detection + in/out-degree

### Create PersistenceAgent - new
Writes nodes + edges to Postgres using unnest() bulk insert; single transaction with savepoints

### Create SupervisorAgent + BullMQ queue - new
SupervisorAgent wires agents 1–4 + Persistence; queue/analysisQueue.js runs it as async worker

### Update analyze route + add SSE jobs route - modify
POST /api/analyze now enqueues job and returns {jobId}; GET /api/jobs/:id/stream emits SSE; GET /api/graph/:jobId loads from DB

## Sprint 2 : Phase 2 AI agents - Enrichment, Embedding, Query and Analysis

### Create EnrichmentAgent (AI file summaries) - new
Files <50 lines get cheap heuristic summary; larger files hit GPT-4o-mini; results cached in Redis

### Create EmbeddingAgent - new
text-embedding-3-small; batches of 100; stores vectors in file_embeddings via pgvector

### Wire agents 5+6 into SupervisorAgent pipeline - modify
Add Enrichment + Embedding stages after GraphBuilder; both are non-fatal (abortOnCritical: false)

### Create QueryAgent (on-demand NLQ) - new
Embeds question → pgvector cosine search → keyword rerank → LLM with top-8 files; saves to saved_queries

### Create AnalysisAgent (dead code + impact) - new
Pure computation; dead code = inDegree 0 nodes (minus entry points); impact = BFS on reverse adjacency

### Add /api/ai/* routes + register in app.js - new
POST /api/ai/query → QueryAgent; POST /api/ai/impact → AnalysisAgent; rate limiter on all AI routes

## Why Phase 2 features are Agents 5–9, not a separate layer: 

If you wrote EnrichmentAgent as a standalone POST endpoint (as the Phase 2 guide originally described), you'd have two code paths for the same job: the parsing pipeline and the AI enrichment. They'd share no state, no retry logic, no confidence scoring, and no audit trail. Making enrichment an agent means the Supervisor automatically handles "OpenAI is rate-limiting right now" without crashing the whole job — it degrades gracefully and still returns the graph.

## Sprint 3 : Client Phase 2 UI - panels, query bar, highlights

### Create JobProgressBar component - client
client/src/features/jobs/ — consumes SSE stream; shows per-agent confidence pills; replaces loading spinner

### Update graphSlice to load from /api/graph/:jobId - modify
analyzeCodebase thunk now polls job status via SSE, then fetches graph from DB once completed

### Create aiSlice.js + aiService.js - client
client/src/features/ai/slices/ and services/ — explainNode, queryGraph, analyzeImpact thunks; add aiReducer to store

### Create AiPanel component - client
Replaces NodeDetail in GraphView; shows declarations, AI explanation, impact analysis, deps/usedBy

### Create QueryBar component - client
NLQ input with ask button; shows answer + "highlighting N files" feedback; clear button resets highlights

### Update GraphView for highlights + dead code + AiPanel - modify
Import highlightedNodeIds + deadFiles from aiSlice; pass to graphToFlow; swap NodeDetail → AiPanel

### Wire QueryBar + JobProgressBar into AnalyzePage - modify
QueryBar above ReactFlow canvas; JobProgressBar replaces the loading spinner during analysis