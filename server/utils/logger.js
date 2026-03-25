/**
 * Simple request logger middleware.
 * Logs the HTTP method, URL and response time for every request.
 */
export function requestLogger(req, _res, next) {
  const start = Date.now();
  const { method, url } = req;
  console.log(`→ ${method} ${url}`);
  _res.on('finish', () => {
    console.log(`← ${method} ${url} ${_res.statusCode} (${Date.now() - start}ms)`);
  });
  next();
}
