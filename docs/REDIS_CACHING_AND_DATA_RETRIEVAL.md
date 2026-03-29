# Redis Caching And Optimized Data Retrieval

This document describes the current Redis usage, cache architecture, invalidation strategy, and database retrieval optimizations implemented in the CodeGraph AI stack.

## Scope

Covers:
- Shared Redis connectivity and helper utilities
- Read-through caching for analysis, graph, and repositories APIs
- Existing Redis-backed agent caches
- SSE job status streaming over Redis pub/sub
- Cache invalidation triggers
- Optimized SQL retrieval patterns
- Frontend wiring to optimized repository endpoints

## Redis Infrastructure

Primary files:
- server/src/infrastructure/connections.js
- server/src/infrastructure/cache.js

### Connection model

Redis is initialized as a singleton `redisClient` using `REDIS_URL` or `REDIS_HOST` and `REDIS_PORT`.

Postgres and Redis are both shared singletons:
- `pgPool` for DB access
- `redisClient` for caching, queue, and pub/sub

### Cache utility module

`server/src/infrastructure/cache.js` centralizes:
- Namespaced/versioned keys with `cache:v1:*`
- JSON cache read and write helpers
- TTL normalization with jitter
- Pattern-based invalidation using `SCAN` (not `KEYS`)

## Cache Key Strategy

All keys are versioned and namespaced:

- Analysis history list:
  - `cache:v1:analysis-history:user:{userId}:page:{page}:limit:{limit}`
- Graph payload by job:
  - `cache:v1:graph:job:{jobId}`
- Repositories list:
  - `cache:v1:repositories:user:{userId}:page:{page}:limit:{limit}`
- Repository jobs list:
  - `cache:v1:repository-jobs:user:{userId}:repo:{repositoryId}:page:{page}:limit:{limit}`

The key version (`v1`) allows safe future invalidation-by-version on schema changes.

## TTL Policy

Configurable via env vars:
- `ANALYSIS_HISTORY_CACHE_TTL_SECONDS` default `60`
- `GRAPH_CACHE_TTL_SECONDS` default `300`
- `REPOSITORIES_LIST_CACHE_TTL_SECONDS` default `60`
- `REPOSITORY_JOBS_CACHE_TTL_SECONDS` default `60`

Jitter policy:
- `+ up to 10%` random jitter added to each TTL write to reduce synchronized expiry and stampedes.

## Cache Read Pattern (Cache-Aside)

The API routes use cache-aside:
1. Build key from request identity and pagination
2. Attempt Redis read
3. On hit: return cached payload
4. On miss: query Postgres, shape payload, write to Redis with TTL, return payload

### Observability headers

Cached endpoints set response header:
- `X-Cache: HIT`
- `X-Cache: MISS`

Implemented in:
- `GET /api/analyze/history`
- `GET /api/graph/:jobId`
- `GET /api/repositories`
- `GET /api/repositories/:id/jobs`

## Invalidation Strategy

Implemented explicit invalidation events:

### 1) On new analysis enqueue

File:
- server/src/analyze/controllers/analyze.controller.js

After job enqueue:
- Invalidate analysis history cache for the user
- Invalidate repositories and repository-jobs caches for the user

### 2) On terminal job status update

File:
- server/src/agents/core/SupervisorAgent.js

When status is one of:
- `completed`
- `failed`
- `partial`

Then:
- Delete graph cache key for that job
- Resolve `user_id` from `analysis_jobs`
- Invalidate user analysis-history cache
- Invalidate user repositories and repository-jobs caches

This ensures cache coherence after pipeline state changes and persisted graph updates.

## Endpoint-Level Implementation

## 1) Analyze history endpoint

Route:
- `GET /api/analyze/history`

File:
- server/src/analyze/controllers/analyze.controller.js

Optimized retrieval details:
- Uses CTE (`latest_repo_jobs`) with `SELECT DISTINCT ON (r.id)` to retrieve latest job per repository
- Uses correlated subquery for latest completed job id (`latest_completed_job_id`) so graph restore is possible even if latest run is not completed
- Uses `Promise.all` to fetch list page and total count concurrently
- Supports pagination with `page`, `limit`, `offset`

## 2) Graph endpoint

Route:
- `GET /api/graph/:jobId`

File:
- server/src/api/graph/routes/graph.routes.js

Optimized retrieval details:
- Fetches nodes and edges in parallel with `Promise.all`
- Builds adjacency map (`depsBySource`) in memory to avoid extra round-trips
- Returns compact graph payload with topology summary

## 3) Repositories list endpoint

