import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import path from 'path';
import { parentPort, workerData } from 'worker_threads';
import { Language, Parser, Query } from 'web-tree-sitter';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const QUERIES = {
  imports: `(use_declaration argument: (_) @import)`,
  declarations: `
    (function_item name: (identifier) @name) @fn
    (struct_item name: (type_identifier) @name) @struct
    (enum_item name: (type_identifier) @name) @enum
  `,
};

function emptyResult(relativePath, parseError) {
  return {
    relativePath,
    imports: [],
    declarations: [],
    functionNodes: [],
    metrics: {},
    parseError,
  };
}

function declarationKindFromCaptures(captures) {
  const marker = captures.find((capture) => capture.name !== 'name' && capture.name !== 'import');
  return marker?.name || 'fn';
}

function resolveWasmPath(language) {
  const wasmFile = `tree-sitter-${language}.wasm`;
  const configuredWasmDir = process.env.PARSER_WASM_DIR;

  const candidates = [
    configuredWasmDir ? path.resolve(configuredWasmDir, wasmFile) : null,
    path.resolve(__dirname, '../../../wasm', wasmFile),
    path.resolve(__dirname, '../../../node_modules/tree-sitter-wasms/out', wasmFile),
    path.resolve(process.cwd(), 'wasm', wasmFile),
    path.resolve(process.cwd(), 'node_modules/tree-sitter-wasms/out', wasmFile),
  ].filter(Boolean);

  const located = candidates.find((candidate) => existsSync(candidate));
  if (located) return located;

  throw new Error(`Missing Tree-sitter WASM for ${language}. Looked in: ${candidates.join(', ')}`);
}

async function run() {
  const { filePath, relativePath } = workerData;

  if (!filePath || !relativePath) {
    parentPort.postMessage(emptyResult(relativePath || 'unknown', 'Worker missing required filePath or relativePath.'));
    return;
  }

  await Parser.init();

  const wasmPath = resolveWasmPath('rust');
  const lang = await Language.load(wasmPath);

  const parser = new Parser();
  parser.setLanguage(lang);

  const source = await readFile(filePath, 'utf8');
  const tree = parser.parse(source);
  const root = tree.rootNode;

  const imports = [];
  const declarations = [];
  const functionNodes = [];
  const seenImports = new Set();
  const seenDecls = new Set();

  const importQuery = new Query(lang, QUERIES.imports);
  for (const match of importQuery.matches(root)) {
    for (const capture of match.captures) {
      if (capture.name !== 'import') continue;
      const value = capture.node.text.replace(/["']/g, '');
      if (!value || seenImports.has(value)) continue;
      seenImports.add(value);
      imports.push(value);
    }
  }

  const declarationQuery = new Query(lang, QUERIES.declarations);
  for (const match of declarationQuery.matches(root)) {
    const kind = declarationKindFromCaptures(match.captures);
    const markerCapture = match.captures.find((c) => c.name !== 'name' && c.name !== 'import');
    const declNode = markerCapture ? markerCapture.node : null;

    for (const capture of match.captures) {
      if (capture.name !== 'name') continue;

      const name = capture.node.text;
      const key = `${kind}:${name}`;
      if (!name || seenDecls.has(key)) continue;

      seenDecls.add(key);
      declarations.push({ name, kind });

      let loc = null;
      let bodySource = null;
      if (declNode) {
        const startLine = declNode.startPosition.row + 1;
        const endLine = declNode.endPosition.row + 1;
        loc = Math.max(1, endLine - startLine + 1);
        const lines = source.split(/\r?\n/);
        bodySource = lines.slice(startLine - 1, endLine).join('\n');
      }

      functionNodes.push({ name, kind, calls: [], loc, bodySource });
    }
  }

  parentPort.postMessage({
    relativePath,
    imports,
    declarations,
    functionNodes,
    rawContent: source,
    metrics: {
      loc: source.split(/\r?\n/).length,
      importCount: imports.length,
      declarationCount: declarations.length,
    },
    parseError: null,
  });
}

run().catch((error) => {
  parentPort.postMessage(emptyResult(workerData?.relativePath || 'unknown', error.message));
});