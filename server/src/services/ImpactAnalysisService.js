import { pgPool } from '../infrastructure/connections.js';

class ImpactAnalysisService {
  async findImpactedFiles(jobId, changedFiles, maxDepth = 3) {
    if (!jobId || changedFiles.length === 0) {
      return { impactedFiles: new Set(), depth: 0 };
    }

    try {
      // Build reverse adjacency: target_path -> [source files that import it]
      const edgeResult = await pgPool.query(
        `
          SELECT source_path, target_path
          FROM graph_edges
          WHERE job_id = $1
        `,
        [jobId],
      );

      const reverseMap = new Map();
      for (const row of edgeResult.rows) {
        if (!reverseMap.has(row.target_path)) reverseMap.set(row.target_path, []);
        reverseMap.get(row.target_path).push(row.source_path);
      }

      const impactedFiles = new Set();
      const visited = new Set(changedFiles);
      let currentLevel = changedFiles;
      let depth = 0;

      while (currentLevel.length > 0 && depth < maxDepth) {
        const nextLevel = [];
        for (const file of currentLevel) {
          for (const dependent of reverseMap.get(file) || []) {
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
      console.error('[ImpactAnalysisService] findImpactedFiles failed:', err.message);
      return { impactedFiles: new Set(), depth: 0 };
    }
  }

  async analyzeChangeRisk(jobId, changedFiles) {
    if (!jobId || changedFiles.length === 0) {
      return { safeFiles: [], riskyFiles: [] };
    }

    try {
      const result = await pgPool.query(
        `
          SELECT gn.file_path,
                 COUNT(ge.source_path) AS dependent_count
          FROM graph_nodes gn
          LEFT JOIN graph_edges ge ON ge.target_path = gn.file_path AND ge.job_id = gn.job_id
          WHERE gn.job_id = $1 AND gn.file_path = ANY($2::text[])
          GROUP BY gn.file_path
        `,
        [jobId, changedFiles],
      );

      const safeFiles = [];
      const riskyFiles = [];

      for (const row of result.rows) {
        if (parseInt(row.dependent_count, 10) === 0) {
          safeFiles.push(row.file_path);
        } else {
          riskyFiles.push(row.file_path);
        }
      }

      return { safeFiles, riskyFiles };
    } catch (err) {
      console.error('[ImpactAnalysisService] analyzeChangeRisk failed:', err.message);
      return { safeFiles: [], riskyFiles: [] };
    }
  }
}

export default new ImpactAnalysisService();
