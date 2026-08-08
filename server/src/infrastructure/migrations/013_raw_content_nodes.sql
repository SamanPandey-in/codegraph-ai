-- Migration 013: Phase B raw source persistence and chunk-level RAG
-- Safe to run after 010_raw_content.sql; raw_content remains nullable for old rows.

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE graph_nodes
  ADD COLUMN IF NOT EXISTS raw_content TEXT;

CREATE TABLE IF NOT EXISTS code_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES analysis_jobs(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  start_line INTEGER,
  end_line INTEGER,
  content TEXT NOT NULL,
  embedding vector(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, file_path, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_code_chunks_job_file
  ON code_chunks(job_id, file_path);

CREATE INDEX IF NOT EXISTS idx_code_chunks_ivfflat
  ON code_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
