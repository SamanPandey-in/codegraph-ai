import { Router } from 'express';
import crypto from 'node:crypto';
import { pgPool } from '../../../infrastructure/connections.js';
import { loadGraphPayloadByJobId } from '../services/graphPayload.service.js';

const router = Router();

const SHARE_VISIBILITY = new Set(['unlisted', 'public']);

function buildShareUrl(token) {
  const baseUrl = String(process.env.CLIENT_URL || 'http://localhost:5173').trim();

  try {
    const url = new URL('/graph', baseUrl);
    url.searchParams.set('share', token);
    return url.toString();
  } catch {
    return `/graph?share=${encodeURIComponent(token)}`;
  }
}

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

router.post('/:jobId/share', async (req, res, next) => {
  const { jobId } = req.params;
  const visibility = String(req.body?.visibility || 'unlisted').trim().toLowerCase();
  const expiresAtInput = req.body?.expiresAt;

  if (!jobId) {
    return res.status(400).json({ error: 'jobId is required.' });
  }

  if (!SHARE_VISIBILITY.has(visibility)) {
    return res.status(400).json({ error: 'visibility must be either unlisted or public.' });
  }

  let expiresAt = null;
  if (expiresAtInput !== undefined && expiresAtInput !== null && String(expiresAtInput).trim() !== '') {
    const parsed = new Date(expiresAtInput);
    if (Number.isNaN(parsed.getTime())) {
      return res.status(400).json({ error: 'expiresAt must be a valid ISO date string.' });
    }
    expiresAt = parsed.toISOString();
  }

  const token = crypto.randomBytes(24).toString('base64url');

  try {
    const inserted = await pgPool.query(
      `
        INSERT INTO graph_shares (job_id, token, visibility, expires_at)
        VALUES ($1, $2, $3, $4)
        RETURNING token, visibility, expires_at
      `,
      [jobId, token, visibility, expiresAt],
    );

    return res.status(201).json({
      token: inserted.rows[0].token,
      visibility: inserted.rows[0].visibility,
      expiresAt: inserted.rows[0].expires_at,
      shareUrl: buildShareUrl(inserted.rows[0].token),
    });
  } catch (error) {
    if (error?.code === '23503') {
      return res.status(404).json({ error: 'Analysis job not found.' });
    }
    return next(error);
  }
});

router.get('/:jobId', async (req, res, next) => {
  const { jobId } = req.params;

  if (!jobId) {
    return res.status(400).json({ error: 'jobId is required.' });
  }

  try {
    const { payload, cacheStatus } = await loadGraphPayloadByJobId(jobId);

    if (!payload) {
      return res.status(404).json({ error: 'No graph data found for this job.' });
    }

    res.setHeader('X-Cache', cacheStatus);
    return res.status(200).json(payload);
  } catch (error) {
    return next(error);
  }
});

export default router;
