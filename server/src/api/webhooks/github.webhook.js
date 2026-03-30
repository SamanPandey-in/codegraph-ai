import crypto from 'node:crypto';
import { Router } from 'express';
import { pgPool } from '../../infrastructure/connections.js';
import { enqueueAnalysisJob } from '../../queue/analysisQueue.js';

const router = Router();

function timingSafeCompare(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));

  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function verifySignature(payloadBuffer, signatureHeader, secret) {
  if (!payloadBuffer || !signatureHeader || !secret) return false;

  const expected = `sha256=${crypto
    .createHmac('sha256', secret)
    .update(payloadBuffer)
    .digest('hex')}`;

  return timingSafeCompare(signatureHeader, expected);
}

function logWebhookEvent(level, message, context = {}) {
  const timestamp = new Date().toISOString();
  const logContext = {
    timestamp,
    component: 'github-webhook',
    ...context,
  };

  if (level === 'error') {
    console.error(`[webhook:error] ${message}`, logContext);
  } else if (level === 'warn') {
    console.warn(`[webhook:warn] ${message}`, logContext);
  } else {
    console.log(`[webhook:info] ${message}`, logContext);
  }
}

router.post('/github', async (req, res, next) => {
  const startTime = Date.now();
  const signature = req.headers['x-github-signature-256'];
  const event = String(req.headers['x-github-event'] || '').trim();
  const deliveryId = req.headers['x-github-delivery'];
  const secret = process.env.GITHUB_WEBHOOK_SECRET;

  if (!secret) {
    logWebhookEvent('warn', 'Webhook secret not configured', {
      event,
      deliveryId,
    });
    return res.status(503).json({ error: 'Webhook secret is not configured.' });
  }

  const rawBody = Buffer.isBuffer(req.body)
    ? req.body
    : Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}));

  if (!verifySignature(rawBody, signature, secret)) {
    logWebhookEvent('warn', 'Invalid signature', {
      event,
      deliveryId,
      signatureLength: String(signature || '').length,
    });
    return res.status(401).send('Invalid signature');
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch (parseErr) {
    logWebhookEvent('error', 'Failed to parse JSON payload', {
      event,
      deliveryId,
      error: parseErr.message,
    });
    return res.status(400).send('Invalid JSON payload');
  }

  if (event !== 'pull_request') {
    logWebhookEvent('info', `Ignoring non-PR event`, {
      event,
      deliveryId,
    });
    return res.status(200).send('Ignored');
  }

  const action = payload?.action;
  if (!['opened', 'synchronize'].includes(action)) {
    logWebhookEvent('info', `Ignoring PR action: ${action}`, {
      event,
      deliveryId,
      action,
    });
    return res.status(200).send('Ignored');
  }

  try {
    const owner = payload?.repository?.owner?.login;
    const repo = payload?.repository?.name;
    const branch = payload?.pull_request?.head?.ref;
    const prNumber = payload?.pull_request?.number;
    const prTitle = payload?.pull_request?.title;

    logWebhookEvent('info', `Processing PR ${action}`, {
      event,
      deliveryId,
      action,
      owner,
      repo,
      branch,
      prNumber,
      prTitle,
    });

    if (!owner || !repo || !branch) {
      logWebhookEvent('warn', 'Invalid PR payload structure', {
        event,
        deliveryId,
        action,
        owner: owner ? '✓' : '✗',
        repo: repo ? '✓' : '✗',
        branch: branch ? '✓' : '✗',
      });
      return res.status(400).json({ error: 'Invalid pull request payload.' });
    }

    const repoResult = await pgPool.query(
      `
        SELECT id, owner_id
        FROM repositories
        WHERE github_owner = $1 AND github_repo = $2
        LIMIT 1
      `,
      [owner, repo],
    );

    if (repoResult.rowCount === 0) {
      logWebhookEvent('info', 'Repository not tracked in CodeGraph', {
        event,
        deliveryId,
        owner,
        repo,
        branch,
      });
      return res.status(200).send('Repository not tracked');
    }

    const { id: repositoryId, owner_id: userId } = repoResult.rows[0];

    const jobResult = await pgPool.query(
      `
        INSERT INTO analysis_jobs (repository_id, user_id, branch, status)
        VALUES ($1, $2, $3, 'queued')
        RETURNING id
      `,
      [repositoryId, userId, branch],
    );

    const jobId = jobResult.rows[0].id;
    
    await enqueueAnalysisJob({
      jobId,
      input: {
        source: 'github',
        github: {
          owner,
          repo,
          branch,
          prNumber,
          prTitle,
        },
        repositoryId,
        userId,
      },
    });

    const processingTime = Date.now() - startTime;
    logWebhookEvent('info', `Analysis job queued successfully`, {
      event,
      deliveryId,
      action,
      jobId,
      owner,
      repo,
      branch,
      prNumber,
      processingTimeMs: processingTime,
    });

    return res.status(200).send('Queued');
  } catch (error) {
    const processingTime = Date.now() - startTime;
    logWebhookEvent('error', `Failed to process webhook: ${error.message}`, {
      event,
      deliveryId,
      action,
      error: error.message,
      processingTimeMs: processingTime,
      stack: error.stack,
    });
    return next(error);
  }
});

export default router;
