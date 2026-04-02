-- ─────────────────────────────────────────────────────────────────────────────────
-- HOT QUERY OPTIMIZATION: Indexes for Frequently-Accessed Query Patterns
-- ─────────────────────────────────────────────────────────────────────────────────
-- These indexes target performance-critical query paths identified in the audit:
-- 1. User repository listing with pagination/sort
-- 2. User job history with time-based filtering
-- 3. Repository job lookups by status
-- 4. Dead code detection filters
-- 5. Repository lookups by GitHub owner/repo coordinates
-- ─────────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────
-- REPOSITORIES: User listing with sort by recency
-- ─────────────────────────────────────────
-- Used by: GET /api/repositories/ (user list with pagination)
-- Before: sequential scan on full table or inefficient owner_id scan
-- After: Fast index seek + sort on (owner_id, created_at DESC)
CREATE INDEX IF NOT EXISTS idx_repositories_owner_created
  ON repositories(owner_id, created_at DESC);

-- REPOSITORIES: GitHub coordinate lookup (webhook fast path)
-- Used by: GitHub webhook handlers looking up repos by GITHUB_OWNER/GITHUB_REPO
-- Before: sequential scan or index on individual columns only
-- After: Composite index for exact match on (github_owner, github_repo)
CREATE INDEX IF NOT EXISTS idx_repositories_github_coords
  ON repositories(github_owner, github_repo) WHERE github_owner IS NOT NULL AND github_repo IS NOT NULL;

-- ─────────────────────────────────────────
-- ANALYSIS_JOBS: User job history with sort by recency
-- ─────────────────────────────────────────
-- Used by: GET /api/repositories/:id/jobs (user's jobs for a repo)
--          QueryAgent, SupervisorAgent cache invalidation patterns
-- Before: sequential scan or single-column index limiting
-- After: Fast filtered sort on (user_id, created_at DESC) or (repository_id, created_at DESC)
CREATE INDEX IF NOT EXISTS idx_analysis_jobs_user_created
  ON analysis_jobs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analysis_jobs_repo_created
  ON analysis_jobs(repository_id, created_at DESC);

-- ANALYSIS_JOBS: Job status lookup by repo (pipeline monitoring/filtering)
-- Used by: Job status queries in dashboard and analysis pipeline
-- Before: full table scan on status + repository_id filter
-- After: indexed lookup of jobs with specific status in a repository
CREATE INDEX IF NOT EXISTS idx_analysis_jobs_repo_status
  ON analysis_jobs(repository_id, status);

-- ANALYSIS_JOBS: User + status lookup (cross-repo job filtering)
-- Used by: User dashboard filtering jobs by status across all repos
CREATE INDEX IF NOT EXISTS idx_analysis_jobs_user_status
  ON analysis_jobs(user_id, status);

-- ─────────────────────────────────────────
-- GRAPH_NODES: Dead code detection queries
-- ─────────────────────────────────────────
-- Used by: Dead code analysis patterns (filtering is_dead_code = TRUE per job)
-- Before: sequential scan over all nodes for a job
-- After: indexed subset of nodes for fast filtering
CREATE INDEX IF NOT EXISTS idx_graph_nodes_job_dead_code
  ON graph_nodes(job_id, is_dead_code) WHERE is_dead_code = TRUE;

-- GRAPH_NODES: File type filtering (e.g., list all components in a job)
-- Used by: UI queries filtering graph nodes by type (component, service, util, etc.)
CREATE INDEX IF NOT EXISTS idx_graph_nodes_job_type
  ON graph_nodes(job_id, file_type);

-- ─────────────────────────────────────────
-- FUNCTION_NODES: File path queries within a job
-- ─────────────────────────────────────────
-- Note: Unique constraint on (job_id, file_path, name) already exists and provides ordering
-- Ensure that composite index is enforcing uniqueness and supporting fast lookups
-- No additional index needed unless we query functions by kind across a job
CREATE INDEX IF NOT EXISTS idx_function_nodes_job_kind
  ON function_nodes(job_id, kind);

-- ─────────────────────────────────────────
-- GRAPH_EDGES: Source/target lookups during impact analysis
-- ─────────────────────────────────────────
-- Note: Indexes idx_edges_job_source and idx_edges_job_target already exist
-- Verify they are composite and support the BFS impact traversal pattern
-- No additional index needed as bidirectional lookups are covered

-- ─────────────────────────────────────────
-- AGENT_AUDIT_LOG: Recent audit queries for tracing
-- ─────────────────────────────────────────
-- Used by: AuditLogger and observability queries scanning recent logs
-- Before: sequential scan on full audit log
-- After: indexed lookup by job_id + created_at DESC for recent entries
CREATE INDEX IF NOT EXISTS idx_agent_audit_log_job_created
  ON agent_audit_log(job_id, created_at DESC);

-- ─────────────────────────────────────────
-- Recommendations for EXPLAIN ANALYZE validation
-- ─────────────────────────────────────────
-- After deployment, run these EXPLAIN ANALYZE traces on production-like workloads:
--
-- 1. Repository listing (pagination query with sort):
--    EXPLAIN ANALYZE
--    SELECT id, full_name, last_scanned_at, scan_count
--    FROM repositories
--    WHERE owner_id = $1
--    ORDER BY created_at DESC
--    LIMIT 20 OFFSET 0;
--
-- 2. Job history for a repo:
--    EXPLAIN ANALYZE
--    SELECT id, status, overall_confidence, created_at
--    FROM analysis_jobs
--    WHERE repository_id = $1 AND user_id = $2
--    ORDER BY created_at DESC
--    LIMIT 50;
--
-- 3. Dead code detection:
--    EXPLAIN ANALYZE
--    SELECT id, file_path, metrics
--    FROM graph_nodes
--    WHERE job_id = $1 AND is_dead_code = TRUE;
--
-- 4. Webhook repo lookup:
--    EXPLAIN ANALYZE
--    SELECT id, owner_id
--    FROM repositories
--    WHERE github_owner = $1 AND github_repo = $2;
--
-- Look for "Index Scan" or "Index Only Scan" in the plan output.
-- If still seeing "Seq Scan", verify the index was created and analyze the table.
