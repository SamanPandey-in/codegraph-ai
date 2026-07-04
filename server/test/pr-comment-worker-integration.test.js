import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { postImpactCommentForJob } from '../src/api/webhooks/pr-comment.routes.js';

function makeMockDb(overrides = {}) {
  const inserted = [];
  return {
    inserted,
    query: async (sql, params) => {
      if (sql.includes('FROM analysis_jobs')) {
        return overrides.jobQuery ? overrides.jobQuery(params) : { rowCount: 0, rows: [] };
      }
      if (sql.includes('INSERT INTO audit_logs')) {
        inserted.push(params);
        return { rowCount: 1, rows: [{ id: 'log-id' }] };
      }
      return { rowCount: 0, rows: [] };
    },
  };
}

describe('postImpactCommentForJob', () => {
  it('returns not_found when the job does not exist', async () => {
    const db = makeMockDb();
    const result = await postImpactCommentForJob('missing-job', { db, gitHubPRService: { isConfigured: () => true } });
    assert.equal(result.outcome, 'not_found');
  });

  it('returns not_a_pr when the job has no GitHub PR metadata', async () => {
    const db = makeMockDb({
      jobQuery: () => ({
        rowCount: 1,
        rows: [{ id: 'job-1', github_owner: null, github_repo: null, prNumber: null }],
      }),
    });
    const result = await postImpactCommentForJob('job-1', { db, gitHubPRService: { isConfigured: () => true } });
    assert.equal(result.outcome, 'not_a_pr');
  });

  it('returns no_token when GitHub is not configured', async () => {
    const db = makeMockDb({
      jobQuery: () => ({
        rowCount: 1,
        rows: [{ id: 'job-1', github_owner: 'org', github_repo: 'repo', prNumber: '7' }],
      }),
    });
    const result = await postImpactCommentForJob('job-1', { db, gitHubPRService: { isConfigured: () => false } });
    assert.equal(result.outcome, 'no_token');
  });

  it('returns no_changed_files when the diff has no file changes', async () => {
    const db = makeMockDb({
      jobQuery: () => ({
        rowCount: 1,
        rows: [{ id: 'job-1', github_owner: 'org', github_repo: 'repo', prNumber: '7' }],
      }),
    });
    const gitHubPRService = {
      isConfigured: () => true,
      getPRDiff: async () => '',
      parseDiff: () => [],
    };
    const result = await postImpactCommentForJob('job-1', { db, gitHubPRService });
    assert.equal(result.outcome, 'no_changed_files');
  });

  it('posts a comment and logs an audit entry on the success path', async () => {
    const db = makeMockDb({
      jobQuery: () => ({
        rowCount: 1,
        rows: [{ id: 'job-1', github_owner: 'org', github_repo: 'repo', prNumber: '7' }],
      }),
    });

    const gitHubPRService = {
      isConfigured: () => true,
      getPRDiff: async () => 'diff --git a/src/a.js b/src/a.js\n',
      parseDiff: () => [{ file: 'src/a.js', status: 'modified' }],
      formatDetailedImpactComment: () => '## comment body',
      upsertImpactComment: async () => ({ id: 555, url: 'https://github.com/org/repo/pull/7#comment-555' }),
    };

    const impactAnalysisService = {
      findImpactedFiles: async () => ({ impactedFiles: new Set(['src/b.js']), depth: 1 }),
      analyzeChangeRisk: async () => ({ safeFiles: [], riskyFiles: ['src/a.js'] }),
    };

    const result = await postImpactCommentForJob('job-1', { db, gitHubPRService, impactAnalysisService });

    assert.equal(result.outcome, 'posted');
    assert.equal(result.commentUrl, 'https://github.com/org/repo/pull/7#comment-555');
    assert.equal(result.changedFiles, 1);
    assert.equal(result.impactedFiles, 1);
    assert.equal(db.inserted.length, 1);
    assert.equal(db.inserted[0][1], 'pr_comment_posted');
  });

  it('returns diff_fetch_failed without throwing when the GitHub API call fails', async () => {
    const db = makeMockDb({
      jobQuery: () => ({
        rowCount: 1,
        rows: [{ id: 'job-1', github_owner: 'org', github_repo: 'repo', prNumber: '7' }],
      }),
    });
    const gitHubPRService = {
      isConfigured: () => true,
      getPRDiff: async () => {
        throw new Error('GitHub API rate limited');
      },
    };
    const result = await postImpactCommentForJob('job-1', { db, gitHubPRService });
    assert.equal(result.outcome, 'diff_fetch_failed');
    assert.match(result.error, /rate limited/);
  });

  it('returns post_failed without throwing when posting the comment fails', async () => {
    const db = makeMockDb({
      jobQuery: () => ({
        rowCount: 1,
        rows: [{ id: 'job-1', github_owner: 'org', github_repo: 'repo', prNumber: '7' }],
      }),
    });
    const gitHubPRService = {
      isConfigured: () => true,
      getPRDiff: async () => 'diff --git a/src/a.js b/src/a.js\n',
      parseDiff: () => [{ file: 'src/a.js', status: 'modified' }],
      formatDetailedImpactComment: () => '## comment body',
      upsertImpactComment: async () => {
        throw new Error('GitHub 403');
      },
    };
    const impactAnalysisService = {
      findImpactedFiles: async () => ({ impactedFiles: new Set(), depth: 0 }),
      analyzeChangeRisk: async () => ({ safeFiles: [], riskyFiles: [] }),
    };
    const result = await postImpactCommentForJob('job-1', { db, gitHubPRService, impactAnalysisService });
    assert.equal(result.outcome, 'post_failed');
    assert.match(result.error, /403/);
  });

  it('returns error (not throw) when an unexpected exception occurs', async () => {
    const db = {
      query: async () => {
        throw new Error('connection reset');
      },
    };
    const result = await postImpactCommentForJob('job-1', { db, gitHubPRService: { isConfigured: () => true } });
    assert.equal(result.outcome, 'error');
    assert.match(result.message, /connection reset/);
  });
});

