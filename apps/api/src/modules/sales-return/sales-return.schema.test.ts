import { describe, expect, it } from 'vitest';
import {
  CreateFromDemandSchema,
  CreateSalesReturnSchema,
  SalesReturnFilterSchema,
  SalesReturnStateSchema,
  SalesReturnTransitionSchema,
  UpdateSalesReturnSchema,
} from './sales-return.schema.js';

describe('SalesReturnStateSchema', () => {
  it('accepts documented states', () => {
    for (const s of ['draft', 'posted', 'cancelled']) {
      expect(SalesReturnStateSchema.parse(s)).toBe(s);
    }
  });
  it('rejects unknown', () => {
    expect(() => SalesReturnStateSchema.parse('refunded')).toThrow();
  });
});

describe('SalesReturnTransitionSchema', () => {
  it('accepts post/unpost/cancel', () => {
    expect(SalesReturnTransitionSchema.parse('post')).toBe('post');
    expect(SalesReturnTransitionSchema.parse('unpost')).toBe('unpost');
    expect(SalesReturnTransitionSchema.parse('cancel')).toBe('cancel');
  });
});

describe('CreateSalesReturnSchema', () => {
  const valid = {
    agentId: '00000000-0000-0000-0000-000000000001',
    organizationId: '00000000-0000-0000-0000-000000000002',
    storeId: '00000000-0000-0000-0000-000000000003',
    positions: [
      {
        assortmentKind: 'product',
        assortmentId: '00000000-0000-0000-0000-000000000099',
        quantity: '1',
        priceMinor: '10000000',
      },
    ],
  };

  it('parses minimal valid input', () => {
    const parsed = CreateSalesReturnSchema.parse(valid);
    expect(parsed.currency).toBe('UZS');
    expect(parsed.vatEnabled).toBe(true);
  });

  it('requires ≥1 position', () => {
    expect(() => CreateSalesReturnSchema.parse({ ...valid, positions: [] })).toThrow(
      /at least one/i,
    );
  });

  it('accepts demand + CO back-links', () => {
    const parsed = CreateSalesReturnSchema.parse({
      ...valid,
      demandId: '00000000-0000-0000-0000-000000000010',
      customerOrderId: '00000000-0000-0000-0000-000000000011',
    });
    expect(parsed.demandId).toBe('00000000-0000-0000-0000-000000000010');
    expect(parsed.customerOrderId).toBe('00000000-0000-0000-0000-000000000011');
  });

  it('accepts optional reason field', () => {
    const parsed = CreateSalesReturnSchema.parse({
      ...valid,
      reason: 'Mahsulot buzilgan',
    });
    expect(parsed.reason).toBe('Mahsulot buzilgan');
  });

  it('rejects fractional priceMinor', () => {
    expect(() =>
      CreateSalesReturnSchema.parse({
        ...valid,
        positions: [{ ...valid.positions[0], priceMinor: '10.5' }],
      }),
    ).toThrow();
  });

  it('treats the ГТД/Страна customs block as optional (§45)', () => {
    const parsed = CreateSalesReturnSchema.parse(valid);
    expect(parsed.positions[0].gtdNumber).toBeUndefined();
    expect(parsed.positions[0].gtdSumMinor).toBeUndefined();
    expect(parsed.positions[0].countryId).toBeUndefined();
  });

  it('accepts a valid ГТД/Страна block on a return position (§45)', () => {
    const parsed = CreateSalesReturnSchema.parse({
      ...valid,
      positions: [
        {
          ...valid.positions[0],
          gtdNumber: '10702030/250420/0009999',
          gtdSumMinor: '1200000',
          countryId: '00000000-0000-0000-0000-0000000000c2',
        },
      ],
    });
    expect(parsed.positions[0].gtdNumber).toBe('10702030/250420/0009999');
    expect(parsed.positions[0].gtdSumMinor).toBe('1200000');
    expect(parsed.positions[0].countryId).toBe('00000000-0000-0000-0000-0000000000c2');
  });

  it('rejects a non-numeric gtdSumMinor', () => {
    expect(() =>
      CreateSalesReturnSchema.parse({
        ...valid,
        positions: [{ ...valid.positions[0], gtdSumMinor: 'x' }],
      }),
    ).toThrow(/gtdSumMinor/i);
  });

  it('rejects a non-uuid countryId', () => {
    expect(() =>
      CreateSalesReturnSchema.parse({
        ...valid,
        positions: [{ ...valid.positions[0], countryId: 'RU' }],
      }),
    ).toThrow();
  });
});

