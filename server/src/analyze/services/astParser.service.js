import { promises as fs, existsSync } from 'fs';
import path from 'path';
import { parse } from '@babel/parser';
import pLimit from 'p-limit';

const RESOLVE_EXTS = ['.js', '.ts', '.jsx', '.tsx'];

const limit = pLimit(20);

function inferFileType(relPath) {
  const normalised = relPath.replace(/\\/g, '/').toLowerCase();
  const segments = normalised.split('/');
  const filename = segments[segments.length - 1];

  if (segments.some((s) => s === 'components' || s === 'component')) return 'component';
  if (segments.some((s) => s === 'pages' || s === 'views' || s === 'screens')) return 'page';
  if (segments.some((s) => s === 'hooks')) return 'hook';
  if (segments.some((s) => s === 'services' || s === 'api' || s === 'apis')) return 'service';
  if (segments.some((s) => s === 'utils' || s === 'helpers' || s === 'lib')) return 'util';
  if (/config|\.conf\.|\.rc\./.test(filename)) return 'config';
  return 'module';
}


async function extractImports(filePath) {
  const code = await fs.readFile(filePath, 'utf8');

  let ast;
  try {
    ast = parse(code, {
      sourceType: 'module',
      errorRecovery: true,
      plugins: ['typescript', 'jsx', 'decorators-legacy', 'classProperties', 'dynamicImport'],
    });
  } catch {
    return [];
  }

  const imports = [];

  for (const node of ast.program.body) {
    if (node.type === 'ImportDeclaration' && typeof node.source?.value === 'string') {
      imports.push(node.source.value);
    }

    if (
      (node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration') &&
      typeof node.source?.value === 'string'
    ) {
      imports.push(node.source.value);
    }

    if (node.type === 'ExpressionStatement') collectRequires(node.expression, imports);
    if (node.type === 'VariableDeclaration') {
      for (const decl of node.declarations) {
        if (decl.init) collectRequires(decl.init, imports);
      }
    }
  }

  return imports;
}

function collectRequires(node, imports) {
  if (!node || typeof node !== 'object') return;

  if (
    node.type === 'CallExpression' &&
    node.callee?.name === 'require' &&
    node.arguments?.length === 1 &&
    node.arguments[0].type === 'StringLiteral'
  ) {
    imports.push(node.arguments[0].value);
    return;
  }

  for (const key of Object.keys(node)) {
    if (key === 'type') continue;
    const child = node[key];
    if (Array.isArray(child)) {
      child.forEach((c) => collectRequires(c, imports));
    } else if (child && typeof child === 'object' && child.type) {
      collectRequires(child, imports);
    }
  }
}


function resolveToAbsolute(fromFile, specifier) {
  if (!specifier.startsWith('.') && !specifier.startsWith('/')) return null;

  const base = path.resolve(path.dirname(fromFile), specifier);

  if (path.extname(base) && existsSync(base)) return base;

  for (const ext of RESOLVE_EXTS) {
    const candidate = base + ext;
    if (existsSync(candidate)) return candidate;
  }

  for (const ext of RESOLVE_EXTS) {
    const candidate = path.join(base, 'index' + ext);
    if (existsSync(candidate)) return candidate;
  }

  return null;
}


export async function buildDependencyGraph(files, rootDir) {
  const graph = {};
  const knownFiles = new Set(files.map((f) => path.relative(rootDir, f)));

  await Promise.all(
    files.map((filePath) =>
      limit(async () => {
        const key = path.relative(rootDir, filePath);
        const specifiers = await extractImports(filePath);

        const deps = specifiers
          .map((s) => resolveToAbsolute(filePath, s))
          .filter(Boolean)
          .map((abs) => path.relative(rootDir, abs))
          .filter((rel) => knownFiles.has(rel));

        graph[key] = {
          deps: [...new Set(deps)],
          type: inferFileType(key),
        };
      }),
    ),
  );

  return graph;
}
