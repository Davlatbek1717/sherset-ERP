import { describe, expect, it } from 'vitest';
import {
  CreateSupplySchema,
  SupplyFilterSchema,
  SupplyStateSchema,
  SupplyTransitionSchema,
  UpdateSupplySchema,
} from './supply.schema.js';

describe('SupplyStateSchema', () => {
  it('accepts documented states', () => {
    for (const s of ['draft', 'posted', 'cancelled']) {
      expect(SupplyStateSchema.parse(s)).toBe(s);
    }
  });
  it('rejects unknown', () => {
    expect(() => SupplyStateSchema.parse('received')).toThrow();
  });
});

describe('SupplyTransitionSchema', () => {
  it('accepts post/unpost/cancel', () => {
    expect(SupplyTransitionSchema.parse('post')).toBe('post');
    expect(SupplyTransitionSchema.parse('unpost')).toBe('unpost');
    expect(SupplyTransitionSchema.parse('cancel')).toBe('cancel');
  });
});

describe('CreateSupplySchema', () => {
  const valid = {
    agentId: '00000000-0000-0000-0000-000000000001',
    organizationId: '00000000-0000-0000-0000-000000000002',
    storeId: '00000000-0000-0000-0000-000000000003',
    positions: [
      {
        assortmentKind: 'product',
        assortmentId: '00000000-0000-0000-0000-000000000099',
        quantity: '5',
        priceMinor: '50000000',
      },
    ],
  };

  it('parses minimal valid input', () => {
    const parsed = CreateSupplySchema.parse(valid);
    expect(parsed.currency).toBe('UZS');
    expect(parsed.vatEnabled).toBe(true);
  });

  it('allows empty positions — owner 2026-07-08, no Provedeno precondition', () => {
    expect(() => CreateSupplySchema.parse({ ...valid, positions: [] })).not.toThrow();
  });

  it('accepts incomingNumber + incomingDate (supplier invoice metadata)', () => {
    const parsed = CreateSupplySchema.parse({
      ...valid,
      incomingNumber: 'SUP-2026/001',
      incomingDate: '2026-04-20T00:00:00Z',
    });
    expect(parsed.incomingNumber).toBe('SUP-2026/001');
    expect(parsed.incomingDate).toBeInstanceOf(Date);
  });

  it('rejects negative priceMinor', () => {
    expect(() =>
      CreateSupplySchema.parse({
        ...valid,
        positions: [{ ...valid.positions[0], priceMinor: '-10' }],
      }),
    ).toThrow();
  });

  it('defaults «Накладные расходы» to 0 / WEIGHT / UZS', () => {
    const parsed = CreateSupplySchema.parse(valid);
    expect(parsed.overheadSumMinor).toBe('0');
    expect(parsed.overheadDistribution).toBe('WEIGHT');
    expect(parsed.overheadCurrency).toBe('UZS');
  });

  it('accepts a valid overhead block', () => {
    const parsed = CreateSupplySchema.parse({
      ...valid,
      overheadSumMinor: '1500000',
      overheadDistribution: 'PRICE',
      overheadCurrency: 'USD',
    });
    expect(parsed.overheadSumMinor).toBe('1500000');
    expect(parsed.overheadDistribution).toBe('PRICE');
    expect(parsed.overheadCurrency).toBe('USD');
  });

  it('rejects negative overheadSumMinor', () => {
    expect(() => CreateSupplySchema.parse({ ...valid, overheadSumMinor: '-1' })).toThrow();
  });

  it('rejects an unknown overheadDistribution method', () => {
    expect(() =>
      CreateSupplySchema.parse({ ...valid, overheadDistribution: 'BY_MAGIC' }),
    ).toThrow();
  });

  it('treats the ГТД/Страна customs block as optional (§41)', () => {
    const parsed = CreateSupplySchema.parse(valid);
    expect(parsed.positions[0].gtdNumber).toBeUndefined();
    expect(parsed.positions[0].gtdSumMinor).toBeUndefined();
    expect(parsed.positions[0].countryId).toBeUndefined();
  });

  it('accepts a valid ГТД/Страна block on a position (§41)', () => {
    const parsed = CreateSupplySchema.parse({
      ...valid,
      positions: [
        {
          ...valid.positions[0],
          gtdNumber: '10702030/250420/0001234',
          gtdSumMinor: '4500000',
          countryId: '00000000-0000-0000-0000-0000000000c1',
        },
      ],
    });
    expect(parsed.positions[0].gtdNumber).toBe('10702030/250420/0001234');
    expect(parsed.positions[0].gtdSumMinor).toBe('4500000');
    expect(parsed.positions[0].countryId).toBe('00000000-0000-0000-0000-0000000000c1');
  });

  it('rejects a non-numeric gtdSumMinor', () => {
    expect(() =>
      CreateSupplySchema.parse({
        ...valid,
        positions: [{ ...valid.positions[0], gtdSumMinor: 'abc' }],
      }),
    ).toThrow(/gtdSumMinor/i);
  });

  it('rejects a non-uuid countryId', () => {
    expect(() =>
      CreateSupplySchema.parse({
        ...valid,
        positions: [{ ...valid.positions[0], countryId: 'UZ' }],
      }),
    ).toThrow();
  });
});

