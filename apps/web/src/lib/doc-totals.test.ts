import { describe, expect, it } from 'vitest';
import { docMeasureTotals, docTotals } from './doc-totals';

describe('docTotals', () => {
  // Backend stores sumMinor = GROSS (net + VAT) and vatSumMinor = VAT in BOTH
  // vatIncluded modes. The sidebar must show subtotal = net (sum − vat) and
  // total = gross (sum), regardless of the flag.

  it('vatIncluded=true: price 112 incl. 12% VAT → subtotal 100, total 112', () => {
    // Backend: sumMinor = 112 (gross), vatSumMinor = 12.
    expect(docTotals(112n, 12n)).toEqual({ subtotal: 100n, total: 112n });
  });

  it('vatIncluded=false: net 250 + 20% VAT → subtotal 250, total 300 (NOT net+2·VAT)', () => {
    // Backend: sumMinor = 300 (net 250 + VAT 50), vatSumMinor = 50 — the SAME
    // GROSS storage shape as the vatIncluded=true case above. Distinct numbers
    // (not a duplicate of the case above) so this assertion actually exercises
    // the arithmetic. The pre-fix per-page formula
    //   subtotal = vatIncluded ? sum − vat : sum   → 300 (gross, wrong)
    //   total    = vatIncluded ? sum       : sum + vat → 350 (net + 2·VAT, wrong)
    // double-counted VAT in this exact mode; guard against re-introducing it.
    const result = docTotals(300n, 50n);
    expect(result).toEqual({ subtotal: 250n, total: 300n });
    expect(result.total).not.toBe(300n + 50n); // old double-VAT total (350)
    expect(result.subtotal).not.toBe(300n); // old gross-as-subtotal
  });

  it('VAT disabled: vatSumMinor 0 → subtotal == total == sum', () => {
    expect(docTotals(100n, 0n)).toEqual({ subtotal: 100n, total: 100n });
  });

  it('empty document: 0 / 0', () => {
    expect(docTotals(0n, 0n)).toEqual({ subtotal: 0n, total: 0n });
  });

  it('realistic minor-units amount (no precision loss)', () => {
    // 15 000 000.00 som gross, 1 607 142.86 som VAT (12% incl.) in tiyin.
    expect(docTotals(1_500_000_000n, 160_714_286n)).toEqual({
      subtotal: 1_339_285_714n,
      total: 1_500_000_000n,
    });
  });
});

describe('docMeasureTotals — «Вес» / «Объём» footer', () => {
  it('sums per-unit measure × Кол-во, in the RAW unit (g / ml)', () => {
    // Deliberately NOT converted to kg/m³: the footer must equal the sum of the
    // per-line «Вес» column, which PositionTable renders as weightG × qty.
    expect(
      docMeasureTotals([
        { quantity: '2', weightG: 500, volumeML: 300 },
        { quantity: '3', weightG: 100, volumeML: 50 },
      ]),
    ).toEqual({ weight: 1300, volume: 750 });
  });

  it('hides a measure no position carries (services → no «Вес» row)', () => {
    expect(docMeasureTotals([{ quantity: '4', volumeML: 250 }])).toEqual({
      weight: null,
      volume: 1000,
    });
  });

  it('empty document hides both rows rather than showing 0', () => {
    expect(docMeasureTotals([])).toEqual({ weight: null, volume: null });
  });

  it('skips positions with no quantity instead of counting them as 1', () => {
    expect(docMeasureTotals([{ quantity: '0', weightG: 900 }])).toEqual({
      weight: null,
      volume: null,
    });
  });

  it('ignores a null/absent per-unit measure without poisoning the sum to NaN', () => {
    expect(
      docMeasureTotals([
        { quantity: '2', weightG: null },
        { quantity: '2', weightG: 250 },
      ]),
    ).toEqual({ weight: 500, volume: null });
  });

  it('rounds fractional-quantity drift to 3 dp', () => {
    // 0.1 × 3 = 0.30000000000000004 in IEEE-754 without the round.
    expect(docMeasureTotals([{ quantity: '3', weightG: 0.1 }]).weight).toBe(0.3);
  });

  it('treats a negative measure as absent (bad product data must not subtract)', () => {
    expect(docMeasureTotals([{ quantity: '2', weightG: -5 }])).toEqual({
      weight: null,
      volume: null,
    });
  });
});
