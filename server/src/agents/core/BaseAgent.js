export class BaseAgent {
  agentId = 'base-agent';
  maxRetries = 1;
  timeoutMs = 60_000;

  // Subclasses implement this
  async process(input, context) {
    throw new Error('process() not implemented');
  }

  // Standardize result format for all agents(scoring formula per agent)
  buildResult({ jobId, status, confidence, data, errors, warnings, metrics, processingTimeMs, retryCount = 0 }) {
    return {
      agentId: this.agentId,
      jobId,
      status,
      confidence: Math.min(1, Math.max(0, parseFloat(confidence.toFixed(3)))),
      data,
      errors: errors || [],
      warnings: warnings || [],
      metrics: metrics || {},
      processingTimeMs,
      retryCount,
    };
  }
}