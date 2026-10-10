// Usage: AGENT_OUTCOME=<steps.agent.outcome> AGENT_TIMED_OUT=<1 when the agent step ran until its timeout>
//   node tools/src/cli/agent-result.ts <agent-run-dir>
// <agent-run-dir> holds execution-result.json (the action's final result message) and decision-log.json (its structured
// output); either may be missing. Exits 1 with the reason when the agent failed, so the apply job does not run.
import { existsSync, readFileSync } from 'node:fs';
import { agentResult } from '../agent-run.ts';

const [dir] = process.argv.slice(2);
if (!dir) throw new Error('usage: agent-result.ts <agent-run-dir>');

const read = (path: string) => (existsSync(path) ? readFileSync(path, 'utf8') : null);
const result = agentResult({
  outcome: process.env.AGENT_OUTCOME ?? '',
  timedOut: process.env.AGENT_TIMED_OUT === '1',
  execution: read(`${dir}/execution-result.json`),
  decisionLog: read(`${dir}/decision-log.json`),
});
if (result.status === 'failed') {
  console.log(`::error::Test Agent failed: ${result.reason}`);
  process.exitCode = 1;
}
