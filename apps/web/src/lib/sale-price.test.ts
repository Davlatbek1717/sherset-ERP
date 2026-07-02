import { describe, expect, it } from 'vitest';
import { resolveDefaultSalePrice, resolveDefaultSalePriceOrZero } from './sale-price';

describe('resolveDefaultSalePrice', () => {
  const realId = '712de53f-3bd4-4ec9-a009-14266b5c0671';

  it('matches the real default price-type id when known', () => {
    const sp = [
      { priceTypeId: 'c98c-wholesale', value: '999' },
      { priceTypeId: realId, value: '500' },
    ];
    expect(resolveDefaultSalePrice(sp, realId)).toBe('500');
  });

  it('falls back to the legacy "default" sentinel when the id is unknown', () => {
    const sp = [{ priceTypeId: 'default', value: '300' }];
    expect(resolveDefaultSalePrice(sp)).toBe('300');
    // also when an id is passed but not present (mid-migration data)
    expect(resolveDefaultSalePrice(sp, realId)).toBe('300');
  });

  it('falls back to the first entry when neither id nor sentinel match', () => {
    const sp = [{ priceTypeId: 'some-other-id', value: '700' }];
    expect(resolveDefaultSalePrice(sp, realId)).toBe('700');
  });

  it('returns null for empty / missing prices', () => {
    expect(resolveDefaultSalePrice([])).toBeNull();
    expect(resolveDefaultSalePrice(null)).toBeNull();
    expect(resolveDefaultSalePrice(undefined)).toBeNull();
  });

  it('OrZero variant yields "0" instead of null', () => {
    expect(resolveDefaultSalePriceOrZero(null)).toBe('0');
    expect(resolveDefaultSalePriceOrZero([{ priceTypeId: 'default', value: '42' }])).toBe('42');
  });

  it('prefers the real id over the sentinel when both are present', () => {
    const sp = [
      { priceTypeId: 'default', value: '111' },
      { priceTypeId: realId, value: '222' },
    ];
    expect(resolveDefaultSalePrice(sp, realId)).toBe('222');
  });
});
