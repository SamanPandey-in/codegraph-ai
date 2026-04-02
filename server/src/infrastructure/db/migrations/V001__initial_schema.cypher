// V001__initial_schema.cypher

CREATE CONSTRAINT codefile_unique IF NOT EXISTS
FOR (f:CodeFile) REQUIRE (f.jobId, f.path) IS NODE KEY

CREATE CONSTRAINT symbol_unique IF NOT EXISTS
FOR (s:Symbol) REQUIRE (s.jobId, s.filePath, s.name, s.kind) IS NODE KEY

CREATE CONSTRAINT job_unique IF NOT EXISTS
FOR (j:AnalysisJob) REQUIRE j.jobId IS UNIQUE

CREATE INDEX codefile_jobId IF NOT EXISTS
FOR (f:CodeFile) ON (f.jobId)

CREATE INDEX codefile_type IF NOT EXISTS
FOR (f:CodeFile) ON (f.type)

CREATE INDEX codefile_dead IF NOT EXISTS
FOR (f:CodeFile) ON (f.isDead)

CREATE INDEX symbol_name IF NOT EXISTS
FOR (s:Symbol) ON (s.name)
