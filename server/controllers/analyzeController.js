import { scanFiles } from '../services/fileScanner.js';
import { buildDependencyGraph } from '../services/astParser.js';
import path from 'path';

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

  // Resolve relative paths from cwd
  const rootDir = path.resolve(projectPath);

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
