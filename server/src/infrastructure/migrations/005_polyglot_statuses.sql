DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'job_status' AND e.enumlabel = 'extracting-relationships'
  ) THEN
    ALTER TYPE job_status ADD VALUE 'extracting-relationships';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'job_status' AND e.enumlabel = 'seeding-neo4j'
  ) THEN
    ALTER TYPE job_status ADD VALUE 'seeding-neo4j';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'graph_edges_job_id_source_path_target_path_key'
  ) THEN
    ALTER TABLE graph_edges DROP CONSTRAINT graph_edges_job_id_source_path_target_path_key;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'graph_edges_job_id_source_path_target_path_edge_type_key'
  ) THEN
    ALTER TABLE graph_edges
      ADD CONSTRAINT graph_edges_job_id_source_path_target_path_edge_type_key
      UNIQUE (job_id, source_path, target_path, edge_type);
  END IF;
END $$;
