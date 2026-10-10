import { act, renderHook } from '@testing-library/react'
import { expect, it } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { useTodoFilters } from './useTodoFilters'

const older = {
  ...todoFixture,
  id: 1,
  title: 'Buy milk',
  created_at: '2026-09-01T12:00:00Z',
}
const done = { ...todoFixture, id: 2, title: 'Pay rent', completed: true }
const todos = [older, done]

it('starts with all statuses, no search and newest first', () => {
  const { result } = renderHook(() => useTodoFilters(todos))
  expect(result.current.filter).toBe('all')
  expect(result.current.search).toBe('')
  expect(result.current.sort).toBe('newest')
  expect(result.current.visible.map((t) => t.id)).toEqual([2, 1])
})

it('recomputes the visible tasks when the filter changes', () => {
  const { result } = renderHook(() => useTodoFilters(todos))
  act(() => result.current.setFilter('completed'))
  expect(result.current.visible.map((t) => t.id)).toEqual([2])
})

it('recomputes the visible tasks when the search changes', () => {
  const { result } = renderHook(() => useTodoFilters(todos))
  act(() => result.current.setSearch('milk'))
  expect(result.current.visible.map((t) => t.id)).toEqual([1])
})

it('recomputes the visible tasks when the sort changes', () => {
  const withDue = [
    { ...older, due_date: '2026-12-01' },
    { ...done, due_date: '2026-11-01' },
  ]
  const { result } = renderHook(() => useTodoFilters(withDue))
  act(() => result.current.setSort('due'))
  expect(result.current.visible.map((t) => t.id)).toEqual([2, 1])
})
