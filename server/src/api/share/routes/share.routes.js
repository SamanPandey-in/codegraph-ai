import { Router } from 'express';
import { pgPool } from '../../../infrastructure/connections.js';
import { loadGraphPayloadByJobId } from '../../graph/services/graphPayload.service.js';

const router = Router();

router.get('/share/:token', async (req, res, next) => {
  const token = String(req.params?.token || '').trim();

  if (!token) {
    return res.status(400).json({ error: 'token is required.' });
  }

  try {
    const shareResult = await pgPool.query(
      `
        SELECT job_id, visibility, expires_at
        FROM graph_shares
        WHERE token = $1
          AND (expires_at IS NULL OR expires_at > NOW())
        LIMIT 1
      `,
      [token],
    );

    if (shareResult.rowCount === 0) {
      return res.status(404).json({ error: 'Share link not found or expired.' });
    }

    const share = shareResult.rows[0];
    const { payload, cacheStatus } = await loadGraphPayloadByJobId(share.job_id);

    if (!payload) {
      return res.status(404).json({ error: 'No graph data found for this share link.' });
    }

    res.setHeader('X-Cache', cacheStatus);
    return res.status(200).json({
      ...payload,
      jobId: share.job_id,
      share: {
        visibility: share.visibility,
        expiresAt: share.expires_at,
      },
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
