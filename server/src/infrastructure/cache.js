const ANALYSIS_HISTORY_CACHE_TTL_SECONDS = Number.parseInt(
  process.env.ANALYSIS_HISTORY_CACHE_TTL_SECONDS || '60',
  10,
);

const GRAPH_CACHE_TTL_SECONDS = Number.parseInt(
  process.env.GRAPH_CACHE_TTL_SECONDS || '300',
  10,
);

const CACHE_VERSION = 'v1';

function withVersion(key) {
  return `cache:${CACHE_VERSION}:${key}`;
}

function normalizedTtl(ttlSeconds, fallback) {
  if (Number.isFinite(ttlSeconds) && ttlSeconds > 0) return ttlSeconds;
  return fallback;
}

function ttlWithJitter(ttlSeconds) {
  const base = normalizedTtl(ttlSeconds, 60);
  const jitter = Math.floor(base * 0.1 * Math.random());
  return base + jitter;
}

export function buildAnalysisHistoryCacheKey({ userId, page, limit }) {
  return withVersion(`analysis-history:user:${userId}:page:${page}:limit:${limit}`);
}

export function buildGraphCacheKey(jobId) {
  return withVersion(`graph:job:${jobId}`);
}

export async function readJsonCache(redis, key) {
  if (!redis || typeof redis.get !== 'function') return null;

  try {
    const raw = await redis.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function writeJsonCache(redis, key, payload, ttlSeconds) {
  if (!redis || typeof redis.set !== 'function') return;

  try {
    const ttl = ttlWithJitter(ttlSeconds);
    await redis.set(key, JSON.stringify(payload), 'EX', ttl);
  } catch {
    // Cache writes are best-effort.
  }
}

export async function deleteCacheKey(redis, key) {
  if (!redis || typeof redis.del !== 'function') return;

  try {
    await redis.del(key);
  } catch {
    // Cache invalidation is best-effort.
  }
}

export async function deleteByPattern(redis, pattern) {
  if (!redis || typeof redis.scan !== 'function' || typeof redis.del !== 'function') return;

  let cursor = '0';

  try {
    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;

      if (Array.isArray(keys) && keys.length > 0) {
        await redis.del(...keys);
      }
    } while (cursor !== '0');
  } catch {
    // Cache invalidation is best-effort.
  }
}

export async function invalidateAnalysisHistoryCacheForUser(redis, userId) {
  if (!userId) return;
  await deleteByPattern(redis, withVersion(`analysis-history:user:${userId}:*`));
}

export const cacheTtl = {
  analysisHistorySeconds: normalizedTtl(ANALYSIS_HISTORY_CACHE_TTL_SECONDS, 60),
  graphSeconds: normalizedTtl(GRAPH_CACHE_TTL_SECONDS, 300),
};
