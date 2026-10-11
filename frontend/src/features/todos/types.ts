import type { components, paths } from '../../generated/api'

export type Todo = components['schemas']['Todo']
export type TodoInput = Omit<Todo, 'id' | 'created_at' | 'updated_at'>
export type Priority = Todo['priority']
export type TodoStatus = NonNullable<
  NonNullable<paths['/api/todos']['get']['parameters']['query']>['status']
>
export type Filter = 'all' | TodoStatus
export type Sort = 'newest' | 'priority' | 'due'
