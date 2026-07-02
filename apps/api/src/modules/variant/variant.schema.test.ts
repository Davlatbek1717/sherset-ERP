import { describe, expect, it } from 'vitest';
import { CreateVariantSchema, UpdateVariantSchema, VariantFilterSchema } from './variant.schema.js';

const uuid = () => crypto.randomUUID();

describe('CreateVariantSchema', () => {
  it('accepts a minimal valid payload with characteristics', () => {
    const r = CreateVariantSchema.safeParse({
      productId: uuid(),
      characteristics: [{ name: 'Color', value: 'Red' }],
    });
    expect(r.success).toBe(true);
  });

  it('rejects empty characteristics array', () => {
    expect(
      CreateVariantSchema.safeParse({
        productId: uuid(),
        characteristics: [],
      }).success,
    ).toBe(false);
  });

  it('rejects characteristic with empty name', () => {
    expect(
      CreateVariantSchema.safeParse({
        productId: uuid(),
        characteristics: [{ name: '', value: 'X' }],
      }).success,
    ).toBe(false);
  });

  it('coerces weightG from string', () => {
    const r = CreateVariantSchema.safeParse({
      productId: uuid(),
      characteristics: [{ name: 'Size', value: 'L' }],
      weightG: '250',
    });
    if (!r.success) throw r.error;
    expect(r.data.weightG).toBe(250);
  });

  it('accepts salePrices array with bigint values', () => {
    const r = CreateVariantSchema.safeParse({
      productId: uuid(),
      characteristics: [{ name: 'Color', value: 'Blue' }],
      salePrices: [{ priceTypeId: 'default', value: '100000' }],
    });
    if (!r.success) throw r.error;
    expect(r.data.salePrices?.[0]?.value).toBe(100000n);
  });

  it('rejects invalid productId UUID', () => {
    expect(
      CreateVariantSchema.safeParse({
        productId: 'not-a-uuid',
        characteristics: [{ name: 'Color', value: 'Red' }],
      }).success,
    ).toBe(false);
  });
});

describe('UpdateVariantSchema null-clear (edit form PATCHes null to clear a field)', () => {
  // Regression guard for the Phase-2 400 bug: the edit form sends `null` for a
  // cleared optional field; the schema must accept null (the columns are
  // nullable and the service writes null → clears). `.optional()` alone
  // rejected null ("Expected string, received null") → every clear-on-edit 400'd.
  it('accepts null for code / barcode / externalCode / buyPrice / minPrice / weightG / volumeML', () => {
    const r = UpdateVariantSchema.safeParse({
      version: 1,
      code: null,
      barcode: null,
      externalCode: null,
      buyPrice: null,
      minPrice: null,
      weightG: null,
      volumeML: null,
    });
    if (!r.success) throw r.error;
    expect(r.data.code).toBeNull();
    expect(r.data.barcode).toBeNull();
  });

  it('still rejects null for name (non-nullable column — must not be widened)', () => {
    expect(UpdateVariantSchema.safeParse({ name: null, version: 1 }).success).toBe(false);
  });
});

/**
 * Optimistic-lock contract — variant field-edit saves carry the loaded
 * `version` so a stale copy 409s instead of silently overwriting. Required on
 * Update, absent from Create. See product.schema.test.ts for the rationale.
 */
describe('UpdateVariantSchema optimistic-lock version token', () => {
  it('requires version on update', () => {
    expect(UpdateVariantSchema.safeParse({ code: null }).success).toBe(false);
    expect(UpdateVariantSchema.safeParse({ code: null, version: 1 }).success).toBe(true);
  });

  it('rejects a non-integer / negative version', () => {
    expect(UpdateVariantSchema.safeParse({ version: 1.5 }).success).toBe(false);
    expect(UpdateVariantSchema.safeParse({ version: -1 }).success).toBe(false);
  });
});

describe('VariantFilterSchema', () => {
  it('defaults limit to 50', () => {
    const r = VariantFilterSchema.safeParse({});
    if (!r.success) throw r.error;
    expect(r.data.limit).toBe(50);
  });

  it('coerces archived from string', () => {
    const r = VariantFilterSchema.safeParse({ archived: 'true' });
    if (!r.success) throw r.error;
    expect(r.data.archived).toBe(true);
  });

  it('rejects limit above max (500)', () => {
    expect(VariantFilterSchema.safeParse({ limit: 501 }).success).toBe(false);
  });
});
