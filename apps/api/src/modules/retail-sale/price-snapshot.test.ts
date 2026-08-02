import { describe, expect, it } from 'vitest';
import {
  resolveBasePriceMinor,
  snapshotPrices,
  snapshotPricesByProduct,
} from './price-snapshot.js';

const DEFAULT_TYPE = 'pt-retail';
const WHOLESALE_TYPE = 'pt-wholesale';

describe('resolveBasePriceMinor — the three-step ladder', () => {
  it('prefers the real default PriceType id', () => {
    expect(
      resolveBasePriceMinor(
        [
          { priceTypeId: WHOLESALE_TYPE, value: '2800000' },
          { priceTypeId: DEFAULT_TYPE, value: '3600000' },
        ],
        DEFAULT_TYPE,
      ),
    ).toBe(3_600_000n);
  });

  it('falls back to the legacy "default" sentinel when the id is unknown', () => {
    // Older rows stored the tier by sentinel, before real ids existed. The POS
    // screen reads them, so the freeze has to as well — otherwise the frozen
    // base price silently differs from the price the cashier saw.
    expect(
      resolveBasePriceMinor(
        [
          { priceTypeId: 'wholesale', value: '2800000' },
          { priceTypeId: 'default', value: '3600000' },
        ],
        DEFAULT_TYPE,
      ),
    ).toBe(3_600_000n);
  });

  it('falls back to the first listed price as a last resort', () => {
    expect(resolveBasePriceMinor([{ priceTypeId: 'pt-other', value: '1234' }], DEFAULT_TYPE)).toBe(
      1234n,
    );
  });

  it('returns NULL — not 0 — for a product with no prices', () => {
    expect(resolveBasePriceMinor([], DEFAULT_TYPE)).toBeNull();
    expect(resolveBasePriceMinor(null, DEFAULT_TYPE)).toBeNull();
    expect(resolveBasePriceMinor(undefined, DEFAULT_TYPE)).toBeNull();
  });

  it('returns NULL for an empty or malformed stored value instead of throwing', () => {
    // A bad JSON value must not fail the sale — the cashier is at the till.
    expect(
      resolveBasePriceMinor([{ priceTypeId: DEFAULT_TYPE, value: '' }], DEFAULT_TYPE),
    ).toBeNull();
    expect(
      resolveBasePriceMinor([{ priceTypeId: DEFAULT_TYPE, value: '12.5' }], DEFAULT_TYPE),
    ).toBeNull();
    expect(
      resolveBasePriceMinor([{ priceTypeId: DEFAULT_TYPE, value: undefined }], DEFAULT_TYPE),
    ).toBeNull();
  });

  it('keeps a genuine 0 as 0 — a free item is not an unknown item', () => {
    expect(resolveBasePriceMinor([{ priceTypeId: DEFAULT_TYPE, value: '0' }], DEFAULT_TYPE)).toBe(
      0n,
    );
  });
});

describe('snapshotPrices', () => {
  it('takes cost straight off the card and resolves the retail tier', () => {
    expect(
      snapshotPrices(
        {
          buyPrice: 2_480_000n,
          salePrices: [{ priceTypeId: DEFAULT_TYPE, value: '3600000' }],
        },
        DEFAULT_TYPE,
      ),
    ).toEqual({ costMinor: 2_480_000n, basePriceMinor: 3_600_000n });
  });

  it('yields NULL cost when the card carries no buyPrice', () => {
    expect(
      snapshotPrices({ buyPrice: null, salePrices: [{ priceTypeId: DEFAULT_TYPE, value: '10' }] }),
    ).toEqual({ costMinor: null, basePriceMinor: 10n });
  });

  it('yields an all-NULL snapshot for a missing product', () => {
    expect(snapshotPrices(null)).toEqual({ costMinor: null, basePriceMinor: null });
    expect(snapshotPrices(undefined)).toEqual({ costMinor: null, basePriceMinor: null });
  });
});

describe('snapshotPricesByProduct', () => {
  it('keys the snapshot by product id', () => {
    const map = snapshotPricesByProduct(
      [
        { id: 'p1', buyPrice: 100n, salePrices: [{ priceTypeId: DEFAULT_TYPE, value: '300' }] },
        { id: 'p2', buyPrice: null, salePrices: null },
      ],
      DEFAULT_TYPE,
    );
    expect(map.get('p1')).toEqual({ costMinor: 100n, basePriceMinor: 300n });
    expect(map.get('p2')).toEqual({ costMinor: null, basePriceMinor: null });
    expect(map.get('missing')).toBeUndefined();
  });
});
