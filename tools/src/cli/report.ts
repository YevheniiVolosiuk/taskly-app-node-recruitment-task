// Usage: AGENT_JOB_RESULT=<needs.agent.result> APPLY_JOB_RESULT=<needs.apply.result> APPLY_COMMIT=<pushed SHA or empty>
//   MUTATION_<PACKAGE>_OUTCOME=<Stryker step outcome> SUITE_<PACKAGE>_OUTCOME=<test suite step outcome>
//   FILES_TO_MUTATE_<PACKAGE>=<files-to-mutate output> (for BACKEND and FRONTEND) RUN_URL=<workflow run URL>
//   node tools/src/cli/report.ts <classification.json> <decision-log.json> <patch-validation.json> <mutation-dir> <report.md>
// <decision-log.json> is the agent's untrusted structured output; it may be missing when the agent did not finish.
// <patch-validation.json> may be missing when the apply job did not validate a patch.
// <mutation-dir>/<package>/mutation.json is Stryker's report from a run of the PR's code; it may be missing.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { Classification } from '../classify.ts';
import { parseDecisionLog } from '../decision-log.ts';
import { parseMutationReport } from '../mutation.ts';
import type { PatchValidation } from '../patch.ts';
import { renderReport, type AgentResult, type ApplyResult, type MutationResult, type MutationResults } from '../report.ts';

const [classificationPath, decisionLogPath, validationPath, mutationDir, outputPath] = process.argv.slice(2);
if (!classificationPath || !decisionLogPath || !validationPath || !mutationDir || !outputPath) {
  throw new Error(
    'usage: report.ts <classification.json> <decision-log.json> <patch-validation.json> <mutation-dir> <report.md>',
  );
}

function agentResult(jobResult: string | undefined, logPath: string): AgentResult {
  if (jobResult === 'cancelled') return { status: 'failed', reason: 'the agent job was cancelled or timed out' };
  if (jobResult === 'failure') return { status: 'failed', reason: 'the agent job failed' };
  if (jobResult !== 'success') return { status: 'not_run' };
  if (!existsSync(logPath)) return { status: 'failed', reason: 'the agent produced no Decision Log' };

  const parsed = parseDecisionLog(readFileSync(logPath, 'utf8'));
  return parsed.ok ? { status: 'succeeded', log: parsed.log } : { status: 'failed', reason: `invalid Decision Log: ${parsed.error}` };
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

const classification = JSON.parse(readFileSync(classificationPath, 'utf8')) as Classification;
const runUrl = process.env.RUN_URL;
if (!runUrl) throw new Error('RUN_URL is not set');

const agent = agentResult(process.env.AGENT_JOB_RESULT, decisionLogPath);
const apply = applyResult(process.env.APPLY_JOB_RESULT, process.env.APPLY_COMMIT, validationPath);
const mutation: MutationResults = {
  backend: mutationResult('BACKEND', `${mutationDir}/backend/mutation.json`),
  frontend: mutationResult('FRONTEND', `${mutationDir}/frontend/mutation.json`),
};
writeFileSync(outputPath, renderReport({ classification, agent, apply, mutation, runUrl }));
