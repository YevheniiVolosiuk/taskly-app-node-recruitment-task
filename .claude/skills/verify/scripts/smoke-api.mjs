#!/usr/bin/env node
// Usage: smoke-api.mjs <api-origin> [transcript-file]
// Waits for GET /api/health, then drives todos CRUD over HTTP and asserts each response.
// Prints every request and response (and writes them to the transcript file, replacing it); exits 1 on the
// first failed assertion. The task it creates is deleted on failure too.
// Shared by the verify skill and the Verification Job smoke check.
import assert from 'node:assert/strict';
import { appendFileSync, writeFileSync } from 'node:fs';

const [origin, transcript] = process.argv.slice(2);
if (!origin) {
  console.error('usage: smoke-api.mjs <api-origin> [transcript-file]');
  process.exit(2);
}
if (transcript) writeFileSync(transcript, '');

function log(line) {
  console.log(line);
  if (transcript) appendFileSync(transcript, `${line}\n`);
}

async function call(method, path, body) {
  const response = await fetch(new URL(path, origin), {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(5000),
  });
  const text = await response.text();
  log(`${method} ${path}${body ? ` ${JSON.stringify(body)}` : ''} -> ${response.status} ${text}`);
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function waitForHealth(deadline) {
  for (;;) {
    try {
      const health = await call('GET', '/api/health');
      if (health.status === 200) return health;
    } catch (error) {
      log(`GET /api/health -> ${error.cause?.code ?? error.message}`);
    }
    if (Date.now() > deadline) return null;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

let createdPath = null;
try {
  const health = await waitForHealth(Date.now() + 30_000);
  assert.ok(health, 'GET /api/health never answered 200 within 30s');
  assert.deepEqual(health.body, { status: 'ok' });

  const title = `Smoke check ${new Date().toISOString()}`;
  const created = await call('POST', '/api/todos', { title, priority: 'high', due_date: '2030-01-15' });
  assert.equal(created.status, 201);
  assert.equal(created.body.title, title);
  assert.equal(created.body.priority, 'high');
  assert.equal(created.body.due_date, '2030-01-15');
  assert.equal(created.body.completed, false);
  const path = `/api/todos/${created.body.id}`;
  createdPath = path;

  const list = await call('GET', '/api/todos');
  assert.equal(list.status, 200);
  assert.ok(list.body.some((todo) => todo.id === created.body.id), 'created todo missing from list');

  const updated = await call('PATCH', path, { completed: true });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.completed, true);
  assert.equal(updated.body.title, title);

  const fetched = await call('GET', path);
  assert.equal(fetched.status, 200);
  assert.equal(fetched.body.completed, true);

  const invalid = await call('POST', '/api/todos', { title: '' });
  assert.equal(invalid.status, 422);

  assert.equal((await call('DELETE', path)).status, 204);
  createdPath = null;
  assert.equal((await call('GET', path)).status, 404);

  log('smoke-api: PASS');
} catch (error) {
  log(`smoke-api: FAIL ${error.message}`);
  if (createdPath) await call('DELETE', createdPath).catch(() => {});
  process.exit(1);
}
