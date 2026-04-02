import { Router } from 'express';
import path from 'path';
import { pgPool, redisClient } from '../../../infrastructure/connections.js';
import {
  buildRepositoriesListCacheKey,
  buildRepositoryJobsCacheKey,
  cacheTtl,
  getCacheMetricsSnapshot,
  invalidateRepositoriesCacheForUser,
  readJsonCache,
  writeJsonCache,
} from '../../../infrastructure/cache.js';
import {
  getCacheMetricsHistory,
  getLatestCacheMetrics,
  getCacheMetricsRetentionStatus,
} from '../../../infrastructure/cacheMetricsPersistence.js';
import { getAuthUser, isUuid, resolveDatabaseUserId } from '../../../utils/authUser.js';

const router = Router();

function inferRepositoryName({ source, fullName, githubRepo }) {
  if (githubRepo) return githubRepo;
  if (!fullName) return source === 'local' ? 'Local repository' : 'Unknown repository';

  if (source === 'local') {
    const normalized = String(fullName).replace(/\\/g, '/');
    return path.posix.basename(normalized) || 'Local repository';
  }

  const parts = String(fullName).split('/').filter(Boolean);
  return parts[1] || parts[0] || 'Unknown repository';
}

function inferRepositoryOwner({ source, fullName, githubOwner }) {
  if (githubOwner) return githubOwner;
  if (source === 'local') return 'local';

  const parts = String(fullName || '').split('/').filter(Boolean);
  return parts[0] || 'unknown';
}

