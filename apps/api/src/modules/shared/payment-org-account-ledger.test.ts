import { describe, expect, it, vi } from 'vitest';
import { PaymentInService } from '../payment-in/payment-in.service.js';
import { PaymentOutService } from '../payment-out/payment-out.service.js';

/**
 * Faza 11 — `M-06`: PaymentIn/PaymentOut must move the bank account.
 *
 * BEFORE THE FIX both services imported `CounterpartyBalanceService` only —
 * neither ever called `MoneyService`. So posting a bank payment moved the
 * counterparty balance and the invoice `payedSum`, but
 * `OrganizationAccount.balanceMinor` stayed at its seeded value forever and NO
 * `MoneyOperation` row was written. Two visible consequences:
 *   - the bank-account balance shown in the UI was permanently 0;
 *   - `/money` (the consolidated ledger fed by MoneyOperation) never listed a
 *     single bank payment, while its «+ Создать» menu happily offered to
 *     create one (`FE-03`).
 * `money-operation.service.ts` meanwhile documented itself as «the union of
 * CashIn / CashOut / PaymentIn / PaymentOut» — a docstring that promised a
 * feed half of whose sources never wrote to it.
 *
 * These tests drive the real `transition()` entry point against an in-memory
 * Prisma double and assert on the deltas handed to MoneyService.
 *
 * NON-VACUOUS: against the pre-fix services every `expect(deltas)` below sees
 * an empty array (applyDeltas was never called at all).
 */

interface Row {
  id: string;
  accountId: string;
  state: string;
  applicable: boolean;
  deletedAt: Date | null;
  agentId: string;
  organizationId: string;
  organizationAccountId: string | null;
  currency: string;
  sumMinor: bigint;
  paymentPurpose: string | null;
  postedAt: Date | null;
  operations: unknown[];
}

const ACC = 'acc-1';
const ORG_ACCOUNT = 'oa-1';

function makeRow(over: Partial<Row> = {}): Row {
  return {
    id: 'doc-1',
    accountId: ACC,
    state: 'draft',
    applicable: false,
    deletedAt: null,
    agentId: 'cp-1',
    organizationId: 'org-1',
    organizationAccountId: ORG_ACCOUNT,
    currency: 'UZS',
    sumMinor: 1_000_000n,
    paymentPurpose: 'Oplata po schetu',
    postedAt: null,
    operations: [],
    ...over,
  };
}

type WhereState = string | { in?: string[] } | undefined;

function makeHarness(modelKey: 'paymentIn' | 'paymentOut', row: Row) {
  const snapshot = () => ({ ...row });

  const delegate = {
    findFirst: vi.fn(async () => snapshot()),
    findUnique: vi.fn(async () => snapshot()),
    findMany: vi.fn(async () => []),
    update: vi.fn(async (args: { data: Record<string, unknown> }) => {
      Object.assign(row, args.data);
      return snapshot();
    }),
    updateMany: vi.fn(
      async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const st = args.where.state as WhereState;
        if (st !== undefined) {
          const allowed = typeof st === 'string' ? [st] : (st.in ?? []);
          if (!allowed.includes(row.state)) return { count: 0 };
        }
        Object.assign(row, args.data);
        return { count: 1 };
      },
    ),
  };

  const client: Record<string, unknown> = {
    [modelKey]: delegate,
    auditLog: { create: vi.fn(async () => ({ id: 'audit-1' })) },
  };
  client.$transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(client));

  const deltas: Array<Record<string, unknown>> = [];
  const money = {
    applyDeltas: vi.fn(async (_tx: unknown, _acc: string, ds: Array<Record<string, unknown>>) => {
      deltas.push(...ds);
    }),
  };
  const balance = { applyDelta: vi.fn(async () => undefined) };
  const target = { applyPayment: vi.fn(async () => undefined) };
  const webhookFire = { fireForEvent: vi.fn() };
  const events = { emit: vi.fn() };

  const svc =
    modelKey === 'paymentIn'
      ? new PaymentInService(
          { client } as never,
          target as never,
          target as never,
          money as never,
          balance as never,
          {} as never,
          webhookFire as never,
          events as never,
        )
      : new PaymentOutService(
          { client } as never,
          target as never,
          target as never,
          money as never,
          balance as never,
          {} as never,
          webhookFire as never,
        );

  return { svc, deltas, money, row };
}

