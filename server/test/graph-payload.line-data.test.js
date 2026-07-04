import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5433/polyglot';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

let pgPool;
let redisClient;
let loadGraphPayloadByJobId;
let buildGraphCacheKey;

const userId = 'a1d4f6d7-31e1-4d9f-8575-b9e5428eb001';
const repositoryId = 'b2c4ef2f-019e-41fd-b6f1-9652d4a7c002';
const jobId = 'c14882a4-f885-4488-8afb-7b15a2c3d003';

before(async () => {
  ({ pgPool, redisClient } = await import('../src/infrastructure/connections.js'));
  ({ loadGraphPayloadByJobId } = await import('../src/api/graph/services/graphPayload.service.js'));
  ({ buildGraphCacheKey } = await import('../src/infrastructure/cache.js'));

  await pgPool.query(
    `INSERT INTO users (id, username, email) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
    [userId, 'line-data-user', 'line-data@example.com'],
  );
  await pgPool.query(
    `INSERT INTO repositories (id, owner_id, source, full_name) VALUES ($1, $2, 'local', 'line-data/repo') ON CONFLICT DO NOTHING`,
    [repositoryId, userId],
  );
  await pgPool.query(
    `INSERT INTO analysis_jobs (id, repository_id, user_id, status) VALUES ($1, $2, $3, 'completed') ON CONFLICT (id) DO NOTHING`,
    [jobId, repositoryId, userId],
  );
  await pgPool.query(
    `INSERT INTO graph_nodes (job_id, file_path, file_type, declarations, metrics)
     VALUES
       ($1, 'src/a.js', 'module', '[]'::jsonb, '{}'::jsonb),
       ($1, 'src/b.js', 'module', '[]'::jsonb, '{}'::jsonb)
     ON CONFLICT (job_id, file_path) DO NOTHING`,
    [jobId],
  );
  await pgPool.query(
    `INSERT INTO graph_edges (job_id, source_path, target_path, edge_type, source_lines, target_lines)
     VALUES ($1, 'src/a.js', 'src/b.js', 'IMPORTS', '[3, 3]'::jsonb, '[1, 1]'::jsonb)
     ON CONFLICT (job_id, source_path, target_path, edge_type) DO UPDATE
       SET source_lines = EXCLUDED.source_lines, target_lines = EXCLUDED.target_lines`,
    [jobId],
  );

  // Ensure no stale cached payload from a prior run (different shape) is served.
  // Uses the real cache-key builder rather than a guessed format, since the
  // cache module applies a version prefix (e.g. "cache:v1:graph:job:<id>").
  await redisClient.del(buildGraphCacheKey(jobId)).catch(() => {});
});

after(async () => {
  await redisClient.del(buildGraphCacheKey(jobId)).catch(() => {});
  await pgPool.query('DELETE FROM graph_edges WHERE job_id = $1', [jobId]);
  await pgPool.query('DELETE FROM graph_nodes WHERE job_id = $1', [jobId]);
  await pgPool.query('DELETE FROM analysis_jobs WHERE id = $1', [jobId]);
  await pgPool.query('DELETE FROM repositories WHERE id = $1', [repositoryId]);
  await pgPool.query('DELETE FROM users WHERE id = $1', [userId]);
  await redisClient.quit().catch(() => {});
  await pgPool.end().catch(() => {});
});

test('loadGraphPayloadByJobId includes source_lines/target_lines on edges for line-level highlighting', async () => {
  const { payload, cacheStatus } = await loadGraphPayloadByJobId(jobId);

  assert.ok(payload, 'expected a graph payload to be returned');
  assert.equal(cacheStatus, 'MISS');
  assert.equal(Array.isArray(payload.edges), true);
  assert.equal(payload.edges.length, 1);

  const [edge] = payload.edges;
  assert.equal(edge.source, 'src/a.js');
  assert.equal(edge.target, 'src/b.js');
  assert.equal(edge.type, 'IMPORTS');
  assert.deepEqual(edge.source_lines, [3, 3]);
  assert.deepEqual(edge.target_lines, [1, 1]);
});

test('loadGraphPayloadByJobId returns null line ranges for edges without line metadata', async () => {
  const otherJobId = 'd25893b5-f996-5599-9b0c-8c26b3d4e004';

  await pgPool.query(
    `INSERT INTO analysis_jobs (id, repository_id, user_id, status) VALUES ($1, $2, $3, 'completed') ON CONFLICT (id) DO NOTHING`,
    [otherJobId, repositoryId, userId],
  );
  await pgPool.query(
    `INSERT INTO graph_nodes (job_id, file_path, file_type, declarations, metrics)
     VALUES ($1, 'src/c.js', 'module', '[]'::jsonb, '{}'::jsonb)
     ON CONFLICT (job_id, file_path) DO NOTHING`,
    [otherJobId],
  );
  await pgPool.query(
    `INSERT INTO graph_edges (job_id, source_path, target_path, edge_type)
     VALUES ($1, 'src/c.js', 'symbol:helper', 'EXPOSES_API')
     ON CONFLICT (job_id, source_path, target_path, edge_type) DO NOTHING`,
    [otherJobId],
  );
  await redisClient.del(buildGraphCacheKey(otherJobId)).catch(() => {});

  try {
    const { payload } = await loadGraphPayloadByJobId(otherJobId);
    assert.equal(payload.edges.length, 1);
    assert.equal(payload.edges[0].source_lines, null);
    assert.equal(payload.edges[0].target_lines, null);
  } finally {
    await redisClient.del(buildGraphCacheKey(otherJobId)).catch(() => {});
    await pgPool.query('DELETE FROM graph_edges WHERE job_id = $1', [otherJobId]);
    await pgPool.query('DELETE FROM graph_nodes WHERE job_id = $1', [otherJobId]);
    await pgPool.query('DELETE FROM analysis_jobs WHERE id = $1', [otherJobId]);
  }
});
