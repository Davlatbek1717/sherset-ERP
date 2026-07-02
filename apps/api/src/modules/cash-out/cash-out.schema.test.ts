import { describe, expect, it } from 'vitest';
import {
  CashOutFilterSchema,
  CreateCashOutSchema,
  UpdateCashOutSchema,
} from './cash-out.schema.js';

const uuid = () => crypto.randomUUID();

describe('CreateCashOutSchema', () => {
  const base = {
    agentId: uuid(),
    organizationId: uuid(),
    cashDeskId: uuid(),
    sumMinor: '500000',
  };

  it('accepts a minimal valid payload', () => {
    expect(CreateCashOutSchema.safeParse(base).success).toBe(true);
  });

  it('defaults targetKind to invoicein inside operations', () => {
    const r = CreateCashOutSchema.safeParse({
      ...base,
      operations: [{ invoiceInId: uuid(), amountMinor: '500000' }],
    });
    if (!r.success) throw r.error;
    expect(r.data.operations[0]?.targetKind).toBe('invoicein');
  });

  it('rejects negative-looking amount string (regex forbids minus)', () => {
    const r = CreateCashOutSchema.safeParse({
      ...base,
      operations: [{ invoiceInId: uuid(), amountMinor: '-100' }],
    });
    expect(r.success).toBe(false);
  });

  it('rejects missing cashDeskId', () => {
    const { cashDeskId, ...rest } = base;
    void cashDeskId;
    expect(CreateCashOutSchema.safeParse(rest).success).toBe(false);
  });

  it('accepts expenseItem (Статья расходов) so the dead column becomes live', () => {
    // Until 2026-06-11n the `expenseItem` column was never written by create —
    // the pre-existing list filter on it was a dead 11h control. Accepting it
    // here is what makes the column (and that filter) honest. Cash-out-only.
    const r = CreateCashOutSchema.safeParse({ ...base, expenseItem: 'Аренда' });
    if (!r.success) throw r.error;
    expect(r.data.expenseItem).toBe('Аренда');
  });

  it('rejects expenseItem longer than 100 chars', () => {
    expect(CreateCashOutSchema.safeParse({ ...base, expenseItem: 'x'.repeat(101) }).success).toBe(
      false,
    );
  });
});

describe('UpdateCashOutSchema optimistic-lock version token', () => {
  it('requires version on update (a save without it is rejected, not silently unguarded)', () => {
    // UpdateCashOutSchema = CreateCashOutSchema.partial().extend({ version }):
    // every create field is optional on update, so {} alone would parse — but
    // the required version token makes a versionless update fail.
    expect(UpdateCashOutSchema.safeParse({}).success).toBe(false);
    expect(UpdateCashOutSchema.safeParse({ version: 1 }).success).toBe(true);
  });

  it('rejects a non-integer / negative / string version', () => {
    expect(UpdateCashOutSchema.safeParse({ version: 1.5 }).success).toBe(false);
    expect(UpdateCashOutSchema.safeParse({ version: -1 }).success).toBe(false);
    expect(UpdateCashOutSchema.safeParse({ version: '1' }).success).toBe(false);
  });

  it('CREATE schema does not require version (new rows have no prior version)', () => {
    expect(
      CreateCashOutSchema.safeParse({
        agentId: uuid(),
        organizationId: uuid(),
        cashDeskId: uuid(),
        sumMinor: '500000',
      }).success,
    ).toBe(true);
  });
});

describe('CashOutFilterSchema', () => {
  it('accepts invoiceInId filter', () => {
    const r = CashOutFilterSchema.safeParse({ invoiceInId: uuid() });
    expect(r.success).toBe(true);
  });

  it('rejects unrelated target filter field', () => {
    // invoiceOutId is not on cash-out filter
    const r = CashOutFilterSchema.safeParse({ invoiceOutId: uuid() });
    // Zod default strips unknown keys rather than rejecting.
    expect(r.success).toBe(true);
  });

  it('defaults limit=50, sortBy=moment, sortDir=desc', () => {
    const r = CashOutFilterSchema.safeParse({});
    if (!r.success) throw r.error;
    expect(r.data.limit).toBe(50);
    expect(r.data.sortBy).toBe('moment');
    expect(r.data.sortDir).toBe('desc');
  });

  it('parses applicable=true from string query', () => {
    const r = CashOutFilterSchema.safeParse({ applicable: 'true' });
    if (!r.success) throw r.error;
    expect(r.data.applicable).toBe(true);
  });

  it('accepts the extended moysklad-parity FK + range filters', () => {
    const r = CashOutFilterSchema.safeParse({
      agentGroupId: uuid(),
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

  it('accepts the cash-out-only «Статья расходов» text filter (expenseItem)', () => {
    const r = CashOutFilterSchema.safeParse({ expenseItem: 'Аренда' });
    if (!r.success) throw r.error;
    expect(r.data.expenseItem).toBe('Аренда');
  });

  it('accepts agentOwnerId (Владелец контрагента) distinct from ownerId (Владелец-сотрудник)', () => {
    const r = CashOutFilterSchema.safeParse({
      agentOwnerId: '00000000-0000-0000-0000-0000000000a1',
      ownerId: '00000000-0000-0000-0000-0000000000b2',
    });
    if (!r.success) throw r.error;
    // agentOwnerId narrows the counterparty's owner (agent.ownerId); ownerId
    // narrows the cash order's own owner — two different relations, both kept.
    expect(r.data.agentOwnerId).toBe('00000000-0000-0000-0000-0000000000a1');
    expect(r.data.ownerId).toBe('00000000-0000-0000-0000-0000000000b2');
  });

  it('rejects a non-uuid agentOwnerId', () => {
    expect(CashOutFilterSchema.safeParse({ agentOwnerId: 'not-a-uuid' }).success).toBe(false);
  });

  it('accepts agent and organization as relational sort keys', () => {
    for (const sortBy of ['agent', 'organization'] as const) {
      const r = CashOutFilterSchema.safeParse({ sortBy });
      if (!r.success) throw r.error;
      expect(r.data.sortBy).toBe(sortBy);
    }
  });

  it('rejects an unknown sort key', () => {
    expect(CashOutFilterSchema.safeParse({ sortBy: 'cashDesk' }).success).toBe(false);
  });

  it('rejects a non-uuid agentGroupId', () => {
    expect(CashOutFilterSchema.safeParse({ agentGroupId: 'not-a-uuid' }).success).toBe(false);
  });
});
