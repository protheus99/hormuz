import { defineConfig } from 'vitest/config';

// Kept separate from vite.config.ts because that one roots the app in web/,
// while tests live in tests/ at the project root.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Year-long scenario runs and ESLint's startup can pass the 5 s default when the whole suite
    // runs in parallel on a busy machine.
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text', 'html'],
    },
  },
});
