import { BaseAgent } from '../core/BaseAgent.js';
import { scoreAnalysis } from '../core/confidence.js';

const ENTRY_POINTS = /^(index|main|app)\.(jsx?|tsx?)$/i;

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nodeInDegree(path, node, reverseAdjacency, topology) {
  const fromNode = Number(node?.metrics?.inDegree);
  if (Number.isFinite(fromNode)) return fromNode;

  const fromTopologyMap = Number(topology?.inDegreeMap?.[path]);
  if (Number.isFinite(fromTopologyMap)) return fromTopologyMap;

  return Array.isArray(reverseAdjacency[path]) ? reverseAdjacency[path].length : 0;
}

export class AnalysisAgent extends BaseAgent {
  agentId = 'analysis-agent';
  maxRetries = 0;
  timeoutMs = 30_000;

  async process(input, context) {
    const start = Date.now();
    const errors = [];
    const warnings = [];

    const graph = input?.graph;
    if (!isObject(graph) || Object.keys(graph).length === 0) {
      return this.buildResult({
        jobId: context?.jobId,
        status: 'failed',
        confidence: 0,
        data: {},
        errors: [{ code: 400, message: 'AnalysisAgent requires a non-empty graph object.' }],
        warnings,
        metrics: {},
        processingTimeMs: Date.now() - start,
      });
    }

    const topology = isObject(input?.topology) ? input.topology : {};
    const reverseAdjacency = this.buildReverseAdjacency(graph, input?.reverseAdjacency, input?.edges);

    const deadCodeCandidates = this.detectDeadCode(graph, reverseAdjacency, topology);

    let impactedFiles = [];
    if (input?.filePath) {
      impactedFiles = this.getImpactedFiles(input.filePath, reverseAdjacency);
    }

    return this.buildResult({
      jobId: context?.jobId,
      status: 'success',
      confidence: scoreAnalysis(),
      data: {
        deadCodeCandidates,
        impactedFiles,
        reverseAdjacency,
      },
      errors,
      warnings,
      metrics: {
        nodeCount: Object.keys(graph).length,
        deadCodeCount: deadCodeCandidates.length,
        impactedCount: impactedFiles.length,
      },
      processingTimeMs: Date.now() - start,
    });
  }

  buildReverseAdjacency(graph, providedReverseAdjacency, edges) {
    if (isObject(providedReverseAdjacency)) {
      return providedReverseAdjacency;
    }

    const reverseAdjacency = {};

    for (const filePath of Object.keys(graph)) {
      reverseAdjacency[filePath] = [];
    }

    if (Array.isArray(edges) && edges.length > 0) {
      for (const edge of edges) {
        const source = edge?.source;
        const target = edge?.target;
        if (!source || !target) continue;

        if (!Array.isArray(reverseAdjacency[target])) reverseAdjacency[target] = [];
        reverseAdjacency[target].push(source);
      }

      return reverseAdjacency;
    }

    for (const [sourcePath, node] of Object.entries(graph)) {
      const deps = Array.isArray(node?.deps) ? node.deps : [];
      for (const targetPath of deps) {
        if (!Array.isArray(reverseAdjacency[targetPath])) reverseAdjacency[targetPath] = [];
        reverseAdjacency[targetPath].push(sourcePath);
      }
    }

    return reverseAdjacency;
  }

  detectDeadCode(graph, reverseAdjacency, topology = {}) {
    const deadCode = [];

    for (const [filePath, node] of Object.entries(graph)) {
      const filename = filePath.split('/').pop() || '';
      if (ENTRY_POINTS.test(filename)) continue;

      const inDegree = nodeInDegree(filePath, node, reverseAdjacency, topology);
      if (inDegree === 0) {
        deadCode.push(filePath);
      }
    }

    return deadCode;
  }

  getImpactedFiles(filePath, reverseAdjacency) {
    if (!filePath || !isObject(reverseAdjacency)) return [];

    const affected = new Set();
    const queue = [filePath];

    while (queue.length > 0) {
      const current = queue.shift();
      const dependents = Array.isArray(reverseAdjacency[current])
        ? reverseAdjacency[current]
        : [];

      for (const dependent of dependents) {
        if (affected.has(dependent)) continue;
        affected.add(dependent);
        queue.push(dependent);
      }
    }

    return [...affected];
  }
}
