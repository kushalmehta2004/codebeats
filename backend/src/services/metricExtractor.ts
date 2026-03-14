import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import type { ParsedFile, FileMetrics, FunctionMetric } from '../types';

// @babel/traverse ships as CJS with a `default` property; handle both module shapes.
const traverse: typeof _traverse =
  typeof _traverse === 'function' ? _traverse : (_traverse as any).default;

// ─── Babel parser config ──────────────────────────────────────────────────────

const BABEL_PLUGINS: any[] = [
  'typescript',
  'jsx',
  'decorators-legacy',
  'classProperties',
  'classStaticBlock',
  'optionalChaining',
  'nullishCoalescingOperator',
  'optionalCatchBinding',
  'logicalAssignment',
  'numericSeparator',
  'importAssertions',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TEST_FILE_RE =
  /(?:\.test\.|\.spec\.)|(?:__tests__[/\\])|(?:(?:^|[/\\])tests?[/\\])|(?:\.test\.tsx?$)|(?:\.spec\.tsx?$)/i;

const ENTRY_POINT_RE = /(?:^|\/)(?:main|index|app|server|entry)\.[jt]sx?$/i;
const PAGE_ROUTE_RE = /(?:^|\/)(?:pages|routes|app)\/[^/]+\.[jt]sx?$/i;

/** Extracts a human-readable name for a function node from its surrounding AST context. */
function resolveFunctionName(path: any): string {
  const node = path.node;
  // Named function declaration or expression
  if (node.id?.name) return node.id.name as string;
  // Class method
  if (node.key?.name) return node.key.name as string;
  // Arrow / anonymous assigned to a variable: const foo = () => {}
  if (path.parent?.type === 'VariableDeclarator' && path.parent.id?.name) {
    return path.parent.id.name as string;
  }
  // Assigned to object property: { foo: function() {} }
  if (path.parent?.type === 'Property' && path.parent.key?.name) {
    return path.parent.key.name as string;
  }
  // Assigned to class property: foo = () => {}
  if (path.parent?.type === 'ClassProperty' && path.parent.key?.name) {
    return path.parent.key.name as string;
  }
  return '<anonymous>';
}

// ─── Per-file metric extraction ───────────────────────────────────────────────

/**
 * Parses a single JS/TS file and extracts:
 * - Per-function cyclomatic complexity (decision-point count proxy)
 * - Per-function line count
 * - Module imports
 * - Module exports
 *
 * Uses `errorRecovery: true` so syntax errors in one file don't abort the run.
 */
export function extractFileMetrics(file: ParsedFile): FileMetrics {
  const result: FileMetrics = {
    path: file.path,
    loc: file.loc,
    functions: [],
    imports: [],
    exports: [],
    isTestFile: TEST_FILE_RE.test(file.path),
  };

  let ast: ReturnType<typeof parse>;
  try {
    ast = parse(file.content, {
      sourceType: 'module',
      allowImportExportEverywhere: true,
      allowReturnOutsideFunction: true,
      plugins: BABEL_PLUGINS,
      errorRecovery: true,
    });
  } catch (err: any) {
    result.parseError = (err as Error).message;
    return result;
  }

  // ── Function complexity tracking ──────────────────────────────────────────
  interface FunctionFrame {
    name: string;
    startLine: number;
    complexity: number;
    params: number;
  }
  const stack: FunctionFrame[] = [];

  const incrementTop = () => {
    if (stack.length > 0) stack[stack.length - 1].complexity++;
  };

  const FUNCTION_TYPES =
    'FunctionDeclaration|FunctionExpression|ArrowFunctionExpression|ClassMethod|ObjectMethod';

  try {
    traverse(ast, {
      // ── Enter / exit a function ──────────────────────────────────────────
      [FUNCTION_TYPES]: {
        enter(path: any) {
          stack.push({
            name: resolveFunctionName(path),
            startLine: path.node.loc?.start.line ?? 0,
            complexity: 1, // base complexity = 1
            params: (path.node.params?.length as number) ?? 0,
          });
        },
        exit(path: any) {
          const frame = stack.pop();
          if (!frame) return;
          const endLine = (path.node.loc?.end.line as number) ?? frame.startLine;
          result.functions.push({
            name: frame.name,
            loc: Math.max(1, endLine - frame.startLine + 1),
            complexity: frame.complexity,
            params: frame.params,
          } as FunctionMetric);
        },
      },

      // ── Decision-point visitors (each adds 1 to the innermost function) ──

      IfStatement() {
        incrementTop();
      },
      ForStatement() {
        incrementTop();
      },
      ForInStatement() {
        incrementTop();
      },
      ForOfStatement() {
        incrementTop();
      },
      ForAwaitStatement() {
        incrementTop();
      },
      WhileStatement() {
        incrementTop();
      },
      DoWhileStatement() {
        incrementTop();
      },
      /** Only non-default cases contribute (default is the "else" path) */
      SwitchCase(path: any) {
        if (path.node.test !== null) incrementTop();
      },
      /** Both && and || create an alternative execution path */
      LogicalExpression(path: any) {
        if (path.node.operator === '&&' || path.node.operator === '||') incrementTop();
      },
      /** Ternary operator */
      ConditionalExpression() {
        incrementTop();
      },
      /** catch block */
      CatchClause() {
        incrementTop();
      },

      // ── Imports ──────────────────────────────────────────────────────────
      ImportDeclaration(path: any) {
        result.imports.push(path.node.source.value as string);
      },
      /** CommonJS require('...') */
      CallExpression(path: any) {
        if (
          path.node.callee.type === 'Identifier' &&
          path.node.callee.name === 'require' &&
          path.node.arguments[0]?.type === 'StringLiteral'
        ) {
          result.imports.push(path.node.arguments[0].value as string);
        }
      },

      // ── Exports ──────────────────────────────────────────────────────────
      ExportNamedDeclaration(path: any) {
        const decl = path.node.declaration;
        if (decl) {
          if (decl.declarations) {
            (decl.declarations as any[]).forEach((d) => {
              if (d.id?.name) result.exports.push(d.id.name as string);
            });
          } else if (decl.id?.name) {
            result.exports.push(decl.id.name as string);
          }
        }
        (path.node.specifiers as any[]).forEach((s) => {
          if (s.exported?.name) result.exports.push(s.exported.name as string);
        });
      },
      ExportDefaultDeclaration() {
        result.exports.push('default');
      },
    });
  } catch (err: any) {
    // Traverse errors on malformed ASTs are non-fatal; return partial results
    result.parseError = (result.parseError ? result.parseError + '; ' : '') + (err as Error).message;
  }

  return result;
}

// ─── Repo-level aggregations ──────────────────────────────────────────────────

/**
 * Estimates the dead-code ratio for the repository.
 *
 * Heuristic: a non-test source file is "dead" if it has exports but its
 * file name (without extension) does not appear in any import statement
 * across the whole repo. Entry-point files (index, main, app, etc.) and
 * Next.js / framework page-route files are excluded to reduce false positives.
 *
 * @returns A value in [0, 1] where 0 means no detectable dead code.
 */
export function computeDeadCodeRatio(allFiles: FileMetrics[]): number {
  // Collect every import path referenced in the whole codebase
  const allImportPaths = new Set<string>();
  for (const file of allFiles) {
    for (const imp of file.imports) {
      allImportPaths.add(imp);
    }
  }

  // Candidate files: non-test files that export something and aren't entry points
  const candidates = allFiles.filter(
    (f) =>
      !f.isTestFile &&
      f.exports.length > 0 &&
      !ENTRY_POINT_RE.test(f.path) &&
      !PAGE_ROUTE_RE.test(f.path),
  );

  if (candidates.length === 0) return 0;

  let notImported = 0;
  for (const file of candidates) {
    // Strip path prefix and extension for matching  e.g. "src/utils/helpers.ts" → "helpers"
    const baseName = file.path
      .replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/, '')
      .replace(/\/index$/, '')
      .split('/')
      .pop()!
      .toLowerCase();

    const isImported = Array.from(allImportPaths).some((imp) => {
      const impBase = imp.split('/').pop()?.toLowerCase() ?? '';
      return impBase === baseName || imp.toLowerCase().includes(baseName);
    });

    if (!isImported) notImported++;
  }

  return notImported / candidates.length;
}