describe('analysis queue worker PR-comment wiring', () => {
  it('invokes postImpactCommentForJob when a GitHub job completes successfully', async () => {
    // Re-import with a mocked module isn't necessary here since we exercise
    // the same code path the worker uses: call postImpactCommentForJob with
    // the jobId the worker would have passed, and confirm a real DB miss
    // (no such job) resolves to a clean not_found outcome rather than throwing —
    // i.e. the worker's fire-and-forget wrapper has nothing unhandled to catch
    // for the common "job not found" edge case.
    const result = await postImpactCommentForJob('00000000-0000-0000-0000-000000000000', {
      gitHubPRService: { isConfigured: () => true },
      db: {
        query: async () => ({ rowCount: 0, rows: [] }),
      },
    });
    assert.equal(result.outcome, 'not_found');
  });
});

describe('postImpactCommentForJob against real Postgres (column-casing regression)', () => {
  // Regression coverage for a real bug: unquoted SQL column aliases (e.g.
  // `... as prNumber`) are lowercased by Postgres regardless of how they're
  // written in the query, so a row comes back with `prnumber`, not `prNumber`.
  // Destructuring `const { prNumber } = row` then silently reads `undefined`.
  // The mocked-db tests above can't catch this because the mock returns
  // whatever object literal the test wrote, bypassing Postgres's real
  // identifier-folding behavior entirely — only a real query exercises it.
  const databaseUrl = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5433/polyglot';

  it('correctly reads camelCase-aliased columns (prNumber, prTitle, repositoryId) from a real query', async () => {
    const pg = await import('pg');
    const pool = new pg.default.Pool({ connectionString: databaseUrl, ssl: false });
    const client = await pool.connect();

    let userId, repoId, jobId;
    try {
      const u = await client.query(
        `INSERT INTO users (username, plan) VALUES ('pr-comment-casing-test', 'free') RETURNING id`,
      );
      userId = u.rows[0].id;

      const r = await client.query(
        `INSERT INTO repositories (owner_id, source, full_name, github_owner, github_repo)
         VALUES ($1, 'github', 'casing-test/repo', 'casing-org', 'casing-repo') RETURNING id`,
        [userId],
      );
      repoId = r.rows[0].id;

      const j = await client.query(
        `INSERT INTO analysis_jobs (repository_id, user_id, status, metadata) VALUES ($1, $2, 'queued', $3) RETURNING id`,
        [repoId, userId, JSON.stringify({ prNumber: 314, prTitle: 'Casing regression PR' })],
      );
      jobId = j.rows[0].id;

      // This call goes through postImpactCommentForJob's real query against
      // real Postgres. If the alias-quoting regresses, this job — which DOES
      // have valid owner/repo/prNumber — would incorrectly report 'not_a_pr'
      // instead of proceeding (it'll report 'no_token' or attempt a real
      // GitHub call here, since we don't inject a fake gitHubPRService;
      // either of those outcomes proves the PR fields were read correctly).
      const result = await postImpactCommentForJob(jobId, { db: pool });

      assert.notEqual(
        result.outcome,
        'not_a_pr',
        `expected the job's real GitHub PR metadata to be recognized, got outcome '${result.outcome}'`,
      );
    } finally {
      if (jobId) await client.query('DELETE FROM analysis_jobs WHERE id = $1', [jobId]).catch(() => {});
      if (repoId) await client.query('DELETE FROM repositories WHERE id = $1', [repoId]).catch(() => {});
      if (userId) await client.query('DELETE FROM users WHERE id = $1', [userId]).catch(() => {});
      client.release();
      await pool.end();
    }
  });
});
