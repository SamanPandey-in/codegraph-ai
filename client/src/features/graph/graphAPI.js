import axios from 'axios';

/** Base URL of the backend API. In dev the Vite proxy handles an empty string. */
const API_BASE = import.meta.env.VITE_API_URL || '';

/**
 * Analyzes a project at the given path.
 * Returns the dependency graph.
 *
 * @param {string} projectPath - Absolute or relative path to the project
 * @returns {Promise<{rootDir: string, fileCount: number, graph: object}>}
 */
export async function analyzeProject(projectPath) {
  const { data } = await axios.post(`${API_BASE}/analyze`, { path: projectPath.trim() });
  return data;
}

/**
 * Analyze a project directory and fetch its dependency graph.
 *
 * @param {string} projectPath - Project path to analyze
 * @returns {Promise<{rootDir: string, fileCount: number, graph: object}>}
 */
export async function analyzeCodebase(projectPath) {
  const { data } = await axios.post(`${API_BASE}/analyze`, { path: projectPath.trim() });
  return data;
}
