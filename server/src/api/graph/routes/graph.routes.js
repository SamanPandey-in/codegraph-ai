import { Router } from 'express';
import { pgPool } from '../../../infrastructure/connections.js';

const router = Router();

router.get('/:jobId', async (req, res, next) => {
  const { jobId } = req.params;

  if (!jobId) {
    return res.status(400).json({ error: 'jobId is required.' });
  }

  try {
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

    return res.status(200).json({
      graph,
      edges,
      topology: {
        nodeCount: nodesResult.rowCount,
        edgeCount: edgesResult.rowCount,
        deadCodeCandidates,
      },
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
