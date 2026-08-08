import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QueryAgent } from '../src/agents/query/QueryAgent.js';

test('QueryAgent retrieves source context from code_chunks when file embeddings miss', async () => {
  const queries = [];
  let prompt = '';

  const db = {
    async query(sql) {
      queries.push(sql);

      if (String(sql).includes('FROM file_embeddings')) {
        return { rows: [] };
      }

      if (String(sql).includes('FROM code_chunks')) {
        return {
          rows: [
            {
              file_path: 'src/helpers.js',
              chunk_index: 0,
              start_line: 10,
              end_line: 14,
              content: 'export function helper() {\n  return "chunked source";\n}',
              distance: 0.12,
              file_type: 'util',
              declarations: [{ name: 'helper', kind: 'function' }],
              summary: 'Helper utilities',
            },
          ],
        };
      }

      if (String(sql).includes('FROM function_embeddings')) {
        return { rows: [] };
      }

      if (String(sql).includes('INSERT INTO saved_queries')) {
        return { rows: [], rowCount: 1 };
      }

      throw new Error(`Unexpected query: ${sql}`);
    },
  };

  const redis = {
    async get() {
      return null;
    },
    async set() {},
  };

  const embeddingClient = {
    model: 'test-embedding',
    isConfigured() {
      return true;
    },
    async createEmbedding() {
      return { data: [{ embedding: [0.1, 0.2, 0.3] }], usage: { total_tokens: 3 } };
    },
  };

  const llmClient = {
    model: 'test-chat',
    isConfigured() {
      return true;
    },
    async createChatCompletion({ messages }) {
      prompt = messages[0].content;
      return {
        content: JSON.stringify({
          answer: 'The helper is in src/helpers.js.',
          highlightedFiles: ['src/helpers.js'],
          confidence: 'medium',
        }),
        usage: { completion_tokens: 12 },
      };
    },
  };

  const agent = new QueryAgent({ db, redis, llmClient, embeddingClient });
  const result = await agent.process({
    question: 'Where is helper implemented?',
    jobId: 'job-1',
    userId: 'user-1',
  });

  assert.equal(result.status, 'success');
  assert.equal(result.data.retrievedFiles, 1);
  assert.equal(result.data.retrievedChunks, 1);
  assert.deepEqual(result.data.highlightedFiles, ['src/helpers.js']);
  assert.match(prompt, /Relevant source code/);
  assert.match(prompt, /chunked source/);
  assert.ok(queries.some((sql) => String(sql).includes('FROM code_chunks')));
});
