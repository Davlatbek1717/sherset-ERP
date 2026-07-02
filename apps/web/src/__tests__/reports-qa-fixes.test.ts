import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Phase-4 reports QA regression guard (2026-06-13).
 *
 * Locks the three runtime-bug classes found by the reports adversarial-QA
 * workflow and fixed in this commit. Each assertion FAILED before the fix
 * (non-vacuous). Full finding list: docs/audits/_PHASE4-REPORTS-QA-2026-06-13.md.
 */

const SVC = (f: string) =>
  readFileSync(join(__dirname, '..', '..', '..', 'api', 'src', 'modules', 'report', f), 'utf8');
const FE = (f: string) => readFileSync(join(__dirname, '..', 'app', '(app)', 'reports', f), 'utf8');

describe('store-filter: $queryRaw must inline the fragment via Prisma, never bind a SQL string', () => {
  for (const f of ['slow-movers.service.ts', 'inventory-variance.service.ts']) {
    const src = SVC(f);
    it(`${f} uses Prisma.sql/empty, not the ":: 'TRUE'}::boolean" injection`, () => {
      // regression ban: the broken JS-string fragment cast to ::boolean
      expect(src).not.toMatch(/:\s*'TRUE'\s*\}\s*::boolean/);
      // positive: the corrected fragment
      expect(src).toMatch(/Prisma\.empty/);
      expect(src).toMatch(/Prisma\.sql`AND \w+\.store_id = \$\{filter\.storeId\}::uuid`/);
    });
  }
});

describe('qty: SUM(Decimal) text is parsed with Number, never BigInt (would crash on "N.000000")', () => {
  for (const f of ['sales-by-channel.service.ts', 'sales-by-hour.service.ts']) {
    const src = SVC(f);
    it(`${f} accumulates qty with Number, not BigInt`, () => {
      expect(src).not.toMatch(/BigInt\(r\.qty/);
      expect(src).toMatch(/Number\(r\.qty/);
    });
    it(`${f} de-fans revenue (no LEFT JOIN demand_positions in the channel/hour query)`, () => {
      // the fan-out join was removed; qty now comes from a correlated subquery
      expect(src).not.toMatch(/LEFT JOIN demand_positions/);
      expect(src).toMatch(/SELECT COALESCE\(SUM\(dp\.quantity\), 0\)/);
    });
  }
  it('average-basket.service.ts de-fans revenue (correlated subquery, no position join)', () => {
    const src = SVC('average-basket.service.ts');
    expect(src).not.toMatch(/LEFT JOIN demand_positions/);
    expect(src).toMatch(/SELECT COALESCE\(SUM\(dp\.quantity\), 0\)/);
  });
});

describe('percent: FE must NOT multiply an already-percent BE value by 100', () => {
  it('returns-ratio renders ratio without *100 (BE returns 0..1000 percent)', () => {
    const src = FE('returns-ratio/page.tsx');
    expect(src).not.toMatch(/ratio\s*\*\s*100/);
    expect(src).not.toMatch(/\.ratio\s*\*\s*100/);
  });
  it('abc-analysis renders share/cumulativeShare without *100 (BE returns 0..100 percent)', () => {
    const src = FE('abc-analysis/page.tsx');
    expect(src).not.toMatch(/\.share\s*\*\s*100/);
    expect(src).not.toMatch(/cumulativeShare\s*\*\s*100/);
  });
});

describe('date-tz: dateFrom/dateTo reports use Tashkent-day bounds, never raw `<= dateTo`/setHours', () => {
  const SERVICES = [
    'report.service.ts',
    'cash-flow.service.ts',
    'pnl.service.ts',
    'profitability.service.ts',
    'purchase-management.service.ts',
    'unit-economics.service.ts',
  ];
  for (const f of SERVICES) {
    const src = SVC(f);
    it(`${f} uses reportDateBounds and has no raw moment<=dateTo / setHours guard`, () => {
      expect(src).toMatch(/reportDateBounds\(filter\.dateFrom, filter\.dateTo\)/);
      // regression bans: the two buggy shapes
      expect(src).not.toMatch(/moment\s*<=\s*\$\{?(filter\.)?dateTo/);
      expect(src).not.toMatch(/lte:\s*filter\.dateTo/);
      expect(src).not.toMatch(/setHours\(23,\s*59,\s*59/);
    });
  }
});
