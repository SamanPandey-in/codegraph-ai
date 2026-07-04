import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import GitHubPRService from '../../services/GitHubPRService.js';
import ImpactAnalysisService from '../../services/ImpactAnalysisService.js';
import { logger } from '../../utils/logger.js';

const prCommentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many PR comment requests. Please try again later.' },
});

/**
 * Core logic for posting (or updating) a PR impact-analysis comment for a
 * completed analysis job. Used by the `/pr-comment` HTTP route below, and
 * also called directly by the analysis queue worker once a GitHub-triggered
 * job finishes — no internal HTTP round-trip needed for that case.
 *
 * Returns a plain result object describing what happened; never throws for
 * expected "nothing to do" cases (no PR, no token, no diff, no changes) —
 * those are reported via `result.outcome` so callers can log/branch on them
 * without try/catch noise. Unexpected errors are caught and also reported
 * via `outcome: 'error'` rather than thrown, since this is best-effort
 * enrichment that should never take down the caller (HTTP request or queue
 * worker) it's attached to.
 *
 * @param {string} jobId
 * @param {{ db?: object, gitHubPRService?: object, impactAnalysisService?: object }} [deps]
 */
export async function postImpactCommentForJob(jobId, deps = {}) {
  const resolvedGitHubPRService = deps.gitHubPRService || GitHubPRService;
  const resolvedImpactAnalysisService = deps.impactAnalysisService || ImpactAnalysisService;

  let resolvedDb = deps.db;
  if (!resolvedDb) {
    const { pgPool } = await import('../../infrastructure/connections.js');
    resolvedDb = pgPool;
  }

  try {
    const jobResult = await resolvedDb.query(
      `
        SELECT aj.id, aj.status, aj.branch,
               r.id as "repositoryId", r.github_owner, r.github_repo,
               aj.metadata ->> 'prNumber' as "prNumber",
               aj.metadata ->> 'prTitle' as "prTitle"
        FROM analysis_jobs aj
        JOIN repositories r ON aj.repository_id = r.id
        WHERE aj.id = $1
      `,
      [jobId],
    );

    if (jobResult.rowCount === 0) {
      return { outcome: 'not_found', message: 'Job not found' };
    }

    const job = jobResult.rows[0];
    const { github_owner: owner, github_repo: repo, prNumber } = job;

    if (!owner || !repo || !prNumber) {
      return { outcome: 'not_a_pr', message: 'Not a GitHub PR, skipping comment' };
    }

    if (!resolvedGitHubPRService.isConfigured()) {
      logger.warn('GitHub token not configured, skipping PR comment');
      return { outcome: 'no_token', message: 'GitHub token not configured' };
    }

    let diff;
    try {
      diff = await resolvedGitHubPRService.getPRDiff(owner, repo, parseInt(prNumber, 10));
    } catch (err) {
      logger.error('Failed to fetch PR diff:', err.message);
      return { outcome: 'diff_fetch_failed', message: 'Failed to fetch PR diff', error: err.message };
    }

    const changedFiles = resolvedGitHubPRService.parseDiff(diff).map((f) => f.file);

    if (changedFiles.length === 0) {
      logger.info('No changed files found in diff');
      return { outcome: 'no_changed_files', message: 'No changed files in diff' };
    }

    const [impactResult, riskResult] = await Promise.all([
      resolvedImpactAnalysisService.findImpactedFiles(jobId, changedFiles, 3),
      resolvedImpactAnalysisService.analyzeChangeRisk(jobId, changedFiles),
    ]);

    const { impactedFiles: impactedSet, depth } = impactResult;
    const impactedFiles = Array.from(impactedSet).sort();

    const graphUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/?jobId=${jobId}`;
    const comment = resolvedGitHubPRService.formatDetailedImpactComment(
      changedFiles,
      impactedFiles,
      graphUrl,
      riskResult,
    );

    let posted;
    try {
      posted = await resolvedGitHubPRService.upsertImpactComment(
        owner,
        repo,
        parseInt(prNumber, 10),
        comment,
      );
      logger.info(`Upserted PR comment on ${owner}/${repo}#${prNumber}`);
    } catch (err) {
      logger.error('Failed to post/update PR comment:', err.message);
      return { outcome: 'post_failed', message: 'Analysis complete but failed to post comment', error: err.message };
    }

    await resolvedDb.query(
      `
        INSERT INTO audit_logs (job_id, event_type, message, metadata)
        VALUES ($1, $2, $3, $4)
      `,
      [
        jobId,
        'pr_comment_posted',
        `Posted impact analysis comment to ${owner}/${repo}#${prNumber}`,
        JSON.stringify({
          commentUrl: posted.url,
          changedFilesCount: changedFiles.length,
          impactedFilesCount: impactedFiles.length,
          analysisDepth: depth,
        }),
      ],
    );

    return {
      outcome: 'posted',
      commentUrl: posted.url,
      changedFiles: changedFiles.length,
      impactedFiles: impactedFiles.length,
    };
  } catch (error) {
    logger.error('PR comment posting failed:', error);
    return { outcome: 'error', message: error.message };
  }
}

