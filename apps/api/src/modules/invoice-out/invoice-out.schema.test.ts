import { describe, expect, it } from 'vitest';
import {
  CreateInvoiceOutSchema,
  InvoiceOutFilterSchema,
  InvoiceOutStateSchema,
  InvoiceOutTransitionSchema,
  UpdateInvoiceOutSchema,
} from './invoice-out.schema.js';

describe('InvoiceOutStateSchema', () => {
  it('accepts all documented states', () => {
    for (const s of ['draft', 'posted', 'sent', 'partially_paid', 'paid', 'overdue', 'cancelled']) {
      expect(InvoiceOutStateSchema.parse(s)).toBe(s);
    }
  });
  it('rejects unknown state', () => {
    expect(() => InvoiceOutStateSchema.parse('sent_back')).toThrow();
  });
});

describe('InvoiceOutTransitionSchema', () => {
  it('accepts post/unpost/cancel/mark_sent', () => {
    expect(InvoiceOutTransitionSchema.parse('post')).toBe('post');
    expect(InvoiceOutTransitionSchema.parse('unpost')).toBe('unpost');
    expect(InvoiceOutTransitionSchema.parse('cancel')).toBe('cancel');
    expect(InvoiceOutTransitionSchema.parse('mark_sent')).toBe('mark_sent');
  });

  it('rejects unknown targets', () => {
    expect(InvoiceOutTransitionSchema.safeParse('approve').success).toBe(false);
  });
});

describe('CreateInvoiceOutSchema', () => {
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
    const parsed = CreateInvoiceOutSchema.parse(valid);
    expect(parsed.currency).toBe('UZS');
    expect(parsed.vatEnabled).toBe(true);
    expect(parsed.vatIncluded).toBe(false);
  });

  it('allows empty positions — owner 2026-07-08, no Provedeno precondition', () => {
    expect(() => CreateInvoiceOutSchema.parse({ ...valid, positions: [] })).not.toThrow();
  });

  it('accepts customerOrderId', () => {
    const parsed = CreateInvoiceOutSchema.parse({
      ...valid,
      customerOrderId: '00000000-0000-0000-0000-000000000004',
    });
    expect(parsed.customerOrderId).toBe('00000000-0000-0000-0000-000000000004');
  });

  it('accepts paymentPlannedMoment date string', () => {
    const parsed = CreateInvoiceOutSchema.parse({
      ...valid,
      paymentPlannedMoment: '2026-05-01T00:00:00Z',
    });
    expect(parsed.paymentPlannedMoment).toBeInstanceOf(Date);
  });
});

describe('InvoiceOutFilterSchema', () => {
  it('applies defaults', () => {
    const p = InvoiceOutFilterSchema.parse({});
    expect(p.limit).toBe(50);
    expect(p.sortBy).toBe('moment');
    expect(p.sortDir).toBe('desc');
  });

  it('accepts the moysklad parity FK filters', () => {
    const id = '00000000-0000-0000-0000-0000000000aa';
    const p = InvoiceOutFilterSchema.parse({
      agentGroupId: id,
      agentAccountId: id,
      organizationAccountId: id,
      storeId: id,
      projectId: id,
      contractId: id,
      salesChannelId: id,
      groupId: id,
      ownerId: id,
      customerOrderId: id,
    });
    expect(p.agentGroupId).toBe(id);
    expect(p.agentAccountId).toBe(id);
    expect(p.organizationAccountId).toBe(id);
    expect(p.storeId).toBe(id);
    expect(p.projectId).toBe(id);
    expect(p.contractId).toBe(id);
    expect(p.salesChannelId).toBe(id);
    expect(p.groupId).toBe(id);
    expect(p.ownerId).toBe(id);
    expect(p.customerOrderId).toBe(id);
  });

  it('parses «Владелец контрагента» (agentOwnerId) independently of «Владелец-сотрудник» (ownerId)', () => {
    // agentOwnerId = agent.ownerId (the counterparty's owner employee), a
    // DIFFERENT field from ownerId (the invoice's own owner). Both must survive a
    // parse so buildListWhere can merge agentOwnerId into the `agent` clause
    // while ownerId stays a top-level scalar. Mirrors the invoices-in sibling.
    const agentOwner = '00000000-0000-0000-0000-0000000000aa';
    const invoiceOwner = '00000000-0000-0000-0000-0000000000bb';
    const p = InvoiceOutFilterSchema.parse({ agentOwnerId: agentOwner, ownerId: invoiceOwner });
    expect(p.agentOwnerId).toBe(agentOwner);
    expect(p.ownerId).toBe(invoiceOwner);
  });

  it('rejects a non-uuid FK filter', () => {
    expect(InvoiceOutFilterSchema.safeParse({ projectId: 'not-a-uuid' }).success).toBe(false);
    expect(InvoiceOutFilterSchema.safeParse({ agentOwnerId: 'not-a-uuid' }).success).toBe(false);
  });

  it('accepts the derived «Оплата» paymentStatus values', () => {
    for (const s of ['unpaid', 'partial', 'paid'] as const) {
      expect(InvoiceOutFilterSchema.parse({ paymentStatus: s }).paymentStatus).toBe(s);
    }
  });

  it('rejects an unknown paymentStatus', () => {
    expect(InvoiceOutFilterSchema.safeParse({ paymentStatus: 'overdue' }).success).toBe(false);
  });

  it('coerces boolean flag filters from query strings', () => {
    const p = InvoiceOutFilterSchema.parse({
      applicable: 'true',
      printed: 'false',
      published: 'true',
    });
    expect(p.applicable).toBe(true);
    expect(p.printed).toBe(false);
    expect(p.published).toBe(true);
  });

  it('accepts the «Когда изменен» updated range', () => {
    const p = InvoiceOutFilterSchema.parse({
      updatedFrom: '2026-01-01',
      updatedTo: '2026-02-01',
    });
    expect(p.updatedFrom).toBe('2026-01-01');
    expect(p.updatedTo).toBe('2026-02-01');
  });

  it('extends sortBy with the agent / organization relational keys', () => {
    expect(InvoiceOutFilterSchema.parse({ sortBy: 'agent' }).sortBy).toBe('agent');
    expect(InvoiceOutFilterSchema.parse({ sortBy: 'organization' }).sortBy).toBe('organization');
    expect(InvoiceOutFilterSchema.safeParse({ sortBy: 'store' }).success).toBe(false);
  });
});

describe('UpdateInvoiceOutSchema optimistic-lock version token', () => {
  it('requires version on update (a save without it is rejected, not silently unguarded)', () => {
    expect(UpdateInvoiceOutSchema.safeParse({}).success).toBe(false);
    expect(UpdateInvoiceOutSchema.safeParse({ version: 1 }).success).toBe(true);
  });

  it('rejects a non-integer / negative / string version', () => {
    expect(UpdateInvoiceOutSchema.safeParse({ version: 1.5 }).success).toBe(false);
    expect(UpdateInvoiceOutSchema.safeParse({ version: -1 }).success).toBe(false);
    expect(UpdateInvoiceOutSchema.safeParse({ version: '1' }).success).toBe(false);
  });
});
