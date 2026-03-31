import { promises as fs } from 'fs';
import path from 'path';
import { BaseAgent } from '../core/BaseAgent.js';
import { scoreScanner } from '../core/confidence.js';

const DEFAULT_SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'coverage',
  '__pycache__',
  '.turbo',
  'out',
  '.vercel',
]);

const ALLOWED_EXTENSIONS = new Set([
  '.js', '.ts', '.jsx', '.tsx',
  '.py',
  '.java',
  '.go',
  '.rs',
  '.rb',
  '.cs',
  '.kt', '.kts',
  '.php',
  '.sql',
]);

function normalizeRelative(filePath, rootDir) {
  return path.relative(rootDir, filePath).replace(/\\/g, '/');
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export class ScannerAgent extends BaseAgent {
  agentId = 'scanner-agent';
  maxRetries = 1;
  timeoutMs = 120_000;

  async process(input, context) {
    const start = Date.now();
    const errors = [];
    const warnings = [];

    const rootDir = typeof input === 'string' ? input : input?.extractedPath || input?.rootDir;
    if (!rootDir) {
      return this.buildResult({
        jobId: context?.jobId,
        status: 'failed',
        confidence: 0,
        data: {},
        errors: [{ code: 400, message: 'ScannerAgent requires extractedPath or rootDir.' }],
        warnings,
        metrics: {},
        processingTimeMs: Date.now() - start,
      });
    }

    const manifest = [];
    const skipReasons = {};
    const languageBreakdown = {};
    let totalFiles = 0;
    let eligibleFiles = 0;
    let skippedFiles = 0;
    let permissionErrors = 0;

    const walk = async (dir) => {
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        permissionErrors += 1;
        return;
      }

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          if (DEFAULT_SKIP_DIRS.has(entry.name)) {
            skippedFiles += 1;
            skipReasons[entry.name] = (skipReasons[entry.name] || 0) + 1;
            continue;
          }
          await walk(fullPath);
          continue;
        }

        if (!entry.isFile()) {
          continue;
        }

        totalFiles += 1;
        const ext = path.extname(entry.name).toLowerCase();

        if (!ALLOWED_EXTENSIONS.has(ext)) {
          skippedFiles += 1;
          skipReasons.extension = (skipReasons.extension || 0) + 1;
          continue;
        }

        let sizeBytes = 0;
        try {
          const stats = await fs.stat(fullPath);
          sizeBytes = stats.size;
        } catch {
          warnings.push(`Could not stat file: ${normalizeRelative(fullPath, rootDir)}`);
        }

        eligibleFiles += 1;
        languageBreakdown[ext] = (languageBreakdown[ext] || 0) + 1;
        manifest.push({
          absolutePath: fullPath,
          relativePath: normalizeRelative(fullPath, rootDir),
          sizeBytes,
        });
      }
    };

    try {
      await walk(rootDir);
      const monorepo = await this._detectMonorepo(rootDir);

      const summary = {
        totalFiles,
        eligibleFiles,
        skippedFiles,
        skipReasons,
        languageBreakdown,
        isMonorepo: monorepo.isMonorepo,
        packages: monorepo.packages,
      };

      const confidence = scoreScanner({
        totalFiles,
        eligibleFiles,
        permissionErrors,
      });

      const status = eligibleFiles > 0 ? 'success' : 'partial';

      return this.buildResult({
        jobId: context?.jobId,
        status,
        confidence,
        data: { manifest, summary },
        errors,
        warnings,
        metrics: {
          totalFiles,
          eligibleFiles,
          skippedFiles,
          permissionErrors,
        },
        processingTimeMs: Date.now() - start,
      });
    } catch (error) {
      return this.buildResult({
        jobId: context?.jobId,
        status: 'failed',
        confidence: 0,
        data: {},
        errors: [{ code: error.statusCode || 500, message: error.message }],
        warnings,
        metrics: { totalFiles, eligibleFiles, skippedFiles, permissionErrors },
        processingTimeMs: Date.now() - start,
      });
    }
  }

  async _detectMonorepo(rootDir) {
    const packages = [];

    const markerChecks = await Promise.all([
      fileExists(path.join(rootDir, 'pnpm-workspace.yaml')),
      fileExists(path.join(rootDir, 'lerna.json')),
      fileExists(path.join(rootDir, 'nx.json')),
      fileExists(path.join(rootDir, 'turbo.json')),
    ]);

    let hasWorkspaceConfig = markerChecks.some(Boolean);

    try {
      const packageJsonRaw = await fs.readFile(path.join(rootDir, 'package.json'), 'utf8');
      const packageJson = JSON.parse(packageJsonRaw);
      if (Array.isArray(packageJson.workspaces) && packageJson.workspaces.length > 0) {
        hasWorkspaceConfig = true;
      }
      if (
        packageJson.workspaces &&
        Array.isArray(packageJson.workspaces.packages) &&
        packageJson.workspaces.packages.length > 0
      ) {
        hasWorkspaceConfig = true;
      }
    } catch {
      // No root package.json is acceptable for local non-node repos.
    }

    try {
      const packagesDir = path.join(rootDir, 'packages');
      const dirs = await fs.readdir(packagesDir, { withFileTypes: true });
      for (const dir of dirs) {
        if (!dir.isDirectory()) continue;
        const pkgDir = path.join(packagesDir, dir.name);
        const hasPkgJson = await fileExists(path.join(pkgDir, 'package.json'));
        if (hasPkgJson) {
          packages.push(normalizeRelative(pkgDir, rootDir));
        }
      }
    } catch {
      // packages/ folder is optional.
    }

    return {
      isMonorepo: hasWorkspaceConfig || packages.length > 1,
      packages,
    };
  }
}
