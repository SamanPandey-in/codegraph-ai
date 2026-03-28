import { Worker } from 'worker_threads';
import os from 'os';
import path from 'path';
import { existsSync } from 'fs';
import pLimit from 'p-limit';
import { BaseAgent } from '../core/BaseAgent.js';
import { scoreParser } from '../core/confidence.js';

const RESOLVE_EXTS = ['.js', '.ts', '.jsx', '.tsx'];

function inferFileType(relPath) {
  const normalized = relPath.replace(/\\/g, '/').toLowerCase();
  const segments = normalized.split('/');
  const filename = segments[segments.length - 1] || '';

  if (segments.some((s) => s === 'components' || s === 'component')) return 'component';
  if (segments.some((s) => s === 'pages' || s === 'views' || s === 'screens')) return 'page';
  if (segments.some((s) => s === 'hooks')) return 'hook';
  if (segments.some((s) => s === 'services' || s === 'api' || s === 'apis')) return 'service';
  if (segments.some((s) => s === 'utils' || s === 'helpers' || s === 'lib')) return 'util';
  if (/config|\.conf\.|\.rc\./.test(filename)) return 'config';
  return 'module';
}

function resolveToAbsolute(fromFile, specifier) {
  if (!specifier.startsWith('.') && !specifier.startsWith('/')) return null;

  const base = path.resolve(path.dirname(fromFile), specifier);

  if (path.extname(base) && existsSync(base)) return base;

  for (const ext of RESOLVE_EXTS) {
    const candidate = base + ext;
    if (existsSync(candidate)) return candidate;
  }

  for (const ext of RESOLVE_EXTS) {
    const candidate = path.join(base, 'index' + ext);
    if (existsSync(candidate)) return candidate;
  }

  return null;
}

function normalizeRelative(filePath, rootDir) {
  return path.relative(rootDir, filePath).replace(/\\/g, '/');
}

function parseConcurrency() {
  const configured = Number(process.env.PARSER_WORKER_CONCURRENCY);
  if (Number.isInteger(configured) && configured > 0) return configured;
  return Math.max(1, os.cpus().length - 1);
}

export class ParserAgent extends BaseAgent {
  agentId = 'parser-agent';
  maxRetries = 2;
  timeoutMs = 300_000;

  async process(input, context) {
    const start = Date.now();
    const errors = [];
    const warnings = [];

    const rootDir = input?.extractedPath || input?.rootDir;
    const manifest = Array.isArray(input?.manifest)
      ? input.manifest
      : Array.isArray(input?.files)
        ? input.files.map((absolutePath) => ({
            absolutePath,
            relativePath: rootDir ? normalizeRelative(absolutePath, rootDir) : absolutePath,
          }))
        : [];

    if (!rootDir || manifest.length === 0) {
      return this.buildResult({
        jobId: context?.jobId,
        status: 'failed',
        confidence: 0,
        data: {},
        errors: [{ code: 400, message: 'ParserAgent requires extractedPath/rootDir and a non-empty manifest/files list.' }],
        warnings,
        metrics: {},
        processingTimeMs: Date.now() - start,
      });
    }

    const concurrency = parseConcurrency();
    const limit = pLimit(concurrency);

    const parsedFiles = await Promise.all(
      manifest.map((file) =>
        limit(() => this._parseInWorker(file.absolutePath, file.relativePath)),
      ),
    );

    const knownFiles = new Set(manifest.map((f) => normalizeRelative(f.absolutePath, rootDir)));
    const graph = {};

    let successCount = 0;
    let failedCount = 0;

    for (const parsed of parsedFiles) {
      if (parsed.parseError) {
        failedCount += 1;
        warnings.push(`Parse error in ${parsed.relativePath}: ${parsed.parseError}`);
      } else {
        successCount += 1;
      }

      const sourceAbs = path.join(rootDir, parsed.relativePath);
      const deps = (parsed.imports || [])
        .map((specifier) => resolveToAbsolute(sourceAbs, specifier))
        .filter(Boolean)
        .map((abs) => normalizeRelative(abs, rootDir))
        .filter((rel) => knownFiles.has(rel));

      graph[parsed.relativePath] = {
        deps: [...new Set(deps)],
        type: inferFileType(parsed.relativePath),
        declarations: parsed.declarations || [],
        metrics: parsed.metrics || {},
      };
    }

    const summary = {
      totalAttempted: manifest.length,
      successCount,
      partialCount: 0,
      failedCount,
      syntaxErrorFiles: parsedFiles.filter((f) => f.parseError).map((f) => f.relativePath),
    };

    const confidence = scoreParser({
      totalAttempted: summary.totalAttempted,
      successCount: summary.successCount,
      failedCount: summary.failedCount,
    });

    const status = failedCount === manifest.length ? 'failed' : failedCount > 0 ? 'partial' : 'success';

    return this.buildResult({
      jobId: context?.jobId,
      status,
      confidence,
      data: { parsedFiles, summary, graph },
      errors,
      warnings,
      metrics: {
        totalAttempted: summary.totalAttempted,
        successCount,
        failedCount,
        workerConcurrency: concurrency,
      },
      processingTimeMs: Date.now() - start,
    });
  }

  _parseInWorker(filePath, relativePath) {
    return new Promise((resolve) => {
      const worker = new Worker(new URL('./parseWorker.js', import.meta.url), {
        workerData: { filePath, relativePath },
      });

      worker.once('message', (result) => {
        resolve(result);
      });

      worker.once('error', (error) => {
        resolve({
          relativePath,
          imports: [],
          declarations: [],
          metrics: {},
          parseError: error.message,
        });
      });
    });
  }
}
