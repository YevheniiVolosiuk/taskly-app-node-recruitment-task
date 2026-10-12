# Solution

A Test Agent runs on every ready-for-review pull request from a branch in this repository. It reads the change, writes behavior-focused unit tests for changed backend and frontend logic, commits them to the PR branch, and reports production bugs it finds as Suspected Bugs instead of committing failing tests. An independent Verification Job, not the agent, decides the PR check. Terms are defined in [GLOSSARY.md](GLOSSARY.md).

## Technical decisions

| Decision | Rationale |
| --- | --- |
| Claude Code in `anthropics/claude-code-action` is the runtime; the agent and skills live in `.claude/` ([ADR 0001](docs/adr/0001-claude-code-action-as-agent-runtime.md)) | The same files drive the agent locally and in CI, so they cannot drift. The action supplies PR context, auth, and GitHub integration. |
| The agent writes only test files; Suspected Bugs are reported, never committed ([ADR 0002](docs/adr/0002-test-agent-writes-only-tests.md)) | A generated test that asserts the current output locks bugs in. A test that fails against wrong code is deleted and reported. |
| No agent run on fork PRs ([ADR 0003](docs/adr/0003-test-agent-skips-fork-prs.md)) | Untrusted code next to a model credential invites prompt injection and secret theft. The plain suites still run. |
| The `agent` and `apply` jobs run `tools/` from the base branch; the `report` job runs the PR head's ([ADR 0004](docs/adr/0004-report-runs-pr-head-tools.md)) | The write guard hook and the patch validator follow the same base-branch rules as the agent. For the report, a same-repo PR can already edit the workflow, so pinning its `tools/` adds no security. |
| Tests only at agreed Seams ([docs/test-seams.md](docs/test-seams.md)) | Test style stays consistent without a human in the loop. A Behavior with no Seam becomes a Skip, not an invented mock. |
| Changed files are classified by path rules before the agent starts ([docs/skip-rules.md](docs/skip-rules.md)) | Docs, config, lockfiles, types, and test files never reach the model, and every Skip has a reason. |
| Expected values come from a source (PR description, `openapi.json`, docs, glossary), not from running the code | Without a source, a test cannot tell a bug from intended behavior. |
| Deterministic jobs around the model: `validatePatch` before commit, Decision Log schema check, Verification Job on the final commit | The Decision Log and the patch are untrusted. Only test-file paths are applied, and only real suite results set `test-agent/verify`. |

## Running the PR workflow

Prerequisites:

- Admin access to the repository, and `gh` signed in.
- One repository secret, either `ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN`. The workflow uses whichever exists.
- The `main` ruleset ([.github/rulesets/main.json](.github/rulesets/main.json)): pull requests only, `test-agent/verify` from GitHub Actions must pass, no force-pushes.

Run the setup wizard once from the repo root. It stores the secret, applies the ruleset, and checks that the rules are enforced. Re-running it is safe.

```sh
scripts/setup-github.sh
```

After setup, open a pull request from a branch in this repository. [`.github/workflows/test-agent.yml`](.github/workflows/test-agent.yml) runs these jobs:

1. `pull-request` resolves the live PR head and refuses fork PRs on dispatch.
2. `classify` sorts the `base...head` diff into candidates and Skips. Drafts, forks, and the `skip-test-agent` label stop the agent.
3. `agent` runs the Test Agent (Sonnet, 80-turn cap, 15-minute timeout) with base-branch `.claude/` and `tools/`, a read-only `GITHUB_TOKEN`, no web or `curl` access, no `git push`, no `gh`, and the model credential scrubbed from test subprocesses. It outputs a test patch and the Decision Log.
4. `apply` validates the patch with base-branch `tools/` (test files only) and commits it as `github-actions[bot]` with a `test(agent):` prefix. A patch that only changes blank lines makes no commit.
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

## Why the workflow has its own tooling

