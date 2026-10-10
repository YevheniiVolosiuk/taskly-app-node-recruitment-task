import request from 'supertest';
import { expect, it, vi } from 'vitest';
import { createApp } from '../src/factory.ts';
import type { Database } from '../src/features/todos/types.ts';

function setup(findFirst: ReturnType<typeof vi.fn>) {
  return createApp({ todo: { findFirst } } as unknown as Database);
}

it('reports ok when the database answers', async () => {
  const response = await request(setup(vi.fn().mockResolvedValue({ id: 1 }))).get('/api/health');
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ status: 'ok' });
});
it('answers 500 when the database query rejects', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const response = await request(setup(vi.fn().mockRejectedValue(new Error('down')))).get('/api/health');
  expect(response.status).toBe(500);
  expect(response.body).toEqual({ detail: 'Internal Server Error' });
});
