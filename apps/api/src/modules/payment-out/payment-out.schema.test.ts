import { describe, expect, it } from 'vitest';
import {
  CreateFromInvoiceInSchema,
  CreateFromPurchaseOrderAdvanceSchema,
  CreatePaymentOutSchema,
  PaymentOutFilterSchema,
  PaymentOutOperationInputSchema,
  PaymentOutStateSchema,
  PaymentOutTransitionSchema,
  UpdatePaymentOutSchema,
} from './payment-out.schema.js';

describe('PaymentOutStateSchema', () => {
  it('accepts documented states', () => {
    for (const s of ['draft', 'posted', 'cancelled']) {
      expect(PaymentOutStateSchema.parse(s)).toBe(s);
    }
  });
  it('rejects PaymentIn-specific / unknown states', () => {
    expect(() => PaymentOutStateSchema.parse('received')).toThrow();
    expect(() => PaymentOutStateSchema.parse('partially_paid')).toThrow();
  });
});

describe('PaymentOutTransitionSchema', () => {
  it('accepts post/unpost/cancel', () => {
    expect(PaymentOutTransitionSchema.parse('post')).toBe('post');
    expect(PaymentOutTransitionSchema.parse('unpost')).toBe('unpost');
    expect(PaymentOutTransitionSchema.parse('cancel')).toBe('cancel');
  });
});

describe('PaymentOutOperationInputSchema — discriminated allocation', () => {
  it('accepts invoicein allocation', () => {
    const parsed = PaymentOutOperationInputSchema.parse({
      targetKind: 'invoicein',
      invoiceInId: '00000000-0000-0000-0000-000000000001',
      amountMinor: '1000000',
    });
    expect(parsed.targetKind).toBe('invoicein');
    expect(parsed.invoiceInId).toBe('00000000-0000-0000-0000-000000000001');
    expect(parsed.amountMinor).toBe('1000000');
  });

  it('accepts purchaseorder advance allocation', () => {
    const parsed = PaymentOutOperationInputSchema.parse({
      targetKind: 'purchaseorder',
      purchaseOrderId: '00000000-0000-0000-0000-000000000002',
      amountMinor: '500000',
    });
    expect(parsed.targetKind).toBe('purchaseorder');
    expect(parsed.purchaseOrderId).toBe('00000000-0000-0000-0000-000000000002');
  });

  it('rejects invoicein without invoiceInId', () => {
    expect(() =>
      PaymentOutOperationInputSchema.parse({
        targetKind: 'invoicein',
        amountMinor: '1000',
      }),
    ).toThrow();
  });

  it('rejects purchaseorder without purchaseOrderId', () => {
    expect(() =>
      PaymentOutOperationInputSchema.parse({
        targetKind: 'purchaseorder',
        amountMinor: '1000',
      }),
    ).toThrow();
  });

  it('rejects both ids set simultaneously', () => {
    expect(() =>
      PaymentOutOperationInputSchema.parse({
        targetKind: 'invoicein',
        invoiceInId: '00000000-0000-0000-0000-000000000001',
        purchaseOrderId: '00000000-0000-0000-0000-000000000002',
        amountMinor: '1000',
      }),
    ).toThrow();
  });

  it('rejects non-integer amount', () => {
    expect(() =>
      PaymentOutOperationInputSchema.parse({
        targetKind: 'invoicein',
        invoiceInId: '00000000-0000-0000-0000-000000000001',
        amountMinor: '100.5',
      }),
    ).toThrow();
  });
});

