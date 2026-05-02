import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import * as Sentry from '@sentry/node';
import { startAnalysisWorker } from './src/queue/analysisQueue.js';
import { startCacheMetricsPersistence } from './src/infrastructure/cache.js';
import { bootstrapGraphInfrastructure } from './src/infrastructure/db/startup.js';
import { pgPool, redisClient } from './src/infrastructure/connections.js';
import { closeNeo4jDriver } from './src/infrastructure/db/neo4jDriver.js'; // BUG FIX

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn:              process.env.SENTRY_DSN,
    environment:      process.env.NODE_ENV || 'development',
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.1),
  });
}

const { default: app } = await import('./app.js');

const PORT = process.env.PORT || 5000;

// ── Graceful shutdown ─────────────────────────────────────────────────────
// BUG FIX: Neo4j driver must be closed on SIGTERM/SIGINT to avoid
// connection pool leaks. All three resources close in parallel.

let isShuttingDown = false;

async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`[Shutdown] Received ${signal} — closing connections gracefully...`);

  await Promise.allSettled([
    pgPool.end().then(() => console.log('[Shutdown] Postgres pool closed')),
    redisClient.quit().then(() => console.log('[Shutdown] Redis client closed')),
    closeNeo4jDriver().then(() => console.log('[Shutdown] Neo4j driver closed')),
  ]);

  console.log('[Shutdown] Done.');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

// ── Startup ───────────────────────────────────────────────────────────────
// bootstrapGraphInfrastructure():
//   1. Verifies Postgres connectivity (fatal if down)
//   2. Verifies Neo4j connectivity (non-fatal — falls back to Postgres)
//   3. Runs Neo4j migrations at startup (BUG 8 FIX — not inside per-job pipeline)
await bootstrapGraphInfrastructure();

startAnalysisWorker();
startCacheMetricsPersistence();

app.listen(PORT, () => {
  console.log(
    `[Server] Running on http://localhost:${PORT} (${process.env.NODE_ENV || 'development'})`,
  );
});
