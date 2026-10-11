import { useMutation, useQueryClient } from '@tanstack/react-query'
import { patchTodoLists } from '../api/patchTodoLists'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'

export function useDeleteTodoMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: todoKeys.delete,
    mutationFn: (id: number) => todosApi.remove(id),
    onSuccess: (_, id) =>
      patchTodoLists(queryClient, (todos) =>
        todos.filter((todo) => todo.id !== id),
      ),
  })
}
