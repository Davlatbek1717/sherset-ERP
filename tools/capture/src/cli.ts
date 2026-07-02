#!/usr/bin/env node
/**
 * CLI entry for @moysklad/capture.
 *
 * Usage:
 *   pnpm --filter @moysklad/capture auth        # One-time interactive login
 *   pnpm --filter @moysklad/capture scrape-api  # Anonymous — dev.moysklad.ru
 *   pnpm --filter @moysklad/capture scrape-app  # Authenticated — online.moysklad.ru
 *   pnpm --filter @moysklad/capture scrape-tokens  # Authenticated — design tokens
 *   pnpm --filter @moysklad/capture scrape-all  # Run all (api first, then app, then tokens)
 */

import { runInteractiveLogin } from './auth/session.ts';
import { runPrintTemplateScraper } from './deep/admin/print-template-scraper.ts';
import { runReportsScraper } from './deep/admin/reports-scraper.ts';
import { runSettingsDiscover } from './deep/admin/settings-discover.ts';
import { runDeepCapture } from './deep/orchestrator.ts';
import { runScrapeApiDocs } from './scrape-api-docs.ts';
import { runScrapeApp } from './scrape-app.ts';
import { runScrapeTokens } from './scrape-tokens.ts';
import { child } from './utils/logger.ts';

const log = child('cli');

async function main(): Promise<void> {
  const cmd = process.argv[2];
  const args = process.argv.slice(3);

  if (!cmd) {
    printHelp();
    process.exit(1);
  }

  switch (cmd) {
    case 'auth':
      await runInteractiveLogin();
      break;

    case 'scrape-api':
      await runScrapeApiDocs();
      break;

    case 'scrape-app': {
      const routesFlag = args.find((a) => a.startsWith('--routes='));
      const routes = routesFlag ? routesFlag.slice('--routes='.length).split(',') : undefined;
      await runScrapeApp(routes ? { routes } : {});
      break;
    }

    case 'scrape-tokens':
      await runScrapeTokens();
      break;

    case 'scrape-deep': {
      const routesFlag = args.find((a) => a.startsWith('--routes='));
      const routes = routesFlag ? routesFlag.slice('--routes='.length).split(',') : undefined;
      const force = args.includes('--force');
      await runDeepCapture({ ...(routes ? { routes } : {}), force });
      break;
    }

    case 'discover-settings':
      await runSettingsDiscover();
      break;

    case 'scrape-print-templates':
      await runPrintTemplateScraper();
      break;

    case 'scrape-reports':
      await runReportsScraper();
      break;

    case 'scrape-all': {
      log.info('Running full scrape: API docs → app → tokens');
      await runScrapeApiDocs();
      await runScrapeApp();
      await runScrapeTokens();
      log.info('All scraping complete.');
      break;
    }

    case '--help':
    case '-h':
    case 'help':
      printHelp();
      break;

    default:
      log.error({ cmd }, 'Unknown command');
      printHelp();
      process.exit(1);
  }
}

function printHelp(): void {
  console.log(`
@moysklad/capture — Playwright-based moysklad discovery tooling.

Commands:
  auth              First-run interactive login (saves session state)
  scrape-api        Scrape dev.moysklad.ru API docs (89 entity + document schemas)
  scrape-app        Scrape online.moysklad.ru app pages (requires auth)
  scrape-tokens     Extract computed design tokens (requires auth)
  scrape-all        Run all three in sequence

Options (for scrape-app):
  --routes=<id,id,...>   Only scrape specific routes (e.g. --routes=product,counterparty)

Prerequisites:
  1. Install browsers: pnpm --filter @moysklad/capture install:browser
  2. Auth: pnpm --filter @moysklad/capture auth
`);
}

main().catch((err) => {
  log.error({ err }, 'fatal');
  process.exit(1);
});
