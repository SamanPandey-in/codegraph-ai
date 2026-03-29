# CodeGraph Agent Sequence and Wiring (As Built)

This document captures the implemented flow and wiring of agents in the server codebase.

## Pipeline sequence (analysis job)

1. IngestionAgent
2. ScannerAgent
3. ParserAgent
4. GraphBuilderAgent
5. EnrichmentAgent (non-fatal)
6. EmbeddingAgent (non-fatal)
7. PersistenceAgent

Supervisor computes overall confidence after all stages and emits completed or failed status.

## Supervisor decisions

Confidence policy per stage:

- High (>= 0.85): proceed
- Medium (>= 0.65): proceed with warning
- Low (>= 0.40): retry with backoff up to agent maxRetries
- Critical (< 0.40):
  - fatal stages -> failed
  - non-fatal stages -> partial and continue in degraded mode

Non-fatal stages are:

- EnrichmentAgent
- EmbeddingAgent

This matches the architecture image where AI stages degrade gracefully and do not block persistence.

## Data flow between stages

- Ingestion -> extractedPath, repoMeta, tempRoot
- Scanner -> manifest, summary
- Parser -> parsedFiles, summary
- GraphBuilder -> graph, edges, topology
- Enrichment -> enriched metadata keyed by file path
- Embedding -> embeddings keyed by file path
- Persistence writes:
  - graph_nodes from graph + enriched summary
  - graph_edges from edges
  - file_embeddings from embeddings (pgvector)

Note about the image branch at stages 5 and 6:

- The diagram shows both AI stages after graph build before persistence.
- Implementation keeps that order and behavior. Embedding runs after enrichment so it can use enriched summaries when available.

## API wiring

Primary job flow:

- POST /api/analyze enqueues work
- Worker runs SupervisorAgent pipeline
- GET /api/jobs/:jobId/stream emits stage updates via SSE
- GET /api/graph/:jobId reads persisted graph

On-demand AI routes:

- POST /api/ai/query -> QueryAgent
- POST /api/ai/impact -> AnalysisAgent

All /api/ai routes share a single rate limiter.

## Source of truth (implementation files)

- server/src/agents/core/SupervisorAgent.js
- server/src/agents/ingestion/IngestionAgent.js
- server/src/agents/scanner/ScannerAgent.js
- server/src/agents/parser/ParserAgent.js
- server/src/agents/graph/GraphBuilderAgent.js
- server/src/agents/enrichment/EnrichmentAgent.js
- server/src/agents/embedding/EmbeddingAgent.js
- server/src/agents/persistence/PersistenceAgent.js
- server/src/agents/query/QueryAgent.js
- server/src/agents/analysis/AnalysisAgent.js
- server/src/api/ai/routes/ai.routes.js
- server/src/queue/analysisQueue.js
- server/app.js
