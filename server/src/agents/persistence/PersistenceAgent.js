import { BaseAgent } from '../core/BaseAgent.js';
import { scorePersistence } from '../core/confidence.js';
import { pgPool } from '../../infrastructure/connections.js';

function toJson(value, fallback) {
  if (value === undefined || value === null) return JSON.stringify(fallback);
  return JSON.stringify(value);
}

function toVectorLiteral(embedding) {
  if (!Array.isArray(embedding) || embedding.length === 0) return null;

  const normalized = embedding
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));

  if (normalized.length === 0) return null;
  return `[${normalized.join(',')}]`;
}

export class PersistenceAgent extends BaseAgent {
  agentId = 'persistence-agent';
  maxRetries = 1;
  timeoutMs = 120_000;

  constructor({ db } = {}) {
    super();
    this.db = db || pgPool;
  }

  async process(input, context) {
    const start = Date.now();
    const errors = [];
    const warnings = [];

    const jobId = input?.jobId || context?.jobId;
    const graph = input?.graph || {};
    const edges = Array.isArray(input?.edges) ? input.edges : [];
    const functionNodes = input?.functionNodes || {};
    const embeddings = input?.embeddings || {};
    const enriched = input?.enriched || {};
    const topology = input?.topology || {};

    if (!jobId) {
      return this.buildResult({
        jobId: context?.jobId,
        status: 'failed',
        confidence: 0,
        data: {},
        errors: [{ code: 400, message: 'PersistenceAgent requires a jobId.' }],
        warnings,
        metrics: {},
        processingTimeMs: Date.now() - start,
      });
    }

    const deadCodeSet = new Set(Array.isArray(topology.deadCodeCandidates) ? topology.deadCodeCandidates : []);

    const nodeEntries = Object.entries(graph);

    const nodePaths = [];
    const nodeTypes = [];
    const nodeDeclarations = [];
    const nodeMetrics = [];
    const nodeSummaries = [];
    const nodeDeadFlags = [];

    for (const [filePath, node] of nodeEntries) {
      nodePaths.push(filePath);
      nodeTypes.push(node?.type || 'module');
      nodeDeclarations.push(toJson(node?.declarations, []));
      nodeMetrics.push(toJson(node?.metrics, {}));
      nodeSummaries.push(enriched?.[filePath]?.summary || null);
      nodeDeadFlags.push(deadCodeSet.has(filePath));
    }

    const edgeSourcePaths = [];
    const edgeTargetPaths = [];
    const edgeTypes = [];

    for (const edge of edges) {
      if (!edge?.source || !edge?.target) continue;
      edgeSourcePaths.push(edge.source);
      edgeTargetPaths.push(edge.target);
      edgeTypes.push(edge.type || 'import');
    }

    const embeddingPaths = [];
    const embeddingVectors = [];

    for (const [filePath, vector] of Object.entries(embeddings)) {
      const vectorLiteral = toVectorLiteral(vector);
      if (!vectorLiteral) continue;

      embeddingPaths.push(filePath);
      embeddingVectors.push(vectorLiteral);
    }

    const functionNodePaths = [];
    const functionNodeNames = [];
    const functionNodeKinds = [];
    const functionNodeCalls = [];
    const functionNodeLocs = [];

    for (const [filePath, declarations] of Object.entries(functionNodes)) {
      if (!Array.isArray(declarations)) continue;

      for (const declaration of declarations) {
        if (!declaration?.name) continue;

        functionNodePaths.push(filePath);
        functionNodeNames.push(declaration.name);
        functionNodeKinds.push(declaration.kind || 'function');
        functionNodeCalls.push(toJson(Array.isArray(declaration.calls) ? declaration.calls : [], []));
        functionNodeLocs.push(Number.isFinite(declaration.loc) ? Number(declaration.loc) : null);
      }
    }

    const recordsAttempted =
      nodePaths.length +
      edgeSourcePaths.length +
      embeddingPaths.length +
      functionNodePaths.length;
    let recordsWritten = 0;

    let client;
    try {
      client = await this.db.connect();
      await client.query('BEGIN');

      if (nodePaths.length > 0) {
        const nodeResult = await client.query(
          `
            INSERT INTO graph_nodes (
              job_id,
              file_path,
              file_type,
              declarations,
              metrics,
              summary,
              is_dead_code
            )
            SELECT
              $1,
              unnest($2::text[]),
              unnest($3::text[]),
              unnest($4::jsonb[]),
              unnest($5::jsonb[]),
              unnest($6::text[]),
              unnest($7::boolean[])
            ON CONFLICT (job_id, file_path) DO UPDATE
            SET file_type = EXCLUDED.file_type,
                declarations = EXCLUDED.declarations,
                metrics = EXCLUDED.metrics,
                summary = EXCLUDED.summary,
                is_dead_code = EXCLUDED.is_dead_code
          `,
          [
            jobId,
            nodePaths,
            nodeTypes,
            nodeDeclarations,
            nodeMetrics,
            nodeSummaries,
            nodeDeadFlags,
          ],
        );

        recordsWritten += nodeResult.rowCount || 0;
      }

      await client.query('SAVEPOINT after_nodes');

      if (edgeSourcePaths.length > 0) {
        const edgeResult = await client.query(
          `
            INSERT INTO graph_edges (
              job_id,
              source_path,
              target_path,
              edge_type
            )
            SELECT
              $1,
              unnest($2::text[]),
              unnest($3::text[]),
              unnest($4::text[])
            ON CONFLICT (job_id, source_path, target_path) DO UPDATE
            SET edge_type = EXCLUDED.edge_type
          `,
          [jobId, edgeSourcePaths, edgeTargetPaths, edgeTypes],
        );

        recordsWritten += edgeResult.rowCount || 0;
      }

      await client.query('SAVEPOINT after_edges');

      if (embeddingPaths.length > 0) {
        const embeddingResult = await client.query(
          `
            INSERT INTO file_embeddings (
              job_id,
              file_path,
              embedding
            )
            SELECT
              $1,
              t.file_path,
              t.embedding::vector
            FROM unnest($2::text[], $3::text[]) AS t(file_path, embedding)
            ON CONFLICT (job_id, file_path) DO UPDATE
            SET embedding = EXCLUDED.embedding
          `,
          [jobId, embeddingPaths, embeddingVectors],
        );

        recordsWritten += embeddingResult.rowCount || 0;
      }

      await client.query('SAVEPOINT after_embeddings');

      if (functionNodePaths.length > 0) {
        const functionNodeResult = await client.query(
          `
            INSERT INTO function_nodes (
              job_id,
              file_path,
              name,
              kind,
              calls,
              loc
            )
            SELECT
              $1,
              unnest($2::text[]),
              unnest($3::text[]),
              unnest($4::text[]),
              unnest($5::jsonb[]),
              unnest($6::integer[])
            ON CONFLICT (job_id, file_path, name) DO UPDATE
            SET kind = EXCLUDED.kind,
                calls = EXCLUDED.calls,
                loc = EXCLUDED.loc
          `,
          [
            jobId,
            functionNodePaths,
            functionNodeNames,
            functionNodeKinds,
            functionNodeCalls,
            functionNodeLocs,
          ],
        );

        recordsWritten += functionNodeResult.rowCount || 0;
      }

      await client.query('COMMIT');

      const confidence = scorePersistence({
        recordsAttempted,
        recordsWritten,
      });

      return this.buildResult({
        jobId,
        status: 'success',
        confidence,
        data: {
          written: {
            nodes: nodePaths.length,
            edges: edgeSourcePaths.length,
            embeddings: embeddingPaths.length,
            functionNodes: functionNodePaths.length,
          },
          durationMs: Date.now() - start,
        },
        errors,
        warnings,
        metrics: {
          recordsAttempted,
          recordsWritten,
        },
        processingTimeMs: Date.now() - start,
      });
    } catch (error) {
      if (client) {
        try {
          await client.query('ROLLBACK');
        } catch {
          warnings.push('Rollback failed after persistence error.');
        }
      }

      return this.buildResult({
        jobId,
        status: 'failed',
        confidence: 0,
        data: {},
        errors: [{ code: error.statusCode || 500, message: error.message }],
        warnings,
        metrics: {
          recordsAttempted,
          recordsWritten,
        },
        processingTimeMs: Date.now() - start,
      });
    } finally {
      if (client) client.release();
    }
  }
}
