import { describe, expect, it } from 'vitest';
import { ConsignmentFilterSchema } from './consignment.schema.js';

describe('ConsignmentFilterSchema', () => {
  it('applies FEFO-friendly defaults (expiry asc)', () => {
    // Default sort is expiryDate ASC — the primary screen task is
    // «show what expires next». This is the contract clerks rely on.
    const p = ConsignmentFilterSchema.parse({});
    expect(p.limit).toBe(50);
    expect(p.sortBy).toBe('expiryDate');
    expect(p.sortDir).toBe('asc');
  });

  it('coerces expiredOnly + archived from query strings', () => {
    const p = ConsignmentFilterSchema.parse({
      expiredOnly: 'true',
      archived: 'false',
    });
    expect(p.expiredOnly).toBe(true);
    expect(p.archived).toBe(false);
  });

  it('exposes expiry range alongside expiredOnly — separate filters', () => {
    const p = ConsignmentFilterSchema.parse({
      expiryFrom: '2026-05-01',
      expiryTo: '2026-12-31',
    });
    expect(p.expiryFrom).toBe('2026-05-01');
    expect(p.expiryTo).toBe('2026-12-31');
  });

  it('accepts only documented sort fields', () => {
    for (const s of ['expiryDate', 'createdAt', 'name', 'label']) {
      expect(ConsignmentFilterSchema.parse({ sortBy: s }).sortBy).toBe(s);
    }
    expect(() => ConsignmentFilterSchema.parse({ sortBy: 'productId' })).toThrow();
    expect(() => ConsignmentFilterSchema.parse({ sortBy: 'barcodes' })).toThrow();
  });

  it('rejects non-UUID productId / variantId', () => {
    expect(() => ConsignmentFilterSchema.parse({ productId: 'sku-123' })).toThrow();
    expect(() => ConsignmentFilterSchema.parse({ variantId: 'red-large' })).toThrow();
  });

  it('caps search to 100 characters', () => {
    const long = 'x'.repeat(101);
    expect(() => ConsignmentFilterSchema.parse({ search: long })).toThrow();
  });

  it('clamps limit to [1, 500]', () => {
    expect(() => ConsignmentFilterSchema.parse({ limit: '0' })).toThrow();
    expect(() => ConsignmentFilterSchema.parse({ limit: '501' })).toThrow();
    expect(ConsignmentFilterSchema.parse({ limit: '500' }).limit).toBe(500);
  });
});
