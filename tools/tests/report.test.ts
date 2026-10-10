import { describe, expect, it } from 'vitest';
import { classifyChanges } from '../src/classify.ts';
import type { DecisionLog, FileLog } from '../src/decision-log.ts';
import type { MutationSummary, Survivor } from '../src/mutation.ts';
import { renderReport, type AgentResult, type ApplyResult, type MutationResults } from '../src/report.ts';

const openPr = { labels: [], draft: false, isFork: false };
const notRun: AgentResult = { status: 'not_run' };
const notApplied: ApplyResult = { status: 'not_run' };
const router = 'backend/src/features/todos/router.ts';
const health = 'backend/src/api/health.ts';
const runUrl = 'https://github.com/owner/repo/actions/runs/1';
const noMutation: MutationResults = { backend: { status: 'not_run' }, frontend: { status: 'not_run' } };

function succeeded(summary: string, files: FileLog[]): AgentResult {
  const log: DecisionLog = { summary, files };
  return { status: 'succeeded', log };
}

function entry(path: string, overrides: Partial<FileLog> = {}): FileLog {
  return {
    path,
    decision: 'tested',
    reason: 'New tests pass',
    behaviors: ['when GET /api/todos, 200 with every todo'],
    tests: ['backend/tests/todos.test.ts > lists every todo'],
    attempts: 1,
    ...overrides,
  };
}

function survivor(overrides: Partial<Survivor> = {}): Survivor {
  return {
    file: 'src/features/todos/router.ts',
    line: 12,
    column: 7,
    mutator: 'EqualityOperator',
    replacement: 'a <= b',
    status: 'Survived',
    ...overrides,
  };
}

function completed(summary: Partial<MutationSummary>): MutationResults['backend'] {
  return { status: 'completed', summary: { score: 75, detected: 3, survived: 1, noCoverage: 0, survivors: [survivor()], ...summary } };
}

function tableRows(report: string): string[] {
  return report.split('\n').filter((line) => line.startsWith('| ') && !line.startsWith('| File') && !line.startsWith('| ---'));
}

