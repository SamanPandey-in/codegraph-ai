import { describe, expect, it } from 'vitest';
import {
  computeOverallConfidence,
  decideConfidence,
  labelConfidence,
  scoreEmbedding,
  scoreEnrichment,
  scoreGraphBuilder,
  scoreIngestion,
  scoreParser,
  scorePersistence,
  scoreScanner,
} from '../confidence.js';

describe('scoreParser', () => {
  it('returns 1 when all files parse successfully', () => {
    expect(scoreParser({ totalAttempted: 100, successCount: 100, failedCount: 0 })).toBe(1);
  });

  it('penalizes high failure rates', () => {
    const score = scoreParser({ totalAttempted: 100, successCount: 70, failedCount: 30 });
    expect(score).toBeLessThan(0.75);
  });

  it('returns 0 when all files fail', () => {
    expect(scoreParser({ totalAttempted: 10, successCount: 0, failedCount: 10 })).toBe(0);
  });
});

describe('computeOverallConfidence', () => {
  it('applies parser weight and drags overall confidence down for low parser score', () => {
    const trace = [
      { agentId: 'parser-agent', confidence: 0.3 },
      { agentId: 'graph-builder-agent', confidence: 0.95 },
      { agentId: 'persistence-agent', confidence: 1.0 },
    ];

    const score = computeOverallConfidence(trace);
    expect(score).toBeLessThan(0.65);
  });
});

describe('confidence helpers', () => {
  it('maps confidence scores to decisions and labels', () => {
    expect(decideConfidence(0.95)).toBe('PROCEED');
    expect(decideConfidence(0.7)).toBe('PROCEED_WARN');
    expect(decideConfidence(0.5)).toBe('RETRY');
    expect(decideConfidence(0.2)).toBe('ABORT');

    expect(labelConfidence(0.95)).toBe('HIGH');
    expect(labelConfidence(0.7)).toBe('MEDIUM');
    expect(labelConfidence(0.5)).toBe('LOW');
    expect(labelConfidence(0.2)).toBe('CRITICAL');
  });

  it('computes ingestion and scanner scores', () => {
    const ingestionScore = scoreIngestion({
      repoMeta: { repoHasMarkers: true, estimatedFileCount: 300 },
      extractedPath: '/tmp/repo',
      errors: [],
    });
    expect(ingestionScore).toBeGreaterThan(0.9);

    const scannerScore = scoreScanner({ totalFiles: 100, eligibleFiles: 25, permissionErrors: 0 });
    expect(scannerScore).toBe(1);
  });

  it('computes graph, enrichment, embedding, and persistence scores', () => {
    const graphScore = scoreGraphBuilder({
      resolvedLocalEdges: 8,
      localImportSpecifiers: 10,
      cyclesDetected: 1,
    });
    expect(graphScore).toBeGreaterThan(0.7);

    const enrichmentScore = scoreEnrichment({
      totalFiles: 10,
      enrichedCount: 8,
      apiErrors: 1,
      batchesAttempted: 5,
    });
    expect(enrichmentScore).toBeGreaterThan(0.6);

    expect(scoreEmbedding({ attempted: 10, succeeded: 9 })).toBe(0.9);
    expect(scorePersistence({ recordsAttempted: 20, recordsWritten: 20 })).toBe(1);
  });
});
