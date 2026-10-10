# Taskly App Node

## Setup

```sh
cp .env.example .env
```

## Docker

```sh
docker compose up --build -d --wait
```

Application: http://localhost:8080. API: http://localhost:8000/docs.

```sh
docker compose down
```

## Frontend

React + TypeScript + Vite. Tests: Vitest + React Testing Library.

Installation:

```sh
cd frontend
npm ci
```

Development — http://localhost:5173:

```sh
npm run dev
```

Storybook — http://localhost:6006:

```sh
npm run storybook
```

Tests:

```sh
npm test
```

Coverage — `frontend/coverage/index.html`:

```sh
npm run test:coverage
```

## Backend

Node.js + TypeScript + Express. Database: PostgreSQL + Prisma ORM. Tests: Vitest + Supertest.

Requires Node.js >=22.12 and PostgreSQL.

Installation:

```sh
cd backend
npm ci
```

Database — run from the repository root:

```sh
docker compose up -d --wait postgres
```

Development — http://localhost:8000/docs (from `backend`):

```sh
npm run dev
```

Production:

```sh
npm run build
npm start
```

### Database (Prisma ORM)

Schema — `backend/prisma/schema.prisma`. Connection — root `.env`.

Validate schema:

```sh
npm run db:validate
```

Generate client — also runs during installation and build:

```sh
npm run db:generate
```

Database browser:

```sh
npm run db:studio
```

Schema migrations are managed separately; generating the client does not update the database.

### Tests and coverage

Type check:

```sh
npm run typecheck
```

Tests:

```sh
npm test
```

Watch mode:

```sh
npm run test:watch
```

Coverage — `backend/coverage/index.html`:

```sh
npm run test:coverage
```

## Test Agent tools

TypeScript helpers for the Test Agent PR workflow (`.github/workflows/test-agent.yml`). Tests: Vitest. Node.js >=24 runs the CLIs directly, no build step.

- `classifyChanges` — sorts changed files into Test Agent candidates and Skips, each with a reason; stops for drafts, fork PRs, and the `skip-test-agent` label.
- `parseDecisionLog` — validates the Test Agent's structured output (the Decision Log) against its schema, size limits, and markup rules.
- `renderReport` — renders the sticky PR comment and job summary: verdict, per-file decisions, Suspected Bugs, and collapsible Behaviors and tests, kept under GitHub's comment limit.

Installation:

```sh
cd tools
npm ci
```

Type check and tests:

```sh
npm run typecheck
npm test
```

## End-to-end verification

The `verify` skill (`.claude/skills/verify/SKILL.md`) launches an isolated stack, drives the todos API and UI like a user, and keeps evidence in `.verify/evidence/<run-id>/`. In Claude Code, ask it to verify a todos change. Its helper scripts also run by hand.

The Verification Job runs the skill's `smoke-api.mjs` against the built backend and a Postgres service container, plus the frontend type-check and build. Either failing fails `test-agent/verify`.

## GitHub setup

The workflow's `agent` job needs one repository secret: `ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN`. The repo owner runs the setup wizard once to store it and to apply the `main` ruleset (`.github/rulesets/main.json`: pull requests only, `test-agent/verify` must pass, no force-pushes). Re-running it is safe; it needs `gh` signed in with admin access:

```sh
scripts/setup-github.sh
```
