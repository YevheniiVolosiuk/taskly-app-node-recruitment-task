import { describe, expect, it } from 'vitest';
import { classifyChanges } from '../src/classify.ts';
import type { DecisionLog, FileLog } from '../src/decision-log.ts';
import type { MutationSummary, Survivor } from '../src/mutation.ts';
import {
  renderReport,
  type AgentResult,
  type ApplyResult,
  type CoverageDelta,
  type MutationResults,
  type VerificationResult,
} from '../src/report.ts';

const openPr = { labels: [], draft: false, isFork: false };
const notRun: AgentResult = { status: 'not_run' };
const notApplied: ApplyResult = { status: 'not_run' };
const router = 'backend/src/features/todos/router.ts';
const health = 'backend/src/api/health.ts';
const runUrl = 'https://github.com/owner/repo/actions/runs/1';
const noMutation: MutationResults = { backend: { status: 'not_run' }, frontend: { status: 'not_run' } };
const noCoverage: CoverageDelta = { base: null, final: null };
const notVerified: VerificationResult = { status: 'not_run' };
const noMissingCitations: ReadonlySet<string> = new Set();
const headSha = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
const allPassed = { backend: 'passed', frontend: 'passed', tools: 'passed', 'smoke-api': 'passed', 'smoke-build': 'passed' } as const;

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

function citationNote(skips: number): string {
  return `⚠️ Citation not found for ${skips} Skip${skips === 1 ? '' : 's'}: the cited test file or title is not in the verified commit, or the test is skipped. A warning, not a gate: it does not change \`test-agent/verify\`.`;
}

function tableRows(report: string): string[] {
  return report.split('\n').filter((line) => line.startsWith('| ') && !line.startsWith('| File') && !line.startsWith('| ---'));
}

