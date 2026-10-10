---
name: find-coverage-gaps
description: Coverage gaps: rank a package's untested logic into a recommendation list the owner approves before tests are written. Use when finding untested code or planning a coverage pass.
---

# Find coverage gaps

A **gap** is a decision the code makes (a branch, an error path, a status code, a returned value) that no test runs. Each gap becomes an untested **Behavior** at a **Seam** (see `GLOSSARY.md`), so the owner approves scope in Behaviors, not line counts.

## Steps

1. Run coverage for each package in scope. The flag keeps the reports when a threshold fails:
   - `npm --prefix backend run test:coverage -- --coverage.reportOnFailure`
   - `npm --prefix frontend run test:coverage -- --coverage.reportOnFailure`

   Done when `<package>/coverage/coverage-summary.json` and `<package>/coverage/lcov.info` are fresh.
2. Keep only logic files under 100%. The logic policy is the Skip rules in `tools/src/classify.ts`: a path matching one is not logic (generated, type-only, style, render-only design-system component, barrel, entry point, constants) and goes under **Out of scope** with its reason. Files the package's coverage config excludes stay unlisted.
3. For each logic file, read its uncovered lines (`DA:<line>,0` and `BRDA:` records ending in `0` or `-` in `lcov.info`) and write each gap as a Behavior: `when <input or action>, <observable outcome>`. Take the expected outcome from `backend/openapi.json`, `docs/`, or a neighbouring test; the code body shows only _where_ the gap is.
4. Tag each Behavior with its seam from `docs/test-seams.md`. A file whose gaps have no listed seam goes under **No seam** as `no agreed seam: <what is missing>`.
5. Rank the recommendations, highest first; within a rank, more uncovered branches first:
   1. Failure paths a user hits: 500s, rejected input, missing config.
   2. Branches that choose between outcomes: status codes, defaults, fallbacks.
   3. Happy paths of untested modules.

Done when every logic file under 100% appears exactly once: under **Recommendations**, **No seam**, or **Out of scope**.

## Approval gate

The list is this skill's only output. Present it and ask the owner which recommendations to approve. Approved items then go through `derive-behaviors`, the package's `write-*-tests` skill, and `run-and-triage-tests`.

```
## Recommendations (backend)

1. backend/src/factory.ts (lines 0%, branches 0%). seam: HTTP
   - when a route throws, 500 {"detail":"Internal Server Error"}
   - when the body is malformed JSON, 422 {"detail":"Invalid JSON."}
2. backend/src/core/config.ts (lines 0%, branches 0%). seam: Config
   - when DATABASE_URL is unset and POSTGRES_HOST is missing, throws "Missing environment variable: POSTGRES_HOST"

## No seam

- backend/src/core/lifespan.ts: no agreed seam: server start-up and signal handling

## Out of scope

- backend/src/main.ts: entry point
```
