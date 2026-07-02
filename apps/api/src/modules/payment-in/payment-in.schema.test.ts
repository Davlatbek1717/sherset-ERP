import { describe, expect, it } from 'vitest';
import {
  CreatePaymentInSchema,
  PaymentInFilterSchema,
  PaymentInOperationInputSchema,
  PaymentInStateSchema,
  PaymentInTransitionSchema,
  UpdatePaymentInSchema,
} from './payment-in.schema.js';

describe('PaymentInStateSchema', () => {
  it('accepts documented states', () => {
    for (const s of ['draft', 'posted', 'cancelled']) {
      expect(PaymentInStateSchema.parse(s)).toBe(s);
    }
  });
  it('rejects unknown', () => {
    expect(() => PaymentInStateSchema.parse('received')).toThrow();
  });
});

describe('PaymentInTransitionSchema', () => {
  it('accepts post/unpost/cancel', () => {
    expect(PaymentInTransitionSchema.parse('post')).toBe('post');
    expect(PaymentInTransitionSchema.parse('unpost')).toBe('unpost');
    expect(PaymentInTransitionSchema.parse('cancel')).toBe('cancel');
  });
});

describe('PaymentInOperationInputSchema', () => {
  it('parses valid allocation', () => {
    const parsed = PaymentInOperationInputSchema.parse({
      invoiceOutId: '00000000-0000-0000-0000-000000000001',
      amountMinor: '1000000',
    });
    expect(parsed.targetKind).toBe('invoiceout');
    expect(parsed.amountMinor).toBe('1000000');
  });
  it('rejects non-integer amount', () => {
    expect(() =>
      PaymentInOperationInputSchema.parse({
        invoiceOutId: '00000000-0000-0000-0000-000000000001',
        amountMinor: '100.5',
      }),
    ).toThrow();
  });
});

describe('CreatePaymentInSchema', () => {
  const valid = {
    agentId: '00000000-0000-0000-0000-000000000001',
    organizationId: '00000000-0000-0000-0000-000000000002',
    sumMinor: '50000000',
  };

  it('parses minimal valid input', () => {
    const parsed = CreatePaymentInSchema.parse(valid);
    expect(parsed.sumMinor).toBe('50000000');
    expect(parsed.operations).toEqual([]);
    expect(parsed.currency).toBe('UZS');
  });

  it('accepts operations array', () => {
    const parsed = CreatePaymentInSchema.parse({
      ...valid,
      operations: [
        {
          invoiceOutId: '00000000-0000-0000-0000-000000000004',
          amountMinor: '50000000',
        },
      ],
    });
    expect(parsed.operations).toHaveLength(1);
  });

  it('rejects negative sumMinor regex', () => {
    expect(() => CreatePaymentInSchema.parse({ ...valid, sumMinor: '-100' })).toThrow();
  });

  it('accepts paymentPurpose + incomingNumber', () => {
    const parsed = CreatePaymentInSchema.parse({
      ...valid,
      paymentPurpose: "Schyot bo'yicha to'lov",
      incomingNumber: 'PAY-001',
      incomingDate: '2026-04-20T10:00:00Z',
    });
    expect(parsed.paymentPurpose).toBe("Schyot bo'yicha to'lov");
    expect(parsed.incomingNumber).toBe('PAY-001');
    expect(parsed.incomingDate).toBeInstanceOf(Date);
  });
});

describe('UpdatePaymentInSchema optimistic-lock version token', () => {
  it('requires version on update (a save without it is rejected, not silently unguarded)', () => {
    // .partial() means {} alone parses — without version it must be rejected,
    // so a forgetful caller cannot bypass the lock.
    expect(UpdatePaymentInSchema.safeParse({}).success).toBe(false);
    expect(UpdatePaymentInSchema.safeParse({ version: 1 }).success).toBe(true);
  });

  it('rejects a non-integer / negative / string version', () => {
    expect(UpdatePaymentInSchema.safeParse({ version: 1.5 }).success).toBe(false);
    expect(UpdatePaymentInSchema.safeParse({ version: -1 }).success).toBe(false);
    expect(UpdatePaymentInSchema.safeParse({ version: '1' }).success).toBe(false);
  });

  it('CREATE schema does not require version (new rows have no prior version)', () => {
    expect(
      CreatePaymentInSchema.safeParse({
        agentId: '00000000-0000-0000-0000-000000000001',
        organizationId: '00000000-0000-0000-0000-000000000002',
        sumMinor: '50000000',
      }).success,
    ).toBe(true);
  });
});