describe('CreateFromDemandSchema', () => {
  it('parses empty body (all defaults)', () => {
    const parsed = CreateFromDemandSchema.parse({});
    expect(parsed.storeId).toBeUndefined();
    expect(parsed.quantities).toBeUndefined();
  });

  it('accepts per-position quantity overrides', () => {
    const parsed = CreateFromDemandSchema.parse({
      quantities: {
        '00000000-0000-0000-0000-000000000001': '2.5',
        '00000000-0000-0000-0000-000000000002': '1',
      },
      reason: 'Partial return',
    });
    expect(parsed.quantities?.['00000000-0000-0000-0000-000000000001']).toBe('2.5');
    expect(parsed.reason).toBe('Partial return');
  });
});

describe('SalesReturnFilterSchema', () => {
  const UUID = '00000000-0000-0000-0000-000000000001';

  it('applies defaults', () => {
    const p = SalesReturnFilterSchema.parse({});
    expect(p.limit).toBe(50);
    expect(p.sortBy).toBe('moment');
  });
  it('coerces applicable from string', () => {
    expect(SalesReturnFilterSchema.parse({ applicable: 'true' }).applicable).toBe(true);
  });

  // moysklad «Возвраты покупателей» parity (~17 filter fields).
  it('accepts all new backed FK filters', () => {
    const p = SalesReturnFilterSchema.parse({
      agentGroupId: UUID,
      agentAccountId: UUID,
      organizationAccountId: UUID,
      projectId: UUID,
      contractId: UUID,
      salesChannelId: UUID,
      groupId: UUID,
      demandId: UUID,
      customerOrderId: UUID,
      ownerId: UUID,
    });
    expect(p.agentGroupId).toBe(UUID);
    expect(p.contractId).toBe(UUID);
    expect(p.salesChannelId).toBe(UUID);
    expect(p.groupId).toBe(UUID);
    expect(p.demandId).toBe(UUID);
    expect(p.customerOrderId).toBe(UUID);
  });

  it('coerces printed / published flags from string', () => {
    const p = SalesReturnFilterSchema.parse({ printed: 'true', published: 'false' });
    expect(p.printed).toBe(true);
    expect(p.published).toBe(false);
  });

  it('accepts the «Когда изменен» (updatedFrom/To) range', () => {
    const p = SalesReturnFilterSchema.parse({
      updatedFrom: '2026-01-01',
      updatedTo: '2026-02-01',
    });
    expect(p.updatedFrom).toBe('2026-01-01');
    expect(p.updatedTo).toBe('2026-02-01');
  });

  it('rejects a non-uuid FK filter value', () => {
    expect(() => SalesReturnFilterSchema.parse({ contractId: 'not-a-uuid' })).toThrow();
  });

  it('keeps the agent / organization / store relational sort keys', () => {
    for (const sortBy of ['agent', 'organization', 'store'] as const) {
      expect(SalesReturnFilterSchema.parse({ sortBy }).sortBy).toBe(sortBy);
    }
  });
});

describe('UpdateSalesReturnSchema optimistic-lock version token', () => {
  it('requires version on update (a save without it is rejected, not silently unguarded)', () => {
    expect(UpdateSalesReturnSchema.safeParse({}).success).toBe(false);
    expect(UpdateSalesReturnSchema.safeParse({ version: 1 }).success).toBe(true);
  });

  it('rejects a non-integer / negative / string version', () => {
    expect(UpdateSalesReturnSchema.safeParse({ version: 1.5 }).success).toBe(false);
    expect(UpdateSalesReturnSchema.safeParse({ version: -1 }).success).toBe(false);
    expect(UpdateSalesReturnSchema.safeParse({ version: '1' }).success).toBe(false);
  });
});
