import crypto from 'crypto';
import path from 'path';
import { readFile } from 'fs/promises';
import OpenAI from 'openai';
import pLimit from 'p-limit';
import { BaseAgent } from '../core/BaseAgent.js';
import { scoreEnrichment } from '../core/confidence.js';
import { redisClient } from '../../infrastructure/connections.js';

const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const FILE_LINE_THRESHOLD = Number(process.env.ENRICHMENT_FILE_LINE_THRESHOLD || 50);
const CACHE_TTL_SECONDS = Number(process.env.AI_CACHE_TTL_SECONDS || 3600);
const ENRICHMENT_CONCURRENCY = Number(process.env.ENRICHMENT_CONCURRENCY || 4);

function normalizeConcurrency(value, fallback = 4) {
  if (Number.isInteger(value) && value > 0) return value;
  return fallback;
}

function toDeclarationList(declarations) {
  if (!Array.isArray(declarations) || declarations.length === 0) return 'none';
  return declarations
    .slice(0, 8)
    .map((item) => `${item.kind || 'symbol'} ${item.name || 'anonymous'}`)
    .join(', ');
}

function cheapSummary(filePath, node) {
  const declarations = Array.isArray(node?.declarations) ? node.declarations : [];
  const names = declarations
    .slice(0, 3)
    .map((d) => d?.name)
    .filter(Boolean);

  const capability = names.length > 0 ? names.join(', ') : 'core utilities';
  const type = node?.type || 'module';
  return `${type} at ${filePath} that provides ${capability}.`;
}

function buildPrompt({ filePath, node, content }) {
  const type = node?.type || 'module';
  const deps = Array.isArray(node?.deps) ? node.deps.slice(0, 12).join(', ') : 'none';
  const declarationList = toDeclarationList(node?.declarations);
  const snippet = typeof content === 'string' ? content.slice(0, 8000) : '';

  return [
    'You are a senior software engineer producing one-line architecture summaries for repository files.',
    'Return only valid JSON. No markdown fences. No extra text.',
    '',
    `File: ${filePath}`,
    `Type: ${type}`,
    `Declarations: ${declarationList}`,
    `Imports from: ${deps || 'none'}`,
    '',
    'File content snippet:',
    '---',
    snippet,
    '---',
    '',
    'Required JSON schema:',
    '{',
    '  "summary": "One concise sentence describing what this file does.",',
    '  "architecturalRole": "short role label like domain-service, ui-component, data-access, routing, utility",',
    '  "riskFlags": ["optional short flags such as high-centrality, large-file, no-test-file"],',
    '  "complexityScore": 0.0',
    '}',
  ].join('\n');
}

function estimateCostUsd(totalPromptTokens, totalCompletionTokens) {
  // Approximate GPT-4o-mini pricing in USD per 1M tokens.
  const promptPerMillion = 0.15;
  const completionPerMillion = 0.6;
  const cost = (totalPromptTokens / 1_000_000) * promptPerMillion + (totalCompletionTokens / 1_000_000) * completionPerMillion;
  return Number(cost.toFixed(6));
}

export class EnrichmentAgent extends BaseAgent {
  agentId = 'enrichment-agent';
  maxRetries = 2;
  timeoutMs = 240_000;

  constructor({ redis, openaiClient } = {}) {
    super();
    this.redis = redis || redisClient;
    this.openai =
      openaiClient ||
      (process.env.OPENAI_API_KEY
        ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
        : null);
    this.model = DEFAULT_MODEL;
    this.lineThreshold = Number.isFinite(FILE_LINE_THRESHOLD) ? FILE_LINE_THRESHOLD : 50;
    this.cacheTtlSeconds = Number.isFinite(CACHE_TTL_SECONDS) ? CACHE_TTL_SECONDS : 3600;
  }

