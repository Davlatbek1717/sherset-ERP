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
      // Kichik yo'l (`/currencies`) UMUMIY kalitdan OLDIN turishi shart: satr-alias
      // prefiks bo'yicha mos keladi, ya'ni `@moysklad/money` qoidasi yolg'iz qolsa
      // `@moysklad/money/currencies` ni `…/src/index.ts/currencies` ga aylantiradi
      // va import umuman resolve bo'lmaydi. Shu sabab `/sotuv`, `/retail` va POS
      // dialoglarini HECH BIR test render qila olmasdi (MK32 da aniqlandi).
      '@moysklad/money/currencies': path.resolve(
        __dirname,
        '../../packages/money/src/currencies.ts',
      ),
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
