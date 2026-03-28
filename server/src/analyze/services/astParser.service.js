import { ParserAgent } from '../../agents/parser/ParserAgent.js';
import { GraphBuilderAgent } from '../../agents/graph/GraphBuilderAgent.js';

const parserAgent = new ParserAgent();
const graphBuilderAgent = new GraphBuilderAgent();

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

async function runGraphBuilder(parsedFiles, rootDir) {
  const result = await graphBuilderAgent.process(
    { parsedFiles, rootDir, extractedPath: rootDir },
    { jobId: 'analyze-preview' },
  );

  if (result.status === 'failed') {
    const firstError = result.errors?.[0] || { message: 'Graph building failed', code: 500 };
    const err = new Error(firstError.message || 'Graph building failed');
    err.statusCode = firstError.code || 500;
    throw err;
  }

  return result.data;
}

export async function parseRepository(files, rootDir) {
  const parsed = await runParser(files, rootDir);
  const graphData = await runGraphBuilder(parsed.parsedFiles || [], rootDir);
  return {
    ...parsed,
    ...graphData,
  };
}

export async function buildDependencyGraph(files, rootDir) {
  const parsed = await runParser(files, rootDir);
  const graphData = await runGraphBuilder(parsed.parsedFiles || [], rootDir);
  return graphData.graph || {};
}