The model does one job in a PR Run: it reads the change and writes tests. Everything around it is plain TypeScript in `tools/`, run by ordinary workflow jobs. That is about 1,600 lines in 10 modules and 7 CLI wrappers, with 11 test files. An off-the-shelf action can run the agent, but it cannot decide what the agent may change or check whether its output is true.

What the tooling does that a prompt cannot:

- **Enforces the rules.** `write-guard` blocks agent writes outside test paths, and `validatePatch` applies only test files. A prompt asks the model to keep to the rules. These checks make breaking them impossible.
- **Narrows the input.** `classify` keeps docs, config, lockfiles, and types away from the model. Each run is smaller, and every Skip has a path-rule reason.
- **Checks the output.** The Decision Log schema check, the citation check, and the Verification Job treat the agent's claims as untrusted. `test-agent/verify` comes from real suite results, not from the agent's summary.
- **Measures the result.** Coverage at the merge base and at the verified commit, plus Stryker on the changed files, show whether the new tests catch anything.
- **Repeats exactly.** The same Decision Log and patch give the same commit, status, and report. The tools have their own tests in the Verification Job.

Effects on the project:

- Reviewers read one sticky comment with decisions, Behaviors, tests, and evidence. They do not read the agent transcript.
- A wrong or hostile agent output can at worst add tests that fail verification. It cannot change production code or set the PR status.
- The job that runs the model holds no write token, and the jobs that write run no model.
- The same `.claude/` agent and skills run locally, so prompt changes can be tried before they reach CI.

Costs:

