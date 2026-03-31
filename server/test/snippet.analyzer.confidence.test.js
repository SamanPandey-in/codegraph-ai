import assert from 'node:assert/strict';
import test from 'node:test';
import { SnippetAnalyzerAgent } from '../src/agents/analysis/SnippetAnalyzerAgent.js';

function createMockDb() {
  return {
    async query(sql) {
      if (String(sql).includes('FROM graph_nodes')) {
        return {
          rowCount: 3,
          rows: [
            {
              file_path: 'src/a.js',
              file_type: 'module',
              declarations: [{ name: 'runA' }],
              metrics: { inDegree: 1, outDegree: 1, loc: 10 },
              summary: 'Core entry file',
            },
            {
              file_path: 'src/b.js',
              file_type: 'module',
              declarations: [{ name: 'runB' }],
              metrics: { inDegree: 0, outDegree: 1, loc: 14 },
              summary: 'Depends on a',
            },
            {
              file_path: 'src/c.js',
              file_type: 'module',
              declarations: [{ name: 'runC' }],
              metrics: { inDegree: 1, outDegree: 0, loc: 20 },
              summary: 'Transitively impacted',
            },
          ],
        };
      }

      if (String(sql).includes('FROM graph_edges')) {
        return {
          rowCount: 2,
          rows: [
            { source_path: 'src/b.js', target_path: 'src/a.js' },
            { source_path: 'src/c.js', target_path: 'src/b.js' },
          ],
        };
      }

      return { rowCount: 0, rows: [] };
    },
  };
}

test('SnippetAnalyzerAgent re-runs when confidence is below threshold', async () => {
  let callCount = 0;

  const llmClient = {
    isConfigured: () => true,
    createChatCompletion: async () => {
      callCount += 1;

      if (callCount === 1) {
        return {
          content: JSON.stringify({
            snippetPurpose: 'Low confidence first pass.',
            fileImpact: 'Uncertain file impact.',
            codebaseImpact: 'Potentially broad impact.',
            directImpactedFiles: ['src/b.js'],
            indirectImpactedFiles: ['src/c.js'],
            relatedFileFindings: [{ filePath: 'src/b.js', impact: 'Depends on a', risk: 'medium' }],
            confidence: 'low',
            confidenceScore: 0.45,
          }),
          usage: { completion_tokens: 120 },
        };
      }

      return {
        content: JSON.stringify({
          snippetPurpose: 'Exports a function used by downstream modules.',
          fileImpact: 'Affects exported behavior in src/a.js.',
          codebaseImpact: 'Changes propagate to direct and transitive dependents.',
          directImpactedFiles: ['src/b.js'],
          indirectImpactedFiles: ['src/c.js'],
          relatedFileFindings: [{ filePath: 'src/c.js', impact: 'Reads output from src/b.js', risk: 'medium' }],
          confidence: 'high',
          confidenceScore: 0.92,
        }),
        usage: { completion_tokens: 160 },
      };
    },
  };

  const agent = new SnippetAnalyzerAgent({ db: createMockDb(), llmClient });

  const result = await agent.process({
    jobId: 'job-1',
    filePath: 'src/a.js',
    snippet: 'export function runA() { return 1; }',
    lineStart: 1,
    lineEnd: 1,
  });

  assert.equal(result.status, 'success');
  assert.equal(callCount, 2);
  assert.equal(result.data.rerunTriggered, true);
  assert.equal(result.data.attemptsUsed, 2);
  assert.equal(result.data.confidence, 'high');
  assert.equal(result.data.confidenceScore, 0.92);
  assert.equal(result.metrics.attemptsUsed, 2);
  assert.equal(result.metrics.completionTokens, 280);
});

test('SnippetAnalyzerAgent accepts numeric-string confidence and skips rerun when >= threshold', async () => {
  let callCount = 0;

  const llmClient = {
    isConfigured: () => true,
    createChatCompletion: async () => {
      callCount += 1;
      return {
        content: JSON.stringify({
          snippetPurpose: 'Initializes and returns stable value.',
          fileImpact: 'Local helper behavior only.',
          codebaseImpact: 'Limited to direct consumers.',
          directImpactedFiles: ['src/b.js'],
          indirectImpactedFiles: [],
          relatedFileFindings: [{ filePath: 'src/b.js', impact: 'Imports helper output', risk: 'low' }],
          confidenceScore: '0.82',
        }),
        usage: { output_tokens: 90 },
      };
    },
  };

  const agent = new SnippetAnalyzerAgent({ db: createMockDb(), llmClient });
  const result = await agent.process({
    jobId: 'job-1',
    filePath: 'src/a.js',
    snippet: 'export function runA() { return 1; }',
  });

  assert.equal(result.status, 'success');
  assert.equal(callCount, 1);
  assert.equal(result.data.rerunTriggered, false);
  assert.equal(result.data.attemptsUsed, 1);
  assert.equal(result.data.confidence, 'medium');
  assert.equal(result.data.confidenceScore, 0.82);
});
