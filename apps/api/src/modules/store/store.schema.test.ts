import { describe, expect, it } from 'vitest';
import {
  CreateStoreSchema,
  StoreAddressFullSchema,
  StoreFilterSchema,
  UpdateStoreSchema,
} from './store.schema.js';

describe('CreateStoreSchema', () => {
  it('accepts a minimal store', () => {
    const r = CreateStoreSchema.safeParse({ name: 'Main warehouse' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.zones).toEqual([]);
      expect(r.data.slots).toEqual([]);
      expect(r.data.allowNegativeStock).toBe(false);
      expect(r.data.shared).toBe(false);
    }
  });

  it('coerces allowNegativeStock from string', () => {
    const r = CreateStoreSchema.safeParse({ name: 'X', allowNegativeStock: 'true' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.allowNegativeStock).toBe(true);
  });

  it('rejects empty name', () => {
    expect(CreateStoreSchema.safeParse({ name: '' }).success).toBe(false);
  });

  it('rejects > 50 zones', () => {
    const zones = Array.from({ length: 51 }, (_, i) => `Z${i}`);
    expect(CreateStoreSchema.safeParse({ name: 'X', zones }).success).toBe(false);
  });

  it('accepts parentId UUID', () => {
    const r = CreateStoreSchema.safeParse({
      name: 'Section A',
      parentId: '00000000-0000-0000-0000-000000000001',
    });
    expect(r.success).toBe(true);
  });

  it('rejects non-UUID parentId', () => {
    expect(CreateStoreSchema.safeParse({ name: 'X', parentId: 'abc' }).success).toBe(false);
  });

  it('treats empty addressFull fields as null', () => {
    const r = CreateStoreSchema.safeParse({
      name: 'X',
      addressFull: { city: 'Tashkent', street: '' },
    });
    expect(r.success).toBe(true);
    if (r.success && r.data.addressFull) {
      expect(r.data.addressFull.city).toBe('Tashkent');
      expect(r.data.addressFull.street).toBeNull();
    }
  });
});

describe('UpdateStoreSchema', () => {
  it('accepts partial (only zones) with the version token', () => {
    const r = UpdateStoreSchema.safeParse({ version: 1, zones: ['Cold', 'Frozen'] });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.zones).toEqual(['Cold', 'Frozen']);
  });

  it('REQUIRES version — optimistic-lock token cannot be silently omitted', () => {
    expect(UpdateStoreSchema.safeParse({}).success).toBe(false);
    expect(UpdateStoreSchema.safeParse({ zones: ['Cold'] }).success).toBe(false);
  });

  it('accepts version-only payload (no-op edit still bumps version)', () => {
    expect(UpdateStoreSchema.safeParse({ version: 1 }).success).toBe(true);
  });

  it('accepts null parentId (detach from hierarchy)', () => {
    const r = UpdateStoreSchema.safeParse({ version: 1, parentId: null });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.parentId).toBeNull();
  });
});

describe('StoreAddressFullSchema', () => {
  it('accepts all-optional payload', () => {
    expect(StoreAddressFullSchema.safeParse({}).success).toBe(true);
  });

  it('rejects too-long street', () => {
    expect(StoreAddressFullSchema.safeParse({ street: 'x'.repeat(256) }).success).toBe(false);
  });
});

describe('StoreFilterSchema', () => {
  it('coerces archived from "true" string', () => {
    const r = StoreFilterSchema.safeParse({ archived: 'true' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.archived).toBe(true);
  });

  it('coerces limit from string', () => {
    const r = StoreFilterSchema.safeParse({ limit: '10' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.limit).toBe(10);
  });

  it('rejects limit above max (500)', () => {
    expect(StoreFilterSchema.safeParse({ limit: 501 }).success).toBe(false);
  });

  it('accepts parentId filter', () => {
    const r = StoreFilterSchema.safeParse({
      parentId: '00000000-0000-0000-0000-000000000001',
    });
    expect(r.success).toBe(true);
  });
});
