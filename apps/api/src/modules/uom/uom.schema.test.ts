import { describe, expect, it } from 'vitest';
import { CreateUomSchema, UomFilterSchema, UpdateUomSchema } from './uom.schema.js';

describe('CreateUomSchema', () => {
  it('accepts minimal payload', () => {
    const r = CreateUomSchema.safeParse({ name: 'шт' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.shared).toBe(true);
    }
  });

  it('rejects empty name', () => {
    expect(CreateUomSchema.safeParse({ name: '' }).success).toBe(false);
  });

  it('rejects name > 100 chars', () => {
    expect(CreateUomSchema.safeParse({ name: 'a'.repeat(101) }).success).toBe(false);
  });

  it('accepts optional code and externalCode', () => {
    const r = CreateUomSchema.safeParse({ name: 'кг', code: '166', externalCode: 'kg-ext' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.code).toBe('166');
      expect(r.data.externalCode).toBe('kg-ext');
    }
  });

  it('accepts shared=false', () => {
    const r = CreateUomSchema.safeParse({ name: 'м', shared: false });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.shared).toBe(false);
    }
  });
});

describe('UpdateUomSchema', () => {
  it('accepts empty object (all fields optional)', () => {
    expect(UpdateUomSchema.safeParse({ version: 1 }).success).toBe(true);
  });

  it('accepts partial update', () => {
    const r = UpdateUomSchema.safeParse({ name: 'л', version: 1 });
    expect(r.success).toBe(true);
  });

  it('accepts null to CLEAR optionals (edit form sends code.trim() || null)', () => {
    const r = UpdateUomSchema.safeParse({ name: 'л', code: null, description: null, version: 1 });
    expect(r.success).toBe(true);
  });
});

/**
 * Optimistic-lock contract (moysklad parity, lost-update guard).
 *
 * Every UOM field-edit save must carry the `version` the form loaded so the
 * repository can reject a stale write with 409. The token is REQUIRED on Update
 * (so a forgetful caller can't silently bypass the lock) and ABSENT from Create
 * (a brand-new row has no prior version to conflict with).
 */
describe('UpdateUomSchema optimistic-lock version token', () => {
  it('requires version on update (a save without it is rejected, not silently unguarded)', () => {
    expect(UpdateUomSchema.safeParse({}).success).toBe(false);
    expect(UpdateUomSchema.safeParse({ version: 1 }).success).toBe(true);
  });

  it('rejects a non-integer / negative version', () => {
    expect(UpdateUomSchema.safeParse({ version: 1.5 }).success).toBe(false);
    expect(UpdateUomSchema.safeParse({ version: -1 }).success).toBe(false);
    expect(UpdateUomSchema.safeParse({ version: '1' }).success).toBe(false);
  });

  it('CREATE schema does not require version (new rows have no prior version)', () => {
    expect(CreateUomSchema.safeParse({ name: 'шт' }).success).toBe(true);
  });
});

describe('UomFilterSchema', () => {
  it('defaults to sortBy=name asc', () => {
    const r = UomFilterSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.sortBy).toBe('name');
      expect(r.data.sortDir).toBe('asc');
    }
  });

  it('accepts search param', () => {
    const r = UomFilterSchema.safeParse({ search: 'кг' });
    expect(r.success).toBe(true);
  });
});
