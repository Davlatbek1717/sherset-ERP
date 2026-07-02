import { describe, expect, it } from 'vitest';
import {
  CreateEnterSchema,
  EnterFilterSchema,
  EnterReasonSchema,
  EnterStateSchema,
  EnterTransitionSchema,
  UpdateEnterSchema,
} from './enter.schema.js';

describe('EnterStateSchema', () => {
  it('accepts documented states', () => {
    for (const s of ['draft', 'posted', 'cancelled']) {
      expect(EnterStateSchema.parse(s)).toBe(s);
    }
  });
});

describe('EnterReasonSchema', () => {
  it('accepts all reasons', () => {
    for (const r of ['initial', 'found', 'gift', 'correction', 'other']) {
      expect(EnterReasonSchema.parse(r)).toBe(r);
    }
  });
});

describe('EnterTransitionSchema', () => {
  it('accepts post/unpost/cancel', () => {
    expect(EnterTransitionSchema.parse('post')).toBe('post');
    expect(EnterTransitionSchema.parse('unpost')).toBe('unpost');
    expect(EnterTransitionSchema.parse('cancel')).toBe('cancel');
  });
});

describe('CreateEnterSchema', () => {
  const valid = {
    organizationId: '00000000-0000-0000-0000-000000000001',
    storeId: '00000000-0000-0000-0000-000000000010',
    positions: [
      {
        assortmentKind: 'product',
        assortmentId: '00000000-0000-0000-0000-000000000099',
        quantity: '3',
        costMinor: '5000000',
      },
    ],
  };

  it('parses minimal valid input — NO document-level reason (moved per-position)', () => {
    const p = CreateEnterSchema.parse(valid);
    // moysklad parity: «Причина» is per-position, not a document field.
    expect(p).not.toHaveProperty('reason');
    expect(p.positions).toHaveLength(1);
  });

  it('accepts per-position «Причина оприходования» free text', () => {
    const p = CreateEnterSchema.parse({
      ...valid,
      positions: [{ ...valid.positions[0], reason: 'Найдено при инвентаризации' }],
    });
    expect(p.positions[0].reason).toBe('Найдено при инвентаризации');
  });

  it('REQUIRES costMinor on every position (FIFO lot cost basis)', () => {
    expect(() =>
      CreateEnterSchema.parse({
        ...valid,
        positions: [
          {
            assortmentKind: 'product',
            assortmentId: valid.positions[0].assortmentId,
            quantity: '1',
          },
        ],
      }),
    ).toThrow();
  });

  it('rejects negative cost', () => {
    expect(() =>
      CreateEnterSchema.parse({
        ...valid,
        positions: [{ ...valid.positions[0], costMinor: '-10' }],
      }),
    ).toThrow();
  });

  it('defaults «Накладные расходы» to 0 / WEIGHT / UZS', () => {
    const p = CreateEnterSchema.parse(valid);
    expect(p.overheadSumMinor).toBe('0');
    expect(p.overheadDistribution).toBe('WEIGHT');
    expect(p.overheadCurrency).toBe('UZS');
  });

  it('accepts a valid overhead block', () => {
    const p = CreateEnterSchema.parse({
      ...valid,
      overheadSumMinor: '750000',
      overheadDistribution: 'VOLUME',
      overheadCurrency: 'USD',
    });
    expect(p.overheadSumMinor).toBe('750000');
    expect(p.overheadDistribution).toBe('VOLUME');
    expect(p.overheadCurrency).toBe('USD');
  });

  it('rejects negative overheadSumMinor', () => {
    expect(() => CreateEnterSchema.parse({ ...valid, overheadSumMinor: '-1' })).toThrow();
  });

  it('rejects an unknown overheadDistribution method', () => {
    expect(() => CreateEnterSchema.parse({ ...valid, overheadDistribution: 'BY_STARS' })).toThrow();
  });
});

describe('EnterFilterSchema', () => {
  it('applies defaults', () => {
    expect(EnterFilterSchema.parse({}).limit).toBe(50);
  });
  it('accepts projectId / groupId / ownerId filters (moysklad parity, all backed)', () => {
    const p = EnterFilterSchema.parse({
      projectId: '00000000-0000-0000-0000-000000000050',
      groupId: '00000000-0000-0000-0000-000000000051',
      ownerId: '00000000-0000-0000-0000-000000000052',
    });
    expect(p.projectId).toBe('00000000-0000-0000-0000-000000000050');
    expect(p.groupId).toBe('00000000-0000-0000-0000-000000000051');
    expect(p.ownerId).toBe('00000000-0000-0000-0000-000000000052');
  });
  it('coerces applicable / printed / published string flags into booleans', () => {
    const p = EnterFilterSchema.parse({ applicable: 'true', printed: 'false', published: 'true' });
    expect(p.applicable).toBe(true);
    expect(p.printed).toBe(false);
    expect(p.published).toBe(true);
  });
  it('accepts updatedFrom/updatedTo («Когда изменен») strings', () => {
    const p = EnterFilterSchema.parse({
      updatedFrom: '2026-01-01',
      updatedTo: '2026-12-31',
    });
    expect(p.updatedFrom).toBe('2026-01-01');
    expect(p.updatedTo).toBe('2026-12-31');
  });
  it('coerces sumMinor range to ints + accepts relational sortBy values', () => {
    const p = EnterFilterSchema.parse({
      sumMinorFrom: '100',
      sumMinorTo: '999',
      sortBy: 'organization',
    });
    expect(p.sumMinorFrom).toBe(100);
    expect(p.sumMinorTo).toBe(999);
    expect(p.sortBy).toBe('organization');
    expect(EnterFilterSchema.parse({ sortBy: 'store' }).sortBy).toBe('store');
  });
});

describe('UpdateEnterSchema optimistic-lock version token', () => {
  it('requires version on update (a save without it is rejected, not silently unguarded)', () => {
    expect(UpdateEnterSchema.safeParse({}).success).toBe(false);
    expect(UpdateEnterSchema.safeParse({ version: 1 }).success).toBe(true);
  });

  it('rejects a non-integer / negative / string version', () => {
    expect(UpdateEnterSchema.safeParse({ version: 1.5 }).success).toBe(false);
    expect(UpdateEnterSchema.safeParse({ version: -1 }).success).toBe(false);
    expect(UpdateEnterSchema.safeParse({ version: '1' }).success).toBe(false);
  });
});
