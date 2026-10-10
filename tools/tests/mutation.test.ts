import { describe, expect, it } from 'vitest';
import { classifyChanges } from '../src/classify.ts';
import { filesToMutate, parseMutationReport } from '../src/mutation.ts';

const openPr = { labels: [], draft: false, isFork: false };

type Mutant = { status: string; mutatorName?: string; replacement?: string; line?: number; column?: number };

function strykerReport(files: Record<string, readonly Mutant[]>): string {
  return JSON.stringify({
    schemaVersion: '1.0',
    thresholds: { high: 80, low: 60, break: null },
    files: Object.fromEntries(
      Object.entries(files).map(([path, mutants]) => [
        path,
        {
          language: 'typescript',
          source: 'export const x = 1;',
          mutants: mutants.map(({ status, mutatorName = 'ConditionalExpression', replacement, line = 1, column = 1 }, i) => ({
            id: String(i),
            mutatorName,
            ...(replacement === undefined ? {} : { replacement }),
            status,
            location: { start: { line, column }, end: { line, column: column + 1 } },
          })),
        },
      ]),
    ),
  });
}

describe('filesToMutate', () => {
  it('lists the changed source files of each package, relative to the package', () => {
    const classification = classifyChanges(
      ['backend/src/features/todos/router.ts', 'frontend/src/features/todos/api/useTodos.ts', 'frontend/src/App.tsx'],
      openPr,
    );

    expect(filesToMutate(classification)).toEqual({
      backend: ['src/features/todos/router.ts'],
      frontend: ['src/features/todos/api/useTodos.ts', 'src/App.tsx'],
    });
  });

  it('leaves out tests and every Skipped file', () => {
    const classification = classifyChanges(
      [
        'backend/tests/router.test.ts',
        'frontend/src/features/todos/TodoItem.test.tsx',
        'frontend/src/test/setup.ts',
        'backend/src/features/todos/types.ts',
        'backend/src/generated/prisma/client.ts',
        'backend/src/main.ts',
        'frontend/src/design-system/Button.tsx',
        'frontend/src/features/todos/index.ts',
        'frontend/src/App.styles.ts',
        'backend/vitest.config.ts',
        'README.md',
        'tools/src/report.ts',
      ],
      openPr,
    );

    expect(filesToMutate(classification)).toEqual({ backend: [], frontend: [] });
  });

  it('still lists the changed source files when the Test Agent is stopped, since verification always runs', () => {
    const classification = classifyChanges(['backend/src/api/health.ts'], { ...openPr, draft: true });

    expect(filesToMutate(classification)).toEqual({ backend: ['src/api/health.ts'], frontend: [] });
  });
});

describe('parseMutationReport', () => {
  it('scores killed and timed-out mutants as detected, and survived and uncovered ones as not', () => {
    const report = strykerReport({
      'src/a.ts': [{ status: 'Killed' }, { status: 'Killed' }, { status: 'Timeout' }, { status: 'Survived' }],
      'src/b.ts': [{ status: 'Killed' }, { status: 'Killed' }, { status: 'Killed' }, { status: 'NoCoverage' }],
    });

    const parsed = parseMutationReport(report);

    expect(parsed).toMatchObject({ ok: true, summary: { score: 75, detected: 6, survived: 1, noCoverage: 1 } });
  });

  it('leaves ignored, erroring, and pending mutants out of the score', () => {
    const report = strykerReport({
      'src/a.ts': [
        { status: 'Killed' },
        { status: 'Survived' },
        { status: 'Ignored' },
        { status: 'CompileError' },
        { status: 'RuntimeError' },
        { status: 'Pending' },
      ],
    });

    expect(parseMutationReport(report)).toMatchObject({ ok: true, summary: { score: 50, detected: 1, survived: 1, noCoverage: 0 } });
  });

  it('has no score when no mutant could be tested', () => {
    const report = strykerReport({ 'src/a.ts': [{ status: 'Ignored' }], 'src/b.ts': [] });

    expect(parseMutationReport(report)).toMatchObject({ ok: true, summary: { score: null, detected: 0, survivors: [] } });
  });

  it('lists each surviving and uncovered mutant with its place and change, ordered by file and line', () => {
    const report = strykerReport({
      'src/b.ts': [{ status: 'NoCoverage', mutatorName: 'BlockStatement', replacement: '{}', line: 3, column: 7 }],
      'src/a.ts': [
        { status: 'Survived', mutatorName: 'EqualityOperator', replacement: 'a <= b', line: 9, column: 10 },
        { status: 'Killed', line: 1 },
        { status: 'Survived', mutatorName: 'BooleanLiteral', line: 2, column: 4 },
      ],
    });

    const parsed = parseMutationReport(report);

    expect(parsed.ok && parsed.summary.survivors).toEqual([
      { file: 'src/a.ts', line: 2, column: 4, mutator: 'BooleanLiteral', replacement: null, status: 'Survived' },
      { file: 'src/a.ts', line: 9, column: 10, mutator: 'EqualityOperator', replacement: 'a <= b', status: 'Survived' },
      { file: 'src/b.ts', line: 3, column: 7, mutator: 'BlockStatement', replacement: '{}', status: 'NoCoverage' },
    ]);
  });

  it('rejects input that is not JSON', () => {
    expect(parseMutationReport('{"files":')).toEqual({ ok: false, error: 'mutation report is not valid JSON' });
  });

  it('rejects oversized input without parsing it', () => {
    expect(parseMutationReport(' '.repeat(10_000_001))).toEqual({
      ok: false,
      error: 'mutation report is longer than 10000000 characters',
    });
  });

  it.each([
    ['no files', JSON.stringify({ schemaVersion: '1.0' }), 'files is not an object'],
    ['files as an array', JSON.stringify({ files: [] }), 'files is not an object'],
    ['mutants that are not a list', JSON.stringify({ files: { 'src/a.ts': { mutants: {} } } }), 'files[0].mutants is not an array'],
    ['an unknown status', strykerReport({ 'src/a.ts': [{ status: 'Killed' }, { status: 'Exploded' }] }), 'files[0].mutants[1].status is not a known status'],
    ['a mutator name that is not a word', strykerReport({ 'src/a.ts': [{ status: 'Survived', mutatorName: '<img>' }] }), 'files[0].mutants[0].mutatorName is not a mutator name'],
    ['a fractional line', strykerReport({ 'src/a.ts': [{ status: 'Survived', line: 1.5 }] }), 'files[0].mutants[0].location is not a line and column'],
    ['a control character in a file name', strykerReport({ 'src/a\n.ts': [{ status: 'Survived' }] }), 'files[0] has a file name with a control character'],
    ['a non-string replacement', JSON.stringify({ files: { 'src/a.ts': { mutants: [{ mutatorName: 'X', status: 'Survived', replacement: 1, location: { start: { line: 1, column: 1 } } }] } } }), 'files[0].mutants[0].replacement is not a string'],
  ])('rejects a report with %s, naming the field', (_case, report, error) => {
    expect(parseMutationReport(report)).toEqual({ ok: false, error });
  });
});
