import { describe, expect, it } from 'vitest';
import {
  CreateDiscountSchema,
  DiscountFilterSchema,
  UpdateDiscountSchema,
} from './discount.schema.js';

describe('CreateDiscountSchema', () => {
  it('accepts minimal payload with name and kind', () => {
    const r = CreateDiscountSchema.safeParse({ name: 'Yangi yil aksiyasi', kind: 'special' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.active).toBe(true);
      expect(r.data.allAgents).toBe(true);
      expect(r.data.allProducts).toBe(true);
      expect(r.data.earnWhileRedeeming).toBe(false);
      expect(r.data.archived).toBe(false);
      expect(r.data.agentTags).toEqual([]);
    }
  });

  it('rejects empty name', () => {
    expect(CreateDiscountSchema.safeParse({ name: '', kind: 'special' }).success).toBe(false);
  });

  it('rejects unknown kind', () => {
    expect(CreateDiscountSchema.safeParse({ name: 'X', kind: 'mystery' }).success).toBe(false);
  });

  it('accepts all valid kinds', () => {
    const kinds = ['special', 'accumulative', 'personal', 'product', 'agent'];
    for (const kind of kinds) {
      expect(CreateDiscountSchema.safeParse({ name: 'Test', kind }).success).toBe(true);
    }
  });

  it('accepts bonus program fields', () => {
    const r = CreateDiscountSchema.safeParse({
      name: 'Bonus dastur',
      kind: 'accumulative',
      earnRateUzsToPoint: 1000,
      spendRatePointsToUzs: 10,
      maxPaidRatePercents: 50,
      earnWhileRedeeming: true,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.earnRateUzsToPoint).toBe(1000);
      expect(r.data.maxPaidRatePercents).toBe(50);
    }
  });

  it('rejects maxPaidRatePercents > 100', () => {
    expect(
      CreateDiscountSchema.safeParse({ name: 'X', kind: 'product', maxPaidRatePercents: 101 })
        .success,
    ).toBe(false);
  });

  it('accepts agentTags array', () => {
    const r = CreateDiscountSchema.safeParse({
      name: 'VIP',
      kind: 'personal',
      agentTags: ['vip', 'premium'],
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.agentTags).toEqual(['vip', 'premium']);
  });
});

describe('UpdateDiscountSchema', () => {
  it('accepts empty object', () => {
    expect(UpdateDiscountSchema.safeParse({ version: 1 }).success).toBe(true);
  });

  it('accepts archive flag', () => {
    const r = UpdateDiscountSchema.safeParse({ archived: true, version: 1 });
    expect(r.success).toBe(true);
  });
});

describe('UpdateDiscountSchema optimistic-lock version token', () => {
  it('requires version on update (a save without it is rejected, not silently unguarded)', () => {
    expect(UpdateDiscountSchema.safeParse({ name: 'Aksiya' }).success).toBe(false);
    expect(UpdateDiscountSchema.safeParse({ name: 'Aksiya', version: 1 }).success).toBe(true);
  });

  it('rejects a non-integer / negative version', () => {
    expect(UpdateDiscountSchema.safeParse({ name: 'Aksiya', version: 1.5 }).success).toBe(false);
    expect(UpdateDiscountSchema.safeParse({ name: 'Aksiya', version: -1 }).success).toBe(false);
    expect(UpdateDiscountSchema.safeParse({ name: 'Aksiya', version: '1' }).success).toBe(false);
  });

  it('CREATE schema does not require version (new rows have no prior version)', () => {
    expect(CreateDiscountSchema.safeParse({ name: 'Yangi', kind: 'special' }).success).toBe(true);
  });
});

describe('DiscountFilterSchema', () => {
  it('defaults to sortBy=name asc and archived=false', () => {
    const r = DiscountFilterSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.sortBy).toBe('name');
      expect(r.data.sortDir).toBe('asc');
      expect(r.data.archived).toBe(false);
    }
  });

  it('accepts kind filter', () => {
    const r = DiscountFilterSchema.safeParse({ kind: 'agent' });
    expect(r.success).toBe(true);
  });

  it('coerces archived string to boolean', () => {
    const r = DiscountFilterSchema.safeParse({ archived: 'true' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.archived).toBe(true);
  });

  it('coerces active string to boolean', () => {
    const r = DiscountFilterSchema.safeParse({ active: 'false' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.active).toBe(false);
  });
});
