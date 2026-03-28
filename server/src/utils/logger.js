export function requestLogger(req, res, next) {
  const start  = Date.now();
  const { method, originalUrl } = req;
  const isDev  = process.env.NODE_ENV !== 'production';

  if (isDev) {
    process.stdout.write(`→ ${method} ${originalUrl}\n`);
  }

  res.on('finish', () => {
    const ms     = Date.now() - start;
    const status = res.statusCode;

    if (isDev || status >= 400) {
      const line = `← ${method} ${originalUrl} ${status} (${ms}ms)`;
      if (status >= 500)      process.stderr.write(`[error] ${line}\n`);
      else if (status >= 400) process.stderr.write(`[warn]  ${line}\n`);
      else                    process.stdout.write(`        ${line}\n`);
    }
  });

  next();
}