describe('SupplyFilterSchema', () => {
  const uuid = '00000000-0000-0000-0000-000000000001';

  it('applies defaults', () => {
    const p = SupplyFilterSchema.parse({});
    expect(p.limit).toBe(50);
    expect(p.sortBy).toBe('moment');
    expect(p.sortDir).toBe('desc');
  });

  it('parses the full moysklad-parity filter field set', () => {
    const p = SupplyFilterSchema.parse({
      state: 'posted',
      agentId: uuid,
      agentGroupId: uuid,
      agentOwnerId: uuid,
      agentAccountId: uuid,
      organizationId: uuid,
      organizationAccountId: uuid,
      storeId: uuid,
      purchaseOrderId: uuid,
      contractId: uuid,
      projectId: uuid,
      groupId: uuid,
      ownerId: uuid,
    });
    expect(p.agentGroupId).toBe(uuid);
    expect(p.agentOwnerId).toBe(uuid);
    expect(p.agentAccountId).toBe(uuid);
    expect(p.organizationAccountId).toBe(uuid);
    expect(p.contractId).toBe(uuid);
    expect(p.projectId).toBe(uuid);
    expect(p.groupId).toBe(uuid);
    expect(p.purchaseOrderId).toBe(uuid);
  });

  it('parses «Владелец контрагента» (agentOwnerId) independently of «Владелец-сотрудник» (ownerId)', () => {
    // agentOwnerId = agent.ownerId (the counterparty's owner employee), a
    // DIFFERENT field from ownerId (the supply's own owner). Both must survive a
    // parse so buildListWhere can merge agentOwnerId into the `agent` clause
    // while ownerId stays a top-level scalar.
    const agentOwner = '00000000-0000-0000-0000-0000000000aa';
    const supplyOwner = '00000000-0000-0000-0000-0000000000bb';
    const p = SupplyFilterSchema.parse({ agentOwnerId: agentOwner, ownerId: supplyOwner });
    expect(p.agentOwnerId).toBe(agentOwner);
    expect(p.ownerId).toBe(supplyOwner);
  });

  it('coerces the tri-state boolean flags from query strings', () => {
    const p = SupplyFilterSchema.parse({
      applicable: 'true',
      printed: 'false',
      published: 'true',
    });
    expect(p.applicable).toBe(true);
    expect(p.printed).toBe(false);
    expect(p.published).toBe(true);
  });

  it('leaves the boolean flags undefined when absent (no false-positive filter)', () => {
    const p = SupplyFilterSchema.parse({});
    expect(p.applicable).toBeUndefined();
    expect(p.printed).toBeUndefined();
    expect(p.published).toBeUndefined();
  });

  it('accepts the «Когда изменен» updated period range', () => {
    const p = SupplyFilterSchema.parse({
      updatedFrom: '2026-01-01',
      updatedTo: '2026-01-31',
    });
    expect(p.updatedFrom).toBe('2026-01-01');
    expect(p.updatedTo).toBe('2026-01-31');
  });

  it('rejects a non-uuid FK filter', () => {
    expect(() => SupplyFilterSchema.parse({ agentGroupId: 'not-a-uuid' })).toThrow();
    expect(() => SupplyFilterSchema.parse({ agentOwnerId: 'not-a-uuid' })).toThrow();
    expect(() => SupplyFilterSchema.parse({ contractId: 'nope' })).toThrow();
  });

  it('parses «Оплата» (paymentStatus) + «Товар или группа» (productId)', () => {
    const p = SupplyFilterSchema.parse({ paymentStatus: 'partial', productId: uuid });
    expect(p.paymentStatus).toBe('partial');
    expect(p.productId).toBe(uuid);
    expect(() => SupplyFilterSchema.parse({ paymentStatus: 'overpaid' })).toThrow();
    expect(() => SupplyFilterSchema.parse({ productId: 'not-a-uuid' })).toThrow();
  });

  it('parses «Тип возврата» (returnStatus) and rejects an unknown value', () => {
    for (const s of ['none', 'partial', 'full'] as const) {
      expect(SupplyFilterSchema.parse({ returnStatus: s }).returnStatus).toBe(s);
    }
    expect(SupplyFilterSchema.parse({}).returnStatus).toBeUndefined();
    expect(() => SupplyFilterSchema.parse({ returnStatus: 'returned' })).toThrow();
  });

  it('parses «Кто изменил» (modifiedById) as a uuid and rejects a non-uuid', () => {
    expect(SupplyFilterSchema.parse({ modifiedById: uuid }).modifiedById).toBe(uuid);
    expect(SupplyFilterSchema.parse({}).modifiedById).toBeUndefined();
    expect(() => SupplyFilterSchema.parse({ modifiedById: 'nope' })).toThrow();
  });

  it('parses the multi-select inline filter ids (CSV string or array) and rejects bad uuids', () => {
    const uuid2 = '00000000-0000-0000-0000-000000000002';
    // CSV string → array of uuids (moysklad checkbox-dropdown forwards `id,id`).
    const fromCsv = SupplyFilterSchema.parse({ storeIds: `${uuid},${uuid2}` });
    expect(fromCsv.storeIds).toEqual([uuid, uuid2]);
    // Actual array also accepted.
    const fromArr = SupplyFilterSchema.parse({ agentIds: [uuid], productIds: [uuid2] });
    expect(fromArr.agentIds).toEqual([uuid]);
    expect(fromArr.productIds).toEqual([uuid2]);
    expect(SupplyFilterSchema.parse({}).storeIds).toBeUndefined();
    // A non-uuid member anywhere in the CSV is rejected (no silent drop).
    expect(() => SupplyFilterSchema.parse({ storeIds: `${uuid},not-a-uuid` })).toThrow();
    expect(() => SupplyFilterSchema.parse({ organizationIds: 'nope' })).toThrow();
  });
});

describe('UpdateSupplySchema optimistic-lock version token', () => {
  it('requires version on update (a save without it is rejected, not silently unguarded)', () => {
    expect(UpdateSupplySchema.safeParse({}).success).toBe(false);
    expect(UpdateSupplySchema.safeParse({ version: 1 }).success).toBe(true);
  });

  it('rejects a non-integer / negative / string version', () => {
    expect(UpdateSupplySchema.safeParse({ version: 1.5 }).success).toBe(false);
    expect(UpdateSupplySchema.safeParse({ version: -1 }).success).toBe(false);
    expect(UpdateSupplySchema.safeParse({ version: '1' }).success).toBe(false);
  });
});
