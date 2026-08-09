import { describe, expect, it } from 'vitest';
import { computeVarianceLine, reverseVarianceCost } from './inventory.service.js';

/**
 * Faza 34 / STK-05 — Inventory.post variance + cost in exact BigInt, not float.
 *
 * Before: `Number(expectedQty)`, `Number(actualQty)`, `String(actualNum - expectedNum)`
 * written straight into a Decimal(20,6) column, plus `Math.round(Number(costBalance) / n)`
 * and `BigInt(Math.round(varianceNum * unitCostNum))`.
 */
describe('computeVarianceLine — «Пересчёт» variance (STK-05)', () => {
  it('writes a clean Decimal for the 0.1 + 0.2 class', () => {
    // Float: 0.3 - 0.1 = 0.19999999999999998 → String() → a 20-digit fraction
    // headed for a Decimal(20,6) column.
    expect(String(0.3 - 0.1)).toBe('0.19999999999999998');
    const line = computeVarianceLine({
      expectedQty: '0.100000',
      actualQty: '0.300000',
      costBalanceMinor: 0n,
      buyPriceMinor: 0n,
    });
    expect(line.varianceQty).toBe('0.2');
  });

  it('never emits exponent notation for sub-micro variance', () => {
    // Float: 1.0000001 - 1 = 1.0000000116860974e-7 → String() → "1.0000000116860974e-7",
    // which is not a Decimal literal at all.
    expect(String(1.0000001 - 1)).toContain('e-');
    const line = computeVarianceLine({
      expectedQty: '1.000000',
      actualQty: '1.000001',
      costBalanceMinor: 0n,
      buyPriceMinor: 0n,
    });
    expect(line.varianceQty).toBe('0.000001');
  });

  it('keeps the cost basis exact past 2^53 tiyin', () => {
    // Number(9007199254740993n) === 9007199254740992 — the odd tiyin is lost.
    expect(Number(9007199254740993n)).toBe(9007199254740992);
    const line = computeVarianceLine({
      expectedQty: '1',
      actualQty: '1',
      costBalanceMinor: 9007199254740993n,
      buyPriceMinor: 0n,
    });
    expect(line.unitCostMinor).toBe(9007199254740993n);
  });

  it('post → cancel is exactly zero-sum on the cost axis', () => {
    // 3 units @ 1000 tiyin basis recounted to 4 — the classic non-terminating
    // per-unit (333.33…) where round-then-multiply drifts.
    const line = computeVarianceLine({
      expectedQty: '3',
      actualQty: '4',
      costBalanceMinor: 1000n,
      buyPriceMinor: 0n,
    });
    expect(line.varianceQty).toBe('1');
    expect(line.varianceCostMinor).not.toBeNull();
    const reversal = reverseVarianceCost(line.varianceQty, line.unitCostMinor);
    expect(reversal).toBe(-(line.varianceCostMinor as bigint));
  });

  it('falls back to buyPrice when the store has no cost basis, and NULL-costs when neither exists', () => {
    const withBuyPrice = computeVarianceLine({
      expectedQty: '0',
      actualQty: '2',
      costBalanceMinor: 0n,
      buyPriceMinor: 1500n,
    });
    expect(withBuyPrice.unitCostMinor).toBe(1500n);
    expect(withBuyPrice.varianceCostMinor).toBe(3000n);
    expect(withBuyPrice.lineSumMinor).toBe(3000n);

    const noBasis = computeVarianceLine({
      expectedQty: '0',
      actualQty: '2',
      costBalanceMinor: 0n,
      buyPriceMinor: 0n,
    });
    expect(noBasis.unitCostMinor).toBe(0n);
    expect(noBasis.varianceCostMinor).toBeNull();
    expect(noBasis.lineSumMinor).toBe(0n);
    expect(reverseVarianceCost(noBasis.varianceQty, noBasis.unitCostMinor)).toBeNull();
  });

  it('signs the shortage side and its reversal symmetrically', () => {
    const shortage = computeVarianceLine({
      expectedQty: '10',
      actualQty: '7.5',
      costBalanceMinor: 20_000n,
      buyPriceMinor: 0n,
    });
    expect(shortage.varianceQty).toBe('-2.5');
    expect(shortage.unitCostMinor).toBe(2000n); // 20000 / 10
    expect(shortage.varianceCostMinor).toBe(-5000n); // −2.5 × 2000
    expect(shortage.lineSumMinor).toBe(15_000n); // 7.5 × 2000
    expect(reverseVarianceCost(shortage.varianceQty, shortage.unitCostMinor)).toBe(5000n);
  });
});
