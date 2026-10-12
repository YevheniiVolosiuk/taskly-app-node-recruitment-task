# The report job runs the PR head's `tools/`; the agent and apply jobs run the base branch's

The `report` job checks out `tools/` from the PR head, renders the report with it, and upserts the sticky comment with a `pull-requests: write` token. A same-repo PR can therefore rewrite `tools/` to forge the report, or to reach that token from a later step. We accept this: a same-repo PR can already edit `.github/workflows/test-agent.yml`, which `pull_request` runs from the PR, so pinning the report's `tools/` to the base branch would not raise the bar. Untrusted code stays out by the rules of ADR 0003: fork PRs never run the Test Agent, and forks and Dependabot get a read-only token, so they get the job summary and no comment.

The `agent` and `apply` jobs run `tools/` from the base branch. The agent's configuration in `.claude/` already comes from the base branch, and the write guard hook it names lives in `tools/`, so the hook must come from the same place. In `apply`, `validatePatch` decides what the `contents: write` token pushes, so it follows the same rules as the agent that produced the patch.

## Considered Options

- **Run the report's `tools/` from the base branch**: stops a forged report only while the workflow file itself stays trusted, which a same-repo PR can change. A PR that changes `tools/` would also be reported by the old code. Rejected.
- **Run the agent's write guard and the patch validator from the PR head**: a PR could disable the guard while the agent runs under the base branch's rules. Rejected.
- **Render in a read-only job, post from a `workflow_run` job on the default branch**: keeps the write token away from PR code, at the cost of a second workflow and artifact handoff. Deferred, along with ADR 0003's locked-down run, as a production extension.
