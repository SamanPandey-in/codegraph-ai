import jwt from 'jsonwebtoken';
import { validateLocalRepository } from '../services/analyze.service.js';
import {
  getLocalPickerCapabilities,
  pickLocalDirectory,
} from '../services/localPicker.service.js';
import {
  fetchOwnedRepositories,
  fetchRepoBranches,
  fetchRepoDetails,
  parseGitHubRepoUrl,
  resolvePublicRepository,
} from '../services/githubApi.service.js';
import { pgPool } from '../../infrastructure/connections.js';
import { enqueueAnalysisJob } from '../../queue/analysisQueue.js';

function getAuthUserId(req) {
  const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  if (!process.env.JWT_SECRET) return null;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded?.id || null;
  } catch {
    return null;
  }
}

function buildRepositoryIdentity(input) {
  if (input?.source === 'local') {
    return {
      source: 'local',
      fullName: input.localPath,
      githubOwner: null,
      githubRepo: null,
      defaultBranch: null,
      branch: null,
    };
  }

  const github = input?.github || {};
  let owner = github.owner || null;
  let repo = github.repo || null;

  if ((!owner || !repo) && github.url) {
    const parsed = parseGitHubRepoUrl(github.url);
    owner = parsed.owner;
    repo = parsed.repo;
  }

  if (!owner || !repo) {
    const err = new Error('GitHub source requires owner/repo or a valid GitHub URL.');
    err.statusCode = 400;
    throw err;
  }

  return {
    source: 'github',
    fullName: `${owner}/${repo}`,
    githubOwner: owner,
    githubRepo: repo,
    defaultBranch: github.branch || null,
    branch: github.branch || null,
  };
}

async function createOrGetRepository({ userId, repository }) {
  const result = await pgPool.query(
    `
      INSERT INTO repositories (
        owner_id,
        source,
        full_name,
        github_owner,
        github_repo,
        default_branch,
        last_scanned_at,
        scan_count
      )
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), 1)
      ON CONFLICT (owner_id, full_name)
      DO UPDATE
      SET source = EXCLUDED.source,
          github_owner = COALESCE(EXCLUDED.github_owner, repositories.github_owner),
          github_repo = COALESCE(EXCLUDED.github_repo, repositories.github_repo),
          default_branch = COALESCE(EXCLUDED.default_branch, repositories.default_branch),
          last_scanned_at = NOW(),
          scan_count = repositories.scan_count + 1
      RETURNING id
    `,
    [
      userId,
      repository.source,
      repository.fullName,
      repository.githubOwner,
      repository.githubRepo,
      repository.defaultBranch,
    ],
  );

  return result.rows[0]?.id;
}

async function createAnalysisJob({ repositoryId, userId, branch }) {
  const result = await pgPool.query(
    `
      INSERT INTO analysis_jobs (repository_id, user_id, branch, status)
      VALUES ($1, $2, $3, 'queued')
      RETURNING id
    `,
    [repositoryId, userId, branch || null],
  );

  return result.rows[0]?.id;
}

export async function analyzeController(req, res, next) {
  try {
    const userId = getAuthUserId(req);
    if (!userId) {
      return res.status(401).json({
        error: 'Authentication required to start analysis jobs.',
      });
    }

    const repository = buildRepositoryIdentity(req.body);
    const repositoryId = await createOrGetRepository({ userId, repository });

    if (!repositoryId) {
      const err = new Error('Failed to resolve repository record for analysis job.');
      err.statusCode = 500;
      throw err;
    }

    const jobId = await createAnalysisJob({
      repositoryId,
      userId,
      branch: repository.branch,
    });

    if (!jobId) {
      const err = new Error('Failed to create analysis job.');
      err.statusCode = 500;
      throw err;
    }

    const queueInput = {
      ...req.body,
      repositoryId,
      userId,
      githubToken: req.cookies?.github_token,
    };

    await enqueueAnalysisJob({
      jobId,
      input: queueInput,
    });

    return res.status(202).json({ jobId });
  } catch (err) {
    return next(err);
  }
}

export async function validateLocalPathController(req, res, next) {
  try {
    const result = await validateLocalRepository(req.body.path);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

export async function browseLocalPathController(_req, res, next) {
  try {
    const selectedPath = await pickLocalDirectory();
    return res.status(200).json({ path: selectedPath });
  } catch (err) {
    return next(err);
  }
}

export async function localPickerCapabilitiesController(_req, res, next) {
  try {
    const capabilities = await getLocalPickerCapabilities();
    return res.status(200).json(capabilities);
  } catch (err) {
    return next(err);
  }
}

export async function resolvePublicRepoController(req, res, next) {
  try {
    const result = await resolvePublicRepository(req.body.url);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

export async function listOwnedReposController(req, res, next) {
  try {
    const result = await fetchOwnedRepositories({ token: req.cookies?.github_token });
    return res.status(200).json({
      repositories: result.repositories,
      scopes: result.scopes,
    });
  } catch (err) {
    if (err.statusCode === 401) {
      return res.status(401).json({
        error: err.message,
        loginUrl: '/api/auth/github?reauth=1',
        action:
          'Re-authenticate with GitHub. If this persists, revoke this app in GitHub Settings > Applications, then connect again.',
      });
    }

    if (err.statusCode === 403 && err.code === 'INSUFFICIENT_SCOPE') {
      return res.status(403).json({
        error: err.message,
        requiredScopes: err.requiredScopes,
        grantedScopes: err.grantedScopes,
        loginUrl: '/api/auth/github?reauth=1',
        action:
          'Grant the required scopes. If GitHub does not prompt for new scopes, revoke the app authorization in GitHub Settings > Applications and reconnect.',
      });
    }

    return next(err);
  }
}

export async function listBranchesController(req, res, next) {
  try {
    const source = req.query.source === 'owned' ? 'owned' : 'public';
    const token = source === 'owned' ? req.cookies?.github_token : undefined;

    const owner = typeof req.query.owner === 'string' ? req.query.owner.trim() : '';
    const repo = typeof req.query.repo === 'string' ? req.query.repo.trim() : '';

    let targetOwner = owner;
    let targetRepo = repo;

    if ((!targetOwner || !targetRepo) && typeof req.query.url === 'string') {
      const parsed = parseGitHubRepoUrl(req.query.url);
      targetOwner = parsed.owner;
      targetRepo = parsed.repo;
    }

    if (!targetOwner || !targetRepo) {
      const err = new Error('Branch lookup requires owner/repo or a valid GitHub URL.');
      err.statusCode = 400;
      throw err;
    }

    const [repoDetails, branches] = await Promise.all([
      fetchRepoDetails({ owner: targetOwner, repo: targetRepo, token }),
      fetchRepoBranches({ owner: targetOwner, repo: targetRepo, token }),
    ]);

    return res.status(200).json({
      repository: {
        owner: repoDetails.owner,
        repo: repoDetails.repo,
        fullName: repoDetails.fullName,
        defaultBranch: repoDetails.defaultBranch,
      },
      branches,
    });
  } catch (err) {
    return next(err);
  }
}
