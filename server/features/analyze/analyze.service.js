import { stat } from 'fs/promises';
import path from 'path';
import { scanFiles } from './fileScanner.js';
import { buildDependencyGraph } from './astParser.js';

/**
 * System directories that must never be scanned.
 * Scanning these would be a security risk and is almost certainly a mistake.
 */
const BLOCKED_PREFIXES = [
  '/etc',
  '/proc',
  '/sys',
  '/dev',
  '/run',
  '/boot',
  '/root',
  '/bin',
  '/sbin',
  '/usr/bin',
  '/usr/sbin',
  '/lib',
  '/lib64',
];

/**
 * Validate that the resolved path is safe to scan.
 * Returns an error message string, or null if the path is acceptable.
 *
 * @param {string} resolved - Absolute path after path.resolve().
 * @returns {string|null}
 */
function validatePath(resolved) {
  // Normalise for comparison
  const norm = resolved.replace(/\/+$/, '');

  // Block sensitive system directories
  for (const prefix of BLOCKED_PREFIXES) {
    if (norm === prefix || norm.startsWith(prefix + '/')) {
      return `Access to system path "${prefix}" is not allowed.`;
    }
  }

  // Optionally restrict to a configured root (e.g. SCAN_ROOT=/home)
  const allowedRoot = process.env.SCAN_ROOT;
  if (allowedRoot) {
    const normAllowed = path.resolve(allowedRoot);
    if (!norm.startsWith(normAllowed + '/') && norm !== normAllowed) {
      return `Path must be inside the configured SCAN_ROOT (${normAllowed}).`;
    }
  }

  return null;
}

/**
 * Analyze a project directory and build its dependency graph.
 * Performs security validation, file scanning, and AST parsing.
 *
 * @param {string} projectPath - Project path (absolute or relative).
 * @returns {Promise<{rootDir: string, fileCount: number, graph: object}>}
 * @throws {Error} If the path is invalid or analysis fails.
 */
export async function analyzeProject(projectPath) {
  const rootDir = path.resolve(projectPath);

  // Security: block sensitive paths before hitting the filesystem
  const securityError = validatePath(rootDir);
  if (securityError) {
    const err = new Error(securityError);
    err.statusCode = 403;
    throw err;
  }

  // Verify the directory actually exists and is accessible
  try {
    const info = await stat(rootDir);
    if (!info.isDirectory()) {
      const err = new Error(`"${rootDir}" is not a directory.`);
      err.statusCode = 400;
      throw err;
    }
  } catch (e) {
    if (e.statusCode) throw e;
    const err = new Error(`Directory "${rootDir}" does not exist or is not accessible.`);
    err.statusCode = 400;
    throw err;
  }

  const files = await scanFiles(rootDir);

  if (files.length === 0) {
    return {
      rootDir,
      fileCount: 0,
      graph: {},
      message: 'No JS/TS files found at the given path.',
    };
  }

  const graph = await buildDependencyGraph(files, rootDir);

  return {
    rootDir,
    fileCount: files.length,
    graph,
  };
}
