import { defineConfig } from 'vite';

export default defineConfig({
  root: 'web',
  // The game is entirely client-side — the engine, the session and the save all run in the browser —
  // so a build is three static files and any static host will serve them.
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  // Empty on purpose, and not dead code: a host's setup tool edits this array to add its own plugin,
  // and Cloudflare's refuses the project outright without one — "Cannot modify Vite config: could
  // not find a valid plugins array" (2026-09-25).
  plugins: [],
});
