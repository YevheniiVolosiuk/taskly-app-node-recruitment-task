---
name: write-frontend-tests
description: Write Vitest and React Testing Library tests for frontend Behaviors at the agreed seams. Use when adding or updating tests for files under frontend/src/.
---

# Write frontend tests

Input: a Behavior list from `derive-behaviors`, each Behavior tagged with its seam.

## Steps

1. Read the Frontend section of `docs/test-seams.md`, `frontend/src/test/todoFixture.ts`, `frontend/src/lib/http.ts` (what each status turns into), `frontend/src/design-system/mocks.tsx` for a component (the elements your queries match), and the existing test closest to the module. Match their style: a local `setup()` per file, top-level `it`, fixtures before new literals.
2. Pick the file, next to the module: `<Module>.test.tsx` when the test renders JSX (any component, any hook wrapper), otherwise `<Module>.test.ts`. When it exists and has no `vi.mock` besides the design system, update it in place: replace a test whose Behavior changed, add tests for new Behaviors, keep the rest. When it mocks any other module, its mocks would apply to your tests too, so write yours in `<Module>.seam.test.tsx` beside it; the existing file keeps its tests.
3. Write one `it` per Behavior. The title is the Behavior in plain words. The body drives the seam's call and asserts the observable outcome: what the user sees, the hook's returned state, the query cache, the request that reached `fetch`, or a callback prop called. Expected values are literals from the Behavior's source; a value recomputed with the code under test is a tautology that passes over any bug.
4. Fake only what the seam table lists; app hooks, `todosApi`, `request`, and child components run for real. Callback props are `vi.fn()`.

Done when every frontend Behavior has exactly one test, and for each test you can name the defect that would turn it red.

## Fetch

Stub `fetch` in `setup()` with `vi.stubGlobal`; the shared setup file unstubs it after each test. Answer with a real `Response`: `Response.json(body, { status })`, or `new Response(null, { status: 204 })`. For a network failure, `vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))`. Assert the URL, the method, and `JSON.parse` of the body.

Build a new `QueryClient` per test with retries off, as in both examples below, so error Behaviors settle at once and each test starts with an empty cache.

## Hooks seam

`useCreateTodoMutation.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { todoKeys } from '../api/queryKeys'
import type { Todo } from '../types'
import { useCreateTodoMutation } from './useCreateTodoMutation'

function setup(response: Response) {
  const fetch = vi.fn().mockResolvedValue(response)
  vi.stubGlobal('fetch', fetch)
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, fetch, wrapper }
}

it('puts the saved task first in the list', async () => {
  const saved = { ...todoFixture, id: 8, title: 'Write the report' }
  const { client, fetch, wrapper } = setup(Response.json(saved, { status: 201 }))
  client.setQueryData<Todo[]>(todoKeys.list, [todoFixture])
  const { result } = renderHook(() => useCreateTodoMutation(), { wrapper })
  result.current.mutate({ ...todoFixture, title: 'Write the report' })
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(fetch).toHaveBeenCalledWith('/api/todos', expect.objectContaining({ method: 'POST' }))
  expect(client.getQueryData(todoKeys.list)).toEqual([saved, todoFixture])
})
```

A hook with no React Query calls renders without the wrapper.

## Components seam

Render inside `AppProviders` from `src/app/AppProviders.tsx` with the test's `QueryClient`, and swap the design system for its mocks. Drive the component with `userEvent`, query by role and accessible name, and await what appears after a request with `findBy*` or `waitFor`.

`DeleteTodoDialog.seam.test.tsx`, since `DeleteTodoDialog.test.tsx` mocks `useDeleteTodoMutation`:

```tsx
import { QueryClient } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { AppProviders } from '../../../app/AppProviders'
import { todoFixture } from '../../../test/todoFixture'
import { DeleteTodoDialog } from './DeleteTodoDialog'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))

function setup(response: Response) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const onDeleted = vi.fn()
  render(
    <AppProviders client={client}>
      <DeleteTodoDialog todo={todoFixture} busy={false} onClose={vi.fn()} onDeleted={onDeleted} />
    </AppProviders>,
  )
  return { onDeleted, user: userEvent.setup() }
}

it('keeps the dialog open and shows the server message when the delete fails', async () => {
  const { onDeleted, user } = setup(Response.json({ detail: 'Task not found.' }, { status: 404 }))
  await user.click(screen.getByRole('button', { name: 'Delete task' }))
  expect(await screen.findByText('Task not found.')).toBeVisible()
  expect(onDeleted).not.toHaveBeenCalled()
})
```
