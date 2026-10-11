# Solution

A Test Agent runs on every ready-for-review pull request from a branch in this repository. It reads the change, writes behavior-focused unit tests for changed backend and frontend logic, commits them to the PR branch, and reports production bugs it finds as Suspected Bugs instead of committing failing tests. An independent Verification Job, not the agent, decides the PR check. Terms are defined in [GLOSSARY.md](GLOSSARY.md).

## Technical decisions

| Decision | Rationale |
| --- | --- |
| Claude Code in `anthropics/claude-code-action` is the runtime; the agent and skills live in `.claude/` ([ADR 0001](docs/adr/0001-claude-code-action-as-agent-runtime.md)) | The same files drive the agent locally and in CI, so they cannot drift. The action supplies PR context, auth, and GitHub integration. |
| The agent writes only test files; Suspected Bugs are reported, never committed ([ADR 0002](docs/adr/0002-test-agent-writes-only-tests.md)) | A generated test that asserts the current output locks bugs in. A test that fails against wrong code is deleted and reported. |
| No agent run on fork PRs ([ADR 0003](docs/adr/0003-test-agent-skips-fork-prs.md)) | Untrusted code next to a model credential invites prompt injection and secret theft. The plain suites still run. |
| The report job runs the PR head's `tools/` with a write token ([ADR 0004](docs/adr/0004-report-runs-pr-head-tools.md)) | A same-repo PR can already edit the workflow, so pinning `tools/` to the base adds no security. Forks are already excluded. |
| Tests only at agreed Seams ([docs/test-seams.md](docs/test-seams.md)) | Test style stays consistent without a human in the loop. A Behavior with no Seam becomes a Skip, not an invented mock. |
| Changed files are classified by path rules before the agent starts ([docs/skip-rules.md](docs/skip-rules.md)) | Docs, config, lockfiles, types, and test files never reach the model, and every Skip has a reason. |
| Expected values come from a source (PR description, `openapi.json`, docs, glossary), not from running the code | Without a source, a test cannot tell a bug from intended behavior. |
| Deterministic jobs around the model: `validatePatch` before commit, Decision Log schema check, Verification Job on the final commit | Agent output is untrusted. Only test-file paths are applied, and only real suite results set `test-agent/verify`. |

## Running the PR workflow

Prerequisites:

- Admin access to the repository, and `gh` signed in.
- One repository secret, either `ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN`. The workflow uses whichever exists.
- The `main` ruleset ([.github/rulesets/main.json](.github/rulesets/main.json)): pull requests only, `test-agent/verify` must pass, no force-pushes.

Run the setup wizard once from the repo root. It stores the secret, applies the ruleset, and checks that the rules are enforced. Re-running it is safe.

```sh
scripts/setup-github.sh
```

After setup, open a pull request from a branch in this repository. [`.github/workflows/test-agent.yml`](.github/workflows/test-agent.yml) runs these jobs:

1. `pull-request` resolves the live PR head and refuses fork PRs on dispatch.
2. `classify` sorts the `base...head` diff into candidates and Skips. Drafts, forks, and the `skip-test-agent` label stop the agent.
3. `agent` runs the Test Agent (Sonnet, 80-turn cap, 15-minute timeout) with a read-only `GITHUB_TOKEN`, no web or `curl` access, no `git push`, no `gh`, and the model credential scrubbed from test subprocesses. It outputs a test patch and the Decision Log.
4. `apply` validates the patch (test files only) and commits it as `github-actions[bot]` with a `test(agent):` prefix.
5. `baseline` measures coverage at the merge base.
6. `verify` (the Verification Job) runs the full suites with coverage, the tools tests, an API smoke check against Postgres, and the frontend build on the final commit. It posts `test-agent/verify`, then runs StrykerJS on the changed source files as a warning.
7. `report` upserts the sticky PR comment and the job summary.

To re-run, use "Re-run all jobs" or dispatch with the PR number:

```sh
gh workflow run test-agent.yml -f pull-request=<number>
```

**The tooling PR cannot exercise itself.** On pull request events, `claude-code-action` restores `.claude/` and the other agent configuration from the base branch, and the dispatch path does the same restore explicitly. A PR therefore cannot rewrite the rules its own agent follows, which also means the PR that introduces the agent and skills runs with the base branch's copy, where they do not exist yet. The first real PR Run happens on the next PR after the tooling is merged.

## Test Agent and skills

The agent is defined in [`.claude/agents/test-agent.md`](.claude/agents/test-agent.md). The skills are in `.claude/skills/`:

