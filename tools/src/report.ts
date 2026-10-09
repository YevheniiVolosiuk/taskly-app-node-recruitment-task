import type { Classification, FileDecision } from './classify.ts';

export type ReportInput = {
  classification: Classification;
};

function verdict({ stop, files }: Classification): string {
  if (stop) return `Test Agent skipped: ${stop.message}.`;
  if (files.length === 0) return 'Test Agent skipped: no changed files.';

  const candidates = files.filter((file) => file.decision === 'pending').length;
  if (candidates === 0) return `Test Agent skipped: all ${files.length} changed files were Skipped.`;
  return `${candidates} of ${files.length} changed files are Test Agent candidates.`;
}

// File names come from the PR, so render them as a code span: HTML and markdown stay inert,
// and the fence is longer than any backtick run inside the name.
function codeSpan(text: string): string {
  const cell = text.replace(/[\u0000-\u001f\u007f]/g, '�').replaceAll('|', '\\|');
  const longestRun = Math.max(0, ...(cell.match(/`+/g) ?? []).map((run) => run.length));
  const fence = '`'.repeat(longestRun + 1);
  const padding = longestRun > 0 ? ' ' : '';
  return `${fence}${padding}${cell}${padding}${fence}`;
}

function row(file: FileDecision): string {
  return `| ${codeSpan(file.path)} | \`${file.decision}\` | ${file.reason} |`;
}

function table(files: readonly FileDecision[]): string[] {
  if (files.length === 0) return [];
  const ordered = [
    ...files.filter((file) => file.decision !== 'skipped'),
    ...files.filter((file) => file.decision === 'skipped'),
  ];
  return ['| File | Decision | Reason |', '| --- | --- | --- |', ...ordered.map(row), ''];
}

export function renderReport({ classification }: ReportInput): string {
  return [
    '<!-- test-agent-report -->',
    '## Test Agent',
    '',
    `**${verdict(classification)}**`,
    '',
    ...table(classification.files),
  ].join('\n');
}
