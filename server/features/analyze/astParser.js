import { promises as fs, existsSync } from 'fs';
import path from 'path';
import { parse } from '@babel/parser';
import pLimit from 'p-limit';

/** Extensions tried (in order) when resolving a bare specifier like `./utils`. */
const RESOLVE_EXTS = ['.js', '.ts', '.jsx', '.tsx'];

/** Concurrency cap: parse at most 20 files simultaneously. */
const limit = pLimit(20);

// ---------------------------------------------------------------------------
// Type inference
// ---------------------------------------------------------------------------

/**
 * Infer a semantic file type from its project-relative path.
 *
 * @param {string} relPath - e.g. "src/components/Button.jsx"
 * @returns {"component"|"page"|"hook"|"service"|"util"|"config"|"module"}
 */
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

// ---------------------------------------------------------------------------
// AST parsing
// ---------------------------------------------------------------------------

/**
 * Parse a single source file and extract all static import / export-from /
 * require() specifiers.
 *
 * @param {string} filePath - Absolute path to the file.
 * @returns {Promise<string[]>}
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
    return [];
  }

  const imports = [];

  for (const node of ast.program.body) {
    // import ... from '...'
    if (node.type === 'ImportDeclaration' && typeof node.source?.value === 'string') {
      imports.push(node.source.value);
    }

    // export { ... } from '...'  or  export * from '...'
    if (
      (node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration') &&
      typeof node.source?.value === 'string'
    ) {
      imports.push(node.source.value);
    }

    // const x = require('...')  or  require('...')
    if (node.type === 'ExpressionStatement') collectRequires(node.expression, imports);
    if (node.type === 'VariableDeclaration') {
      for (const decl of node.declarations) {
        if (decl.init) collectRequires(decl.init, imports);
      }
    }
  }

  return imports;
}

/** Recursively walk an AST node collecting require('...') arguments. */
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

// ---------------------------------------------------------------------------
// Specifier resolution (Issue #1 + #2)
// ---------------------------------------------------------------------------

/**
 * Resolve a relative import specifier to an absolute path that exists on disk.
 * Tries multiple extensions and `index.*` variants.
 * Returns `null` for bare package names or unresolvable paths.
 *
 * @param {string} fromFile  - Absolute path of the importing file.
 * @param {string} specifier - Raw import string (e.g. './utils', '../lib/api').
 * @returns {string|null} Absolute path, or null if not resolvable.
 */
function resolveToAbsolute(fromFile, specifier) {
  // Ignore bare module names and URLs
  if (!specifier.startsWith('.') && !specifier.startsWith('/')) return null;

  const base = path.resolve(path.dirname(fromFile), specifier);

  // 1. Already has an extension and exists
  if (path.extname(base) && existsSync(base)) return base;

  // 2. Try appending each extension
  for (const ext of RESOLVE_EXTS) {
    const candidate = base + ext;
    if (existsSync(candidate)) return candidate;
  }

  // 3. Try index.* inside the directory
  for (const ext of RESOLVE_EXTS) {
    const candidate = path.join(base, 'index' + ext);
    if (existsSync(candidate)) return candidate;
  }

  // Not found on disk — skip this dependency
  return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a dependency graph from a list of scanned source files.
 *
 * Each value is an object `{ deps: string[], type: string }` where:
 * - `deps` is a deduplicated list of project-relative dependency paths
 * - `type` is a semantic label inferred from the file's location
 *
 * @param {string[]} files   - Absolute file paths to analyse.
 * @param {string}   rootDir - Project root (used to compute relative keys).
 * @returns {Promise<Record<string, { deps: string[], type: string }>>}
 */
export async function buildDependencyGraph(files, rootDir) {
  const graph = {};

  // Build a set of all known project files (relative paths) for fast lookup
  const knownFiles = new Set(files.map((f) => path.relative(rootDir, f)));

  await Promise.all(
    files.map((filePath) =>
      limit(async () => {
        const key = path.relative(rootDir, filePath);
        const specifiers = await extractImports(filePath);

        const deps = specifiers
          .map((s) => resolveToAbsolute(filePath, s))
          .filter(Boolean) // drop unresolvable / third-party
          .map((abs) => path.relative(rootDir, abs))
          .filter((rel) => knownFiles.has(rel)); // only known project files

        graph[key] = {
          deps: [...new Set(deps)],
          type: inferFileType(key),
        };
      }),
    ),
  );

  return graph;
}