Route:
- `GET /api/repositories`

File:
- server/src/api/repositories/routes/repositories.routes.js

Optimized retrieval details:
- Uses `LEFT JOIN LATERAL` to fetch latest job per repository in one query
- Includes scan metadata and latest-job confidence/status/metrics
- Uses concurrent list and count queries via `Promise.all`
- Enforces user-level data isolation via owner filter
- Supports pagination

## 4) Repository jobs endpoint

Route:
- `GET /api/repositories/:id/jobs`

File:
- server/src/api/repositories/routes/repositories.routes.js

Optimized retrieval details:
- Validates repository ownership before loading jobs
- Returns paginated job history ordered by `COALESCE(completed_at, created_at) DESC`
- Includes status, confidence, counts, error summary, and timestamps
- Uses concurrent list and count queries

## Existing Redis Caching In Agents

## QueryAgent cache

File:
- server/src/agents/query/QueryAgent.js

Key pattern:
- `nlq:{jobId}:{sha256(question)}`

Behavior:
- Reads cached NLQ answer before embedding/vector/LLM pipeline
- On hit: returns cached answer and marks `cacheHit: true`
- On miss: runs full semantic retrieval and LLM answer, then writes result to cache

TTL:
- `QUERY_AGENT_CACHE_TTL_SECONDS` default `3600`

## EnrichmentAgent cache

File:
- server/src/agents/enrichment/EnrichmentAgent.js

Key pattern:
- `enrichment:{sha256(version+model+threshold+file metadata+content)}`

Behavior:
- Uses Redis to avoid repeated LLM file summarization for unchanged inputs
- On hit: uses cached enrichment payload
- On miss: calls LLM and writes normalized result

TTL:
- `ENRICHMENT_CACHE_TTL_SECONDS` default `3600`

## Redis For Queue And Streaming

## BullMQ queue transport

File:
- server/src/queue/analysisQueue.js

Redis is used as queue backend for asynchronous analysis job execution.

## SSE job updates via pub/sub

Files:
- server/src/agents/core/JobStatusEmitter.js
- server/src/api/jobs/routes/jobs.routes.js

Behavior:
- Supervisor publishes job status to channel `job:{jobId}`
- SSE route subscribes and streams updates to clients
- Subscribers use `redisClient.duplicate()` for isolated pub/sub connection

## Frontend Integration For Optimized Retrieval

Primary files:
- client/src/features/dashboard/services/dashboardService.js
- client/src/features/dashboard/slices/dashboardSlice.js
- client/src/features/dashboard/pages/DashboardPage.jsx

Current flow:
1. Dashboard pulls repository list from `GET /api/repositories`
2. Expanding a repository lazily fetches `GET /api/repositories/:id/jobs`
3. Completed jobs expose restore action to load graph through existing `GET /api/graph/:jobId`
4. Dashboard stores per-repo jobs state in Redux for incremental loading and stable UX

## Correctness And Failure Behavior

- All cache operations are best-effort and fail open to DB (no hard dependency for correctness)
- Invalidation is explicit and event-driven around writes/status changes
- TTL bounds stale windows while preserving responsiveness under read-heavy access patterns
- Ownership checks on repository endpoints prevent cross-user data access

## Environment Variables Reference

Redis connection:
- `REDIS_URL`
- `REDIS_HOST`
- `REDIS_PORT`

Shared API cache TTLs:
- `ANALYSIS_HISTORY_CACHE_TTL_SECONDS`
- `GRAPH_CACHE_TTL_SECONDS`
- `REPOSITORIES_LIST_CACHE_TTL_SECONDS`
- `REPOSITORY_JOBS_CACHE_TTL_SECONDS`

Agent cache TTLs:
- `QUERY_AGENT_CACHE_TTL_SECONDS`
- `ENRICHMENT_CACHE_TTL_SECONDS`

## Validation Checklist

- Call each endpoint twice and confirm first is `X-Cache: MISS`, second is `X-Cache: HIT`
- Enqueue a new analysis and confirm user list endpoints flip back to `MISS` (invalidation)
- Complete a job and confirm:
  - `GET /api/graph/:jobId` returns `MISS` once after completion
  - Subsequent call returns `HIT`
- Confirm repository ownership checks:
  - Non-owner access to `/api/repositories/:id/jobs` returns `404`

## Future Hardening Suggestions

- Add cache hit/miss counters by route to logs/metrics backend
- Add Redis memory and eviction monitoring dashboard
- Add optional stale-while-revalidate mode for list endpoints
- Add route-level integration tests asserting invalidation behavior
