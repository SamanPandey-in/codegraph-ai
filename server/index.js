import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import * as Sentry from '@sentry/node';
import { startAnalysisWorker } from './src/queue/analysisQueue.js';
import { startCacheMetricsPersistence } from './src/infrastructure/cache.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.1),
  });
}

const { default: app } = await import('./app.js');

const PORT = process.env.PORT || 5000;

startAnalysisWorker();
startCacheMetricsPersistence();

app.listen(PORT, () => {
  console.log(`[server] Running on http://localhost:${PORT} (${process.env.NODE_ENV || 'development'})`);
});
