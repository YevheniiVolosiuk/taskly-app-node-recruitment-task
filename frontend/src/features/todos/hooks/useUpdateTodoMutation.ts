import { useMutation, useQueryClient } from '@tanstack/react-query'
import { patchTodoLists } from '../api/patchTodoLists'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import type { TodoInput } from '../types'

export function useUpdateTodoMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: todoKeys.update,
    mutationFn: ({ id, input }: { id: number; input: Partial<TodoInput> }) =>
      todosApi.update(id, input),
    onSuccess: (saved) =>
      patchTodoLists(queryClient, (todos) =>
        todos.map((todo) => (todo.id === saved.id ? saved : todo)),
      ),
  })
}
