import { IngestionAgent } from '../ingestion/IngestionAgent.js';
import { ScannerAgent } from '../scanner/ScannerAgent.js';
import { ParserAgent } from '../parser/ParserAgent.js';
import { GraphBuilderAgent } from '../graph/GraphBuilderAgent.js';
import { EnrichmentAgent } from '../enrichment/EnrichmentAgent.js';
import { EmbeddingAgent } from '../embedding/EmbeddingAgent.js';
import { PersistenceAgent } from '../persistence/PersistenceAgent.js';
import { AuditLogger } from './AuditLogger.js';
import { JobStatusEmitter } from './JobStatusEmitter.js';
import { decideConfidence, computeOverallConfidence } from './confidence.js';
import {
  buildGraphCacheKey,
  deleteCacheKey,
  invalidateAnalysisHistoryCacheForUser,
} from '../../infrastructure/cache.js';

export class SupervisorAgent {
  constructor({ db, redis } = {}) {
    this.db = db;
    this.redis = redis;

    this.logger = new AuditLogger(db);
    this.emitter = new JobStatusEmitter(redis);

    this.agents = {
      ingestion: new IngestionAgent(),
      scanner: new ScannerAgent(),
      parser: new ParserAgent(),
      graphBuilder: new GraphBuilderAgent(),
      enrichment: new EnrichmentAgent(),
      embedding: new EmbeddingAgent(),
      persistence: new PersistenceAgent({ db }),
    };
  }

  async runPipeline(jobId, input) {
    const context = { jobId, startedAt: Date.now() };
    const agentTrace = [];
    const pipelineData = {};

    await this._updateJobStatus(jobId, 'ingesting');

    try {
      const ingestionResult = await this._runWithSupervision(this.agents.ingestion, input, context);
      agentTrace.push(ingestionResult);
      if (ingestionResult.status === 'failed') return this._abort(jobId, ingestionResult, agentTrace);
      Object.assign(pipelineData, ingestionResult.data);

      await this._updateJobStatus(jobId, 'scanning');
      const scanResult = await this._runWithSupervision(
        this.agents.scanner,
        { extractedPath: pipelineData.extractedPath, repoMeta: pipelineData.repoMeta },
        context,
      );
      agentTrace.push(scanResult);
      if (scanResult.status === 'failed') return this._abort(jobId, scanResult, agentTrace);
      Object.assign(pipelineData, scanResult.data);

      await this._updateJobStatus(jobId, 'parsing');
      const parseResult = await this._runWithSupervision(
        this.agents.parser,
        { manifest: pipelineData.manifest, extractedPath: pipelineData.extractedPath },
        context,
      );
      agentTrace.push(parseResult);
      if (parseResult.status === 'failed') return this._abort(jobId, parseResult, agentTrace);
      Object.assign(pipelineData, parseResult.data);

      await this._updateJobStatus(jobId, 'building');
      const graphResult = await this._runWithSupervision(
        this.agents.graphBuilder,
        { parsedFiles: pipelineData.parsedFiles, extractedPath: pipelineData.extractedPath },
        context,
      );
      agentTrace.push(graphResult);
      if (graphResult.status === 'failed') return this._abort(jobId, graphResult, agentTrace);
      Object.assign(pipelineData, graphResult.data);

      await this._updateJobStatus(jobId, 'enriching');
      const enrichmentResult = await this._runWithSupervision(
        this.agents.enrichment,
        {
          graph: pipelineData.graph,
          extractedPath: pipelineData.extractedPath,
        },
        context,
        { abortOnCritical: false },
      );
      agentTrace.push(enrichmentResult);
      Object.assign(pipelineData, enrichmentResult.data);

      await this._updateJobStatus(jobId, 'embedding');
      const embeddingResult = await this._runWithSupervision(
        this.agents.embedding,
        {
          graph: pipelineData.graph,
          enriched: pipelineData.enriched,
          jobId,
        },
        context,
        { abortOnCritical: false },
      );
      agentTrace.push(embeddingResult);
      Object.assign(pipelineData, embeddingResult.data);

      await this._updateJobStatus(jobId, 'persisting');
      const persistenceResult = await this._runWithSupervision(
        this.agents.persistence,
        {
          jobId,
          repositoryId: input?.repositoryId,
          graph: pipelineData.graph,
          edges: pipelineData.edges,
          enriched: pipelineData.enriched,
          embeddings: pipelineData.embeddings,
          topology: pipelineData.topology,
        },
        context,
      );
      agentTrace.push(persistenceResult);
      if (persistenceResult.status === 'failed') return this._abort(jobId, persistenceResult, agentTrace);

      const overallConfidence = computeOverallConfidence(agentTrace);

      await this._updateJobStatus(jobId, 'completed', {
        overallConfidence,
        agentTrace,
        fileCount: pipelineData.manifest?.length || 0,
        nodeCount: Object.keys(pipelineData.graph || {}).length,
        edgeCount: pipelineData.edges?.length || 0,
      });

      await this.agents.ingestion.cleanup(pipelineData.tempRoot);

      return {
        jobId,
        status: 'completed',
        overallConfidence,
        agentTrace,
      };
    } catch (error) {
      await this._abort(jobId, { errors: [{ message: error.message }] }, agentTrace);
      await this.agents.ingestion.cleanup(pipelineData.tempRoot).catch(() => {});
      throw error;
    }
  }

