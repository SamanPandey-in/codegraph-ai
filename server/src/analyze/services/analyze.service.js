import { stat } from 'fs/promises';
import path from 'path';
import { scanFiles } from './fileScanner.service.js';
import { buildDependencyGraph } from './astParser.service.js';

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

function validatePath(resolved) {
  const norm = resolved.replace(/\/+$/, '');

  for (const prefix of BLOCKED_PREFIXES) {
    if (norm === prefix || norm.startsWith(prefix + '/')) {
      return `Access to system path "${prefix}" is not allowed.`;
    }
  }

  const allowedRoot = process.env.SCAN_ROOT;
  if (allowedRoot) {
    const normAllowed = path.resolve(allowedRoot);
    if (!norm.startsWith(normAllowed + '/') && norm !== normAllowed) {
      return `Path must be inside the configured SCAN_ROOT (${normAllowed}).`;
    }
  }

  return null;
}

export async function analyzeProject(projectPath) {
  const rootDir = path.resolve(projectPath);

  const securityError = validatePath(rootDir);
  if (securityError) {
    const err = new Error(securityError);
    err.statusCode = 403;
    throw err;
  }

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
