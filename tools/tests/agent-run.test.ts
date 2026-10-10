import { describe, expect, it } from 'vitest';
import { agentResult, type AgentRun } from '../src/agent-run.ts';

const log = {
  summary: 'Tested the router.',
  files: [
    {
      path: 'backend/src/features/todos/router.ts',
      decision: 'tested',
      reason: 'New tests pass',
      behaviors: ['when GET /api/todos, 200 with every todo'],
      tests: ['backend/tests/todos.test.ts > lists every todo'],
      attempts: 1,
    },
  ],
};

function result(subtype: string, overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({ type: 'result', subtype, is_error: subtype !== 'success', num_turns: 30, ...overrides });
}

function run(overrides: Partial<AgentRun>): AgentRun {
  return { outcome: 'failure', timedOut: false, execution: null, decisionLog: null, ...overrides };
}

describe('agentResult', () => {
  it('returns the Decision Log of a finished agent', () => {
    expect(agentResult(run({ outcome: 'success', execution: result('success'), decisionLog: JSON.stringify(log) }))).toEqual({
      status: 'succeeded',
      log,
    });
  });

  it('fails a finished agent without a Decision Log', () => {
    expect(agentResult(run({ outcome: 'success', decisionLog: '' }))).toEqual({
      status: 'failed',
      reason: 'the agent produced no Decision Log',
    });
  });

  it('fails a finished agent with an invalid Decision Log, naming the problem', () => {
    expect(agentResult(run({ outcome: 'success', decisionLog: '{"summary":"x"}' }))).toEqual({
      status: 'failed',
      reason: 'invalid Decision Log: files is not an array',
    });
  });

  it.each([
    ['error_max_turns', {}, 'the agent hit the turn cap after 30 turns'],
    ['error_during_execution', {}, 'the agent stopped on an API or runtime error'],
    ['error_max_structured_output_retries', {}, 'the agent returned no valid Decision Log'],
    ['success', { is_error: true }, 'the model API returned an error'],
    ['success', { is_error: false, num_turns: 31 }, 'the agent run failed after 31 turns'],
    ['error_something_new', {}, 'the agent run ended with error_something_new after 30 turns'],
  ])('names why the agent failed for a %s result', (subtype, overrides, reason) => {
    expect(agentResult(run({ execution: result(subtype, overrides) }))).toEqual({ status: 'failed', reason });
  });

  it.each(['failure', 'cancelled'])('says the agent timed out when its step ended with %s at the step timeout', (outcome) => {
    expect(agentResult(run({ outcome, timedOut: true }))).toEqual({ status: 'failed', reason: 'the agent timed out' });
  });

  it('says the agent stopped without a result otherwise', () => {
    expect(agentResult(run({}))).toEqual({ status: 'failed', reason: 'the agent stopped without a result' });
  });

  it('says the agent was cancelled', () => {
    expect(agentResult(run({ outcome: 'cancelled' }))).toEqual({ status: 'failed', reason: 'the agent was cancelled' });
  });

  it.each([
    ['not JSON', '{'],
    ['an unexpected shape', JSON.stringify({ subtype: 1 })],
    ['a subtype with markup', result('<img src=x>')],
    ['a fractional turn count', result('error_max_turns', { num_turns: 1.5 })],
  ])('treats a result message that is %s as no result', (_, execution) => {
    expect(agentResult(run({ execution }))).toEqual({ status: 'failed', reason: 'the agent stopped without a result' });
  });
});
