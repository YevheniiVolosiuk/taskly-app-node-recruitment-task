import request from 'supertest';
import { expect, it, vi } from 'vitest';
import { createApp } from '../src/factory.ts';
import type { Database } from '../src/features/todos/types.ts';
import { record, todo } from './fixture.ts';

function setup(delegate: Record<string, unknown> = {}) {
  const todoDelegate = {
    findUnique: vi.fn().mockResolvedValue(null),
    updateManyAndReturn: vi.fn().mockResolvedValue([]),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    ...delegate,
  };
  return { app: createApp({ todo: todoDelegate } as unknown as Database), todoDelegate };
}
const notFound = { detail: 'Task not found.' };


it.each(['get', 'patch', 'delete'] as const)('answers 422 to %s with a non-integer id', async (method) => {
  const response = await request(setup().app)[method]('/api/todos/abc');
  expect(response.status).toBe(422);
});
it('answers 404 to GET on a missing id', async () => {
  const response = await request(setup().app).get('/api/todos/99');
  expect(response.status).toBe(404);
  expect(response.body).toEqual(notFound);
});
it('answers 404 to PATCH on a missing id', async () => {
  const response = await request(setup().app).patch('/api/todos/99').send({ completed: true });
  expect(response.status).toBe(404);
  expect(response.body).toEqual(notFound);
});
it('answers 404 to DELETE on a missing id', async () => {
  const response = await request(setup().app).delete('/api/todos/99');
  expect(response.status).toBe(404);
  expect(response.body).toEqual(notFound);
});
it('returns the task on GET of an existing id', async () => {
  const { app, todoDelegate } = setup({ findUnique: vi.fn().mockResolvedValue(record) });
  const response = await request(app).get('/api/todos/1');
  expect(response.status).toBe(200);
  expect(response.body).toEqual(todo);
  expect(todoDelegate.findUnique).toHaveBeenCalledWith({ where: { id: 1 } });
});
it('rejects an invalid PATCH body without updating the database', async () => {
  const { app, todoDelegate } = setup();
  const response = await request(app).patch('/api/todos/1').send({ priority: 'urgent' });
  expect(response.status).toBe(422);
  expect(todoDelegate.updateManyAndReturn).not.toHaveBeenCalled();
});
it('returns the updated task on a valid PATCH', async () => {
  const { app, todoDelegate } = setup({ updateManyAndReturn: vi.fn().mockResolvedValue([{ ...record, completed: true }]) });
  const response = await request(app).patch('/api/todos/1').send({ completed: true });
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ ...todo, completed: true });
  expect(todoDelegate.updateManyAndReturn).toHaveBeenCalledOnce();
});
it('answers 204 with no body on DELETE of an existing id', async () => {
  const { app, todoDelegate } = setup({ deleteMany: vi.fn().mockResolvedValue({ count: 1 }) });
  const response = await request(app).delete('/api/todos/1');
  expect(response.status).toBe(204);
  expect(response.text).toBe('');
  expect(todoDelegate.deleteMany).toHaveBeenCalledWith({ where: { id: 1 } });
});

it('answers 422 to GET list with an unknown status without querying', async () => {
  const findMany = vi.fn().mockResolvedValue([]);
  const response = await request(setup({ findMany }).app).get('/api/todos?status=late');
  expect(response.status).toBe(422);
  expect(findMany).not.toHaveBeenCalled();
});
it.each(['active', 'completed', 'overdue'])('answers 200 to GET list with status=%s', async (status) => {
  const { app } = setup({ findMany: vi.fn().mockResolvedValue([record]) });
  const response = await request(app).get(`/api/todos?status=${status}`);
  expect(response.status).toBe(200);
  expect(response.body).toEqual([todo]);
});
it('lists every task when no status is given', async () => {
  const findMany = vi.fn().mockResolvedValue([record]);
  const response = await request(setup({ findMany }).app).get('/api/todos');
  expect(response.status).toBe(200);
  expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: undefined }));
});