router.get('/cache/metrics', async (req, res, next) => {
  try {
    const authUser = getAuthUser(req);
    if (!authUser?.id) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const metrics = getCacheMetricsSnapshot();
    const readsTotal = metrics.readHit + metrics.readMiss;
    const writesTotal = metrics.writeSuccess + metrics.writeError;
    const invalidationsTotal = metrics.invalidationSuccess + metrics.invalidationFailure;

    return res.status(200).json({
      metrics,
      summary: {
        readsTotal,
        writesTotal,
        invalidationsTotal,
        hitRatePercent:
          readsTotal > 0 ? Number(((metrics.readHit / readsTotal) * 100).toFixed(2)) : null,
      },
      redis: {
        status: redisClient?.status || 'unavailable',
        connected: redisClient?.status === 'ready',
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/cache/metrics/history', async (req, res, next) => {
  try {
    const authUser = getAuthUser(req);
    if (!authUser?.id) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const hoursParam = Math.max(1, Math.min(24, Number.parseInt(req.query.hours || '1', 10)));
    const endSeconds = Math.floor(Date.now() / 1000);
    const startSeconds = endSeconds - hoursParam * 3600;

    const history = await getCacheMetricsHistory(startSeconds, endSeconds);
    const retention = await getCacheMetricsRetentionStatus();

    return res.status(200).json({
      history,
      retention,
      query: { hoursParam, startSeconds, endSeconds },
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/cache/metrics/latest', async (req, res, next) => {
  try {
    const authUser = getAuthUser(req);
    if (!authUser?.id) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const latest = await getLatestCacheMetrics();
    const retention = await getCacheMetricsRetentionStatus();

    return res.status(200).json({
      latest,
      retention,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const authUser = getAuthUser(req);
    if (!authUser?.id) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const page = Math.max(1, Number.parseInt(req.query?.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query?.limit, 10) || 25));
    const offset = (page - 1) * limit;

    const userId = await resolveDatabaseUserId(authUser);
    if (!userId) {
      const err = new Error('Failed to resolve authenticated user record.');
      err.statusCode = 500;
      throw err;
    }

    const cacheKey = buildRepositoriesListCacheKey({ userId, page, limit });
    const cached = await readJsonCache(redisClient, cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.status(200).json(cached);
    }

    const [reposResult, countResult] = await Promise.all([
      pgPool.query(
        `
          WITH repos_with_latest AS (
            SELECT
              r.id AS repository_id,
              r.source,
              r.full_name,
              r.github_owner,
              r.github_repo,
              r.default_branch,
              r.last_scanned_at,
              r.scan_count,
              r.is_starred,
              r.created_at,
              aj.id AS latest_job_id,
              aj.status AS latest_job_status,
              aj.overall_confidence AS latest_job_confidence,
              aj.branch AS latest_job_branch,
              aj.node_count AS latest_job_node_count,
              aj.edge_count AS latest_job_edge_count,
              COALESCE(aj.completed_at, aj.created_at) AS latest_analyzed_at
            FROM repositories r
            LEFT JOIN LATERAL (
              SELECT id, status, overall_confidence, branch, node_count, edge_count, completed_at, created_at
              FROM analysis_jobs
              WHERE repository_id = r.id
              ORDER BY COALESCE(completed_at, created_at) DESC
              LIMIT 1
            ) aj ON TRUE
            WHERE r.owner_id = $1
          )
          SELECT *
          FROM repos_with_latest
          ORDER BY is_starred DESC, COALESCE(latest_analyzed_at, last_scanned_at, created_at) DESC
          LIMIT $2 OFFSET $3
        `,
        [userId, limit, offset],
      ),
      pgPool.query(
        `
          SELECT COUNT(*)::int AS total
          FROM repositories
          WHERE owner_id = $1
        `,
        [userId],
      ),
    ]);

    const repositories = reposResult.rows.map((row) => {
      const name = inferRepositoryName({
        source: row.source,
        fullName: row.full_name,
        githubRepo: row.github_repo,
      });
      const owner = inferRepositoryOwner({
        source: row.source,
        fullName: row.full_name,
        githubOwner: row.github_owner,
      });

      return {
        id: row.repository_id,
        name,
        owner,
        fullName: row.full_name,
        source: row.source,
        defaultBranch: row.default_branch || null,
        lastScannedAt: row.last_scanned_at || null,
        scanCount: Number.isFinite(row.scan_count) ? row.scan_count : 0,
        isStarred: row.is_starred || false,
        latestJob: row.latest_job_id
          ? {
              id: row.latest_job_id,
              status: row.latest_job_status,
              confidence: row.latest_job_confidence,
              branch: row.latest_job_branch || row.default_branch || null,
              nodeCount: Number.isFinite(row.latest_job_node_count) ? row.latest_job_node_count : null,
              edgeCount: Number.isFinite(row.latest_job_edge_count) ? row.latest_job_edge_count : null,
              analyzedAt: row.latest_analyzed_at || null,
            }
          : null,
      };
    });

    const total = countResult.rows[0]?.total || 0;
    const payload = {
      repositories,
      pagination: {
        page,
        limit,
        total,
        totalPages: total > 0 ? Math.ceil(total / limit) : 0,
      },
    };

    await writeJsonCache(redisClient, cacheKey, payload, cacheTtl.repositoriesListSeconds);

    res.setHeader('X-Cache', 'MISS');
    return res.status(200).json(payload);
  } catch (error) {
    return next(error);
  }
});

router.get('/:id/jobs', async (req, res, next) => {
  try {
    const authUser = getAuthUser(req);
    if (!authUser?.id) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const repositoryId = String(req.params?.id || '').trim();
    if (!isUuid(repositoryId)) {
      return res.status(400).json({ error: 'Invalid repository id.' });
    }

    const page = Math.max(1, Number.parseInt(req.query?.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query?.limit, 10) || 25));
    const offset = (page - 1) * limit;

    const userId = await resolveDatabaseUserId(authUser);
    if (!userId) {
      const err = new Error('Failed to resolve authenticated user record.');
      err.statusCode = 500;
      throw err;
    }

    const repoResult = await pgPool.query(
      `
        SELECT id, source, full_name, default_branch
        FROM repositories
        WHERE id = $1 AND owner_id = $2
        LIMIT 1
      `,
      [repositoryId, userId],
    );

    if (repoResult.rowCount === 0) {
      return res.status(404).json({ error: 'Repository not found.' });
    }

    const cacheKey = buildRepositoryJobsCacheKey({ userId, repositoryId, page, limit });
    const cached = await readJsonCache(redisClient, cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.status(200).json(cached);
    }

    const [jobsResult, countResult] = await Promise.all([
      pgPool.query(
        `
          SELECT
            id,
            branch,
            status,
            overall_confidence,
            file_count,
            node_count,
            edge_count,
            error_summary,
            started_at,
            completed_at,
            created_at
          FROM analysis_jobs
          WHERE repository_id = $1
          ORDER BY COALESCE(completed_at, created_at) DESC
          LIMIT $2 OFFSET $3
        `,
        [repositoryId, limit, offset],
      ),
      pgPool.query(
        `
          SELECT COUNT(*)::int AS total
          FROM analysis_jobs
          WHERE repository_id = $1
        `,
        [repositoryId],
      ),
    ]);

    const payload = {
      repository: {
        id: repoResult.rows[0].id,
        fullName: repoResult.rows[0].full_name,
        source: repoResult.rows[0].source,
        defaultBranch: repoResult.rows[0].default_branch || null,
      },
      jobs: jobsResult.rows.map((row) => ({
        id: row.id,
        branch: row.branch || null,
        status: row.status,
        confidence: row.overall_confidence,
        fileCount: Number.isFinite(row.file_count) ? row.file_count : null,
        nodeCount: Number.isFinite(row.node_count) ? row.node_count : null,
        edgeCount: Number.isFinite(row.edge_count) ? row.edge_count : null,
        errorSummary: row.error_summary || null,
        startedAt: row.started_at || null,
        completedAt: row.completed_at || null,
        createdAt: row.created_at || null,
      })),
      pagination: {
        page,
        limit,
        total: countResult.rows[0]?.total || 0,
        totalPages:
          (countResult.rows[0]?.total || 0) > 0
            ? Math.ceil((countResult.rows[0]?.total || 0) / limit)
            : 0,
      },
    };

    await writeJsonCache(redisClient, cacheKey, payload, cacheTtl.repositoryJobsSeconds);

    res.setHeader('X-Cache', 'MISS');
    return res.status(200).json(payload);
  } catch (error) {
    return next(error);
  }
});

router.patch('/:id/star', async (req, res, next) => {
  try {
    const authUser = getAuthUser(req);
    if (!authUser?.id) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const repositoryId = String(req.params?.id || '').trim();
    if (!isUuid(repositoryId)) {
      return res.status(400).json({ error: 'Invalid repository id.' });
    }

    const userId = await resolveDatabaseUserId(authUser);
    if (!userId) {
      const err = new Error('Failed to resolve authenticated user record.');
      err.statusCode = 500;
      throw err;
    }

    // Verify repository ownership
    const repoResult = await pgPool.query(
      `
        SELECT id, is_starred
        FROM repositories
        WHERE id = $1 AND owner_id = $2
        LIMIT 1
      `,
      [repositoryId, userId],
    );

    if (repoResult.rowCount === 0) {
      return res.status(404).json({ error: 'Repository not found.' });
    }

    // Toggle the is_starred flag
    const currentStarred = repoResult.rows[0].is_starred || false;
    const updateResult = await pgPool.query(
      `
    UPDATE repositories
    SET is_starred = $1
        WHERE id = $2 AND owner_id = $3
        RETURNING id, is_starred
      `,
      [!currentStarred, repositoryId, userId],
    );

    await invalidateRepositoriesCacheForUser(redisClient, userId);

    return res.status(200).json({
      id: updateResult.rows[0].id,
      isStarred: updateResult.rows[0].is_starred,
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
