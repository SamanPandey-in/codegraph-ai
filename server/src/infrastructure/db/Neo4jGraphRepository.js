import { IGraphRepository } from './IGraphRepository.js';
import { PostgresGraphRepository } from './PostgresGraphRepository.js';

const VALID_RELATIONSHIPS = new Set([
  'IMPORTS',
  'CALLS',
  'EXPOSES_API',
  'CONSUMES_API',
  'USES_TABLE',
  'USES_FIELD',
  'EMITS_EVENT',
  'LISTENS_EVENT',
]);

const LABEL_MAP = {
  EXPOSES_API: 'ApiEndpoint',
  CONSUMES_API: 'ApiEndpoint',
  USES_TABLE: 'DatabaseTable',
  USES_FIELD: 'DatabaseField',
  EMITS_EVENT: 'EventChannel',
  LISTENS_EVENT: 'EventChannel',
  IMPORTS: 'CodeFile',
  CALLS: 'Symbol',
};

export class Neo4jGraphRepository extends IGraphRepository {
  constructor({ driver, pgPool }) {
    super();
    this.driver = driver;
    // We delegate non-graph persistence to the Postgres repository
    this.pgRepo = new PostgresGraphRepository(pgPool);
  }

  async persistGraph(params) {
    const { jobId, graph = {}, typedEdges = [], topology = {} } = params;
    
    // 1. Persist everything to Postgres first (as the "always" primary)
    await this.pgRepo.persistGraph(params);

    // 2. Persist graph structure to Neo4j
    const session = this.driver.session();
    try {
      // 2.1 AnalysisJob node
      await session.run(
        `MERGE (j:AnalysisJob { jobId: $jobId })
         SET j.repositoryId = $repositoryId, j.status = $status, j.nodeCount = $nodeCount, j.edgeCount = $edgeCount`,
        {
          jobId,
          repositoryId: params.repositoryId || 'unknown',
          status: 'completed',
          nodeCount: topology.nodeCount || 0,
          edgeCount: topology.edgeCount || 0,
        }
      );

      // 2.2 CodeFile nodes
      const fileEntries = Object.entries(graph);
      const deadCodeSet = new Set(topology.deadCodeCandidates || []);
      const fileBatchSize = 100;

      for (let i = 0; i < fileEntries.length; i += fileBatchSize) {
        const batch = fileEntries.slice(i, i + fileBatchSize).map(([path, node]) => ({
          path,
          type: node?.type || 'module',
          language: node?.language || 'unknown',
          isDead: deadCodeSet.has(path),
          jobId,
        }));

        await session.run(
          `UNWIND $batch AS item
           MERGE (f:CodeFile { jobId: item.jobId, path: item.path })
           SET f.type = item.type, f.language = item.language, f.isDead = item.isDead`,
          { batch }
        );
      }

      // 2.3 Relationships
      const edges = typedEdges.filter((e) => VALID_RELATIONSHIPS.has(e.type));
      const edgeBatchSize = 200;

      for (let i = 0; i < edges.length; i += edgeBatchSize) {
        const batch = edges.slice(i, i + edgeBatchSize);
        const byType = {};
        for (const edge of batch) {
          (byType[edge.type] = byType[edge.type] || []).push(edge);
        }

        for (const [relType, typeEdges] of Object.entries(byType)) {
          const targetLabel = LABEL_MAP[relType] || 'Node';
          await session.run(
            `UNWIND $edges AS e
             MERGE (src:CodeFile { jobId: $jobId, path: e.source })
             MERGE (tgt:${targetLabel} { jobId: $jobId, path: e.target })
             MERGE (src)-[r:\`${relType}\` { jobId: $jobId }]->(tgt)`,
            { edges: typeEdges, jobId }
          );
        }
      }
    } finally {
      await session.close();
    }
  }

  async getDependencies(jobId, filePath, n = 5) {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH path = (start:CodeFile { jobId: $jobId, path: $filePath })
                      -[:IMPORTS*1..${n}]->(dep:CodeFile { jobId: $jobId })
         RETURN DISTINCT dep.path AS path, length(path) AS depth
         ORDER BY depth, dep.path`,
        { jobId, filePath }
      );
      return result.records.map((r) => r.get('path'));
    } finally {
      await session.close();
    }
  }

  async getImpactedFiles(jobId, filePath, n = 5) {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH path = (dep:CodeFile { jobId: $jobId })-[:IMPORTS*1..${n}]->
                       (changed:CodeFile { jobId: $jobId, path: $filePath })
         RETURN DISTINCT dep.path AS path, length(path) AS depth
         ORDER BY depth, dep.path`,
        { jobId, filePath }
      );
      return result.records.map((r) => r.get('path'));
    } finally {
      await session.close();
    }
  }

  async healthCheck() {
    const session = this.driver.session();
    try {
      await session.run('RETURN 1');
      return true;
    } finally {
      await session.close();
    }
  }

  async deleteJob(jobId) {
    const session = this.driver.session();
    try {
      // Detach delete all nodes associated with the jobId
      await session.run(
        `MATCH (n { jobId: $jobId }) DETACH DELETE n`,
        { jobId }
      );
    } finally {
      await session.close();
    }
    // Also delete from Postgres
    await this.pgRepo.deleteJob(jobId);
  }
}
