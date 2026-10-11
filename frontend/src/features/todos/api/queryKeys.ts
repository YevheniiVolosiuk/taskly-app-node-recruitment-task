import type { Filter } from '../types'

export const todoKeys = {
  all: ['todos'] as const,
  allLists: ['todos', 'list'] as const,
  list: (filter: Filter) => ['todos', 'list', filter] as const,
  create: ['todos', 'create'] as const,
  update: ['todos', 'update'] as const,
  delete: ['todos', 'delete'] as const,
}
