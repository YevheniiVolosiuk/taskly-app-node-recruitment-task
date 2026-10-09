# Claude Code via claude-code-action as the agent runtime

The Test Agent runs as Claude Code inside `anthropics/claude-code-action`, with the agent defined in `.claude/agents/` and its skills in `.claude/skills/`. The same files drive the agent locally (adding missing tests to the existing codebase) and in CI (PR Runs), so the skills are reused rather than duplicated. The action also supplies PR context, auth, and GitHub integration, which keeps our effort on the agent, skills, and workflow.

## Considered Options

- **Claude Agent SDK runner**: more programmatic control, but we would rebuild PR context, auth, and tool plumbing, and the local and CI paths would diverge.
- **Other agents (Copilot coding agent, Codex)**: less control over custom agent and skill definitions.
