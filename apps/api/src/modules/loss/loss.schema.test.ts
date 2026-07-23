import { describe, expect, it } from 'vitest';
import {
  CreateLossSchema,
  LossFilterSchema,
  LossReasonSchema,
  LossStateSchema,
  LossTransitionSchema,
  UpdateLossSchema,
} from './loss.schema.js';

describe('LossStateSchema', () => {
  it('accepts documented states', () => {
    for (const s of ['draft', 'posted', 'cancelled']) {
      expect(LossStateSchema.parse(s)).toBe(s);
    }
  });
});

describe('LossReasonSchema', () => {
  it('accepts all reasons', () => {
    for (const r of ['damaged', 'expired', 'theft', 'quality', 'other']) {
      expect(LossReasonSchema.parse(r)).toBe(r);
    }
  });
  it('rejects unknown reason', () => {
    expect(() => LossReasonSchema.parse('refund')).toThrow();
  });
});

describe('LossTransitionSchema', () => {
  it('accepts post/unpost/cancel', () => {
    expect(LossTransitionSchema.parse('post')).toBe('post');
    expect(LossTransitionSchema.parse('unpost')).toBe('unpost');
    expect(LossTransitionSchema.parse('cancel')).toBe('cancel');
  });
});

describe('CreateLossSchema', () => {
  const valid = {
    organizationId: '00000000-0000-0000-0000-000000000001',
    storeId: '00000000-0000-0000-0000-000000000010',
    positions: [
      {
        assortmentKind: 'product',
        assortmentId: '00000000-0000-0000-0000-000000000099',
        quantity: '2',
      },
    ],
  };

  it('parses minimal valid input (default reason=other)', () => {
    const p = CreateLossSchema.parse(valid);
    expect(p.reason).toBe('other');
  });

  it('accepts explicit reason', () => {
    const p = CreateLossSchema.parse({ ...valid, reason: 'damaged' });
    expect(p.reason).toBe('damaged');
  });

  it('allows empty positions — owner 2026-07-08, no Provedeno precondition', () => {
    expect(() => CreateLossSchema.parse({ ...valid, positions: [] })).not.toThrow();
  });
});

describe('UpdateLossSchema', () => {
  // moysklad parity / regression guard: editing a DRAFT write-off that has 0
  // positions (work-in-progress) must NOT 400 — the min-1 rule is POST-time only.
  it('accepts an EMPTY positions array on update (empty-draft save)', () => {
    const p = UpdateLossSchema.parse({ version: 1, description: 'wip', positions: [] });
    expect(p.positions).toEqual([]);
  });

  it('round-trips per-position reason/cell + currency/rateValue/expenseItem', () => {
    const p = UpdateLossSchema.parse({
      version: 2,
      expenseItem: 'Прочее',
      currency: 'USD',
      rateValue: '1220000000000',
      positions: [
        {
          assortmentKind: 'product',
          assortmentId: '00000000-0000-0000-0000-000000000099',
          quantity: '5',
          reason: 'Брак',
          cell: 'A-1',
        },
      ],
    });
    expect(p.expenseItem).toBe('Прочее');
    expect(p.currency).toBe('USD');
    expect(p.positions?.[0]).toMatchObject({ reason: 'Брак', cell: 'A-1', quantity: '5' });
  });
});

describe('LossFilterSchema', () => {
  it('applies defaults', () => {
    expect(LossFilterSchema.parse({}).limit).toBe(50);
  });
  it('accepts reason filter', () => {
    expect(LossFilterSchema.parse({ reason: 'expired' }).reason).toBe('expired');
  });
  it('accepts projectId / groupId / ownerId filters (moysklad parity, all backed)', () => {
    const p = LossFilterSchema.parse({
      projectId: '00000000-0000-0000-0000-000000000050',
      groupId: '00000000-0000-0000-0000-000000000051',
      ownerId: '00000000-0000-0000-0000-000000000052',
    });
    expect(p.projectId).toBe('00000000-0000-0000-0000-000000000050');
    expect(p.groupId).toBe('00000000-0000-0000-0000-000000000051');
    expect(p.ownerId).toBe('00000000-0000-0000-0000-000000000052');
  });
  it('coerces applicable / printed / published string flags into booleans', () => {
    const p = LossFilterSchema.parse({ applicable: 'true', printed: 'false', published: 'true' });
    expect(p.applicable).toBe(true);
    expect(p.printed).toBe(false);
    expect(p.published).toBe(true);
  });
  it('accepts updatedFrom/updatedTo («Когда изменен») strings', () => {
    const p = LossFilterSchema.parse({
      updatedFrom: '2026-01-01',
      updatedTo: '2026-12-31',
    });
    expect(p.updatedFrom).toBe('2026-01-01');
    expect(p.updatedTo).toBe('2026-12-31');
  });
  it('coerces sumMinor range to ints + accepts relational sortBy values', () => {
    const p = LossFilterSchema.parse({
      sumMinorFrom: '100',
      sumMinorTo: '999',
      sortBy: 'organization',
    });
    expect(p.sumMinorFrom).toBe(100);
    expect(p.sumMinorTo).toBe(999);
    expect(p.sortBy).toBe('organization');
    expect(LossFilterSchema.parse({ sortBy: 'store' }).sortBy).toBe('store');
  });
});

describe('UpdateLossSchema optimistic-lock version token', () => {
  it('requires version on update (a save without it is rejected, not silently unguarded)', () => {
    expect(UpdateLossSchema.safeParse({}).success).toBe(false);
    expect(UpdateLossSchema.safeParse({ version: 1 }).success).toBe(true);
  });

  it('rejects a non-integer / negative / string version', () => {
    expect(UpdateLossSchema.safeParse({ version: 1.5 }).success).toBe(false);
    expect(UpdateLossSchema.safeParse({ version: -1 }).success).toBe(false);
    expect(UpdateLossSchema.safeParse({ version: '1' }).success).toBe(false);
  });
});
