import { readFile } from 'fs/promises';
import { parentPort, workerData } from 'worker_threads';
import { parse } from '@babel/parser';

function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  visit(node);

  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end') continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) {
        if (child && typeof child === 'object') walk(child, visit);
      }
      continue;
    }
    if (value && typeof value === 'object') {
      walk(value, visit);
    }
  }
}

function pushDeclaration(declarations, seen, name, kind) {
  if (!name) return;
  const key = `${kind}:${name}`;
  if (seen.has(key)) return;
  seen.add(key);
  declarations.push({ name, kind });
}

function extractFromAst(ast) {
  const imports = [];
  const declarations = [];
  const seenDecl = new Set();

  walk(ast, (node) => {
    if (node.type === 'ImportDeclaration' && typeof node.source?.value === 'string') {
      imports.push(node.source.value);
    }

    if (
      (node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration') &&
      typeof node.source?.value === 'string'
    ) {
      imports.push(node.source.value);
    }

    if (
      node.type === 'CallExpression' &&
      node.callee?.type === 'Identifier' &&
      node.callee.name === 'require' &&
      node.arguments?.length === 1 &&
      node.arguments[0]?.type === 'StringLiteral'
    ) {
      imports.push(node.arguments[0].value);
    }

    if (node.type === 'FunctionDeclaration' && node.id?.name) {
      pushDeclaration(declarations, seenDecl, node.id.name, 'function');
    }

    if (node.type === 'ClassDeclaration' && node.id?.name) {
      pushDeclaration(declarations, seenDecl, node.id.name, 'class');
    }

    if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier') {
      pushDeclaration(declarations, seenDecl, node.id.name, 'variable');
    }

    if (node.type === 'TSInterfaceDeclaration' && node.id?.name) {
      pushDeclaration(declarations, seenDecl, node.id.name, 'interface');
    }

    if (node.type === 'TSTypeAliasDeclaration' && node.id?.name) {
      pushDeclaration(declarations, seenDecl, node.id.name, 'type');
    }
  });

  return { imports, declarations };
}

async function run() {
  const { filePath, relativePath } = workerData;
  const code = await readFile(filePath, 'utf8');

  const ast = parse(code, {
    sourceType: 'module',
    errorRecovery: true,
    plugins: ['typescript', 'jsx', 'decorators-legacy', 'classProperties', 'dynamicImport'],
  });

  const { imports, declarations } = extractFromAst(ast);

  return {
    relativePath,
    imports,
    declarations,
    metrics: {
      loc: code.split(/\r?\n/).length,
      importCount: imports.length,
      declarationCount: declarations.length,
    },
    parseError: null,
  };
}

run()
  .then((result) => {
    parentPort.postMessage(result);
  })
  .catch((error) => {
    parentPort.postMessage({
      relativePath: workerData.relativePath,
      imports: [],
      declarations: [],
      metrics: {},
      parseError: error.message,
    });
  });
