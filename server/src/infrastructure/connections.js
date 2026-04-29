import { Pool } from "pg";
import Redis from "ioredis";

const databaseUrl =
  process.env.DATABASE_URL ||
  "postgres://postgres:postgres@localhost:5433/codegraph";
const pgPoolMax = Number.parseInt(process.env.PG_POOL_MAX || "10", 10);

export const pgPool = new Pool({
  connectionString: databaseUrl,
  max: Number.isFinite(pgPoolMax) ? pgPoolMax : 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pgPool.on("connect", () => {
  console.log("Connected to Postgres");
});

pgPool.on("error", (err) => {
  console.error("Postgres pool error:", err);
});

const redisHost = process.env.REDIS_HOST || "127.0.0.1";
const redisPort = Number(process.env.REDIS_PORT || 6379);
const isTestRuntime =
  process.argv.includes("--test") || Boolean(process.env.VITEST);

const redisOptions = {
  maxRetriesPerRequest: null,
  lazyConnect: true,
  ...(isTestRuntime
    ? {
        retryStrategy: () => null,
      }
    : {}),
};

export const redisClient = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL, redisOptions)
  : new Redis({
      host: redisHost,
      port: redisPort,
      ...redisOptions,
    });

redisClient.on("connect", () => {
  console.log("Connected to Redis");
});

redisClient.on("error", (err) => {
  console.error("Redis error:", err);
});

export default {
  pgPool,
  redisClient,
};
