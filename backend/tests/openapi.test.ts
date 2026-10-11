import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { todoStatuses } from '../src/features/todos/validators.ts';

const specification = JSON.parse(readFileSync(new URL('../openapi.json', import.meta.url), 'utf8'));

it('documents the list status values the API accepts', () => {
  const status = specification.paths['/api/todos'].get.parameters.find((parameter: { name: string }) => parameter.name === 'status');
  expect(status.schema.enum).toEqual(todoStatuses);
});
