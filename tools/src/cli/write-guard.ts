// Usage: PreToolUse hook command `node tools/src/cli/write-guard.ts`, hook input JSON on stdin.
// Prints a deny decision for Claude Code; an allow prints nothing and leaves the normal permission flow.
// Any failure exits 2, which blocks the tool call; other exit codes would let it through.
import { readFileSync } from 'node:fs';
import { checkToolUse } from '../write-guard.ts';

try {
  const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
  const result = checkToolUse(JSON.parse(readFileSync(0, 'utf8')), projectDir);
  if (result.decision === 'deny') {
    console.log(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: result.reason,
        },
      }),
    );
  }
} catch (error) {
  console.error(`write-guard: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
}
