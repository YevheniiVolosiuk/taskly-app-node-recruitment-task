# The report job runs the PR head's `tools/` with a write token

The `report` job checks out `tools/` from the PR head, renders the report with it, and upserts the sticky comment with a `pull-requests: write` token. A same-repo PR can therefore rewrite `tools/` to forge the report, or to reach that token from a later step. We accept this: a same-repo PR can already edit `.github/workflows/test-agent.yml`, which `pull_request` runs from the PR, so pinning `tools/` to the base branch would not raise the bar. Untrusted code stays out by the rules of ADR 0003: fork PRs never run the Test Agent, and forks and Dependabot get a read-only token, so they get the job summary and no comment.

## Considered Options

- **Run `tools/` from the base branch**: stops a forged report only while the workflow file itself stays trusted, which a same-repo PR can change. A PR that changes `tools/` would also be reported by the old code. Rejected.
- **Render in a read-only job, post from a `workflow_run` job on the default branch**: keeps the write token away from PR code, at the cost of a second workflow and artifact handoff. Deferred, along with ADR 0003's locked-down run, as a production extension.
