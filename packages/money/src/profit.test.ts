import { describe, expect, it } from 'vitest';
import {
  classifyPrice,
  formatPercent,
  lineProfitMinor,
  marginPercent,
  markdownMinor,
  sumCostMinor,
} from './profit.js';

/**
 * The whole point of these figures is that they must not lie about an unknown
 * cost. Most of what follows pins down the NULL contract rather than the
 * arithmetic — the arithmetic is one line, the contract is what breaks.
 */

describe('lineProfitMinor', () => {
  it('computes (price − cost) × qty', () => {
    expect(lineProfitMinor({ priceMinor: 3_240_000n, costMinor: 2_480_000n, quantity: 2n })).toBe(
      1_520_000n,
    );
  });

  it('returns NULL — not 0 — when the cost is unknown', () => {
    expect(lineProfitMinor({ priceMinor: 3_240_000n, costMinor: null, quantity: 2n })).toBeNull();
  });

  it('treats a real zero cost as a real number (100% profit), unlike NULL', () => {
    expect(lineProfitMinor({ priceMinor: 500n, costMinor: 0n, quantity: 3n })).toBe(1500n);
  });

  it('reports selling below cost as a negative profit (allowed, kassa TZ Q16)', () => {
    expect(lineProfitMinor({ priceMinor: 2_000_000n, costMinor: 2_480_000n, quantity: 1n })).toBe(
      -480_000n,
    );
  });

  it('stays exact past 2^53, where Number would silently drift', () => {
    const price = 9_007_199_254_740_993n; // 2^53 + 1
    expect(lineProfitMinor({ priceMinor: price, costMinor: 1n, quantity: 1n })).toBe(price - 1n);
  });
});

describe('sumCostMinor', () => {
  it('sums cost × qty and reports completeness', () => {
    expect(
      sumCostMinor([
        { costMinor: 100n, quantity: 2n },
        { costMinor: 50n, quantity: 3n },
      ]),
    ).toEqual({ costMinor: 350n, complete: true });
  });

  it('flags incomplete and EXCLUDES the unknown line from the sum', () => {
    // The excluded line is why `complete` matters: 100 is a true partial cost,
    // but presenting revenue − 100 as profit would over-report it.
    expect(
      sumCostMinor([
        { costMinor: 100n, quantity: 1n },
        { costMinor: null, quantity: 5n },
      ]),
    ).toEqual({ costMinor: 100n, complete: false });
  });

  it('is complete-and-zero for an empty cart, not incomplete', () => {
    expect(sumCostMinor([])).toEqual({ costMinor: 0n, complete: true });
  });
});

describe('marginPercent', () => {
  it('gives one decimal place', () => {
    // 760000 / 2480000 = 30.645… → 30.6
    expect(marginPercent(760_000n, 2_480_000n)).toBe(30.6);
  });

  it('ROUNDS instead of truncating (brauzer-QA 2026-08-02)', () => {
    // 1300/26100 = 4.98% — truncation printed «4.9%», always shaving the
    // profit and flattering the loss. Both directions are checked so the fix
    // can't be a one-sided hack.
    expect(marginPercent(1300n, 26_100n)).toBe(5);
    expect(marginPercent(4200n, 29_000n)).toBe(14.5); // 14.48…
    expect(marginPercent(-1300n, 26_100n)).toBe(-5); // away from zero
  });

  it('is NULL when profit is unknown', () => {
    expect(marginPercent(null, 1000n)).toBeNull();
  });

  it('is NULL when revenue is zero — no denominator, not "0%"', () => {
    expect(marginPercent(0n, 0n)).toBeNull();
  });

  it('goes negative for a loss', () => {
    expect(marginPercent(-500n, 1000n)).toBe(-50);
  });
});

describe('formatPercent', () => {
  it('uses a COMMA, matching the money formatter on the same line', () => {
    // Brauzer-QA: «-800,00 сум (-3.3%)» — pul vergul, foiz nuqta bilan edi.
    expect(formatPercent(-3.3)).toBe('-3,3%');
    expect(formatPercent(30.6)).toBe('30,6%');
  });

  it('drops a pointless trailing zero', () => {
    expect(formatPercent(100)).toBe('100%');
    expect(formatPercent(5)).toBe('5%');
  });

  it('keeps exactly one decimal', () => {
    expect(formatPercent(14.48)).toBe('14,5%');
  });
});

describe('markdownMinor', () => {
  it('measures how far below the card price the line was sold', () => {
    expect(
      markdownMinor({ basePriceMinor: 3_600_000n, priceMinor: 3_240_000n, quantity: 2n }),
    ).toBe(720_000n);
  });

  it('goes negative when the cashier sold ABOVE the card price', () => {
    expect(markdownMinor({ basePriceMinor: 1000n, priceMinor: 1200n, quantity: 1n })).toBe(-200n);
  });

  it('is NULL when the card has no base price', () => {
    expect(markdownMinor({ basePriceMinor: null, priceMinor: 1200n, quantity: 1n })).toBeNull();
  });
});

describe('classifyPrice', () => {
  const cost = 2_480_000n;
  const wholesale = 2_800_000n;

  it('is ok at or above the wholesale floor', () => {
    expect(
      classifyPrice({ priceMinor: 3_240_000n, costMinor: cost, wholesaleMinor: wholesale }),
    ).toBe('ok');
    expect(
      classifyPrice({ priceMinor: wholesale, costMinor: cost, wholesaleMinor: wholesale }),
    ).toBe('ok');
  });

  it('warns below the wholesale floor', () => {
    expect(
      classifyPrice({ priceMinor: 2_700_000n, costMinor: cost, wholesaleMinor: wholesale }),
    ).toBe('below-wholesale');
  });

  it('is ok exactly AT cost — break-even is not a loss', () => {
    expect(classifyPrice({ priceMinor: cost, costMinor: cost, wholesaleMinor: null })).toBe('ok');
  });

  it('reports loss — not below-wholesale — when the price is under both floors', () => {
    expect(
      classifyPrice({ priceMinor: 2_000_000n, costMinor: cost, wholesaleMinor: wholesale }),
    ).toBe('loss');
  });

  it('raises NO warning when both floors are unknown', () => {
    expect(classifyPrice({ priceMinor: 1n, costMinor: null, wholesaleMinor: null })).toBe('ok');
  });

  it('still catches a loss when only the cost is known', () => {
    expect(classifyPrice({ priceMinor: 1n, costMinor: 100n, wholesaleMinor: null })).toBe('loss');
  });
});