- `tools/` is a second codebase to own, with its own tests and dependencies. `report.ts` alone is over 400 lines.
- The workflow has seven jobs, artifacts passed between them, and two copies of `tools/` (base branch and PR head, [ADR 0004](docs/adr/0004-report-runs-pr-head-tools.md)). That is more to read and debug than one action step.
- A tooling change cannot exercise itself in its own PR (see [Running the PR workflow](#running-the-pr-workflow)), so it needs a follow-up PR to prove it.
- Every guard is one more place where a valid change can be blocked and a rule has to be updated.
- Baseline coverage and mutation testing make a PR Run take minutes longer than the plain suites.

## Coverage pass

The Test Agent added the missing tests through the same skills, run locally: `find-coverage-gaps` ranked the untested logic, the owner approved the list, and the agent wrote tests at the agreed Seams. Per-file coverage thresholds in `backend/vitest.config.ts` and `frontend/vite.config.ts` now fail `test:coverage` if covered logic loses tests.

| Package | Lines | Branches | PR |
| --- | --- | --- | --- |
| backend | 33% → 78% | 33% → 94% | [#17](https://github.com/YevheniiVolosiuk/taskly-app-node-recruitment-task/pull/17) |
| frontend | 47.7% → 97.4% | 43.8% → 92.0% | [#18](https://github.com/YevheniiVolosiuk/taskly-app-node-recruitment-task/pull/18) |

The backend's logic directories (`src/api`, `src/features/todos`, `src/core/config.ts`) are at 100%. The remaining lines are the process entry point (`main.ts`), startup and shutdown (`lifespan.ts`), and the Prisma client setup (`database.ts`), which need a real database rather than a unit-test Seam.

## Example run: the demo PR

[PR #32](https://github.com/YevheniiVolosiuk/taskly-app-node-recruitment-task/pull/32) fixes the overdue boundary, so a task due today is no longer overdue. It also adds a **Due today** status filter, served by the API and offered in the UI. The PR shipped without tests on purpose, and its description states the intended Behaviors.

One [PR Run](https://github.com/YevheniiVolosiuk/taskly-app-node-recruitment-task/actions/runs/38191450173) wrote the tests and committed them as [995a139](https://github.com/YevheniiVolosiuk/taskly-app-node-recruitment-task/commit/995a139) `test(agent): add tests for the changed files`. That commit adds 132 lines across 7 backend and frontend test files. The [sticky comment](https://github.com/YevheniiVolosiuk/taskly-app-node-recruitment-task/pull/32#issuecomment-6116116879) shows:

- **Decisions:** 10 changed files. Five logic files are `tested` or `updated`. Five are Skips: documentation (the `verify` feature maps), configuration (`openapi.json`), and type-only declarations (`api.d.ts`). There are no Suspected Bugs and no citation warnings.
- **Skills used:** the Decision Log records each skill's output.
  - `derive-behaviors` produced two Behaviors for `repository.ts`. Overdue means `due_date lt` today (UTC). Due today means `due_date` equals today (UTC).
  - `write-backend-tests` wrote `repository.test.ts > filters the %s list by the UTC date` and extended the validator and router tests for `due_today`.
  - `write-frontend-tests` wrote `TodoItem.seam.test.tsx`, `TodoFilters.seam.test.tsx`, and `isDueToday` tests in `todos.test.ts`.
  - `run-and-triage-tests` passed every file on the first attempt.
- **Boundary:** the committed tests assert three things. A task due today is not overdue. A task due today is due today. An open task due yesterday is overdue.
- **Evidence:** `test-agent/verify` succeeded on 995a139. The backend, frontend, tools, API smoke, and build checks passed. Line coverage of the changed files held at 100%, and branch coverage of `TodoItem.tsx` rose from 92.9% to 94.4%. The mutation score was 95.65% for the backend and 79.39% for the frontend, with 37 surviving mutants listed.

[PR #20](https://github.com/YevheniiVolosiuk/taskly-app-node-recruitment-task/pull/20) shows the Suspected Bug path. It shipped the Overdue filter with a planted bug: `list('overdue')` queried `due_date lte today`. Its [PR Run](https://github.com/YevheniiVolosiuk/taskly-app-node-recruitment-task/actions/runs/38179435167) wrote a test from the PR description, saw it fail against the code, and [reported it](https://github.com/YevheniiVolosiuk/taskly-app-node-recruitment-task/pull/20#issuecomment-6098374930) as a Suspected Bug instead of committing it. PR #32 fixes that bug.

## Assumptions

- Same-repo contributors are trusted to run the agent with a model credential. Fork contributors are not.
- PR descriptions state intended behavior well enough to serve as the source of expected values.
- The Seams in `docs/test-seams.md` cover the logic worth testing. Files that `docs/skip-rules.md` classifies as Skips hold no logic that needs tests.

## Limitations

- Fork and Dependabot PRs get the plain suites but no PR Run, and cannot post `test-agent/verify`. To merge one, a maintainer pushes it to a branch in this repository.
- A same-repo PR's workflow file and dependency installs run on the same runner as the agent step. Trust in same-repo authors ([ADR 0003](docs/adr/0003-test-agent-skips-fork-prs.md)) covers this.
- The `agent` job lifts the runner's AppArmor limit on unprivileged user namespaces, so Claude Code's bubblewrap sandbox can isolate test subprocesses from the model credential.
- The agent never edits production code. Suspected Bugs need a human fix.
- Mutation score is reported, not enforced.
- Browser end-to-end checks run only locally through the `verify` skill. CI runs an API smoke check and the frontend build.
- The agent can cite a covering test that does not exist, although `derive-behaviors` has it copy the path from a Grep result. The citation check flags it but does not fail the PR.
- A subscription OAuth token shares the subscriber's usage limits and expires after a year.
- Each PR Run costs model tokens and up to 15 minutes of agent time.

## Production extensions

- **Fork PR label flow:** a maintainer-applied label triggers a locked-down, comment-only run on fork PRs.
- **Mutation gate:** make a minimum mutation score on changed files part of `test-agent/verify`.
- **OAuth token rotation:** use an API key for shared repos, or rotate `CLAUDE_CODE_OAUTH_TOKEN` on a schedule before it expires.
- **Browser e2e in CI:** run the `verify` skill's Playwright flows against the Compose stack in the Verification Job.
- **Report isolation:** render the report in a read-only job and post it from a `workflow_run` job on the default branch, so the write token never runs next to PR code.
