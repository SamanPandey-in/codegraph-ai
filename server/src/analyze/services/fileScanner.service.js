import { ScannerAgent } from '../../agents/scanner/ScannerAgent.js';

const scannerAgent = new ScannerAgent();

export async function scanRepository(rootDir) {
  const result = await scannerAgent.process({ extractedPath: rootDir }, { jobId: 'analyze-preview' });

  if (result.status === 'failed') {
    const firstError = result.errors?.[0] || { message: 'Repository scan failed', code: 500 };
    const err = new Error(firstError.message || 'Repository scan failed');
    err.statusCode = firstError.code || 500;
    throw err;
  }

  return result.data;
}

export async function scanFiles(rootDir) {
  const scanned = await scanRepository(rootDir);
  return (scanned.manifest || []).map((item) => item.absolutePath);
}
