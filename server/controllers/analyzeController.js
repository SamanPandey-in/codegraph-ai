import { stat } from 'fs/promises';
import path from 'path';
import { scanFiles } from '../services/fileScanner.js';
import { buildDependencyGraph } from '../services/astParser.js';

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
 * POST /analyze
 * Body: { "path": "/absolute/or/relative/project/path" }
 * Returns a dependency graph JSON.
 */
export async function analyzeController(req, res) {
  const { path: projectPath } = req.body;

  if (!projectPath || typeof projectPath !== 'string') {
    return res.status(400).json({ error: 'A "path" string is required in the request body.' });
  }

  const rootDir = path.resolve(projectPath);

  // Security: block sensitive paths before hitting the filesystem
  const securityError = validatePath(rootDir);
  if (securityError) {
    return res.status(403).json({ error: securityError });
  }

  // Verify the directory actually exists and is accessible
  try {
    const info = await stat(rootDir);
    if (!info.isDirectory()) {
      return res.status(400).json({ error: `"${rootDir}" is not a directory.` });
    }
  } catch {
    return res.status(400).json({ error: `Directory "${rootDir}" does not exist or is not accessible.` });
  }

  try {
    const files = await scanFiles(rootDir);

    if (files.length === 0) {
      return res.status(200).json({
        rootDir,
        fileCount: 0,
        graph: {},
        message: 'No JS/TS files found at the given path.',
      });
    }

    const graph = await buildDependencyGraph(files, rootDir);

    return res.status(200).json({
      rootDir,
      fileCount: files.length,
      graph,
    });
  } catch (err) {
    console.error('Analysis error:', err);
    return res.status(500).json({ error: err.message || 'Analysis failed.' });
  }
}
