import { describe, expect, it } from 'vitest';
import {
  AttributeMetadataFilterSchema,
  CreateAttributeMetadataSchema,
  UpdateAttributeMetadataSchema,
  validateAttributeValue,
} from './attribute-metadata.schema.js';

describe('CreateAttributeMetadataSchema', () => {
  const base = {
    entity: 'Counterparty' as const,
    code: 'preferred_payment',
    name: "Sevimli to'lov turi",
    type: 'string' as const,
  };

  it('accepts a minimal string field', () => {
    const r = CreateAttributeMetadataSchema.safeParse(base);
    expect(r.success).toBe(true);
  });

  it('rejects code starting with digit', () => {
    expect(CreateAttributeMetadataSchema.safeParse({ ...base, code: '1abc' }).success).toBe(false);
  });

  it('rejects code with uppercase', () => {
    expect(CreateAttributeMetadataSchema.safeParse({ ...base, code: 'fooBar' }).success).toBe(
      false,
    );
  });

  it('requires enumOptions when type is enum', () => {
    expect(CreateAttributeMetadataSchema.safeParse({ ...base, type: 'enum' }).success).toBe(false);
    expect(
      CreateAttributeMetadataSchema.safeParse({
        ...base,
        type: 'enum',
        enumOptions: [{ value: 'a', label: 'A' }],
      }).success,
    ).toBe(true);
  });

  it('requires referenceEntity when type is reference', () => {
    expect(CreateAttributeMetadataSchema.safeParse({ ...base, type: 'reference' }).success).toBe(
      false,
    );
    expect(
      CreateAttributeMetadataSchema.safeParse({
        ...base,
        type: 'reference',
        referenceEntity: 'Counterparty',
      }).success,
    ).toBe(true);
  });

  it('requires customEntityId when referencing CustomEntity', () => {
    expect(
      CreateAttributeMetadataSchema.safeParse({
        ...base,
        type: 'reference',
        referenceEntity: 'CustomEntity',
      }).success,
    ).toBe(false);
  });

  it('rejects unknown entity name', () => {
    expect(CreateAttributeMetadataSchema.safeParse({ ...base, entity: 'NotAThing' }).success).toBe(
      false,
    );
  });
});

describe('UpdateAttributeMetadataSchema', () => {
  it('forbids changing entity or code', () => {
    const r = UpdateAttributeMetadataSchema.safeParse({ entity: 'Product', code: 'foo' });
    if (!r.success) throw r.error;
    // Both fields are stripped because they are omitted from the schema.
    expect((r.data as Record<string, unknown>).entity).toBeUndefined();
    expect((r.data as Record<string, unknown>).code).toBeUndefined();
  });

  it('allows partial name update', () => {
    expect(UpdateAttributeMetadataSchema.safeParse({ name: 'Yangi nom' }).success).toBe(true);
  });
});

describe('AttributeMetadataFilterSchema', () => {
  it('coerces archived from string', () => {
    const r = AttributeMetadataFilterSchema.safeParse({ archived: 'true' });
    if (!r.success) throw r.error;
    expect(r.data.archived).toBe(true);
  });

  it('clamps limit to max 500', () => {
    expect(AttributeMetadataFilterSchema.safeParse({ limit: 9999 }).success).toBe(false);
  });
});

describe('validateAttributeValue', () => {
  const sm = (overrides: Partial<Parameters<typeof validateAttributeValue>[0]> = {}) => ({
    type: 'string' as const,
    required: false,
    enumOptions: null,
    name: 'X',
    ...overrides,
  });

  it('returns null for empty optional values', () => {
    expect(validateAttributeValue(sm(), null)).toBeNull();
    expect(validateAttributeValue(sm(), '')).toBeNull();
  });

  it('throws for empty required values', () => {
    expect(() => validateAttributeValue(sm({ required: true }), '')).toThrow(/majburiy/);
  });

  it('coerces "long" to integer', () => {
    expect(validateAttributeValue(sm({ type: 'long' }), '42')).toBe(42);
    expect(() => validateAttributeValue(sm({ type: 'long' }), '3.14')).toThrow(/butun/);
  });

  it('coerces "double" to number', () => {
    expect(validateAttributeValue(sm({ type: 'double' }), '3.14')).toBeCloseTo(3.14);
  });

  it('parses ISO date', () => {
    expect(validateAttributeValue(sm({ type: 'date' }), '2026-04-29')).toMatch(/^2026-04-29/);
    expect(() => validateAttributeValue(sm({ type: 'date' }), 'not-a-date')).toThrow();
  });

  it('rejects unknown enum values', () => {
    const meta = sm({ type: 'enum', enumOptions: [{ value: 'a', label: 'A' }] });
    expect(validateAttributeValue(meta, 'a')).toBe('a');
    expect(() => validateAttributeValue(meta, 'b')).toThrow(/ruxsat etilmagan/);
  });

  it('requires UUID for reference', () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    expect(validateAttributeValue(sm({ type: 'reference' }), id)).toBe(id);
    expect(() => validateAttributeValue(sm({ type: 'reference' }), 'not-uuid')).toThrow(/UUID/);
  });
});
