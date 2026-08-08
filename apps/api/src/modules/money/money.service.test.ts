import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { type MoneyDelta, MoneyService } from './money.service.js';

interface MockAccount {
  accountId: string;
  currency: string;
  balanceMinor: bigint;
}
interface MockCashDesk {
  accountId: string;
  currency: string;
  balanceMinor: bigint;
}

/** Prisma applies `{ increment }` to the stored value and returns the row it wrote. */
function applyWrite(row: { balanceMinor: bigint }, write: bigint | { increment: bigint }): bigint {
  row.balanceMinor = typeof write === 'bigint' ? write : row.balanceMinor + write.increment;
  return row.balanceMinor;
}

function makeTx(opts: {
  orgAccount?: MockAccount | null;
  cashDesk?: MockCashDesk | null;
}) {
  const orgUpdates: Array<{ id: string; balance: bigint }> = [];
  const cashUpdates: Array<{ id: string; balance: bigint }> = [];
  const operations: Array<Partial<MoneyDelta>> = [];
  const orgRow = opts.orgAccount ?? null;
  const cashRow = opts.cashDesk ?? null;
  const tx = {
    organizationAccount: {
      findUnique: vi.fn().mockResolvedValue(orgRow),
      update: vi.fn().mockImplementation(
        async (args: {
          where: { id: string };
          data: { balanceMinor: bigint | { increment: bigint } };
        }) => {
          if (!orgRow) throw new Error('update on missing OrganizationAccount');
          const balance = applyWrite(orgRow, args.data.balanceMinor);
          orgUpdates.push({ id: args.where.id, balance });
          return { balanceMinor: balance };
        },
      ),
    },
    cashDesk: {
      findUnique: vi.fn().mockResolvedValue(cashRow),
      update: vi.fn().mockImplementation(
        async (args: {
          where: { id: string };
          data: { balanceMinor: bigint | { increment: bigint } };
        }) => {
          if (!cashRow) throw new Error('update on missing CashDesk');
          const balance = applyWrite(cashRow, args.data.balanceMinor);
          cashUpdates.push({ id: args.where.id, balance });
          return { balanceMinor: balance };
        },
      ),
    },
    moneyOperation: {
      create: vi.fn().mockImplementation(async (args: { data: Record<string, unknown> }) => {
        operations.push(args.data as Partial<MoneyDelta>);
        return {};
      }),
    },
  };
  return { tx, orgUpdates, cashUpdates, operations };
}

function svc() {
  return new MoneyService({} as never);
}

describe('MoneyService.applyDeltas — OrganizationAccount', () => {
  it('applies a positive delta + writes ledger entry', async () => {
    const { tx, orgUpdates, operations } = makeTx({
      orgAccount: { accountId: 'acc-1', currency: 'UZS', balanceMinor: 1_000_000n },
    });
    const s = svc();
    const deltas: MoneyDelta[] = [
      {
        sourceKind: 'organization_account',
        sourceId: 'org-acc-1',
        deltaMinor: 500_000n,
        currency: 'UZS',
        documentKind: 'payment_in',
        documentId: 'doc-1',
      },
    ];
    await s.applyDeltas(tx as never, 'acc-1', deltas);
    expect(orgUpdates).toHaveLength(1);
    expect(orgUpdates[0]!.balance).toBe(1_500_000n);
    expect(operations).toHaveLength(1);
    expect(operations[0]!.deltaMinor).toBe(500_000n);
  });

  it('rejects cross-tenant access', async () => {
    const { tx } = makeTx({
      orgAccount: { accountId: 'other-acc', currency: 'UZS', balanceMinor: 1n },
    });
    const s = svc();
    await expect(
      s.applyDeltas(tx as never, 'my-acc', [
        {
          sourceKind: 'organization_account',
          sourceId: 'org-1',
          deltaMinor: 1n,
          currency: 'UZS',
          documentKind: 'payment_in',
          documentId: 'd',
        },
      ]),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects currency mismatch', async () => {
    const { tx } = makeTx({
      orgAccount: { accountId: 'a', currency: 'UZS', balanceMinor: 1n },
    });
    await expect(
      svc().applyDeltas(tx as never, 'a', [
        {
          sourceKind: 'organization_account',
          sourceId: 'o',
          deltaMinor: 1n,
          currency: 'USD',
          documentKind: 'payment_in',
          documentId: 'd',
        },
      ]),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects overdraft (balance would go negative)', async () => {
    const { tx } = makeTx({
      orgAccount: { accountId: 'a', currency: 'UZS', balanceMinor: 100n },
    });
    await expect(
      svc().applyDeltas(tx as never, 'a', [
        {
          sourceKind: 'organization_account',
          sourceId: 'o',
          deltaMinor: -500n,
          currency: 'UZS',
          documentKind: 'payment_out',
          documentId: 'd',
        },
      ]),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects unknown source', async () => {
    const { tx } = makeTx({ orgAccount: null });
    await expect(
      svc().applyDeltas(tx as never, 'a', [
        {
          sourceKind: 'organization_account',
          sourceId: 'missing',
          deltaMinor: 1n,
          currency: 'UZS',
          documentKind: 'payment_in',
          documentId: 'd',
        },
      ]),
    ).rejects.toThrow(/OrganizationAccount missing not found/);
  });
});

describe('MoneyService.applyDeltas — CashDesk', () => {
  it('applies a negative delta (outflow) and caps above zero', async () => {
    const { tx, cashUpdates, operations } = makeTx({
      cashDesk: { accountId: 'a', currency: 'UZS', balanceMinor: 1000n },
    });
    await svc().applyDeltas(tx as never, 'a', [
      {
        sourceKind: 'cash_desk',
        sourceId: 'cd-1',
        deltaMinor: -250n,
        currency: 'UZS',
        documentKind: 'cash_out',
        documentId: 'd',
      },
    ]);
    expect(cashUpdates[0]!.balance).toBe(750n);
    expect(operations[0]!.deltaMinor).toBe(-250n);
  });

  it('writes cashDeskId (not organizationAccountId) on cash_desk ops', async () => {
    const { tx, operations } = makeTx({
      cashDesk: { accountId: 'a', currency: 'UZS', balanceMinor: 0n },
    });
    await svc().applyDeltas(tx as never, 'a', [
      {
        sourceKind: 'cash_desk',
        sourceId: 'cd-1',
        deltaMinor: 1n,
        currency: 'UZS',
        documentKind: 'cash_in',
        documentId: 'd',
      },
    ]);
    expect(operations[0]!.cashDeskId).toBe('cd-1');
    expect(operations[0]!.organizationAccountId).toBeNull();
  });
});

describe('MoneyService.applyDeltas — ordering', () => {
  it('is a no-op on empty delta list', async () => {
    const { tx } = makeTx({});
    await svc().applyDeltas(tx as never, 'a', []);
    expect(tx.organizationAccount.findUnique).not.toHaveBeenCalled();
    expect(tx.moneyOperation.create).not.toHaveBeenCalled();
  });
});
