---
name: run-and-triage-tests
description: Run newly written or updated tests and triage each failure as test-wrong or Suspected Bug. Use after writing tests, before reporting results.
---

# Run and triage tests

A failing test means one of two things. **Test-wrong**: the test contradicts its own Behavior or seam (bad import, wrong fake shape, wrong fixture literal, missing `await`, type error). **Suspected Bug**: the test states its Behavior faithfully, with the expected value from the Behavior's source, and the code produces something else.

## Steps

1. Run only the touched files, plus the typecheck for backend:
   - `npm --prefix backend test -- tests/<file>.test.ts`
   - `backend/node_modules/.bin/tsc -p backend`
   - `npm --prefix frontend test -- <path relative to frontend/>`
2. Classify each failure. Re-read the Behavior's source before deciding; when the source supports the expected value, it is a Suspected Bug.
3. Fix each test-wrong failure by bringing the test back in line with its Behavior, then re-run. Each run of a file counts as one **attempt**; a file gets at most three.
4. For each Suspected Bug, record the file under test, the Behavior, its source, and the failing assertion (expected and received). Then delete that `it` from the test file: the change keeps only passing tests.
5. After the third attempt, delete every test still failing as test-wrong and record it as a Skip: `could not write a passing test in 3 attempts: <error>`.
6. When a file's tests cannot run at all (command refused, runner crash), delete the file's new tests and record a Skip: `tests could not run: <error>`.

Done when every touched test file passes on its last run and every deleted test is recorded as a Suspected Bug or a Skip.

## Guardrails

A fix makes the test truer to its Behavior; assertions stay as strict as the Behavior demands. The edit that turns a test green is never one of these: changing an expected value to the received one without a source that backs it, `.skip`, `.todo`, `.fails`, swapping a literal for `expect.anything()` or a looser matcher, deleting an assertion while keeping the test, or editing production code.
