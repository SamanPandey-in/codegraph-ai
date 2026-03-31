import { BaseAgent } from '../core/BaseAgent.js';
import { createChatClient } from '../../services/ai/llmProvider.js';
import { AnalysisAgent } from './AnalysisAgent.js';

const DEFAULT_MODEL = process.env.AI_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini';
const MAX_SNIPPET_CHARS = 4_000;
const MAX_CONTEXT_FILES = 14;
const DEFAULT_CONFIDENCE_RETRY_THRESHOLD = Number(
  process.env.AI_SNIPPET_CONFIDENCE_RETRY_THRESHOLD || process.env.AI_CONFIDENCE_RETRY_THRESHOLD || 0.6,
);
const DEFAULT_CONFIDENCE_MAX_RERUNS = Number.parseInt(
  process.env.AI_SNIPPET_CONFIDENCE_MAX_RERUNS || process.env.AI_CONFIDENCE_MAX_RERUNS || 1,
  10,
);

function normalizePath(value) {
  return String(value || '').trim();
}

function normalizeSnippet(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .trim()
    .slice(0, MAX_SNIPPET_CHARS);
}

function asPositiveInteger(value) {
  const numeric = Number.parseInt(value, 10);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

function clamp01(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
}

function confidenceLabel(score) {
  if (score >= 0.85) return 'high';
  if (score >= 0.65) return 'medium';
  return 'low';
}

function confidenceScoreFromLabel(label) {
  const normalized = String(label || '').trim().toLowerCase();
  if (normalized === 'high') return 0.9;
  if (normalized === 'medium') return 0.7;
  return 0.5;
}

function parseConfidenceScore(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1 ? value / 100 : value;
  }

  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;

  if (['high', 'medium', 'low'].includes(normalized)) {
    return confidenceScoreFromLabel(normalized);
  }

  if (normalized.endsWith('%')) {
    const pct = Number.parseFloat(normalized.slice(0, -1));
    if (Number.isFinite(pct)) {
      return pct / 100;
    }
  }

  const numeric = Number.parseFloat(normalized);
  if (Number.isFinite(numeric)) {
    return numeric > 1 ? numeric / 100 : numeric;
  }

  return null;
}

function toUniquePaths(paths) {
  if (!Array.isArray(paths)) return [];

  const seen = new Set();
  const output = [];

  for (const path of paths) {
    const normalized = normalizePath(path);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(normalized);
  }

  return output;
}

function buildReverseAdjacency(graph) {
  const analysisAgent = new AnalysisAgent();
  return analysisAgent.buildReverseAdjacency(graph);
}

function getImpactPaths(filePath, reverseAdjacency) {
  const analysisAgent = new AnalysisAgent();
  return analysisAgent.getImpactedFiles(filePath, reverseAdjacency);
}

function buildNodeContext(node) {
  const declarations = Array.isArray(node?.declarations)
    ? node.declarations
        .map((entry) => entry?.name)
        .filter(Boolean)
        .slice(0, 10)
        .join(', ')
    : 'none';

  return {
    filePath: node?.file_path || null,
    type: node?.file_type || 'module',
    summary: node?.summary || 'No summary available',
    inDegree: Number(node?.metrics?.inDegree || 0),
    outDegree: Number(node?.metrics?.outDegree || 0),
    loc: Number(node?.metrics?.loc || 0),
    declarations,
  };
}

