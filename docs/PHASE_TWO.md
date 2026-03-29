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