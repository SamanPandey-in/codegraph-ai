export function validateAnalyzeBody(req, _res, next) {
  const { path: projectPath } = req.body ?? {};

  if (!projectPath || typeof projectPath !== 'string' || !projectPath.trim()) {
    const err = new Error(
      'Request body must include a non-empty "path" string.',
    );
    err.statusCode = 400;
    return next(err);
  }

  req.body.path = projectPath.trim();
  return next();
}
