import { ParserAgent } from '../../agents/parser/ParserAgent.js';

const parserAgent = new ParserAgent();

async function runParser(files, rootDir) {
  const result = await parserAgent.process(
    { files, rootDir, extractedPath: rootDir },
    { jobId: 'analyze-preview' },
  );

  if (result.status === 'failed') {
    const firstError = result.errors?.[0] || { message: 'AST parsing failed', code: 500 };
    const err = new Error(firstError.message || 'AST parsing failed');
    err.statusCode = firstError.code || 500;
    throw err;
  }

  return result.data;
}

export async function parseRepository(files, rootDir) {
  return runParser(files, rootDir);
}

export async function buildDependencyGraph(files, rootDir) {
  const parsed = await runParser(files, rootDir);
  return parsed.graph || {};
}
