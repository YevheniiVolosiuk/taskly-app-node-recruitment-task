/// <reference types="node" />
import { readFileSync } from 'node:fs'
import openapiTS, { astToString } from 'openapi-typescript'
import { expect, it } from 'vitest'

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8')

it('matches backend/openapi.json; run npm run gen:api after changing it', async () => {
  const specification = JSON.parse(read('../../../backend/openapi.json'))
  const types = astToString(await openapiTS(specification))
  expect(read('./api.d.ts').endsWith(types)).toBe(true)
})
