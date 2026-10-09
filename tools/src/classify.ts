export type PullRequestContext = {
  labels: readonly string[];
  draft: boolean;
  isFork: boolean;
};

// The fields used from a GitHub pull request object (REST `GET /pulls/{n}` or the event payload).
export type PullRequest = {
  draft: boolean;
  labels: readonly { name: string }[];
  base: { repo: { full_name: string } };
  head: { repo: { full_name: string } | null };
};

export function pullRequestContext(pr: PullRequest): PullRequestContext {
  return {
    labels: pr.labels.map((label) => label.name),
    draft: pr.draft,
    isFork: pr.head.repo?.full_name !== pr.base.repo.full_name,
  };
}

export type SkipCategory =
  | 'docs'
  | 'lockfile'
  | 'generated'
  | 'migration'
  | 'config'
  | 'test'
  | 'type-only'
  | 'style'
  | 'non-logic'
  | 'not-source';

export type FileDecision =
  | { path: string; decision: 'pending' | 'not_run'; reason: string }
  | { path: string; decision: 'skipped'; category: SkipCategory; reason: string };

export type Stop = { reason: 'fork' | 'label' | 'draft'; message: string };

export type Classification = {
  stop: Stop | null;
  files: FileDecision[];
};

const SKIP_LABEL = 'skip-test-agent';

type Rule = { pattern: RegExp; category: SkipCategory; reason: string };

const skipRules: readonly Rule[] = [
  { pattern: /(^|\/)[^/]+\.mdx?$|^docs\//, category: 'docs', reason: 'Documentation' },
  {
    pattern: /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml)$/,
    category: 'lockfile',
    reason: 'Lockfile',
  },
  { pattern: /^backend\/src\/generated\//, category: 'generated', reason: 'Generated code' },
  { pattern: /(^|\/)prisma\/(migrations\/|schema\.prisma$)/, category: 'migration', reason: 'Database schema or migration' },
  {
    pattern: /(^|\/)\.[^/]+(\/|$)|(^|\/)Dockerfile[^/]*$|\.(json|ya?ml|toml)$|(^|\/)[^/]+\.config\.[cm]?[jt]s$/,
    category: 'config',
    reason: 'Configuration',
  },
  {
    pattern: /^backend\/tests\/|^frontend\/src\/test\/|\.(test|spec)\.tsx?$|(^|\/)__tests__\//,
    category: 'test',
    reason: 'Test-only change',
  },
  { pattern: /(^|\/)types\.ts$|\.types\.ts$|\.d\.ts$/, category: 'type-only', reason: 'Type-only declarations' },
  {
    pattern: /\.(css|scss|sass|less)$|\.styles\.tsx?$|^frontend\/src\/design-system\/theme\//,
    category: 'style',
    reason: 'Styles only',
  },
  { pattern: /\.stories\.tsx?$/, category: 'non-logic', reason: 'Storybook story' },
  { pattern: /^frontend\/src\/design-system\//, category: 'non-logic', reason: 'Design-system render-only component' },
  { pattern: /(^|\/)index\.tsx?$/, category: 'non-logic', reason: 'Barrel re-export' },
  { pattern: /^(backend\/src\/main\.ts|frontend\/src\/main\.tsx)$/, category: 'non-logic', reason: 'Entry point' },
  { pattern: /(^|\/)constants\.tsx?$|\.constants\.tsx?$/, category: 'non-logic', reason: 'Constants' },
];

const candidateRules: readonly { pattern: RegExp; reason: string }[] = [
  { pattern: /^backend\/src\/.+\.ts$/, reason: 'Backend logic' },
  { pattern: /^frontend\/src\/.+\.tsx?$/, reason: 'Frontend logic' },
];

function classifyFile(path: string, stop: Stop | null): FileDecision {
  const skip = skipRules.find((rule) => rule.pattern.test(path));
  if (skip) return { path, decision: 'skipped', category: skip.category, reason: skip.reason };

  const candidate = candidateRules.find((rule) => rule.pattern.test(path));
  if (candidate) return { path, decision: stop ? 'not_run' : 'pending', reason: candidate.reason };

  return { path, decision: 'skipped', category: 'not-source', reason: 'Not app source code' };
}

function findStop({ isFork, labels, draft }: PullRequestContext): Stop | null {
  if (isFork) return { reason: 'fork', message: 'pull request is from a fork' };
  if (labels.includes(SKIP_LABEL)) return { reason: 'label', message: `the \`${SKIP_LABEL}\` label is set` };
  if (draft) return { reason: 'draft', message: 'pull request is a draft' };
  return null;
}

export function classifyChanges(changedFiles: readonly string[], context: PullRequestContext): Classification {
  const stop = findStop(context);
  return { stop, files: changedFiles.map((path) => classifyFile(path, stop)) };
}
