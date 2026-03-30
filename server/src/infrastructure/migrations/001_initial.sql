-- ─────────────────────────────────────────
-- USERS
-- ─────────────────────────────────────────
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  github_id     TEXT UNIQUE,
  username      TEXT NOT NULL,
  email         TEXT,
  avatar_url    TEXT,
  plan          TEXT NOT NULL DEFAULT 'free',   -- all features currently available on free
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- REPOSITORIES (one record per unique repo ever scanned)
-- ─────────────────────────────────────────
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

-- ─────────────────────────────────────────
-- ANALYSIS JOBS (one per scan run)
-- ─────────────────────────────────────────
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

-- ─────────────────────────────────────────
-- GRAPH NODES (files)
-- ─────────────────────────────────────────
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

-- ─────────────────────────────────────────
-- GRAPH EDGES (import relationships)
-- ─────────────────────────────────────────
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

-- ─────────────────────────────────────────
-- VECTOR EMBEDDINGS (for semantic NLQ)
-- ─────────────────────────────────────────
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

-- ─────────────────────────────────────────
-- SAVED QUERIES (user's NLQ history per repo)
-- ─────────────────────────────────────────
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

-- ─────────────────────────────────────────
-- AGENT AUDIT LOG (immutable trace)
-- ─────────────────────────────────────────
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