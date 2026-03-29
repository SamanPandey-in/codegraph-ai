import { Router } from 'express';
import { pgPool, redisClient } from '../../../infrastructure/connections.js';

const router = Router();

router.get('/:jobId/stream', async (req, res, next) => {
  const { jobId } = req.params;

  if (!jobId) {
    return res.status(400).json({ error: 'jobId is required.' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  const subscriber = redisClient.duplicate();
  const channel = `job:${jobId}`;

  let closed = false;

  const closeStream = async () => {
    if (closed) return;
    closed = true;

    try {
      await subscriber.unsubscribe(channel);
    } catch {
      // Ignore unsubscribe errors during shutdown.
    }

    try {
      subscriber.disconnect();
    } catch {
      // Ignore disconnect errors during shutdown.
    }

    if (!res.writableEnded) {
      res.end();
    }
  };

  try {
    const jobQuery = await pgPool.query(
      `
        SELECT id, status, overall_confidence, file_count, node_count, edge_count, error_summary, agent_trace
        FROM analysis_jobs
        WHERE id = $1
      `,
      [jobId],
    );

    if (jobQuery.rowCount === 0) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: 'Job not found.' })}\n\n`);
      await closeStream();
      return;
    }

    const job = jobQuery.rows[0];
    res.write(
      `data: ${JSON.stringify({
        jobId,
        status: job.status,
        overallConfidence: job.overall_confidence,
        fileCount: job.file_count,
        nodeCount: job.node_count,
        edgeCount: job.edge_count,
        errorSummary: job.error_summary,
        agentTrace: job.agent_trace || [],
      })}\n\n`,
    );

    if (['completed', 'failed', 'partial'].includes(job.status)) {
      await closeStream();
      return;
    }

    await subscriber.subscribe(channel);

    subscriber.on('message', async (_subscribedChannel, message) => {
      if (_subscribedChannel !== channel) return;

      res.write(`data: ${message}\n\n`);

      try {
        const parsed = JSON.parse(message);
        if (['completed', 'failed', 'partial'].includes(parsed.status)) {
          await closeStream();
        }
      } catch {
        // If payload is not JSON, keep stream open.
      }
    });

    req.on('close', closeStream);
  } catch (error) {
    await closeStream();
    return next(error);
  }
});

export default router;
