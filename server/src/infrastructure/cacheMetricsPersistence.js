import { redisClient } from './connections.js';

/**
 * Cache Metrics Persistence
 *
 * Stores minute-bucket snapshots of cache performance metrics in Redis
 * for cross-session trend analysis and historical observability.
 *
 * Key pattern: cache:metrics:bucket:{timestamp_minutes}
 * TTL: 24 hours (1440 minutes)
 * Bucket granularity: 1 minute
 *
 * This enables dashboard/monitoring to show:
 * - Hit rate trends over the session and across restarts
 * - Read/write/error growth patterns
 * - Invalidation failure tracking per time window
 */

const METRICS_BUCKET_TTL_SECONDS = 24 * 60 * 60; // 24 hours
const METRICS_BUCKET_KEY_PREFIX = 'cache:metrics:bucket';
const METRICS_INDEX_KEY = 'cache:metrics:buckets'; // Sorted set of bucket timestamps

/**
 * Get the current minute timestamp (rounded down)
 * E.g., if time is 14:35:47, returns 14:35:00 as timestamp
 */
function getBucketTimestamp() {
  const now = new Date();
  // Round down to minute boundary
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes(), 0, 0).getTime() / 1000;
}

/**
 * Format a bucket key for a given timestamp
 */
function formatBucketKey(bucketTimestamp) {
  return `${METRICS_BUCKET_KEY_PREFIX}:${bucketTimestamp}`;
}

/**
 * Persist a snapshot of cache metrics to a minute bucket
 * Called periodically (e.g., every 30 seconds) to record current state
 *
 * @param {Object} metricsSnapshot - { readHit, readMiss, readError, writeSuccess, writeError, invalidationSuccess, invalidationFailure, invalidationKeysDeleted }
 */
export async function persistCacheMetricsSnapshot(metricsSnapshot) {
  if (!redisClient || !redisClient.isOpen?.()) {
    // Redis not available, skip persistence
    return;
  }

  try {
    const bucketTimestamp = getBucketTimestamp();
    const bucketKey = formatBucketKey(bucketTimestamp);

    // Store snapshot as JSON string
    await redisClient.setEx(
      bucketKey,
      METRICS_BUCKET_TTL_SECONDS,
      JSON.stringify({
        timestamp: bucketTimestamp,
        ...metricsSnapshot,
      }),
    );

    // Add bucket timestamp to index (sorted set by score)
    // Score is the timestamp for easy range queries
    await redisClient.zAdd(METRICS_INDEX_KEY, { score: bucketTimestamp, member: String(bucketTimestamp) });

    // Trim old buckets from index (keep only last 24 hours)
    const cutoffTime = Math.floor(Date.now() / 1000) - METRICS_BUCKET_TTL_SECONDS;
    await redisClient.zRemRangeByScore(METRICS_INDEX_KEY, 0, cutoffTime);
  } catch (error) {
    // Silent failure: don't crash observability system if Redis is temporarily down
    console.warn('[cache-metrics-persistence] Failed to persist snapshot:', error?.message);
  }
}

/**
 * Retrieve historical cache metrics buckets within a time range
 * Used by dashboard to show trends
 *
 * @param {number} startSeconds - Unix timestamp (seconds) for range start
 * @param {number} endSeconds - Unix timestamp (seconds) for range end
 * @returns {Array<Object>} Array of metric snapshots, earliest first
 */
export async function getCacheMetricsHistory(startSeconds, endSeconds) {
  if (!redisClient || !redisClient.isOpen?.()) {
    return [];
  }

  try {
    // Get all bucket timestamps in the range
    const bucketTimestamps = await redisClient.zRangeByScore(
      METRICS_INDEX_KEY,
      startSeconds,
      endSeconds,
    );

    if (!bucketTimestamps || bucketTimestamps.length === 0) {
      return [];
    }

    // Fetch each bucket's full snapshot
    const snapshots = [];
    for (const ts of bucketTimestamps) {
      const bucketKey = formatBucketKey(Number(ts));
      const data = await redisClient.get(bucketKey);
      if (data) {
        try {
          snapshots.push(JSON.parse(data));
        } catch {
          // Skip malformed snapshots
        }
      }
    }

    return snapshots;
  } catch (error) {
    console.warn('[cache-metrics-persistence] Failed to retrieve history:', error?.message);
    return [];
  }
}

/**
 * Get the most recent cache metrics bucket
 * Quick access for dashboard "current" metrics
 *
 * @returns {Object|null} Most recent metric snapshot or null if none available
 */
export async function getLatestCacheMetrics() {
  if (!redisClient || !redisClient.isOpen?.()) {
    return null;
  }

  try {
    const bucketTimestamps = await redisClient.zRevRange(METRICS_INDEX_KEY, 0, 0);
    if (!bucketTimestamps || bucketTimestamps.length === 0) {
      return null;
    }

    const bucketKey = formatBucketKey(Number(bucketTimestamps[0]));
    const data = await redisClient.get(bucketKey);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.warn('[cache-metrics-persistence] Failed to retrieve latest:', error?.message);
    return null;
  }
}

/**
 * Clear all cached metrics history
 * Useful for testing or reset operations
 */
export async function clearCacheMetricsHistory() {
  if (!redisClient || !redisClient.isOpen?.()) {
    return;
  }

  try {
    const bucketTimestamps = await redisClient.zRange(METRICS_INDEX_KEY, 0, -1);
    for (const ts of bucketTimestamps) {
      await redisClient.del(formatBucketKey(Number(ts)));
    }
    await redisClient.del(METRICS_INDEX_KEY);
  } catch (error) {
    console.warn('[cache-metrics-persistence] Failed to clear history:', error?.message);
  }
}

/**
 * Return a summary of current metrics retention state
 * For diagnostics and monitoring
 */
export async function getCacheMetricsRetentionStatus() {
  if (!redisClient || !redisClient.isOpen?.()) {
    return { available: false, reason: 'Redis not available' };
  }

  try {
    const bucketCount = await redisClient.zCard(METRICS_INDEX_KEY);
    const bucketTimestamps = await redisClient.zRange(METRICS_INDEX_KEY, 0, -1);

    if (bucketCount === 0) {
      return { available: true, bucketCount: 0, timeRangeSeconds: 0 };
    }

    const oldest = Number(bucketTimestamps[0]);
    const newest = Number(bucketTimestamps[bucketTimestamps.length - 1]);
    const rangeSeconds = newest - oldest;

    return {
      available: true,
      bucketCount,
      timeRangeSeconds: rangeSeconds,
      oldestBucketTimestamp: oldest,
      newestBucketTimestamp: newest,
    };
  } catch (error) {
    return { available: true, error: error?.message };
  }
}
