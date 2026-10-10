import { expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { todosApi } from './todos'

function setup() {
  const fetch = vi.fn().mockImplementation(() => Promise.resolve(Response.json([todoFixture])))
  vi.stubGlobal('fetch', fetch)
  return { fetch }
}

it('requests every task without a status query when the filter is all', async () => {
  const { fetch } = setup()
  await expect(todosApi.list('all')).resolves.toEqual([todoFixture])
  expect(fetch.mock.calls[0][0]).toBe('/api/todos')
})

it.each(['active', 'completed', 'overdue'] as const)(
  'requests /api/todos?status=%s when the filter is %s',
  async (filter) => {
    const { fetch } = setup()
    await todosApi.list(filter)
    expect(fetch.mock.calls[0][0]).toBe(`/api/todos?status=${filter}`)
  },
)
