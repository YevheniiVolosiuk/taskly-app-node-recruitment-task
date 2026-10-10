import type { QueryClient, QueryKey } from '@tanstack/react-query'
import type { Todo } from '../types'
import { todoKeys } from './queryKeys'

export async function patchTodoLists(
  queryClient: QueryClient,
  patch: (todos: Todo[]) => Todo[],
  queryKey: QueryKey = todoKeys.allLists,
) {
  // Stop an older refetch from overwriting the confirmed server response.
  await queryClient.cancelQueries({ queryKey: todoKeys.allLists })
  queryClient.setQueriesData<Todo[]>(
    { queryKey },
    (current) => current && patch(current),
  )
  // The server decides which lists hold the task, so refetch all of them.
  void queryClient.invalidateQueries({ queryKey: todoKeys.allLists })
}
