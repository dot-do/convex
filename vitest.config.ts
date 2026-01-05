import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'tests/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist'],
    // Use jsdom for React tests
    environmentMatchGlobs: [
      ['tests/react/**', 'jsdom'],
      ['src/react/**', 'jsdom'],
    ],
    setupFiles: ['tests/react/setup.ts'],
    // CRITICAL: Limit workers to prevent 50GB memory consumption
    // With 28 CPUs, vitest spawns ~28 workers by default
    // Each worker loads the massive test files (~1200 lines with heavy mocking)
    // This causes ~2-3GB per worker = ~50GB+ total
    pool: 'threads',
    poolOptions: {
      threads: {
        maxThreads: 4,
        minThreads: 1,
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules',
        'dist',
        '**/*.d.ts',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/index.ts',
      ],
      thresholds: {
        global: {
          branches: 100,
          functions: 100,
          lines: 100,
          statements: 100,
        },
      },
    },
    testTimeout: 10000,
    hookTimeout: 10000,
  },
})
