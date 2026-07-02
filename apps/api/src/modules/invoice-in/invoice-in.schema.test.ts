import { describe, expect, it } from 'vitest';
import {
  CreateFromPurchaseOrderSchema,
  CreateInvoiceInSchema,
  InvoiceInFilterSchema,
  InvoiceInStateSchema,
  InvoiceInTransitionSchema,
  UpdateInvoiceInSchema,
} from './invoice-in.schema.js';

describe('InvoiceInStateSchema', () => {
  it('accepts all documented states', () => {
    for (const s of ['draft', 'posted', 'partially_paid', 'paid', 'cancelled']) {
      expect(InvoiceInStateSchema.parse(s)).toBe(s);
    }
  });
  it('rejects states that exist on InvoiceOut but not InvoiceIn', () => {
    // `sent` and `overdue` are not valid for InvoiceIn
    expect(() => InvoiceInStateSchema.parse('sent')).toThrow();
    expect(() => InvoiceInStateSchema.parse('overdue')).toThrow();
  });
  it('rejects unknown state', () => {
    expect(() => InvoiceInStateSchema.parse('sent_back')).toThrow();
  });
});

describe('InvoiceInTransitionSchema', () => {
  it('accepts post/unpost/cancel', () => {
    expect(InvoiceInTransitionSchema.parse('post')).toBe('post');
    expect(InvoiceInTransitionSchema.parse('unpost')).toBe('unpost');
    expect(InvoiceInTransitionSchema.parse('cancel')).toBe('cancel');
  });
  it('rejects purchase-order-style transitions', () => {
    expect(() => InvoiceInTransitionSchema.parse('confirm')).toThrow();
  });
});

describe('CreateInvoiceInSchema', () => {
  const valid = {
    agentId: '00000000-0000-0000-0000-000000000001',
    organizationId: '00000000-0000-0000-0000-000000000002',
    positions: [
      {
        assortmentKind: 'product',
        assortmentId: '00000000-0000-0000-0000-000000000099',
        quantity: '2',
        priceMinor: '10000000',
      },
    ],
  };

  it('parses minimal valid input', () => {
    const parsed = CreateInvoiceInSchema.parse(valid);
    expect(parsed.currency).toBe('UZS');
    expect(parsed.vatEnabled).toBe(true);
    expect(parsed.vatIncluded).toBe(false);
  });

  it('requires at least one position', () => {
    expect(() => CreateInvoiceInSchema.parse({ ...valid, positions: [] })).toThrow(
      /at least one position/i,
    );
  });

  it('accepts purchaseOrderId', () => {
    const parsed = CreateInvoiceInSchema.parse({
      ...valid,
      purchaseOrderId: '00000000-0000-0000-0000-000000000004',
    });
    expect(parsed.purchaseOrderId).toBe('00000000-0000-0000-0000-000000000004');
  });

  it('accepts incomingNumber + incomingDate for supplier document identity', () => {
    const parsed = CreateInvoiceInSchema.parse({
      ...valid,
      incomingNumber: 'INV-2026-0042',
      incomingDate: '2026-04-15T00:00:00Z',
    });
    expect(parsed.incomingNumber).toBe('INV-2026-0042');
    expect(parsed.incomingDate).toBeInstanceOf(Date);
  });

  it('accepts paymentPlannedMoment date string', () => {
    const parsed = CreateInvoiceInSchema.parse({
      ...valid,
      paymentPlannedMoment: '2026-05-01T00:00:00Z',
    });
    expect(parsed.paymentPlannedMoment).toBeInstanceOf(Date);
  });
});

describe('CreateFromPurchaseOrderSchema', () => {
  it('accepts empty object (full-quantity default)', () => {
    const parsed = CreateFromPurchaseOrderSchema.parse({});
    expect(parsed.quantities).toBeUndefined();
  });

  it('accepts partial quantity overrides', () => {
    const parsed = CreateFromPurchaseOrderSchema.parse({
      quantities: { '00000000-0000-0000-0000-000000000010': '1.5' },
    });
    expect(parsed.quantities?.['00000000-0000-0000-0000-000000000010']).toBe('1.5');
  });
});

