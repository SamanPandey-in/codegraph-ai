import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import request from 'supertest';
import githubWebhookRouter from '../src/api/webhooks/github.webhook.js';
import * as Queue from 'bullmq';

// Mock dependencies
const mockEnqueueAnalysisJob = async ({ jobId, input }) => {
  if (!jobId) throw new Error('jobId required');
  return { success: true, jobId };
};

// Mock pgPool
const mockPgPool = {
  query: async (sql, params) => {
    // Mock repository lookup
    if (sql.includes('FROM repositories')) {
      if (params[0] === 'valid-owner' && params[1] === 'valid-repo') {
        return {
          rowCount: 1,
          rows: [{ id: 'repo-123', owner_id: 'user-456' }],
        };
      }
      return { rowCount: 0, rows: [] };
    }

    // Mock job insertion
    if (sql.includes('INSERT INTO analysis_jobs')) {
      return {
        rowCount: 1,
        rows: [{ id: 'job-789' }],
      };
    }

    return { rowCount: 0, rows: [] };
  },
};

// Helper to sign webhook payload
function signPayload(payload, secret) {
  const body = JSON.stringify(payload);
  const signature = `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
  return { body, signature };
}

describe('GitHub Webhook Integration', () => {
  let app;
  const SECRET = 'test-webhook-secret';

  before(() => {
    process.env.GITHUB_WEBHOOK_SECRET = SECRET;

    app = express();
    // Middleware setup for webhook
    app.use('/api/webhooks/github', express.raw({ type: 'application/json' }));
    app.use(express.json());

    // Mock the module dependencies by patching the router's dependencies
    app.use('/api/webhooks', githubWebhookRouter);
  });

  it('accepts valid pull_request webhook with correct signature', async () => {
    const payload = {
      action: 'opened',
      pull_request: {
        head: { ref: 'feature/new-ui' },
      },
      repository: {
        name: 'valid-repo',
        owner: { login: 'valid-owner' },
      },
    };

    const { body, signature } = signPayload(payload, SECRET);

    const response = await request(app)
      .post('/api/webhooks/github')
      .set('x-github-event', 'pull_request')
      .set('x-hub-signature-256', signature)
      .set('Content-Type', 'application/json')
      .send(body);

    assert.equal(response.status, 200);
  });

  it('rejects webhook with invalid signature', async () => {
    const payload = {
      action: 'opened',
      pull_request: {
        head: { ref: 'feature/new-ui' },
      },
      repository: {
        name: 'valid-repo',
        owner: { login: 'valid-owner' },
      },
    };

    const { body } = signPayload(payload, SECRET);
    const invalidSignature = 'sha256=badbadbadbadbadbadbadbadbadbadbadbadbad';

    const response = await request(app)
      .post('/api/webhooks/github')
      .set('x-github-event', 'pull_request')
      .set('x-hub-signature-256', invalidSignature)
      .set('Content-Type', 'application/json')
      .send(body);

    assert.equal(response.status, 401);
  });

  it('rejects webhook when GITHUB_WEBHOOK_SECRET is not configured', async () => {
    const oldSecret = process.env.GITHUB_WEBHOOK_SECRET;
    delete process.env.GITHUB_WEBHOOK_SECRET;

    const payload = {
      action: 'opened',
      pull_request: {
        head: { ref: 'feature/new-ui' },
      },
      repository: {
        name: 'valid-repo',
        owner: { login: 'valid-owner' },
      },
    };

    const { body, signature } = signPayload(payload, SECRET);

    const response = await request(app)
      .post('/api/webhooks/github')
      .set('x-github-event', 'pull_request')
      .set('x-hub-signature-256', signature)
      .set('Content-Type', 'application/json')
      .send(body);

    assert.equal(response.status, 503);

    process.env.GITHUB_WEBHOOK_SECRET = oldSecret;
  });

  it('ignores non-pull_request events', async () => {
    const payload = {
      action: 'opened',
      repository: { name: 'valid-repo', owner: { login: 'valid-owner' } },
    };

    const { body, signature } = signPayload(payload, SECRET);

    const response = await request(app)
      .post('/api/webhooks/github')
      .set('x-github-event', 'push')
      .set('x-hub-signature-256', signature)
      .set('Content-Type', 'application/json')
      .send(body);

    assert.equal(response.status, 200);
    assert.match(response.text, /Ignored/);
  });

  it('ignores PR actions other than opened/synchronize', async () => {
    const payload = {
      action: 'closed',
      pull_request: {
        head: { ref: 'feature' },
      },
      repository: {
        name: 'valid-repo',
        owner: { login: 'valid-owner' },
      },
    };

    const { body, signature } = signPayload(payload, SECRET);

    const response = await request(app)
      .post('/api/webhooks/github')
      .set('x-github-event', 'pull_request')
      .set('x-hub-signature-256', signature)
      .set('Content-Type', 'application/json')
      .send(body);

    assert.equal(response.status, 200);
    assert.match(response.text, /Ignored/);
  });

  it('rejects malformed JSON payload', async () => {
    const invalidBody = 'not-json';
    const signature = `sha256=${crypto
      .createHmac('sha256', SECRET)
      .update(invalidBody)
      .digest('hex')}`;

    const response = await request(app)
      .post('/api/webhooks/github')
      .set('x-github-event', 'pull_request')
      .set('x-hub-signature-256', signature)
      .set('Content-Type', 'application/json')
      .send(invalidBody);

    assert.equal(response.status, 400);
  });

  it('rejects webhook with missing payload fields', async () => {
    const payload = {
      action: 'opened',
      pull_request: {
        // missing head.ref
      },
      repository: {
        name: 'valid-repo',
        owner: { login: 'valid-owner' },
      },
    };

    const { body, signature } = signPayload(payload, SECRET);

    const response = await request(app)
      .post('/api/webhooks/github')
      .set('x-github-event', 'pull_request')
      .set('x-hub-signature-256', signature)
      .set('Content-Type', 'application/json')
      .send(body);

    assert.equal(response.status, 400);
    assert.match(response.text, /Invalid pull request payload/);
  });

  it('responds gracefully when repository is not tracked', async () => {
    const payload = {
      action: 'opened',
      pull_request: {
        head: { ref: 'feature' },
      },
      repository: {
        name: 'untracked-repo',
        owner: { login: 'unknown-owner' },
      },
    };

    const { body, signature } = signPayload(payload, SECRET);

    const response = await request(app)
      .post('/api/webhooks/github')
      .set('x-github-event', 'pull_request')
      .set('x-hub-signature-256', signature)
      .set('Content-Type', 'application/json')
      .send(body);

    assert.equal(response.status, 200);
    assert.match(response.text, /Repository not tracked/);
  });

  it('handles synchronize action on existing PR', async () => {
    const payload = {
      action: 'synchronize',
      pull_request: {
        head: { ref: 'feature/new-commit' },
      },
      repository: {
        name: 'valid-repo',
        owner: { login: 'valid-owner' },
      },
    };

    const { body, signature } = signPayload(payload, SECRET);

    const response = await request(app)
      .post('/api/webhooks/github')
      .set('x-github-event', 'pull_request')
      .set('x-hub-signature-256', signature)
      .set('Content-Type', 'application/json')
      .send(body);

    assert.equal(response.status, 200);
  });

  it('handles timing-safe signature comparison correctly', async () => {
    const payload = {
      action: 'opened',
      pull_request: {
        head: { ref: 'feature' },
      },
      repository: {
        name: 'valid-repo',
        owner: { login: 'valid-owner' },
      },
    };

    const { body } = signPayload(payload, SECRET);

    // Test signature with different lengths
    const shortSignature = 'sha256=short';

    const response = await request(app)
      .post('/api/webhooks/github')
      .set('x-github-event', 'pull_request')
      .set('x-hub-signature-256', shortSignature)
      .set('Content-Type', 'application/json')
      .send(body);

    assert.equal(response.status, 401);
  });
});
