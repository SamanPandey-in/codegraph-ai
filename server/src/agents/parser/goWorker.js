import { readFile } from 'fs/promises';
import { parentPort, workerData } from 'worker_threads';

const { filePath, relativePath } = workerData;

function uniquePush(target, seen, value) {
  if (!value || seen.has(value)) return;
  seen.add(value);
  target.push(value);
}

function pushDeclaration(target, seen, name, kind) {
  if (!name || seen.has(name)) return;
  seen.add(name);
  target.push({ name, kind });
}

function extractImports(code) {
  const imports = [];
  const seen = new Set();

  const importBlockRegex = /import\s*\(([^)]*)\)/gms;
  let blockMatch;
  while ((blockMatch = importBlockRegex.exec(code)) !== null) {
    const block = blockMatch[1] || '';
    const quoted = block.match(/"([^"]+)"/g) || [];

    for (const entry of quoted) {
      uniquePush(imports, seen, entry.replaceAll('"', ''));
    }
  }

  const singleImportRegex = /^\s*import\s+(?:[\w.]+\s+)?"([^"]+)"/gm;
  let singleMatch;
  while ((singleMatch = singleImportRegex.exec(code)) !== null) {
    uniquePush(imports, seen, singleMatch[1]);
  }

  return imports;
}

function extractDeclarations(lines) {
  const declarations = [];
  const seen = new Set();

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('//')) continue;

    const functionMatch = line.match(/^func\s+(?:\([^)]*\)\s*)?(\w+)\s*\(/);
    if (functionMatch) {
      pushDeclaration(declarations, seen, functionMatch[1], 'function');
      continue;
    }

    const structMatch = line.match(/^type\s+(\w+)\s+struct\b/);
    if (structMatch) {
      pushDeclaration(declarations, seen, structMatch[1], 'struct');
      continue;
    }

    const interfaceMatch = line.match(/^type\s+(\w+)\s+interface\b/);
    if (interfaceMatch) {
      pushDeclaration(declarations, seen, interfaceMatch[1], 'interface');
      continue;
    }

    const typeAliasMatch = line.match(/^type\s+(\w+)\s+[\w\[\]*]+/);
    if (typeAliasMatch) {
      pushDeclaration(declarations, seen, typeAliasMatch[1], 'type');
    }
  }

  return declarations;
}

async function run() {
  const code = await readFile(filePath, 'utf8');
  const lines = code.split(/\r?\n/);

  const imports = extractImports(code);
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
