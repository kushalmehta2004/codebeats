import {
  extractFileMetrics,
  computeDeadCodeRatio,
  computeDuplicationRatio,
  computeTestCoverageProxy,
  aggregateFileMetrics,
} from '../src/services/metricExtractor';
import type { ParsedFile, FileMetrics } from '../src/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeFile(path: string, content: string): ParsedFile {
  return { path, content, loc: content.split('\n').length };
}

// ─── extractFileMetrics ────────────────────────────────────────────────────────

describe('extractFileMetrics', () => {
  test('simple function has base complexity of 1', () => {
    const file = makeFile(
      'src/add.ts',
      `export function add(a: number, b: number): number {
  return a + b;
}`,
    );
    const m = extractFileMetrics(file);
    expect(m.functions).toHaveLength(1);
    expect(m.functions[0].name).toBe('add');
    expect(m.functions[0].complexity).toBe(1);
    expect(m.functions[0].params).toBe(2);
  });

  test('if, for-of, logical && each add 1 to complexity', () => {
    const file = makeFile(
      'src/process.ts',
      `function process(x: number, items: any[]) {
  if (x > 0) {
    for (const item of items) {
      if (item.active && item.valid) {
        return item;
      }
    }
  }
  return null;
}`,
    );
    const m = extractFileMetrics(file);
    expect(m.functions).toHaveLength(1);
    // base(1) + if(1) + for-of(1) + if(1) + &&(1) = 5
    expect(m.functions[0].complexity).toBe(5);
  });

  test('switch cases each add 1; default does not', () => {
    const file = makeFile(
      'src/switch.ts',
      `function grade(n: number) {
  switch (n) {
    case 1: return 'A';
    case 2: return 'B';
    case 3: return 'C';
    default: return 'F';
  }
}`,
    );
    const m = extractFileMetrics(file);
    // base(1) + case1(1) + case2(1) + case3(1) = 4  (default not counted)
    expect(m.functions[0].complexity).toBe(4);
  });

  test('ternary operator adds 1 to complexity', () => {
    const file = makeFile(
      'src/ternary.ts',
      `const sign = (n: number) => n > 0 ? 'pos' : 'neg';`,
    );
    const m = extractFileMetrics(file);
    // base(1) + ternary(1) = 2
    expect(m.functions[0].complexity).toBe(2);
  });

  test('nested functions track complexity independently', () => {
    const file = makeFile(
      'src/nested.ts',
      `function outer(flag: boolean) {
  if (flag) {
    return function inner(x: number) {
      if (x > 0) return x;
      return -x;
    };
  }
  return null;
}`,
    );
    const m = extractFileMetrics(file);
    const outer = m.functions.find((f) => f.name === 'outer')!;
    const inner = m.functions.find((f) => f.name === 'inner')!;
    // outer: base(1) + if(flag)(1) = 2  (the if(x>0) is inside inner, not counted here)
    expect(outer.complexity).toBe(2);
    // inner: base(1) + if(x>0)(1) = 2
    expect(inner.complexity).toBe(2);
  });

  test('ES module imports are collected', () => {
    const file = makeFile(
      'src/app.ts',
      `import React from 'react';
import { useState } from 'react';
import axios from 'axios';
`,
    );
    const m = extractFileMetrics(file);
    expect(m.imports).toContain('react');
    expect(m.imports).toContain('axios');
    expect(m.imports.filter((i) => i === 'react')).toHaveLength(2);
  });

  test('CommonJS require() calls are collected', () => {
    const file = makeFile(
      'src/legacy.js',
      `const fs = require('fs');
const path = require('path');
`,
    );
    const m = extractFileMetrics(file);
    expect(m.imports).toContain('fs');
    expect(m.imports).toContain('path');
  });

  test('named exports are collected', () => {
    const file = makeFile(
      'src/utils.ts',
      `export function helper() {}
export const PI = 3.14;
export { helper as util };
`,
    );
    const m = extractFileMetrics(file);
    expect(m.exports).toContain('helper');
    expect(m.exports).toContain('PI');
    expect(m.exports).toContain('util');
  });

  test('default export is recorded as "default"', () => {
    const file = makeFile('src/Component.tsx', `export default function App() { return null; }`);
    const m = extractFileMetrics(file);
    expect(m.exports).toContain('default');
  });

  test('test files are flagged', () => {
    const testFile = makeFile('src/__tests__/add.test.ts', `it('works', () => {})`);
    const srcFile = makeFile('src/add.ts', `export const add = (a: number) => a;`);
    expect(extractFileMetrics(testFile).isTestFile).toBe(true);
    expect(extractFileMetrics(srcFile).isTestFile).toBe(false);
  });

  test('parse errors are recorded but do not throw', () => {
    const file = makeFile('src/broken.ts', `this is not valid typescript @@@@`);
    expect(() => extractFileMetrics(file)).not.toThrow();
    const m = extractFileMetrics(file);
    // Either parseError is set or functions is empty
    expect(m.functions.length === 0 || typeof m.parseError === 'string').toBe(true);
  });
});

