import { Router } from 'express';
import { pgPool, redisClient } from '../../../infrastructure/connections.js';
import {
  buildGraphCacheKey,
  cacheTtl,
  readJsonCache,
  writeJsonCache,
} from '../../../infrastructure/cache.js';

const router = Router();

router.get('/:jobId/functions/*filePath', async (req, res, next) => {
  const { jobId } = req.params;
  const wildcardPath = req.params?.filePath;
  const rawFilePath = Array.isArray(wildcardPath)
    ? wildcardPath.join('/')
    : String(wildcardPath || '').trim();

  if (!jobId) {
    return res.status(400).json({ error: 'jobId is required.' });
  }

  if (!rawFilePath) {
    return res.status(400).json({ error: 'filePath is required.' });
  }

  let filePath = rawFilePath;

  try {
    filePath = decodeURIComponent(rawFilePath);
  } catch {
    filePath = rawFilePath;
  }

  try {
    const result = await pgPool.query(
      `
        SELECT name, kind, calls, loc
        FROM function_nodes
        WHERE job_id = $1 AND file_path = $2
        ORDER BY name ASC
      `,
      [jobId, filePath],
    );

    return res.status(200).json(
      result.rows.map((row) => ({
        name: row.name,
        kind: row.kind,
        calls: Array.isArray(row.calls) ? row.calls : [],
        loc: Number.isFinite(row.loc) ? row.loc : null,
      })),
    );
  } catch (error) {
    return next(error);
  }
});

router.get('/:jobId', async (req, res, next) => {
  const { jobId } = req.params;

  if (!jobId) {
    return res.status(400).json({ error: 'jobId is required.' });
  }

  try {
    const graphCacheKey = buildGraphCacheKey(jobId);
    const cachedGraph = await readJsonCache(redisClient, graphCacheKey);
    if (cachedGraph) {
      res.setHeader('X-Cache', 'HIT');
      return res.status(200).json(cachedGraph);
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
      return res.status(404).json({ error: 'No graph data found for this job.' });
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

    const responsePayload = {
      graph,
      edges,
      topology: {
        nodeCount: nodesResult.rowCount,
        edgeCount: edgesResult.rowCount,
        deadCodeCandidates,
      },
    };

    await writeJsonCache(
      redisClient,
      graphCacheKey,
      responsePayload,
      cacheTtl.graphSeconds,
    );

    res.setHeader('X-Cache', 'MISS');
    return res.status(200).json(responsePayload);
  } catch (error) {
    return next(error);
  }
});

export default router;
