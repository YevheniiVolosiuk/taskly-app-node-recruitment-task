import { posix } from 'node:path';

export type ToolUseDecision = { decision: 'allow' } | { decision: 'deny'; reason: string };

const TEST_AGENT = 'test-agent';

const writeTools = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

// A path segment without dots keeps out dotfiles, `*.config.ts`, and `*.d.ts`.
const testPathPatterns: readonly RegExp[] = [
  /^backend\/tests\/([\w-]+\/)*[\w-]+(\.test)?\.ts$/,
  /^frontend\/src\/([\w-]+\/)*[\w-]+\.test\.tsx?$/,
  /^frontend\/src\/test\/([\w-]+\/)*[\w-]+\.tsx?$/,
];

// Loaded by the test runner for every test, so editing it changes what all tests mean.
const setupFile = /(^|\/)setup\.tsx?$/;

function isTestPath(path: string): boolean {
  return testPathPatterns.some((pattern) => pattern.test(path)) && !setupFile.test(path);
}

function deny(reason: string): ToolUseDecision {
  return { decision: 'deny', reason: `The Test Agent may only write test files (see docs/test-seams.md): ${reason}` };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// Decides a PreToolUse hook call. Only the Test Agent is guarded; other sessions keep the normal permission flow.
export function checkToolUse(hookInput: unknown, projectDir: string): ToolUseDecision {
  if (!isRecord(hookInput)) return deny('hook input is not an object');
  if (hookInput.agent_type !== TEST_AGENT) return { decision: 'allow' };
  if (typeof hookInput.tool_name !== 'string' || !writeTools.has(hookInput.tool_name)) return { decision: 'allow' };

  const toolInput = isRecord(hookInput.tool_input) ? hookInput.tool_input : {};
  const filePath = toolInput.file_path ?? toolInput.notebook_path;
  if (typeof filePath !== 'string' || filePath === '') return deny('no file path in tool input');

  const cwd = typeof hookInput.cwd === 'string' ? hookInput.cwd : projectDir;
  const relative = posix.relative(projectDir, posix.resolve(cwd, filePath));
  if (relative.startsWith('..') || posix.isAbsolute(relative)) return deny(`${filePath} is outside the project`);
  if (!isTestPath(relative)) return deny(`${relative} is not a test path`);

  return { decision: 'allow' };
}
