import { parseDecisionLog } from './decision-log.ts';
import type { AgentResult } from './report.ts';

// What the agent job records about the claude-code-action step.
export type AgentRun = {
  // The step's outcome: success, failure, or cancelled.
  outcome: string;
  // The step ran until its timeout.
  timedOut: boolean;
  // Untrusted: the final `result` message of the action's execution file, as JSON; null when there was none.
  execution: string | null;
  // Untrusted: the action's structured output.
  decisionLog: string | null;
};

type ResultMessage = { subtype: string; isError: boolean; numTurns: number };

function resultMessage(untrustedJson: string | null): ResultMessage | null {
  if (!untrustedJson) return null;
  let value: unknown;
  try {
    value = JSON.parse(untrustedJson);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const { subtype, is_error: isError, num_turns: numTurns } = value as Record<string, unknown>;
  if (typeof subtype !== 'string' || !/^[a-z_]{1,50}$/.test(subtype)) return null;
  if (typeof isError !== 'boolean' || typeof numTurns !== 'number' || !Number.isSafeInteger(numTurns)) return null;
  return { subtype, isError, numTurns };
}

// The claude-code-action fails the step on these; the subtypes are the Agent SDK's.
function failureReason({ subtype, isError, numTurns }: ResultMessage): string {
  switch (subtype) {
    case 'error_max_turns':
      return `the agent hit the turn cap after ${numTurns} turns`;
    case 'error_during_execution':
      return 'the agent stopped on an API or runtime error';
    case 'error_max_structured_output_retries':
      return 'the agent returned no valid Decision Log';
    case 'success':
      return isError ? 'the model API returned an error' : `the agent run failed after ${numTurns} turns`;
    default:
      return `the agent run ended with ${subtype} after ${numTurns} turns`;
  }
}

// The agent ran, so the result is never not_run.
export function agentResult({ outcome, timedOut, execution, decisionLog }: AgentRun): Exclude<AgentResult, { status: 'not_run' }> {
  if (outcome === 'success') {
    if (!decisionLog) return { status: 'failed', reason: 'the agent produced no Decision Log' };
    const parsed = parseDecisionLog(decisionLog);
    return parsed.ok ? { status: 'succeeded', log: parsed.log } : { status: 'failed', reason: `invalid Decision Log: ${parsed.error}` };
  }

  const result = resultMessage(execution);
  if (result) return { status: 'failed', reason: failureReason(result) };
  if (timedOut) return { status: 'failed', reason: 'the agent timed out' };
  return { status: 'failed', reason: outcome === 'cancelled' ? 'the agent was cancelled' : 'the agent stopped without a result' };
}
