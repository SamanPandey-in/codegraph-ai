import { scanFiles } from './fileScanner.service.js';
import { buildDependencyGraph } from './astParser.service.js';
import { IngestionAgent } from '../../agents/ingestion/IngestionAgent.js';

const ingestionAgent = new IngestionAgent();

async function runIngestion(input) {
  const result = await ingestionAgent.process(input, { jobId: 'analyze-preview' });

  if (result.status === 'failed') {
    const firstError = result.errors?.[0] || { message: 'Ingestion failed', code: 500 };
    const err = new Error(firstError.message || 'Ingestion failed');
    err.statusCode = firstError.code || 500;
    throw err;
  }

  return result.data;
}

async function analyzeFromRoot(rootDir, reportedRoot) {
  const files = await scanFiles(rootDir);

  if (files.length === 0) {
    return {
      rootDir: reportedRoot,
      fileCount: 0,
      graph: {},
      message: 'No JS/TS files found in the selected repository and branch.',
    };
  }

  const graph = await buildDependencyGraph(files, rootDir);

  return {
    rootDir: reportedRoot,
    fileCount: files.length,
    graph,
  };
}

async function analyzeLocalProject(localPath) {
  const ingestion = await runIngestion({
    source: 'local',
    localPath,
  });

  return analyzeFromRoot(ingestion.extractedPath, ingestion.extractedPath);
}

async function analyzeGitHubProject(githubConfig, githubToken) {
  let ingestion;
  try {
    ingestion = await runIngestion({
      source: 'github',
      github: githubConfig,
      githubToken,
    });

    const owner = ingestion.repoMeta?.owner;
    const repo = ingestion.repoMeta?.repo;
    const branch = ingestion.repoMeta?.branch;

    return await analyzeFromRoot(
      ingestion.extractedPath,
      `github:${owner}/${repo}#${branch}`,
    );
  } finally {
    if (ingestion?.tempRoot) {
      await ingestionAgent.cleanup(ingestion.tempRoot);
    }
  }
}

export async function validateLocalRepository(projectPath) {
  const ingestion = await runIngestion({
    source: 'local',
    localPath: projectPath,
  });
  return { valid: true, path: ingestion.extractedPath };
}

export async function analyzeProject(config, githubToken) {
  if (typeof config === 'string') {
    return analyzeLocalProject(config);
  }

  if (config.source === 'local') {
    return analyzeLocalProject(config.localPath);
  }

  if (config.source === 'github') {
    return analyzeGitHubProject(config.github, githubToken);
  }

  const err = new Error('Invalid repository source configuration.');
  err.statusCode = 400;
  throw err;
}