function buildPrompt({ filePath, snippet, lineStart, lineEnd, contextFiles, directImpactedFiles, indirectImpactedFiles }) {
  const lineRange = lineStart && lineEnd ? `${lineStart}-${lineEnd}` : 'unknown';

  return [
    'You are SnippetAnalyzerAgent in an agentic code-analysis system.',
    'Your task: explain what this snippet does and its architectural impact based only on supplied repository graph context.',
    'Do not hallucinate hidden files or behavior. If uncertain, state assumptions briefly.',
    '',
    `File: ${filePath}`,
    `Selected lines: ${lineRange}`,
    '',
    'Snippet:',
    '```',
    snippet,
    '```',
    '',
    `Direct impacted files (dependents): ${directImpactedFiles.join(', ') || 'none'}`,
    `Indirect impacted files (transitive): ${indirectImpactedFiles.join(', ') || 'none'}`,
    '',
    'Related file context:',
    ...contextFiles.map(
      (entry, index) =>
        `${index + 1}. ${entry.filePath} | type=${entry.type} | inDegree=${entry.inDegree} | outDegree=${entry.outDegree} | loc=${entry.loc} | declarations=${entry.declarations} | summary=${entry.summary}`,
    ),
    '',
    'Return strictly valid JSON with this shape:',
    '{',
    '  "snippetPurpose": "concise explanation of what the snippet does",',
    '  "fileImpact": "impact inside this file",',
    '  "codebaseImpact": "impact on related files and overall architecture",',
    '  "directImpactedFiles": ["paths that directly depend on this file/snippet"],',
    '  "indirectImpactedFiles": ["paths with transitive impact"],',
    '  "relatedFileFindings": [',
    '    { "filePath": "path", "impact": "how it is affected", "risk": "low|medium|high" }',
    '  ],',
    '  "confidence": "high|medium|low",',
    '  "confidenceScore": 0.0',
    '}',
    'confidenceScore must be a number between 0 and 1 and confidence should align with the score.',
  ].join('\n');
}

function buildRetryPrompt({ previousResponse, threshold }) {
  return [
    'Your previous output had confidence below the required threshold.',
    `Re-evaluate and respond again with stronger precision. Required confidenceScore >= ${threshold.toFixed(2)}.`,
    'Do not invent facts. Keep all claims grounded in the provided graph context.',
    '',
    'Previous response JSON:',
    String(previousResponse || '{}'),
  ].join('\n');
}

function parseModelResponse(rawText, fallback) {
  try {
    const parsed = JSON.parse(String(rawText || '{}'));

    const explicitScore = parseConfidenceScore(parsed?.confidenceScore);
    const labelCandidate = String(parsed?.confidence || '').toLowerCase();
    const label = ['high', 'medium', 'low'].includes(labelCandidate)
      ? labelCandidate
      : confidenceLabel(explicitScore ?? fallback.confidenceScore);
    const score = clamp01(explicitScore ?? parseConfidenceScore(parsed?.confidence) ?? confidenceScoreFromLabel(label));

    return {
      snippetPurpose: String(parsed?.snippetPurpose || fallback.snippetPurpose).trim(),
      fileImpact: String(parsed?.fileImpact || fallback.fileImpact).trim(),
      codebaseImpact: String(parsed?.codebaseImpact || fallback.codebaseImpact).trim(),
      directImpactedFiles: toUniquePaths(
        Array.isArray(parsed?.directImpactedFiles) ? parsed.directImpactedFiles : fallback.directImpactedFiles,
      ),
      indirectImpactedFiles: toUniquePaths(
        Array.isArray(parsed?.indirectImpactedFiles)
          ? parsed.indirectImpactedFiles
          : fallback.indirectImpactedFiles,
      ),
      relatedFileFindings: Array.isArray(parsed?.relatedFileFindings)
        ? parsed.relatedFileFindings
            .map((item) => ({
              filePath: normalizePath(item?.filePath),
              impact: String(item?.impact || '').trim(),
              risk: ['low', 'medium', 'high'].includes(String(item?.risk || '').toLowerCase())
                ? String(item.risk).toLowerCase()
                : 'medium',
            }))
            .filter((item) => item.filePath && item.impact)
            .slice(0, MAX_CONTEXT_FILES)
        : [],
      confidence: label,
      confidenceScore: score,
    };
  } catch {
    return fallback;
  }
}

export class SnippetAnalyzerAgent extends BaseAgent {
  agentId = 'snippet-analyzer-agent';
  maxRetries = 1;
  timeoutMs = 90_000;

