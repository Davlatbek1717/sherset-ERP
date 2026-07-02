import { describe, expect, it } from 'vitest';
import { CreatePriceTypeSchema, PriceTypeFilterSchema } from './price-type.schema.js';

describe('CreatePriceTypeSchema', () => {
  it('accepts a minimal payload', () => {
    const r = CreatePriceTypeSchema.safeParse({ name: 'Wholesale' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.currency).toBe('UZS');
      expect(r.data.isDefault).toBe(false);
      expect(r.data.position).toBe(0);
    }
  });

  it('rejects empty name', () => {
    expect(CreatePriceTypeSchema.safeParse({ name: '' }).success).toBe(false);
  });

  it('rejects 100+ char name', () => {
    expect(CreatePriceTypeSchema.safeParse({ name: 'a'.repeat(101) }).success).toBe(false);
  });

  it('rejects non-3-char currency', () => {
    expect(CreatePriceTypeSchema.safeParse({ name: 'x', currency: 'USDT' }).success).toBe(false);
  });

  it('coerces position from string', () => {
    const r = CreatePriceTypeSchema.safeParse({ name: 'x', position: '5' });
    if (!r.success) throw r.error;
    expect(r.data.position).toBe(5);
  });

  it('accepts optional «Внешний код» (externalCode)', () => {
    const r = CreatePriceTypeSchema.safeParse({ name: 'x', externalCode: 'PT-9' });
    if (!r.success) throw r.error;
    expect(r.data.externalCode).toBe('PT-9');
  });

  it('rejects an externalCode longer than 50 chars', () => {
    expect(
      CreatePriceTypeSchema.safeParse({ name: 'x', externalCode: 'y'.repeat(51) }).success,
    ).toBe(false);
  });
});

describe('PriceTypeFilterSchema', () => {
  it('defaults to no filter (empty object valid)', () => {
    const r = PriceTypeFilterSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it('parses archived from string', () => {
    const r = PriceTypeFilterSchema.safeParse({ archived: 'true' });
    if (!r.success) throw r.error;
    expect(r.data.archived).toBe(true);
  });
});
