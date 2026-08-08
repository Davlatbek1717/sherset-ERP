import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { type MoneyDelta, MoneyService } from './money.service.js';

/**
 * Faza 2 — M-02 concurrency regression for MoneyService.applyDeltas.
 *
 * Before the fix the balance update was read-then-write with an ABSOLUTE set
 * (`findUnique` → `row.balanceMinor + delta` → `update({ balanceMinor })`),
 * while the comment claimed a `SELECT ... FOR UPDATE`. Two concurrent POS
 * sales on one cash desk therefore both read the same stale balance and the
 * second write silently erased the first — CashDesk.balanceMinor drifting away
 * from the MoneyOperation ledger, and the overdraft guard bypassed.
 *
 * The double below models Postgres row semantics honestly:
 *   - `findUnique` YIELDS (unlocked read) and hands back a DETACHED snapshot,
 *     so two callers can genuinely interleave between read and write;
 *   - `update` applies its mutation in a body that never yields — the atomic
 *     row write a real `UPDATE ... SET x = x + d` gets from the row lock — and
 *     returns the POST-update row, like Prisma does.
 *
 * Non-vacuous: run against the pre-fix service, «lost update» reports 1500 (not
 * 2000) and «overdraft» reports 0 rejections (not 1).
 */

interface Row {
  accountId: string;
  currency: string;
  balanceMinor: bigint;
}

type BalanceWrite = bigint | { increment: bigint };

function makeModel(row: Row | null) {
  return {
    findUnique: vi.fn(async () => {
      // Unlocked read: yield so a concurrent caller can read the same snapshot.
      await Promise.resolve();
      return row ? { ...row } : null;
    }),
    update: vi.fn(async (args: { data: { balanceMinor: BalanceWrite } }) => {
      if (!row) throw new Error('update on missing row');
      const w = args.data.balanceMinor;
      // No `await` before the mutation — atomic, like a locked row write.
      row.balanceMinor = typeof w === 'bigint' ? w : row.balanceMinor + w.increment;
      return { ...row };
    }),
  };
}

function makeTx(seed: { cashDesk?: Row; orgAccount?: Row }) {
  const cashDesk = makeModel(seed.cashDesk ?? null);
  const organizationAccount = makeModel(seed.orgAccount ?? null);
  const operations: Array<Record<string, unknown>> = [];
  const tx = {
    cashDesk,
    organizationAccount,
    moneyOperation: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        operations.push(args.data);
        return {};
      }),
    },
  };
  return { tx, operations };
}

function svc() {
  return new MoneyService({} as never);
}

function delta(over: Partial<MoneyDelta> = {}): MoneyDelta {
  return {
    sourceKind: 'cash_desk',
    sourceId: 'cd-1',
    deltaMinor: 500n,
    currency: 'UZS',
    documentKind: 'retailsale',
    documentId: 'doc-1',
    ...over,
  };
}

describe('MoneyService.applyDeltas — M-02 lost update', () => {
  it('two concurrent inflows on one cash desk sum up (no lost update)', async () => {
    const cashDesk: Row = { accountId: 'acc-1', currency: 'UZS', balanceMinor: 1000n };
    const { tx, operations } = makeTx({ cashDesk });
    const s = svc();

    await Promise.all([
      s.applyDeltas(tx as never, 'acc-1', [delta({ documentId: 'sale-a' })]),
      s.applyDeltas(tx as never, 'acc-1', [delta({ documentId: 'sale-b' })]),
    ]);

    expect(cashDesk.balanceMinor).toBe(2000n);
    // Materialized balance must stay equal to the ledger sum.
    const ledgerSum = operations.reduce((acc, o) => acc + (o.deltaMinor as bigint), 0n);
    expect(1000n + ledgerSum).toBe(cashDesk.balanceMinor);
  });

  it('two concurrent outflows on one organization account sum up', async () => {
    const orgAccount: Row = { accountId: 'acc-1', currency: 'UZS', balanceMinor: 10_000n };
    const { tx } = makeTx({ orgAccount });
    const s = svc();
    const out = (documentId: string) =>
      delta({
        sourceKind: 'organization_account',
        sourceId: 'org-1',
        deltaMinor: -2_500n,
        documentKind: 'payment_out',
        documentId,
      });

    await Promise.all([
      s.applyDeltas(tx as never, 'acc-1', [out('po-a')]),
      s.applyDeltas(tx as never, 'acc-1', [out('po-b')]),
    ]);

    expect(orgAccount.balanceMinor).toBe(5_000n);
  });

  it('overdraft guard survives concurrency: second outflow is rejected', async () => {
    const cashDesk: Row = { accountId: 'acc-1', currency: 'UZS', balanceMinor: 100n };
    const { tx, operations } = makeTx({ cashDesk });
    const s = svc();
    const out = (documentId: string) =>
      delta({ deltaMinor: -100n, documentKind: 'cash_out', documentId });

    const results = await Promise.allSettled([
      s.applyDeltas(tx as never, 'acc-1', [out('co-a')]),
      s.applyDeltas(tx as never, 'acc-1', [out('co-b')]),
    ]);

    const rejected = results.filter((r) => r.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(BadRequestException);
    // The loser wrote no ledger entry; its increment is undone by the caller's
    // $transaction rollback (every call site wraps applyDeltas in one).
    expect(operations).toHaveLength(1);
  });
});
