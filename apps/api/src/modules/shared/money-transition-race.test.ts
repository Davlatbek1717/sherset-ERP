import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { CashInService } from '../cash-in/cash-in.service.js';
import { CashOutService } from '../cash-out/cash-out.service.js';
import { CounterpartyAdjustmentService } from '../counterparty-adjustment/counterparty-adjustment.service.js';
import { InvoiceInService } from '../invoice-in/invoice-in.service.js';
import { InvoiceOutService } from '../invoice-out/invoice-out.service.js';
import { PaymentInService } from '../payment-in/payment-in.service.js';
import { PaymentOutService } from '../payment-out/payment-out.service.js';

/**
 * Faza 1 — M-01 / DUP-01 concurrency regression for the MONEY document family.
 *
 * Before the fix every one of these services read the doc state OUTSIDE its
 * `$transaction` and then flipped it with a blind `update({ where: { id,
 * accountId } })` — no state condition in the WHERE. Two concurrent
 * «Провести» requests therefore BOTH saw `draft`, BOTH ran the balance delta,
 * and the counterparty balance moved 2× with nothing detecting it.
 *
 * These tests drive two genuinely interleaved `transition()` calls against an
 * in-memory Prisma double whose `updateMany` honours the WHERE state filter
 * atomically (its body never yields). With the atomic claim in place exactly
 * one call wins; the loser gets a 409 and the money-moving side effect runs
 * exactly ONCE.
 *
 * Non-vacuous: run against the pre-fix services every `expect(...).toBe(1)`
 * below reports 2.
 */

interface DocRow {
  id: string;
  accountId: string;
  state: string;
  applicable: boolean;
  deletedAt: Date | null;
  agentId: string;
  organizationId: string;
  currency: string;
  sumMinor: bigint;
  payedSumMinor: bigint;
  groupId: string | null;
  cashDeskId: string;
  customerOrderId: string | null;
  purchaseOrderId: string | null;
  paymentPurpose: string | null;
  direction: 'INCREASE' | 'DECREASE';
  postedAt: Date | null;
  name: string;
  version: number;
  rateValue: bigint;
  attributes: Record<string, unknown>;
  contractId: string | null;
  projectId: string | null;
  externalCode: string | null;
  description: string | null;
  moment: Date;
}

function makeRow(overrides: Partial<DocRow> = {}): DocRow {
  return {
    id: 'doc-1',
    accountId: 'acc-1',
    state: 'draft',
    applicable: false,
    deletedAt: null,
    agentId: 'cp-1',
    organizationId: 'org-1',
    currency: 'UZS',
    sumMinor: 1_000_000n,
    payedSumMinor: 0n,
    groupId: null,
    cashDeskId: 'cd-1',
    customerOrderId: null,
    purchaseOrderId: null,
    paymentPurpose: null,
    direction: 'INCREASE',
    postedAt: null,
    name: '00001',
    version: 1,
    rateValue: 100_000_000n,
    attributes: {},
    contractId: null,
    projectId: null,
    externalCode: null,
    description: null,
    moment: new Date('2026-08-08'),
    ...overrides,
  };
}

type WhereState = string | { in?: string[] } | undefined;

/**
 * Prisma double for ONE document row. `updateMany` implements the conditional
 * WHERE (id + accountId + state) the atomic claim relies on, and its body is
 * synchronous — exactly the "row write lock" semantics the real claim gets
 * from Postgres.
 */
function makeClient(modelKey: string, row: DocRow) {
  // Prisma hands back a DETACHED row; returning `row` itself would let one
  // caller's claim retro-actively mutate the other caller's snapshot and hide
  // the race we are testing.
  const snapshot = () => ({ ...row, operations: [] as unknown[], positions: [] as unknown[] });

  const findFirst = vi.fn(async () => snapshot());
  const updateMany = vi.fn(
    async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const w = args.where;
      if (w.id !== undefined && w.id !== row.id) return { count: 0 };
      if (w.accountId !== undefined && w.accountId !== row.accountId) return { count: 0 };
      const st = w.state as WhereState;
      if (st !== undefined) {
        const allowed = typeof st === 'string' ? [st] : (st.in ?? []);
        if (!allowed.includes(row.state)) return { count: 0 };
      }
      Object.assign(row, args.data);
      return { count: 1 };
    },
  );
  const update = vi.fn(async (args: { data: Record<string, unknown> }) => {
    Object.assign(row, args.data);
    return snapshot();
  });

  const delegate = {
    findFirst,
    findUnique: findFirst,
    findMany: vi.fn(async () => []),
    count: vi.fn(async () => 0),
    update,
    updateMany,
  };
  const auditLog = { create: vi.fn(async () => ({ id: 'audit-1' })) };
  const group = { findFirst: vi.fn(async () => null) };

  const client: Record<string, unknown> = {
    [modelKey]: delegate,
    auditLog,
    group,
  };
  client.$transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(client));
  return { client, delegate, auditLog };
}

