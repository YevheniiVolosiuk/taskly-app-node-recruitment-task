import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatDate, isOverdue, selectTodos, validateTodo } from './todos'
import type { Todo } from '../types'

const base: Todo = {
  id: 1,
  title: 'Sprint plan',
  description: '',
  priority: 'medium',
  completed: false,
  due_date: null,
  created_at: '2026-10-01T12:00:00Z',
  updated_at: '2026-10-01T12:00:00Z',
}

const input = {
  title: 'Task',
  description: '',
  priority: 'medium' as const,
  due_date: null,
  completed: false,
}

describe('selectTodos', () => {
  it('matches a case-insensitive search in the description', () => {
    const matching = { ...base, description: 'Discuss the API' }
    const todos = [matching, { ...base, id: 3 }]
    expect(selectTodos(todos, ' api ', 'newest')).toEqual([matching])
  })

  it('sorts by priority without changing the source array', () => {
    const high: Todo = { ...base, id: 2, priority: 'high' }
    const todos = [base, high]
    expect(selectTodos(todos, '', 'priority')).toEqual([high, base])
    expect(todos).toEqual([base, high])
  })

  it('sorts by due date ascending, undated last, ties by id descending', () => {
    const a = { ...base, id: 1, due_date: '2026-12-01' }
    const b = { ...base, id: 2, due_date: '2026-11-01' }
    const c = { ...base, id: 3, due_date: '2026-12-01' }
    const d = { ...base, id: 4, due_date: null }
    expect(selectTodos([a, d, b, c], '', 'due')).toEqual([b, c, a, d])
  })

  it('sorts newest first by creation time, ties by id descending', () => {
    const old = { ...base, id: 1, created_at: '2026-09-01T12:00:00Z' }
    const tieLow = { ...base, id: 2 }
    const tieHigh = { ...base, id: 3 }
    expect(selectTodos([old, tieLow, tieHigh], '', 'newest')).toEqual([
      tieHigh,
      tieLow,
      old,
    ])
  })
})

describe('validateTodo', () => {
  it('rejects a title over 120 characters after trimming', () => {
    expect(validateTodo({ ...input, title: 'a'.repeat(121) }).title).toBe(
      'The title must be at most 120 characters.',
    )
    expect(
      validateTodo({ ...input, title: ` ${'a'.repeat(120)} ` }).title,
    ).toBeUndefined()
  })

  it('rejects a description over 2000 characters', () => {
    expect(
      validateTodo({ ...input, description: 'a'.repeat(2001) }).description,
    ).toBe('The description must be at most 2000 characters.')
  })

  it('rejects a badly formatted or impossible due date', () => {
    expect(validateTodo({ ...input, due_date: '05/03/2026' }).due_date).toBe(
      'Enter a valid date.',
    )
    expect(validateTodo({ ...input, due_date: '2026-02-30' }).due_date).toBe(
      'Enter a valid date.',
    )
  })

  it('accepts a valid due date', () => {
    expect(
      validateTodo({ ...input, due_date: '2026-02-28' }).due_date,
    ).toBeUndefined()
  })
})

describe('isOverdue', () => {
  afterEach(() => vi.useRealTimers())

  function at(date: string) {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(`${date}T12:00:00`))
  }

  it('is true for an open task with a past due date', () => {
    at('2026-10-10')
    expect(isOverdue({ ...base, due_date: '2026-10-09' })).toBe(true)
  })

  it('is false for a completed task', () => {
    at('2026-10-10')
    expect(
      isOverdue({ ...base, due_date: '2026-10-09', completed: true }),
    ).toBe(false)
  })

  it('is false without a due date', () => {
    at('2026-10-10')
    expect(isOverdue(base)).toBe(false)
  })

  it('is false when due today', () => {
    at('2026-10-10')
    expect(isOverdue({ ...base, due_date: '2026-10-10' })).toBe(false)
  })
})

describe('formatDate', () => {
  it('formats a date as day, short month and year', () => {
    expect(formatDate('2026-03-05')).toBe('5 Mar 2026')
  })
})
