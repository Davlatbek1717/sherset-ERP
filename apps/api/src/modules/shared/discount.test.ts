import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { discountPercent } from './discount.js';

/**
 * Guard for the position-discount upper-bound fix (2026-06-13, demands HIGH #3).
 *
 * The 8 document schemas carried an unbounded `/^\d+(\.\d{1,2})?$/` discount
 * regex, so `'150'` parsed and `computeTotals` applied it as a percentage —
 * `(100 - 150)` → a NEGATIVE line total that cascaded into profit, the «Оплата»
 * status and the linked order's shippedSum. customer-orders already capped it
 * (`z.number().max(100)`); the shared `discountPercent` now caps the other 8.
 *
 * Non-vacuous: `'150'`/`'100.01'` rejection FAILS against the old unbounded
 * regex (which had no refine); `'12.5'`/`'100'` still pass.
 */

describe('discountPercent — caps a position discount at 100%', () => {
  it.each(['0', '10', '12.5', '99.99', '100', 100, '0.5'])('accepts %s', (v) => {
    expect(discountPercent.safeParse(v).success).toBe(true);
  });

  it.each(['150', '100.01', '101', 200, '999.99'])('rejects %s (exceeds 100%)', (v) => {
    expect(discountPercent.safeParse(v).success).toBe(false);
  });

  it.each(['-5', 'abc', '', '1.234', '12,5'])('rejects malformed %s', (v) => {
    expect(discountPercent.safeParse(v).success).toBe(false);
  });

  it('keeps the value as a string (BigInt-safe, no float coercion)', () => {
    const r = discountPercent.safeParse('12.50');
    expect(r.success && r.data).toBe('12.50');
  });
});

describe('every document schema routes discount through discountPercent (no regression to unbounded)', () => {
  const SCHEMAS = [
    'demand/demand.schema.ts',
    'supply/supply.schema.ts',
    'invoice-in/invoice-in.schema.ts',
    'invoice-out/invoice-out.schema.ts',
    'sales-return/sales-return.schema.ts',
    'purchase-return/purchase-return.schema.ts',
    'purchase-order/purchase-order.schema.ts',
    'retail-sale/retail-sale.schema.ts',
  ];
  // apps/api/src/modules/shared/ -> apps/api/src/modules/
  const MODULES = join(__dirname, '..');

  for (const rel of SCHEMAS) {
    it(`${rel} imports + uses discountPercent`, () => {
      const src = readFileSync(join(MODULES, rel), 'utf8');
      expect(src).toContain("from '../shared/discount.js'");
      expect(src).toContain('discountPercent');
      // must NOT reintroduce an unbounded inline discount regex
      expect(src).not.toMatch(/discount:\s*z\.coerce\s*\.string\(\)\s*\.regex/);
    });
  }
});