function makeDeps() {
  const balance = { applyDelta: vi.fn(async () => undefined) };
  const money = { applyDeltas: vi.fn(async () => undefined) };
  const target = {
    applyPayment: vi.fn(async () => undefined),
    applyInvoice: vi.fn(async () => undefined),
  };
  const webhookFire = { fireForEvent: vi.fn() };
  const events = { emit: vi.fn() };
  return { balance, money, target, webhookFire, events };
}

type Deps = ReturnType<typeof makeDeps>;

const CASES: Array<{
  name: string;
  model: string;
  row?: Partial<DocRow>;
  /**
   * Six of the seven services refuse `post` outright unless the snapshot is
   * `draft`. counterparty-adjustment gates on `applicable` instead, so a
   * cancelled (applicable=false) row is still postable there — pre-existing
   * behaviour this phase deliberately does NOT change (it is a state-machine
   * question, not a race). The claim still guarantees only ONE of two racers
   * gets through.
   */
  postFromCancelledAllowed?: true;
  /**
   * Poyga qaysi PUL-YON TA'SIRI bo'yicha o'lchanadi. Sukut — kontragent
   * balansi (`balance.applyDelta`).
   *
   * FAZA 13 (QAROR-B «Supply-only», `PP-03`): `invoice-in` endi balansga
   * TEGMAYDI — uning yagona pul-yon ta'siri `PurchaseOrder.invoicedSumMinor`
   * (`po.applyInvoice`). Test shu ta'sir ustidan o'lchaydi, ya'ni claim-qulfi
   * bu servisda ham NON-VACUOUS bo'lib qoladi (probe'siz u «hech narsa 2 marta
   * bo'lmadi» degan bo'sh da'voga aylanardi).
   */
  moneyProbe?: (d: Deps) => { mock: { calls: unknown[] } };
  build(
    client: Record<string, unknown>,
    d: Deps,
  ): { transition(a: string, u: string, id: string, t: string): Promise<unknown> };
}> = [
  {
    name: 'payment-in',
    model: 'paymentIn',
    build: (client, d) =>
      new PaymentInService(
        { client } as never,
        d.target as never,
        d.target as never,
        d.money as never,
        d.balance as never,
        {} as never,
        d.webhookFire as never,
        d.events as never,
      ),
  },
  {
    name: 'payment-out',
    model: 'paymentOut',
    build: (client, d) =>
      new PaymentOutService(
        { client } as never,
        d.target as never,
        d.target as never,
        d.money as never,
        d.balance as never,
        {} as never,
        d.webhookFire as never,
      ),
  },
  {
    name: 'cash-in',
    model: 'cashIn',
    build: (client, d) =>
      new CashInService(
        { client } as never,
        d.target as never,
        d.money as never,
        d.balance as never,
        {} as never,
        d.webhookFire as never,
      ),
  },
  {
    name: 'cash-out',
    model: 'cashOut',
    build: (client, d) =>
      new CashOutService(
        { client } as never,
        d.target as never,
        d.money as never,
        d.balance as never,
        {} as never,
        d.webhookFire as never,
      ),
  },
  {
    name: 'invoice-out',
    model: 'invoiceOut',
    build: (client, d) =>
      new InvoiceOutService(
        { client } as never,
        d.target as never,
        d.balance as never,
        {} as never,
        d.webhookFire as never,
      ),
  },
  {
    name: 'invoice-in',
    model: 'invoiceIn',
    // Faza 13: pul-yon ta'siri PO kaskadi ⇒ hujjat PO'ga bog'langan bo'lishi kerak.
    row: { purchaseOrderId: 'po-1' },
    moneyProbe: (d) => d.target.applyInvoice,
    build: (client, d) =>
      new InvoiceInService(
        { client } as never,
        d.target as never,
        d.target as never,
        {} as never,
        d.webhookFire as never,
      ),
  },
  {
    name: 'counterparty-adjustment',
    model: 'counterpartyAdjustment',
    postFromCancelledAllowed: true,
    build: (client, d) =>
      new CounterpartyAdjustmentService({ client } as never, d.balance as never),
  },
];

/** Run the same transition twice, truly concurrently. */
async function race(
  svc: { transition(a: string, u: string, id: string, t: string): Promise<unknown> },
  target: string,
) {
  return Promise.allSettled([
    svc.transition('acc-1', 'emp-1', 'doc-1', target),
    svc.transition('acc-1', 'emp-1', 'doc-1', target),
  ]);
}

const rejected = (rs: PromiseSettledResult<unknown>[]) =>
  rs.filter((r): r is PromiseRejectedResult => r.status === 'rejected');

