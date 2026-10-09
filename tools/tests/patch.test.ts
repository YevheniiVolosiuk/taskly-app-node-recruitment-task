import { describe, expect, it } from 'vitest';
import { validatePatch } from '../src/patch.ts';

const newTest = [
  'diff --git a/backend/tests/health.test.ts b/backend/tests/health.test.ts',
  'new file mode 100644',
  'index 0000000..5cd551c',
  '--- /dev/null',
  '+++ b/backend/tests/health.test.ts',
  '@@ -0,0 +1,2 @@',
  "+import { it } from 'vitest';",
  "+it('reports ok', () => {});",
];

const editedFrontendTest = [
  'diff --git a/frontend/src/features/todos/hooks/useTodos.test.ts b/frontend/src/features/todos/hooks/useTodos.test.ts',
  'index 422c2b7..9d1f0e3 100644',
  '--- a/frontend/src/features/todos/hooks/useTodos.test.ts',
  '+++ b/frontend/src/features/todos/hooks/useTodos.test.ts',
  '@@ -1,3 +1,3 @@ describe',
  " import { it } from 'vitest';",
  '-it.skip(1);',
  '+it(1);',
  ' ',
  '\\ No newline at end of file',
];

function patch(...sections: string[][]): string {
  return `${sections.flat().join('\n')}\n`;
}

function edit(path: string, hunk: string[] = ['@@ -1 +1 @@', '-a', '+b']): string[] {
  return [`diff --git a/${path} b/${path}`, 'index 422c2b7..9d1f0e3 100644', `--- a/${path}`, `+++ b/${path}`, ...hunk];
}

