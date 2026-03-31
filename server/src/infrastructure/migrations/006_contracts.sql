DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'job_status' AND e.enumlabel = 'inferring-contracts'
  ) THEN
    ALTER TYPE job_status ADD VALUE 'inferring-contracts';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS api_contracts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id         UUID NOT NULL REFERENCES analysis_jobs(id) ON DELETE CASCADE,
  file_path      TEXT NOT NULL,
  routes         JSONB NOT NULL DEFAULT '[]',
  env_deps       JSONB NOT NULL DEFAULT '[]',
  ext_services   JSONB NOT NULL DEFAULT '[]',
  caching        JSONB NOT NULL DEFAULT '[]',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (job_id, file_path)
);

CREATE INDEX IF NOT EXISTS idx_contracts_job ON api_contracts(job_id);
