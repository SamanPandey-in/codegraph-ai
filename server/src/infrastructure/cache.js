const ANALYSIS_HISTORY_CACHE_TTL_SECONDS = Number.parseInt(
  process.env.ANALYSIS_HISTORY_CACHE_TTL_SECONDS || '60',
  10,
);

const GRAPH_CACHE_TTL_SECONDS = Number.parseInt(
  process.env.GRAPH_CACHE_TTL_SECONDS || '300',
  10,
);

const REPOSITORIES_LIST_CACHE_TTL_SECONDS = Number.parseInt(
  process.env.REPOSITORIES_LIST_CACHE_TTL_SECONDS || '60',
  10,
);

const REPOSITORY_JOBS_CACHE_TTL_SECONDS = Number.parseInt(
  process.env.REPOSITORY_JOBS_CACHE_TTL_SECONDS || '60',
  10,
);

const CACHE_VERSION = 'v1';

const cacheMetrics = {
  readHit: 0,
  readMiss: 0,
  readError: 0,
  writeSuccess: 0,
  writeError: 0,
  invalidationSuccess: 0,
  invalidationFailure: 0,
  invalidationKeysDeleted: 0,
};

function bumpMetric(metric, amount = 1) {
  if (!Object.prototype.hasOwnProperty.call(cacheMetrics, metric)) return;
  cacheMetrics[metric] += amount;
}

export function getCacheMetricsSnapshot() {
  return { ...cacheMetrics };
}

export function resetCacheMetrics() {
  Object.keys(cacheMetrics).forEach((metric) => {
    cacheMetrics[metric] = 0;
  });
}

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

function logCacheWarning(operation, error, context = {}) {
  const details = Object.entries(context)
    .map(([key, value]) => `${key}=${value}`)
    .join(' ');
  const suffix = details ? ` ${details}` : '';
  console.warn(`[cache:${operation}] ${error?.message || 'Cache operation failed.'}${suffix}`);
}

export function buildAnalysisHistoryCacheKey({ userId, page, limit }) {
  return withVersion(`analysis-history:user:${userId}:page:${page}:limit:${limit}`);
}

export function buildGraphCacheKey(jobId) {
  return withVersion(`graph:job:${jobId}`);
}

export function buildRepositoriesListCacheKey({ userId, page, limit }) {
  return withVersion(`repositories:user:${userId}:page:${page}:limit:${limit}`);
}

export function buildRepositoryJobsCacheKey({ userId, repositoryId, page, limit }) {
  return withVersion(`repository-jobs:user:${userId}:repo:${repositoryId}:page:${page}:limit:${limit}`);
}

export async function readJsonCache(redis, key) {
  if (!redis || typeof redis.get !== 'function') {
    bumpMetric('readMiss');
    return null;
  }

  try {
    const raw = await redis.get(key);
    if (!raw) {
      bumpMetric('readMiss');
      return null;
    }

    const parsed = JSON.parse(raw);
    bumpMetric('readHit');
    return parsed;
  } catch (error) {
    bumpMetric('readError');
    logCacheWarning('read', error, { key });
    return null;
  }
}

export async function writeJsonCache(redis, key, payload, ttlSeconds) {
  if (!redis || typeof redis.set !== 'function') return;

  try {
    const ttl = ttlWithJitter(ttlSeconds);
    await redis.set(key, JSON.stringify(payload), 'EX', ttl);
    bumpMetric('writeSuccess');
  } catch (error) {
    bumpMetric('writeError');
    logCacheWarning('write', error, { key });
  }
}

export async function deleteCacheKey(redis, key) {
  if (!redis || typeof redis.del !== 'function') return;

  try {
    const deletedCount = Number(await redis.del(key)) || 0;
    bumpMetric('invalidationSuccess');
    bumpMetric('invalidationKeysDeleted', deletedCount);
  } catch (error) {
    bumpMetric('invalidationFailure');
    logCacheWarning('delete', error, { key });
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
        const deletedCount = Number(await redis.del(...keys)) || 0;
        bumpMetric('invalidationSuccess');
        bumpMetric('invalidationKeysDeleted', deletedCount);
      }
    } while (cursor !== '0');
  } catch (error) {
    bumpMetric('invalidationFailure');
    logCacheWarning('delete-pattern', error, { pattern });
  }
}

export async function invalidateAnalysisHistoryCacheForUser(redis, userId) {
  if (!userId) return;
  await deleteByPattern(redis, withVersion(`analysis-history:user:${userId}:*`));
}

export async function invalidateRepositoriesCacheForUser(redis, userId) {
  if (!userId) return;

  await Promise.all([
    deleteByPattern(redis, withVersion(`repositories:user:${userId}:*`)),
    deleteByPattern(redis, withVersion(`repository-jobs:user:${userId}:*`)),
  ]);
}

export const cacheTtl = {
  analysisHistorySeconds: normalizedTtl(ANALYSIS_HISTORY_CACHE_TTL_SECONDS, 60),
  graphSeconds: normalizedTtl(GRAPH_CACHE_TTL_SECONDS, 300),
  repositoriesListSeconds: normalizedTtl(REPOSITORIES_LIST_CACHE_TTL_SECONDS, 60),
  repositoryJobsSeconds: normalizedTtl(REPOSITORY_JOBS_CACHE_TTL_SECONDS, 60),
};
