import { Router } from 'express';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { QueryAgent } from '../../../agents/query/QueryAgent.js';
import { AnalysisAgent } from '../../../agents/analysis/AnalysisAgent.js';
import { pgPool, redisClient } from '../../../infrastructure/connections.js';

const router = Router();

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.AI_RATE_LIMIT_PER_MINUTE || 30),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many AI requests. Please wait a moment and try again.' },
});

function getAuthUserId(req) {
  const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
  if (!token || !process.env.JWT_SECRET) return null;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded?.id || null;
  } catch {
    return null;
  }
}

function toGraphFromRows(nodeRows = [], edgeRows = []) {
  const depsBySource = new Map();

  for (const row of edgeRows) {
    if (!depsBySource.has(row.source_path)) depsBySource.set(row.source_path, []);
    depsBySource.get(row.source_path).push(row.target_path);
  }

  const graph = {};

  for (const node of nodeRows) {
    graph[node.file_path] = {
      deps: depsBySource.get(node.file_path) || [],
      type: node.file_type,
      declarations: node.declarations || [],
      metrics: node.metrics || {},
      summary: node.summary || null,
    };
  }

  return graph;
}

router.use(aiLimiter);

router.post('/query', async (req, res, next) => {
  const userId = getAuthUserId(req);
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const question = String(req.body?.question || '').trim();
  const jobId = String(req.body?.jobId || '').trim();

  if (!question || !jobId) {
    return res.status(400).json({ error: 'question and jobId are required.' });
  }

  try {
    const agent = new QueryAgent({ db: pgPool, redis: redisClient });
    const result = await agent.process({ question, jobId, userId }, { jobId });

    if (result.status === 'failed') {
      return res.status(400).json({
        error: result.errors?.[0]?.message || 'Unable to process query.',
        details: result.errors || [],
      });
    }

    return res.status(200).json(result.data);
  } catch (error) {
    return next(error);
  }
});

router.post('/impact', async (req, res, next) => {
  const userId = getAuthUserId(req);
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const jobId = String(req.body?.jobId || '').trim();
  const filePath = String(req.body?.filePath || '').trim();

  if (!jobId || !filePath) {
    return res.status(400).json({ error: 'jobId and filePath are required.' });
  }

  try {
    const [nodesResult, edgesResult] = await Promise.all([
      pgPool.query(
        `
          SELECT file_path, file_type, declarations, metrics, summary
          FROM graph_nodes
          WHERE job_id = $1
        `,
        [jobId],
      ),
      pgPool.query(
        `
          SELECT source_path, target_path
          FROM graph_edges
          WHERE job_id = $1
        `,
        [jobId],
      ),
    ]);

    if (nodesResult.rowCount === 0) {
      return res.status(404).json({ error: 'No graph data found for this job.' });
    }

    const graph = toGraphFromRows(nodesResult.rows, edgesResult.rows);
    if (!graph[filePath]) {
      return res.status(404).json({ error: 'filePath not found in this job graph.' });
    }

    const edges = edgesResult.rows.map((row) => ({
      source: row.source_path,
      target: row.target_path,
    }));

    const analysisAgent = new AnalysisAgent();
    const result = await analysisAgent.process({ graph, edges, filePath }, { jobId });

    if (result.status === 'failed') {
      return res.status(400).json({
        error: result.errors?.[0]?.message || 'Unable to compute impact.',
        details: result.errors || [],
      });
    }

    return res.status(200).json({
      filePath,
      affectedFiles: result.data?.impactedFiles || [],
      deadCodeCandidates: result.data?.deadCodeCandidates || [],
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
