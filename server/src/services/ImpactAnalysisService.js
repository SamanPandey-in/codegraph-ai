import { pgPool } from '../infrastructure/connections.js';

/**
 * Impact Analysis Service
 * Analyzes code graph to determine which files are impacted by changes
 */

class ImpactAnalysisService {
  /**
   * Find all files impacted by changed files
   * Traverses the dependency graph to find files that depend on changed files
   *
   * @param {string} jobId - Analysis job ID
   * @param {Array<string>} changedFiles - Array of file paths that changed
   * @param {number} maxDepth - Maximum dependency depth to traverse (default: 3)
   * @returns {Promise<{impactedFiles: Set<string>, depth: number}>}
   */
  async findImpactedFiles(jobId, changedFiles, maxDepth = 3) {
    if (!jobId || changedFiles.length === 0) {
      return { impactedFiles: new Set(), depth: 0 };
    }

    const impactedFiles = new Set();
    const visited = new Set(changedFiles);
    let currentLevel = changedFiles;
    let depth = 0;

    try {
      // Fetch the entire graph for this job
      const graphResult = await pgPool.query(
        `
          SELECT relativePath, dependencies
          FROM graph_nodes
          WHERE jobId = $1
        `,
        [jobId],
      );

      if (graphResult.rowCount === 0) {
        return { impactedFiles: new Set(), depth: 0 };
      }

      // Build an adjacency map: file -> files that depend on it
      const dependencyMap = new Map();
      const allNodes = graphResult.rows;

      for (const node of allNodes) {
        const deps = node.dependencies || [];
        for (const dep of deps) {
          if (!dependencyMap.has(dep)) {
            dependencyMap.set(dep, []);
          }
          dependencyMap.get(dep).push(node.relativePath);
        }
      }

      // BFS traversal: find all files that depend on changed files
      while (currentLevel.length > 0 && depth < maxDepth) {
        const nextLevel = [];

        for (const file of currentLevel) {
          const dependents = dependencyMap.get(file) || [];

          for (const dependent of dependents) {
            if (!visited.has(dependent)) {
              visited.add(dependent);
              impactedFiles.add(dependent);
              nextLevel.push(dependent);
            }
          }
        }

        currentLevel = nextLevel;
        depth++;
      }

      return { impactedFiles, depth };
    } catch (err) {
      console.error('Failed to find impacted files:', err);
      return { impactedFiles: new Set(), depth: 0 };
    }
  }

  /**
   * Analyze which files are safe to change (no dependents)
   *
   * @param {string} jobId - Analysis job ID
   * @param {Array<string>} changedFiles - Array of file paths that changed
   * @returns {Promise<{safeFiles: Array<string>, riskyFiles: Array<string>}>}
   */
  async analyzeChangeRisk(jobId, changedFiles) {
    if (!jobId || changedFiles.length === 0) {
      return { safeFiles: [], riskyFiles: [] };
    }

    try {
      const result = await pgPool.query(
        `
          SELECT relativePath, 
                 (SELECT COUNT(*) FROM graph_nodes gn2 WHERE $1::text[] && gn2.dependencies AND gn2.jobId = $2) as dependentCount
          FROM graph_nodes
          WHERE jobId = $2 AND relativePath = ANY($1)
        `,
        [changedFiles, jobId],
      );

      const safeFiles = [];
      const riskyFiles = [];

      for (const row of result.rows) {
        if (row.dependentCount === 0) {
          safeFiles.push(row.relativePath);
        } else {
          riskyFiles.push(row.relativePath);
        }
      }

      return { safeFiles, riskyFiles };
    } catch (err) {
      console.error('Failed to analyze change risk:', err);
      return { safeFiles: [], riskyFiles: [] };
    }
  }

  /**
   * Get circular dependencies for changed files
   * Useful for identifying refactoring risks
   *
   * @param {string} jobId - Analysis job ID
   * @param {Array<string>} changedFiles - Array of file paths that changed
   * @returns {Promise<Array<Array<string>>>} Array of circular dependency paths
   */
  async findCircularDependencies(jobId, changedFiles) {
    if (!jobId || changedFiles.length === 0) {
      return [];
    }

    try {
      const result = await pgPool.query(
        `
          SELECT cirularDeps
          FROM graph_nodes
          WHERE jobId = $1 AND relativePath = ANY($2) AND cirularDeps IS NOT NULL
        `,
        [jobId, changedFiles],
      );

      const cycles = [];
      for (const row of result.rows) {
        if (Array.isArray(row.circularDeps)) {
          cycles.push(...row.circularDeps);
        }
      }

      return cycles;
    } catch (err) {
      console.error('Failed to find circular dependencies:', err);
      return [];
    }
  }
}

export default new ImpactAnalysisService();
