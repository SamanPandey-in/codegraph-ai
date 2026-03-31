import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import GitHubPRService from '../../services/GitHubPRService.js';
import ImpactAnalysisService from '../../services/ImpactAnalysisService.js';

const prCommentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many PR comment requests. Please try again later.' },
});

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
   * This is called by the analysis pipeline after SupervisorAgent finishes.
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

      // Fetch job metadata and PR info
      const jobResult = await resolvedDb.query(
        `
          SELECT aj.id, aj.status, aj.branch,
                 r.id as repositoryId, r.github_owner, r.github_repo,
                 aj.metadata ->> 'prNumber' as prNumber,
                 aj.metadata ->> 'prTitle' as prTitle
          FROM analysis_jobs aj
          JOIN repositories r ON aj.repository_id = r.id
          WHERE aj.id = $1
        `,
        [jobId],
      );

      if (jobResult.rowCount === 0) {
        return res.status(404).json({ error: 'Job not found' });
      }

      const job = jobResult.rows[0];
      const { github_owner: owner, github_repo: repo, prNumber } = job;

      // Only post comments for GitHub PRs
      if (!owner || !repo || !prNumber) {
        return res.status(200).json({ message: 'Not a GitHub PR, skipping comment' });
      }

      // Check if GitHub token is configured
      if (!resolvedGitHubPRService.isConfigured()) {
        console.warn('GitHub token not configured, skipping PR comment');
        return res.status(200).json({ message: 'GitHub token not configured' });
      }

      // Get PR diff
      let diff;
      try {
        diff = await resolvedGitHubPRService.getPRDiff(owner, repo, parseInt(prNumber, 10));
      } catch (err) {
        console.error('Failed to fetch PR diff:', err.message);
        return res.status(200).json({ message: 'Failed to fetch PR diff', error: err.message });
      }

      // Parse changed files from diff
      const changedFiles = resolvedGitHubPRService.parseDiff(diff).map((f) => f.file);

      if (changedFiles.length === 0) {
        console.log('No changed files found in diff');
        return res.status(200).json({ message: 'No changed files in diff' });
      }

      // Find impacted files in code graph
      const { impactedFiles: impactedSet, depth } = await ImpactAnalysisService.findImpactedFiles(
        jobId,
        changedFiles,
        3, // max depth
      );

      const impactedFiles = Array.from(impactedSet).sort();

      // Format impact comment
      const graphUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/?jobId=${jobId}`;
      const comment = resolvedGitHubPRService.formatImpactComment(changedFiles, impactedFiles, graphUrl);

      // Check if comment already exists
      let existingComment;
      try {
        existingComment = await resolvedGitHubPRService.findExistingComment(
          owner,
          repo,
          parseInt(prNumber, 10),
        );
      } catch (err) {
        console.error('Failed to find existing comment:', err.message);
      }

      // Post or update comment
      let result;
      try {
        if (existingComment) {
          result = await resolvedGitHubPRService.updatePRComment(
            owner,
            repo,
            existingComment.id,
            comment,
          );
          console.log(`Updated PR comment #${existingComment.id} on ${owner}/${repo}#${prNumber}`);
        } else {
          result = await resolvedGitHubPRService.postPRComment(
            owner,
            repo,
            parseInt(prNumber, 10),
            comment,
          );
          console.log(`Posted PR comment on ${owner}/${repo}#${prNumber}`);
        }
      } catch (err) {
        console.error('Failed to post/update PR comment:', err.message);
        return res.status(200).json({
          message: 'Analysis complete but failed to post comment',
          error: err.message,
        });
      }

      // Log the event
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
            commentUrl: result.url,
            changedFilesCount: changedFiles.length,
            impactedFilesCount: impactedFiles.length,
            analysisDepth: depth,
          }),
        ],
      );

      return res.json({
        success: true,
        commentUrl: result.url,
        changedFiles: changedFiles.length,
        impactedFiles: impactedFiles.length,
      });
    } catch (error) {
      console.error('PR comment posting failed:', error);
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
