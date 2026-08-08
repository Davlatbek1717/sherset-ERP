import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { CustomerOrderService } from '../customer-order/customer-order.service.js';
import { InvoiceInService } from '../invoice-in/invoice-in.service.js';
import { InvoiceOutService } from '../invoice-out/invoice-out.service.js';
import { PurchaseOrderService } from '../purchase-order/purchase-order.service.js';

/**
 * Faza 3 — M-09 concurrency regression for the POSITION-document family
 * (`applyPayment` on InvoiceOut / InvoiceIn / CustomerOrder / PurchaseOrder).
 *
 * Before the fix all four read the row with an UNLOCKED `findFirst`, computed
 * `newPayed = row.payedSumMinor ± amount` in JS and wrote it back as an
 * ABSOLUTE value. Under ReadCommitted two concurrent payments both read the
 * same `payedSumMinor`; the second UPDATE blocks on the row lock, then
 * overwrites the first one's value with its own stale-derived total — one
 * payment silently vanishes from the document while the counterparty balance
 * (already an atomic increment) counted both. Two ledgers, one truth.
 *
 * These tests drive two genuinely interleaved `applyPayment` calls against an
 * in-memory Prisma double whose `update` applies `{ increment }` atomically
 * (its body never yields) and returns the row it wrote — the same semantics
 * Postgres gives a single UPDATE statement.
 *
 * Non-vacuous: run against the pre-fix services, `no lost update` reports
 * 400_000 instead of 800_000 and `over-revert` resolves twice instead of
 * rejecting once.
 */

interface DocRow {
  id: string;
  accountId: string;
  name: string;
  state: string;
  deletedAt: Date | null;
  published: boolean;
  sumMinor: bigint;
  payedSumMinor: bigint;
  shippedSumMinor: bigint;
  invoicedSumMinor: bigint;
  receivedSumMinor: bigint;
  /** Null so `applyPayment` never cascades into a sibling service here. */
  customerOrderId: string | null;
  purchaseOrderId: string | null;
}

function makeRow(overrides: Partial<DocRow> = {}): DocRow {
  return {
    id: 'doc-1',
    accountId: 'acc-1',
    name: '00001',
    state: 'posted',
    deletedAt: null,
    published: false,
    sumMinor: 1_000_000n,
    payedSumMinor: 0n,
    shippedSumMinor: 0n,
    invoicedSumMinor: 0n,
    receivedSumMinor: 0n,
    customerOrderId: null,
    purchaseOrderId: null,
    ...overrides,
  };
}

type Write = bigint | string | { increment: bigint };

/**
 * Prisma double for ONE document row.
 *
 * `findFirst` hands back a DETACHED snapshot — returning `row` itself would let
 * one caller's write retro-actively fix the other caller's snapshot and hide
 * the very race under test. `update` mutates without yielding (atomic
 * statement) and returns the post-write row, which is what makes
 * `{ increment }` + read-after correct.
 */
function makeClient(modelKey: string, row: DocRow) {
  const snapshot = () => ({ ...row });

  const findFirst = vi.fn(async () => snapshot());
  const update = vi.fn(async (args: { data: Record<string, Write> }) => {
    for (const [field, write] of Object.entries(args.data)) {
      if (typeof write === 'object' && write !== null && 'increment' in write) {
        (row as unknown as Record<string, bigint>)[field] =
          (row as unknown as Record<string, bigint>)[field] + write.increment;
      } else {
        (row as unknown as Record<string, unknown>)[field] = write;
      }
    }
    return snapshot();
  });

  const client: Record<string, unknown> = {
    [modelKey]: { findFirst, update },
    auditLog: { create: vi.fn(async () => ({ id: 'audit-1' })) },
  };
  return { client, row, update };
}

interface Case {
  name: string;
  model: string;
  row?: Partial<DocRow>;
  /** State the document must reach once `payedSumMinor === sumMinor`. */
  settledState: string;
  /**
   * State after a PARTIAL payment. The two invoices carry a dedicated
   * `partially_paid`; CustomerOrder / PurchaseOrder have no such member in
   * their state enum and deliberately stay put until fully paid.
   */
  partialState: string;
  build(client: Record<string, unknown>): {
    applyPayment(
      tx: unknown,
      accountId: string,
      userId: string,
      id: string,
      amountMinor: bigint,
      direction: 'apply' | 'revert',
    ): Promise<void>;
  };
}

