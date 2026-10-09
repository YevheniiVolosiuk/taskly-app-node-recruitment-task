// Usage: AGENT_JOB_RESULT=<needs.agent.result> APPLY_JOB_RESULT=<needs.apply.result> APPLY_COMMIT=<pushed SHA or empty>
//   RUN_URL=<workflow run URL> node tools/src/cli/report.ts <classification.json> <decision-log.json> <patch-validation.json> <report.md>
// <decision-log.json> is the agent's untrusted structured output; it may be missing when the agent did not finish.
// <patch-validation.json> may be missing when the apply job did not validate a patch.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { Classification } from '../classify.ts';
import { parseDecisionLog } from '../decision-log.ts';
import type { PatchValidation } from '../patch.ts';
import { renderReport, type AgentResult, type ApplyResult } from '../report.ts';

const [classificationPath, decisionLogPath, validationPath, outputPath] = process.argv.slice(2);
if (!classificationPath || !decisionLogPath || !validationPath || !outputPath) {
  throw new Error('usage: report.ts <classification.json> <decision-log.json> <patch-validation.json> <report.md>');
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

const classification = JSON.parse(readFileSync(classificationPath, 'utf8')) as Classification;
const runUrl = process.env.RUN_URL;
if (!runUrl) throw new Error('RUN_URL is not set');

const agent = agentResult(process.env.AGENT_JOB_RESULT, decisionLogPath);
const apply = applyResult(process.env.APPLY_JOB_RESULT, process.env.APPLY_COMMIT, validationPath);
writeFileSync(outputPath, renderReport({ classification, agent, apply, runUrl }));
