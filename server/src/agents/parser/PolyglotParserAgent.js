import path from 'path';
import os from 'os';
import { readFile } from 'fs/promises';
import { Worker } from 'worker_threads';
import pLimit from 'p-limit';
import { BaseAgent } from '../core/BaseAgent.js';
import { scorePolyglotParser } from '../core/confidence.js';
import { parseSql } from './sqlParser.js';

const BABEL_EXTS = new Set(['.js', '.ts', '.jsx', '.tsx']);
const TREESITTER_EXTS = new Set(['.py', '.java', '.go', '.rs', '.rb', '.cs', '.kt', '.kts', '.php']);
const SQL_EXTS = new Set(['.sql']);

function langFromExt(ext) {
  const map = {
    '.py': 'python',
    '.java': 'java',
    '.go': 'go',
    '.rs': 'rust',
    '.rb': 'ruby',
    '.cs': 'c_sharp',
    '.kt': 'kotlin',
    '.kts': 'kotlin',
    '.php': 'php',
  };

  return map[ext] || null;
}

function normalizeRelative(filePath, rootDir) {
  return path.relative(rootDir, filePath).replace(/\\/g, '/');
}

function parseConcurrency() {
  const configured = Number(process.env.PARSER_WORKER_CONCURRENCY);
  if (Number.isInteger(configured) && configured > 0) return configured;
  return Math.max(1, os.cpus().length - 1);
}

function extensionGroup(ext) {
  if (BABEL_EXTS.has(ext)) return 'babel';
  if (TREESITTER_EXTS.has(ext)) return langFromExt(ext) || 'treesitter';
  if (SQL_EXTS.has(ext)) return 'sql';
  return 'unsupported';
}

function emptyParseResult(relativePath, parseError) {
  return {
    relativePath,
    imports: [],
    declarations: [],
    functionNodes: [],
    metrics: {},
    parseError,
  };
}

export class PolyglotParserAgent extends BaseAgent {
  agentId = 'polyglot-parser-agent';
  maxRetries = 2;
  timeoutMs = 300_000;

  async process(input, context) {
    const start = Date.now();
    const errors = [];
    const warnings = [];

    const rootDir = input?.extractedPath || input?.rootDir;
    const manifest = Array.isArray(input?.manifest)
      ? input.manifest
      : (input?.files || []).map((absolutePath) => ({
          absolutePath,
          relativePath: rootDir ? normalizeRelative(absolutePath, rootDir) : absolutePath,
        }));

    if (!rootDir || manifest.length === 0) {
      return this.buildResult({
        jobId: context?.jobId,
        status: 'failed',
        confidence: 0,
        data: {},
        errors: [{ code: 400, message: 'PolyglotParserAgent requires extractedPath and manifest.' }],
        warnings,
        metrics: {},
        processingTimeMs: Date.now() - start,
      });
    }

    const languageBreakdown = {};
    for (const file of manifest) {
      const ext = path.extname(file.absolutePath).toLowerCase();
      const key = extensionGroup(ext);
      languageBreakdown[key] = (languageBreakdown[key] || 0) + 1;
    }

    const limit = pLimit(parseConcurrency());
    const parsedFiles = await Promise.all(
      manifest.map((file) => limit(() => this._parseFile(file))),
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
      failedCount,
      languageBreakdown,
    };

    const confidence = scorePolyglotParser(summary);
    const status = failedCount === manifest.length ? 'failed' : failedCount > 0 ? 'partial' : 'success';

    return this.buildResult({
      jobId: context?.jobId,
      status,
      confidence,
      data: {
        parsedFiles,
        summary,
      },
      errors,
      warnings,
      metrics: {
        totalAttempted: manifest.length,
        successCount,
        failedCount,
      },
      processingTimeMs: Date.now() - start,
    });
  }

  async _parseFile(file) {
    const ext = path.extname(file.absolutePath).toLowerCase();

    if (SQL_EXTS.has(ext)) {
      return this._parseSqlFile(file);
    }

    if (BABEL_EXTS.has(ext)) {
      return this._runWorker('parseWorker.js', {
        filePath: file.absolutePath,
        relativePath: file.relativePath,
      });
    }

    if (TREESITTER_EXTS.has(ext)) {
      return this._runWorker('treesitterWorker.js', {
        filePath: file.absolutePath,
        relativePath: file.relativePath,
        language: langFromExt(ext),
      });
    }

    return emptyParseResult(file.relativePath, `Unsupported extension: ${ext}`);
  }

  async _parseSqlFile(file) {
    try {
      const content = await readFile(file.absolutePath, 'utf8');
      return parseSql(content, file.relativePath);
    } catch (error) {
      return emptyParseResult(file.relativePath, error.message);
    }
  }

  _runWorker(workerFile, workerData) {
    return new Promise((resolve) => {
      const worker = new Worker(new URL(workerFile, import.meta.url), { workerData });

      const timeout = setTimeout(() => {
        worker.terminate();
        resolve(emptyParseResult(workerData.relativePath, `Worker timeout (${workerFile})`));
      }, 30_000);

      worker.once('message', (message) => {
        clearTimeout(timeout);
        resolve(message);
      });

      worker.once('error', (error) => {
        clearTimeout(timeout);
        resolve(emptyParseResult(workerData.relativePath, error.message));
      });
    });
  }
}
