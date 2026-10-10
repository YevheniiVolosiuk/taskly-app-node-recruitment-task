import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/types.ts', 'src/generated/**'],
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      reportsDirectory: 'coverage',
      thresholds: {
        perFile: true,
        '{src/api/**,src/features/todos/**,src/core/config.ts}': {
          statements: 100, branches: 100, functions: 100, lines: 100,
        },
        'src/factory.ts': {
          statements: 95, branches: 92, functions: 100, lines: 100,
        },
      },
    },
  },
});
