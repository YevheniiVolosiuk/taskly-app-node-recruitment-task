// Usage: AGENT_JOB_RESULT=<needs.agent.result> RUN_URL=<workflow run URL> node tools/src/cli/report.ts <classification.json> <decision-log.json> <report.md>
// <decision-log.json> is the agent's untrusted structured output; it may be missing when the agent did not finish.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { Classification } from '../classify.ts';
import { parseDecisionLog } from '../decision-log.ts';
import { renderReport, type AgentResult } from '../report.ts';

const [classificationPath, decisionLogPath, outputPath] = process.argv.slice(2);
if (!classificationPath || !decisionLogPath || !outputPath) {
  throw new Error('usage: report.ts <classification.json> <decision-log.json> <report.md>');
}

function agentResult(jobResult: string | undefined, logPath: string): AgentResult {
  if (jobResult === 'cancelled') return { status: 'failed', reason: 'the agent job was cancelled or timed out' };
  if (jobResult === 'failure') return { status: 'failed', reason: 'the agent job failed' };
  if (jobResult !== 'success') return { status: 'not_run' };
  if (!existsSync(logPath)) return { status: 'failed', reason: 'the agent produced no Decision Log' };

  const parsed = parseDecisionLog(readFileSync(logPath, 'utf8'));
  return parsed.ok ? { status: 'succeeded', log: parsed.log } : { status: 'failed', reason: `invalid Decision Log: ${parsed.error}` };
}

const classification = JSON.parse(readFileSync(classificationPath, 'utf8')) as Classification;
const runUrl = process.env.RUN_URL;
if (!runUrl) throw new Error('RUN_URL is not set');

const agent = agentResult(process.env.AGENT_JOB_RESULT, decisionLogPath);
writeFileSync(outputPath, renderReport({ classification, agent, runUrl }));
