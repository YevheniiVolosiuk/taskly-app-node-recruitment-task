import { describe, expect, it } from 'vitest';
import { parseDecisionLog } from '../src/decision-log.ts';

const healthEntry = {
  path: 'backend/src/api/health.ts',
  decision: 'suspected_bug',
  reason:
    'GET /api/health returned 200 when the database query rejected; openapi.json expects 500. Assertion: expected 500, received 200.',
  behaviors: ['when GET /api/health and the database answers, 200 {"status":"ok"}'],
  tests: ['backend/tests/health.test.ts > reports ok when the database answers'],
  attempts: 2,
};

const validLog = {
  summary: 'Added 3 tests for the health endpoint; 1 Suspected Bug.',
  files: [healthEntry],
};

function withEntry(overrides: Record<string, unknown>): string {
  return JSON.stringify({ ...validLog, files: [{ ...healthEntry, ...overrides }] });
}

describe('parseDecisionLog', () => {
  it('returns the Decision Log for well-formed input', () => {
    expect(parseDecisionLog(JSON.stringify(validLog))).toEqual({ ok: true, log: validLog });
  });

  it.each(['tested', 'updated', 'skipped', 'suspected_bug'])('accepts the %s decision', (decision) => {
    expect(parseDecisionLog(withEntry({ decision }))).toMatchObject({ ok: true });
  });

  it('accepts comparison signs in Behaviors and test names', () => {
    const input = withEntry({
      behaviors: ['when the title is longer than 200 characters (length > 200), 400'],
      tests: ['backend/tests/todos.test.ts > rejects titles > 200 characters'],
    });

    expect(parseDecisionLog(input)).toMatchObject({ ok: true });
  });

  it.each([
    ['not JSON', '{"summary": "x", '],
    ['not an object', '[]'],
    ['missing the summary', JSON.stringify({ files: [] })],
    ['missing files', JSON.stringify({ summary: 'x' })],
    ['an unknown top-level key', JSON.stringify({ ...validLog, verdict: 'pass' })],
    ['an unknown file key', withEntry({ coverage: 100 })],
    ['an unknown decision', withEntry({ decision: 'pending' })],
    ['a non-string reason', withEntry({ reason: 42 })],
    ['a non-array of Behaviors', withEntry({ behaviors: 'returns 200' })],
    ['a non-string test', withEntry({ tests: [{ name: 'x' }] })],
    ['fractional attempts', withEntry({ attempts: 1.5 })],
    ['more than three attempts', withEntry({ attempts: 4 })],
    ['negative attempts', withEntry({ attempts: -1 })],
    ['an empty path', withEntry({ path: '' })],
    ['the same path twice', JSON.stringify({ ...validLog, files: [healthEntry, healthEntry] })],
  ])('rejects input with %s', (_case, input) => {
    expect(parseDecisionLog(input)).toMatchObject({ ok: false });
  });

  it.each([
    ['the whole input', JSON.stringify({ ...validLog, summary: 'x'.repeat(200_000) })],
    ['the summary', JSON.stringify({ ...validLog, summary: 'x'.repeat(301) })],
    ['a reason', withEntry({ reason: 'x'.repeat(601) })],
    ['a Behavior', withEntry({ behaviors: ['x'.repeat(201)] })],
    ['the number of Behaviors', withEntry({ behaviors: Array.from({ length: 11 }, (_, i) => `b${i}`) })],
    ['the number of tests', withEntry({ tests: Array.from({ length: 21 }, (_, i) => `t${i}`) })],
    [
      'the number of files',
      JSON.stringify({ ...validLog, files: Array.from({ length: 101 }, (_, i) => ({ ...healthEntry, path: `f${i}.ts` })) }),
    ],
  ])('rejects input when %s is oversized', (_case, input) => {
    expect(parseDecisionLog(input)).toMatchObject({ ok: false });
  });

  it.each([
    ['an HTML tag', withEntry({ reason: 'fails <img src=x onerror=alert(1)>' })],
    ['an HTML comment faking the report marker', JSON.stringify({ ...validLog, summary: '<!-- test-agent-report -->' })],
    ['a closing tag that ends a collapsed section', withEntry({ reason: '</details> returns 200' })],
    ['a markdown link', withEntry({ reason: 'see [the spec](https://evil.example)' })],
    ['a markdown image', JSON.stringify({ ...validLog, summary: '![x](data:image/png;base64,AAAA)' })],
    ['a bare URL', withEntry({ reason: 'details at https://evil.example/login' })],
    ['a www link', withEntry({ reason: 'details at www.evil.example' })],
    ['an @mention', JSON.stringify({ ...validLog, summary: 'cc @octocat' })],
    ['a line break that starts a new table row', withEntry({ reason: 'ok\n| injected | row |' })],
    ['a line break in a Behavior', withEntry({ behaviors: ['returns 200\n</details>'] })],
    ['a delete character in a test name', withEntry({ tests: ['lists todos\u007f'] })],
    ['a bidirectional override in a path', withEntry({ path: 'backend/src/\u202estt.ts' })],
    ['a bidirectional isolate in a test name', withEntry({ tests: ['lists \u2066todos'] })],
  ])('rejects %s', (_case, input) => {
    expect(parseDecisionLog(input)).toMatchObject({ ok: false });
  });

  it('accepts markup in paths, Behaviors, and tests, which the report renders as code', () => {
    const input = withEntry({
      path: 'backend/src/@scope/<id>.ts',
      behaviors: ['resolves Promise<void> and redirects to http://localhost/'],
      tests: ['backend/tests/x.test.ts > emails [admin](mailto:a@b.c)'],
    });

    expect(parseDecisionLog(input)).toMatchObject({ ok: true });
  });

  it('names the offending field without echoing the untrusted text', () => {
    const result = parseDecisionLog(withEntry({ reason: 'fails <script>steal()</script>' }));

    expect(result).toEqual({ ok: false, error: expect.stringContaining('files[0].reason') });
    expect(JSON.stringify(result)).not.toContain('steal');
  });
});