| Skill | Used in a PR Run | Purpose |
| --- | --- | --- |
| [`derive-behaviors`](.claude/skills/derive-behaviors/SKILL.md) | Yes | Derives Behaviors from the PR description and each changed module's public interface, assigns a Seam, or records a Skip. |
| [`write-backend-tests`](.claude/skills/write-backend-tests/SKILL.md) | Yes | Writes Vitest and Supertest tests at the backend Seams (HTTP app factory, repository, validators, config). |
| [`write-frontend-tests`](.claude/skills/write-frontend-tests/SKILL.md) | Yes | Writes Vitest and React Testing Library tests at the frontend Seams (hooks, components, utilities). |
| [`run-and-triage-tests`](.claude/skills/run-and-triage-tests/SKILL.md) | Yes | Runs the tests and triages each failure as test-wrong or Suspected Bug, with at most three attempts per file. |
| [`find-coverage-gaps`](.claude/skills/find-coverage-gaps/SKILL.md) | No, local | Ranks untested logic into a list that the owner approves before a coverage pass. |
| [`verify`](.claude/skills/verify/SKILL.md) | No, local | Launches an isolated stack and drives the API and UI like a user. The Verification Job reuses its `smoke-api.mjs`. |

In a PR Run, the agent takes the candidates from `classify`, runs `derive-behaviors`, then the backend or frontend writing skill for each candidate, then `run-and-triage-tests` on every touched test file. It returns the Decision Log as structured output: one decision, reason, Behaviors, tests, and attempt count per file. The deterministic helpers in `tools/` turn that log into the patch, the status, and the report (see [README.md](README.md#test-agent-tools)).

The same agent and skills run locally in Claude Code, for example to test a branch before opening a PR.

## Example run: the demo PR

[PR #20](https://github.com/YevheniiVolosiuk/taskly-app-node-recruitment-task/pull/20) adds an **Overdue** status filter served by the API. It shipped without behavior tests and with one planted date-boundary bug: a task due today counts as overdue.

Earlier PR Runs on this PR committed tests for the changed logic. For example, [415ff27](https://github.com/YevheniiVolosiuk/taskly-app-node-recruitment-task/commit/415ff27) added 105 lines across the router, validators, repository, `useTodosQuery`, and `TodosPage` tests. The last PR Run found those tests in place, so it committed nothing new.

The [final sticky comment](https://github.com/YevheniiVolosiuk/taskly-app-node-recruitment-task/pull/20#issuecomment-6098374930) ([workflow run](https://github.com/YevheniiVolosiuk/taskly-app-node-recruitment-task/actions/runs/38179435167)) shows:

- **Decisions:** 40 changed files. One `suspected_bug`, 39 Skips: documentation, configuration, lockfile, type-only, test-only, and "already covered" with the covering test cited.
- **Skills used:** on `backend/src/features/todos/repository.ts`, `derive-behaviors` produced the three Behaviors listed in the comment (overdue means due strictly before today), `write-backend-tests` wrote `repository.test.ts > filters the %s list by completion`, and `run-and-triage-tests` classified its failure as a Suspected Bug after one attempt.
- **Suspected Bug:** `list('overdue')` queried `due_date lte today`. The PR description and the frontend `isOverdue` say overdue means before today. The failing assertion (expected `lt: 2026-10-15T00:00:00.000Z`, received `lte`) was reported, and the test was removed.
- **Citation check:** two Skips cited tests that were not in the verified commit, so they were flagged ⚠️ as a warning.
- **Evidence:** `test-agent/verify` succeeded on the PR head. Backend, frontend, tools, API smoke, and build checks passed. `repository.ts` stayed at 100% line and branch coverage. Mutation score was 85.22% for the backend and 86.00% for the frontend, with 52 surviving mutants listed.

## Assumptions

- Same-repo contributors are trusted to run the agent with a model credential. Fork contributors are not.
- PR descriptions state intended behavior well enough to serve as the source of expected values.
- The Seams in `docs/test-seams.md` cover the logic worth testing. Files that `docs/skip-rules.md` classifies as Skips hold no logic that needs tests.

## Limitations

- Fork PRs get the plain suites but no PR Run.
- The agent never edits production code. Suspected Bugs need a human fix.
- Mutation score is reported, not enforced.
- Browser end-to-end checks run only locally through the `verify` skill. CI runs an API smoke check and the frontend build.
- The agent can cite a covering test that does not exist. The citation check flags it but does not fail the PR.
- A subscription OAuth token shares the subscriber's usage limits and expires after a year.
- Each PR Run costs model tokens and up to 15 minutes of agent time.

## Production extensions

- **Fork PR label flow:** a maintainer-applied label triggers a locked-down, comment-only run on fork PRs.
- **Mutation gate:** make a minimum mutation score on changed files part of `test-agent/verify`.
- **OAuth token rotation:** use an API key for shared repos, or rotate `CLAUDE_CODE_OAUTH_TOKEN` on a schedule before it expires.
- **Browser e2e in CI:** run the `verify` skill's Playwright flows against the Compose stack in the Verification Job.
- **Report isolation:** render the report in a read-only job and post it from a `workflow_run` job on the default branch, so the write token never runs next to PR code.
