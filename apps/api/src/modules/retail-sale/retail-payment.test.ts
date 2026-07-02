import { describe, expect, it } from 'vitest';
import { computeRetailPayment } from './retail-payment.js';

describe('computeRetailPayment - invariant #1 (paid = cash + card, exact)', () => {
  it('cash-only covers total exactly -> change 0', () => {
    const r = computeRetailPayment({ cashMinor: 100_00n, cardMinor: 0n, totalMinor: 100_00n });
    expect(r).toEqual({ ok: true, paidMinor: 100_00n, changeMinor: 0n });
  });

  it('card-only covers total exactly -> change 0', () => {
    const r = computeRetailPayment({ cashMinor: 0n, cardMinor: 250_00n, totalMinor: 250_00n });
    expect(r).toEqual({ ok: true, paidMinor: 250_00n, changeMinor: 0n });
  });

  it('mixed cash+card == total, tiyin-exact (no float drift)', () => {
    // 33.33 + 66.67 == 100.00 exactly
    const r = computeRetailPayment({ cashMinor: 33_33n, cardMinor: 66_67n, totalMinor: 100_00n });
    expect(r).toEqual({ ok: true, paidMinor: 100_00n, changeMinor: 0n });
  });

  it('exact past Number.MAX_SAFE_INTEGER (BigInt)', () => {
    const big = 9_007_199_254_740_993n; // 2^53 + 1
    const r = computeRetailPayment({ cashMinor: big, cardMinor: big, totalMinor: big });
    expect(r).toEqual({ ok: true, paidMinor: big * 2n, changeMinor: big });
  });
});

describe('invariant #2 - underpay is rejected (never silently posts)', () => {
  it('paid < total -> insufficient', () => {
    const r = computeRetailPayment({ cashMinor: 50_00n, cardMinor: 30_00n, totalMinor: 100_00n });
    expect(r).toEqual({
      ok: false,
      reason: 'insufficient',
      paidMinor: 80_00n,
      totalMinor: 100_00n,
    });
  });

  it('off-by-one tiyin underpay still rejected (exact boundary)', () => {
    const r = computeRetailPayment({ cashMinor: 99_99n, cardMinor: 0n, totalMinor: 100_00n });
    expect(r.ok).toBe(false);
    if (!r.ok && r.reason === 'insufficient') expect(r.paidMinor).toBe(99_99n);
  });

  it('zero payment vs positive total -> insufficient', () => {
    const r = computeRetailPayment({ cashMinor: 0n, cardMinor: 0n, totalMinor: 1n });
    expect(r.ok).toBe(false);
  });
});

describe('invariant #3 - change = paid - total, exact', () => {
  it('cash overpay -> change is the exact excess', () => {
    const r = computeRetailPayment({ cashMinor: 100_00n, cardMinor: 0n, totalMinor: 73_45n });
    expect(r).toEqual({ ok: true, paidMinor: 100_00n, changeMinor: 26_55n });
  });

  it('mixed overpay -> exact change', () => {
    const r = computeRetailPayment({ cashMinor: 60_00n, cardMinor: 50_00n, totalMinor: 100_00n });
    expect(r).toEqual({ ok: true, paidMinor: 110_00n, changeMinor: 10_00n });
  });

  it('zero total, zero paid -> ok, change 0 (degenerate but valid)', () => {
    expect(computeRetailPayment({ cashMinor: 0n, cardMinor: 0n, totalMinor: 0n })).toEqual({
      ok: true,
      paidMinor: 0n,
      changeMinor: 0n,
    });
  });
});

describe('invariant #4 - negative inputs rejected (defensive, total fn)', () => {
  it('negative cash / card / total -> negative-input', () => {
    expect(computeRetailPayment({ cashMinor: -1n, cardMinor: 0n, totalMinor: 10n }).ok).toBe(false);
    expect(computeRetailPayment({ cashMinor: 0n, cardMinor: -1n, totalMinor: 10n }).ok).toBe(false);
    expect(computeRetailPayment({ cashMinor: 10n, cardMinor: 0n, totalMinor: -1n }).ok).toBe(false);
    const r = computeRetailPayment({ cashMinor: -5n, cardMinor: 0n, totalMinor: 0n });
    expect(r).toEqual({ ok: false, reason: 'negative-input' });
  });
});
