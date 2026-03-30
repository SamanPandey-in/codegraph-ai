import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/agents/**/__tests__/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: [
        'src/agents/core/confidence.js',
        'src/agents/parser/ParserAgent.js',
        'src/agents/graph/GraphBuilderAgent.js',
      ],
      exclude: ['**/__tests__/**'],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 60,
      },
    },
  },
});