  async process(input, context) {
    const start = Date.now();
    const errors = [];
    const warnings = [];

    const graph = input?.graph || {};
    const extractedPath = input?.extractedPath || input?.rootDir;
    const nodes = Object.entries(graph);

    if (!extractedPath || nodes.length === 0) {
      return this.buildResult({
        jobId: context?.jobId,
        status: 'failed',
        confidence: 0,
        data: {},
        errors: [{ code: 400, message: 'EnrichmentAgent requires extractedPath/rootDir and non-empty graph.' }],
        warnings,
        metrics: {},
        processingTimeMs: Date.now() - start,
      });
    }

    if (!this.openai) {
      warnings.push('OPENAI_API_KEY is missing. Falling back to heuristic summaries only.');
    }

    const enriched = {};
    let enrichedCount = 0;
    let skippedCount = 0;
    let llmAttempted = 0;
    let apiErrors = 0;
    let cacheHits = 0;
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;

    const concurrency = normalizeConcurrency(ENRICHMENT_CONCURRENCY, 4);
    const limit = pLimit(concurrency);

    await Promise.all(
      nodes.map(([filePath, node]) =>
        limit(async () => {
          const loc = Number(node?.metrics?.loc || 0);

          if (loc > 0 && loc < this.lineThreshold) {
            enriched[filePath] = {
              summary: cheapSummary(filePath, node),
              architecturalRole: node?.type || 'module',
              riskFlags: [],
              complexityScore: Number(node?.metrics?.complexity || 0),
            };
            enrichedCount += 1;
            return;
          }

          if (!this.openai) {
            enriched[filePath] = {
              summary: cheapSummary(filePath, node),
              architecturalRole: node?.type || 'module',
              riskFlags: ['llm-unavailable'],
              complexityScore: Number(node?.metrics?.complexity || 0),
            };
            enrichedCount += 1;
            return;
          }

          const absolutePath = path.join(extractedPath, filePath);
          let content = '';

          try {
            content = await readFile(absolutePath, 'utf8');
          } catch {
            warnings.push(`Could not read source file for enrichment: ${filePath}`);
            enriched[filePath] = {
              summary: cheapSummary(filePath, node),
              architecturalRole: node?.type || 'module',
              riskFlags: ['read-error'],
              complexityScore: Number(node?.metrics?.complexity || 0),
            };
            enrichedCount += 1;
            return;
          }

          const cacheKey = this._cacheKey({ filePath, node, content });
          const cached = await this._readCache(cacheKey);
          if (cached) {
            enriched[filePath] = cached;
            enrichedCount += 1;
            cacheHits += 1;
            return;
          }

          llmAttempted += 1;

          try {
            const prompt = buildPrompt({ filePath, node, content });
            const completion = await this.openai.chat.completions.create({
              model: this.model,
              temperature: 0.1,
              max_tokens: 220,
              response_format: { type: 'json_object' },
              messages: [{ role: 'user', content: prompt }],
            });

            const message = completion?.choices?.[0]?.message?.content || '{}';
            const usage = completion?.usage || {};
            totalPromptTokens += Number(usage.prompt_tokens || 0);
            totalCompletionTokens += Number(usage.completion_tokens || 0);

            let parsed;
            try {
              parsed = JSON.parse(message);
            } catch {
              parsed = {
                summary: String(message).trim() || cheapSummary(filePath, node),
                architecturalRole: node?.type || 'module',
                riskFlags: ['parse-fallback'],
                complexityScore: Number(node?.metrics?.complexity || 0),
              };
            }

            const normalized = {
              summary: parsed.summary || cheapSummary(filePath, node),
              architecturalRole: parsed.architecturalRole || node?.type || 'module',
              riskFlags: Array.isArray(parsed.riskFlags) ? parsed.riskFlags.slice(0, 6) : [],
              complexityScore: Number.isFinite(Number(parsed.complexityScore))
                ? Number(parsed.complexityScore)
                : Number(node?.metrics?.complexity || 0),
            };

            enriched[filePath] = normalized;
            enrichedCount += 1;
            await this._writeCache(cacheKey, normalized);
          } catch (error) {
            apiErrors += 1;
            warnings.push(`LLM enrichment failed for ${filePath}: ${error.message}`);

            enriched[filePath] = {
              summary: cheapSummary(filePath, node),
              architecturalRole: node?.type || 'module',
              riskFlags: ['llm-fallback'],
              complexityScore: Number(node?.metrics?.complexity || 0),
            };
            enrichedCount += 1;
          }
        }),
      ),
    );

    skippedCount = Math.max(0, nodes.length - enrichedCount);

    const confidence = scoreEnrichment({
      totalFiles: nodes.length,
      enrichedCount,
      apiErrors,
      batchesAttempted: llmAttempted,
    });

    const status =
      enrichedCount === 0
        ? 'failed'
        : apiErrors > 0
          ? 'partial'
          : 'success';

    const batchStats = {
      totalFiles: nodes.length,
      enrichedCount,
      skippedCount,
      totalTokensUsed: totalPromptTokens + totalCompletionTokens,
      estimatedCostUsd: estimateCostUsd(totalPromptTokens, totalCompletionTokens),
      llmAttempted,
      llmFailed: apiErrors,
      cacheHits,
    };

    return this.buildResult({
      jobId: context?.jobId,
      status,
      confidence,
      data: { enriched, batchStats },
      errors,
      warnings,
      metrics: {
        totalFiles: nodes.length,
        enrichedCount,
        skippedCount,
        llmAttempted,
        apiErrors,
        cacheHits,
      },
      processingTimeMs: Date.now() - start,
    });
  }

  _cacheKey({ filePath, node, content }) {
    const hash = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          v: 1,
          model: this.model,
          threshold: this.lineThreshold,
          filePath,
          type: node?.type || 'module',
          declarations: node?.declarations || [],
          deps: node?.deps || [],
          content,
        }),
      )
      .digest('hex');

    return `enrichment:${hash}`;
  }

  async _readCache(key) {
    if (!this.redis || typeof this.redis.get !== 'function') return null;

    try {
      const raw = await this.redis.get(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  async _writeCache(key, value) {
    if (!this.redis || typeof this.redis.set !== 'function') return;

    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', this.cacheTtlSeconds);
    } catch {
      // Cache writes are best-effort and should not fail the enrichment flow.
    }
  }
}
