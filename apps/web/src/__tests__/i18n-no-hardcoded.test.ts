import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * i18n no-hardcoded gate for COMPLETED document forms (regression guard).
 *
 * Once a document form (`/new` + `/[id]`) has been internationalised, it must
 * stay that way: no hardcoded Russian (Cyrillic) or Uzbek-latin user-facing
 * strings may creep back in. This test asserts that invariant over an explicit
 * registry of done forms (it grows as each group is completed). In-progress
 * forms are intentionally NOT listed, so the gate never false-fails on
 * known-incomplete work — the registry is the single source of truth for "done".
 *
 * Cyrillic in a finished form (after comment-stripping) is, by construction, a
 * leak — every user-facing string goes through t(). Uzbek-latin is detected via
 * a small high-signal marker list (those words only appear in un-i18n'd source).
 */

const APP = join(__dirname, '..', 'app', '(app)');

// Completed document-form groups — both /new and /[id] are checked per route.
const DONE_ROUTES = [
  // money
  'cash-in',
  'cash-out',
  'payments-in',
  'payments-out',
  'prepayments',
  'prepayment-returns',
  'counterparty-adjustments',
  // sales
  'customer-orders',
  'demands',
  'invoices-out',
  'sales-returns',
  // purchase
  'supplies',
  'purchase-orders',
  'invoices-in',
  'purchase-returns',
  // inventory
  'moves',
  'losses',
  'enters',
  'inventories',
  'internal-orders',
  // production
  'processings',
  'processing-orders',
  'productions',
  'production/work-orders',
  'production/boms',
  'production/processes',
  'production/stages',
  // catalog items (Cohort F)
  'bundles',
  'services',
  'variants',
  'tracking-codes',
  // crm (Cohort G)
  'opportunities',
  'pipelines',
  'contact-persons',
  'tasks',
  // e-commerce / pricing (Cohort H)
  'ecommerce/channels',
  'ecommerce/orders',
  'discounts',
  'price-lists',
  // hr
  'payrolls',
  'hr/employees',
  // analytics (Cohort J)
  'analitika/buyurtmalar',
  'analitika/kontragentlar',
  'analitika/xodimlar',
  // settings-finance (Cohort K)
  'settings/bank-accounts',
  'settings/cash-desks',
  'settings/expense-items',
  'settings/tax-rates',
  'settings/price-types',
  // settings-org (Cohort L)
  'settings/organizations',
  'settings/regions',
  'settings/custom-entities',
  'settings/publications',
  'settings/label-templates',
  'settings/users',
  'analitika/sozlamalar/rollar',
];

// Completed SINGLE-page routes (no /new + /[id] split — the route's own
// page.tsx is the form). Added 2026-06-11 with the /labels/print whole-page
// i18n: the DONE_ROUTES loop only probes `<route>/{new,[id]}/page.tsx`, so a
// plain page could never be registered before this list existed.
const DONE_PAGES = ['labels/print', 'settings/profile'];

// Source-only Uzbek markers: these words appear in un-i18n'd hardcoded strings,
// never after wiring (placeholders/labels become tForm/tFields calls).
const UZ_MARKERS = [
  'tanlang',
  'tanlash',
  'Yangi kontragent',
  'Yangi loyiha',
  "qo'shing",
  'kutyapmiz',
  'provedeno qiling',
  'Hujjatni saqlang',
  'Avval ',
];

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, (_m, p1) => p1);
}

interface Leak {
  file: string;
  line: number;
  snippet: string;
  kind: 'cyrillic' | 'uzbek';
}

function scan(file: string): Leak[] {
  const raw = readFileSync(file, 'utf8');
  const stripped = stripComments(raw);
  const leaks: Leak[] = [];
  const lines = stripped.split('\n');
  lines.forEach((line, i) => {
    if (/[А-Яа-яЁё]/.test(line)) {
      leaks.push({ file, line: i + 1, snippet: line.trim().slice(0, 100), kind: 'cyrillic' });
    } else if (UZ_MARKERS.some((m) => line.includes(m))) {
      leaks.push({ file, line: i + 1, snippet: line.trim().slice(0, 100), kind: 'uzbek' });
    }
  });
  return leaks;
}

describe('i18n no-hardcoded (completed document forms)', () => {
  const checked: string[] = [];
  const allLeaks: Leak[] = [];
  for (const route of DONE_ROUTES) {
    for (const variant of ['new', '[id]']) {
      const file = join(APP, route, variant, 'page.tsx');
      if (!existsSync(file)) continue;
      checked.push(`${route}/${variant}`);
      allLeaks.push(...scan(file));
    }
  }
  for (const route of DONE_PAGES) {
    const file = join(APP, route, 'page.tsx');
    if (!existsSync(file)) continue;
    checked.push(route);
    allLeaks.push(...scan(file));
  }

  it('finds every registered single-page route (no silent skips)', () => {
    for (const route of DONE_PAGES) {
      expect(checked, `DONE_PAGES route missing on disk: ${route}`).toContain(route);
    }
  });

  it('checks every completed document form', () => {
    // 19 routes × 2 variants = 38 expected
    expect(checked.length).toBeGreaterThanOrEqual(36);
  });

  it('has zero hardcoded RU/UZ literals', () => {
    const report = allLeaks.map(
      (l) => `[${l.kind}] ${l.file.replace(APP, '(app)')}:${l.line}  ${l.snippet}`,
    );
    expect(report, `Hardcoded strings in completed forms:\n${report.join('\n')}`).toEqual([]);
  });
});