describe('PaymentInFilterSchema', () => {
  const uuid = (n: number) => `00000000-0000-0000-0000-0000000000${String(n).padStart(2, '0')}`;

  it('applies defaults', () => {
    const p = PaymentInFilterSchema.parse({});
    expect(p.limit).toBe(50);
    expect(p.sortBy).toBe('moment');
  });
  it('accepts invoiceOutId filter', () => {
    const p = PaymentInFilterSchema.parse({
      invoiceOutId: '00000000-0000-0000-0000-000000000004',
    });
    expect(p.invoiceOutId).toBe('00000000-0000-0000-0000-000000000004');
  });

  it('accepts the moysklad-parity FK filters', () => {
    const p = PaymentInFilterSchema.parse({
      agentGroupId: uuid(1),
      agentAccountId: uuid(2),
      organizationAccountId: uuid(3),
      contractId: uuid(4),
      projectId: uuid(5),
      salesChannelId: uuid(6),
      groupId: uuid(7),
      ownerId: uuid(8),
      agentOwnerId: uuid(9),
    });
    expect(p.agentGroupId).toBe(uuid(1));
    expect(p.agentAccountId).toBe(uuid(2));
    expect(p.organizationAccountId).toBe(uuid(3));
    expect(p.contractId).toBe(uuid(4));
    expect(p.projectId).toBe(uuid(5));
    expect(p.salesChannelId).toBe(uuid(6));
    expect(p.groupId).toBe(uuid(7));
    expect(p.ownerId).toBe(uuid(8));
    expect(p.agentOwnerId).toBe(uuid(9));
  });

  it('«Владелец контрагента» (agentOwnerId) is a distinct param from the payment owner', () => {
    // 11l parity: agentOwnerId narrows the agent (Counterparty) relation's
    // ownerId; ownerId narrows the PaymentIn's own owner. They must coexist as
    // separate params (the service merges agentOwnerId + agentGroupId into one
    // `agent: {}` clause — see payment-in.service buildListWhere).
    const p = PaymentInFilterSchema.parse({ agentOwnerId: uuid(9), ownerId: uuid(8) });
    expect(p.agentOwnerId).toBe(uuid(9));
    expect(p.ownerId).toBe(uuid(8));
    expect(() => PaymentInFilterSchema.parse({ agentOwnerId: 'not-a-uuid' })).toThrow();
  });

  it('rejects non-uuid FK filters', () => {
    expect(() => PaymentInFilterSchema.parse({ agentGroupId: 'not-a-uuid' })).toThrow();
    expect(() => PaymentInFilterSchema.parse({ contractId: '123' })).toThrow();
  });

  it('accepts paymentPurpose text-contains filter', () => {
    const p = PaymentInFilterSchema.parse({ paymentPurpose: "schyot bo'yicha" });
    expect(p.paymentPurpose).toBe("schyot bo'yicha");
  });

  it('accepts the «Когда изменен» updated range', () => {
    const p = PaymentInFilterSchema.parse({
      updatedFrom: '2026-01-01',
      updatedTo: '2026-12-31',
    });
    expect(p.updatedFrom).toBe('2026-01-01');
    expect(p.updatedTo).toBe('2026-12-31');
  });

  it('coerces tri-state «Проведено» (applicable) from string', () => {
    expect(PaymentInFilterSchema.parse({ applicable: 'true' }).applicable).toBe(true);
    expect(PaymentInFilterSchema.parse({ applicable: 'false' }).applicable).toBe(false);
  });

  it('accepts state filter', () => {
    const p = PaymentInFilterSchema.parse({ state: 'posted' });
    expect(p.state).toBe('posted');
  });

  it('extends sortBy with agent / organization', () => {
    expect(PaymentInFilterSchema.parse({ sortBy: 'agent' }).sortBy).toBe('agent');
    expect(PaymentInFilterSchema.parse({ sortBy: 'organization' }).sortBy).toBe('organization');
    expect(() => PaymentInFilterSchema.parse({ sortBy: 'bogus' })).toThrow();
  });
});