const CASES: Case[] = [
  {
    name: 'invoice-out',
    model: 'invoiceOut',
    settledState: 'paid',
    partialState: 'partially_paid',
    build: (client) =>
      new InvoiceOutService(
        { client } as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      ),
  },
  {
    name: 'invoice-in',
    model: 'invoiceIn',
    settledState: 'paid',
    partialState: 'partially_paid',
    build: (client) =>
      // 5 parametr — Faza 13 da `CounterpartyBalanceService` inject'i olib
      // tashlandi (InvoiceIn balansga tegmaydi, QAROR-B «Supply-only»).
      new InvoiceInService({ client } as never, {} as never, {} as never, {} as never, {} as never),
  },
  {
    name: 'customer-order',
    model: 'customerOrder',
    // fully paid but nothing shipped → `paid` (not `closed`)
    row: { state: 'confirmed' },
    settledState: 'paid',
    partialState: 'confirmed',
    build: (client) =>
      new CustomerOrderService(
        { client } as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      ),
  },
  {
    name: 'purchase-order',
    model: 'purchaseOrder',
    // `closed` needs the full triple — invoiced + received are already complete
    row: { state: 'confirmed', invoicedSumMinor: 1_000_000n, receivedSumMinor: 1_000_000n },
    settledState: 'closed',
    partialState: 'confirmed',
    build: (client) =>
      new PurchaseOrderService({ client } as never, {} as never, {} as never, {} as never),
  },
];

describe.each(CASES)('$name applyPayment — M-09 lost update', (c) => {
  it('two concurrent payments both land (no lost update)', async () => {
    const { client, row } = makeClient(c.model, makeRow(c.row));
    const svc = c.build(client);

    await Promise.all([
      svc.applyPayment(client, 'acc-1', 'user-1', 'doc-1', 400_000n, 'apply'),
      svc.applyPayment(client, 'acc-1', 'user-1', 'doc-1', 400_000n, 'apply'),
    ]);

    expect(row.payedSumMinor).toBe(800_000n);
  });

  it('concurrent over-revert is rejected, not silently swallowed', async () => {
    const { client } = makeClient(c.model, makeRow({ ...c.row, payedSumMinor: 100_000n }));
    const svc = c.build(client);

    const results = await Promise.allSettled([
      svc.applyPayment(client, 'acc-1', 'user-1', 'doc-1', 100_000n, 'revert'),
      svc.applyPayment(client, 'acc-1', 'user-1', 'doc-1', 100_000n, 'revert'),
    ]);

    // Only 100_000 was ever paid: one revert succeeds, the second must be
    // refused on the POST-decrement value rather than both computing 0.
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(BadRequestException);
    // The losing branch throws, so its caller's $transaction rolls the
    // decrement back; the double has no rollback, hence no balance assert here.
  });

  it('sequential payments reaching the total settle the document', async () => {
    const { client, row } = makeClient(c.model, makeRow(c.row));
    const svc = c.build(client);

    await svc.applyPayment(client, 'acc-1', 'user-1', 'doc-1', 500_000n, 'apply');
    expect(row.state).toBe(c.partialState);

    await svc.applyPayment(client, 'acc-1', 'user-1', 'doc-1', 500_000n, 'apply');
    expect(row.payedSumMinor).toBe(1_000_000n);
    expect(row.state).toBe(c.settledState);
  });

  it('a single revert to zero restores the unpaid state', async () => {
    const { client, row } = makeClient(c.model, makeRow(c.row));
    const svc = c.build(client);

    await svc.applyPayment(client, 'acc-1', 'user-1', 'doc-1', 1_000_000n, 'apply');
    expect(row.payedSumMinor).toBe(1_000_000n);
    expect(row.state).toBe(c.settledState);

    await svc.applyPayment(client, 'acc-1', 'user-1', 'doc-1', 1_000_000n, 'revert');
    expect(row.payedSumMinor).toBe(0n);
    expect(row.state).not.toBe(c.settledState);
  });
});

describe('applyPayment — state guard is evaluated on the locked row', () => {
  it('refuses a payment against a cancelled invoice-out', async () => {
    const { client } = makeClient('invoiceOut', makeRow({ state: 'cancelled' }));
    const svc = new InvoiceOutService(
      { client } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      svc.applyPayment(client as never, 'acc-1', 'user-1', 'doc-1', 100_000n, 'apply'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
