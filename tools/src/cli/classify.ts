// Usage: node tools/src/cli/classify.ts <changed-files> <classification.json>
// <changed-files> holds NUL-separated paths (git diff --name-only -z). PR context comes from
// the event payload at GITHUB_EVENT_PATH; the run-agent output goes to GITHUB_OUTPUT.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { classifyChanges, type PullRequestContext } from '../classify.ts';

type PullRequestEvent = {
  pull_request: {
    draft: boolean;
    labels: { name: string }[];
    base: { repo: { full_name: string } };
    head: { repo: { full_name: string } | null };
  };
};

function readContext(eventPath: string): PullRequestContext {
  const { pull_request: pr } = JSON.parse(readFileSync(eventPath, 'utf8')) as PullRequestEvent;
  return {
    labels: pr.labels.map((label) => label.name),
    draft: pr.draft,
    isFork: pr.head.repo?.full_name !== pr.base.repo.full_name,
  };
}

const [changedFilesPath, outputPath] = process.argv.slice(2);
const eventPath = process.env.GITHUB_EVENT_PATH;
if (!changedFilesPath || !outputPath || !eventPath) {
  throw new Error('usage: classify.ts <changed-files> <classification.json> (needs GITHUB_EVENT_PATH)');
}

const changedFiles = readFileSync(changedFilesPath, 'utf8').split('\0').filter(Boolean);
const classification = classifyChanges(changedFiles, readContext(eventPath));
writeFileSync(outputPath, JSON.stringify(classification, null, 2));

const runAgent = classification.stop === null && classification.files.some((file) => file.decision === 'candidate');
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `run-agent=${runAgent}\n`);