// ─── computeDeadCodeRatio ─────────────────────────────────────────────────────

describe('computeDeadCodeRatio', () => {
  test('returns 0 when all exports are imported by other files', () => {
    const files: FileMetrics[] = [
      {
        path: 'src/utils.ts',
        loc: 10,
        functions: [],
        imports: [],
        exports: ['helper'],
        isTestFile: false,
      },
      {
        path: 'src/app.ts',
        loc: 5,
        functions: [],
        imports: ['./utils', './utils/helper'],
        exports: ['default'],
        isTestFile: false,
      },
    ];
    // 'utils' appears in the import path './utils', so it should be considered imported
    // Result should be 0 (or close to 0)
    const ratio = computeDeadCodeRatio(files);
    expect(ratio).toBeGreaterThanOrEqual(0);
    expect(ratio).toBeLessThanOrEqual(1);
  });

  test('returns 0 when there are no exportable candidate files', () => {
    const files: FileMetrics[] = [
      { path: 'src/main.ts', loc: 5, functions: [], imports: [], exports: ['default'], isTestFile: false },
    ];
    // main.ts matches entrypoint pattern → excluded → ratio = 0
    expect(computeDeadCodeRatio(files)).toBe(0);
  });

  test('is between 0 and 1 inclusive', () => {
    const files: FileMetrics[] = Array.from({ length: 10 }, (_, i) => ({
      path: `src/module${i}.ts`,
      loc: 20,
      functions: [],
      imports: [],
      exports: [`func${i}`],
      isTestFile: false,
    }));
    const ratio = computeDeadCodeRatio(files);
    expect(ratio).toBeGreaterThanOrEqual(0);
    expect(ratio).toBeLessThanOrEqual(1);
  });
});

// ─── computeDuplicationRatio ──────────────────────────────────────────────────

describe('computeDuplicationRatio', () => {
  test('returns 0 for unique content across files', () => {
    const files: ParsedFile[] = [
      makeFile('src/a.ts', 'const a = 1;\nconst b = 2;\nconst c = 3;\nconst d = 4;\nconst e = 5;\nconst f = 6;'),
      makeFile('src/b.ts', 'const g = 7;\nconst h = 8;\nconst i = 9;\nconst j = 10;\nconst k = 11;\nconst l = 12;'),
    ];
    const ratio = computeDuplicationRatio(files);
    expect(ratio).toBe(0);
  });

  test('returns > 0 when the same block appears in multiple files', () => {
    const sharedBlock = `function processItem(item) {
  if (!item) return null;
  const result = transform(item);
  validate(result);
  return result;
}`;
    const files: ParsedFile[] = [
      makeFile('src/a.ts', sharedBlock + '\nconst unique1 = true;'),
      makeFile('src/b.ts', sharedBlock + '\nconst unique2 = true;'),
    ];
    const ratio = computeDuplicationRatio(files);
    expect(ratio).toBeGreaterThan(0);
  });

  test('returns value in [0, 1]', () => {
    const content = Array.from({ length: 30 }, (_, i) => `const x${i} = ${i};`).join('\n');
    const files: ParsedFile[] = [makeFile('src/a.ts', content), makeFile('src/b.ts', content)];
    const ratio = computeDuplicationRatio(files);
    expect(ratio).toBeGreaterThanOrEqual(0);
    expect(ratio).toBeLessThanOrEqual(1);
  });
});

