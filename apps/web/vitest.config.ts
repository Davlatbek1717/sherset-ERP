import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * Vitest config — picks up unit tests under `src/` only. The Playwright
 * suite lives in `tests/e2e/` and runs via `pnpm test:e2e` (it requires a
 * running dev server). Without this exclusion vitest tries to import the
 * Playwright spec and crashes because `@playwright/test` is not vitest's
 * test runner.
 *
 * happy-dom is used as a lightweight browser-like environment for React
 * component tests. The setup file installs jest-dom matchers + a
 * NextIntl provider scaffold so our components can call `useTranslations`
 * inside tests.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Mirror tsconfig.paths so vitest can resolve workspace
      // packages without requiring a separate "build" step.
      '@moysklad/ui': path.resolve(__dirname, '../../packages/design-system/src/index.ts'),
      '@moysklad/money': path.resolve(__dirname, '../../packages/money/src/index.ts'),
    },
  },
  test: {
    environment: 'happy-dom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**', 'tests/e2e/**'],
    passWithNoTests: true,
    globals: true,
  },
});
