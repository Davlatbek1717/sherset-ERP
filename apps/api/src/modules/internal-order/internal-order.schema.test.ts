import { describe, expect, it } from 'vitest';
import {
  CreateInternalOrderSchema,
  InternalOrderFilterSchema,
  InternalOrderStateSchema,
  InternalOrderTransitionSchema,
  UpdateInternalOrderSchema,
} from './internal-order.schema.js';

describe('InternalOrderStateSchema', () => {
  it('accepts documented states', () => {
    for (const s of ['draft', 'posted', 'cancelled']) {
      expect(InternalOrderStateSchema.parse(s)).toBe(s);
    }
  });
});

describe('InternalOrderTransitionSchema', () => {
  it('accepts post/unpost/cancel', () => {
    for (const t of ['post', 'unpost', 'cancel']) {
      expect(InternalOrderTransitionSchema.parse(t)).toBe(t);
    }
  });
});

describe('CreateInternalOrderSchema', () => {
  const valid = {
    organizationId: '00000000-0000-0000-0000-000000000001',
    storeId: '00000000-0000-0000-0000-000000000002',
    positions: [
      {
        assortmentKind: 'product',
        assortmentId: '00000000-0000-0000-0000-000000000099',
        quantity: '5',
      },
    ],
  };

  it('parses minimal valid input', () => {
    const p = CreateInternalOrderSchema.parse(valid);
    expect(p.storeId).toBe(valid.storeId);
    expect(p.currency).toBe('UZS');
  });

  it('requires at least 1 position', () => {
    expect(() => CreateInternalOrderSchema.parse({ ...valid, positions: [] })).toThrow(
      /Kamida 1 ta pozitsiya/,
    );
  });
});

describe('InternalOrderFilterSchema', () => {
  const uuid = '00000000-0000-0000-0000-000000000001';

  it('applies defaults', () => {
    const p = InternalOrderFilterSchema.parse({});
    expect(p.limit).toBe(50);
    expect(p.sortBy).toBe('moment');
    expect(p.sortDir).toBe('desc');
  });

  it('parses the full moysklad-parity filter field set (no agent/contract)', () => {
    const p = InternalOrderFilterSchema.parse({
      state: 'posted',
      organizationId: uuid,
      storeId: uuid,
      projectId: uuid,
      ownerId: uuid,
      groupId: uuid,
    });
    expect(p.projectId).toBe(uuid);
    expect(p.ownerId).toBe(uuid);
    expect(p.groupId).toBe(uuid);
  });

  it('coerces the tri-state boolean flags from query strings', () => {
    const p = InternalOrderFilterSchema.parse({
      applicable: 'true',
      printed: 'false',
      published: 'true',
    });
    expect(p.applicable).toBe(true);
    expect(p.printed).toBe(false);
    expect(p.published).toBe(true);
  });

  it('leaves the boolean flags undefined when absent (no false-positive filter)', () => {
    const p = InternalOrderFilterSchema.parse({});
    expect(p.applicable).toBeUndefined();
    expect(p.printed).toBeUndefined();
    expect(p.published).toBeUndefined();
  });

  it('accepts the «Когда изменен» updated period range', () => {
    const p = InternalOrderFilterSchema.parse({
      updatedFrom: '2026-01-01',
      updatedTo: '2026-01-31',
    });
    expect(p.updatedFrom).toBe('2026-01-01');
    expect(p.updatedTo).toBe('2026-01-31');
  });

  it('accepts the sum range filter', () => {
    const p = InternalOrderFilterSchema.parse({
      sumMinorFrom: '100000',
      sumMinorTo: '500000',
    });
    expect(p.sumMinorFrom).toBe(100000);
    expect(p.sumMinorTo).toBe(500000);
  });

  it('accepts the moysklad-parity sortBy values incl. relational keys', () => {
    for (const k of [
      'moment',
      'name',
      'sumMinor',
      'deliveryPlannedMoment',
      'createdAt',
      'updatedAt',
      'organization',
      'store',
    ] as const) {
      const p = InternalOrderFilterSchema.parse({ sortBy: k });
      expect(p.sortBy).toBe(k);
    }
  });

  it('rejects a non-uuid FK filter', () => {
    expect(() => InternalOrderFilterSchema.parse({ projectId: 'not-a-uuid' })).toThrow();
    expect(() => InternalOrderFilterSchema.parse({ groupId: 'nope' })).toThrow();
    expect(() => InternalOrderFilterSchema.parse({ ownerId: 'x' })).toThrow();
  });
});

describe('UpdateInternalOrderSchema optimistic-lock version token', () => {
  it('requires version on update (a save without it is rejected, not silently unguarded)', () => {
    expect(UpdateInternalOrderSchema.safeParse({}).success).toBe(false);
    expect(UpdateInternalOrderSchema.safeParse({ version: 1 }).success).toBe(true);
  });

  it('rejects a non-integer / negative / string version', () => {
    expect(UpdateInternalOrderSchema.safeParse({ version: 1.5 }).success).toBe(false);
    expect(UpdateInternalOrderSchema.safeParse({ version: -1 }).success).toBe(false);
    expect(UpdateInternalOrderSchema.safeParse({ version: '1' }).success).toBe(false);
  });
});
