CREATE TABLE IF NOT EXISTS function_nodes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      UUID NOT NULL REFERENCES analysis_jobs(id) ON DELETE CASCADE,
  file_path   TEXT NOT NULL,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL,
  calls       JSONB NOT NULL DEFAULT '[]',
  loc         INTEGER,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (job_id, file_path, name)
);

CREATE INDEX IF NOT EXISTS idx_fn_nodes_job_file ON function_nodes(job_id, file_path);
