import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import http from 'http';
import express from 'express';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';

const { stopLocalWatchMock, isWatchingMock } = vi.hoisted(() => ({
  stopLocalWatchMock: vi.fn(),
  isWatchingMock: vi.fn(),
}));

vi.mock('../src/analyze/services/localPicker.service.js', () => ({
  getLocalPickerCapabilities: vi.fn(async () => ({ canBrowse: true })),
  pickLocalDirectory: vi.fn(async () => 'C:\\projects\\repo'),
}));

vi.mock('../src/analyze/services/localWatcher.service.js', () => ({
  stopLocalWatch: stopLocalWatchMock,
  isWatching: isWatchingMock,
}));

vi.mock('../src/analyze/services/analyze.service.js', () => ({
  validateLocalRepository: vi.fn(async (path) => ({ ok: true, path })),
}));

import analyzeRouter from '../src/analyze/routes/analyze.routes.js';

describe('local picker endpoints', () => {
  let app;
  let server;

  beforeEach(() => {
    app = express();
    app.use(bodyParser.json());
    app.use(cookieParser());
    app.use('/api/analyze', analyzeRouter);
    server = http.createServer(app);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    server.close();
  });

  it('returns capabilities', async () => {
    await new Promise((res) => server.listen(0, res));
    const { port } = server.address();
    const baseUrl = `http://localhost:${port}`;

    const res = await fetch(`${baseUrl}/api/analyze/local/picker-capabilities`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.canBrowse).toBe(true);
  });

  it('browses local path', async () => {
    await new Promise((res) => server.listen(0, res));
    const { port } = server.address();
    const baseUrl = `http://localhost:${port}`;

    const res = await fetch(`${baseUrl}/api/analyze/local/browse`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.path).toBeTruthy();
  });

  it('validates local path', async () => {
    await new Promise((res) => server.listen(0, res));
    const { port } = server.address();
    const baseUrl = `http://localhost:${port}`;

    const res = await fetch(`${baseUrl}/api/analyze/local/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'C:\\projects\\repo' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it('stops a watched local repo', async () => {
    isWatchingMock.mockReturnValue(true);

    await new Promise((res) => server.listen(0, res));
    const { port } = server.address();
    const baseUrl = `http://localhost:${port}`;

    const res = await fetch(`${baseUrl}/api/analyze/local/repo-123/watch`, {
      method: 'DELETE',
    });

    expect(res.status).toBe(200);
    expect(stopLocalWatchMock).toHaveBeenCalledWith('repo-123');
  });

  it('returns 404 when stopping an unknown watcher', async () => {
    isWatchingMock.mockReturnValue(false);

    await new Promise((res) => server.listen(0, res));
    const { port } = server.address();
    const baseUrl = `http://localhost:${port}`;

    const res = await fetch(`${baseUrl}/api/analyze/local/missing/watch`, {
      method: 'DELETE',
    });

    expect(res.status).toBe(404);
    expect(stopLocalWatchMock).not.toHaveBeenCalled();
  });
});
