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

/**
 * Blank out regex literals that are syntactically consumed as MATCHERS
 * (MASTER-TODO #17, 2026-07-28).
 *
 * The scanner is line-granular and syntax-blind: any Cyrillic codepoint on a
 * line is reported as a hardcoded label. That is right for a string literal and
 * wrong for a pattern that MATCHES SERVER DATA and is never rendered — e.g.
 * supplies picks the retail price type with
 *   items.find((t) => /sotil|розничн|retail|продaж/i.test(t.name))
 * where «розничн» must be Cyrillic precisely because the seeded price type is
 * «Розничная цена». Localising it would BREAK the match.
 *
 * Narrow on purpose: only a `/…/flags` immediately consumed by `.test(`/`.exec(`
 * or passed as the first argument of a String matcher is blanked. A Cyrillic
 * STRING literal anywhere on the line is still reported, so the guard keeps its
 * full power over real labels.
 */
const RE_BODY = String.raw`(?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^/\\\n])+`;
const RE_TEST_EXEC = new RegExp(`/${RE_BODY}/[dgimsuvy]*(?=\\s*\\.\\s*(?:test|exec)\\s*\\()`, 'g');
const RE_STR_METHOD = new RegExp(
  `(\\.\\s*(?:match|matchAll|replace|replaceAll|split|search)\\s*\\(\\s*)/${RE_BODY}/[dgimsuvy]*`,
  'g',
);

function stripRegexMatchers(line: string): string {
  return line.replace(RE_TEST_EXEC, '/RE/').replace(RE_STR_METHOD, '$1/RE/');
}

function scan(file: string): Leak[] {
  const raw = readFileSync(file, 'utf8');
  const stripped = stripComments(raw);
  const leaks: Leak[] = [];
  const lines = stripped.split('\n').map(stripRegexMatchers);
  lines.forEach((line, i) => {
    if (/[А-Яа-яЁё]/.test(line)) {
      leaks.push({ file, line: i + 1, snippet: line.trim().slice(0, 100), kind: 'cyrillic' });
    } else if (UZ_MARKERS.some((m) => line.includes(m))) {
      leaks.push({ file, line: i + 1, snippet: line.trim().slice(0, 100), kind: 'uzbek' });
    }
  });
  return leaks;
}

describe('stripRegexMatchers — narrow enough to keep the guard sharp', () => {
  it('blanks a Cyrillic pattern that only MATCHES data (.test / .exec)', () => {
    const line = 'items.find((t) => /sotil|розничн|retail|продаж/i.test(t.name))';
    expect(/[А-Яа-яЁё]/.test(stripRegexMatchers(line))).toBe(false);
  });

  it('blanks a Cyrillic pattern passed to a String matcher', () => {
    expect(/[А-Яа-яЁё]/.test(stripRegexMatchers("s.replace(/сум/g, '')"))).toBe(false);
    expect(/[А-Яа-яЁё]/.test(stripRegexMatchers('s.split(/из/)'))).toBe(false);
  });

  it('STILL reports a real hardcoded label (the bug this file exists for)', () => {
    for (const leak of [
      '<span>Розничная цена</span>',
      "const label = 'Оплачено';",
      'placeholder="Контрагент"',
      // a regex that is NOT consumed as a matcher is not a matcher
      'const RE = /Наименование/;',
      // …and a label sitting on the same line as a legitimate matcher must
      // still be caught, or the strip would become a loophole.
      "/розничн/i.test(t.name) ? 'Розничная' : ''",
    ]) {
      expect(/[А-Яа-яЁё]/.test(stripRegexMatchers(leak)), leak).toBe(true);
    }
  });
});

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
