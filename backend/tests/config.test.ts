import { afterEach, expect, it, vi } from 'vitest';
import { resolveDatabaseUrl } from '../src/core/config.ts';

const parts = { POSTGRES_USER: 'user', POSTGRES_PASSWORD: 'secret', POSTGRES_HOST: 'db.local', DB_PORT: '5433', POSTGRES_DB: 'taskly' };

function stub(env: Record<string, string>) {
  vi.stubEnv('DATABASE_URL', '');
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
}
afterEach(() => vi.unstubAllEnvs());

it.each(Object.keys(parts))('throws when %s is missing', (name) => {
  stub({ ...parts, [name]: '' });
  expect(() => resolveDatabaseUrl()).toThrow(`Missing environment variable: ${name}`);
});
it('returns DATABASE_URL when set', () => {
  stub(parts);
  vi.stubEnv('DATABASE_URL', 'postgresql://a:b@h:1/d');
  expect(resolveDatabaseUrl()).toBe('postgresql://a:b@h:1/d');
});
it('prefers the override argument over DATABASE_URL', () => {
  stub(parts);
  vi.stubEnv('DATABASE_URL', 'postgresql://a:b@h:1/d');
  expect(resolveDatabaseUrl('postgresql://x:y@z:2/w')).toBe('postgresql://x:y@z:2/w');
});
it('rewrites the postgresql+psycopg prefix to postgresql', () => {
  stub({});
  expect(resolveDatabaseUrl('postgresql+psycopg://a:b@h:1/d')).toBe('postgresql://a:b@h:1/d');
});
it('assembles the URL from the parts', () => {
  stub(parts);
  expect(resolveDatabaseUrl()).toBe('postgresql://user:secret@db.local:5433/taskly');
});
it('encodes special characters in the password and database name', () => {
  stub({ ...parts, POSTGRES_PASSWORD: 'p@ss/w:rd', POSTGRES_DB: 'my db' });
  expect(resolveDatabaseUrl()).toBe('postgresql://user:p%40ss%2Fw%3Ard@db.local:5433/my%20db');
});
