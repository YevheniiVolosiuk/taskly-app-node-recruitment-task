import { renderHook, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { createTestClient, createWrapper } from '../../../test/queryClient'
import { todoFixture } from '../../../test/todoFixture'
import { todoKeys } from '../api/queryKeys'
import type { Todo } from '../types'
import { useDeleteTodoMutation } from './useDeleteTodoMutation'

it('deletes the task on the server and removes it from the list', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
  vi.stubGlobal('fetch', fetch)
  const client = createTestClient()
  const other = { ...todoFixture, id: 8 }
  client.setQueryData<Todo[]>(todoKeys.list, [todoFixture, other])
  const { result } = renderHook(() => useDeleteTodoMutation(), {
    wrapper: createWrapper(client),
  })
  result.current.mutate(7)
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(fetch).toHaveBeenCalledWith(
    '/api/todos/7',
    expect.objectContaining({ method: 'DELETE' }),
  )
  expect(client.getQueryData(todoKeys.list)).toEqual([other])
})
