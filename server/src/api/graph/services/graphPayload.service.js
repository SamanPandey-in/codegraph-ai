import { pgPool, redisClient } from '../../../infrastructure/connections.js';
import {
  buildGraphCacheKey,
  cacheTtl,
  readJsonCache,
  writeJsonCache,
} from '../../../infrastructure/cache.js';

export async function loadGraphPayloadByJobId(jobId) {
  const graphCacheKey = buildGraphCacheKey(jobId);
  const cachedGraph = await readJsonCache(redisClient, graphCacheKey);

  if (cachedGraph) {
    return {
      payload: cachedGraph,
      cacheStatus: 'HIT',
    };
  }

  const [nodesResult, edgesResult] = await Promise.all([
    pgPool.query(
      `
        SELECT file_path, file_type, declarations, metrics, is_dead_code, summary
        FROM graph_nodes
        WHERE job_id = $1
      `,
      [jobId],
    ),
    pgPool.query(
      `
        SELECT source_path, target_path, edge_type
        FROM graph_edges
        WHERE job_id = $1
      `,
      [jobId],
    ),
  ]);

  if (nodesResult.rowCount === 0 && edgesResult.rowCount === 0) {
    return {
      payload: null,
      cacheStatus: 'MISS',
    };
  }

  const depsBySource = new Map();
  const edges = edgesResult.rows.map((row) => {
    if (!depsBySource.has(row.source_path)) depsBySource.set(row.source_path, []);
    depsBySource.get(row.source_path).push(row.target_path);

    return {
      source: row.source_path,
      target: row.target_path,
      type: row.edge_type || 'import',
    };
  });

  const deadCodeCandidates = [];
  const graph = {};

  for (const node of nodesResult.rows) {
    if (node.is_dead_code) deadCodeCandidates.push(node.file_path);

    graph[node.file_path] = {
      deps: depsBySource.get(node.file_path) || [],
      type: node.file_type,
      declarations: node.declarations || [],
      metrics: node.metrics || {},
      summary: node.summary || null,
    };
  }

  const payload = {
    graph,
    edges,
    topology: {
      nodeCount: nodesResult.rowCount,
      edgeCount: edgesResult.rowCount,
      deadCodeCandidates,
    },
  };

  await writeJsonCache(redisClient, graphCacheKey, payload, cacheTtl.graphSeconds);

  return {
    payload,
    cacheStatus: 'MISS',
  };
}
