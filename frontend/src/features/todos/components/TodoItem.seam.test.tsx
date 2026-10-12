import { render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { AppProviders } from '../../../app/AppProviders'
import { todoFixture } from '../../../test/todoFixture'
import { TodoItem } from './TodoItem'

afterEach(() => vi.useRealTimers())

function setup(due_date: string | null, completed = false) {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-12T12:00:00'))
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <AppProviders client={client}>
      <ul>
        <TodoItem
          todo={{ ...todoFixture, due_date, completed }}
          busy={false}
          onEdit={vi.fn()}
          onToggle={vi.fn()}
          onDelete={vi.fn()}
        />
      </ul>
    </AppProviders>,
  )
}

it('labels an open task due today as due today', () => {
  setup('2026-10-12')
  expect(screen.getByText(/· due today/)).toBeVisible()
  expect(screen.queryByText(/· overdue/)).not.toBeInTheDocument()
})

it('labels an open task due yesterday as overdue', () => {
  setup('2026-10-11')
  expect(screen.getByText(/· overdue/)).toBeVisible()
  expect(screen.queryByText(/· due today/)).not.toBeInTheDocument()
})

it('adds no suffix to a task due later', () => {
  setup('2030-01-01')
  expect(screen.queryByText(/· overdue/)).not.toBeInTheDocument()
  expect(screen.queryByText(/· due today/)).not.toBeInTheDocument()
})

it('adds no suffix to a completed task due today', () => {
  setup('2026-10-12', true)
  expect(screen.queryByText(/· due today/)).not.toBeInTheDocument()
})
