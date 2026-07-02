import { describe, expect, it } from 'vitest';
import {
  CreatePriceListSchema,
  PriceListFilterSchema,
  PriceListStateSchema,
  PriceListTransitionSchema,
  UpdatePriceListSchema,
} from './price-list.schema.js';

describe('PriceListStateSchema', () => {
  it('accepts documented states', () => {
    for (const s of ['draft', 'posted', 'cancelled']) {
      expect(PriceListStateSchema.parse(s)).toBe(s);
    }
  });
});

describe('PriceListTransitionSchema', () => {
  it('accepts post/unpost/cancel', () => {
    for (const t of ['post', 'unpost', 'cancel']) {
      expect(PriceListTransitionSchema.parse(t)).toBe(t);
    }
  });
});

describe('CreatePriceListSchema', () => {
  const valid = {
    name: 'Sales prices 2026-Q2',
    organizationId: '00000000-0000-0000-0000-000000000001',
  };

  it('parses minimal valid input', () => {
    const p = CreatePriceListSchema.parse(valid);
    expect(p.currency).toBe('UZS');
    expect(p.pricesJson).toEqual({});
  });

  it('requires a non-empty name', () => {
    expect(() => CreatePriceListSchema.parse({ ...valid, name: '' })).toThrow();
  });
});

describe('UpdatePriceListSchema — optimistic-lock contract', () => {
  it('REQUIRES version — a price-list edit cannot silently bypass the lost-update guard', () => {
    expect(UpdatePriceListSchema.safeParse({ description: 'x' }).success).toBe(false);
    expect(UpdatePriceListSchema.safeParse({}).success).toBe(false);
  });

  it('accepts a version-only payload (no-op edit still bumps version)', () => {
    expect(UpdatePriceListSchema.safeParse({ version: 1 }).success).toBe(true);
  });
});

describe('PriceListFilterSchema', () => {
  const uuid = '00000000-0000-0000-0000-000000000001';

  it('applies defaults', () => {
    const p = PriceListFilterSchema.parse({});
    expect(p.limit).toBe(50);
    expect(p.sortBy).toBe('moment');
    expect(p.sortDir).toBe('desc');
  });

  it('parses the full moysklad-parity filter field set (no agent/store/sum)', () => {
    const p = PriceListFilterSchema.parse({
      state: 'posted',
      organizationId: uuid,
      priceTypeId: uuid,
      ownerId: uuid,
      groupId: uuid,
      currency: 'USD',
    });
    expect(p.priceTypeId).toBe(uuid);
    expect(p.ownerId).toBe(uuid);
    expect(p.groupId).toBe(uuid);
    expect(p.currency).toBe('USD');
  });

  it('coerces the tri-state boolean flags from query strings', () => {
    const p = PriceListFilterSchema.parse({
      applicable: 'true',
      printed: 'false',
      published: 'true',
    });
    expect(p.applicable).toBe(true);
    expect(p.printed).toBe(false);
    expect(p.published).toBe(true);
  });

  it('leaves the boolean flags undefined when absent (no false-positive filter)', () => {
    const p = PriceListFilterSchema.parse({});
    expect(p.applicable).toBeUndefined();
    expect(p.printed).toBeUndefined();
    expect(p.published).toBeUndefined();
  });

  it('accepts the «Когда изменен» updated period range', () => {
    const p = PriceListFilterSchema.parse({
      updatedFrom: '2026-01-01',
      updatedTo: '2026-01-31',
    });
    expect(p.updatedFrom).toBe('2026-01-01');
    expect(p.updatedTo).toBe('2026-01-31');
  });

  it('accepts the moysklad-parity sortBy values incl. relational keys', () => {
    for (const k of ['moment', 'name', 'createdAt', 'updatedAt', 'organization'] as const) {
      const p = PriceListFilterSchema.parse({ sortBy: k });
      expect(p.sortBy).toBe(k);
    }
  });

  it('rejects a non-uuid FK filter', () => {
    expect(() => PriceListFilterSchema.parse({ priceTypeId: 'not-a-uuid' })).toThrow();
    expect(() => PriceListFilterSchema.parse({ groupId: 'nope' })).toThrow();
    expect(() => PriceListFilterSchema.parse({ ownerId: 'x' })).toThrow();
  });

  it('rejects an invalid currency code (must be length 3)', () => {
    expect(() => PriceListFilterSchema.parse({ currency: 'US' })).toThrow();
    expect(() => PriceListFilterSchema.parse({ currency: 'EURO' })).toThrow();
  });
});
