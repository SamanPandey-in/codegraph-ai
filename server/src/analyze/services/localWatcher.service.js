import chokidar from 'chokidar';
import path from 'path';
import { createAnalysisJob } from '../upload/upload.service.js';

const activeWatchers = new Map();
const DEBOUNCE_MS = 800;

function normalizeRelativePath(localPath, filePath) {
  const relativePath = path.relative(localPath, filePath);
  return relativePath.split(path.sep).join('/');
}

async function flushChanges(entry) {
  if (entry.pendingChanges.size === 0 && entry.pendingRemovals.size === 0) {
    return;
  }

  const changedFiles = [...entry.pendingChanges].map((filePath) => normalizeRelativePath(entry.localPath, filePath));
  const removedFiles = [...entry.pendingRemovals].map((filePath) => normalizeRelativePath(entry.localPath, filePath));

  entry.pendingChanges.clear();
  entry.pendingRemovals.clear();

  if (!entry.userId || !entry.repositoryId) {
    console.warn(`[LocalWatcher] Missing repository context for repoId=${entry.repoId}; skipping refresh job.`);
    return;
  }

  try {
    const jobId = await createAnalysisJob({
      repositoryId: entry.repositoryId,
      userId: entry.userId,
      branch: null,
    });

    const { enqueueAnalysisJob } = await import('../../queue/analysisQueue.js');

    await enqueueAnalysisJob({
      jobId,
      input: {
        source: 'local',
        localPath: entry.localPath,
        repositoryId: entry.repositoryId,
        userId: entry.userId,
        changedFiles,
        removedFiles,
        isLocal: true,
      },
    });

    console.log(`[LocalWatcher] Enqueued refresh job ${jobId} for repoId=${entry.repoId}`);
  } catch (error) {
    console.error('[LocalWatcher] Failed to enqueue refresh job:', error.message);
  }
}

function scheduleFlush(entry) {
  clearTimeout(entry.debounceTimer);
  entry.debounceTimer = setTimeout(() => {
    flushChanges(entry);
  }, DEBOUNCE_MS);
}

export function startLocalWatch(repoId, localPath, { repositoryId, userId } = {}) {
  if (!repoId || !localPath) return;

  if (activeWatchers.has(repoId)) {
    console.log(`[LocalWatcher] Already watching repoId=${repoId}, skipping.`);
    return;
  }

  const watcherEntry = {
    repoId,
    repositoryId,
    userId,
    localPath,
    watcher: null,
    debounceTimer: null,
    pendingChanges: new Set(),
    pendingRemovals: new Set(),
  };

  const watcher = chokidar.watch(localPath, {
    ignored: /(^|[/\\])(\.git|node_modules|dist|build|\.next|__pycache__|\.venv|venv)(\/|$)/,
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 400,
      pollInterval: 100,
    },
  });

  watcher
    .on('add', (filePath) => {
      watcherEntry.pendingChanges.add(filePath);
      scheduleFlush(watcherEntry);
    })
    .on('change', (filePath) => {
      watcherEntry.pendingChanges.add(filePath);
      scheduleFlush(watcherEntry);
    })
    .on('unlink', (filePath) => {
      watcherEntry.pendingRemovals.add(filePath);
      scheduleFlush(watcherEntry);
    })
    .on('error', (error) => console.error('[LocalWatcher] Watcher error:', error));

  watcherEntry.watcher = watcher;
  activeWatchers.set(repoId, watcherEntry);
  console.log(`[LocalWatcher] Started watching repoId=${repoId} at ${localPath}`);
}

export function stopLocalWatch(repoId) {
  const entry = activeWatchers.get(repoId);
  if (!entry) return;

  clearTimeout(entry.debounceTimer);
  void entry.watcher?.close();
  activeWatchers.delete(repoId);
  console.log(`[LocalWatcher] Stopped watching repoId=${repoId}`);
}

export function stopAllLocalWatchers() {
  for (const repoId of [...activeWatchers.keys()]) {
    stopLocalWatch(repoId);
  }
}

export function isWatching(repoId) {
  return activeWatchers.has(repoId);
}