describe('renderReport', () => {
  it('says every file was Skipped, and why, for a docs-only pull request', () => {
    const classification = classifyChanges(['README.md', 'docs/adr/0004-x.md'], openPr);

    expect(renderReport({ classification, agent: notRun, apply: notApplied, mutation: noMutation, coverage: noCoverage, verification: notVerified, missingCitations: noMissingCitations, runUrl })).toBe(
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
        '### Evidence',
        '',
        '#### Verification',
        '',
        'The Verification Job did not run, so nothing was verified and `test-agent/verify` was not posted.',
        '',
        '[Workflow run](https://github.com/owner/repo/actions/runs/1)',
        '',
      ].join('\n'),
    );
  });

  it('shows the Decision Log decision, Behaviors, and tests for a tested file', () => {
    const classification = classifyChanges(['README.md', router], openPr);
    const agent = succeeded('Added 1 test for the todos router.', [entry(router)]);

    const report = renderReport({ classification, agent, apply: notApplied, mutation: noMutation, coverage: noCoverage, verification: notVerified, missingCitations: noMissingCitations, runUrl });

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

    const report = renderReport({ classification, agent: succeeded('No Behavior changed.', [skip]), apply: notApplied, mutation: noMutation, coverage: noCoverage, verification: notVerified, missingCitations: noMissingCitations, runUrl });

    expect(report).toContain('**Test Agent skipped: all 2 changed files were Skipped.**');
    expect(tableRows(report)).toContain('| `backend/src/features/todos/router.ts` | `skipped` | Pure refactor |');
    expect(report).not.toContain('Behaviors and tests');
  });

  describe('an already covered Skip', () => {
    const classification = classifyChanges([health, router], openPr);
    const reason = 'already covered: backend/tests/todos.test.ts > lists every todo';
    const agent = succeeded('Both files are covered.', [
      entry(health, { decision: 'skipped', reason: 'no behavior change: renamed a variable', behaviors: [], tests: [], attempts: 0 }),
      entry(router, { decision: 'skipped', reason, behaviors: [], tests: [], attempts: 0 }),
    ]);
    const render = (missingCitations: ReadonlySet<string>) =>
      renderReport({ classification, agent, apply: notApplied, mutation: noMutation, coverage: noCoverage, verification: notVerified, missingCitations, runUrl });

    it('renders without a warning when its citation is found', () => {
      const report = render(noMissingCitations);

      expect(tableRows(report)).toContain(
        '| `backend/src/features/todos/router.ts` | `skipped` | already covered\\: backend/tests/todos\\.test\\.ts \\> lists every todo |',
      );
      expect(report).not.toContain('Citation not found');
    });

    it('warns next to the Skip, and only that Skip, when its citation is not found', () => {
      const report = render(new Set([router]));

      expect(tableRows(report)).toEqual([
        '| `backend/src/features/todos/router.ts` | `skipped` | ⚠️ **Citation not found.** already covered\\: backend/tests/todos\\.test\\.ts \\> lists every todo |',
        '| `backend/src/api/health.ts` | `skipped` | no behavior change\\: renamed a variable |',
      ]);
      expect(report).toContain(`_${citationNote(1)}_`);
    });

    it('keeps the warned Skip and its note when the table runs out of room', () => {
      const docs = Array.from({ length: 5000 }, (_, i) => `docs/${'deep/'.repeat(50)}page-${i}.md`);
      const report = renderReport({
        classification: classifyChanges([...docs, router], openPr),
        agent: succeeded('Covered.', [entry(router, { decision: 'skipped', reason, behaviors: [], tests: [], attempts: 0 })]),
        apply: notApplied,
        mutation: noMutation,
        coverage: noCoverage,
        verification: notVerified,
        missingCitations: new Set([router]),
        runUrl,
      });

      expect(report).toMatch(/_\d+ more changed files not shown\._/);
      expect(tableRows(report)[0]).toContain('⚠️ **Citation not found.**');
      expect(report).toContain(`</details>\n\n_${citationNote(1)}_\n`);
    });
  });

  it('reports a Suspected Bug with its failing assertion', () => {
    const classification = classifyChanges([health, router], openPr);
    const bug = entry(health, {
      decision: 'suspected_bug',
      reason: 'GET /api/health returned 200 when the database query rejected. Assertion: expected 500, received 200.',
      attempts: 2,
    });

    const report = renderReport({ classification, agent: succeeded('1 Suspected Bug.', [bug, entry(router)]), apply: notApplied, mutation: noMutation, coverage: noCoverage, verification: notVerified, missingCitations: noMissingCitations, runUrl });

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

    const report = renderReport({ classification, agent: { status: 'failed', reason: 'the agent job failed' }, apply: notApplied, mutation: noMutation, coverage: noCoverage, verification: notVerified, missingCitations: noMissingCitations, runUrl });

    expect(report).toContain('**Test Agent failed: the agent job failed.**');
    expect(tableRows(report)).toContain('| `backend/src/features/todos/router.ts` | `not_run` | Backend logic |');
    expect(report).toContain(`[Workflow run](${runUrl})`);
  });

  it('gives a failure verdict with a run link when the changed files could not be classified', () => {
    const report = renderReport({ classification: null, agent: notRun, apply: notApplied, mutation: noMutation, coverage: noCoverage, verification: notVerified, missingCitations: noMissingCitations, runUrl });

    expect(report).toBe(
      [
        '<!-- test-agent-report -->',
        '## Test Agent',
        '',
        '**Test Agent failed: the changed files could not be classified.**',
        '',
        '### Evidence',
        '',
        '#### Verification',
        '',
        'The Verification Job did not run, so nothing was verified and `test-agent/verify` was not posted.',
        '',
        `[Workflow run](${runUrl})`,
        '',
      ].join('\n'),
    );
  });

  it('names the commit that carries the tests', () => {
    const classification = classifyChanges([router], openPr);
    const apply: ApplyResult = { status: 'committed', sha: '0123456789abcdef0123456789abcdef01234567' };

    const report = renderReport({ classification, agent: succeeded('Tested the router.', [entry(router)]), apply, mutation: noMutation, coverage: noCoverage, verification: notVerified, missingCitations: noMissingCitations, runUrl });

    expect(report).toContain('Committed the tests to this branch in 0123456789abcdef0123456789abcdef01234567.');
  });

  it('says there was nothing to commit for an empty patch', () => {
    const classification = classifyChanges([router], openPr);
    const skip = entry(router, { decision: 'skipped', reason: 'Pure refactor', behaviors: [], tests: [], attempts: 0 });

    const report = renderReport({ classification, agent: succeeded('No Behavior changed.', [skip]), apply: { status: 'no_changes' }, mutation: noMutation, coverage: noCoverage, verification: notVerified, missingCitations: noMissingCitations, runUrl });

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

    const report = renderReport({ classification, agent: succeeded('Tested the router.', [entry(router)]), apply, mutation: noMutation, coverage: noCoverage, verification: notVerified, missingCitations: noMissingCitations, runUrl });

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

    const report = renderReport({ classification, agent: succeeded('Tested the router.', [entry(router)]), apply: { status: 'failed' }, mutation: noMutation, coverage: noCoverage, verification: notVerified, missingCitations: noMissingCitations, runUrl });

    expect(report).toContain('Committing the tests failed; nothing was pushed.');
  });

  it('stays within the GitHub comment limit for a huge rejected patch', () => {
    const classification = classifyChanges([router], openPr);
    const rejected = Array.from({ length: 5_000 }, (_, index) => ({ path: `backend/src/${'x'.repeat(100)}${index}.ts`, reason: 'not a test path' }));

    const report = renderReport({ classification, agent: succeeded('Tested the router.', [entry(router)]), apply: { status: 'rejected', rejected }, mutation: noMutation, coverage: noCoverage, verification: notVerified, missingCitations: noMissingCitations, runUrl });

    expect(report.length).toBeLessThanOrEqual(65_536);
    expect(report).toMatch(/_\d+ more rejected paths not shown\._/);
  });

  it('marks a candidate missing from the Decision Log as not run', () => {
    const classification = classifyChanges([health, router], openPr);

    const report = renderReport({ classification, agent: succeeded('Tested the router.', [entry(router)]), apply: notApplied, mutation: noMutation, coverage: noCoverage, verification: notVerified, missingCitations: noMissingCitations, runUrl });

    expect(tableRows(report)).toContain('| `backend/src/api/health.ts` | `not_run` | Missing from the Decision Log |');
  });

  it('keeps the classification for files it Skipped and ignores Decision Log entries for unchanged files', () => {
    const classification = classifyChanges(['README.md', router], openPr);
    const agent = succeeded('Tested.', [
      entry('README.md', { reason: 'Overridden' }),
      entry('backend/src/not-in-this-pr.ts'),
      entry(router),
    ]);

    const report = renderReport({ classification, agent, apply: notApplied, mutation: noMutation, coverage: noCoverage, verification: notVerified, missingCitations: noMissingCitations, runUrl });

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

    const report = renderReport({ classification, agent: notRun, apply: notApplied, mutation: noMutation, coverage: noCoverage, verification: notVerified, missingCitations: noMissingCitations, runUrl });

    expect(report).toContain(expected);
    expect(report).toContain('| `backend/src/features/todos/router.ts` | `not_run` | Backend logic |');
  });

  it('says so when there are no changed files', () => {
    const report = renderReport({ classification: classifyChanges([], openPr), agent: notRun, apply: notApplied, mutation: noMutation, coverage: noCoverage, verification: notVerified, missingCitations: noMissingCitations, runUrl });

    expect(report).toContain('**Test Agent skipped: no changed files.**');
    expect(report).not.toContain('| File |');
  });

  it('renders Behaviors with markup as inert code', () => {
    const classification = classifyChanges([router], openPr);
    const agent = succeeded('Tested.', [entry(router, { behaviors: ['resolves Promise<void> for <img src=x>'] })]);

    const report = renderReport({ classification, agent, apply: notApplied, mutation: noMutation, coverage: noCoverage, verification: notVerified, missingCitations: noMissingCitations, runUrl });

    expect(report).toContain('- `resolves Promise<void> for <img src=x>`');
  });

  it('renders hostile file names as inert text in a single table cell', () => {
    const path = 'frontend/src/<img src=x onerror=alert(1)>|`x`\n| injected | row |.ts';
    const classification = classifyChanges([path], openPr);

    const report = renderReport({ classification, agent: notRun, apply: notApplied, mutation: noMutation, coverage: noCoverage, verification: notVerified, missingCitations: noMissingCitations, runUrl });

    expect(report).toContain(
      '| `` frontend/src/<img src=x onerror=alert(1)>\\|`x`�\\| injected \\| row \\|.ts `` | `skipped` | Not app source code |',
    );
    expect(tableRows(report)).toHaveLength(1);
  });

  it('renders markdown in agent text literally', () => {
    const classification = classifyChanges([router], openPr);
    const agent = succeeded('**all** good', [entry(router, { reason: 'returns `x` | *y* & _z_ # 1. a@b.c' })]);

    const report = renderReport({ classification, agent, apply: notApplied, mutation: noMutation, coverage: noCoverage, verification: notVerified, missingCitations: noMissingCitations, runUrl });

    expect(report).toContain('\\*\\*all\\*\\* good');
    expect(tableRows(report)).toEqual([
      '| `backend/src/features/todos/router.ts` | `tested` | returns \\`x\\` \\| \\*y\\* \\& \\_z\\_ \\# 1\\. a\\@b\\.c |',
    ]);
  });

  it('collapses a long decisions table', () => {
    const files = Array.from({ length: 21 }, (_, i) => `docs/page-${i}.md`);

    const report = renderReport({ classification: classifyChanges(files, openPr), agent: notRun, apply: notApplied, mutation: noMutation, coverage: noCoverage, verification: notVerified, missingCitations: noMissingCitations, runUrl });

    expect(report).toContain('<details>\n<summary>Decisions for 21 changed files</summary>\n\n| File | Decision | Reason |');
    expect(tableRows(report)).toHaveLength(21);
  });

  it('stays within the GitHub comment limit for a huge pull request', () => {
    const files = Array.from({ length: 5000 }, (_, i) => `docs/${'deep/'.repeat(50)}page-${i}.md`);

    const report = renderReport({ classification: classifyChanges(files, openPr), agent: notRun, apply: notApplied, mutation: noMutation, coverage: noCoverage, verification: notVerified, missingCitations: noMissingCitations, runUrl });

    expect(report.length).toBeLessThanOrEqual(65_536);
    expect(report).toMatch(/_\d+ more changed files not shown\._/);
    expect(report).toContain('</details>\n\n### Evidence\n\n#### Verification\n');
    expect(report).toContain(`[Workflow run](${runUrl})\n`);
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

    const report = renderReport({ classification: classifyChanges(paths, openPr), agent: succeeded(long(300), files), apply: notApplied, mutation: noMutation, coverage: noCoverage, verification: notVerified, missingCitations: noMissingCitations, runUrl });

    expect(report.length).toBeLessThanOrEqual(65_536);
    expect(report).toContain('### Suspected Bugs');
    expect(report).toMatch(/not shown; see the Decision Log artifact\._/);
  });

  describe('coverage', () => {
    const classification = classifyChanges([router, health, 'README.md'], openPr);
    const agent = succeeded('Tested the router.', [entry(router), entry(health)]);

    it('shows line and branch coverage of each changed source file before and after', () => {
      const coverage: CoverageDelta = {
        base: { [router]: { lines: 40, branches: 25 }, 'README.md': { lines: 0, branches: null } },
        final: { [router]: { lines: 85, branches: 12.5 }, [health]: { lines: 100, branches: null }, 'README.md': { lines: 0, branches: null } },
      };

      const report = renderReport({ classification, agent, apply: notApplied, mutation: noMutation, coverage, verification: notVerified, missingCitations: noMissingCitations, runUrl });

      expect(report).toContain(
        [
          '#### Coverage',
          '',
          'Line and branch coverage of the changed source files before this pull request and at the verified commit.',
          '',
          '| File | Lines | Branches |',
          '| --- | --- | --- |',
          '| `backend/src/features/todos/router.ts` | 40.0% → 85.0% (+45.0) | 25.0% → 12.5% (-12.5) |',
          '| `backend/src/api/health.ts` | new → 100.0% | new → n/a |',
          '',
        ].join('\n'),
      );
    });

    it('leaves out changed files that neither run covered', () => {
      const coverage: CoverageDelta = { base: {}, final: { [router]: { lines: 50, branches: 50 } } };

      const report = renderReport({ classification, agent, apply: notApplied, mutation: noMutation, coverage, verification: notVerified, missingCitations: noMissingCitations, runUrl });

      expect(report).toContain('| `backend/src/features/todos/router.ts` | new → 50.0% | new → 50.0% |');
      expect(report).not.toContain('| `backend/src/api/health.ts` | new');
    });

    it('says which run has no coverage', () => {
      const coverage: CoverageDelta = { base: null, final: { [router]: { lines: 50, branches: 50 } } };

      const report = renderReport({ classification, agent, apply: notApplied, mutation: noMutation, coverage, verification: notVerified, missingCitations: noMissingCitations, runUrl });

      expect(report).toContain(
        ['| `backend/src/features/todos/router.ts` | ? → 50.0% | ? → 50.0% |', '', '_Coverage before this pull request is unavailable._', ''].join('\n'),
      );
    });

    it('puts mutation testing under Evidence too', () => {
      const mutation: MutationResults = { backend: completed({}), frontend: { status: 'not_run' } };
      const coverage: CoverageDelta = { base: { [router]: { lines: 50, branches: 50 } }, final: null };

      const report = renderReport({ classification, agent, apply: notApplied, mutation, coverage, verification: notVerified, missingCitations: noMissingCitations, runUrl });

      expect(report).toContain('_Coverage at the verified commit is unavailable._\n\n#### Mutation testing\n');
      expect(report.match(/### Evidence/g)).toHaveLength(1);
    });
  });

  describe('verification', () => {
    const classification = classifyChanges([router], openPr);
    const agent = succeeded('Tested the router.', [entry(router)]);
    const committed: ApplyResult = { status: 'committed', sha: headSha };

    it('lists every check as passed and the success status of the test commit, first in Evidence', () => {
      const verification: VerificationResult = { status: 'finished', sha: headSha, state: 'success', posted: true, checks: allPassed };
      const coverage: CoverageDelta = { base: { [router]: { lines: 50, branches: 50 } }, final: { [router]: { lines: 80, branches: 50 } } };

      const report = renderReport({ classification, agent, apply: committed, mutation: noMutation, coverage, verification, missingCitations: noMissingCitations, runUrl });

      expect(report).toContain(
        [
          '### Evidence',
          '',
          '#### Verification',
          '',
          `\`test-agent/verify\`: \`success\` on ${headSha} (the Test Agent's test commit).`,
          '',
          '| Check | Outcome |',
          '| --- | --- |',
          '| Backend tests with coverage | passed |',
          '| Frontend tests with coverage | passed |',
          '| Tools tests | passed |',
          '| Smoke check backend | passed |',
          '| Smoke check frontend type-check and build | passed |',
          '',
          '#### Coverage',
        ].join('\n'),
      );
    });

    it('names a failed check and reports failure for the pull request head', () => {
      const verification: VerificationResult = {
        status: 'finished',
        sha: headSha,
        state: 'failure',
        posted: true,
        checks: { ...allPassed, frontend: 'failed' },
      };

      const report = renderReport({ classification, agent, apply: { status: 'no_changes' }, mutation: noMutation, coverage: noCoverage, verification, missingCitations: noMissingCitations, runUrl });

      expect(report).toContain(`\`test-agent/verify\`: \`failure\` on ${headSha} (the pull request head).`);
      expect(report).toContain('| Frontend tests with coverage | failed |');
      expect(report).toContain('_Failed: Frontend tests with coverage. Open that step in the Verification Job log._');
    });

    it('shows a check that did not run as such', () => {
      const verification: VerificationResult = {
        status: 'finished',
        sha: headSha,
        state: 'failure',
        posted: true,
        checks: { ...allPassed, backend: 'failed', 'smoke-api': 'not_run' },
      };

      const report = renderReport({ classification, agent, apply: committed, mutation: noMutation, coverage: noCoverage, verification, missingCitations: noMissingCitations, runUrl });

      expect(report).toContain('`test-agent/verify`: `failure`');
      expect(report).toContain('| Smoke check backend | did not run |');
      expect(report).toContain('_Failed: Backend tests with coverage. Open that step in the Verification Job log._');
    });

    it('gives the result without claiming a test-agent/verify status when none was posted', () => {
      const verification: VerificationResult = { status: 'finished', sha: headSha, state: 'success', posted: false, checks: allPassed };

      const report = renderReport({ classification, agent, apply: committed, mutation: noMutation, coverage: noCoverage, verification, missingCitations: noMissingCitations, runUrl });

      expect(report).toContain(
        `Verification result: \`success\` on ${headSha} (the Test Agent's test commit). \`test-agent/verify\` was not posted: a fork or Dependabot pull request gets a read-only token.`,
      );
      expect(report).not.toContain('`test-agent/verify`: `success`');
    });

    it('says nothing was verified when the Verification Job did not run', () => {
      const report = renderReport({ classification, agent, apply: committed, mutation: noMutation, coverage: noCoverage, verification: notVerified, missingCitations: noMissingCitations, runUrl });

      expect(report).toContain('#### Verification\n\nThe Verification Job did not run, so nothing was verified and `test-agent/verify` was not posted.\n');
      expect(report).not.toContain('| Check |');
    });

    it('shows no check as passed when the Verification Job was cancelled', () => {
      const report = renderReport({ classification, agent, apply: committed, mutation: noMutation, coverage: noCoverage, verification: { status: 'cancelled', posted: true }, missingCitations: noMissingCitations, runUrl });

      expect(report).toContain(
        '#### Verification\n\nThe Verification Job was cancelled or timed out, so `test-agent/verify` is `error`. Its checks did not finish, so none is shown.\n',
      );
      expect(report).not.toContain('| Check |');
      expect(report).not.toContain('passed');
    });

    it('does not claim an error status when the cancelled Verification Job posted none', () => {
      const report = renderReport({ classification, agent, apply: committed, mutation: noMutation, coverage: noCoverage, verification: { status: 'cancelled', posted: false }, missingCitations: noMissingCitations, runUrl });

      expect(report).toContain(
        '#### Verification\n\nThe Verification Job was cancelled or timed out, and `test-agent/verify` was not posted. Its checks did not finish, so none is shown.\n',
      );
      expect(report).not.toContain('`error`');
    });
  });

  describe('mutation testing', () => {
    const classification = classifyChanges([router], openPr);
    const agent = succeeded('Tested the router.', [entry(router)]);

    it('shows the score of each package that ran and lists its surviving mutants in a collapsed section', () => {
      const mutation: MutationResults = { backend: completed({}), frontend: { status: 'not_run' } };

      const report = renderReport({ classification, agent, apply: notApplied, mutation, coverage: noCoverage, verification: notVerified, missingCitations: noMissingCitations, runUrl });

      expect(report).toContain(
        [
          '#### Mutation testing',
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

      const report = renderReport({ classification, agent, apply: notApplied, mutation, coverage: noCoverage, verification: notVerified, missingCitations: noMissingCitations, runUrl });

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

      const report = renderReport({ classification, agent, apply: notApplied, mutation, coverage: noCoverage, verification: notVerified, missingCitations: noMissingCitations, runUrl });

      expect(tableRows(report)).toContain('| backend | n/a | 0 | 0 | 0 |');
      expect(report).not.toContain('surviving mutant');
    });

    it('says which package failed mutation testing and why', () => {
      const mutation: MutationResults = { backend: completed({}), frontend: { status: 'failed', reason: 'Stryker failed or timed out' } };

      const report = renderReport({ classification, agent, apply: notApplied, mutation, coverage: noCoverage, verification: notVerified, missingCitations: noMissingCitations, runUrl });

      expect(report).toContain('| backend | 75.00% | 3 | 1 | 0 |\n\n_frontend: mutation testing failed: Stryker failed or timed out._\n');
    });

    it('tells a package with nothing to mutate from one whose test suite failed', () => {
      const mutation: MutationResults = { backend: { status: 'no_files' }, frontend: { status: 'suite_failed' } };

      const report = renderReport({ classification, agent, apply: notApplied, mutation, coverage: noCoverage, verification: notVerified, missingCitations: noMissingCitations, runUrl });

      expect(report).toContain(
        [
          '#### Mutation testing',
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
      const report = renderReport({ classification, agent, apply: notApplied, mutation: noMutation, coverage: noCoverage, verification: notVerified, missingCitations: noMissingCitations, runUrl });

      expect(report).not.toContain('Mutation testing');
    });

    it('renders mutated code from the pull request inert, on one line, and shortened', () => {
      const replacement = '`<img src=x>`\n  @owner [link](https://x)' + 'y'.repeat(100);
      const mutation: MutationResults = { backend: completed({ survivors: [survivor({ replacement })] }), frontend: { status: 'not_run' } };

      const report = renderReport({ classification, agent, apply: notApplied, mutation, coverage: noCoverage, verification: notVerified, missingCitations: noMissingCitations, runUrl });

      const line = report.split('\n').find((text) => text.startsWith('- `backend/'));
      expect(line).toBe(`- \`backend/src/features/todos/router.ts:12:7\` EqualityOperator: \`\` \`<img src=x>\` @owner [link](https://x)${'y'.repeat(22)}… \`\``);
    });

    it('keeps a long list of surviving mutants within the comment limit', () => {
      const survivors = Array.from({ length: 5_000 }, (_, i) => survivor({ file: `src/${'x'.repeat(200)}.ts`, line: i + 1 }));
      const mutation: MutationResults = { backend: completed({ survived: 5_000, survivors }), frontend: { status: 'not_run' } };

      const report = renderReport({ classification, agent, apply: notApplied, mutation, coverage: noCoverage, verification: notVerified, missingCitations: noMissingCitations, runUrl });

      expect(report.length).toBeLessThanOrEqual(65_536);
      expect(report).toMatch(/_\d+ more surviving mutants not shown; see the mutation report artifact\._/);
      expect(report).toContain('[Workflow run]');
    });
  });
});
