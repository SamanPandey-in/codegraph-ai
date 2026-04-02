import neo4j from 'neo4j-driver';
import { pgPool } from '../../infrastructure/connections.js';
import { BaseAgent } from '../core/BaseAgent.js';
import { scoreAnalysis } from '../core/confidence.js';

const MAX_HOPS = 6;

function getNeo4jDriver() {
  const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
  const user = process.env.NEO4J_USER || 'neo4j';
  const pass = process.env.NEO4J_PASSWORD || 'neo4j';
  return neo4j.driver(uri, neo4j.auth.basic(user, pass));
}

function toNumber(value, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value?.toNumber === 'function') {
    try {
      const converted = value.toNumber();
      return Number.isFinite(converted) ? converted : fallback;
    } catch {
      return fallback;
    }
  }

  return fallback;
}

async function bfsNeo4j(jobId, startNode, maxHops) {
  const driver = getNeo4jDriver();
  const session = driver.session();

  try {
    const result = await session.run(
      `
      MATCH path = (start { jobId: $jobId, path: $startNode })-[*1..${maxHops}]->(impacted)
      WHERE impacted.jobId = $jobId
      RETURN
        impacted.path AS path,
        length(path) AS depth,
        labels(impacted)[0] AS nodeType
      ORDER BY depth ASC
      `,
      { jobId, startNode },
    );

    const nodes = [];
    for (const record of result.records) {
      nodes.push({
        path: String(record.get('path') || ''),
        depth: toNumber(record.get('depth'), 0),
        nodeType: String(record.get('nodeType') || 'Node'),
      });
    }

    return { nodes, source: 'neo4j' };
  } finally {
    await session.close();
    await driver.close();
  }
}

async function bfsPostgres(jobId, startNode, maxHops) {
  const edgeResult = await pgPool.query(
    'SELECT source_path, target_path FROM graph_edges WHERE job_id = $1',
    [jobId],
  );

  const reverseMap = new Map();
  for (const row of edgeResult.rows) {
    if (!reverseMap.has(row.target_path)) {
      reverseMap.set(row.target_path, []);
    }
    reverseMap.get(row.target_path).push(row.source_path);
  }

  const visited = new Set([startNode]);
  const nodes = [];
  let current = [startNode];
  let depth = 0;

  while (current.length > 0 && depth < maxHops) {
    depth += 1;
    const next = [];

    for (const node of current) {
      for (const dep of reverseMap.get(node) || []) {
        if (visited.has(dep)) {
          continue;
        }

        visited.add(dep);
        nodes.push({ path: dep, depth, nodeType: 'CodeFile' });
        next.push(dep);
      }
    }

    current = next;
  }

  return { nodes, source: 'postgres' };
}

export class ImpactAnalysisAgent extends BaseAgent {
  agentId = 'impact-analysis-agent';

  maxRetries = 1;

  timeoutMs = 30_000;

  async process(input, context) {
    const start = Date.now();
    const jobId = input?.jobId || context?.jobId;
    const nodePath = input?.nodePath;
    const maxHops = Number.isFinite(Number(input?.maxHops))
      ? Math.min(MAX_HOPS, Math.max(1, Number(input.maxHops)))
      : MAX_HOPS;

    if (!jobId || !nodePath) {
      return this.buildResult({
        jobId: context?.jobId,
        status: 'failed',
        confidence: 0,
        data: {},
        errors: [{ code: 400, message: 'ImpactAnalysisAgent requires jobId and nodePath.' }],
        warnings: [],
        metrics: {},
        processingTimeMs: Date.now() - start,
      });
    }

    const warnings = [];
    let result;

    try {
      result = await bfsNeo4j(jobId, nodePath, maxHops);
    } catch (neo4jErr) {
      warnings.push(`Neo4j BFS unavailable (${neo4jErr.message}), falling back to Postgres.`);

      try {
        result = await bfsPostgres(jobId, nodePath, Math.min(maxHops, 3));
      } catch (pgErr) {
        return this.buildResult({
          jobId,
          status: 'failed',
          confidence: 0,
          data: {},
          errors: [{ code: 500, message: `Both BFS strategies failed: ${pgErr.message}` }],
          warnings,
          metrics: {},
          processingTimeMs: Date.now() - start,
        });
      }
    }

    const direct = result.nodes.filter((node) => node.depth === 1);
    const nearTransitive = result.nodes.filter((node) => node.depth >= 2 && node.depth <= 3);
    const farTransitive = result.nodes.filter((node) => node.depth >= 4);

    return this.buildResult({
      jobId,
      status: 'success',
      confidence: scoreAnalysis(),
      data: {
        startNode: nodePath,
        impactedNodes: result.nodes,
        direct,
        nearTransitive,
        farTransitive,
        totalImpacted: result.nodes.length,
        maxDepth: Math.max(0, ...result.nodes.map((node) => node.depth)),
        source: result.source,
      },
      errors: [],
      warnings,
      metrics: {
        totalImpacted: result.nodes.length,
        directCount: direct.length,
        transitiveCount: nearTransitive.length + farTransitive.length,
        source: result.source,
      },
      processingTimeMs: Date.now() - start,
    });
  }
}
