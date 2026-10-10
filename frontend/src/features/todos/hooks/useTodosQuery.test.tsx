import { renderHook, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { createTestClient, createWrapper } from '../../../test/queryClient'
import { todoFixture } from '../../../test/todoFixture'
import { useTodosQuery } from './useTodosQuery'

function setup(fetch: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('fetch', fetch)
  const client = createTestClient()
  const { result } = renderHook(() => useTodosQuery('all'), {
    wrapper: createWrapper(client),
  })
  return { result, fetch }
}

async function errorFor(response: Response) {
  const { result } = setup(vi.fn().mockResolvedValue(response))
  await waitFor(() => expect(result.current.isError).toBe(true))
  return result.current.error?.message
}

it('loads the tasks from /api/todos as JSON', async () => {
  const { result, fetch } = setup(
    vi.fn().mockResolvedValue(Response.json([todoFixture])),
  )
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(result.current.data).toEqual([todoFixture])
  expect(fetch).toHaveBeenCalledWith(
    '/api/todos',
    expect.objectContaining({
      headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
    }),
  )
})

it('reports a connection error when fetch rejects', async () => {
  const { result } = setup(
    vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
  )
  await waitFor(() => expect(result.current.isError).toBe(true))
  expect(result.current.error?.message).toBe(
    'Cannot connect to the server. Please try again.',
  )
})

it('explains the limits on a 422 response', async () => {
  expect(await errorFor(Response.json({ detail: 'x' }, { status: 422 }))).toBe(
    'Check the task details: title up to 120 characters, description up to 2000 characters, and a valid due date.',
  )
})

it('shows the server detail of a failed response', async () => {
  expect(
    await errorFor(
      Response.json({ detail: 'Database is down.' }, { status: 500 }),
    ),
  ).toBe('Database is down.')
})

it('shows a generic message when the failed response is not JSON', async () => {
  expect(
    await errorFor(new Response('<html>oops</html>', { status: 500 })),
  ).toBe('The operation failed. Please try again.')
})
