import neo4j from 'neo4j-driver';
import { BaseAgent } from '../core/BaseAgent.js';
import { scoreNeo4jSeed } from '../core/confidence.js';

function getNeo4jDriver() {
  const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
  const user = process.env.NEO4J_USER || 'neo4j';
  const pass = process.env.NEO4J_PASSWORD || 'neo4j';
  return neo4j.driver(uri, neo4j.auth.basic(user, pass));
}

const VALID_TYPES = new Set([
  'IMPORTS',
  'CALLS',
  'EXPOSES_API',
  'CONSUMES_API',
  'USES_TABLE',
  'USES_FIELD',
  'EMITS_EVENT',
  'LISTENS_EVENT',
]);

function targetLabel(type) {
  const map = {
    EXPOSES_API: 'ApiEndpoint',
    CONSUMES_API: 'ApiEndpoint',
    USES_TABLE: 'DatabaseTable',
    USES_FIELD: 'DatabaseField',
    EMITS_EVENT: 'EventChannel',
    LISTENS_EVENT: 'EventChannel',
    IMPORTS: 'CodeFile',
    CALLS: 'Symbol',
  };
  return map[type] || 'Node';
}

export class Neo4jSeedAgent extends BaseAgent {
  agentId = 'neo4j-seed-agent';
  maxRetries = 2;
  timeoutMs = 180_000;

  async process(input, context) {
    const start = Date.now();
    const errors = [];
    const warnings = [];

    const jobId = input?.jobId || context?.jobId;
    const typedEdges = Array.isArray(input?.typedEdges) ? input.typedEdges : [];
    const graph = input?.graph || {};

    if (!jobId || typedEdges.length === 0) {
      return this.buildResult({
        jobId: context?.jobId,
        status: 'failed',
        confidence: 0,
        data: {},
        errors: [{ code: 400, message: 'Neo4jSeedAgent requires jobId and typedEdges.' }],
        warnings,
        metrics: {},
        processingTimeMs: Date.now() - start,
      });
    }

    const driver = getNeo4jDriver();
    const session = driver.session();

    let nodesCreated = 0;
    let edgesCreated = 0;
    let failed = 0;

    try {
      await session.run(`
        CREATE CONSTRAINT file_node_id IF NOT EXISTS
        FOR (f:CodeFile) REQUIRE (f.jobId, f.path) IS UNIQUE
      `);

      const fileEntries = Object.entries(graph);
      const fileBatchSize = 100;

      for (let i = 0; i < fileEntries.length; i += fileBatchSize) {
        const batch = fileEntries.slice(i, i + fileBatchSize).map(([filePath, node]) => ({
          path: filePath,
          type: node?.type || 'module',
          jobId,
          language: node?.language || 'unknown',
        }));

        await session.run(
          `
            UNWIND $batch AS item
            MERGE (f:CodeFile { jobId: item.jobId, path: item.path })
            SET f.type = item.type,
                f.language = item.language,
                f.jobId = item.jobId
          `,
          { batch },
        );

        nodesCreated += batch.length;
      }

      const edgeBatchSize = 200;
      const validEdges = typedEdges.filter((edge) => VALID_TYPES.has(edge.type));

      for (let i = 0; i < validEdges.length; i += edgeBatchSize) {
        const batch = validEdges.slice(i, i + edgeBatchSize);
        const byType = {};
        for (const edge of batch) {
          (byType[edge.type] = byType[edge.type] || []).push(edge);
        }

        for (const [relType, edges] of Object.entries(byType)) {
          const target = targetLabel(relType);
          try {
            await session.run(
              `
                UNWIND $edges AS e
                MERGE (src:CodeFile { jobId: $jobId, path: e.source })
                MERGE (tgt:${target} { jobId: $jobId, path: e.target })
                MERGE (src)-[r:\`${relType}\` { jobId: $jobId }]->(tgt)
              `,
              { edges, jobId },
            );
            edgesCreated += edges.length;
          } catch (error) {
            failed += edges.length;
            warnings.push(`Neo4j edge batch failed (${relType}): ${error.message}`);
          }
        }
      }
    } catch (error) {
      errors.push({ code: 500, message: error.message });
    } finally {
      await session.close();
      await driver.close();
    }

    const confidence = scoreNeo4jSeed({
      edgesCreated,
      totalEdges: typedEdges.length,
      failedEdges: failed,
    });

    return this.buildResult({
      jobId: context?.jobId,
      status: errors.length > 0 ? 'failed' : failed > 0 ? 'partial' : 'success',
      confidence,
      data: { nodesCreated, edgesCreated, failedEdges: failed },
      errors,
      warnings,
      metrics: { nodesCreated, edgesCreated, failedEdges: failed },
      processingTimeMs: Date.now() - start,
    });
  }
}
