import type { Classification } from './classify.ts';
import type { Decision, DecisionLog, FileLog } from './decision-log.ts';
import { mutationPackages, type MutationPackage, type MutationSummary, type Survivor } from './mutation.ts';
import type { PatchRejection } from './patch.ts';

export type AgentResult =
  | { status: 'not_run' }
  | { status: 'failed'; reason: string }
  | { status: 'succeeded'; log: DecisionLog };

export type ApplyResult =
  | { status: 'not_run' }
  | { status: 'committed'; sha: string }
  | { status: 'no_changes' }
  | { status: 'rejected'; rejected: readonly PatchRejection[] }
  | { status: 'failed' };

export type MutationResult =
  | { status: 'not_run' }
  | { status: 'no_files' }
  | { status: 'suite_failed' }
  | { status: 'failed'; reason: string }
  | { status: 'completed'; summary: MutationSummary };

export type MutationResults = Record<MutationPackage, MutationResult>;

export type ReportInput = {
  classification: Classification;
  agent: AgentResult;
  apply: ApplyResult;
  mutation: MutationResults;
  runUrl: string;
};

type Row = {
  path: string;
  decision: Decision | 'not_run';
  // Markdown: trusted classification text as is, agent text escaped.
  reason: string;
  log?: FileLog;
};

const COMMENT_LIMIT = 65_536;
// Room for headings, collapsible wrappers, and omission notes, which the budget does not count.
const FIXED_TEXT_ALLOWANCE = 2_000;
const COLLAPSED_TABLE_ROWS = 20;
const REPLACEMENT_LENGTH = 60;

