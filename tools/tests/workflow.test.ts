import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { verificationChecks } from '../src/report.ts';

const workflow = readFileSync(new URL('../../.github/workflows/test-agent.yml', import.meta.url), 'utf8');
const stepNames = new Map([...workflow.matchAll(/- name: (.+)\n\s+id: (\S+)/g)].map(([, name, id]) => [id, name]));

describe('the Verification Job', () => {
  it.each(Object.entries(verificationChecks))('has a %s step named as the report names it', (id, name) => {
    expect(stepNames.get(id)).toBe(name);
  });
});
