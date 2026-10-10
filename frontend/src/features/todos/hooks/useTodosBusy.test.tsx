import { renderHook, waitFor } from '@testing-library/react'
import { act } from 'react'
import { expect, it, vi } from 'vitest'
import { createTestClient, createWrapper } from '../../../test/queryClient'
import { todoFixture } from '../../../test/todoFixture'
import { useCreateTodoMutation } from './useCreateTodoMutation'
import { useDeleteTodoMutation } from './useDeleteTodoMutation'
import { useTodosBusy } from './useTodosBusy'
import { useUpdateTodoMutation } from './useUpdateTodoMutation'

function useMutations() {
  return {
    busy: useTodosBusy(),
    create: useCreateTodoMutation(),
    update: useUpdateTodoMutation(),
    remove: useDeleteTodoMutation(),
  }
}

type Mutations = ReturnType<typeof useMutations>

it.each<[string, (mutations: Mutations) => void, Response]>([
  [
    'create',
    ({ create }) => create.mutate(todoFixture),
    Response.json(todoFixture, { status: 201 }),
  ],
  [
    'update',
    ({ update }) =>
      update.mutate({ id: todoFixture.id, input: { completed: true } }),
    Response.json(todoFixture),
  ],
  [
    'delete',
    ({ remove }) => remove.mutate(todoFixture.id),
    new Response(null, { status: 204 }),
  ],
])('is busy only while a %s is in flight', async (_, start, response) => {
  let respond: (response: Response) => void = () => {}
  vi.stubGlobal(
    'fetch',
    vi.fn().mockReturnValue(
      new Promise<Response>((resolve) => {
        respond = resolve
      }),
    ),
  )
  const { result } = renderHook(useMutations, {
    wrapper: createWrapper(createTestClient()),
  })
  expect(result.current.busy).toBe(false)
  act(() => start(result.current))
  await waitFor(() => expect(result.current.busy).toBe(true))
  await act(async () => respond(response))
  await waitFor(() => expect(result.current.busy).toBe(false))
})