/**
 * Estimates code duplication by hashing overlapping 6-line windows across all
 * files and counting windows that appear more than once.
 *
 * @returns A value in [0, 1] where 0 means no detectable duplication.
 */
export function computeDuplicationRatio(allFiles: ParsedFile[]): number {
  const WINDOW = 6;
  const MIN_WINDOW_LENGTH = 60; // Skip trivial windows (e.g. blank lines / braces only)
  const windowFreq = new Map<string, number>();
  let totalWindows = 0;

  for (const file of allFiles) {
    const lines = file.content
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('//') && !l.startsWith('*'));

    for (let i = 0; i <= lines.length - WINDOW; i++) {
      const window = lines.slice(i, i + WINDOW).join('\n');
      if (window.length >= MIN_WINDOW_LENGTH) {
        windowFreq.set(window, (windowFreq.get(window) ?? 0) + 1);
        totalWindows++;
      }
    }
  }

  if (totalWindows === 0) return 0;

  let duplicateCount = 0;
  for (const count of windowFreq.values()) {
    if (count > 1) duplicateCount += count - 1;
  }

  return Math.min(1, duplicateCount / totalWindows);
}

/**
 * Computes the test-coverage proxy from the ratio of test-file LOC to total LOC.
 * A test/source ratio of 0.3 (30 % test code) maps to a proxy of 1.0 (fully tested).
 *
 * @returns A value in [0, 1].
 */
