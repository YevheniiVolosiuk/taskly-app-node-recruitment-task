import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const repoFile = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

type Rule = { type: string; parameters?: Record<string, unknown> };
type Ruleset = {
  enforcement: string;
  bypass_actors: unknown[];
  conditions: { ref_name: { include: string[] } };
  rules: Rule[];
};

const ruleset = JSON.parse(repoFile('.github/rulesets/main.json')) as Ruleset;
const rule = (type: string) => ruleset.rules.find((candidate) => candidate.type === type);

describe('main ruleset', () => {
  it('is enforced on the default branch with no bypass', () => {
    expect(ruleset.enforcement).toBe('active');
    expect(ruleset.conditions.ref_name.include).toEqual(['~DEFAULT_BRANCH']);
    expect(ruleset.bypass_actors).toEqual([]);
  });

  it('requires pull requests and blocks force-pushes', () => {
    expect(rule('pull_request')).toBeDefined();
    expect(rule('non_fast_forward')).toBeDefined();
  });

  // 15368 is the GitHub Actions app: a status with the same name from any other actor does not count.
  it('requires the status the Verification Job posts, from GitHub Actions only', () => {
    const workflowContext = repoFile('.github/workflows/test-agent.yml').match(/STATUS_CONTEXT: (\S+)/)?.[1];

    expect(workflowContext).toBeDefined();
    expect(rule('required_status_checks')?.parameters?.required_status_checks).toEqual([{ context: workflowContext, integration_id: 15368 }]);
  });
});