  async _runWithSupervision(agent, input, context, opts = { abortOnCritical: true }) {
    let attempt = 0;
    let lastResult;

    while (attempt <= agent.maxRetries) {
      attempt += 1;
      const result = await this._runWithTimeout(agent, input, context);
      result.retryCount = attempt - 1;

      await this.logger.log({
        ...result,
        attempt,
        jobId: context.jobId,
      });

      const decision = decideConfidence(result.confidence);

      if (decision === 'PROCEED' || decision === 'PROCEED_WARN') {
        if (decision === 'PROCEED_WARN') {
          result.warnings = [...(result.warnings || []), 'Proceeding with medium confidence'];
        }
        return result;
      }

      if (decision === 'RETRY' && attempt <= agent.maxRetries) {
        lastResult = result;
        await this._sleep(Math.pow(2, attempt) * 500);
        continue;
      }

      const confidenceMessage = `${agent.agentId} confidence ${result.confidence} was too low to continue.`;

      if (opts.abortOnCritical) {
        result.status = 'failed';
        result.errors = [
          ...(result.errors || []),
          { message: confidenceMessage },
        ];
      } else {
        result.status = 'partial';
        result.warnings = [
          ...(result.warnings || []),
          `${confidenceMessage} Proceeding in degraded mode.`,
        ];
      }
      return result;
    }

    return lastResult;
  }

  async _runWithTimeout(agent, input, context) {
    return Promise.race([
      agent.process(input, context),
      new Promise((_, reject) => {
        setTimeout(
          () => reject(new Error(`${agent.agentId} timed out after ${agent.timeoutMs}ms`)),
          agent.timeoutMs,
        );
      }),
    ]).catch((error) =>
      agent.buildResult({
        jobId: context.jobId,
        status: 'failed',
        confidence: 0,
        data: {},
        errors: [{ message: error.message }],
        warnings: [],
        metrics: {},
        processingTimeMs: agent.timeoutMs,
      }),
    );
  }

  async _abort(jobId, result, agentTrace) {
    const summary = result.errors?.map((e) => e.message).join('; ') || 'Agent failed';
    await this._updateJobStatus(jobId, 'failed', {
      errorSummary: summary,
      agentTrace,
    });

    return {
      jobId,
      status: 'failed',
      error: summary,
      agentTrace,
    };
  }

  async _updateJobStatus(jobId, status, extra = {}) {
    if (this.db && typeof this.db.query === 'function') {
      try {
        await this.db.query(
          `
            UPDATE analysis_jobs
            SET
              status = $1::job_status,
              overall_confidence = COALESCE($2, overall_confidence),
              file_count = COALESCE($3, file_count),
              node_count = COALESCE($4, node_count),
              edge_count = COALESCE($5, edge_count),
              error_summary = COALESCE($6, error_summary),
              started_at = CASE
                WHEN $1::job_status = 'ingesting'::job_status AND started_at IS NULL
                  THEN NOW()
                ELSE started_at
              END,
              completed_at = CASE
                WHEN $1::job_status IN (
                  'completed'::job_status,
                  'failed'::job_status,
                  'partial'::job_status
                )
                  THEN NOW()
                ELSE completed_at
              END,
              agent_trace = COALESCE($7::jsonb, agent_trace)
            WHERE id = $8
          `,
          [
            status,
            extra.overallConfidence ?? null,
            extra.fileCount ?? null,
            extra.nodeCount ?? null,
            extra.edgeCount ?? null,
            extra.errorSummary ?? null,
            extra.agentTrace ? JSON.stringify(extra.agentTrace) : null,
            jobId,
          ],
        );
      } catch (error) {
        // Status emission still proceeds even if DB status update fails.
        console.error('[SupervisorAgent] Failed to update analysis_jobs status:', error.message);
      }
    }

    if (['completed', 'failed', 'partial'].includes(status)) {
      await this._invalidateReadCachesForJob(jobId);
    }

    await this.emitter.emit(jobId, { status, ...extra });
  }

  async _invalidateReadCachesForJob(jobId) {
    try {
      await deleteCacheKey(this.redis, buildGraphCacheKey(jobId));

      if (!this.db || typeof this.db.query !== 'function') return;

      const jobResult = await this.db.query(
        `
          SELECT user_id
          FROM analysis_jobs
          WHERE id = $1
          LIMIT 1
        `,
        [jobId],
      );

      const userId = jobResult.rows?.[0]?.user_id;
      if (userId) {
        await invalidateAnalysisHistoryCacheForUser(this.redis, userId);
      }
    } catch (error) {
      console.error('[SupervisorAgent] Failed to invalidate Redis caches:', error.message);
    }
  }

  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