  constructor({ db, llmClient } = {}) {
    super();
    this.db = db;
    this.llmClient = llmClient || createChatClient();
    this.model = DEFAULT_MODEL;
    this.confidenceRetryThreshold = clamp01(DEFAULT_CONFIDENCE_RETRY_THRESHOLD);
    this.confidenceMaxReruns = Math.max(0, Number.isInteger(DEFAULT_CONFIDENCE_MAX_RERUNS) ? DEFAULT_CONFIDENCE_MAX_RERUNS : 1);
  }

  async process(input = {}, context = {}) {
    const start = Date.now();
    const errors = [];
    const warnings = [];

    const jobId = normalizePath(input.jobId || context.jobId);
    const filePath = normalizePath(input.filePath);
    const snippet = normalizeSnippet(input.snippet);
    const lineStart = asPositiveInteger(input.lineStart);
    const lineEnd = asPositiveInteger(input.lineEnd);

    if (!jobId || !filePath || !snippet) {
      return this.buildResult({
        jobId: context?.jobId || jobId,
        status: 'failed',
        confidence: 0,
        data: {},
        errors: [{ code: 400, message: 'SnippetAnalyzerAgent requires jobId, filePath, and snippet.' }],
        warnings,
        metrics: {},
        processingTimeMs: Date.now() - start,
      });
    }

    if (!this.llmClient.isConfigured()) {
      return this.buildResult({
        jobId,
        status: 'failed',
        confidence: 0,
        data: {},
        errors: [{ code: 503, message: 'AI provider is not configured.' }],
        warnings,
        metrics: {},
        processingTimeMs: Date.now() - start,
      });
    }

    try {
      const [nodesResult, edgesResult] = await Promise.all([
        this.db.query(
          `
            SELECT file_path, file_type, declarations, metrics, summary
            FROM graph_nodes
            WHERE job_id = $1
          `,
          [jobId],
        ),
        this.db.query(
          `
            SELECT source_path, target_path
            FROM graph_edges
            WHERE job_id = $1
          `,
          [jobId],
        ),
      ]);

      if (nodesResult.rowCount === 0) {
        return this.buildResult({
          jobId,
          status: 'failed',
          confidence: 0,
          data: {},
          errors: [{ code: 404, message: 'No graph data found for this job.' }],
          warnings,
          metrics: {},
          processingTimeMs: Date.now() - start,
        });
      }

      const nodesByPath = new Map();
      for (const row of nodesResult.rows) {
        nodesByPath.set(row.file_path, row);
      }

      if (!nodesByPath.has(filePath)) {
        return this.buildResult({
          jobId,
          status: 'failed',
          confidence: 0,
          data: {},
          errors: [{ code: 404, message: 'filePath not found in this job graph.' }],
          warnings,
          metrics: {},
          processingTimeMs: Date.now() - start,
        });
      }

      const depsBySource = new Map();
      const graph = {};

      for (const row of edgesResult.rows) {
        if (!depsBySource.has(row.source_path)) depsBySource.set(row.source_path, []);
        depsBySource.get(row.source_path).push(row.target_path);
      }

      for (const row of nodesResult.rows) {
        graph[row.file_path] = {
          deps: depsBySource.get(row.file_path) || [],
          type: row.file_type,
          declarations: row.declarations || [],
          metrics: row.metrics || {},
          summary: row.summary || null,
        };
      }

      const reverseAdjacency = buildReverseAdjacency(graph);
      const allImpacted = getImpactPaths(filePath, reverseAdjacency);
      const directImpactedFiles = Array.isArray(reverseAdjacency[filePath])
        ? toUniquePaths(reverseAdjacency[filePath])
        : [];
      const indirectImpactedFiles = toUniquePaths(
        allImpacted.filter((impactedPath) => !directImpactedFiles.includes(impactedPath)),
      );

      const sourceDependencies = Array.isArray(graph[filePath]?.deps) ? graph[filePath].deps : [];
      const neighborhood = toUniquePaths([
        filePath,
        ...sourceDependencies,
        ...directImpactedFiles,
        ...indirectImpactedFiles,
      ]).slice(0, MAX_CONTEXT_FILES);

      const contextFiles = neighborhood
        .map((path) => nodesByPath.get(path))
        .filter(Boolean)
        .map(buildNodeContext);

      const prompt = buildPrompt({
        filePath,
        snippet,
        lineStart,
        lineEnd,
        contextFiles,
        directImpactedFiles,
        indirectImpactedFiles,
      });

      const fallback = {
        snippetPurpose: 'Unable to confidently summarize this snippet from available graph context.',
        fileImpact: 'Impact inside this file could not be fully determined from metadata.',
        codebaseImpact: 'Potential impact exists on dependent files listed in direct/indirect sets.',
        directImpactedFiles,
        indirectImpactedFiles,
        relatedFileFindings: contextFiles
          .filter((entry) => entry.filePath !== filePath)
          .slice(0, 6)
          .map((entry) => ({
            filePath: entry.filePath,
            impact: `Related to ${filePath} through dependency graph adjacency.`,
            risk: 'medium',
          })),
        confidence: 'medium',
        confidenceScore: 0.7,
      };

      let attemptIndex = 0;
      let totalCompletionTokens = 0;
      let rerunTriggered = false;
      let parsed = fallback;
      let lastRawContent = '{}';

      while (attemptIndex <= this.confidenceMaxReruns) {
        const messages = [{ role: 'user', content: prompt }];

        if (attemptIndex > 0) {
          messages.push({
            role: 'user',
            content: buildRetryPrompt({
              previousResponse: lastRawContent,
              threshold: this.confidenceRetryThreshold,
            }),
          });
        }

        const completion = await this.llmClient.createChatCompletion({
          model: this.model,
          temperature: attemptIndex > 0 ? 0 : 0.1,
          maxTokens: 700,
          responseFormat: { type: 'json_object' },
          messages,
        });

        const completionTokens = Number(completion?.usage?.completion_tokens || completion?.usage?.output_tokens || 0);
        totalCompletionTokens += completionTokens;
        lastRawContent = completion?.content || '{}';

        parsed = parseModelResponse(lastRawContent, fallback);
        if (parsed.confidenceScore >= this.confidenceRetryThreshold) {
          break;
        }

        if (attemptIndex < this.confidenceMaxReruns) {
          rerunTriggered = true;
          warnings.push({
            code: 299,
            message: `Low-confidence snippet analysis (${parsed.confidenceScore.toFixed(2)}) triggered re-run.`,
          });
        }

        attemptIndex += 1;
      }

      const numericConfidence = clamp01(parsed.confidenceScore);
      const confidenceBucket = confidenceLabel(numericConfidence);

      return this.buildResult({
        jobId,
        status: 'success',
        confidence: numericConfidence,
        data: {
          filePath,
          snippet,
          lineStart,
          lineEnd,
          snippetPurpose: parsed.snippetPurpose,
          fileImpact: parsed.fileImpact,
          codebaseImpact: parsed.codebaseImpact,
          directImpactedFiles: parsed.directImpactedFiles,
          indirectImpactedFiles: parsed.indirectImpactedFiles,
          relatedFileFindings: parsed.relatedFileFindings,
          relatedFilesScanned: contextFiles.map((entry) => entry.filePath),
          confidence: confidenceBucket,
          confidenceScore: numericConfidence,
          rerunTriggered,
          attemptsUsed: attemptIndex + 1,
          confidenceThreshold: this.confidenceRetryThreshold,
        },
        errors,
        warnings,
        metrics: {
          snippetChars: snippet.length,
          contextFileCount: contextFiles.length,
          directImpactedCount: parsed.directImpactedFiles.length,
          indirectImpactedCount: parsed.indirectImpactedFiles.length,
          completionTokens: totalCompletionTokens,
          attemptsUsed: attemptIndex + 1,
        },
        processingTimeMs: Date.now() - start,
      });
    } catch (error) {
      errors.push({ code: error?.statusCode || error?.status || 500, message: error.message });

      return this.buildResult({
        jobId,
        status: 'failed',
        confidence: 0,
        data: {},
        errors,
        warnings,
        metrics: {},
        processingTimeMs: Date.now() - start,
      });
    }
  }
}