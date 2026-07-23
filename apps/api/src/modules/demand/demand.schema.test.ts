import { describe, expect, it } from 'vitest';
import {
  CreateDemandSchema,
  DemandFilterSchema,
  DemandStateSchema,
  DemandTransitionSchema,
  UpdateDemandSchema,
} from './demand.schema.js';

describe('DemandStateSchema', () => {
  it('accepts all three documented states', () => {
    expect(DemandStateSchema.parse('draft')).toBe('draft');
    expect(DemandStateSchema.parse('posted')).toBe('posted');
    expect(DemandStateSchema.parse('cancelled')).toBe('cancelled');
  });
  it('rejects unknown state', () => {
    expect(() => DemandStateSchema.parse('shipped')).toThrow();
  });
});

describe('DemandTransitionSchema', () => {
  it('accepts only post/unpost/cancel', () => {
    expect(DemandTransitionSchema.parse('post')).toBe('post');
    expect(DemandTransitionSchema.parse('unpost')).toBe('unpost');
    expect(DemandTransitionSchema.parse('cancel')).toBe('cancel');
  });
  it('rejects CustomerOrder-style transitions', () => {
    expect(() => DemandTransitionSchema.parse('confirmed')).toThrow();
    expect(() => DemandTransitionSchema.parse('draft')).toThrow();
  });
});

describe('CreateDemandSchema', () => {
  const valid = {
    agentId: '00000000-0000-0000-0000-000000000001',
    organizationId: '00000000-0000-0000-0000-000000000002',
    storeId: '00000000-0000-0000-0000-000000000003',
    positions: [
      {
        assortmentKind: 'product',
        assortmentId: '00000000-0000-0000-0000-000000000099',
        quantity: '2',
        priceMinor: '10000000',
      },
    ],
  };

  it('parses a minimal valid input', () => {
    const parsed = CreateDemandSchema.parse(valid);
    expect(parsed.vatEnabled).toBe(true);
    expect(parsed.vatIncluded).toBe(false);
    expect(parsed.currency).toBe('UZS');
    expect(parsed.rateValue).toBe('100000000');
    expect(parsed.positions).toHaveLength(1);
  });

  it('defaults «Накладные расходы» to 0 / PRICE / UZS (live §42: «по цене»)', () => {
    const parsed = CreateDemandSchema.parse(valid);
    expect(parsed.overheadSumMinor).toBe('0');
    expect(parsed.overheadDistribution).toBe('PRICE');
    expect(parsed.overheadCurrency).toBe('UZS');
  });

  it('accepts a valid overhead block', () => {
    const parsed = CreateDemandSchema.parse({
      ...valid,
      overheadSumMinor: '1250000',
      overheadDistribution: 'WEIGHT',
      overheadCurrency: 'USD',
    });
    expect(parsed.overheadSumMinor).toBe('1250000');
    expect(parsed.overheadDistribution).toBe('WEIGHT');
    expect(parsed.overheadCurrency).toBe('USD');
  });

  it('rejects negative overheadSumMinor', () => {
    expect(() => CreateDemandSchema.parse({ ...valid, overheadSumMinor: '-1' })).toThrow();
  });

  it('rejects an unknown overheadDistribution method', () => {
    expect(() =>
      CreateDemandSchema.parse({ ...valid, overheadDistribution: 'BY_VIBES' }),
    ).toThrow();
  });

  it('requires at least one position', () => {
    expect(() => CreateDemandSchema.parse({ ...valid, positions: [] })).toThrow(
      /at least one position/i,
    );
  });

  it('rejects negative quantity', () => {
    expect(() =>
      CreateDemandSchema.parse({
        ...valid,
        positions: [{ ...valid.positions[0], quantity: '-1' }],
      }),
    ).toThrow();
  });

  it('rejects zero quantity (a position must move stock)', () => {
    expect(() =>
      CreateDemandSchema.parse({
        ...valid,
        positions: [{ ...valid.positions[0], quantity: '0' }],
      }),
    ).toThrow();
    // and a fractional zero
    expect(() =>
      CreateDemandSchema.parse({
        ...valid,
        positions: [{ ...valid.positions[0], quantity: '0.000000' }],
      }),
    ).toThrow();
  });

  it('rejects non-integer priceMinor (cents must be integer)', () => {
    expect(() =>
      CreateDemandSchema.parse({
        ...valid,
        positions: [{ ...valid.positions[0], priceMinor: '100.5' }],
      }),
    ).toThrow();
  });

  it('accepts fractional quantity (e.g. 0.5 kg)', () => {
    const parsed = CreateDemandSchema.parse({
      ...valid,
      positions: [{ ...valid.positions[0], quantity: '0.5' }],
    });
    expect(parsed.positions[0].quantity).toBe('0.5');
  });

  it('accepts optional customerOrderId link', () => {
    const parsed = CreateDemandSchema.parse({
      ...valid,
      customerOrderId: '00000000-0000-0000-0000-000000000004',
    });
    expect(parsed.customerOrderId).toBe('00000000-0000-0000-0000-000000000004');
  });

  it('accepts optional customerOrderPositionId per position', () => {
    const parsed = CreateDemandSchema.parse({
      ...valid,
      positions: [
        {
          ...valid.positions[0],
          customerOrderPositionId: '00000000-0000-0000-0000-000000000077',
        },
      ],
    });
    expect(parsed.positions[0].customerOrderPositionId).toBe(
      '00000000-0000-0000-0000-000000000077',
    );
  });

  it('accepts optional «Внешний код» (externalCode)', () => {
    const parsed = CreateDemandSchema.parse({ ...valid, externalCode: 'DM-EXT-501' });
    expect(parsed.externalCode).toBe('DM-EXT-501');
  });

  it('leaves externalCode undefined when omitted', () => {
    const parsed = CreateDemandSchema.parse(valid);
    expect(parsed.externalCode).toBeUndefined();
  });

  it('rejects an externalCode longer than 50 chars', () => {
    expect(() => CreateDemandSchema.parse({ ...valid, externalCode: 'x'.repeat(51) })).toThrow();
  });

  it('UpdateDemandSchema inherits externalCode via .partial()', () => {
    const parsed = UpdateDemandSchema.parse({ version: 1, externalCode: 'PATCH-9' });
    expect(parsed.externalCode).toBe('PATCH-9');
  });

  it('UpdateDemandSchema requires version (optimistic-lock token, not silently unguarded)', () => {
    expect(UpdateDemandSchema.safeParse({}).success).toBe(false);
    expect(UpdateDemandSchema.safeParse({ version: 1 }).success).toBe(true);
    expect(UpdateDemandSchema.safeParse({ version: 1.5 }).success).toBe(false);
    expect(UpdateDemandSchema.safeParse({ version: -1 }).success).toBe(false);
    expect(UpdateDemandSchema.safeParse({ version: '1' }).success).toBe(false);
    // CREATE never requires version (new rows have no prior version).
    expect(CreateDemandSchema.safeParse(valid).success).toBe(true);
  });
});