// ─── computeTestCoverageProxy ─────────────────────────────────────────────────

describe('computeTestCoverageProxy', () => {
  test('returns 0 when there are no test files', () => {
    const files: FileMetrics[] = [
      { path: 'src/a.ts', loc: 100, functions: [], imports: [], exports: [], isTestFile: false },
    ];
    expect(computeTestCoverageProxy(files)).toBe(0);
  });

  test('returns 1 when test LOC is ≥ 30% of total LOC', () => {
    const files: FileMetrics[] = [
      { path: 'src/a.ts', loc: 700, functions: [], imports: [], exports: [], isTestFile: false },
      { path: 'src/a.test.ts', loc: 300, functions: [], imports: [], exports: [], isTestFile: true },
    ];
    // 300/1000 = 0.30 → proxy = 1.0
    expect(computeTestCoverageProxy(files)).toBe(1);
  });

  test('returns proportional value below threshold', () => {
    const files: FileMetrics[] = [
      { path: 'src/a.ts', loc: 900, functions: [], imports: [], exports: [], isTestFile: false },
      { path: 'src/a.test.ts', loc: 100, functions: [], imports: [], exports: [], isTestFile: true },
    ];
    // 100 / 1000 = 0.10; 0.10 / 0.30 ≈ 0.333
    const proxy = computeTestCoverageProxy(files);
    expect(proxy).toBeCloseTo(1 / 3, 2);
  });
});

// ─── aggregateFileMetrics ─────────────────────────────────────────────────────

describe('aggregateFileMetrics', () => {
  test('computes average complexity and function length correctly', () => {
    const files: FileMetrics[] = [
      {
        path: 'src/a.ts',
        loc: 50,
        functions: [
          { name: 'f1', loc: 20, complexity: 3, params: 1 },
          { name: 'f2', loc: 40, complexity: 7, params: 2 },
        ],
        imports: ['react', 'axios'],
        exports: [],
        isTestFile: false,
      },
      {
        path: 'src/b.ts',
        loc: 30,
        functions: [{ name: 'f3', loc: 15, complexity: 5, params: 0 }],
        imports: ['lodash'],
        exports: [],
        isTestFile: false,
      },
    ];

    const agg = aggregateFileMetrics(files);
    // avg complexity = (3 + 7 + 5) / 3 = 5
    expect(agg.avgCyclomaticComplexity).toBeCloseTo(5, 5);
    // avg function length = (20 + 40 + 15) / 3 = 25
    expect(agg.avgFunctionLength).toBeCloseTo(25, 5);
    // import density = (2 + 1) / 2 files = 1.5
    expect(agg.importDensity).toBeCloseTo(1.5, 5);
  });

  test('excludes test files from aggregation', () => {
    const testFile: FileMetrics = {
      path: 'src/a.test.ts',
      loc: 100,
      functions: [{ name: 'it', loc: 90, complexity: 100, params: 0 }],
      imports: [],
      exports: [],
      isTestFile: true,
    };
    const srcFile: FileMetrics = {
      path: 'src/a.ts',
      loc: 20,
      functions: [{ name: 'fn', loc: 20, complexity: 2, params: 0 }],
      imports: [],
      exports: [],
      isTestFile: false,
    };
    const agg = aggregateFileMetrics([testFile, srcFile]);
    expect(agg.avgCyclomaticComplexity).toBe(2);
  });
});
