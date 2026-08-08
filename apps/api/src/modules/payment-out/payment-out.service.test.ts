import { describe, expect, it, vi } from 'vitest';
import { mockDocumentSequence } from '../../prisma/document-sequence.mock.js';
import { PaymentOutService } from './payment-out.service.js';

/**
 * clone() duplicates an outgoing payment into a new draft. PaymentOutOperation
 * is polymorphic — each allocation targets either an InvoiceIn OR a
 * PurchaseOrder (advance) — unlike PaymentIn's single-FK (invoice-out only)
 * operations. A prior clone() copied ONLY invoiceInId, so cloning a
 * purchase-order advance allocation silently produced a target-less row
 * (targetKind='purchaseorder' but purchaseOrderId=null) — the advance
 * allocation was lost and the cloned draft carried a schema-invalid operation.
 * These tests pin that clone() preserves BOTH allocation kinds faithfully,
 * matching create()'s targetKind-aware FK mapping.
 */

type Op = {
  targetKind: 'invoicein' | 'purchaseorder';
  invoiceInId: string | null;
  purchaseOrderId: string | null;
  amountMinor: bigint;
};

function buildClone(operations: Op[]) {
  const source = {
    id: 'src-1',
    accountId: 'acc-1',
    agentId: 'agent-1',
    organizationId: 'org-1',
    contractId: null,
    projectId: null,
    organizationAccountId: null,
    agentAccountId: null,
    externalCode: null,
    paymentPurpose: null,
    description: null,
    currency: 'UZS',
    rateValue: 100_000_000n,
    sumMinor: 300n,
    attributes: {},
    operations,
  };
  const create = vi.fn(async (args: { data: Record<string, unknown> }) => ({
    id: 'cloned-1',
    ...args.data,
  }));
  const prisma = {
    client: {
      paymentOut: {
        // findById uses where {id, accountId, deletedAt}; nextPaymentName uses
        // where {accountId, name:{startsWith}} — branch on the name predicate.
        findFirst: vi.fn(async (args: { where: { name?: unknown } }) =>
          args.where?.name ? null : source,
        ),
        // MASTER-TODO #23: the doc-number seeder reads every existing name to
        // continue the sequence (`findMany({ where: { accountId }, select: {
        // name: true } })`). Without it clone() threw «paymentOut.findMany is
        // not a function» BEFORE copying any allocation, so all three FK-copy
        // assertions failed for a reason unrelated to what they test.
        // Empty tenant → the clone gets the first number.
        findMany: vi.fn(async () => []),
        create,
      },
      auditLog: { create: vi.fn(async () => ({})) },
      documentSequence: mockDocumentSequence(),
      // H4 P1 create-stamp: mock returns no employee → groupId resolves null.
      employee: { findUnique: vi.fn(async () => null) },
    },
  };
  const webhookFire = { fireForEvent: vi.fn() };
  const svc = new PaymentOutService(
    prisma as never,
    {} as never, // invoiceIn — unused by clone()
    {} as never, // po — unused by clone()
    {} as never, // money — unused by clone()
    {} as never, // balance — unused by clone()
    {} as never, // attrs — unused by clone()
    webhookFire as never,
  );
  return { svc, create };
}

function clonedOps(create: ReturnType<typeof vi.fn>): Op[] {
  return (create.mock.calls[0][0].data.operations as { create: Op[] }).create;
}

describe('PaymentOutService.clone — allocation copy preserves both FK kinds', () => {
  it('preserves purchaseOrderId on a purchase-order (advance) allocation', async () => {
    const { svc, create } = buildClone([
      {
        targetKind: 'purchaseorder',
        invoiceInId: null,
        purchaseOrderId: 'po-1',
        amountMinor: 200n,
      },
    ]);

    await svc.clone('acc-1', 'user-1', 'src-1');

    const ops = clonedOps(create);
    expect(ops).toHaveLength(1);
    // Regression guard: purchaseOrderId was dropped (→ null) before the fix.
    expect(ops[0]).toMatchObject({
      targetKind: 'purchaseorder',
      purchaseOrderId: 'po-1',
      invoiceInId: null,
      amountMinor: 200n,
    });
  });

  it('preserves invoiceInId on an invoice-in allocation and nulls the other FK', async () => {
    const { svc, create } = buildClone([
      { targetKind: 'invoicein', invoiceInId: 'inv-1', purchaseOrderId: null, amountMinor: 100n },
    ]);

    await svc.clone('acc-1', 'user-1', 'src-1');

    expect(clonedOps(create)[0]).toMatchObject({
      targetKind: 'invoicein',
      invoiceInId: 'inv-1',
      purchaseOrderId: null,
      amountMinor: 100n,
    });
  });

  it('preserves a mixed allocation set (both kinds in one payment)', async () => {
    const { svc, create } = buildClone([
      { targetKind: 'invoicein', invoiceInId: 'inv-1', purchaseOrderId: null, amountMinor: 100n },
      {
        targetKind: 'purchaseorder',
        invoiceInId: null,
        purchaseOrderId: 'po-1',
        amountMinor: 200n,
      },
    ]);

    await svc.clone('acc-1', 'user-1', 'src-1');

    expect(clonedOps(create).map((o) => [o.targetKind, o.invoiceInId, o.purchaseOrderId])).toEqual([
      ['invoicein', 'inv-1', null],
      ['purchaseorder', null, 'po-1'],
    ]);
  });
});
