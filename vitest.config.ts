import { defineConfig } from 'vitest/config';

// Kept separate from vite.config.ts because that one roots the app in web/,
// while tests live in tests/ at the project root.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
