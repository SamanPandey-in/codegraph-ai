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

export function validateRepoBrowserQuery(req, _res, next) {
  const hasOwner = isNonEmptyString(req.query?.owner);
  const hasRepo = isNonEmptyString(req.query?.repo);
  const hasUrl = isNonEmptyString(req.query?.url);

  if (!hasUrl && !(hasOwner && hasRepo)) {
    return fail(next, 'Repository query requires owner/repo or a valid GitHub URL.');
  }

  if (hasOwner) req.query.owner = req.query.owner.trim();
  if (hasRepo) req.query.repo = req.query.repo.trim();
  if (hasUrl) req.query.url = req.query.url.trim();

  if (isNonEmptyString(req.query?.branch)) {
    req.query.branch = req.query.branch.trim();
  }

  if (isNonEmptyString(req.query?.path)) {
    req.query.path = req.query.path.trim().replace(/^\/+/, '').replace(/\/+$/, '');
  }

  return next();
}

export function validateRepoFileQuery(req, _res, next) {
  const hasOwner = isNonEmptyString(req.query?.owner);
  const hasRepo = isNonEmptyString(req.query?.repo);
  const hasUrl = isNonEmptyString(req.query?.url);
  const hasPath = isNonEmptyString(req.query?.path);

  if (!hasPath) {
    return fail(next, 'Repository file query requires a non-empty "path" value.');
  }

  if (!hasUrl && !(hasOwner && hasRepo)) {
    return fail(next, 'Repository file query requires owner/repo or a valid GitHub URL.');
  }

  if (hasOwner) req.query.owner = req.query.owner.trim();
  if (hasRepo) req.query.repo = req.query.repo.trim();
  if (hasUrl) req.query.url = req.query.url.trim();
  req.query.path = req.query.path.trim().replace(/^\/+/, '').replace(/\/+$/, '');

  if (isNonEmptyString(req.query?.branch)) {
    req.query.branch = req.query.branch.trim();
  }

  return next();
}

export function validateRepoFileUpdateBody(req, _res, next) {
  const body = req.body ?? {};

  const hasOwner = isNonEmptyString(body.owner);
  const hasRepo = isNonEmptyString(body.repo);
  const hasUrl = isNonEmptyString(body.url);

  if (!hasUrl && !(hasOwner && hasRepo)) {
    return fail(next, 'Repository file update requires owner/repo or a valid GitHub URL.');
  }

  if (!isNonEmptyString(body.path)) {
    return fail(next, 'Repository file update requires a non-empty "path" string.');
  }

  if (typeof body.content !== 'string') {
    return fail(next, 'Repository file update requires "content" as a string.');
  }

  if (!isNonEmptyString(body.sha)) {
    return fail(next, 'Repository file update requires a non-empty "sha" string.');
  }

  req.body = {
    source: body.source === 'owned' ? 'owned' : 'public',
    ...(hasOwner ? { owner: body.owner.trim() } : {}),
    ...(hasRepo ? { repo: body.repo.trim() } : {}),
    ...(hasUrl ? { url: body.url.trim() } : {}),
    path: body.path.trim().replace(/^\/+/, '').replace(/\/+$/, ''),
    content: body.content,
    sha: body.sha.trim(),
    ...(isNonEmptyString(body.branch) ? { branch: body.branch.trim() } : {}),
    ...(isNonEmptyString(body.message) ? { message: body.message.trim() } : {}),
  };

  return next();
}