describe('renderReport', () => {
  it('says every file was Skipped, and why, for a docs-only pull request', () => {
    const classification = classifyChanges(['README.md', 'docs/adr/0004-x.md'], openPr);

    expect(renderReport({ classification, agent: notRun, apply: notApplied, mutation: noMutation, runUrl })).toBe(
      [
        '<!-- test-agent-report -->',
        '## Test Agent',
        '',
        '**Test Agent skipped: all 2 changed files were Skipped.**',
        '',
        '| File | Decision | Reason |',
        '| --- | --- | --- |',
        '| `README.md` | `skipped` | Documentation |',
        '| `docs/adr/0004-x.md` | `skipped` | Documentation |',
        '',
        '[Workflow run](https://github.com/owner/repo/actions/runs/1)',
        '',
      ].join('\n'),
    );
  });

  it('shows the Decision Log decision, Behaviors, and tests for a tested file', () => {
    const classification = classifyChanges(['README.md', router], openPr);
    const agent = succeeded('Added 1 test for the todos router.', [entry(router)]);

    const report = renderReport({ classification, agent, apply: notApplied, mutation: noMutation, runUrl });

    expect(report).toContain('**Test Agent wrote tests for 1 of 2 changed files.**');
    expect(report).toContain('Added 1 test for the todos router\\.');
    expect(tableRows(report)).toEqual([
      '| `backend/src/features/todos/router.ts` | `tested` | New tests pass |',
      '| `README.md` | `skipped` | Documentation |',
    ]);
    expect(report).toContain(
      [
        '<details>',
        '<summary>Behaviors and tests</summary>',
        '',
        '#### `backend/src/features/todos/router.ts`',
        '',
        'Decision: `tested`, attempts: 1',
        '',
        'Behaviors:',
        '',
        '- `when GET /api/todos, 200 with every todo`',
        '',
        'Tests:',
        '',
        '- `backend/tests/todos.test.ts > lists every todo`',
        '',
        '</details>',
      ].join('\n'),
    );
    expect(report).not.toContain('pending');
  });

  it('gives an all-Skipped verdict when the agent Skips every candidate', () => {
    const classification = classifyChanges(['README.md', router], openPr);
    const skip = entry(router, { decision: 'skipped', reason: 'Pure refactor', behaviors: [], tests: [], attempts: 0 });

    const report = renderReport({ classification, agent: succeeded('No Behavior changed.', [skip]), apply: notApplied, mutation: noMutation, runUrl });

    expect(report).toContain('**Test Agent skipped: all 2 changed files were Skipped.**');
    expect(tableRows(report)).toContain('| `backend/src/features/todos/router.ts` | `skipped` | Pure refactor |');
    expect(report).not.toContain('Behaviors and tests');
  });

  it('reports a Suspected Bug with its failing assertion', () => {
    const classification = classifyChanges([health, router], openPr);
    const bug = entry(health, {
      decision: 'suspected_bug',
      reason: 'GET /api/health returned 200 when the database query rejected. Assertion: expected 500, received 200.',
      attempts: 2,
    });

    const report = renderReport({ classification, agent: succeeded('1 Suspected Bug.', [bug, entry(router)]), apply: notApplied, mutation: noMutation, runUrl });

    expect(report).toContain('**Test Agent wrote tests for 1 of 2 changed files and found 1 Suspected Bug.**');
    expect(tableRows(report)[0]).toMatch(/^\| `backend\/src\/api\/health\.ts` \| `suspected_bug` \| /);
    expect(report).toContain(
      [
        '### Suspected Bugs',
        '',
        '- `backend/src/api/health.ts`: GET /api/health returned 200 when the database query rejected\\. Assertion\\: expected 500, received 200\\.',
      ].join('\n'),
    );
  });

  it('gives a failure verdict and marks candidates not run when the agent failed', () => {
    const classification = classifyChanges(['README.md', router], openPr);

    const report = renderReport({ classification, agent: { status: 'failed', reason: 'the agent job failed' }, apply: notApplied, mutation: noMutation, runUrl });

    expect(report).toContain('**Test Agent failed: the agent job failed.**');
    expect(tableRows(report)).toContain('| `backend/src/features/todos/router.ts` | `not_run` | Backend logic |');
  });

  it('names the commit that carries the tests', () => {
    const classification = classifyChanges([router], openPr);
    const apply: ApplyResult = { status: 'committed', sha: '0123456789abcdef0123456789abcdef01234567' };

    const report = renderReport({ classification, agent: succeeded('Tested the router.', [entry(router)]), apply, mutation: noMutation, runUrl });

    expect(report).toContain('Committed the tests to this branch in 0123456789abcdef0123456789abcdef01234567.');
  });

  it('says there was nothing to commit for an empty patch', () => {
    const classification = classifyChanges([router], openPr);
    const skip = entry(router, { decision: 'skipped', reason: 'Pure refactor', behaviors: [], tests: [], attempts: 0 });

    const report = renderReport({ classification, agent: succeeded('No Behavior changed.', [skip]), apply: { status: 'no_changes' }, mutation: noMutation, runUrl });

    expect(report).toContain('No test changes to commit.');
  });

  it('lists the offending paths of a rejected patch as inert text', () => {
    const classification = classifyChanges([router], openPr);
    const apply: ApplyResult = {
      status: 'rejected',
      rejected: [
        { path: 'backend/src/app.ts', reason: 'not a test path' },
        { path: '<img src=x onerror=alert(1)>', reason: 'not a git diff line' },
      ],
    };

    const report = renderReport({ classification, agent: succeeded('Tested the router.', [entry(router)]), apply, mutation: noMutation, runUrl });

    expect(report).toContain(
      [
        '### Patch rejected',
        '',
        'Nothing was pushed: the patch changes what the Test Agent may not write.',
        '',
        '- `backend/src/app.ts`: not a test path',
        '- `<img src=x onerror=alert(1)>`: not a git diff line',
      ].join('\n'),
    );
  });

  it('says nothing was pushed when committing the tests failed', () => {
    const classification = classifyChanges([router], openPr);

    const report = renderReport({ classification, agent: succeeded('Tested the router.', [entry(router)]), apply: { status: 'failed' }, mutation: noMutation, runUrl });

    expect(report).toContain('Committing the tests failed; nothing was pushed.');
  });

  it('stays within the GitHub comment limit for a huge rejected patch', () => {
    const classification = classifyChanges([router], openPr);
    const rejected = Array.from({ length: 5_000 }, (_, index) => ({ path: `backend/src/${'x'.repeat(100)}${index}.ts`, reason: 'not a test path' }));

    const report = renderReport({ classification, agent: succeeded('Tested the router.', [entry(router)]), apply: { status: 'rejected', rejected }, mutation: noMutation, runUrl });

    expect(report.length).toBeLessThanOrEqual(65_536);
    expect(report).toMatch(/_\d+ more rejected paths not shown\._/);
  });

  it('marks a candidate missing from the Decision Log as not run', () => {
    const classification = classifyChanges([health, router], openPr);

    const report = renderReport({ classification, agent: succeeded('Tested the router.', [entry(router)]), apply: notApplied, mutation: noMutation, runUrl });

    expect(tableRows(report)).toContain('| `backend/src/api/health.ts` | `not_run` | Missing from the Decision Log |');
  });

  it('keeps the classification for files it Skipped and ignores Decision Log entries for unchanged files', () => {
    const classification = classifyChanges(['README.md', router], openPr);
    const agent = succeeded('Tested.', [
      entry('README.md', { reason: 'Overridden' }),
      entry('backend/src/not-in-this-pr.ts'),
      entry(router),
    ]);

    const report = renderReport({ classification, agent, apply: notApplied, mutation: noMutation, runUrl });

    expect(tableRows(report)).toEqual([
      '| `backend/src/features/todos/router.ts` | `tested` | New tests pass |',
      '| `README.md` | `skipped` | Documentation |',
    ]);
    expect(report).not.toContain('not-in-this-pr');
  });

  it.each([
    [{ ...openPr, isFork: true }, '**Test Agent skipped: pull request is from a fork.**'],
    [{ ...openPr, labels: ['skip-test-agent'] }, '**Test Agent skipped: the `skip-test-agent` label is set.**'],
    [{ ...openPr, draft: true }, '**Test Agent skipped: pull request is a draft.**'],
  ])('gives an explicit agent-skipped verdict when stopped (%o)', (context, expected) => {
    const classification = classifyChanges([router], context);

    const report = renderReport({ classification, agent: notRun, apply: notApplied, mutation: noMutation, runUrl });

    expect(report).toContain(expected);
    expect(report).toContain('| `backend/src/features/todos/router.ts` | `not_run` | Backend logic |');
  });

  it('says so when there are no changed files', () => {
    const report = renderReport({ classification: classifyChanges([], openPr), agent: notRun, apply: notApplied, mutation: noMutation, runUrl });

    expect(report).toContain('**Test Agent skipped: no changed files.**');
    expect(report).not.toContain('| File |');
  });

  it('renders Behaviors with markup as inert code', () => {
    const classification = classifyChanges([router], openPr);
    const agent = succeeded('Tested.', [entry(router, { behaviors: ['resolves Promise<void> for <img src=x>'] })]);

    const report = renderReport({ classification, agent, apply: notApplied, mutation: noMutation, runUrl });

    expect(report).toContain('- `resolves Promise<void> for <img src=x>`');
  });

  it('renders hostile file names as inert text in a single table cell', () => {
    const path = 'frontend/src/<img src=x onerror=alert(1)>|`x`\n| injected | row |.ts';
    const classification = classifyChanges([path], openPr);

    const report = renderReport({ classification, agent: notRun, apply: notApplied, mutation: noMutation, runUrl });

    expect(report).toContain(
      '| `` frontend/src/<img src=x onerror=alert(1)>\\|`x`�\\| injected \\| row \\|.ts `` | `skipped` | Not app source code |',
    );
    expect(tableRows(report)).toHaveLength(1);
  });

  it('renders markdown in agent text literally', () => {
    const classification = classifyChanges([router], openPr);
    const agent = succeeded('**all** good', [entry(router, { reason: 'returns `x` | *y* & _z_ # 1. a@b.c' })]);

    const report = renderReport({ classification, agent, apply: notApplied, mutation: noMutation, runUrl });

    expect(report).toContain('\\*\\*all\\*\\* good');
    expect(tableRows(report)).toEqual([
      '| `backend/src/features/todos/router.ts` | `tested` | returns \\`x\\` \\| \\*y\\* \\& \\_z\\_ \\# 1\\. a\\@b\\.c |',
    ]);
  });

  it('collapses a long decisions table', () => {
    const files = Array.from({ length: 21 }, (_, i) => `docs/page-${i}.md`);

    const report = renderReport({ classification: classifyChanges(files, openPr), agent: notRun, apply: notApplied, mutation: noMutation, runUrl });

    expect(report).toContain('<details>\n<summary>Decisions for 21 changed files</summary>\n\n| File | Decision | Reason |');
    expect(tableRows(report)).toHaveLength(21);
  });

  it('stays within the GitHub comment limit for a huge pull request', () => {
    const files = Array.from({ length: 5000 }, (_, i) => `docs/${'deep/'.repeat(50)}page-${i}.md`);

    const report = renderReport({ classification: classifyChanges(files, openPr), agent: notRun, apply: notApplied, mutation: noMutation, runUrl });

    expect(report.length).toBeLessThanOrEqual(65_536);
    expect(report).toMatch(/_\d+ more changed files not shown\._/);
    expect(report).toContain('</details>\n\n[Workflow run](https://github.com/owner/repo/actions/runs/1)\n');
  });

  it('stays within the GitHub comment limit for the largest valid Decision Log', () => {
    const paths = Array.from({ length: 100 }, (_, i) => `backend/src/${'x'.repeat(280)}${i}.ts`);
    const long = (n: number) => '*'.repeat(n);
    const files = paths.map((path) =>
      entry(path, {
        decision: 'suspected_bug',
        reason: long(600),
        behaviors: Array.from({ length: 10 }, () => long(200)),
        tests: Array.from({ length: 20 }, () => long(200)),
        attempts: 3,
      }),
    );

    const report = renderReport({ classification: classifyChanges(paths, openPr), agent: succeeded(long(300), files), apply: notApplied, mutation: noMutation, runUrl });

    expect(report.length).toBeLessThanOrEqual(65_536);
    expect(report).toContain('### Suspected Bugs');
    expect(report).toMatch(/not shown; see the Decision Log artifact\._/);
  });

  describe('mutation testing', () => {
    const classification = classifyChanges([router], openPr);
    const agent = succeeded('Tested the router.', [entry(router)]);

    it('shows the score of each package that ran and lists its surviving mutants in a collapsed section', () => {
      const mutation: MutationResults = { backend: completed({}), frontend: { status: 'not_run' } };

      const report = renderReport({ classification, agent, apply: notApplied, mutation, runUrl });

      expect(report).toContain(
        [
          '### Mutation testing',
          '',
          'Mutation score of the changed source files. A warning, not a gate: it does not change `test-agent/verify`.',
          '',
          '| Package | Mutation score | Detected | Survived | No coverage |',
          '| --- | --- | --- | --- | --- |',
          '| backend | 75.00% | 3 | 1 | 0 |',
          '',
          '<details>',
          '<summary>1 surviving mutant</summary>',
          '',
          '- `backend/src/features/todos/router.ts:12:7` EqualityOperator: `a <= b`',
          '',
          '</details>',
          '',
        ].join('\n'),
      );
    });

    it('marks mutants no test covers, and lists every package in order', () => {
      const mutation: MutationResults = {
        backend: completed({ survivors: [survivor({ status: 'NoCoverage', mutator: 'BlockStatement', replacement: '{}' })] }),
        frontend: completed({ score: 50, detected: 1, survived: 0, noCoverage: 0, survivors: [survivor({ file: 'src/App.tsx', line: 3, column: 1, replacement: null })] }),
      };

      const report = renderReport({ classification, agent, apply: notApplied, mutation, runUrl });

      expect(tableRows(report)).toContain('| frontend | 50.00% | 1 | 0 | 0 |');
      expect(report).toContain('<summary>2 surviving mutants</summary>');
      expect(report).toContain(
        [
          '- `backend/src/features/todos/router.ts:12:7` BlockStatement: `{}` (no test covers it)',
          '- `frontend/src/App.tsx:3:1` EqualityOperator',
        ].join('\n'),
      );
    });

    it('says when there was no mutant to score', () => {
      const mutation: MutationResults = { backend: completed({ score: null, detected: 0, survived: 0, survivors: [] }), frontend: { status: 'not_run' } };

      const report = renderReport({ classification, agent, apply: notApplied, mutation, runUrl });

      expect(tableRows(report)).toContain('| backend | n/a | 0 | 0 | 0 |');
      expect(report).not.toContain('surviving mutant');
    });

    it('says which package failed mutation testing and why', () => {
      const mutation: MutationResults = { backend: completed({}), frontend: { status: 'failed', reason: 'Stryker failed or timed out' } };

      const report = renderReport({ classification, agent, apply: notApplied, mutation, runUrl });

      expect(report).toContain('| backend | 75.00% | 3 | 1 | 0 |\n\n_frontend: mutation testing failed: Stryker failed or timed out._\n');
    });

    it('tells a package with nothing to mutate from one whose test suite failed', () => {
      const mutation: MutationResults = { backend: { status: 'no_files' }, frontend: { status: 'suite_failed' } };

      const report = renderReport({ classification, agent, apply: notApplied, mutation, runUrl });

      expect(report).toContain(
        [
          '### Mutation testing',
          '',
          'Mutation score of the changed source files. A warning, not a gate: it does not change `test-agent/verify`.',
          '',
          '_backend: no changed source files to mutate._',
          '',
          '_frontend: not mutated because its test suite failed._',
          '',
        ].join('\n'),
      );
      expect(report).not.toContain('| Package |');
    });

    it('leaves the section out when mutation testing did not run', () => {
      const report = renderReport({ classification, agent, apply: notApplied, mutation: noMutation, runUrl });

      expect(report).not.toContain('Mutation testing');
    });

    it('renders mutated code from the pull request inert, on one line, and shortened', () => {
      const replacement = '`<img src=x>`\n  @owner [link](https://x)' + 'y'.repeat(100);
      const mutation: MutationResults = { backend: completed({ survivors: [survivor({ replacement })] }), frontend: { status: 'not_run' } };

      const report = renderReport({ classification, agent, apply: notApplied, mutation, runUrl });

      const line = report.split('\n').find((text) => text.startsWith('- `backend/'));
      expect(line).toBe(`- \`backend/src/features/todos/router.ts:12:7\` EqualityOperator: \`\` \`<img src=x>\` @owner [link](https://x)${'y'.repeat(22)}… \`\``);
    });

    it('keeps a long list of surviving mutants within the comment limit', () => {
      const survivors = Array.from({ length: 5_000 }, (_, i) => survivor({ file: `src/${'x'.repeat(200)}.ts`, line: i + 1 }));
      const mutation: MutationResults = { backend: completed({ survived: 5_000, survivors }), frontend: { status: 'not_run' } };

      const report = renderReport({ classification, agent, apply: notApplied, mutation, runUrl });

      expect(report.length).toBeLessThanOrEqual(65_536);
      expect(report).toMatch(/_\d+ more surviving mutants not shown; see the mutation report artifact\._/);
      expect(report).toContain('[Workflow run]');
    });
  });
});
