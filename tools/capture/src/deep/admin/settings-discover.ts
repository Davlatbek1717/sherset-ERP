import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { launchAuthenticated } from '../../auth/session.ts';
import { OUTPUT, TIMING, URLS } from '../../config.ts';
import { child } from '../../utils/logger.ts';
import { ensureParent } from '../../utils/paths.ts';
import { sleep } from '../../utils/wait.ts';

const log = child('settings-discover');

/**
 * Discover all admin/settings sub-routes by navigating into #settings area
 * and enumerating every internal hash link from the admin sidebar / menu.
 *
 * Moysklad admin is behind a user-menu dropdown (top right avatar). Main
 * settings tree routes include:
 *   Account settings, Users, Roles, Organizations, Warehouses,
 *   Currencies, Tax rates, Price types, Discounts, Bonus programs,
 *   Document statuses (per doc type), Numbering templates,
 *   Print templates, Webhooks, API tokens, Integrations, etc.
 */

export async function runSettingsDiscover(): Promise<void> {
  log.info('Starting settings tree discovery');

  const auth = await launchAuthenticated(true);
  const page = await auth.context.newPage();
  page.setDefaultTimeout(TIMING.defaultActionTimeout);
  page.setDefaultNavigationTimeout(TIMING.defaultNavigationTimeout);

  try {
    await page.goto(URLS.app, { waitUntil: 'domcontentloaded' });
    await sleep(2500);

    const discovered: DiscoveredRoute[] = [];
    const visited = new Set<string>();

    // Seed hashes to explore
    const seeds = [
      'myaccount',
      'settings',
      'company',
      'accounts',
      'tariff',
      'billing',
      'security',
      'integrations',
      'webhook',
      'apitoken',
      'custompermissions',
      'importexport',
    ];

    // Collect all <a href="#...">... links found on each seed page
    for (const seed of seeds) {
      if (visited.has(seed)) continue;
      visited.add(seed);

      try {
        const url = `${URLS.app}#${seed}`;
        log.info({ seed, url }, 'navigating');
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await sleep(2000);

        const result = await page.evaluate(() => {
          const hashes: {
            hash: string;
            label: string;
            testId: string | null;
            bbox: { x: number; y: number; w: number; h: number };
          }[] = [];

          const seen = new Set<string>();
          document.querySelectorAll('a[href^="#"]').forEach((a) => {
            const href = a.getAttribute('href') ?? '';
            const match = href.match(/^#([^?&/]+)/);
            if (!match) return;
            const hash = match[1];
            if (!hash || hash.length < 2 || seen.has(hash)) return;
            seen.add(hash);

            const r = a.getBoundingClientRect();
            const label = (a.textContent ?? '').trim().slice(0, 80);
            hashes.push({
              hash,
              label,
              testId: a.getAttribute('data-test-id'),
              bbox: {
                x: Math.round(r.left),
                y: Math.round(r.top),
                w: Math.round(r.width),
                h: Math.round(r.height),
              },
            });
          });

          const h1 = document.querySelector('h1, h2, [class*=title]:not(a)');
          return {
            h1: (h1?.textContent ?? '').trim(),
            currentHash: location.hash.replace(/^#/, '').split('?')[0],
            hashes,
          };
        });

        discovered.push({
          seedHash: seed,
          pageTitle: result.h1,
          currentHash: result.currentHash ?? seed,
          children: result.hashes,
        });
      } catch (err) {
        log.error({ seed, err: (err as Error).message }, 'seed failed');
      }
    }

    // Write results
    const outFile = path.join(OUTPUT.root, 'admin', 'settings-discovery.json');
    await ensureParent(outFile);
    await writeFile(outFile, JSON.stringify(discovered, null, 2), 'utf8');

    // Summary
    const allHashes = new Set<string>();
    for (const d of discovered) {
      for (const c of d.children) {
        allHashes.add(c.hash);
      }
    }
    log.info(
      { seeds: discovered.length, uniqueHashes: allHashes.size, outFile },
      'discovery complete',
    );
  } finally {
    try {
      await auth.context.close();
    } catch {
      /* ignore */
    }
    try {
      await auth.browser.close();
    } catch {
      /* ignore */
    }
  }
}

interface DiscoveredRoute {
  seedHash: string;
  pageTitle: string;
  currentHash: string;
  children: {
    hash: string;
    label: string;
    testId: string | null;
    bbox: { x: number; y: number; w: number; h: number };
  }[];
}
