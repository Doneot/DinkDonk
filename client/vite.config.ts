/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/test/**',
        'src/**/*.d.ts',
        'src/main.tsx',
        // Type-only or trivial re-export files with no branching logic of
        // their own to regress.
        'src/vite-env.d.ts',
      ],
      // Previously no gate at all - `npm test` had no coverage step, so a
      // test file could be gutted without CI noticing. Set a few points
      // below the actual coverage at the time this was added (~63/58/57/63
      // statements/branches/functions/lines) rather than an arbitrary round
      // number, the same way server/vitest.config.ts's thresholds are
      // justified. This is a real floor against regression, not a claim
      // that coverage is complete: pages/, router/, and a few
      // presentational shared/components (ErrorBoundary, Navbar, UserMenu,
      // ...) are still untested - see ARCHITECTURE.md and raise this
      // threshold as that coverage is added, rather than lowering it to fit
      // whatever the number happens to be later.
      thresholds: {
        statements: 60,
        branches: 55,
        functions: 55,
        lines: 60,
      },
    },
  },
  server: {
    port: 5000,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
      '/eventsub': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
      '/socket.io': {
        target: 'ws://localhost:3000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
