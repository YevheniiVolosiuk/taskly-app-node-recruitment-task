import { renderHook, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { createTestClient, createWrapper } from '../../../test/queryClient'
import { todoFixture } from '../../../test/todoFixture'
import { todoKeys } from '../api/queryKeys'
import type { Todo } from '../types'
import { useCreateTodoMutation } from './useCreateTodoMutation'

async function create(saved: Todo, cached?: Todo[]) {
  const fetch = vi.fn().mockResolvedValue(Response.json(saved, { status: 201 }))
  vi.stubGlobal('fetch', fetch)
  const client = createTestClient()
  if (cached) client.setQueryData<Todo[]>(todoKeys.list, cached)
  const { result } = renderHook(() => useCreateTodoMutation(), {
    wrapper: createWrapper(client),
  })
  result.current.mutate(todoFixture)
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(fetch).toHaveBeenCalledWith(
    '/api/todos',
    expect.objectContaining({ method: 'POST' }),
  )
  return client.getQueryData(todoKeys.list)
}

it('puts the saved task first in the list', async () => {
  const saved = { ...todoFixture, id: 8, title: 'Write the report' }
  expect(await create(saved, [todoFixture])).toEqual([saved, todoFixture])
})

it('does not duplicate a cached task with the same id', async () => {
  const saved = { ...todoFixture, id: 8, title: 'Fresh' }
  const stale = { ...todoFixture, id: 8, title: 'Stale' }
  expect(await create(saved, [todoFixture, stale])).toEqual([
    saved,
    todoFixture,
  ])
})

it('creates the list when the cache is empty', async () => {
  expect(await create(todoFixture)).toEqual([todoFixture])
})
