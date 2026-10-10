// Mutation testing. The Verification Job passes the PR's changed source files as a JSON array in STRYKER_MUTATE.
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: 'vitest',
  mutate: process.env.STRYKER_MUTATE
    ? JSON.parse(process.env.STRYKER_MUTATE)
    : ['src/**/*.ts', '!src/generated/**', '!src/**/types.ts', '!src/main.ts'],
  // Static mutants rerun every test for each mutant; skipping them keeps a PR run within the job timeout.
  ignoreStatic: true,
  reporters: ['clear-text', 'json', 'html'],
  // A warning, not a gate: no score fails the run.
  thresholds: { high: 80, low: 60, break: null },
};
