import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Faza Q16 — wiring guard for the two report-visibility banners.
 *
 * `report-notices.test.tsx` proves the COMPONENTS behave; this file proves
 * they are actually MOUNTED, which is the half that regressed for two whole
 * phases. `truncated` and `unconvertedByCurrency` shipped on the wire in
 * Faza 27a / Faza Q5 / Faza 17 / Faza Q8 and no page ever read them — every
 * gate stayed green because an unread API field breaks nothing that compiles.
 *
 * Two invariants per page:
 *  1. the notice component is imported AND rendered;
 *  2. the page's own response interface declares the field it feeds it —
 *     otherwise the prop is a permanent `undefined` and the banner is dead
 *     code that renders nothing forever (exactly the pre-Q16 state).
 *
 * Plus: i18n key existence for the component itself. `i18n-key-existence.test.ts`
 * walks `app/(app)` ONLY, so `components/**` t-calls are unguarded — the same
 * hole `pos-i18n-guard.test.ts` was created for (Faza 32). A typo'd key here
 * would render the literal `report_notices.truncated` inside the banner.
 */

const SRC = join(__dirname, '..');
const APP = join(SRC, 'app', '(app)');
const RU = JSON.parse(readFileSync(join(SRC, 'messages', 'ru.json'), 'utf8'));
const UZ = JSON.parse(readFileSync(join(SRC, 'messages', 'uz.json'), 'utf8'));

const NOTICES_MODULE = '@/components/reports/report-notices';

const read = (f: string) => readFileSync(f, 'utf8');
const page = (...seg: string[]) => join(APP, ...seg, 'page.tsx');

/** Pages whose API response carries `truncated` (Faza 27a + Faza Q5). */
const TRUNCATED_PAGES: Array<{ label: string; file: string }> = [
  { label: '/reports/stock-balance', file: page('reports', 'stock-balance') },
  { label: '/reports/counterparty-balance', file: page('reports', 'counterparty-balance') },
  { label: '/analitika/mahsulotlar', file: page('analitika', 'mahsulotlar') },
];

/**
 * Pages whose API response carries `unconvertedByCurrency` — the 12 report
 * services from Faza 17 + Faza Q8 (verified one by one against
 * `apps/api/src/modules/report/*.service.ts`), plus the homepage dashboard,
 * which grew the field in this phase and shows TWO banners (overdue invoices
 * and the money section).
 */
const UNCONVERTED_PAGES: Array<{ label: string; file: string; count: number }> = [
  { label: '/reports/aging', file: page('reports', 'aging'), count: 1 },
  { label: '/reports/average-basket', file: page('reports', 'average-basket'), count: 1 },
  { label: '/reports/cash-flow', file: page('reports', 'cash-flow'), count: 1 },
  {
    label: '/reports/counterparty-balance',
    file: page('reports', 'counterparty-balance'),
    count: 1,
  },
  { label: '/reports/pnl', file: page('reports', 'pnl'), count: 1 },
  { label: '/reports/profitability', file: page('reports', 'profitability'), count: 1 },
  {
    label: '/reports/purchase-management',
    file: page('reports', 'purchase-management'),
    count: 1,
  },
  { label: '/reports/sales', file: page('reports', 'sales'), count: 1 },
  { label: '/reports/sales-by-channel', file: page('reports', 'sales-by-channel'), count: 1 },
  { label: '/reports/sales-by-hour', file: page('reports', 'sales-by-hour'), count: 1 },
  { label: '/reports/unit-economics', file: page('reports', 'unit-economics'), count: 1 },
  { label: '/reports/warehouse-ops', file: page('reports', 'warehouse-ops'), count: 1 },
  { label: '/ (dashboard)', file: join(APP, 'page.tsx'), count: 2 },
];

describe('Faza Q16 — truncated banner wiring', () => {
  for (const { label, file } of TRUNCATED_PAGES) {
    it(`${label} reads \`truncated\` and mounts <TruncatedNotice>`, () => {
      const src = read(file);
      expect(src).toContain(NOTICES_MODULE);
      expect(src).toContain('TruncatedNotice');
      expect(src).toMatch(/<TruncatedNotice/);
      // Field must exist in the page's own response type, or the prop is
      // permanently undefined and the banner can never fire.
      expect(src).toMatch(/truncated\??:\s*boolean/);
    });
  }
});

describe('Faza Q16 — unconverted-currency banner wiring', () => {
  for (const { label, file, count } of UNCONVERTED_PAGES) {
    it(`${label} reads \`unconvertedByCurrency\` and mounts <UnconvertedNotice>×${count}`, () => {
      const src = read(file);
      expect(src).toContain(NOTICES_MODULE);
      expect(src.match(/<UnconvertedNotice/g)?.length ?? 0).toBe(count);
      expect(src).toMatch(/unconvertedByCurrency\??:/);
    });
  }
});

describe('Faza Q16 — report-notices i18n keys exist in ru + uz', () => {
  const file = join(SRC, 'components', 'reports', 'report-notices.tsx');
  const src = readFileSync(file, 'utf8');

  const ns = src.match(/useTranslations\('([^']+)'\)/)?.[1];

  it('resolves its namespace', () => {
    expect(ns).toBe('report_notices');
  });

  const keys = Array.from(src.matchAll(/\bt\('([^']+)'/g), (m) => m[1] as string);

  it('calls at least the three banner keys', () => {
    expect(new Set(keys)).toEqual(new Set(['truncated', 'unconverted_title', 'unconverted_row']));
  });

  for (const key of new Set(keys)) {
    it(`\`${ns}.${key}\` exists in both locales`, () => {
      const path = `${ns}.${key}`;
      const at = (b: unknown) =>
        path.split('.').reduce<unknown>((acc, k) => (acc as Record<string, unknown>)?.[k], b);
      expect(typeof at(RU), `ru.json → ${path}`).toBe('string');
      expect(typeof at(UZ), `uz.json → ${path}`).toBe('string');
    });
  }
});
