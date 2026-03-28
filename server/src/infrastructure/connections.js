import { Pool } from 'pg';
import Redis from 'ioredis';

const databaseUrl = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5433/codegraph';

export const pgPool = new Pool({
	connectionString: databaseUrl,
	max: 10,
	idleTimeoutMillis: 30000,
});

pgPool.on('connect', () => {
	console.log('Connected to Postgres');
});

pgPool.on('error', (err) => {
	console.error('Postgres pool error:', err);
});

const redisHost = process.env.REDIS_HOST || '127.0.0.1';
const redisPort = Number(process.env.REDIS_PORT || 6379);

export const redisClient = process.env.REDIS_URL
	? new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null })
	: new Redis({
			host: redisHost,
			port: redisPort,
			maxRetriesPerRequest: null,
		});

redisClient.on('connect', () => {
	console.log('Connected to Redis');
});

redisClient.on('error', (err) => {
	console.error('Redis error:', err);
});

export default {
	pgPool,
	redisClient,
};