describe('InvoiceInFilterSchema', () => {
  const uuid = '00000000-0000-0000-0000-000000000001';

  it('applies defaults', () => {
    const p = InvoiceInFilterSchema.parse({});
    expect(p.limit).toBe(50);
    expect(p.sortBy).toBe('moment');
    expect(p.sortDir).toBe('desc');
  });
  it('accepts purchaseOrderId filter', () => {
    const p = InvoiceInFilterSchema.parse({
      purchaseOrderId: '00000000-0000-0000-0000-000000000007',
    });
    expect(p.purchaseOrderId).toBe('00000000-0000-0000-0000-000000000007');
  });

  it('parses the full moysklad-parity filter field set', () => {
    const p = InvoiceInFilterSchema.parse({
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
    expect(p.storeId).toBe(uuid);
    expect(p.contractId).toBe(uuid);
    expect(p.projectId).toBe(uuid);
    expect(p.groupId).toBe(uuid);
    expect(p.purchaseOrderId).toBe(uuid);
  });

  it('parses «Владелец контрагента» (agentOwnerId) independently of «Владелец-сотрудник» (ownerId)', () => {
    // agentOwnerId = agent.ownerId (the counterparty's owner employee), a
    // DIFFERENT field from ownerId (the invoice's own owner). Both must survive a
    // parse so buildListWhere can merge agentOwnerId into the `agent` clause
    // while ownerId stays a top-level scalar.
    const agentOwner = '00000000-0000-0000-0000-0000000000aa';
    const invoiceOwner = '00000000-0000-0000-0000-0000000000bb';
    const p = InvoiceInFilterSchema.parse({ agentOwnerId: agentOwner, ownerId: invoiceOwner });
    expect(p.agentOwnerId).toBe(agentOwner);
    expect(p.ownerId).toBe(invoiceOwner);
  });

  it('coerces the tri-state boolean flags from query strings', () => {
    const p = InvoiceInFilterSchema.parse({
      applicable: 'true',
      printed: 'false',
      published: 'true',
    });
    expect(p.applicable).toBe(true);
    expect(p.printed).toBe(false);
    expect(p.published).toBe(true);
  });

  it('leaves the boolean flags undefined when absent (no false-positive filter)', () => {
    const p = InvoiceInFilterSchema.parse({});
    expect(p.applicable).toBeUndefined();
    expect(p.printed).toBeUndefined();
    expect(p.published).toBeUndefined();
  });

  it('accepts the «Когда изменен» updated period range', () => {
    const p = InvoiceInFilterSchema.parse({
      updatedFrom: '2026-01-01',
      updatedTo: '2026-01-31',
    });
    expect(p.updatedFrom).toBe('2026-01-01');
    expect(p.updatedTo).toBe('2026-01-31');
  });

  it('accepts agent + organization relational sort keys', () => {
    expect(InvoiceInFilterSchema.parse({ sortBy: 'agent' }).sortBy).toBe('agent');
    expect(InvoiceInFilterSchema.parse({ sortBy: 'organization' }).sortBy).toBe('organization');
  });

  it('rejects a non-uuid FK filter', () => {
    expect(() => InvoiceInFilterSchema.parse({ agentGroupId: 'not-a-uuid' })).toThrow();
    expect(() => InvoiceInFilterSchema.parse({ agentOwnerId: 'not-a-uuid' })).toThrow();
    expect(() => InvoiceInFilterSchema.parse({ contractId: 'nope' })).toThrow();
  });
});

describe('UpdateInvoiceInSchema optimistic-lock version token', () => {
  it('requires version on update (a save without it is rejected, not silently unguarded)', () => {
    expect(UpdateInvoiceInSchema.safeParse({}).success).toBe(false);
    expect(UpdateInvoiceInSchema.safeParse({ version: 1 }).success).toBe(true);
  });

  it('rejects a non-integer / negative / string version', () => {
    expect(UpdateInvoiceInSchema.safeParse({ version: 1.5 }).success).toBe(false);
    expect(UpdateInvoiceInSchema.safeParse({ version: -1 }).success).toBe(false);
    expect(UpdateInvoiceInSchema.safeParse({ version: '1' }).success).toBe(false);
  });
});
