import { analyzeProject } from './analyze.service.js';

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

  try {
    const result = await analyzeProject(projectPath);
    return res.status(200).json(result);
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({ error: err.message || 'Analysis failed.' });
  }
}