describe('CreatePaymentOutSchema', () => {
  const valid = {
    agentId: '00000000-0000-0000-0000-000000000001',
    organizationId: '00000000-0000-0000-0000-000000000002',
    sumMinor: '50000000',
  };

  it('parses minimal valid input', () => {
    const parsed = CreatePaymentOutSchema.parse(valid);
    expect(parsed.sumMinor).toBe('50000000');
    expect(parsed.operations).toEqual([]);
    expect(parsed.currency).toBe('UZS');
  });

  it('accepts mixed operations (invoicein + purchaseorder)', () => {
    const parsed = CreatePaymentOutSchema.parse({
      ...valid,
      operations: [
        {
          targetKind: 'invoicein',
          invoiceInId: '00000000-0000-0000-0000-000000000010',
          amountMinor: '30000000',
        },
        {
          targetKind: 'purchaseorder',
          purchaseOrderId: '00000000-0000-0000-0000-000000000020',
          amountMinor: '20000000',
        },
      ],
    });
    expect(parsed.operations).toHaveLength(2);
  });

  it('rejects negative sumMinor regex', () => {
    expect(() => CreatePaymentOutSchema.parse({ ...valid, sumMinor: '-100' })).toThrow();
  });

  it('accepts paymentPurpose', () => {
    const parsed = CreatePaymentOutSchema.parse({
      ...valid,
      paymentPurpose: "Ta'minlovchiga to'lov",
    });
    expect(parsed.paymentPurpose).toBe("Ta'minlovchiga to'lov");
  });

  it('accepts expenseItem (Статья расходов) so the column becomes live', () => {
    const parsed = CreatePaymentOutSchema.parse({ ...valid, expenseItem: 'Аренда' });
    expect(parsed.expenseItem).toBe('Аренда');
  });

  it('rejects expenseItem longer than 100 chars', () => {
    expect(() =>
      CreatePaymentOutSchema.parse({ ...valid, expenseItem: 'x'.repeat(101) }),
    ).toThrow();
  });
});

describe('UpdatePaymentOutSchema optimistic-lock version token', () => {
  it('requires version on update (a save without it is rejected, not silently unguarded)', () => {
    expect(UpdatePaymentOutSchema.safeParse({}).success).toBe(false);
    expect(UpdatePaymentOutSchema.safeParse({ version: 1 }).success).toBe(true);
  });

  it('rejects a non-integer / negative / string version', () => {
    expect(UpdatePaymentOutSchema.safeParse({ version: 1.5 }).success).toBe(false);
    expect(UpdatePaymentOutSchema.safeParse({ version: -1 }).success).toBe(false);
    expect(UpdatePaymentOutSchema.safeParse({ version: '1' }).success).toBe(false);
  });

  it('CREATE schema does not require version (new rows have no prior version)', () => {
    expect(
      CreatePaymentOutSchema.safeParse({
        agentId: '00000000-0000-0000-0000-000000000001',
        organizationId: '00000000-0000-0000-0000-000000000002',
        sumMinor: '50000000',
      }).success,
    ).toBe(true);
  });
});

describe('CreateFromInvoiceInSchema', () => {
  it('accepts empty object (full-remaining default)', () => {
    const parsed = CreateFromInvoiceInSchema.parse({});
    expect(parsed.sumMinor).toBeUndefined();
  });
  it('accepts explicit sumMinor override', () => {
    const parsed = CreateFromInvoiceInSchema.parse({ sumMinor: '12345678' });
    expect(parsed.sumMinor).toBe('12345678');
  });
});

describe('CreateFromPurchaseOrderAdvanceSchema', () => {
  it('requires explicit sumMinor (no remaining-default for advances)', () => {
    expect(() => CreateFromPurchaseOrderAdvanceSchema.parse({})).toThrow();
  });
  it('accepts explicit sumMinor', () => {
    const parsed = CreateFromPurchaseOrderAdvanceSchema.parse({ sumMinor: '5000000' });
    expect(parsed.sumMinor).toBe('5000000');
  });
});

