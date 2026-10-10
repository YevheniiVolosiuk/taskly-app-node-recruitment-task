import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': process.env.TASKLY_API_URL ?? 'http://127.0.0.1:8000' },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/main.tsx',
        'src/test/**',
        'src/**/*.test.{ts,tsx}',
        'src/design-system/**',
        'src/**/types.ts',
        'src/**/*.types.ts',
        'src/**/index.ts',
        'src/**/constants.{ts,tsx}',
        'src/**/*.constants.ts',
        'src/features/todos/api/queryKeys.ts',
        'src/lib/queryClient.ts',
      ],
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      thresholds: {
        perFile: true,
        '{src/app/**,src/hooks/**,src/features/todos/api/**,src/features/todos/hooks/**}':
          { statements: 100, branches: 100, functions: 100, lines: 100 },
        'src/lib/http.ts': {
          statements: 91,
          branches: 90,
          functions: 100,
          lines: 100,
        },
        'src/features/todos/utils/todos.ts': {
          statements: 100,
          branches: 97,
          functions: 100,
          lines: 100,
        },
        'src/features/todos/components/**': {
          statements: 88,
          branches: 75,
          functions: 88,
          lines: 93,
        },
        'src/features/todos/TodosPage.tsx': {
          statements: 85,
          branches: 94,
          functions: 72,
          lines: 88,
        },
      },
    },
  },
})
