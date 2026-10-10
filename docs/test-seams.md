# Test seams

The agreed places where tests touch the app. The Test Agent writes tests only at a seam listed here. A Behavior with no listed seam is a Skip with reason `no agreed seam: <what is missing>`, not a new seam.

A seam names the public interface the test calls and the one thing it may fake. Everything behind the seam runs for real.

## Backend (`backend/`)

Tests live in `backend/tests/`, run by Vitest. Shared literals live in `backend/tests/fixture.ts` (`record` is a database row, `todo` is the API shape).

| Seam | Call | Fake |
| --- | --- | --- |
| HTTP | Supertest on `createApp(database)` from `src/factory.ts` | `database`: an object with only the `todo` delegate methods the request reaches, as `vi.fn()`, cast to `Database` |
| Repository | `new TodoRepository(database)` from `src/features/todos/repository.ts` | `database.todo` delegate methods, via `vi.spyOn` or `vi.fn()` |
| Validators | Zod schemas from `src/features/todos/validators.ts`, via `safeParse` | none |
| Mappers | `fromModel` from `src/features/todos/mappers.ts` | none |
| Config | `resolveDatabaseUrl` from `src/core/config.ts` | environment, via `vi.stubEnv` and `vi.unstubAllEnvs` |

HTTP is the seam for routing, status codes, error handling (unknown routes, malformed JSON, oversized bodies, thrown errors), and the health endpoint. The existing `tests/router.test.ts` mounts the router on a bare Express app; new HTTP tests go through `createApp` so the real middleware and error handler run.

## Frontend (`frontend/`)

Tests sit next to the file they cover as `<Module>.test.ts` or `<Module>.test.tsx`, run by Vitest with jsdom. When that file mocks a module, new tests go in `<Module>.seam.test.tsx` beside it, out of reach of those mocks. Shared literals live in `frontend/src/test/`.

| Seam | Call | Fake |
| --- | --- | --- |
| Hooks | `renderHook` with a new `QueryClient` in a `QueryClientProvider` wrapper | `fetch`, via `vi.stubGlobal` |
| Components | React Testing Library render inside `AppProviders` with a new `QueryClient`, driven by `user-event` | `fetch`, via `vi.stubGlobal` |
| Pure utilities | direct call | none |
