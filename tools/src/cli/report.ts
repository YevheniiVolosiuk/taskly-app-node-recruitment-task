// Usage: AGENT_JOB_RESULT=<needs.agent.result> AGENT_OUTCOME=<agent step outcome> AGENT_TIMED_OUT=<1 when it timed out>
//   APPLY_JOB_RESULT=<needs.apply.result> APPLY_COMMIT=<pushed SHA or empty>
//   MUTATION_<PACKAGE>_OUTCOME=<Stryker step outcome> SUITE_<PACKAGE>_OUTCOME=<test suite step outcome>
//   FILES_TO_MUTATE_<PACKAGE>=<files-to-mutate output> (for BACKEND and FRONTEND) SUITE_TOOLS_OUTCOME=<tools tests step outcome>
//   SMOKE_API_OUTCOME=<backend smoke check step outcome> SMOKE_BUILD_OUTCOME=<frontend type-check and build step outcome>
//   VERIFY_JOB_RESULT=<needs.verify.result> VERIFY_STATE=<test-agent/verify state the Verification Job decided, or empty>
//   STATUS_POSTED=<true when the Verification Job posts test-agent/verify> VERIFIED_SHA=<commit the Verification Job checked out>
//   RUN_URL=<workflow run URL>
//   node tools/src/cli/report.ts <classification.json> <agent-run-dir> <patch-validation.json> <mutation-dir> <coverage-dir>
//     <verified-checkout> <report.md>
// <classification.json> is missing when the classify job failed.
// <agent-run-dir> holds the agent job's execution-result.json and decision-log.json, both untrusted; either may be missing.
// <patch-validation.json> may be missing when the apply job did not validate a patch.
// <mutation-dir>/<package>/mutation.json is Stryker's report from a run of the PR's code; it may be missing.
// <coverage-dir>/coverage-{baseline,summary}-<package>/coverage-summary.json are Vitest's coverage summaries of the merge
// base and of the verified commit, keyed by absolute paths under GITHUB_WORKSPACE; any may be missing.
// <verified-checkout> is a checkout of VERIFIED_SHA, present when the Verification Job finished.
import { existsSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { agentResult } from '../agent-run.ts';
import { findMissingCitations } from '../citation.ts';
import type { Classification } from '../classify.ts';
import { parseCoverageSummary, type CoverageFiles } from '../coverage.ts';
import type { PatchValidation } from '../patch.ts';
import { mutationPackages, parseMutationReport } from '../mutation.ts';
import {
  renderReport,
  type AgentResult,
  type ApplyResult,
  type CheckOutcome,
  type CoverageDelta,
  type MutationResult,
  type MutationResults,
  type VerificationResult,
} from '../report.ts';

const [classificationPath, agentRunDir, validationPath, mutationDir, coverageDir, verifiedDir, outputPath] = process.argv.slice(2);
if (!classificationPath || !agentRunDir || !validationPath || !mutationDir || !coverageDir || !verifiedDir || !outputPath) {
  throw new Error(
    'usage: report.ts <classification.json> <agent-run-dir> <patch-validation.json> <mutation-dir> <coverage-dir> <verified-checkout> <report.md>',
  );
}

const read = (path: string) => (existsSync(path) ? readFileSync(path, 'utf8') : null);

function agentJobResult(jobResult: string | undefined): AgentResult {
  if (jobResult !== 'success' && jobResult !== 'failure' && jobResult !== 'cancelled') return { status: 'not_run' };
  const outcome = process.env.AGENT_OUTCOME;
  if (!outcome || outcome === 'skipped') {
    const reason = jobResult === 'cancelled' ? 'the agent job was cancelled or timed out' : 'the agent job failed before the agent ran';
    return { status: 'failed', reason };
  }

  const result = agentResult({
    outcome,
    timedOut: process.env.AGENT_TIMED_OUT === '1',
    execution: read(`${agentRunDir}/execution-result.json`),
    decisionLog: read(`${agentRunDir}/decision-log.json`),
  });
  if (result.status === 'succeeded' && jobResult !== 'success') return { status: 'failed', reason: 'the agent job failed after the agent finished' };
  return result;
}

function applyResult(jobResult: string | undefined, commit: string | undefined, validationPath: string): ApplyResult {
  if (existsSync(validationPath)) {
    const validation = JSON.parse(readFileSync(validationPath, 'utf8')) as PatchValidation;
    if (!validation.ok) return { status: 'rejected', rejected: validation.rejected };
  }
  if (jobResult === 'success') return commit ? { status: 'committed', sha: commit } : { status: 'no_changes' };
  if (jobResult === 'failure' || jobResult === 'cancelled') return { status: 'failed' };
  return { status: 'not_run' };
}

function mutationResult(pkg: 'BACKEND' | 'FRONTEND', reportPath: string): MutationResult {
  const outcome = process.env[`MUTATION_${pkg}_OUTCOME`];
  if (outcome === 'failure') return { status: 'failed', reason: 'Stryker failed or timed out' };
  if (outcome !== 'success') {
    if (process.env[`FILES_TO_MUTATE_${pkg}`] === '[]') return { status: 'no_files' };
    if (process.env[`SUITE_${pkg}_OUTCOME`] === 'failure') return { status: 'suite_failed' };
    return { status: 'not_run' };
  }
  if (!existsSync(reportPath)) return { status: 'failed', reason: 'Stryker produced no report' };

  const parsed = parseMutationReport(readFileSync(reportPath, 'utf8'));
  return parsed.ok ? { status: 'completed', summary: parsed.summary } : { status: 'failed', reason: `invalid report: ${parsed.error}` };
}

function checkOutcome(outcome: string | undefined): CheckOutcome {
  if (outcome === 'success') return 'passed';
  if (outcome === 'failure') return 'failed';
  return 'not_run';
}

// The decided state wins over the job result: mutation testing runs after the status is posted and can still fail or be cancelled.
function verificationResult(jobResult: string | undefined, state: string | undefined): VerificationResult {
  const posted = process.env.STATUS_POSTED === 'true';
  if (state === 'error') return { status: 'cancelled', posted };
  if (jobResult === 'cancelled' && state !== 'success' && state !== 'failure') return { status: 'cancelled', posted: false };
  if (state !== 'success' && state !== 'failure') return { status: 'not_run' };
  const sha = process.env.VERIFIED_SHA;
  if (!sha) throw new Error('VERIFIED_SHA is not set');
  const checks = {
    backend: checkOutcome(process.env.SUITE_BACKEND_OUTCOME),
    frontend: checkOutcome(process.env.SUITE_FRONTEND_OUTCOME),
    tools: checkOutcome(process.env.SUITE_TOOLS_OUTCOME),
    'smoke-api': checkOutcome(process.env.SMOKE_API_OUTCOME),
    'smoke-build': checkOutcome(process.env.SMOKE_BUILD_OUTCOME),
  };
  return { status: 'finished', sha, state, posted, checks };
}

// One package's summary missing leaves its files out; both missing means that run has no coverage.
function coverageFiles(run: 'baseline' | 'summary', root: string): CoverageFiles | null {
  const summaries = mutationPackages.flatMap((pkg) => {
    const json = read(`${coverageDir}/coverage-${run}-${pkg}/coverage-summary.json`);
    const parsed = json === null ? null : parseCoverageSummary(json, root);
    if (parsed && !parsed.ok) console.log(`::warning::Ignoring the ${run} coverage of ${pkg}: ${parsed.error}`);
    return parsed?.ok ? [parsed.files] : [];
  });
  return summaries.length === 0 ? null : Object.assign({}, ...summaries);
}

// The agent names the cited file, so read only a regular file inside the checkout, symlinks resolved.
function readVerified(root: string, file: string): string | null {
  const path = resolve(root, file);
  if (!existsSync(path)) return null;
  const real = realpathSync(path);
  const inside = relative(realpathSync(root), real);
  if (inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside) || !statSync(real).isFile()) return null;
  return readFileSync(real, 'utf8');
}

