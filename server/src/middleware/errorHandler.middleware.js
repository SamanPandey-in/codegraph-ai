export function errorHandler(err, _req, res, _next) {
  const statusCode = err.statusCode ?? err.status ?? 500;

  const body = {
    error: err.message || 'Internal server error',
  };

  if (process.env.NODE_ENV === 'development' && err.stack) {
    body.stack = err.stack;
  }

  if (statusCode >= 500) {
    console.error('[error]', err);
  }

  return res.status(statusCode).json(body);
}