export function computeTestCoverageProxy(allFiles: FileMetrics[]): number {
  const testLOC = allFiles.filter((f) => f.isTestFile).reduce((s, f) => s + f.loc, 0);
  const totalLOC = allFiles.reduce((s, f) => s + f.loc, 0);
  if (totalLOC === 0) return 0;
  const ratio = testLOC / totalLOC;
  // A ratio of 0.30 (30% test code) maps to proxy = 1.0; cap at 1
  return Math.min(1, ratio / 0.3);
}

/**
 * Aggregates per-file metrics into repo-level averages.
 *
 * @param sourceFiles  Files previously passed to `extractFileMetrics`
 * @returns Averaged complexity, function length, and import density
 */
export function aggregateFileMetrics(sourceFiles: FileMetrics[]): {
  avgCyclomaticComplexity: number;
  avgFunctionLength: number;
  importDensity: number;
} {
  const nonTestFiles = sourceFiles.filter((f) => !f.isTestFile);
  if (nonTestFiles.length === 0) {
    return { avgCyclomaticComplexity: 1, avgFunctionLength: 0, importDensity: 0 };
  }

  let totalComplexity = 0;
  let totalFuncCount = 0;
  let totalFuncLength = 0;
  let totalImports = 0;

  for (const file of nonTestFiles) {
    for (const fn of file.functions) {
      totalComplexity += fn.complexity;
      totalFuncLength += fn.loc;
      totalFuncCount++;
    }
    totalImports += file.imports.length;
  }

  return {
    avgCyclomaticComplexity: totalFuncCount > 0 ? totalComplexity / totalFuncCount : 1,
    avgFunctionLength: totalFuncCount > 0 ? totalFuncLength / totalFuncCount : 0,
    importDensity: totalImports / nonTestFiles.length,
  };
}
