import { describe, expect, it } from 'vitest';
import {
  CreateMoveSchema,
  MoveFilterSchema,
  MoveStateSchema,
  MoveTransitionSchema,
  UpdateMoveSchema,
} from './move.schema.js';

describe('MoveStateSchema', () => {
  it('accepts documented states', () => {
    for (const s of ['draft', 'posted', 'cancelled']) {
      expect(MoveStateSchema.parse(s)).toBe(s);
    }
  });
});

describe('MoveTransitionSchema', () => {
  it('accepts post/unpost/cancel', () => {
    expect(MoveTransitionSchema.parse('post')).toBe('post');
    expect(MoveTransitionSchema.parse('unpost')).toBe('unpost');
    expect(MoveTransitionSchema.parse('cancel')).toBe('cancel');
  });
});

describe('CreateMoveSchema', () => {
  const src = '00000000-0000-0000-0000-000000000010';
  const dst = '00000000-0000-0000-0000-000000000011';
  const valid = {
    organizationId: '00000000-0000-0000-0000-000000000001',
    sourceStoreId: src,
    destinationStoreId: dst,
    positions: [
      {
        assortmentKind: 'product',
        assortmentId: '00000000-0000-0000-0000-000000000099',
        quantity: '5',
      },
    ],
  };

  it('parses minimal valid input', () => {
    const p = CreateMoveSchema.parse(valid);
    expect(p.sourceStoreId).toBe(src);
  });

  it('rejects when source = destination', () => {
    expect(() => CreateMoveSchema.parse({ ...valid, destinationStoreId: src })).toThrow(
      /must differ/i,
    );
  });

  it('requires ≥1 position', () => {
    expect(() => CreateMoveSchema.parse({ ...valid, positions: [] })).toThrow(/at least one/i);
  });

  it('rejects negative quantity', () => {
    expect(() =>
      CreateMoveSchema.parse({
        ...valid,
        positions: [{ ...valid.positions[0], quantity: '-1' }],
      }),
    ).toThrow();
  });

  it('defaults «Накладные расходы» to 0 / WEIGHT / UZS (§65)', () => {
    const p = CreateMoveSchema.parse(valid);
    expect(p.overheadSumMinor).toBe('0');
    expect(p.overheadDistribution).toBe('WEIGHT');
    expect(p.overheadCurrency).toBe('UZS');
  });

  it('accepts a valid overhead block (§65)', () => {
    const p = CreateMoveSchema.parse({
      ...valid,
      overheadSumMinor: '2500000',
      overheadDistribution: 'PRICE',
      overheadCurrency: 'USD',
    });
    expect(p.overheadSumMinor).toBe('2500000');
    expect(p.overheadDistribution).toBe('PRICE');
    expect(p.overheadCurrency).toBe('USD');
  });

  it('rejects negative overheadSumMinor', () => {
    expect(() => CreateMoveSchema.parse({ ...valid, overheadSumMinor: '-1' })).toThrow();
  });

  it('rejects an unknown overheadDistribution method', () => {
    expect(() => CreateMoveSchema.parse({ ...valid, overheadDistribution: 'BY_MAGIC' })).toThrow();
  });
});

describe('MoveFilterSchema', () => {
  const uuid = '00000000-0000-0000-0000-000000000001';

  it('applies defaults', () => {
    const p = MoveFilterSchema.parse({});
    expect(p.limit).toBe(50);
    expect(p.sortBy).toBe('moment');
    expect(p.sortDir).toBe('desc');
  });

  it('parses the full moysklad-parity filter field set (no agent/contract)', () => {
    const p = MoveFilterSchema.parse({
      state: 'posted',
      organizationId: uuid,
      sourceStoreId: uuid,
      destinationStoreId: uuid,
      projectId: uuid,
      groupId: uuid,
      ownerId: uuid,
    });
    expect(p.sourceStoreId).toBe(uuid);
    expect(p.destinationStoreId).toBe(uuid);
    expect(p.projectId).toBe(uuid);
    expect(p.groupId).toBe(uuid);
    expect(p.ownerId).toBe(uuid);
  });

  it('coerces the tri-state boolean flags from query strings', () => {
    const p = MoveFilterSchema.parse({
      applicable: 'true',
      printed: 'false',
      published: 'true',
    });
    expect(p.applicable).toBe(true);
    expect(p.printed).toBe(false);
    expect(p.published).toBe(true);
  });

  it('leaves the boolean flags undefined when absent (no false-positive filter)', () => {
    const p = MoveFilterSchema.parse({});
    expect(p.applicable).toBeUndefined();
    expect(p.printed).toBeUndefined();
    expect(p.published).toBeUndefined();
  });

  it('accepts the «Когда изменен» updated period range', () => {
    const p = MoveFilterSchema.parse({
      updatedFrom: '2026-01-01',
      updatedTo: '2026-01-31',
    });
    expect(p.updatedFrom).toBe('2026-01-01');
    expect(p.updatedTo).toBe('2026-01-31');
  });

  it('accepts the moysklad-parity sortBy values incl. relational keys', () => {
    for (const k of [
      'moment',
      'name',
      'sumMinor',
      'organization',
      'sourceStore',
      'destinationStore',
    ] as const) {
      const p = MoveFilterSchema.parse({ sortBy: k });
      expect(p.sortBy).toBe(k);
    }
  });

  it('rejects a non-uuid FK filter', () => {
    expect(() => MoveFilterSchema.parse({ projectId: 'not-a-uuid' })).toThrow();
    expect(() => MoveFilterSchema.parse({ groupId: 'nope' })).toThrow();
    expect(() => MoveFilterSchema.parse({ ownerId: 'x' })).toThrow();
  });
});

describe('UpdateMoveSchema optimistic-lock version token', () => {
  it('requires version on update (a save without it is rejected, not silently unguarded)', () => {
    expect(UpdateMoveSchema.safeParse({}).success).toBe(false);
    expect(UpdateMoveSchema.safeParse({ version: 1 }).success).toBe(true);
  });

  it('rejects a non-integer / negative / string version', () => {
    expect(UpdateMoveSchema.safeParse({ version: 1.5 }).success).toBe(false);
    expect(UpdateMoveSchema.safeParse({ version: -1 }).success).toBe(false);
    expect(UpdateMoveSchema.safeParse({ version: '1' }).success).toBe(false);
  });
});