// File names come from the PR, so render them as a code span: HTML and markdown stay inert,
// and the fence is longer than any backtick run inside the name. Table cells also need `|` escaped.
function codeSpan(text: string, inTable = false): string {
  const clean = text.replace(/[\u0000-\u001f\u007f]/g, '�');
  const cell = inTable ? clean.replaceAll('|', '\\|') : clean;
  const longestRun = Math.max(0, ...(cell.match(/`+/g) ?? []).map((run) => run.length));
  const fence = '`'.repeat(longestRun + 1);
  const padding = longestRun > 0 ? ' ' : '';
  return `${fence}${padding}${cell}${padding}${fence}`;
}

// Agent text is prose, so backslash-escape every character that could start markup.
function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_[\]<>#+\-.!|~&$@:]/g, '\\$&');
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function toRows({ files }: Classification, agent: AgentResult): Row[] {
  const logs = new Map(agent.status === 'succeeded' ? agent.log.files.map((log) => [log.path, log]) : []);
  const rows = files.map((file): Row => {
    if (file.decision !== 'pending') return { path: file.path, decision: file.decision, reason: file.reason };
    if (agent.status !== 'succeeded') return { ...file, decision: 'not_run' };

    const log = logs.get(file.path);
    if (!log) return { path: file.path, decision: 'not_run', reason: 'Missing from the Decision Log' };
    return { path: file.path, decision: log.decision, reason: escapeMarkdown(log.reason), log };
  });
  return [...rows.filter((row) => row.decision !== 'skipped'), ...rows.filter((row) => row.decision === 'skipped')];
}

function verdict({ stop, files }: Classification, agent: AgentResult, rows: readonly Row[]): string {
  if (stop) return `Test Agent skipped: ${stop.message}.`;
  if (files.length === 0) return 'Test Agent skipped: no changed files.';
  if (rows.every((row) => row.decision === 'skipped')) {
    return `Test Agent skipped: all ${files.length} changed files were Skipped.`;
  }
  if (agent.status === 'failed') return `Test Agent failed: ${agent.reason}.`;
  if (agent.status === 'not_run') return 'Test Agent did not run.';

  const covered = rows.filter((row) => row.decision === 'tested' || row.decision === 'updated').length;
  const bugs = rows.filter((row) => row.decision === 'suspected_bug').length;
  const tested = `Test Agent wrote tests for ${covered} of ${files.length} changed files`;
  return bugs === 0 ? `${tested}.` : `${tested} and found ${plural(bugs, 'Suspected Bug')}.`;
}

type Budget = { left: number };

// Keeps the leading blocks that fit in what is left of the comment, so a long report loses its tail, not its shape.
function fit(budget: Budget, blocks: readonly string[]): { kept: string[]; omitted: number } {
  const kept: string[] = [];
  for (const block of blocks) {
    if (block.length + 1 > budget.left) break;
    budget.left -= block.length + 1;
    kept.push(block);
  }
  return { kept, omitted: blocks.length - kept.length };
}

function collapsible(summary: string, lines: readonly string[]): string[] {
  return ['<details>', `<summary>${summary}</summary>`, '', ...lines, '</details>', ''];
}

function table(budget: Budget, rows: readonly Row[]): string[] {
  if (rows.length === 0) return [];
  const { kept, omitted } = fit(
    budget,
    rows.map((row) => `| ${codeSpan(row.path, true)} | \`${row.decision}\` | ${row.reason} |`),
  );
  const lines = [
    '| File | Decision | Reason |',
    '| --- | --- | --- |',
    ...kept,
    '',
    ...(omitted > 0 ? [`_${plural(omitted, 'more changed file')} not shown._`, ''] : []),
  ];
  return rows.length > COLLAPSED_TABLE_ROWS ? collapsible(`Decisions for ${rows.length} changed files`, lines) : lines;
}

function omittedNote(omitted: number, noun: string, artifact = 'Decision Log'): string[] {
  return omitted > 0 ? [`_${plural(omitted, noun)} not shown; see the ${artifact} artifact._`, ''] : [];
}

function suspectedBugs(budget: Budget, logs: readonly FileLog[]): string[] {
  const bugs = logs.filter((log) => log.decision === 'suspected_bug');
  if (bugs.length === 0) return [];
  const { kept, omitted } = fit(
    budget,
    bugs.map((log) => `- ${codeSpan(log.path)}: ${escapeMarkdown(log.reason)}`),
  );
  return ['### Suspected Bugs', '', ...kept, '', ...omittedNote(omitted, 'more Suspected Bug')];
}

function applied(budget: Budget, apply: ApplyResult): string[] {
  switch (apply.status) {
    case 'not_run':
      return [];
    case 'committed':
      return [`Committed the tests to this branch in ${apply.sha}.`, ''];
    case 'no_changes':
      return ['No test changes to commit.', ''];
    case 'failed':
      return ['Committing the tests failed; nothing was pushed.', ''];
    case 'rejected': {
      const { kept, omitted } = fit(
        budget,
        apply.rejected.map(({ path, reason }) => `- ${codeSpan(path)}: ${reason}`),
      );
      return [
        '### Patch rejected',
        '',
        'Nothing was pushed: the patch changes what the Test Agent may not write.',
        '',
        ...kept,
        '',
        ...(omitted > 0 ? [`_${plural(omitted, 'more rejected path')} not shown._`, ''] : []),
      ];
    }
  }
}

// Mutated code comes from the PR: one line, shortened, rendered as a code span.
function oneLineCode(code: string): string {
  const line = code.replace(/\s+/g, ' ').trim();
  return line.length > REPLACEMENT_LENGTH ? `${line.slice(0, REPLACEMENT_LENGTH)}…` : line;
}

function survivorLine(pkg: MutationPackage, { file, line, column, mutator, replacement, status }: Survivor): string {
  const change = replacement === null ? '' : `: ${codeSpan(oneLineCode(replacement))}`;
  const uncovered = status === 'NoCoverage' ? ' (no test covers it)' : '';
  return `- ${codeSpan(`${pkg}/${file}:${line}:${column}`)} ${mutator}${change}${uncovered}`;
}

// Why a package has no score; nothing for a package that scored or a Verification Job that did not get this far.
function mutationNote(result: MutationResult): string | null {
  switch (result.status) {
    case 'no_files':
      return 'no changed source files to mutate';
    case 'suite_failed':
      return 'not mutated because its test suite failed';
    case 'failed':
      return `mutation testing failed: ${result.reason}`;
    case 'not_run':
    case 'completed':
      return null;
  }
}

function mutationTesting(budget: Budget, mutation: MutationResults): string[] {
  const completed = mutationPackages.flatMap((pkg) => {
    const result = mutation[pkg];
    return result.status === 'completed' ? [{ pkg, summary: result.summary }] : [];
  });
  const notes = mutationPackages.flatMap((pkg) => {
    const note = mutationNote(mutation[pkg]);
    return note ? [`_${pkg}: ${note}._`, ''] : [];
  });
  if (completed.length === 0 && notes.length === 0) return [];

  const scores = completed.map(({ pkg, summary: { score, detected, survived, noCoverage } }) => {
    const percent = score === null ? 'n/a' : `${score.toFixed(2)}%`;
    return `| ${pkg} | ${percent} | ${detected} | ${survived} | ${noCoverage} |`;
  });
  const scoreTable =
    scores.length === 0
      ? []
      : ['| Package | Mutation score | Detected | Survived | No coverage |', '| --- | --- | --- | --- | --- |', ...scores, ''];

  const survivors = completed.flatMap(({ pkg, summary }) => summary.survivors.map((survivor) => survivorLine(pkg, survivor)));
  const { kept, omitted } = fit(budget, survivors);
  const list =
    survivors.length === 0
      ? []
      : collapsible(plural(survivors.length, 'surviving mutant'), [
          ...kept,
          '',
          ...omittedNote(omitted, 'more surviving mutant', 'mutation report'),
        ]);

  return [
    '### Mutation testing',
    '',
    'Mutation score of the changed source files. A warning, not a gate: it does not change `test-agent/verify`.',
    '',
    ...scoreTable,
    ...notes,
    ...list,
  ];
}

function listSection(title: string, items: readonly string[]): string[] {
  return items.length === 0 ? [] : [`${title}:`, '', ...items.map((item) => `- ${codeSpan(item)}`), ''];
}

function behaviorsAndTests(budget: Budget, logs: readonly FileLog[]): string[] {
  const detailed = logs.filter((log) => log.behaviors.length > 0 || log.tests.length > 0);
  if (detailed.length === 0) return [];
  const { kept, omitted } = fit(
    budget,
    detailed.map((log) =>
      [
        `#### ${codeSpan(log.path)}`,
        '',
        `Decision: \`${log.decision}\`, attempts: ${log.attempts}`,
        '',
        ...listSection('Behaviors', log.behaviors),
        ...listSection('Tests', log.tests),
      ].join('\n'),
    ),
  );
  return collapsible('Behaviors and tests', [...kept, ...omittedNote(omitted, 'more file')]);
}

export function renderReport({ classification, agent, apply, mutation, runUrl }: ReportInput): string {
  const rows = toRows(classification, agent);
  const logs = rows.flatMap((row) => (row.log ? [row.log] : []));
  const summary = agent.status === 'succeeded' ? [escapeMarkdown(agent.log.summary), ''] : [];
  const head = [
    '<!-- test-agent-report -->',
    '## Test Agent',
    '',
    `**${verdict(classification, agent, rows)}**`,
    '',
    ...summary,
  ];

  // Spent in order of importance; the sections still render in reading order.
  const budget = { left: COMMENT_LIMIT - FIXED_TEXT_ALLOWANCE - head.join('\n').length };
  const applyLines = applied(budget, apply);
  const bugs = suspectedBugs(budget, logs);
  const decisions = table(budget, rows);
  const mutationLines = mutationTesting(budget, mutation);
  const details = behaviorsAndTests(budget, logs);

  return [
    ...head,
    ...applyLines,
    ...decisions,
    ...mutationLines,
    ...bugs,
    ...details,
    `[Workflow run](${runUrl})`,
    '',
  ].join('\n');
}