/** post → unpost → net movement must be exactly zero. */
const net = (deltas: Array<Record<string, unknown>>) =>
  deltas.reduce((acc, d) => acc + (d.deltaMinor as bigint), 0n);

describe('PaymentIn — organization-account ledger (M-06)', () => {
  it('post credits the bank account and writes ONE ledger row', async () => {
    const { svc, deltas } = makeHarness('paymentIn', makeRow());

    await svc.transition(ACC, 'u1', 'doc-1', 'post');

    expect(deltas).toHaveLength(1);
    expect(deltas[0]).toMatchObject({
      sourceKind: 'organization_account',
      sourceId: ORG_ACCOUNT,
      deltaMinor: 1_000_000n,
      currency: 'UZS',
      documentKind: 'payment_in',
      documentId: 'doc-1',
      counterpartyId: 'cp-1',
    });
  });

  it('unpost reverses it (net movement zero)', async () => {
    const { svc, deltas } = makeHarness('paymentIn', makeRow());

    await svc.transition(ACC, 'u1', 'doc-1', 'post');
    await svc.transition(ACC, 'u1', 'doc-1', 'unpost');

    expect(deltas).toHaveLength(2);
    expect(deltas[1]).toMatchObject({ deltaMinor: -1_000_000n, documentKind: 'payment_in' });
    expect(net(deltas)).toBe(0n);
  });

  it('cancel of a POSTED payment reverses it', async () => {
    const { svc, deltas } = makeHarness('paymentIn', makeRow());

    await svc.transition(ACC, 'u1', 'doc-1', 'post');
    await svc.transition(ACC, 'u1', 'doc-1', 'cancel');

    expect(net(deltas)).toBe(0n);
  });

  it('cancel of a DRAFT payment moves nothing (never applied)', async () => {
    const { svc, deltas } = makeHarness('paymentIn', makeRow());

    await svc.transition(ACC, 'u1', 'doc-1', 'cancel');

    expect(deltas).toHaveLength(0);
  });

  it('no bank account on the document ⇒ no ledger row (cash-only tenants)', async () => {
    const { svc, deltas } = makeHarness('paymentIn', makeRow({ organizationAccountId: null }));

    await svc.transition(ACC, 'u1', 'doc-1', 'post');

    expect(deltas).toHaveLength(0);
  });
});

describe('PaymentOut — organization-account ledger (M-06)', () => {
  it('post DEBITS the bank account', async () => {
    const { svc, deltas } = makeHarness('paymentOut', makeRow());

    await svc.transition(ACC, 'u1', 'doc-1', 'post');

    expect(deltas).toHaveLength(1);
    expect(deltas[0]).toMatchObject({
      sourceKind: 'organization_account',
      sourceId: ORG_ACCOUNT,
      deltaMinor: -1_000_000n,
      documentKind: 'payment_out',
      documentId: 'doc-1',
      counterpartyId: 'cp-1',
    });
  });

  it('a bank outflow is NOT blocked by the overdraft guard (no opening balances)', async () => {
    const { svc, deltas } = makeHarness('paymentOut', makeRow());

    await svc.transition(ACC, 'u1', 'doc-1', 'post');

    // OrganizationAccount.balanceMinor has never been materialized in this
    // system, so a stored 0 does NOT mean «no funds». Enforcing the cash-desk
    // overdraft rule here would turn every first bank payment into a false 400.
    expect(deltas[0]).toMatchObject({ allowNegative: true });
  });

  it('unpost reverses it (net movement zero)', async () => {
    const { svc, deltas } = makeHarness('paymentOut', makeRow());

    await svc.transition(ACC, 'u1', 'doc-1', 'post');
    await svc.transition(ACC, 'u1', 'doc-1', 'unpost');

    expect(deltas).toHaveLength(2);
    expect(deltas[1]).toMatchObject({ deltaMinor: 1_000_000n });
    expect(net(deltas)).toBe(0n);
  });

  it('cancel of a POSTED payment reverses it', async () => {
    const { svc, deltas } = makeHarness('paymentOut', makeRow());

    await svc.transition(ACC, 'u1', 'doc-1', 'post');
    await svc.transition(ACC, 'u1', 'doc-1', 'cancel');

    expect(net(deltas)).toBe(0n);
  });

  it('no bank account on the document ⇒ no ledger row', async () => {
    const { svc, deltas } = makeHarness('paymentOut', makeRow({ organizationAccountId: null }));

    await svc.transition(ACC, 'u1', 'doc-1', 'post');

    expect(deltas).toHaveLength(0);
  });
});
