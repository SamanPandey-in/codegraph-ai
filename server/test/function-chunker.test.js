import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FunctionChunker } from '../src/agents/parser/FunctionChunker.js';

test('FunctionChunker embeds in-memory function nodes and writes rows', async () => {
  const inserts = [];
  const db = {
    async query(sql, params) {
      inserts.push({ sql, params });
      return { rows: [] };
    },
  };

  const embeddingClient = {
    isConfigured() {
      return true;
    },
    async createEmbedding({ input }) {
      return {
        data: input.map((_, index) => ({ embedding: [index + 0.1, index + 0.2] })),
      };
    },
  };

  const chunker = new FunctionChunker({ db, embeddingClient });
  const result = await chunker.run('job-1', {
    graph: {
      'src/a.js': {
        summary: 'Alpha file',
        type: 'module',
        rawContent: [
          'function first() {',
          '  return 1;',
          '}',
          '',
          'const second = () => helper();',
        ].join('\n'),
      },
    },
    functionNodes: {
      'src/a.js': [
        { name: 'first', kind: 'function', calls: [], bodySource: 'function first() {\n  return 1;\n}' },
        { name: 'second', kind: 'arrow_function', calls: [{ name: 'helper' }], bodySource: 'const second = () => helper();' },
      ],
    },
  });

  assert.equal(result.attempted, 2);
  assert.equal(result.succeeded, 2);
  assert.equal(result.failed, 0);
  assert.equal(inserts.length, 5);
  assert.match(inserts[0].sql, /DELETE FROM code_chunks/);
  assert.match(inserts[1].sql, /INSERT INTO function_embeddings/);
  assert.deepEqual(inserts[1].params.slice(0, 3), ['job-1', 'src/a.js', 'first']);
  assert.match(inserts[2].sql, /INSERT INTO code_chunks/);
  assert.deepEqual(inserts[2].params.slice(0, 6), ['job-1', 'src/a.js', 0, 1, 3, 'function first() {\n  return 1;\n}']);
});
