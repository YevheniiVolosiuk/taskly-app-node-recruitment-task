import { describe, expect, it } from 'vitest';
import { parseCoverageSummary } from '../src/coverage.ts';

const root = '/home/runner/work/taskly/taskly';

function metric(covered: number, total: number) {
  return { total, covered, skipped: 0, pct: total === 0 ? 100 : (covered / total) * 100 };
}

function summary(files: Record<string, { lines: ReturnType<typeof metric>; branches: ReturnType<typeof metric> }>): string {
  return JSON.stringify({ total: { lines: metric(1, 2), branches: metric(1, 2) }, ...files });
}

describe('parseCoverageSummary', () => {
  it('reads line and branch coverage of each file, keyed by repository path', () => {
    const json = summary({
      [`${root}/backend/src/api/health.ts`]: { lines: metric(3, 4), branches: metric(1, 2) },
      [`${root}/frontend/src/App.tsx`]: { lines: metric(0, 5), branches: metric(0, 0) },
    });

    expect(parseCoverageSummary(json, root)).toEqual({
      ok: true,
      files: {
        'backend/src/api/health.ts': { lines: 75, branches: 50 },
        'frontend/src/App.tsx': { lines: 0, branches: null },
      },
    });
  });

  it('accepts a root with a trailing slash', () => {
    const json = summary({ [`${root}/backend/src/main.ts`]: { lines: metric(1, 1), branches: metric(0, 0) } });

    expect(parseCoverageSummary(json, `${root}/`)).toEqual({ ok: true, files: { 'backend/src/main.ts': { lines: 100, branches: null } } });
  });

  it('ignores the total and files outside the repository', () => {
    const json = summary({ '/tmp/elsewhere/src/x.ts': { lines: metric(1, 1), branches: metric(1, 1) } });

    expect(parseCoverageSummary(json, root)).toEqual({ ok: true, files: {} });
  });

  it.each([
    ['not JSON', '{', 'coverage summary is not valid JSON'],
    ['not an object', '[]', 'coverage summary is not an object'],
    [
      'a file without line counts',
      JSON.stringify({ [`${root}/backend/src/a.ts`]: { branches: metric(1, 1) } }),
      'backend/src/a.ts has no lines count',
    ],
    [
      'a negative count',
      JSON.stringify({ [`${root}/backend/src/a.ts`]: { lines: metric(-1, 2), branches: metric(1, 1) } }),
      'backend/src/a.ts has no lines count',
    ],
    [
      'more covered than total',
      JSON.stringify({ [`${root}/backend/src/a.ts`]: { lines: metric(3, 2), branches: metric(1, 1) } }),
      'backend/src/a.ts has no lines count',
    ],
    [
      'a fractional count',
      JSON.stringify({ [`${root}/backend/src/a.ts`]: { lines: metric(1, 2), branches: metric(0.5, 1) } }),
      'backend/src/a.ts has no branches count',
    ],
  ])('rejects %s', (_, json, error) => {
    expect(parseCoverageSummary(json, root)).toEqual({ ok: false, error });
  });

  it('rejects a file name with a control character', () => {
    const json = summary({ [`${root}/backend/src/a‮.ts`]: { lines: metric(1, 1), branches: metric(1, 1) } });

    expect(parseCoverageSummary(json, root)).toEqual({ ok: false, error: 'coverage summary has a file name with a control character' });
  });

  it('rejects input over the size cap', () => {
    expect(parseCoverageSummary(' '.repeat(10_000_001), root)).toEqual({
      ok: false,
      error: 'coverage summary is longer than 10000000 characters',
    });
  });
});
