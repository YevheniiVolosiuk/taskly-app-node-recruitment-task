import { describe, expect, it } from 'vitest';
import { classifyChanges } from '../src/classify.ts';

const openPr = { labels: [], draft: false, isFork: false };

describe('classifyChanges', () => {
  it('lists backend logic files as candidates', () => {
    const result = classifyChanges(['backend/src/features/todos/repository.ts'], openPr);

    expect(result.stop).toBeNull();
    expect(result.files).toEqual([
      { path: 'backend/src/features/todos/repository.ts', decision: 'candidate', reason: 'Backend logic' },
    ]);
  });

  it('lists frontend logic files as candidates', () => {
    const result = classifyChanges(
      ['frontend/src/features/todos/hooks/useTodos.ts', 'frontend/src/features/todos/components/TodoItem.tsx'],
      openPr,
    );

    expect(result.files).toEqual([
      { path: 'frontend/src/features/todos/hooks/useTodos.ts', decision: 'candidate', reason: 'Frontend logic' },
      { path: 'frontend/src/features/todos/components/TodoItem.tsx', decision: 'candidate', reason: 'Frontend logic' },
    ]);
  });

  it.each([
    ['README.md', 'docs', 'Documentation'],
    ['docs/adr/0001-claude-code-action-as-agent-runtime.md', 'docs', 'Documentation'],
    ['backend/package-lock.json', 'lockfile', 'Lockfile'],
    ['frontend/yarn.lock', 'lockfile', 'Lockfile'],
    ['pnpm-lock.yaml', 'lockfile', 'Lockfile'],
    ['backend/src/generated/prisma/client.ts', 'generated', 'Generated code'],
    ['backend/prisma/migrations/20260101000000_init/migration.sql', 'migration', 'Database schema or migration'],
    ['backend/prisma/schema.prisma', 'migration', 'Database schema or migration'],
    ['backend/package.json', 'config', 'Configuration'],
    ['frontend/tsconfig.app.json', 'config', 'Configuration'],
    ['backend/vitest.config.ts', 'config', 'Configuration'],
    ['frontend/vite.config.ts', 'config', 'Configuration'],
    ['frontend/.storybook/preview.tsx', 'config', 'Configuration'],
    ['.github/workflows/test-agent.yml', 'config', 'Configuration'],
    ['compose.yaml', 'config', 'Configuration'],
    ['backend/Dockerfile', 'config', 'Configuration'],
    ['.env.example', 'config', 'Configuration'],
    ['.gitignore', 'config', 'Configuration'],
    ['backend/src/features/todos/types.ts', 'type-only', 'Type-only declarations'],
    ['frontend/src/design-system/Button/Button.types.ts', 'type-only', 'Type-only declarations'],
    ['frontend/src/design-system/theme/styled.d.ts', 'type-only', 'Type-only declarations'],
    ['frontend/src/styles.css', 'style', 'Styles only'],
    ['frontend/src/features/todos/components/TodoItem.styles.ts', 'style', 'Styles only'],
    ['frontend/src/design-system/theme/theme.ts', 'style', 'Styles only'],
    ['backend/tests/router.test.ts', 'test', 'Test-only change'],
    ['backend/tests/fixture.ts', 'test', 'Test-only change'],
    ['frontend/src/hooks/useNotice.test.ts', 'test', 'Test-only change'],
    ['frontend/src/features/todos/TodosPage.test.tsx', 'test', 'Test-only change'],
    ['frontend/src/test/todoFixture.ts', 'test', 'Test-only change'],
    ['frontend/src/design-system/Button/Button.tsx', 'non-logic', 'Design-system render-only component'],
    ['frontend/src/design-system/Button/Button.variants.ts', 'non-logic', 'Design-system render-only component'],
    ['frontend/src/design-system/Button/Button.stories.tsx', 'non-logic', 'Storybook story'],
    ['frontend/src/features/todos/index.ts', 'non-logic', 'Barrel re-export'],
    ['backend/src/main.ts', 'non-logic', 'Entry point'],
    ['frontend/src/main.tsx', 'non-logic', 'Entry point'],
    ['frontend/src/features/todos/constants.ts', 'non-logic', 'Constants'],
    ['frontend/src/features/todos/filters.constants.ts', 'non-logic', 'Constants'],
    ['tools/src/classify.ts', 'not-source', 'Not app source code'],
    ['frontend/public/favicon.svg', 'not-source', 'Not app source code'],
    ['frontend/src/assets/logo.svg', 'not-source', 'Not app source code'],
  ])('skips %s as %s', (path, category, reason) => {
    const result = classifyChanges([path], openPr);

    expect(result.files).toEqual([{ path, decision: 'skip', category, reason }]);
  });
});

describe('classifyChanges stops', () => {
  const files = ['backend/src/features/todos/repository.ts'];

  it('stops for fork pull requests', () => {
    const result = classifyChanges(files, { ...openPr, isFork: true });

    expect(result.stop).toEqual({ reason: 'fork', message: 'pull request is from a fork' });
  });

  it('stops when the skip-test-agent label is set', () => {
    const result = classifyChanges(files, { ...openPr, labels: ['bug', 'skip-test-agent'] });

    expect(result.stop).toEqual({ reason: 'label', message: 'the `skip-test-agent` label is set' });
  });

  it('stops for draft pull requests', () => {
    const result = classifyChanges(files, { ...openPr, draft: true });

    expect(result.stop).toEqual({ reason: 'draft', message: 'pull request is a draft' });
  });

  it('reports the fork stop ahead of label and draft', () => {
    const result = classifyChanges(files, { labels: ['skip-test-agent'], draft: true, isFork: true });

    expect(result.stop?.reason).toBe('fork');
  });

  it('still classifies files when stopped', () => {
    const result = classifyChanges(files, { ...openPr, draft: true });

    expect(result.files).toEqual([
      { path: 'backend/src/features/todos/repository.ts', decision: 'candidate', reason: 'Backend logic' },
    ]);
  });

  it('does not stop for other labels', () => {
    const result = classifyChanges(files, { ...openPr, labels: ['skip-tests', 'test-agent'] });

    expect(result.stop).toBeNull();
  });
});