/**
 * Factory that builds the PR-comment router with injectable dependencies.
 * When called without arguments it falls back to the production singletons.
 */
export function createPrCommentRouter({
  db,
  gitHubPRService,
} = {}) {
  const router = Router();
  let resolvedDb = db;
  const resolvedGitHubPRService =
    gitHubPRService || (typeof GitHubPRService === 'function' ? new GitHubPRService() : GitHubPRService);

  async function resolveDb() {
    if (!resolvedDb) {
      const { pgPool } = await import('../../infrastructure/connections.js');
      resolvedDb = pgPool;
    }
  }

  /**
   * POST /api/webhooks/github/pr-comment
   * Post impact analysis comment to a PR after analysis completes
   *
   * This is also called directly (no HTTP) by the analysis queue worker once
   * SupervisorAgent finishes a GitHub-triggered job; this route exists for
   * manual/external triggering of the same logic (e.g. retrying a comment
   * post for a job that finished before this feature existed).
   * It fetches the PR diff, identifies changed files, finds impacted graph files,
   * and posts a comment with the impact analysis.
   */
  router.post('/pr-comment', prCommentLimiter, async (req, res, next) => {
    const { jobId } = req.body;

    if (!jobId) {
      return res.status(400).json({ error: 'jobId is required' });
    }

    try {
      await resolveDb();

      const result = await postImpactCommentForJob(jobId, {
        db: resolvedDb,
        gitHubPRService: resolvedGitHubPRService,
      });

      switch (result.outcome) {
        case 'not_found':
          return res.status(404).json({ error: result.message });
        case 'not_a_pr':
        case 'no_token':
        case 'no_changed_files':
        case 'diff_fetch_failed':
        case 'post_failed':
          return res.status(200).json({ message: result.message, error: result.error });
        case 'posted':
          return res.json({
            success: true,
            commentUrl: result.commentUrl,
            changedFiles: result.changedFiles,
            impactedFiles: result.impactedFiles,
          });
        default:
          return next(new Error(result.message || 'PR comment posting failed'));
      }
    } catch (error) {
      logger.error('PR comment posting failed:', error);
      return next(error);
    }
  });

  /**
   * GET /api/webhooks/github/pr-status/:prNumber
   * Check if comment has been posted for a PR
   */
  router.get('/pr-status/:prNumber', async (req, res, next) => {
    const { prNumber } = req.params;
    const { owner, repo } = req.query;

    if (!owner || !repo || !prNumber) {
      return res.status(400).json({ error: 'owner, repo, and prNumber are required' });
    }

    try {
      if (!resolvedGitHubPRService.isConfigured()) {
        return res.status(503).json({ error: 'GitHub token not configured' });
      }

      const existing = await resolvedGitHubPRService.findExistingComment(
        owner,
        repo,
        parseInt(prNumber, 10),
      );

      return res.json({
        hasComment: !!existing,
        commentId: existing?.id || null,
      });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}

export default createPrCommentRouter();