/** Poyga o'lchanadigan pul-yon ta'siri (sukut — kontragent balansi). */
const probeOf = (c: (typeof CASES)[number], d: Deps) =>
  c.moneyProbe ? c.moneyProbe(d) : d.balance.applyDelta;

for (const c of CASES) {
  describe(`${c.name}: concurrent transitions apply their money delta exactly once`, () => {
    it('two parallel post() calls → one wins, balance delta applied ONCE', async () => {
      const row = makeRow({ ...c.row, state: 'draft', applicable: false });
      const { client } = makeClient(c.model, row);
      const d = makeDeps();
      const svc = c.build(client, d);

      const results = await race(svc, 'post');

      expect(probeOf(c, d)).toHaveBeenCalledTimes(1);
      expect(row.state).toBe('posted');
      const losers = rejected(results);
      expect(losers).toHaveLength(1);
      expect(losers[0]?.reason).toBeInstanceOf(ConflictException);
    });

    it('two parallel unpost() calls → reversal applied ONCE', async () => {
      const row = makeRow({ ...c.row, state: 'posted', applicable: true, postedAt: new Date() });
      const { client } = makeClient(c.model, row);
      const d = makeDeps();
      const svc = c.build(client, d);

      const results = await race(svc, 'unpost');

      expect(probeOf(c, d)).toHaveBeenCalledTimes(1);
      expect(row.state).toBe('draft');
      expect(rejected(results)).toHaveLength(1);
    });

    it('two parallel cancel() calls on a posted doc → reversal applied ONCE', async () => {
      const row = makeRow({ ...c.row, state: 'posted', applicable: true, postedAt: new Date() });
      const { client } = makeClient(c.model, row);
      const d = makeDeps();
      const svc = c.build(client, d);

      const results = await race(svc, 'cancel');

      expect(probeOf(c, d)).toHaveBeenCalledTimes(1);
      expect(row.state).toBe('cancelled');
      expect(rejected(results)).toHaveLength(1);
    });

    it('two parallel post() calls on a cancelled row still move money at most once', async () => {
      const row = makeRow({ ...c.row, state: 'cancelled', applicable: false });
      const { client } = makeClient(c.model, row);
      const d = makeDeps();
      const svc = c.build(client, d);

      const results = await race(svc, 'post');

      if (c.postFromCancelledAllowed) {
        // state-machine allows it; the claim still lets exactly one through
        expect(probeOf(c, d)).toHaveBeenCalledTimes(1);
        expect(rejected(results)).toHaveLength(1);
      } else {
        expect(probeOf(c, d)).not.toHaveBeenCalled();
        expect(rejected(results)).toHaveLength(2);
        expect(row.state).toBe('cancelled');
      }
    });
  });
}

/**
 * Faza 13 (QAROR-B) — `invoice-in` probe'i `po.applyInvoice` ga ko'chirildi.
 * Shu almashtirish «balansga tegmaslik» da'vosini jimgina yo'qotmasligi uchun
 * uni ALOHIDA qulflaymiz: balans deltasi 0 marta chaqirilishi shart.
 */
describe('invoice-in: Faza 13 dan keyin kontragent balansiga UMUMAN tegmaydi', () => {
  for (const target of ['post', 'unpost', 'cancel'] as const) {
    it(`${target} poygasida balance.applyDelta hech qachon chaqirilmaydi`, async () => {
      const c = CASES.find((x) => x.name === 'invoice-in');
      if (!c) throw new Error('case invoice-in missing');
      const row = makeRow(
        target === 'post'
          ? { ...c.row, state: 'draft', applicable: false }
          : { ...c.row, state: 'posted', applicable: true, postedAt: new Date() },
      );
      const { client } = makeClient(c.model, row);
      const d = makeDeps();
      const svc = c.build(client, d);

      await race(svc, target);

      expect(d.balance.applyDelta).not.toHaveBeenCalled();
    });
  }
});

/**
 * cash-in / cash-out additionally move the CashDesk ledger through
 * MoneyService — the second money-moving side effect that must not double.
 */
describe('cash-in / cash-out: the CashDesk ledger delta is also applied exactly once', () => {
  for (const name of ['cash-in', 'cash-out'] as const) {
    it(`${name} post() race calls money.applyDeltas once`, async () => {
      const c = CASES.find((x) => x.name === name);
      if (!c) throw new Error(`case ${name} missing`);
      const row = makeRow({ state: 'draft', applicable: false });
      const { client } = makeClient(c.model, row);
      const d = makeDeps();
      const svc = c.build(client, d);

      await race(svc, 'post');

      expect(d.money.applyDeltas).toHaveBeenCalledTimes(1);
    });
  }
});
