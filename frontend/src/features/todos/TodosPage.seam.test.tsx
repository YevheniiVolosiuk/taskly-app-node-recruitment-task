import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { AppProviders } from '../../app/AppProviders'
import { createTestClient } from '../../test/queryClient'
import { todoFixture } from '../../test/todoFixture'
import { TodosPage } from './TodosPage'

type Handler = () => Response | Promise<Response>

function setup(routes: Record<string, Handler | Handler[]>) {
  const fetch = vi.fn((url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${url}`
    const route = routes[key]
    if (!route) throw new Error(`Unexpected request: ${key}`)
    const handler = Array.isArray(route)
      ? route.length > 1
        ? route.shift()!
        : route[0]
      : route
    return Promise.resolve(handler())
  })
  vi.stubGlobal('fetch', fetch)
  render(
    <AppProviders client={createTestClient()}>
      <TodosPage />
    </AppProviders>,
  )
  const bodies = (key: string) =>
    fetch.mock.calls
      .filter(([url, init]) => `${init?.method ?? 'GET'} ${url}` === key)
      .map(([, init]) => JSON.parse(String(init?.body)))
  return { fetch, bodies, user: userEvent.setup() }
}

const list = (todos: unknown[]) => () => Response.json(todos)
const active = { ...todoFixture, title: 'Prepare a demo' }
const done = { ...todoFixture, id: 8, title: 'Ship it', completed: true }

it('shows a loading status while the list loads', async () => {
  setup({ 'GET /api/todos': () => new Promise<Response>(() => {}) as never })
  expect(await screen.findByRole('status')).toHaveTextContent(
    'Loading your tasks…',
  )
})

it('offers to add the first task when the list is empty and opens the editor', async () => {
  const { user } = setup({ 'GET /api/todos': list([]) })
  expect(
    await screen.findByRole('heading', { name: 'Add your first task' }),
  ).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Add your first task' }))
  expect(await screen.findByRole('dialog', { name: 'New task' })).toBeVisible()
})

it('shows the unavailable state and recovers with Try again', async () => {
  const { user } = setup({
    'GET /api/todos': [
      () => Response.json({ detail: 'Database is down.' }, { status: 500 }),
      list([active]),
    ],
  })
  expect(
    await screen.findByRole('heading', {
      name: 'The task list is temporarily unavailable',
    }),
  ).toBeVisible()
  expect(screen.getByRole('alert')).toHaveTextContent('Database is down.')
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  expect(
    await screen.findByRole('heading', { name: 'Prepare a demo' }),
  ).toBeVisible()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('completes an active task and congratulates the user', async () => {
  const { user, bodies } = setup({
    'GET /api/todos': list([active]),
    'PATCH /api/todos/7': () => Response.json({ ...active, completed: true }),
  })
  await user.click(
    await screen.findByRole('checkbox', { name: 'Complete: Prepare a demo' }),
  )
  expect(
    await screen.findByText('Another task complete. Well done!'),
  ).toBeVisible()
  expect(bodies('PATCH /api/todos/7')[0]).toMatchObject({ completed: true })
})

it('marks a completed task as active again', async () => {
  const { user, bodies } = setup({
    'GET /api/todos': list([done]),
    'PATCH /api/todos/8': () => Response.json({ ...done, completed: false }),
  })
  await user.click(
    await screen.findByRole('checkbox', { name: 'Mark as active: Ship it' }),
  )
  expect(await screen.findByText('Task marked as active.')).toBeVisible()
  expect(bodies('PATCH /api/todos/8')[0]).toMatchObject({ completed: false })
})

it('shows the error in the page alert when toggling fails', async () => {
  const { user } = setup({
    'GET /api/todos': list([active]),
    'PATCH /api/todos/7': () =>
      Response.json({ detail: 'Task is locked.' }, { status: 409 }),
  })
  await user.click(
    await screen.findByRole('checkbox', { name: 'Complete: Prepare a demo' }),
  )
  expect(await screen.findByRole('alert')).toHaveTextContent('Task is locked.')
})

it('deletes a task after confirmation', async () => {
  const { user, fetch } = setup({
    'GET /api/todos': [list([active, done]), list([done])],
    'DELETE /api/todos/7': () => new Response(null, { status: 204 }),
  })
  await user.click(
    await screen.findByRole('button', { name: 'Delete: Prepare a demo' }),
  )
  const dialog = await screen.findByRole('dialog', { name: 'Delete task?' })
  await user.click(within(dialog).getByRole('button', { name: 'Delete task' }))
  expect(await screen.findByText('Task deleted.')).toBeVisible()
  expect(
    screen.queryByRole('heading', { name: 'Prepare a demo' }),
  ).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Ship it' })).toBeVisible()
  expect(fetch).toHaveBeenCalledWith(
    '/api/todos/7',
    expect.objectContaining({ method: 'DELETE' }),
  )
})

it('keeps the delete dialog open and shows the error when deleting fails', async () => {
  const { user } = setup({
    'GET /api/todos': list([active]),
    'DELETE /api/todos/7': () =>
      Response.json({ detail: 'Task not found.' }, { status: 404 }),
  })
  await user.click(
    await screen.findByRole('button', { name: 'Delete: Prepare a demo' }),
  )
  const dialog = await screen.findByRole('dialog', { name: 'Delete task?' })
  await user.click(within(dialog).getByRole('button', { name: 'Delete task' }))
  expect(await within(dialog).findByRole('alert')).toHaveTextContent(
    'Task not found.',
  )
  expect(dialog).toBeVisible()
  expect(screen.getByRole('heading', { name: 'Prepare a demo' })).toBeVisible()
})

it('saves an edited task and confirms the changes', async () => {
  const { user, bodies } = setup({
    'GET /api/todos': [
      list([active]),
      list([{ ...active, title: 'Prepare the demo' }]),
    ],
    'PATCH /api/todos/7': () =>
      Response.json({ ...active, title: 'Prepare the demo' }),
  })
  await user.click(
    await screen.findByRole('button', { name: 'Edit: Prepare a demo' }),
  )
  const dialog = await screen.findByRole('dialog', { name: 'Edit task' })
  const title = within(dialog).getByLabelText('Task title *')
  await user.clear(title)
  await user.type(title, 'Prepare the demo')
  await user.click(within(dialog).getByRole('button', { name: 'Save task' }))
  expect(await screen.findByText('Changes saved.')).toBeVisible()
  expect(bodies('PATCH /api/todos/7')[0]).toMatchObject({
    title: 'Prepare the demo',
  })
  expect(
    await screen.findByRole('heading', { name: 'Prepare the demo' }),
  ).toBeVisible()
})

it('sends a null due date when the date is cleared', async () => {
  const dated = { ...active, due_date: '2026-12-01' }
  const { user, bodies } = setup({
    'GET /api/todos': list([dated]),
    'PATCH /api/todos/7': () => Response.json({ ...dated, due_date: null }),
  })
  await user.click(
    await screen.findByRole('button', { name: 'Edit: Prepare a demo' }),
  )
  const dialog = await screen.findByRole('dialog', { name: 'Edit task' })
  await user.clear(within(dialog).getByLabelText('Due date (optional)'))
  await user.click(within(dialog).getByRole('button', { name: 'Save task' }))
  await waitFor(() => expect(bodies('PATCH /api/todos/7')).toHaveLength(1))
  expect(bodies('PATCH /api/todos/7')[0].due_date).toBeNull()
})

it('shows no matching tasks, without a create button, when the search finds nothing', async () => {
  const { user } = setup({ 'GET /api/todos': list([active]) })
  await screen.findByRole('heading', { name: 'Prepare a demo' })
  await user.type(screen.getByLabelText('Search tasks'), 'zzz')
  expect(
    await screen.findByRole('heading', { name: 'No matching tasks' }),
  ).toBeVisible()
  expect(
    screen.queryByRole('button', { name: 'Add your first task' }),
  ).not.toBeInTheDocument()
})
