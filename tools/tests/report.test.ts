import { describe, expect, it } from 'vitest';
import { classifyChanges } from '../src/classify.ts';
import { renderReport } from '../src/report.ts';

const openPr = { labels: [], draft: false, isFork: false };

describe('renderReport', () => {
  it('says every file was Skipped, and why, for a docs-only pull request', () => {
    const classification = classifyChanges(['README.md', 'docs/adr/0004-x.md'], openPr);

    expect(renderReport({ classification })).toBe(
      [
        '<!-- test-agent-report -->',
        '## Test Agent',
        '',
        '**Test Agent skipped: all 2 changed files were Skipped.**',
        '',
        '| File | Decision | Reason |',
        '| --- | --- | --- |',
        '| `README.md` | Skip | Documentation |',
        '| `docs/adr/0004-x.md` | Skip | Documentation |',
        '',
      ].join('\n'),
    );
  });

  it('lists candidates ahead of Skips and counts them in the verdict', () => {
    const classification = classifyChanges(
      ['README.md', 'backend/src/features/todos/router.ts', 'frontend/src/lib/http.ts'],
      openPr,
    );

    const report = renderReport({ classification });

    expect(report).toContain('**2 of 3 changed files are Test Agent candidates.**');
    expect(report).toContain(
      [
        '| `backend/src/features/todos/router.ts` | Candidate | Backend logic |',
        '| `frontend/src/lib/http.ts` | Candidate | Frontend logic |',
        '| `README.md` | Skip | Documentation |',
      ].join('\n'),
    );
  });

  it.each([
    [{ ...openPr, isFork: true }, '**Test Agent skipped: pull request is from a fork.**'],
    [{ ...openPr, labels: ['skip-test-agent'] }, '**Test Agent skipped: the `skip-test-agent` label is set.**'],
    [{ ...openPr, draft: true }, '**Test Agent skipped: pull request is a draft.**'],
  ])('gives an explicit agent-skipped verdict when stopped (%o)', (context, expected) => {
    const classification = classifyChanges(['backend/src/features/todos/router.ts'], context);

    const report = renderReport({ classification });

    expect(report).toContain(expected);
    expect(report).toContain('| `backend/src/features/todos/router.ts` | Candidate | Backend logic |');
  });

  it('says so when there are no changed files', () => {
    const report = renderReport({ classification: classifyChanges([], openPr) });

    expect(report).toContain('**Test Agent skipped: no changed files.**');
    expect(report).not.toContain('| File |');
  });

  it('renders hostile file names as inert text in a single table cell', () => {
    const path = 'frontend/src/<img src=x onerror=alert(1)>|`x`\n| injected | row |.ts';
    const classification = classifyChanges([path], openPr);

    const report = renderReport({ classification });

    expect(report).toContain(
      '| `` frontend/src/<img src=x onerror=alert(1)>\\|`x`�\\| injected \\| row \\|.ts `` | Skip | Not app source code |',
    );
    expect(report.split('\n').filter((line) => line.startsWith('|'))).toHaveLength(3);
  });
});
