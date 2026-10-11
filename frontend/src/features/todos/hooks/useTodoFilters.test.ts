import { renderHook } from '@testing-library/react'
import { expect, it } from 'vitest'
import { useTodoFilters } from './useTodoFilters'

it('starts with all statuses, no search and newest first', () => {
  const { result } = renderHook(() => useTodoFilters())
  expect(result.current.filter).toBe('all')
  expect(result.current.search).toBe('')
  expect(result.current.sort).toBe('newest')
})