describe('PaymentOutFilterSchema', () => {
  it('applies defaults', () => {
    const p = PaymentOutFilterSchema.parse({});
    expect(p.limit).toBe(50);
    expect(p.sortBy).toBe('moment');
  });
  it('accepts invoiceInId + purchaseOrderId filters', () => {
    const p = PaymentOutFilterSchema.parse({
      invoiceInId: '00000000-0000-0000-0000-000000000010',
      purchaseOrderId: '00000000-0000-0000-0000-000000000020',
    });
    expect(p.invoiceInId).toBe('00000000-0000-0000-0000-000000000010');
    expect(p.purchaseOrderId).toBe('00000000-0000-0000-0000-000000000020');
  });

  // moysklad «Исходящие платежи» filter-panel parity — extended FK + text
  // fields mirroring payment-in. (~14 reference labels.)
  it('accepts the extended FK filters (agentGroup / accounts / contract / project / channel / group)', () => {
    const p = PaymentOutFilterSchema.parse({
      agentGroupId: '00000000-0000-0000-0000-000000000001',
      agentAccountId: '00000000-0000-0000-0000-000000000002',
      organizationAccountId: '00000000-0000-0000-0000-000000000003',
      contractId: '00000000-0000-0000-0000-000000000004',
      projectId: '00000000-0000-0000-0000-000000000005',
      salesChannelId: '00000000-0000-0000-0000-000000000006',
      groupId: '00000000-0000-0000-0000-000000000007',
      ownerId: '00000000-0000-0000-0000-000000000008',
    });
    expect(p.agentGroupId).toBe('00000000-0000-0000-0000-000000000001');
    expect(p.agentAccountId).toBe('00000000-0000-0000-0000-000000000002');
    expect(p.organizationAccountId).toBe('00000000-0000-0000-0000-000000000003');
    expect(p.contractId).toBe('00000000-0000-0000-0000-000000000004');
    expect(p.projectId).toBe('00000000-0000-0000-0000-000000000005');
    expect(p.salesChannelId).toBe('00000000-0000-0000-0000-000000000006');
    expect(p.groupId).toBe('00000000-0000-0000-0000-000000000007');
    expect(p.ownerId).toBe('00000000-0000-0000-0000-000000000008');
  });

  it('accepts agentOwnerId (Владелец контрагента) distinct from ownerId (Владелец-сотрудник)', () => {
    const p = PaymentOutFilterSchema.parse({
      agentOwnerId: '00000000-0000-0000-0000-0000000000a1',
      ownerId: '00000000-0000-0000-0000-0000000000b2',
    });
    // agentOwnerId narrows the counterparty's owner; ownerId narrows the
    // payment's own owner. They must be independently captured, not aliased.
    expect(p.agentOwnerId).toBe('00000000-0000-0000-0000-0000000000a1');
    expect(p.ownerId).toBe('00000000-0000-0000-0000-0000000000b2');
  });

  it('accepts paymentPurpose + expenseItem text filters', () => {
    const p = PaymentOutFilterSchema.parse({
      paymentPurpose: 'avans',
      expenseItem: 'arenda',
    });
    expect(p.paymentPurpose).toBe('avans');
    expect(p.expenseItem).toBe('arenda');
  });

  it('rejects expenseItem longer than 100 chars', () => {
    expect(() => PaymentOutFilterSchema.parse({ expenseItem: 'x'.repeat(101) })).toThrow();
  });

  it('coerces the applicable flag from a string', () => {
    expect(PaymentOutFilterSchema.parse({ applicable: 'true' }).applicable).toBe(true);
    expect(PaymentOutFilterSchema.parse({ applicable: 'false' }).applicable).toBe(false);
  });

  it('accepts the updatedFrom/updatedTo range (Когда изменен)', () => {
    const p = PaymentOutFilterSchema.parse({
      updatedFrom: '2026-01-01',
      updatedTo: '2026-12-31',
    });
    expect(p.updatedFrom).toBe('2026-01-01');
    expect(p.updatedTo).toBe('2026-12-31');
  });

  it('accepts agent / organization as relational sort keys', () => {
    expect(PaymentOutFilterSchema.parse({ sortBy: 'agent' }).sortBy).toBe('agent');
    expect(PaymentOutFilterSchema.parse({ sortBy: 'organization' }).sortBy).toBe('organization');
  });

  it('rejects an unknown sortBy key', () => {
    expect(() => PaymentOutFilterSchema.parse({ sortBy: 'expenseItem' })).toThrow();
  });
});
