import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Class-lock for the list-filter date-range Asia/Tashkent sweep (2026-06-13).
 *
 * Every API list/findAll WHERE builder that filtered a `@db.Timestamptz` column
 * by a date-only range used the buggy idiom
 *
 *   FIELD: {
 *     ...(filter.FROM ? { gte: new Date(filter.FROM) } : {}),
 *     ...(filter.TO ? { lte: new Date(`${filter.TO}T23:59:59.999Z`) } : {}),
 *   }
 *
 * which parses the date-only `to` as UTC midnight + a UTC end-of-day, dropping
 * the first 5h of the Tashkent `from` day and leaking 5h of the day after `to`
 * (UZ is fixed UTC+5). The demand list was fixed first (`b8b5e178`); this sweep
 * routed the remaining 31 services through `tashkentRangeBounds(from, to)` (the
 * half-open `[gte, lt)` Tashkent window — same family as `reportDateBounds`).
 *
 * EXCLUDED: `consignment.expiryDate` is the only filtered column that is
 * `@db.Date` (a pure calendar date, no time/tz) — its inclusive `lte:
 * new Date(expiryTo)` is CORRECT and a ±5h shift would be wrong, so the only
 * surviving `lte: new Date(filter.…)` in the tree is `filter.expiryTo`.
 *
 * Non-vacuous: before the sweep all 31 services contained `T23:59:59.999Z` and
 * did NOT import `tashkentRangeBounds`, so both halves below would have failed.
 */

const MODULES_DIR = join(__dirname, '..');

const stripTsComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.spec.ts')
    )
      out.push(full);
  }
  return out;
}

const sourceFiles = walk(MODULES_DIR);

/** The 31 services migrated to tashkentRangeBounds by the sweep. */
const MIGRATED = [
  'cash-in/cash-in.service.ts',
  'cash-out/cash-out.service.ts',
  'commission-report/commission-report.service.ts',
  'counterparty-adjustment/counterparty-adjustment.service.ts',
  'counterparty/counterparty.service.ts',
  'customer-order/customer-order.service.ts',
  'enter/enter.service.ts',
  'facture-in/facture-in.service.ts',
  'facture-out/facture-out.service.ts',
  'internal-order/internal-order.service.ts',
  'inventory/inventory.service.ts',
  'invoice-in/invoice-in.service.ts',
  'invoice-out/invoice-out.service.ts',
  'loss/loss.service.ts',
  'loyalty/loyalty.service.ts',
  'move/move.service.ts',
  'payment-in/payment-in.service.ts',
  'payment-out/payment-out.service.ts',
  'payroll/payroll.service.ts',
  'prepayment-return/prepayment-return.service.ts',
  'prepayment/prepayment.service.ts',
  'price-list/price-list.service.ts',
  'processing-order/processing-order.service.ts',
  'processing/processing.service.ts',
  'product/product.repository.ts',
  'production/production.service.ts',
  'purchase-order/purchase-order.service.ts',
  'purchase-return/purchase-return.service.ts',
  'sales-return/sales-return.service.ts',
  'service-desk/service-request.service.ts',
  'supply/supply.service.ts',
] as const;

describe('list date-tz sweep — antipattern is gone tree-wide', () => {
  it('no module service uses the UTC end-of-day `T23:59:59.999Z` idiom', () => {
    const offenders = sourceFiles.filter((f) =>
      stripTsComments(readFileSync(f, 'utf8')).includes('T23:59:59.999Z'),
    );
    expect(offenders).toEqual([]);
  });

  it('the only surviving `lte: new Date(filter.…)` is the @db.Date expiryTo', () => {
    const offenders = sourceFiles.filter((f) => {
      const code = stripTsComments(readFileSync(f, 'utf8'));
      // Any date-only `lte: new Date(filter.X)` other than expiryTo is the bug.
      const matches = code.match(/lte:\s*new Date\(filter\.(\w+)\)/g) ?? [];
      return matches.some((m) => !m.includes('expiryTo'));
    });
    expect(offenders).toEqual([]);
  });
});

describe('list date-tz sweep — migrated services use the shared helper', () => {
  for (const rel of MIGRATED) {
    describe(rel, () => {
      const raw = readFileSync(join(MODULES_DIR, rel), 'utf8');
      const code = stripTsComments(raw);

      it('imports tashkentRangeBounds from the shared util', () => {
        expect(raw).toMatch(
          /import \{ tashkentRangeBounds \} from '\.\.\/report\/report-date-bounds\.util\.js'/,
        );
      });

      it('calls tashkentRangeBounds(<query>.X, <query>.Y) for its date range(s)', () => {
        // MASTER-TODO #25: was hardcoded to a receiver named `filter`.
        // commission-report calls its query object `q`
        // (`tashkentRangeBounds(q.momentFrom, q.momentTo)`), so the guard
        // reported a missing tz-conversion that was in fact present. What must
        // hold is that BOTH range ends come from the same query object — not
        // what that object is called locally.
        expect(code).toMatch(/tashkentRangeBounds\((\w+)\.\w+,\s*\1\.\w+\)/);
      });
    });
  }
});
