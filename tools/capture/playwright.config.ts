import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './src',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    headless: true,
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
  },
});
