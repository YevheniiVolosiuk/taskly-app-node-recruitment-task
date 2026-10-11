import { describe, expect, it } from 'vitest';
import { citesTest, findMissingCitations } from '../src/citation.ts';
import type { FileLog } from '../src/decision-log.ts';

const source = `import { describe, expect, it } from 'vitest';

describe('todos router', () => {
  it('lists every todo', async () => {
    expect(await list()).toEqual([]);
  });

  it("doesn't list deleted todos", () => {});
  test.only('creates a todo', () => {});
  it.each(['open', 'done'])('accepts list status %s', () => {});
  it.each([{ status: 'open' }])('filters by $status', () => {});
  describe.skipIf(ci)('when offline', () => {});
  it(\`rejects a title over \${max} characters\`, () => {});
  it.each\`
    status
    \${'open'}
  \`('filters a table by $status', () => {});
  it('builds a title ' + suffix, () => {});
});

const fixture = { name: 'a helper string' };
render(screen.getByText('Save'));
`;

describe('citesTest', () => {
  it.each([
    'todos router',
    'lists every todo',
    "doesn't list deleted todos",
    'creates a todo',
    'accepts list status %s',
    'filters by $status',
    'when offline',
    'rejects a title over ${max} characters',
    'filters a table by $status',
  ])('finds the title %j as written in the source', (title) => {
    expect(citesTest(source, title)).toBe(true);
  });

  it.each([
    'mutation hook tests',
    'lists every',
    'accepts list status open',
    'a helper string',
    'Save',
    'todos router > lists every todo',
    'builds a title ',
  ])('does not find %j, which is not a test or describe title', (title) => {
    expect(citesTest(source, title)).toBe(false);
  });

  describe('in a source with comments, regular expressions, and escapes', () => {
    const tricky = String.raw`
// it('commented out', () => {});
/* describe('block commented', () => {
  it('inside a block comment', () => {});
}); */
expect(text).toMatch(/don't (stop/);
it('after a regular expression', () => {});
it.each(['(', ')('])('handles bracket %s', () => {});
it('line one\nline two', () => {});
it('caf\u00e9 menu', () => {});
it.skip('skipped test', () => {});
it.todo('todo test');
it.skip.each([1])('skipped table %s', () => {});
describe.skip('skipped group', () => {
  it('inside a skipped group', () => {});
});
describe('running group', () => {
  it('inside a running group', () => {});
});
`;

    it.each([
      'after a regular expression',
      'handles bracket %s',
      String.raw`line one\nline two`,
      'café menu',
      String.raw`caf\u00e9 menu`,
      'inside a running group',
    ])('finds %j', (title) => {
      expect(citesTest(tricky, title)).toBe(true);
    });

    it.each([
      'commented out',
      'block commented',
      'inside a block comment',
      'skipped test',
      'todo test',
      'skipped table %s',
      'skipped group',
      'inside a skipped group',
    ])('does not find %j, which no run executes', (title) => {
      expect(citesTest(tricky, title)).toBe(false);
    });
  });

  it('finds a title written with escaped quotes', () => {
    expect(citesTest(`it('doesn\\'t crash', () => {});`, "doesn't crash")).toBe(true);
  });
});

describe('findMissingCitations', () => {
  const testFile = 'backend/tests/todos.test.ts';
  const read = (path: string) => (path === testFile ? source : null);

  function skip(path: string, reason: string): FileLog {
    return { path, decision: 'skipped', reason, behaviors: [], tests: [], attempts: 0 };
  }

  it('names the Skipped files whose cited test file or title is not found', () => {
    const files = [
      skip('backend/src/a.ts', `already covered: ${testFile} > lists every todo`),
      skip('backend/src/b.ts', `already covered: ${testFile} > filter state tests`),
      skip('backend/src/c.ts', 'already covered: backend/tests/missing.test.ts > lists every todo'),
      skip('backend/src/d.ts', 'no behavior change: renamed a variable'),
    ];

    expect(findMissingCitations(files, read)).toEqual(new Set(['backend/src/b.ts', 'backend/src/c.ts']));
  });

  it('checks only Skips', () => {
    const tested: FileLog = { ...skip('backend/src/a.ts', `already covered: ${testFile} > nothing`), decision: 'tested' };

    expect(findMissingCitations([tested], read)).toEqual(new Set());
  });
});
