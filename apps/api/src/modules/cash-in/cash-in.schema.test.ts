import { describe, expect, it } from 'vitest';
import { CashInFilterSchema, CreateCashInSchema, UpdateCashInSchema } from './cash-in.schema.js';

const uuid = () => crypto.randomUUID();

describe('CreateCashInSchema', () => {
  const base = {
    agentId: uuid(),
    organizationId: uuid(),
    cashDeskId: uuid(),
    sumMinor: '1000000',
  };

  it('accepts a minimal valid payload', () => {
    const r = CreateCashInSchema.safeParse(base);
    expect(r.success).toBe(true);
  });

  it('defaults currency to UZS and rateValue to 1.0 (100000000)', () => {
    const r = CreateCashInSchema.safeParse(base);
    if (!r.success) throw r.error;
    expect(r.data.currency).toBe('UZS');
    expect(r.data.rateValue).toBe('100000000');
    expect(r.data.operations).toEqual([]);
  });

  it('rejects missing cashDeskId', () => {
    const { cashDeskId, ...rest } = base;
    void cashDeskId;
    expect(CreateCashInSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects non-integer sumMinor (e.g. decimal)', () => {
    expect(CreateCashInSchema.safeParse({ ...base, sumMinor: '100.50' }).success).toBe(false);
  });

  it('accepts multiple invoice-out allocations', () => {
    const r = CreateCashInSchema.safeParse({
      ...base,
      operations: [
        { invoiceOutId: uuid(), amountMinor: '500000' },
        { invoiceOutId: uuid(), amountMinor: '500000' },
      ],
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.operations).toHaveLength(2);
  });

  it('rejects 4-char currency', () => {
    expect(CreateCashInSchema.safeParse({ ...base, currency: 'USDT' }).success).toBe(false);
  });
});

describe('UpdateCashInSchema optimistic-lock version token', () => {
  it('requires version on update', () => {
    // A field-edit payload WITHOUT version must be rejected so a forgetful
    // caller can't silently bypass the lost-update guard.
    expect(UpdateCashInSchema.safeParse({ description: 'edited' }).success).toBe(false);
    expect(UpdateCashInSchema.safeParse({ description: 'edited', version: 1 }).success).toBe(true);
  });

  it('rejects a non-integer / negative / string version', () => {
    expect(UpdateCashInSchema.safeParse({ description: 'edited', version: 1.5 }).success).toBe(
      false,
    );
    expect(UpdateCashInSchema.safeParse({ description: 'edited', version: -1 }).success).toBe(
      false,
    );
    expect(UpdateCashInSchema.safeParse({ description: 'edited', version: '1' }).success).toBe(
      false,
    );
  });

  it('CREATE schema does not require version (new rows have no prior version)', () => {
    expect(
      CreateCashInSchema.safeParse({
        agentId: uuid(),
        organizationId: uuid(),
        cashDeskId: uuid(),
        sumMinor: '1000000',
      }).success,
    ).toBe(true);
  });
});

describe('CashInFilterSchema', () => {
  it('defaults limit=50, sortBy=moment, sortDir=desc', () => {
    const r = CashInFilterSchema.safeParse({});
    if (!r.success) throw r.error;
    expect(r.data.limit).toBe(50);
    expect(r.data.sortBy).toBe('moment');
    expect(r.data.sortDir).toBe('desc');
  });

  it('coerces string limit to number', () => {
    const r = CashInFilterSchema.safeParse({ limit: '25' });
    if (!r.success) throw r.error;
    expect(r.data.limit).toBe(25);
  });

  it('parses applicable=true from string query', () => {
    const r = CashInFilterSchema.safeParse({ applicable: 'true' });
    if (!r.success) throw r.error;
    expect(r.data.applicable).toBe(true);
  });

  it('rejects invalid state', () => {
    expect(CashInFilterSchema.safeParse({ state: 'posted-invalid' }).success).toBe(false);
  });

  it('rejects limit above max (500)', () => {
    expect(CashInFilterSchema.safeParse({ limit: 501 }).success).toBe(false);
  });

  it('accepts the extended moysklad-parity FK + range filters', () => {
    const r = CashInFilterSchema.safeParse({
      agentGroupId: uuid(),
      agentOwnerId: uuid(),
      contractId: uuid(),
      projectId: uuid(),
      salesChannelId: uuid(),
      groupId: uuid(),
      cashDeskId: uuid(),
      paymentPurpose: 'arenda',
      updatedFrom: '2026-01-01',
      updatedTo: '2026-02-01',
    });
    if (!r.success) throw r.error;
    expect(r.data.paymentPurpose).toBe('arenda');
    expect(r.data.updatedFrom).toBe('2026-01-01');
  });

  it('accepts «Владелец контрагента» (agentOwnerId) as a uuid', () => {
    const id = uuid();
    const r = CashInFilterSchema.safeParse({ agentOwnerId: id });
    if (!r.success) throw r.error;
    expect(r.data.agentOwnerId).toBe(id);
  });

  it('rejects a non-uuid agentOwnerId', () => {
    expect(CashInFilterSchema.safeParse({ agentOwnerId: 'not-a-uuid' }).success).toBe(false);
  });

  it('accepts agent and organization as relational sort keys', () => {
    for (const sortBy of ['agent', 'organization'] as const) {
      const r = CashInFilterSchema.safeParse({ sortBy });
      if (!r.success) throw r.error;
      expect(r.data.sortBy).toBe(sortBy);
    }
  });

  it('rejects an unknown sort key', () => {
    expect(CashInFilterSchema.safeParse({ sortBy: 'cashDesk' }).success).toBe(false);
  });

  it('rejects a non-uuid agentGroupId', () => {
    expect(CashInFilterSchema.safeParse({ agentGroupId: 'not-a-uuid' }).success).toBe(false);
  });
});
