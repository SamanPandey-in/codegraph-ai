import { promises as fs } from 'fs';
import path from 'path';
import { parse } from '@babel/parser';

/**
 * Parse a single source file with @babel/parser and extract all
 * static import / require / export-from sources.
 *
 * @param {string} filePath - Absolute path to the source file.
 * @returns {Promise<string[]>} List of raw import specifiers found in the file.
 */
async function extractImports(filePath) {
  const code = await fs.readFile(filePath, 'utf8');

  let ast;
  try {
    ast = parse(code, {
      sourceType: 'module',
      errorRecovery: true,
      plugins: [
        'typescript',
        'jsx',
        'decorators-legacy',
        'classProperties',
        'dynamicImport',
      ],
    });
  } catch {
    // If parsing fails entirely, return empty list
    return [];
  }

  const imports = [];

  for (const node of ast.program.body) {
    // import ... from '...'
    if (
      node.type === 'ImportDeclaration' &&
      typeof node.source?.value === 'string'
    ) {
      imports.push(node.source.value);
    }

    // export { ... } from '...'  or  export * from '...'
    if (
      (node.type === 'ExportNamedDeclaration' ||
        node.type === 'ExportAllDeclaration') &&
      typeof node.source?.value === 'string'
    ) {
      imports.push(node.source.value);
    }

    // const x = require('...')  or  require('...')
    if (node.type === 'ExpressionStatement') {
      collectRequires(node.expression, imports);
    }
    if (node.type === 'VariableDeclaration') {
      for (const decl of node.declarations) {
        if (decl.init) collectRequires(decl.init, imports);
      }
    }
  }

  return imports;
}

/** Walk an AST node looking for require('...') call expressions. */
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

/**
 * Resolve a relative import specifier to a project-relative path.
 * Returns `null` for bare package names (third-party dependencies).
 *
 * @param {string} fromFile  - Absolute path of the file containing the import.
 * @param {string} specifier - The raw import string (e.g. './utils').
 * @param {string} rootDir   - Root of the scanned project.
 * @returns {string|null}
 */
function resolveSpecifier(fromFile, specifier, rootDir) {
  // Ignore non-relative imports (bare module names or URLs)
  if (!specifier.startsWith('.') && !specifier.startsWith('/')) return null;

  const dir = path.dirname(fromFile);
  let resolved = path.resolve(dir, specifier);

  // If no extension, assume .js (best-effort; no fs stat needed)
  if (!path.extname(resolved)) {
    resolved = resolved + '.js';
  }

  return path.relative(rootDir, resolved);
}

/**
 * Build a dependency graph from a list of scanned files.
 *
 * @param {string[]} files   - Absolute file paths.
 * @param {string}   rootDir - Root directory (relative keys are based on this).
 * @returns {Promise<Record<string, string[]>>} Dependency map: file -> [deps].
 */
export async function buildDependencyGraph(files, rootDir) {
  const graph = {};

  await Promise.all(
    files.map(async (filePath) => {
      const key = path.relative(rootDir, filePath);
      const specifiers = await extractImports(filePath);

      const deps = specifiers
        .map((s) => resolveSpecifier(filePath, s, rootDir))
        .filter(Boolean); // remove null (third-party packages)

      graph[key] = [...new Set(deps)]; // deduplicate
    }),
  );

  return graph;
}
