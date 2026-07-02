import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Class-lock for the report date-range Asia/Tashkent fix (2026-06-13).
 *
 * The six "from/to"-convention report services parsed a date-only `to`
 * ("2026-05-31" → UTC midnight) and filtered `moment <= to`, which DROPPED
 * every document on the last picked calendar day (its real moment is after
 * 00:00Z, and at UTC+5 the whole local day is lost). The dateFrom/dateTo
 * siblings (report/cash-flow/pnl/profitability/purchase-management/
 * unit-economics) were already routed through `reportDateBounds` in
 * `07861c58`; this pins the remaining six to the SAME half-open
 * `[gte, lt)` window so the boundary cannot regress to `moment <= to`.
 *
 * Found by the Phase-4 reports adversarial QA (_PHASE4-REPORTS-QA-2026-06-13.md):
 * abc-analysis / returns-ratio / sales-by-channel / sales-by-hour /
 * inventory-variance / average-basket all shared the off-by-one upper bound.
 *
 * Non-vacuous: before the fix every file contained `moment <= ${to}` (or, for
 * average-basket's $queryRawUnsafe, `moment <= $4`) and did NOT import
 * `reportDateBounds`, so each assertion below would have failed.
 */

// Strip comments first — the fixed services keep an explanatory comment that
// literally contains "moment <= to" to describe the bug being removed, so a raw
// scan would match the explanation, not a live SQL clause.
const stripTsComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/** The six report services migrated off the unrolled `moment <= to` bound. */
const SERVICES = [
  'abc-analysis.service.ts',
  'returns-ratio.service.ts',
  'sales-by-channel.service.ts',
  'sales-by-hour.service.ts',
  'inventory-variance.service.ts',
  'average-basket.service.ts',
] as const;

describe('report from/to services use the Asia/Tashkent half-open window', () => {
  for (const file of SERVICES) {
    describe(file, () => {
      const raw = readFileSync(join(__dirname, file), 'utf8');
      const code = stripTsComments(raw);

      it('imports the shared reportDateBounds util', () => {
        expect(raw).toMatch(/from '\.\/report-date-bounds\.util\.js'/);
        expect(raw).toContain('reportDateBounds');
      });

      it('derives the [gte, lt) window from (from, to)', () => {
        expect(code).toMatch(/reportDateBounds\(\s*from\s*,\s*to\s*\)/);
      });

      it('no longer filters with the day-dropping `moment <= to` upper bound', () => {
        // Covers both the tagged-template `moment <= ${to}` and the
        // $queryRawUnsafe positional `moment <= $4`. Any `moment <=` is the
        // old inclusive-midnight bug; the fix uses `moment < ${lt}` / `< $4`.
        expect(code).not.toMatch(/moment\s*<=/);
      });

      it('uses the exclusive upper bound (`moment < lt`)', () => {
        expect(code).toMatch(/moment\s*<\s*\$(?:\{lt\}|4\b)/);
      });
    });
  }
});
