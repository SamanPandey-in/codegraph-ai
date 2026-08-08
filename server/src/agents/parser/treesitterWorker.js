import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import path from 'path';
import { parentPort, workerData } from 'worker_threads';
import { Language, Parser, Query } from 'web-tree-sitter';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const QUERIES = {
  python: {
    imports: `
      (import_statement (dotted_name) @import)
      (import_from_statement module_name: (dotted_name) @import)
    `,
    declarations: `
      (function_definition name: (identifier) @name) @fn
      (class_definition name: (identifier) @name) @cls
    `,
    calls: `
      (call function: (identifier) @call)
      (call function: (attribute attribute: (identifier) @call))
    `,
  },
  java: {
    imports: `(import_declaration (scoped_identifier) @import)`,
    declarations: `
      (method_declaration name: (identifier) @name) @fn
      (class_declaration name: (identifier) @name) @cls
      (interface_declaration name: (identifier) @name) @iface
    `,
    calls: `
      (method_invocation name: (identifier) @call)
      (object_creation_expression type: (type_identifier) @call)
    `,
  },
  go: {
    imports: `(import_spec path: (interpreted_string_literal) @import)`,
    declarations: `
      (function_declaration name: (identifier) @name) @fn
      (type_declaration (type_spec name: (type_identifier) @name)) @type
    `,
    calls: `
      (call_expression function: (identifier) @call)
      (call_expression function: (selector_expression field: (field_identifier) @call))
    `,
  },
  rust: {
    imports: `(use_declaration argument: (_) @import)`,
    declarations: `
      (function_item name: (identifier) @name) @fn
      (struct_item name: (type_identifier) @name) @struct
      (enum_item name: (type_identifier) @name) @enum
    `,
    calls: `
      (call_expression function: (identifier) @call)
      (call_expression function: (field_expression field: (field_identifier) @call))
      (call_expression function: (scoped_identifier name: (identifier) @call))
    `,
  },
  ruby: {
    imports: `(call method: (identifier) @method (#match? @method "^require")) @import`,
    declarations: `
      (method name: (identifier) @name) @fn
      (singleton_method name: (identifier) @name) @fn
      (class name: (constant) @name) @cls
    `,
    // Note: a bare receiver-less call without parentheses or arguments (e.g. a Ruby
    // method invoked as plain `helper`) parses as an `identifier`, not a `call` node,
    // so it is not captured here — mirrors the Babel worker, which also only resolves
    // explicit CallExpression nodes rather than every bare identifier reference.
    calls: `
      (call method: (identifier) @call)
    `,
  },
  c_sharp: {
    imports: `(using_directive (identifier) @import)`,
    declarations: `
      (method_declaration name: (identifier) @name) @fn
      (class_declaration name: (identifier) @name) @cls
      (interface_declaration name: (identifier) @name) @iface
    `,
    calls: `
      (invocation_expression function: (identifier) @call)
      (invocation_expression function: (member_access_expression name: (identifier) @call))
      (object_creation_expression type: (identifier) @call)
    `,
  },
  kotlin: {
    imports: `(import_header (identifier) @import)`,
    declarations: `
      (function_declaration (simple_identifier) @name) @fn
      (class_declaration (type_identifier) @name) @cls
    `,
    calls: `
      (call_expression (simple_identifier) @call)
      (call_expression (navigation_expression (navigation_suffix (simple_identifier) @call)))
    `,
  },
  php: {
    imports: `(include_expression (string) @import)`,
    declarations: `
      (function_definition name: (name) @name) @fn
      (method_declaration name: (name) @name) @fn
      (class_declaration name: (name) @name) @cls
    `,
    // object_creation_expression doesn't expose a named field for the class name
    // in this grammar version, so it's matched positionally by node type instead.
    calls: `
      (function_call_expression function: (name) @call)
      (member_call_expression name: (name) @call)
      (object_creation_expression (name) @call)
    `,
  },
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

  throw new Error(
    `Missing Tree-sitter WASM for ${language}. Looked in: ${candidates.join(', ')}`,
  );
}

async function run() {
  const { filePath, relativePath, language } = workerData;

  if (!filePath || !relativePath || !language) {
    parentPort.postMessage(emptyResult(relativePath || 'unknown', 'Worker missing required filePath, relativePath, or language.'));
    return;
  }

  const queries = QUERIES[language] || { imports: '', declarations: '' };

  await Parser.init();

  const wasmPath = resolveWasmPath(language);
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

  if (queries.imports) {
    const query = new Query(lang, queries.imports);
    for (const match of query.matches(root)) {
      for (const capture of match.captures) {
        if (capture.name !== 'import') continue;
        const value = capture.node.text.replace(/['"]/g, '');
        if (!value || seenImports.has(value)) continue;
        seenImports.add(value);
        imports.push(value);
      }
    }
  }

  if (queries.declarations) {
    const query = new Query(lang, queries.declarations);
    const matches = [...query.matches(root)];

    // Pass 1: collect every declared name in this file. Call extraction only
    // resolves references that are themselves declared here — same strategy
    // as the Babel/JS worker — so a call to an external library function
    // isn't mistaken for an intra-file call edge.
    const declarationNames = new Set();
    for (const match of matches) {
      for (const capture of match.captures) {
        if (capture.name === 'name') declarationNames.add(capture.node.text);
      }
    }

    const callsQuery = queries.calls ? new Query(lang, queries.calls) : null;

    // Pass 2: build declarations + functionNodes, extracting calls per-declaration.
    for (const match of matches) {
      const kind = declarationKindFromCaptures(match.captures);

      // Find the node capture that represents the whole declaration (e.g., @fn or @cls)
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
        const calls = new Set();

        if (declNode) {
          const startLine = declNode.startPosition.row + 1;
          const endLine = declNode.endPosition.row + 1;
          loc = Math.max(1, endLine - startLine + 1);
          const lines = source.split(/\r?\n/);
          bodySource = lines.slice(startLine - 1, endLine).join('\n');

          if (callsQuery) {
            for (const callMatch of callsQuery.matches(declNode)) {
              for (const callCapture of callMatch.captures) {
                if (callCapture.name !== 'call') continue;
                const calledName = callCapture.node.text;
                if (!calledName) continue;
                if (!declarationNames.has(calledName)) continue;
                if (calledName === name) continue; // exclude self-recursion
                calls.add(calledName);
              }
            }
          }
        }

        functionNodes.push({ name, kind, calls: [...calls], loc, bodySource });
      }
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
