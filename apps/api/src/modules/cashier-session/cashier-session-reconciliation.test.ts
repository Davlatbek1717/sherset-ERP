import { describe, expect, it } from 'vitest';
import {
  type ShiftCashInputs,
  expectedCashMinor,
  shiftDiscrepancyMinor,
} from './cashier-session-reconciliation.js';

const base: ShiftCashInputs = {
  openingCashMinor: 0n,
  salesCashMinor: 0n,
  drawerInMinor: 0n,
  drawerOutMinor: 0n,
  returnsCashMinor: 0n,
};

describe('expectedCashMinor — formula correctness', () => {
  it('opening + salesCash + drawerIn − drawerOut − returnsCash', () => {
    expect(
      expectedCashMinor({
        openingCashMinor: 500_00n,
        salesCashMinor: 1_200_00n,
        drawerInMinor: 300_00n,
        drawerOutMinor: 150_00n,
        returnsCashMinor: 80_00n,
      }),
    ).toBe(500_00n + 1_200_00n + 300_00n - 150_00n - 80_00n);
  });

  it('all zero → 0', () => {
    expect(expectedCashMinor(base)).toBe(0n);
  });
});

describe('§100 bug-fix invariant #1 — drawer in/out exactness', () => {
  it('drawerIn raises expected by EXACTLY drawerIn', () => {
    const without = expectedCashMinor({ ...base, openingCashMinor: 100_00n });
    const withIn = expectedCashMinor({
      ...base,
      openingCashMinor: 100_00n,
      drawerInMinor: 47_53n,
    });
    expect(withIn - without).toBe(47_53n);
  });

  it('drawerOut lowers expected by EXACTLY drawerOut', () => {
    const without = expectedCashMinor({ ...base, openingCashMinor: 100_00n });
    const withOut = expectedCashMinor({
      ...base,
      openingCashMinor: 100_00n,
      drawerOutMinor: 63_21n,
    });
    expect(without - withOut).toBe(63_21n);
  });
});

describe('invariant #2 — drawer=0 byte-identical to the OLD formula (zero regression)', () => {
  it('reduces to opening + sales − returns when no drawer ops', () => {
    const cases: Array<[bigint, bigint, bigint]> = [
      [0n, 0n, 0n],
      [500_00n, 1_000_00n, 75_00n],
      [10n, 999_999_99n, 1n],
    ];
    for (const [opening, sales, returns] of cases) {
      expect(
        expectedCashMinor({
          ...base,
          openingCashMinor: opening,
          salesCashMinor: sales,
          returnsCashMinor: returns,
        }),
      ).toBe(opening + sales - returns); // the pre-§100 formula
    }
  });
});

describe('shiftDiscrepancyMinor — invariant #3 (sign + exactness)', () => {
  it('closing − expected; positive = surplus', () => {
    const i: ShiftCashInputs = { ...base, openingCashMinor: 100_00n, salesCashMinor: 50_00n };
    expect(shiftDiscrepancyMinor(160_00n, i)).toBe(10_00n); // surplus
    expect(shiftDiscrepancyMinor(150_00n, i)).toBe(0n); // exact
    expect(shiftDiscrepancyMinor(140_00n, i)).toBe(-10_00n); // shortage
  });

  it('drawer ops feed through to discrepancy exactly', () => {
    // expected = 100 + 0 + 30 − 20 − 0 = 110; closing 105 ⇒ −5 shortage
    expect(
      shiftDiscrepancyMinor(105_00n, {
        ...base,
        openingCashMinor: 100_00n,
        drawerInMinor: 30_00n,
        drawerOutMinor: 20_00n,
      }),
    ).toBe(-5_00n);
  });
});

describe('invariant #4 — BigInt exactness + no clamping', () => {
  it('exact past Number.MAX_SAFE_INTEGER', () => {
    const big = 9_007_199_254_740_993n; // 2^53 + 1
    expect(expectedCashMinor({ ...base, openingCashMinor: big, salesCashMinor: big })).toBe(
      big * 2n,
    );
  });

  it('over-withdrawal yields a NEGATIVE expected (must NOT clamp to 0)', () => {
    expect(expectedCashMinor({ ...base, openingCashMinor: 50_00n, drawerOutMinor: 200_00n })).toBe(
      -150_00n,
    );
  });

  it('returns exceeding takings → negative expected, exact', () => {
    expect(expectedCashMinor({ ...base, salesCashMinor: 100n, returnsCashMinor: 500n })).toBe(
      -400n,
    );
  });
});
