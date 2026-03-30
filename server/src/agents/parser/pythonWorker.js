import { readFile } from 'fs/promises';
import { parentPort, workerData } from 'worker_threads';

const { filePath, relativePath } = workerData;

function pushDeclaration(declarations, seen, name, kind) {
  if (!name || seen.has(name)) return;
  seen.add(name);
  declarations.push({ name, kind });
}

function normalizeImportTarget(target) {
  const normalized = String(target || '').trim();
  if (!normalized) return null;

  if (!normalized.startsWith('.')) return normalized;

  const leadingDots = normalized.match(/^\.+/)?.[0]?.length || 0;
  const suffix = normalized.slice(leadingDots).replace(/\./g, '/');

  if (leadingDots <= 1) {
    return suffix ? `./${suffix}` : './';
  }

  const parentPrefix = '../'.repeat(leadingDots - 1);
  return suffix ? `${parentPrefix}${suffix}` : parentPrefix;
}

function extractImports(lines) {
  const imports = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const fromImport = line.match(/^from\s+([.\w]+)\s+import\s+(.+)$/);
    if (fromImport) {
      const target = normalizeImportTarget(fromImport[1]);
      if (target) imports.push(target);
      continue;
    }

    const directImport = line.match(/^import\s+(.+)$/);
    if (!directImport) continue;

    const firstSpecifier = directImport[1]
      .split(',')[0]
      .trim()
      .split(/\s+as\s+/i)[0]
      .trim();

    const target = normalizeImportTarget(firstSpecifier);
    if (target) imports.push(target);
  }

  return imports;
}

function extractDeclarations(lines) {
  const declarations = [];
  const seen = new Set();

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const functionMatch = line.match(/^(?:async\s+)?def\s+(\w+)\s*\(/);
    if (functionMatch) {
      pushDeclaration(declarations, seen, functionMatch[1], 'function');
      continue;
    }

    const classMatch = line.match(/^class\s+(\w+)[\s:(]/);
    if (classMatch) {
      pushDeclaration(declarations, seen, classMatch[1], 'class');
    }
  }

  return declarations;
}

async function run() {
  const code = await readFile(filePath, 'utf8');
  const lines = code.split(/\r?\n/);

  const imports = extractImports(lines);
  const declarations = extractDeclarations(lines);

  parentPort.postMessage({
    relativePath,
    imports,
    declarations,
    functionNodes: [],
    metrics: {
      loc: lines.length,
      importCount: imports.length,
      declarationCount: declarations.length,
    },
    parseError: null,
  });
}

run().catch((error) => {
  parentPort.postMessage({
    relativePath,
    imports: [],
    declarations: [],
    functionNodes: [],
    metrics: {},
    parseError: error.message,
  });
});
