import { readFile } from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import pLimit from 'p-limit';
import { BaseAgent } from '../core/BaseAgent.js';
import { createChatClient } from '../../services/ai/llmProvider.js';
import { redisClient } from '../../infrastructure/connections.js';

const CACHE_TTL = Number(process.env.AI_CACHE_TTL_SECONDS || 3600);
const CONCURRENCY = Number(process.env.CONTRACT_CONCURRENCY || 3);

const ROUTE_INDICATORS = [
  /\.(?:router|routes|controller|handler|api)\./i,
  /(?:router|app|bp)\.(get|post|put|delete|patch)\s*\(/,
  /@(?:Get|Post|Put|Delete|Patch|Request)Mapping/,
  /@app\.route/,
  /def\s+\w+_view\s*\(/,
  /fastapi|flask\.Blueprint/i,
];

function normalizeConcurrency(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function isRouteFile(filePath, content) {
  return ROUTE_INDICATORS.some((re) => re.test(filePath) || re.test(content.slice(0, 2000)));
}

function buildContractPrompt(filePath, content) {
  const snippet = content.slice(0, 10_000);
  return [
    'You are an API contract analyser. Inspect the route handler file below.',
    'Return ONLY valid JSON. No markdown. No preamble.',
    '',
    `File: ${filePath}`,
    '---',
    snippet,
    '---',
    '',
    'Return this exact schema:',
    '{',
    '  "routes": [',
    '    {',
    '      "method": "GET|POST|PUT|DELETE|PATCH",',
    '      "path": "/api/example",',
    '      "requestBody": { "type": "object", "properties": {} },',
    '      "responseBody": { "type": "object", "properties": {} },',
    '      "queryParams": ["param1"],',
    '      "pathParams": [":id"],',
    '      "confidenceScore": 0.0',
    '    }',
    '  ],',
    '  "envDependencies": ["OPENAI_API_KEY"],',
    '  "externalServices": ["stripe.com", "redis"],',
    '  "cachingPatterns": ["redis.set", "lru-cache"]',
    '}',
  ].join('\n');
}

function normalizeContract(payload) {
  return {
    routes: Array.isArray(payload?.routes) ? payload.routes : [],
    envDependencies: Array.isArray(payload?.envDependencies) ? payload.envDependencies : [],
    externalServices: Array.isArray(payload?.externalServices) ? payload.externalServices : [],
    cachingPatterns: Array.isArray(payload?.cachingPatterns) ? payload.cachingPatterns : [],
  };
}

function cacheKeyFor(filePath, content) {
  const hash = crypto.createHash('sha256');
  hash.update(filePath);
  hash.update('\u0000');
  hash.update(content);
  return `contract:${hash.digest('hex')}`;
}

export class ContractInferenceAgent extends BaseAgent {
  agentId = 'contract-inference-agent';
  maxRetries = 1;
  timeoutMs = 180_000;

  constructor({ redis } = {}) {
    super();
    this.chatClient = createChatClient();
    this.redis = redis || redisClient;
    this.concurrency = normalizeConcurrency(CONCURRENCY, 3);
    this.cacheTtlSeconds = Number.isFinite(CACHE_TTL) && CACHE_TTL > 0 ? CACHE_TTL : 3600;
  }

  async process(input, context) {
    const start = Date.now();
    const graph = input?.graph || {};
    const extractedPath = input?.extractedPath || '';
    const warnings = [];
    const errors = [];
    const contracts = {};

    if (!this.chatClient.isConfigured()) {
      return this.buildResult({
        jobId: context?.jobId,
        status: 'failed',
        confidence: 0,
        data: {},
        errors: [{ code: 500, message: 'AI provider is not configured. Set AI_API_KEY (or OPENAI_API_KEY) in your environment.' }],
        warnings,
        metrics: {},
        processingTimeMs: Date.now() - start,
      });
    }

    const entries = Object.entries(graph);
    if (!extractedPath || entries.length === 0) {
      return this.buildResult({
        jobId: context?.jobId,
        status: 'partial',
        confidence: 0.5,
        data: { contracts, stats: { attempted: 0, succeeded: 0, skipped: 0 } },
        errors,
        warnings: [...warnings, 'Contract inference skipped due to missing graph or extractedPath.'],
        metrics: { routeFilesFound: 0, succeeded: 0, skipped: 0 },
        processingTimeMs: Date.now() - start,
      });
    }

    const limit = pLimit(this.concurrency);
    let attempted = 0;
    let succeeded = 0;
    let skipped = 0;

    await Promise.all(
      entries.map(([filePath]) =>
        limit(async () => {
          const absolute = path.join(extractedPath, filePath);
          let content = '';

          try {
            content = await readFile(absolute, 'utf8');
          } catch {
            skipped += 1;
            return;
          }

          if (!isRouteFile(filePath, content)) {
            skipped += 1;
            return;
          }

          const key = cacheKeyFor(filePath, content);
          const cached = await this._readCache(key);
          if (cached) {
            contracts[filePath] = cached;
            succeeded += 1;
            return;
          }

          attempted += 1;

          try {
            const result = await this.chatClient.createChatCompletion({
              temperature: 0.0,
              maxTokens: 600,
              responseFormat: { type: 'json_object' },
              messages: [{ role: 'user', content: buildContractPrompt(filePath, content) }],
            });

            const raw = result?.content || '{}';
            const parsed = JSON.parse(String(raw).replace(/```json|```/g, '').trim());
            const normalized = normalizeContract(parsed);

            contracts[filePath] = normalized;
            succeeded += 1;
            await this._writeCache(key, normalized);
          } catch (error) {
            warnings.push(`Contract inference failed for ${filePath}: ${error.message}`);
          }
        }),
      ),
    );

    const confidence = attempted === 0 ? 0.5 : succeeded / Math.max(attempted, 1);

    return this.buildResult({
      jobId: context?.jobId,
      status: 'success',
      confidence: Math.max(0.4, confidence),
      data: { contracts, stats: { attempted, succeeded, skipped } },
      errors,
      warnings,
      metrics: { routeFilesFound: attempted, succeeded, skipped },
      processingTimeMs: Date.now() - start,
    });
  }

  async _readCache(key) {
    if (!this.redis?.get) return null;
    try {
      const value = await this.redis.get(key);
      return value ? JSON.parse(value) : null;
    } catch {
      return null;
    }
  }

  async _writeCache(key, value) {
    if (!this.redis?.set) return;
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', this.cacheTtlSeconds);
    } catch {
      // Best-effort cache write.
    }
  }
}
