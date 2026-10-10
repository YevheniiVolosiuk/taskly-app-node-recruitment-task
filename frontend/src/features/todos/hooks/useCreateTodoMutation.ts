import { useMutation, useQueryClient } from '@tanstack/react-query'
import { patchTodoLists } from '../api/patchTodoLists'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import type { TodoInput } from '../types'

export function useCreateTodoMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: todoKeys.create,
    mutationFn: (input: TodoInput) => todosApi.create(input),
    onSuccess: (saved) =>
      patchTodoLists(
        queryClient,
        (todos) => [saved, ...todos.filter((todo) => todo.id !== saved.id)],
        todoKeys.list('all'),
      ),
  })
}
