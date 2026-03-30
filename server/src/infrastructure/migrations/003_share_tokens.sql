CREATE TABLE IF NOT EXISTS graph_shares (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id     UUID NOT NULL REFERENCES analysis_jobs(id) ON DELETE CASCADE,
  token      TEXT NOT NULL UNIQUE,
  visibility TEXT NOT NULL DEFAULT 'unlisted',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_graph_shares_token ON graph_shares(token);
