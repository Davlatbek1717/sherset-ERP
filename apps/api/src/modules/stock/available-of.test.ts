import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { availableMicroOf, availableOf } from './stock.service.js';

/**
 * Faza 34 / STK-12 — «available = qty − reserved» has ONE definition.
 *
 * It used to be hand-rolled with `Math.max(0, Number(qty) - Number(reservedQty))`
 * in customer-order.getSupplyShortfall and internal-order.getSupplyShortfall,
 * while stock.assertAvailable did the same subtraction in exact BigInt
 * micro-units. On Decimal(20,6) fractional quantities the two disagree — and
 * the float one manufactures phantom shortfall lines.
 */
describe('availableOf — exact Decimal(20,6) «available»', () => {
  it('is exact where float subtraction is not (0.3 − 0.1)', () => {
    // The float path: 0.3 - 0.1 === 0.19999999999999998
    expect(0.3 - 0.1).not.toBe(0.2);
    expect(availableOf({ qty: '0.300000', reservedQty: '0.100000' })).toBe('0.2');
  });

  it('kills the phantom-shortfall line the float path invented', () => {
    // Order 0.2 of a product whose store holds 0.3 with 0.1 reserved.
    // Float: shortfall = 0.2 − 0.19999999999999998 = 2.8e-17 > 0 ⇒ a purchase
    // order line for ~0.000000000000000028 units. Exact: fully covered.
    const floatAvailable = Math.max(0, Number('0.300000') - Number('0.100000'));
    expect(0.2 - floatAvailable).toBeGreaterThan(0); // the bug, measured
    const availMicro = availableMicroOf({ qty: '0.300000', reservedQty: '0.100000' });
    const shortfallMicro = 200_000n - availMicro;
    expect(shortfallMicro).toBe(0n);
  });

  it('clamps at zero for the shortfall reading, but keeps the sign for shortages', () => {
    // Over-reserved / negative-stock row.
    expect(availableOf({ qty: '5', reservedQty: '8' })).toBe('0');
    expect(availableMicroOf({ qty: '5', reservedQty: '8' })).toBe(-3_000_000n);
    // A missing Stock row reads as nothing available.
    expect(availableOf(undefined)).toBe('0');
    expect(availableMicroOf(null)).toBe(0n);
  });

  it('survives quantities past float`s 2^53 exact-integer range', () => {
    // 9007199254740993 = 2^53 + 1 — not representable as a double.
    expect(availableOf({ qty: '9007199254740993', reservedQty: '1' })).toBe('9007199254740992');
  });
});

describe('STK-12 source-scan — no second copy of the formula', () => {
  const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

  for (const rel of [
    '../customer-order/customer-order.service.ts',
    '../internal-order/internal-order.service.ts',
  ]) {
    it(`${rel} derives «available» from stock.service, not Number()`, () => {
      const src = read(rel);
      expect(src).not.toMatch(/Number\(s\.qty\)\s*-\s*Number\(s\.reservedQty\)/);
      expect(src).toMatch(/availableOf/);
    });
  }
});