describe('DemandFilterSchema', () => {
  it('applies defaults', () => {
    const parsed = DemandFilterSchema.parse({});
    expect(parsed.limit).toBe(50);
    expect(parsed.sortBy).toBe('moment');
    expect(parsed.sortDir).toBe('desc');
  });

  it('coerces limit from string', () => {
    const parsed = DemandFilterSchema.parse({ limit: '10' });
    expect(parsed.limit).toBe(10);
  });

  it('coerces applicable from string "true"', () => {
    const parsed = DemandFilterSchema.parse({ applicable: 'true' });
    expect(parsed.applicable).toBe(true);
  });

  // --- moysklad «Отгрузки» filter-panel parity (A1) ---

  const UUID = '00000000-0000-0000-0000-0000000000aa';

  it('accepts the new FK pickers (agentGroup / agentAccount / orgAccount / project / contract / salesChannel / group)', () => {
    const parsed = DemandFilterSchema.parse({
      agentGroupId: UUID,
      agentAccountId: UUID,
      organizationAccountId: UUID,
      projectId: UUID,
      contractId: UUID,
      salesChannelId: UUID,
      groupId: UUID,
      customerOrderId: UUID,
    });
    expect(parsed.agentGroupId).toBe(UUID);
    expect(parsed.agentAccountId).toBe(UUID);
    expect(parsed.organizationAccountId).toBe(UUID);
    expect(parsed.projectId).toBe(UUID);
    expect(parsed.contractId).toBe(UUID);
    expect(parsed.salesChannelId).toBe(UUID);
    expect(parsed.groupId).toBe(UUID);
    expect(parsed.customerOrderId).toBe(UUID);
  });

  it('accepts «Грузополучатель» (consigneeId) + «Товар или группа» (productId) filters', () => {
    const parsed = DemandFilterSchema.parse({ consigneeId: UUID, productId: UUID });
    expect(parsed.consigneeId).toBe(UUID);
    expect(parsed.productId).toBe(UUID);
  });

  it('rejects a non-uuid FK picker value', () => {
    expect(() => DemandFilterSchema.parse({ projectId: 'not-a-uuid' })).toThrow();
    expect(() => DemandFilterSchema.parse({ consigneeId: 'nope' })).toThrow();
    expect(() => DemandFilterSchema.parse({ productId: 'nope' })).toThrow();
  });

  it('accepts «Оплата» paymentStatus enum', () => {
    expect(DemandFilterSchema.parse({ paymentStatus: 'unpaid' }).paymentStatus).toBe('unpaid');
    expect(DemandFilterSchema.parse({ paymentStatus: 'partial' }).paymentStatus).toBe('partial');
    expect(DemandFilterSchema.parse({ paymentStatus: 'paid' }).paymentStatus).toBe('paid');
  });

  it('rejects an unknown paymentStatus', () => {
    expect(() => DemandFilterSchema.parse({ paymentStatus: 'overpaid' })).toThrow();
  });

  it('coerces printed / published booleans from string "true"/"false"', () => {
    expect(DemandFilterSchema.parse({ printed: 'true' }).printed).toBe(true);
    expect(DemandFilterSchema.parse({ printed: 'false' }).printed).toBe(false);
    expect(DemandFilterSchema.parse({ published: 'true' }).published).toBe(true);
  });

  it('accepts «Когда изменен» updatedFrom / updatedTo bounds', () => {
    const parsed = DemandFilterSchema.parse({
      updatedFrom: '2026-01-01',
      updatedTo: '2026-12-31',
    });
    expect(parsed.updatedFrom).toBe('2026-01-01');
    expect(parsed.updatedTo).toBe('2026-12-31');
  });

  it('accepts payedSumMinor as a sortable column', () => {
    expect(DemandFilterSchema.parse({ sortBy: 'payedSumMinor' }).sortBy).toBe('payedSumMinor');
  });

  it('still accepts the relational sorts (agent / organization / store)', () => {
    expect(DemandFilterSchema.parse({ sortBy: 'agent' }).sortBy).toBe('agent');
    expect(DemandFilterSchema.parse({ sortBy: 'organization' }).sortBy).toBe('organization');
    expect(DemandFilterSchema.parse({ sortBy: 'store' }).sortBy).toBe('store');
  });
});
