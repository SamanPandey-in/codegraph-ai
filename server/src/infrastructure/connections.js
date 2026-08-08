import { Pool } from 'pg';
import Redis from 'ioredis';
import { logger } from '../../utils/logger.js';

const databaseUrl =
  process.env.DATABASE_URL ||
  'postgres://postgres:postgres@localhost:5433/codegraph';

const pgPoolMax = Number.parseInt(process.env.PG_POOL_MAX || '10', 10);

/**
 * BUG 2 FIX: Supabase requires SSL on all connections.
 * Without ssl:{rejectUnauthorized:false}, the pg driver throws:
 *   "SSL SYSCALL error: EOF detected" or "ECONNRESET"
 * and every DB query fails immediately.
 *
 * Also: Supabase recommends pool max of 5 on the Session pooler to avoid
 * exhausting PgBouncer connection slots.
 */
const isSupabase = databaseUrl.includes('supabase.com');

const isTestRuntime = Boolean(process.env.VITEST);

let pgPool;
let redisClient;

if (isTestRuntime) {
  // Lightweight in-process mocks used during vitest unit test runs.
  pgPool = {
    query: async (sql) => {
      const s = String(sql || '').toLowerCase();
      if (s.includes('select count(*)')) return { rows: [{ total: 0 }] };
      if (s.includes('with latest_repo_jobs')) return { rows: [] };
      if (s.includes('select id') || s.includes('insert into users')) return { rows: [{ id: 'mock-user-id' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
    on: () => {},
    end: async () => {},
  };

  redisClient = {
    get: async () => null,
    set: async () => 'OK',
    del: async () => 1,
    on: () => {},
    quit: async () => {},
    disconnect: async () => {},
  };
} else {
  pgPool = new Pool({
    connectionString: databaseUrl,
    max:              isSupabase ? 5 : (Number.isFinite(pgPoolMax) ? pgPoolMax : 10),
    idleTimeoutMillis:       30_000,
    connectionTimeoutMillis: 10_000,
    // Supabase requires SSL; local Docker does not
    ssl: isSupabase ? { rejectUnauthorized: false } : false,
  });

  pgPool.on('connect', () => {
    logger.info('[Postgres] Connected');
  });

  pgPool.on('error', (err) => {
    logger.error('[Postgres] Pool error:', err.message);
  });

  // ── Redis ──────────────────────────────────────────────────────────────────
  const redisHost = process.env.REDIS_HOST || '127.0.0.1';
  const redisPort = Number(process.env.REDIS_PORT || 6379);

  const redisOptions = {
    maxRetriesPerRequest: null,
    lazyConnect: true,
    ...(isTestRuntime ? { retryStrategy: () => null } : {}),
  };

  redisClient = process.env.REDIS_URL
    ? new Redis(process.env.REDIS_URL, redisOptions)
    : new Redis({ host: redisHost, port: redisPort, ...redisOptions });

  redisClient.on('connect', () => {
    logger.info('[Redis] Connected');
  });

  redisClient.on('error', (err) => {
    logger.error('[Redis] Error:', err.message);
  });
}

export { pgPool, redisClient };
export default { pgPool, redisClient };
