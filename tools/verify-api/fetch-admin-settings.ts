#!/usr/bin/env tsx
/**
 * Fetch admin-area data via API: settings, roles, webhooks, reports.
 * These endpoints work regardless of UI SPA rendering issues.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const API_BASE = 'https://api.moysklad.ru/api/remap/1.2';
const OUT_DIR = path.join(REPO_ROOT, 'docs/moysklad-reference/admin');

async function main(): Promise<void> {
  const token = process.env.MOYSKLAD_API_TOKEN;
  if (!token) {
    console.error('No token');
    process.exit(1);
  }
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json;charset=utf-8',
  };
  await mkdir(OUT_DIR, { recursive: true });

  console.log('=== Fetching admin-area data ===\n');

  const targets: { name: string; url: string }[] = [
    { name: 'company-settings', url: '/context/companysettings' },
    { name: 'current-employee', url: '/context/employee' },
    { name: 'organization-list', url: '/entity/organization/' },
    { name: 'store-list', url: '/entity/store/' },
    { name: 'retailstore-list', url: '/entity/retailstore/' },
    { name: 'employee-list', url: '/entity/employee/' },
    { name: 'role-list', url: '/entity/role/' },
    { name: 'group-list', url: '/entity/group/' },
    { name: 'currency-list', url: '/entity/currency/' },
    { name: 'country-list', url: '/entity/country/' },
    { name: 'region-list', url: '/entity/region/' },
    { name: 'webhook-list', url: '/entity/webhook/' },
    { name: 'uom-list', url: '/entity/uom/' },
    { name: 'vatrate-list', url: '/entity/vatrate/' },
    { name: 'state-list', url: '/entity/state/' },
    { name: 'saleschannel-list', url: '/entity/saleschannel/' },
    { name: 'expenseitem-list', url: '/entity/expenseitem/' },
    { name: 'contract-list', url: '/entity/contract/' },
    { name: 'project-list', url: '/entity/project/' },
    { name: 'counterparty-list', url: '/entity/counterparty/' },
    { name: 'notification-list', url: '/notification/' },
    { name: 'notification-config', url: '/notification/configuration/' },
  ];

  const reports: { name: string; url: string }[] = [
    { name: 'report-stock-all', url: '/report/stock/all' },
    { name: 'report-stock-bystore', url: '/report/stock/bystore' },
    { name: 'report-dashboard-day', url: '/report/dashboard/day' },
    { name: 'report-dashboard-week', url: '/report/dashboard/week' },
    { name: 'report-dashboard-month', url: '/report/dashboard/month' },
    { name: 'report-counterparty', url: '/report/counterparty/' },
    { name: 'report-sales-byproduct', url: '/report/sales/byproduct' },
    { name: 'report-sales-byemployee', url: '/report/sales/byemployee' },
    { name: 'report-sales-bycounterparty', url: '/report/sales/bycounterparty' },
    { name: 'report-profit-byproduct', url: '/report/profit/byproduct' },
    { name: 'report-profit-bycounterparty', url: '/report/profit/bycounterparty' },
    { name: 'report-profit-byemployee', url: '/report/profit/byemployee' },
    { name: 'report-orders', url: '/report/orders' },
    { name: 'report-money-plotseries', url: '/report/money/plotseries' },
    { name: 'report-turnover-all', url: '/report/turnover/all' },
    { name: 'report-turnover-bystore', url: '/report/turnover/bystore' },
    { name: 'report-turnover-byemployee', url: '/report/turnover/byemployee' },
  ];

  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  console.log('-- Settings + entities --');
  for (const t of targets) {
    try {
      const r = await fetch(`${API_BASE}${t.url}`, { headers });
      if (r.ok) {
        const body = await r.json();
        await writeFile(
          path.join(OUT_DIR, `${t.name}.json`),
          JSON.stringify(body, null, 2),
          'utf8',
        );
        const rowCount = (body as { rows?: unknown[] }).rows?.length;
        console.log(
          `  ${t.name.padEnd(28)} OK ${rowCount !== undefined ? `(${rowCount} rows)` : ''}`,
        );
      } else {
        console.log(`  ${t.name.padEnd(28)} HTTP ${r.status}`);
      }
      await sleep(150);
    } catch (e) {
      console.log(`  ${t.name.padEnd(28)} ERROR: ${(e as Error).message}`);
    }
  }

  console.log('\n-- Reports --');
  await mkdir(path.join(OUT_DIR, '../reports/api'), { recursive: true });
  for (const r of reports) {
    try {
      const resp = await fetch(`${API_BASE}${r.url}`, { headers });
      if (resp.ok) {
        const body = await resp.json();
        await writeFile(
          path.join(OUT_DIR, '../reports/api', `${r.name}.json`),
          JSON.stringify(body, null, 2),
          'utf8',
        );
        const rowCount = (body as { rows?: unknown[] }).rows?.length;
        console.log(
          `  ${r.name.padEnd(30)} OK ${rowCount !== undefined ? `(${rowCount} rows)` : ''}`,
        );
      } else {
        console.log(`  ${r.name.padEnd(30)} HTTP ${resp.status}`);
      }
      await sleep(150);
    } catch (e) {
      console.log(`  ${r.name.padEnd(30)} ERROR: ${(e as Error).message}`);
    }
  }

  console.log('\n✅ Admin + reports fetched');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
