// Usage: node tools/src/cli/classify.ts <changed-files> <pull-request.json> <classification.json>
// <changed-files> holds NUL-separated paths (git diff --name-only -z). <pull-request.json> is the
// live pull request from the REST API, so re-runs see current labels and draft state.
// The run-agent and candidates outputs go to GITHUB_OUTPUT.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { classifyChanges, pullRequestContext, type PullRequest } from '../classify.ts';

const [changedFilesPath, pullRequestPath, outputPath] = process.argv.slice(2);
if (!changedFilesPath || !pullRequestPath || !outputPath) {
  throw new Error('usage: classify.ts <changed-files> <pull-request.json> <classification.json>');
}

const changedFiles = readFileSync(changedFilesPath, 'utf8').split('\0').filter(Boolean);
const pullRequest = JSON.parse(readFileSync(pullRequestPath, 'utf8')) as PullRequest;
const classification = classifyChanges(changedFiles, pullRequestContext(pullRequest));
writeFileSync(outputPath, JSON.stringify(classification, null, 2));

const runAgent = classification.files.some((file) => file.decision === 'pending');
const candidates = classification.files.some((file) => file.decision !== 'skipped');
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `run-agent=${runAgent}\ncandidates=${candidates}\n`);
