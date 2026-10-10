# Todos API

The todos API serves the UI's data over JSON: a health check that touches the database, and create, list, read, update, and delete for tasks with validation.

## Sub-features

- `api-health` answers `{"status":"ok"}` only when the database is reachable.
- `api-crud` creates (201), lists, reads, patches, and deletes (204) a task. Reading a deleted task returns 404.
- `api-validate` rejects invalid input with 422 and a `detail` array.

## How to get to it (user POV)

- HTTP on `$WEB/api/...` through the UI's proxy, the same path the browser uses.
- HTTP on `$API/api/...` directly, to separate proxy problems from API problems.

## Driving it with curl

Preconditions:

- Baseline state from the [map README](./README.md). No browser is needed.

- **Full pass.** Run `node .claude/skills/verify/scripts/smoke-api.mjs "$WEB" "$EVIDENCE/todos-api.smoke.txt"`. It prints each request and response and ends with `smoke-api: PASS`. It removes the task it created.
- **Health.** Run `curl -s "$WEB/api/health"`. Output is `{"status":"ok"}`.
- **Validation.** Run `curl -s -w ' %{http_code}' -X POST -H 'Content-Type: application/json' -d '{"title":""}' "$WEB/api/todos"`. The status is `422` and the body lists a `too_small` issue on `title`.
- **Proof.** The smoke transcript in the evidence directory, plus any `curl` output saved next to it.

## Gotchas

- The Verification Job runs the same `smoke-api.mjs` against the backend alone (no UI proxy), so a proxy-only failure shows up locally but not in CI.
- `PATCH` with an empty body is a 422: at least one field is required.
