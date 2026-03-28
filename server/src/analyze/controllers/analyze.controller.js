import {
  analyzeProject,
  validateLocalRepository,
} from '../services/analyze.service.js';
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

export async function analyzeController(req, res, next) {
  try {
    const result = await analyzeProject(req.body, req.cookies?.github_token);
    return res.status(200).json(result);
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
