import { describe, expect, it } from 'vitest';
import { checkToolUse } from '../src/write-guard.ts';

const projectDir = '/repo';

function writeInput(filePath: string, overrides: Record<string, unknown> = {}) {
  return {
    hook_event_name: 'PreToolUse',
    tool_name: 'Write',
    tool_input: { file_path: filePath, content: 'x' },
    cwd: projectDir,
    agent_type: 'test-agent',
    ...overrides,
  };
}

describe('checkToolUse', () => {
  it.each([
    '/repo/backend/tests/health.test.ts',
    '/repo/backend/tests/features/todos/router.test.ts',
    '/repo/backend/tests/fixture.ts',
    '/repo/frontend/src/features/todos/hooks/useTodos.test.ts',
    '/repo/frontend/src/features/todos/components/TodoItem.test.tsx',
    '/repo/frontend/src/features/todos/TodosPage.seam.test.tsx',
    '/repo/frontend/src/test/todoFixture.ts',
  ])('allows the Test Agent to write test file %s', (filePath) => {
    expect(checkToolUse(writeInput(filePath), projectDir)).toEqual({ decision: 'allow' });
  });

  it.each(['Edit', 'MultiEdit'])('allows %s on a test file', (toolName) => {
    const input = writeInput('/repo/backend/tests/router.test.ts', { tool_name: toolName });

    expect(checkToolUse(input, projectDir)).toEqual({ decision: 'allow' });
  });

  it('resolves relative paths against the hook cwd', () => {
    const input = writeInput('tests/health.test.ts', { cwd: '/repo/backend' });

    expect(checkToolUse(input, projectDir)).toEqual({ decision: 'allow' });
  });

  it.each([
    ['production backend code', '/repo/backend/src/features/todos/repository.ts'],
    ['production frontend code', '/repo/frontend/src/features/todos/hooks/useTodos.ts'],
    ['a test-named file in backend source', '/repo/backend/src/features/todos/repository.test.ts'],
    ['tools source', '/repo/tools/src/write-guard.ts'],
    ['tools tests', '/repo/tools/tests/write-guard.test.ts'],
    ['the vitest config', '/repo/backend/vitest.config.ts'],
    ['a config file inside the test directory', '/repo/backend/tests/vitest.config.ts'],
    ['the frontend test setup', '/repo/frontend/src/test/setup.ts'],
    ['a package manifest', '/repo/backend/package.json'],
    ['a dotfile inside the test directory', '/repo/backend/tests/.env'],
    ['the workflow', '/repo/.github/workflows/test-agent.yml'],
    ['project settings', '/repo/.claude/settings.json'],
    ['the agent definition', '/repo/.claude/agents/test-agent.md'],
    ['a skill definition', '/repo/.claude/skills/write-backend-tests/SKILL.md'],
    ['the seams document', '/repo/docs/test-seams.md'],
    ['a type declaration in the test directory', '/repo/backend/tests/globals.d.ts'],
  ])('denies the Test Agent writing %s', (_label, filePath) => {
    expect(checkToolUse(writeInput(filePath), projectDir)).toEqual({
      decision: 'deny',
      reason: expect.stringContaining('only write test files'),
    });
  });

  it.each([
    '/repo/backend/tests/../src/factory.ts',
    'backend/tests/../../outside.test.ts',
    '/etc/backend/tests/router.test.ts',
    '/repo-evil/backend/tests/router.test.ts',
  ])('denies path traversal outside test paths: %s', (filePath) => {
    expect(checkToolUse(writeInput(filePath), projectDir)).toMatchObject({ decision: 'deny' });
  });

  it('denies relative traversal from a test directory cwd', () => {
    const input = writeInput('../src/factory.ts', { cwd: '/repo/backend/tests' });

    expect(checkToolUse(input, projectDir)).toMatchObject({ decision: 'deny' });
  });

  it('denies NotebookEdit outside test paths', () => {
    const input = writeInput('', { tool_name: 'NotebookEdit', tool_input: { notebook_path: '/repo/notes.ipynb' } });

    expect(checkToolUse(input, projectDir)).toMatchObject({ decision: 'deny' });
  });

  it.each([
    ['no path', { tool_name: 'Write', tool_input: {}, agent_type: 'test-agent' }],
    ['a non-string path', { tool_name: 'Write', tool_input: { file_path: 42 }, agent_type: 'test-agent' }],
    ['no tool input', { tool_name: 'Edit', agent_type: 'test-agent' }],
    ['not an object', 'Write backend/tests/x.test.ts'],
    ['null', null],
  ])('denies malformed hook input with %s', (_label, input) => {
    expect(checkToolUse(input, projectDir)).toMatchObject({ decision: 'deny' });
  });

  it('allows tools that do not write files', () => {
    const input = { tool_name: 'Read', tool_input: { file_path: '/repo/backend/src/factory.ts' }, agent_type: 'test-agent' };

    expect(checkToolUse(input, projectDir)).toEqual({ decision: 'allow' });
  });

  it.each([
    ['the main session', undefined],
    ['another subagent', 'Explore'],
  ])('leaves writes from %s to the normal permission flow', (_label, agentType) => {
    const input = writeInput('/repo/backend/src/factory.ts', { agent_type: agentType });

    expect(checkToolUse(input, projectDir)).toEqual({ decision: 'allow' });
  });
});
