import { Worker } from 'worker_threads';
import os from 'os';
import path from 'path';
import pLimit from 'p-limit';
import { BaseAgent } from '../core/BaseAgent.js';
import { scoreParser } from '../core/confidence.js';

function normalizeRelative(filePath, rootDir) {
  return path.relative(rootDir, filePath).replace(/\\/g, '/');
}

function parseConcurrency() {
  const configured = Number(process.env.PARSER_WORKER_CONCURRENCY);
  if (Number.isInteger(configured) && configured > 0) return configured;
  return Math.max(1, os.cpus().length - 1);
}

function buildWorkerExecArgv() {
  return [];
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

    let successCount = 0;
    let failedCount = 0;

    for (const parsed of parsedFiles) {
      if (parsed.parseError) {
        failedCount += 1;
        warnings.push(`Parse error in ${parsed.relativePath}: ${parsed.parseError}`);
      } else {
        successCount += 1;
      }
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
      data: { parsedFiles, summary },
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
    const ext = path.extname(filePath).toLowerCase();
    const workerFile = ext === '.py'
      ? './pythonWorker.js'
      : ext === '.go'
        ? './goWorker.js'
        : './parseWorker.js';

    return new Promise((resolve) => {
      const worker = new Worker(new URL(workerFile, import.meta.url), {
        workerData: { filePath, relativePath },
        execArgv: buildWorkerExecArgv(),
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
