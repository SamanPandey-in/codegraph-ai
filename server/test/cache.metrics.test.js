import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  deleteByPattern,
  deleteCacheKey,
  getCacheMetricsSnapshot,
  readJsonCache,
  resetCacheMetrics,
  writeJsonCache,
} from '../src/infrastructure/cache.js';

beforeEach(() => {
  resetCacheMetrics();
});

test('cache metrics track read hit, miss, and error', async () => {
  const redis = {
    async get(key) {
      if (key === 'hit') return '{"ok":true}';
      if (key === 'miss') return null;
      throw new Error('read boom');
    },
  };

  const hit = await readJsonCache(redis, 'hit');
  const miss = await readJsonCache(redis, 'miss');
  const err = await readJsonCache(redis, 'err');

  assert.deepEqual(hit, { ok: true });
  assert.equal(miss, null);
  assert.equal(err, null);

  const metrics = getCacheMetricsSnapshot();
  assert.equal(metrics.readHit, 1);
  assert.equal(metrics.readMiss, 1);
  assert.equal(metrics.readError, 1);
});

test('cache metrics track write success and error', async () => {
  const calls = [];
  const redis = {
    async set(...args) {
      calls.push(args);
      if (args[0] === 'bad') throw new Error('write boom');
      return 'OK';
    },
  };

  await writeJsonCache(redis, 'good', { ok: true }, 30);
  await writeJsonCache(redis, 'bad', { ok: false }, 30);

  assert.equal(calls.length, 2);
  const metrics = getCacheMetricsSnapshot();
  assert.equal(metrics.writeSuccess, 1);
  assert.equal(metrics.writeError, 1);
});

test('cache metrics track invalidation successes, key count, and failures', async () => {
  let scanCall = 0;
  const redis = {
    async del(...keys) {
      if (keys[0] === 'explode') throw new Error('delete boom');
      return keys.length;
    },
    async scan(cursor) {
      scanCall += 1;
      if (scanCall === 1) return ['1', ['k1', 'k2']];
      return ['0', ['k3']];
    },
  };

  await deleteCacheKey(redis, 'single');
  await deleteByPattern(redis, 'cache:*');
  await deleteCacheKey(redis, 'explode');

  const metrics = getCacheMetricsSnapshot();
  assert.equal(metrics.invalidationSuccess, 3);
  assert.equal(metrics.invalidationKeysDeleted, 4);
  assert.equal(metrics.invalidationFailure, 1);
});

test('read without redis client is tracked as miss', async () => {
  const value = await readJsonCache(null, 'no-redis');
  assert.equal(value, null);

  const metrics = getCacheMetricsSnapshot();
  assert.equal(metrics.readMiss, 1);
});
