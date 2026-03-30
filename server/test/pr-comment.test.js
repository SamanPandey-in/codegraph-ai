import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import prCommentRouter from '../src/api/webhooks/pr-comment.routes.js';
import GitHubPRService from '../src/services/GitHubPRService.js';

// Mock dependencies
const mockPgPool = {
  query: async (sql, params) => {
    // Mock job lookup
    if (sql.includes('FROM analysis_jobs')) {
      if (params[0] === 'valid-job-id') {
        return {
          rowCount: 1,
          rows: [
            {
              id: 'valid-job-id',
              status: 'complete',
              branch: 'feature/new-ui',
              repositoryId: 'repo-123',
              github_owner: 'myorg',
              github_repo: 'myrepo',
              prNumber: '42',
              prTitle: 'Add new UI',
            },
          ],
        };
      }
      return { rowCount: 0, rows: [] };
    }

    // Mock audit log insertion
    if (sql.includes('INSERT INTO audit_logs')) {
      return { rowCount: 1, rows: [{ id: 'log-id' }] };
    }

    return { rowCount: 0, rows: [] };
  },
};

describe('PR Comment Posting', () => {
  let app;

  before(() => {
    process.env.CLIENT_URL = 'http://localhost:5173';
    process.env.GITHUB_TOKEN = 'test-token';

    app = express();
    app.use(express.json());
    app.use('/api/webhooks/github', prCommentRouter);
  });

  describe('POST /api/webhooks/github/pr-comment', () => {
    it('requires jobId parameter', async () => {
      const response = await request(app).post('/api/webhooks/github/pr-comment').send({});

      assert.equal(response.status, 400);
      assert.match(response.text, /jobId/i);
    });

    it('returns 404 when job not found', async () => {
      const response = await request(app)
        .post('/api/webhooks/github/pr-comment')
        .send({ jobId: 'invalid-job-id' });

      assert.equal(response.status, 404);
      assert.match(response.text, /not found/i);
    });

    it('skips comment posting when not a GitHub PR', async () => {
      const response = await request(app)
        .post('/api/webhooks/github/pr-comment')
        .send({ jobId: 'non-github-job' });

      assert.equal(response.status, 200);
      assert.match(response.text, /Not a GitHub PR/i);
    });

    it('handles missing GitHub token gracefully', async () => {
      const oldToken = process.env.GITHUB_TOKEN;
      delete process.env.GITHUB_TOKEN;

      const response = await request(app)
        .post('/api/webhooks/github/pr-comment')
        .send({ jobId: 'valid-job-id' });

      assert.equal(response.status, 200);
      assert.match(response.text, /GitHub token/i);

      process.env.GITHUB_TOKEN = oldToken;
    });
  });

  describe('GET /api/webhooks/github/pr-status/:prNumber', () => {
    it('requires owner, repo, and prNumber parameters', async () => {
      const response = await request(app)
        .get('/api/webhooks/github/pr-status/42')
        .query({});

      assert.equal(response.status, 400);
      assert.match(response.text, /required/i);
    });

    it('returns 503 when GitHub token not configured', async () => {
      const oldToken = process.env.GITHUB_TOKEN;
      delete process.env.GITHUB_TOKEN;

      const response = await request(app)
        .get('/api/webhooks/github/pr-status/42')
        .query({ owner: 'myorg', repo: 'myrepo' });

      assert.equal(response.status, 503);

      process.env.GITHUB_TOKEN = oldToken;
    });
  });
});

describe('GitHubPRService', () => {
  describe('parseDiff', () => {
    it('extracts changed files from diff', () => {
      const diff = `diff --git a/src/app.js b/src/app.js
index 1234567..abcdefg 100644
--- a/src/app.js
+++ b/src/app.js
@@ -1,5 +1,6 @@
 const express = require('express');
+const newLib = require('new-lib');

diff --git a/src/config.js b/src/config.js
new file mode 100644
index 0000000..1234567
--- /dev/null
+++ b/src/config.js
@@ -0,0 +1,3 @@
+module.exports = {
+  apiUrl: 'http://localhost:3000'
+};
`;

      const files = GitHubPRService.parseDiff(diff);

      assert.equal(files.length, 2);
      assert.ok(files.some((f) => f.file === 'src/app.js'));
      assert.ok(files.some((f) => f.file === 'src/config.js'));
    });

    it('returns empty array for empty diff', () => {
      const files = GitHubPRService.parseDiff('');
      assert.equal(files.length, 0);
    });

    it('handles diffs without file changes', () => {
      const diff = `
Some text without proper diff format
`;
      const files = GitHubPRService.parseDiff(diff);
      assert.equal(files.length, 0);
    });
  });

  describe('formatImpactComment', () => {
    it('formats impact comment with changed and impacted files', () => {
      const changed = ['src/auth.js', 'src/config.js'];
      const impacted = ['src/api.js', 'src/middleware.js', 'src/controllers/user.js'];
      const graphUrl = 'http://localhost:5173/?jobId=123';

      const comment = GitHubPRService.formatImpactComment(changed, impacted, graphUrl);

      assert.match(comment, /CodeGraph Impact Analysis/);
      assert.match(comment, /Changed Files \(2\)/);
      assert.match(comment, /Potentially Impacted Files \(3\)/);
      assert.match(comment, /src\/auth\.js/);
      assert.match(comment, /src\/api\.js/);
      assert.match(comment, /View Full Graph/);
    });

    it('handles empty impacted files list', () => {
      const changed = ['src/util.js'];
      const impacted = [];
      const graphUrl = 'http://localhost:5173/?jobId=123';

      const comment = GitHubPRService.formatImpactComment(changed, impacted, graphUrl);

      assert.match(comment, /isolated change/i);
    });

    it('truncates large file lists', () => {
      const changed = Array.from({ length: 30 }, (_, i) => `file${i}.js`);
      const impacted = Array.from({ length: 30 }, (_, i) => `impacted${i}.js`);
      const graphUrl = 'http://localhost:5173/?jobId=123';

      const comment = GitHubPRService.formatImpactComment(changed, impacted, graphUrl);

      assert.match(comment, /and \d+ more/); // Should have "and X more"
    });

    it('includes timestamp in comment', () => {
      const changed = ['src/app.js'];
      const impacted = [];
      const graphUrl = 'http://localhost:5173/?jobId=123';

      const comment = GitHubPRService.formatImpactComment(changed, impacted, graphUrl);

      assert.match(comment, /\d{4}-\d{2}-\d{2}T/); // ISO date format
    });
  });

  describe('configuration', () => {
    it('detects when GitHub token is configured', () => {
      const oldToken = process.env.GITHUB_TOKEN;
      process.env.GITHUB_TOKEN = 'test-token';

      const service = require('../src/services/GitHubPRService.js').default;
      assert.equal(service.isConfigured(), true);

      process.env.GITHUB_TOKEN = oldToken;
    });

    it('detects when GitHub token is missing', () => {
      const oldToken = process.env.GITHUB_TOKEN;
      delete process.env.GITHUB_TOKEN;

      const service = require('../src/services/GitHubPRService.js').default;
      assert.equal(service.isConfigured(), false);

      process.env.GITHUB_TOKEN = oldToken;
    });
  });
});
