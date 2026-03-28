function fail(next, message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return next(err);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function validateAnalyzeBody(req, _res, next) {
  const body = req.body ?? {};

  if (isNonEmptyString(body.path)) {
    req.body = {
      source: 'local',
      localPath: body.path.trim(),
    };
    return next();
  }

  const { source } = body;

  if (source === 'local') {
    if (!isNonEmptyString(body.localPath)) {
      return fail(next, 'Local source requires a non-empty "localPath" string.');
    }

    req.body = {
      source: 'local',
      localPath: body.localPath.trim(),
    };

    return next();
  }

  if (source === 'github') {
    const github = body.github ?? {};
    const mode = github.mode === 'owned' ? 'owned' : 'public';

    if (!isNonEmptyString(github.url) && !(isNonEmptyString(github.owner) && isNonEmptyString(github.repo))) {
      return fail(next, 'GitHub source requires "github.url" or both "github.owner" and "github.repo".');
    }

    req.body = {
      source: 'github',
      github: {
        mode,
        ...(isNonEmptyString(github.url) ? { url: github.url.trim() } : {}),
        ...(isNonEmptyString(github.owner) ? { owner: github.owner.trim() } : {}),
        ...(isNonEmptyString(github.repo) ? { repo: github.repo.trim() } : {}),
        ...(isNonEmptyString(github.branch) ? { branch: github.branch.trim() } : {}),
      },
    };

    return next();
  }

  return fail(
    next,
    'Request body must include source configuration: { source: "local", localPath } or { source: "github", github: { ... } }.',
  );
}

export function validateLocalPathBody(req, _res, next) {
  if (!isNonEmptyString(req.body?.path)) {
    return fail(next, 'Request body must include a non-empty "path" string.');
  }

  req.body.path = req.body.path.trim();
  return next();
}

export function validatePublicRepoBody(req, _res, next) {
  if (!isNonEmptyString(req.body?.url)) {
    return fail(next, 'Request body must include a non-empty "url" string.');
  }

  req.body.url = req.body.url.trim();
  return next();
}

export function validateBranchQuery(req, _res, next) {
  const hasUrl = isNonEmptyString(req.query?.url);
  const hasOwner = isNonEmptyString(req.query?.owner);
  const hasRepo = isNonEmptyString(req.query?.repo);

  if (!hasUrl && !(hasOwner && hasRepo)) {
    return fail(next, 'Branch query requires owner/repo or a valid GitHub URL.');
  }

  if (hasUrl) req.query.url = req.query.url.trim();
  if (hasOwner) req.query.owner = req.query.owner.trim();
  if (hasRepo) req.query.repo = req.query.repo.trim();

  return next();
}