function citationsMissing(agent: AgentResult, verification: VerificationResult, root: string): ReadonlySet<string> {
  if (agent.status !== 'succeeded' || verification.status !== 'finished') return new Set();
  if (!existsSync(root)) throw new Error(`${root} does not exist: check out the verified commit there`);
  return findMissingCitations(agent.log.files, (file) => readVerified(root, file));
}

const classificationJson = read(classificationPath);
const classification = classificationJson === null ? null : (JSON.parse(classificationJson) as Classification);
const runUrl = process.env.RUN_URL;
if (!runUrl) throw new Error('RUN_URL is not set');
const workspace = process.env.GITHUB_WORKSPACE;
if (!workspace) throw new Error('GITHUB_WORKSPACE is not set');

const agent = agentJobResult(process.env.AGENT_JOB_RESULT);
const apply = applyResult(process.env.APPLY_JOB_RESULT, process.env.APPLY_COMMIT, validationPath);
const mutation: MutationResults = {
  backend: mutationResult('BACKEND', `${mutationDir}/backend/mutation.json`),
  frontend: mutationResult('FRONTEND', `${mutationDir}/frontend/mutation.json`),
};
const coverage: CoverageDelta = { base: coverageFiles('baseline', workspace), final: coverageFiles('summary', workspace) };
const verification = verificationResult(process.env.VERIFY_JOB_RESULT, process.env.VERIFY_STATE);
const missingCitations = citationsMissing(agent, verification, verifiedDir);
writeFileSync(
  outputPath,
  renderReport({ classification, agent, apply, mutation, coverage, verification, missingCitations, runUrl }),
);
