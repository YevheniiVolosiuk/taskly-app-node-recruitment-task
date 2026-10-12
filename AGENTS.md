# Taskly

Todo app (`backend/`: Express, Prisma, PostgreSQL; `frontend/`: React, Vite) with a **Test Agent**: a GitHub workflow that writes tests for each PR and commits them to the PR branch. `tools/` holds the workflow's TypeScript helpers. Bold terms are defined in `GLOSSARY.md`.

## Pushing to a PR branch

Each push to an open, non-draft PR starts a **PR Run** (`.github/workflows/test-agent.yml`):

1. `classify` sorts changed files into **Candidates** and **Skips** (`docs/skip-rules.md`).
2. The Test Agent (`.claude/agents/test-agent.md`) writes tests only. Source fixes stay with the PR author (ADR 0002).
3. `apply` commits `test(agent): add tests for the changed files` as github-actions[bot] and pushes it to the PR head branch.
4. `verify` posts the required status `test-agent/verify`. `report` updates the sticky PR comment.

After each push:

- `git pull --rebase` before the next push: the branch gains the bot's commit. A push that lands first makes the run's own push fail, and its patch is dropped.
- Read the sticky comment. A **Suspected Bug** is a test that failed against the PR's code: fix the source and push; the next PR Run tests it again.
- Hold the run by keeping the PR in draft or adding the `skip-test-agent` label.
- Rerun on demand: `gh workflow run test-agent.yml -f pull-request=<number>`.

Worked example (PR #32): `SOLUTION.md` § "Example run: the demo PR".

## Conventions

- Commits: Conventional Commits with a scope (`feat(todos)`, `fix(ci)`, `docs:`), body trailer `Refs #<issue>`. Branches: `feat/issue-<n>-<slug>`, `fix/<slug>`.
- Tests: backend in `backend/tests/*.test.ts`; frontend colocated `<Module>.test.tsx`, or `<Module>.seam.test.tsx` when it mocks a module. Seams: `docs/test-seams.md`.
- Logic directories carry 100% per-file coverage thresholds (`backend/vitest.config.ts`, `frontend/vite.config.ts`): new logic ships with its tests.
- After `backend/openapi.json` changes, run `npm --prefix frontend run gen:api`; contract tests fail on drift.
- A todos UI or API change updates the `verify` feature map in `.claude/skills/verify/features/`.
- No root `package.json`: run scripts per package (`npm --prefix backend test`). Local Postgres: `cp .env.example .env`, then `docker compose up -d --wait postgres`.

## Agent skills

### Issue tracker

GitHub Issues (`YevheniiVolosiuk/taskly-app-node-recruitment-task`) via `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `GLOSSARY.md` + `docs/adr/`. See `docs/agents/domain.md`.
