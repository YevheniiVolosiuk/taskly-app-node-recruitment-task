import request from 'supertest';
import { expect, it, vi } from 'vitest';
import { createApp } from '../src/factory.ts';
import type { Database } from '../src/features/todos/types.ts';

function setup(todoDelegate: Record<string, unknown> = {}) {
  const database = { todo: { findMany: vi.fn().mockResolvedValue([]), ...todoDelegate } } as unknown as Database;
  return { app: createApp(database), database };
}

it('answers 500 with a generic detail when a route throws', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const { app } = setup({ findMany: vi.fn().mockRejectedValue(new Error('boom')) });
  const response = await request(app).get('/api/todos');
  expect(response.status).toBe(500);
  expect(response.body).toEqual({ detail: 'Internal Server Error' });
});
it('answers 422 for malformed JSON', async () => {
  const response = await request(setup().app).post('/api/todos').set('Content-Type', 'application/json').send('{"title":');
  expect(response.status).toBe(422);
  expect(response.body).toEqual({ detail: 'Invalid JSON.' });
});
it('answers 413 for a body over the 100kb limit', async () => {
  const response = await request(setup().app).post('/api/todos').send({ title: 'x'.repeat(150 * 1024) });
  expect(response.status).toBe(413);
  expect(response.body).toEqual({ detail: 'Request body too large.' });
});
it('answers 404 for an unknown route', async () => {
  const response = await request(setup().app).get('/api/nope');
  expect(response.status).toBe(404);
  expect(response.body).toEqual({ detail: 'Not Found' });
});
it('serves the OpenAPI document at /openapi.json', async () => {
  const response = await request(setup().app).get('/openapi.json');
  expect(response.status).toBe(200);
  expect(response.body.info.title).toBe('Taskly App Node API');
  expect(Object.keys(response.body.paths)).toContain('/api/todos/{id}');
});
it('does not send the x-powered-by header', async () => {
  const response = await request(setup().app).get('/api/todos');
  expect(response.headers['x-powered-by']).toBeUndefined();
});
