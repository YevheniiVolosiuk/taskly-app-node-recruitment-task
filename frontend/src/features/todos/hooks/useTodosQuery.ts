import { useQuery } from '@tanstack/react-query'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import type { Filter } from '../types'

export function useTodosQuery(filter: Filter) {
  return useQuery({
    queryKey: todoKeys.list(filter),
    queryFn: ({ signal }) => todosApi.list(filter, signal),
  })
}
