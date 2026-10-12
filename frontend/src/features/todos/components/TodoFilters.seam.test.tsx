import { QueryClient } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { AppProviders } from '../../../app/AppProviders'
import { TodoFilters } from './TodoFilters'

it('offers Due today in the Status filter and forwards due_today', async () => {
  const onFilterChange = vi.fn()
  const client = new QueryClient()
  render(
    <AppProviders client={client}>
      <TodoFilters
        filter="all"
        search=""
        sort="newest"
        onFilterChange={onFilterChange}
        onSearchChange={vi.fn()}
        onSortChange={vi.fn()}
      />
    </AppProviders>,
  )
  expect(screen.getByRole('option', { name: 'Due today' })).toBeInTheDocument()
  await userEvent.setup().selectOptions(screen.getByLabelText('Status'), 'due_today')
  expect(onFilterChange).toHaveBeenCalledWith('due_today')
})
