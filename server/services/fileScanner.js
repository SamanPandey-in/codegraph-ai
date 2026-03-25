import { promises as fs } from 'fs';
import path from 'path';

/** File extensions we want to scan. */
const ALLOWED_EXTENSIONS = new Set(['.js', '.ts', '.jsx', '.tsx']);

/**
 * Recursively collect all JS/TS source files under `rootDir`.
 *
 * @param {string} rootDir - Absolute path to the directory to scan.
 * @returns {Promise<string[]>} List of absolute file paths.
 */
export async function scanFiles(rootDir) {
  const results = [];

  async function walk(dir) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      // Directory not accessible – skip silently
      return;
    }

    for (const entry of entries) {
      // Skip common non-source directories
      if (entry.isDirectory()) {
        const skip = ['node_modules', '.git', 'dist', 'build', '.next', 'coverage'];
        if (!skip.includes(entry.name)) {
          await walk(path.join(dir, entry.name));
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (ALLOWED_EXTENSIONS.has(ext)) {
          results.push(path.join(dir, entry.name));
        }
      }
    }
  }

  await walk(rootDir);
  return results;
}
