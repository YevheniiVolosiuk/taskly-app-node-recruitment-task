import { renderHook, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { createTestClient, createWrapper } from '../../../test/queryClient'
import { todoFixture } from '../../../test/todoFixture'
import { todoKeys } from '../api/queryKeys'
import type { Todo } from '../types'
import { useUpdateTodoMutation } from './useUpdateTodoMutation'

it('patches only writable fields and replaces the cached task with the response', async () => {
  const saved = { ...todoFixture, title: 'Renamed', completed: true }
  const fetch = vi.fn().mockResolvedValue(Response.json(saved))
  vi.stubGlobal('fetch', fetch)
  const client = createTestClient()
  const other = { ...todoFixture, id: 8 }
  client.setQueryData<Todo[]>(todoKeys.list, [todoFixture, other])
  const { result } = renderHook(() => useUpdateTodoMutation(), {
    wrapper: createWrapper(client),
  })
  result.current.mutate({
    id: 7,
    input: { ...todoFixture, title: 'Renamed', completed: true },
  })
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  const [url, init] = fetch.mock.calls[0]
  expect(url).toBe('/api/todos/7')
  expect(init.method).toBe('PATCH')
  expect(JSON.parse(init.body)).toEqual({
    title: 'Renamed',
    description: '',
    priority: 'medium',
    due_date: null,
    completed: true,
  })
  expect(client.getQueryData(todoKeys.list)).toEqual([saved, other])
})
