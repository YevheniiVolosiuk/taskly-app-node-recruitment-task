---
name: write-backend-tests
description: Write Vitest and Supertest tests for backend Behaviors at the agreed seams. Use when adding or updating tests for files under backend/src/.
---

# Write backend tests

Input: a Behavior list from `derive-behaviors`, each Behavior tagged with its seam.

## Steps

1. Read the Backend section of `docs/test-seams.md`, `backend/tests/fixture.ts`, and the existing test closest to the seam: `router.test.ts` (HTTP), `repository.test.ts`, `validators.test.ts`, `mappers.test.ts`. Match their style: a local `setup()` per file, top-level `it`, imports with the `.ts` extension, fixtures before new literals.
2. Pick the file: `backend/tests/<module>.test.ts`, named after the module under test (`health.test.ts`, `config.test.ts`, `app.test.ts` for `factory.ts`). When the file exists, update it in place: replace a test whose Behavior changed, add tests for new Behaviors, keep the rest.
3. Write one `it` per Behavior. The title is the Behavior in plain words. The body drives the seam's call and asserts the observable outcome: status and body, return value, or the call reaching the fake. Expected values are literals from the Behavior's source; a value recomputed with the code under test is a tautology that passes over any bug.
4. Fake only what the seam table lists, and only the members the test reaches.

Done when every backend Behavior has exactly one test, and for each test you can name the defect that would turn it red.

## HTTP seam

```ts
import request from 'supertest';
import { expect, it, vi } from 'vitest';
import { createApp } from '../src/factory.ts';
import type { Database } from '../src/features/todos/types.ts';

function setup(todo: Record<string, unknown> = {}) {
  const database = { todo: { findFirst: vi.fn().mockResolvedValue({ id: 1 }), ...todo } } as unknown as Database;
  return { app: createApp(database), database };
}

it('reports ok when the database answers', async () => {
  const response = await request(setup().app).get('/api/health');
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ status: 'ok' });
});
```

A Behavior that ends in the 500 handler logs through `console.error`: silence it in that test with `vi.spyOn(console, 'error').mockImplementation(() => {})` and assert the response.

## Config seam

Stub each variable with `vi.stubEnv`, including `vi.stubEnv('DATABASE_URL', '')` when the test needs it unset, and call `vi.unstubAllEnvs()` in `afterEach`.