describe('validatePatch', () => {
  it('accepts new and edited test files and lists their paths', () => {
    expect(validatePatch(patch(newTest, editedFrontendTest))).toEqual({
      ok: true,
      paths: ['backend/tests/health.test.ts', 'frontend/src/features/todos/hooks/useTodos.test.ts'],
    });
  });

  it('accepts an empty patch with no paths', () => {
    expect(validatePatch('')).toEqual({ ok: true, paths: [] });
  });

  it('accepts deleting a test file', () => {
    const deletion = [
      'diff --git a/backend/tests/old.test.ts b/backend/tests/old.test.ts',
      'deleted file mode 100644',
      'index 422c2b7..0000000',
      '--- a/backend/tests/old.test.ts',
      '+++ /dev/null',
      '@@ -1,2 +0,0 @@',
      '-a',
      '-b',
    ];

    expect(validatePatch(patch(deletion))).toEqual({ ok: true, paths: ['backend/tests/old.test.ts'] });
  });

  it('accepts renaming one test file to another', () => {
    const rename = [
      'diff --git a/backend/tests/a.test.ts b/backend/tests/b.test.ts',
      'similarity index 100%',
      'rename from backend/tests/a.test.ts',
      'rename to backend/tests/b.test.ts',
    ];

    expect(validatePatch(patch(rename))).toEqual({
      ok: true,
      paths: ['backend/tests/a.test.ts', 'backend/tests/b.test.ts'],
    });
  });

  it('accepts hunk lines that look like patch headers', () => {
    const hunk = ['@@ -1,2 +1,2 @@', '--- a/backend/src/app.ts', '-diff --git a/x b/x', '++++ b/backend/src/app.ts', '+rename to x'];

    expect(validatePatch(patch(edit('backend/tests/fixture.ts', hunk)))).toEqual({
      ok: true,
      paths: ['backend/tests/fixture.ts'],
    });
  });

  it.each([
    'backend/src/app.ts',
    'backend/package.json',
    'backend/tests/setup.ts',
    'frontend/src/App.tsx',
    'frontend/vitest.config.ts',
    '.github/workflows/test-agent.yml',
    'tools/src/patch.ts',
  ])('rejects an edit to %s', (path) => {
    expect(validatePatch(patch(newTest, edit(path)))).toEqual({
      ok: false,
      rejected: [{ path, reason: 'not a test path' }],
    });
  });

  it('rejects deleting a non-test file', () => {
    const deletion = [
      'diff --git a/backend/src/app.ts b/backend/src/app.ts',
      'deleted file mode 100644',
      'index 422c2b7..0000000',
      '--- a/backend/src/app.ts',
      '+++ /dev/null',
      '@@ -1 +0,0 @@',
      '-a',
    ];

    expect(validatePatch(patch(deletion))).toEqual({
      ok: false,
      rejected: [{ path: 'backend/src/app.ts', reason: 'not a test path' }],
    });
  });

  it('rejects renaming a test file into a non-test path', () => {
    const rename = [
      'diff --git a/backend/tests/a.test.ts b/backend/src/a.ts',
      'similarity index 100%',
      'rename from backend/tests/a.test.ts',
      'rename to backend/src/a.ts',
    ];

    expect(validatePatch(patch(rename))).toEqual({
      ok: false,
      rejected: [{ path: 'backend/src/a.ts', reason: 'not a test path' }],
    });
  });

  it('rejects renaming a non-test file into a test path, which deletes it', () => {
    const rename = [
      'diff --git a/backend/src/app.ts b/backend/tests/app.ts',
      'similarity index 100%',
      'rename from backend/src/app.ts',
      'rename to backend/tests/app.ts',
    ];

    expect(validatePatch(patch(rename))).toEqual({
      ok: false,
      rejected: [{ path: 'backend/src/app.ts', reason: 'not a test path' }],
    });
  });

  it('rejects a rename line that disagrees with a test-path header', () => {
    const rename = [
      'diff --git a/backend/tests/a.test.ts b/backend/tests/b.test.ts',
      'similarity index 100%',
      'rename from backend/src/app.ts',
      'rename to backend/tests/b.test.ts',
    ];

    expect(validatePatch(patch(rename))).toEqual({
      ok: false,
      rejected: [{ path: 'backend/src/app.ts', reason: 'not a test path' }],
    });
  });

  it('rejects ---/+++ lines that disagree with a test-path header', () => {
    const section = [
      'diff --git a/backend/tests/a.test.ts b/backend/tests/a.test.ts',
      'index 422c2b7..9d1f0e3 100644',
      '--- a/backend/src/app.ts',
      '+++ b/backend/src/app.ts',
      '@@ -1 +1 @@',
      '-a',
      '+b',
    ];

    expect(validatePatch(patch(section))).toEqual({
      ok: false,
      rejected: [{ path: 'backend/src/app.ts', reason: 'not a test path' }],
    });
  });

  it.each([
    'backend/tests/../src/app.ts',
    'backend/tests/../../.github/workflows/test-agent.yml',
    '../backend/tests/a.test.ts',
    '/backend/tests/a.test.ts',
  ])('rejects the path traversal %s', (path) => {
    expect(validatePatch(patch(edit(path)))).toEqual({
      ok: false,
      rejected: [{ path, reason: 'not a test path' }],
    });
  });

  it('rejects a symlink in a test directory', () => {
    const symlink = [
      'diff --git a/backend/tests/link.ts b/backend/tests/link.ts',
      'new file mode 120000',
      'index 0000000..5cd551c',
      '--- /dev/null',
      '+++ b/backend/tests/link.ts',
      '@@ -0,0 +1 @@',
      '+../src/app.ts',
      '\\ No newline at end of file',
    ];

    expect(validatePatch(patch(symlink))).toEqual({
      ok: false,
      rejected: [{ path: 'backend/tests/link.ts', reason: 'symlink' }],
    });
  });

  it('rejects turning a test file into a symlink', () => {
    const modeChange = [
      'diff --git a/backend/tests/fixture.ts b/backend/tests/fixture.ts',
      'old mode 100644',
      'new mode 120000',
    ];

    expect(validatePatch(patch(modeChange))).toEqual({
      ok: false,
      rejected: [{ path: 'backend/tests/fixture.ts', reason: 'symlink' }],
    });
  });

  it.each([
    ['an executable', 'new file mode 100755', 'file mode 100755'],
    ['a submodule', 'new file mode 160000', 'file mode 160000'],
  ])('rejects %s', (_kind, modeLine, reason) => {
    const section = ['diff --git a/backend/tests/x.test.ts b/backend/tests/x.test.ts', modeLine, 'index 0000000..5cd551c'];

    expect(validatePatch(patch(section))).toEqual({
      ok: false,
      rejected: [{ path: 'backend/tests/x.test.ts', reason }],
    });
  });

  it('rejects a git binary patch and keeps checking the files after it', () => {
    const binary = [
      'diff --git a/backend/tests/data.test.ts b/backend/tests/data.test.ts',
      'new file mode 100644',
      'index 0000000000000000000000000000000000000000..bdc955b7b2e610ad5a72302b139a2e6cb325519a',
      'GIT binary patch',
      'literal 2',
      'JcmZQz1ONa700IC2',
      '',
      'literal 0',
      'HcmV?d00001',
      '',
    ];

    expect(validatePatch(patch(binary, edit('backend/src/app.ts')))).toEqual({
      ok: false,
      rejected: [
        { path: 'backend/tests/data.test.ts', reason: 'binary change' },
        { path: 'backend/src/app.ts', reason: 'not a test path' },
      ],
    });
  });

  it('rejects a binary change without data', () => {
    const binary = [
      'diff --git a/backend/tests/data.test.ts b/backend/tests/data.test.ts',
      'index 422c2b7..9d1f0e3 100644',
      'Binary files a/backend/tests/data.test.ts and b/backend/tests/data.test.ts differ',
    ];

    expect(validatePatch(patch(binary))).toEqual({
      ok: false,
      rejected: [{ path: 'backend/tests/data.test.ts', reason: 'binary change' }],
    });
  });

  it('rejects a traditional diff smuggled after a test-file hunk', () => {
    const smuggled = ['--- a/backend/src/app.ts', '+++ b/backend/src/app.ts', '@@ -1 +1 @@', '-a', '+b'];

    expect(validatePatch(patch(newTest, smuggled))).toEqual({
      ok: false,
      rejected: [{ path: '--- a/backend/src/app.ts', reason: 'not a git diff line' }],
    });
  });

  it('rejects text before the first file', () => {
    expect(validatePatch(patch(['Subject: tests'], newTest))).toEqual({
      ok: false,
      rejected: [{ path: 'Subject: tests', reason: 'not a git diff line' }],
    });
  });

  it('rejects a hunk longer than its header says', () => {
    const hunk = ['@@ -1 +1 @@', '-a', '+b', '+c'];

    expect(validatePatch(patch(edit('backend/tests/a.test.ts', hunk)))).toEqual({
      ok: false,
      rejected: [{ path: '+c', reason: 'not a git diff line' }],
    });
  });

  it('rejects a hunk that removes more lines than its header says', () => {
    const hunk = ['@@ -1 +1 @@', '-a', '-b', '+c'];

    expect(validatePatch(patch(edit('backend/tests/a.test.ts', hunk)))).toEqual({
      ok: false,
      rejected: [{ path: '-b', reason: 'not a git diff line' }],
    });
  });

  it('rejects more than one no-newline marker after a hunk', () => {
    const hunk = ['@@ -1 +1 @@', '-a', '+b', '\\ No newline at end of file', '\\ No newline at end of file'];

    expect(validatePatch(patch(edit('backend/tests/a.test.ts', hunk)))).toEqual({
      ok: false,
      rejected: [{ path: '\\ No newline at end of file', reason: 'not a git diff line' }],
    });
  });

  it('rejects a hunk cut short', () => {
    const hunk = ['@@ -1,2 +1,2 @@', '-a', '+b'];

    expect(validatePatch(patch(edit('backend/tests/a.test.ts', hunk)))).toEqual({
      ok: false,
      rejected: [{ path: 'backend/tests/a.test.ts', reason: 'hunk is cut short' }],
    });
  });

  it('rejects quoted paths, which git uses for unusual characters', () => {
    const quoted = ['diff --git "a/backend/tests/a\\tb.test.ts" "b/backend/tests/a\\tb.test.ts"', 'new file mode 100644'];

    expect(validatePatch(patch(quoted))).toEqual({
      ok: false,
      rejected: [{ path: quoted[0], reason: 'not a git diff line' }],
    });
  });
});
