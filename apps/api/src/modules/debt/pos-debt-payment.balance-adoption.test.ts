import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PosDebtPaymentService } from './pos-debt-payment.service.js';

/**
 * P1 — «POS to'lovi BALANS bo'yicha ishlaydi» (2026-08-11).
 *
 * TUZATISHDAN OLDINGI holat (prodda o'lchangan, `ops-debt-audit.ts`):
 * `Debt` = 0 qator · `DebtPayment` = 0 · `CounterpartyBalance`da 15+
 * kontragentda katta qoldiq. `pay()` FAQAT reyestrdan to'lagani uchun har
 * qanday summa «Mijozda ochiq qarz yo'q» bilan RAD etilardi — kassada
 * berilgan qarzni kassada to'lash MUMKIN EMAS edi.
 *
 * Shartnoma (`pos-customer-debt.ts` «ADOPSIYA» bo'limi):
 *   1. to'lanadigan qarz = max(reyestr qoldig'i, balans);
 *   2. reyestrdan ortiq qism uchun `balanceAdopted: true` qatori ochiladi va
 *      o'sha tranzaksiyada to'liq yopiladi;
 *   3. adopsiya qatori balansga `+total` YOZMAYDI (qarz balansda allaqachon
 *      bor) — ya'ni bitta to'lovda balansga FAQAT bitta manfiy delta tushadi;
 *   4. naqd yashiqqa/smenaga mavjud yo'l orqali kiradi (o'zgarmaydi).
 *
 * NON-VACUOUS: adopsiyagacha bo'lgan servisda 1/3/5/6-testlar
 * `BadRequestException('Mijozda ochiq qarz yo`q')` bilan, 7-test
 * `payableMinor === undefined` bilan yiqiladi.
 */

const ACC = '11111111-1111-1111-1111-111111111111';
const CP = '22222222-2222-2222-2222-222222222222';
const USER = '33333333-3333-3333-3333-333333333333';
const SHIFT = '44444444-4444-4444-4444-444444444444';
const DESK = '55555555-5555-5555-5555-555555555555';

interface DebtRow {
  id: string;
  accountId: string;
  counterpartyId: string;
  name: string;
  totalMinor: bigint;
  paidMinor: bigint;
  currency: string;
  status: string;
  balanceAdopted: boolean;
  nextContactAt: Date | null;
  closedAt: Date | null;
  createdAt: Date;
  deletedAt: Date | null;
}

interface PaymentRow {
  debtId: string;
  amountMinor: bigint;
  batchId: string;
  retailShiftId: string | null;
  reversedAt: Date | null;
}

function debt(over: Partial<DebtRow> & { id: string; totalMinor: bigint }): DebtRow {
  return {
    accountId: ACC,
    counterpartyId: CP,
    name: `QRZ-2026-${over.id}`,
    paidMinor: 0n,
    currency: 'UZS',
    status: 'unpaid',
    balanceAdopted: false,
    nextContactAt: new Date('2026-08-20T00:00:00Z'),
    closedAt: null,
    createdAt: new Date('2026-08-01T00:00:00Z'),
    deletedAt: null,
    ...over,
  };
}

/**
 * Postgres semantikasini HALOL modellaydigan double.
 *
 * MUHIM: `FOR UPDATE` qulfi IKKI xil so'rovda — `counterparty_balances` va
 * `debts`. Adopsiya qarori balansdan olingani uchun aynan BALANS qatori
 * qulfi ikki parallel to'lovni ketma-ketlashtiradi (6-test o'sha qulfsiz
 * yiqiladi: reyestr bo'sh bo'lsa `debts` qulfi hech nimani ushlamaydi).
 */
function makeDb(rows: DebtRow[], balances: Record<string, bigint>) {
  const debts = rows;
  const payments: PaymentRow[] = [];
  const notes: Array<{ debtId: string; kind: string }> = [];
  const balanceDeltas: Array<{ deltaMinor: bigint; currency: string; docType?: string }> = [];
  const moneyDeltas: Array<{ deltaMinor: bigint; documentKind: string }> = [];
  const balanceStore = { ...balances };
  let seq = 100;

  const held = new Set<string>();
  const waiters = new Map<string, Array<() => void>>();
  async function acquire(key: string, owned: Set<string>) {
    if (owned.has(key)) return;
    while (held.has(key)) {
      await new Promise<void>((resolve) => {
        const q = waiters.get(key) ?? [];
        q.push(resolve);
        waiters.set(key, q);
      });
    }
    held.add(key);
    owned.add(key);
  }
  function releaseAll(owned: Set<string>) {
    for (const key of owned) {
      held.delete(key);
      waiters.get(key)?.shift()?.();
    }
    owned.clear();
  }

  interface Where {
    accountId?: string;
    counterpartyId?: string;
    deletedAt?: null;
    id?: string | { in: string[] };
    status?: { notIn?: string[] };
    debtId?: string;
    reversedAt?: null;
  }

  const matches = (d: DebtRow, w: Where) =>
    (w.accountId === undefined || d.accountId === w.accountId) &&
    (w.counterpartyId === undefined || d.counterpartyId === w.counterpartyId) &&
    (w.deletedAt === undefined || d.deletedAt === null) &&
    (w.id === undefined || (typeof w.id === 'string' ? d.id === w.id : w.id.in.includes(d.id))) &&
    (w.status?.notIn === undefined || !w.status.notIn.includes(d.status));

  const findDebts = (w: Where) =>
    debts
      .filter((d) => matches(d, w))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const openOf = () =>
    debts
      .filter(
        (d) =>
          d.deletedAt === null &&
          d.counterpartyId === CP &&
          d.status !== 'paid' &&
          d.status !== 'cancelled',
      )
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const debtModel = {
    findMany: async (args: { where: Where }) => {
      await Promise.resolve();
      return findDebts(args.where).map((d) => ({ ...d }));
    },
    findFirst: async (args: { where: Where }) => {
      await Promise.resolve();
      const r = findDebts(args.where)[0];
      return r ? { ...r } : null;
    },
    findFirstOrThrow: async (args: { where: Where }) => {
      await Promise.resolve();
      const r = findDebts(args.where)[0];
      if (!r) throw new Error('debt not found');
      return { ...r };
    },
    update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = debts.find((d) => d.id === args.where.id);
      if (!row) throw new Error('debt not found');
      for (const [k, v] of Object.entries(args.data)) {
        if (v === undefined) continue;
        (row as unknown as Record<string, unknown>)[k] = v;
      }
      return { ...row };
    },
    create: async (args: { data: Record<string, unknown> }) => {
      const d = args.data as unknown as Partial<DebtRow>;
      const row = debt({
        ...d,
        id: `adopted-${debts.length + 1}`,
        totalMinor: d.totalMinor as bigint,
        // Adopsiya qatori HOZIR tug'iladi ⇒ FIFO'da eng OXIRGI turadi.
        createdAt: new Date('2026-08-11T10:00:00Z'),
      });
      debts.push(row);
      return { ...row };
    },
  };

  const paymentModel = {
    create: async (args: { data: Record<string, unknown> }) => {
      const d = args.data as {
        debtId: string;
        amountMinor: bigint;
        batchId: string;
        retailShiftId: string | null;
      };
      payments.push({
        debtId: d.debtId,
        amountMinor: d.amountMinor,
        batchId: d.batchId,
        retailShiftId: d.retailShiftId ?? null,
        reversedAt: null,
      });
      return { id: `pay-${payments.length}` };
    },
    aggregate: async (args: { where: Where }) => {
      await Promise.resolve();
      const sum = payments
        .filter((p) => p.debtId === args.where.debtId && p.reversedAt === null)
        .reduce((acc, p) => acc + p.amountMinor, 0n);
      return { _sum: { amountMinor: sum } };
    },
    findMany: async () => [],
  };

  function makeTx(owned: Set<string>) {
    return {
      $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const sql = strings.join(' ');
        if (sql.includes('counterparty_balances')) {
          const currency = values[2] as string;
          await acquire(`bal:${currency}`, owned);
          const v = balanceStore[currency];
          return v === undefined ? [] : [{ balance_minor: v }];
        }
        await acquire('debts:cp', owned);
        return openOf().map((d) => ({ id: d.id }));
      },
      debt: debtModel,
      debtPayment: paymentModel,
      debtNote: {
        create: async (args: { data: { debtId: string; kind: string } }) => {
          notes.push({ debtId: args.data.debtId, kind: args.data.kind });
          return { id: `note-${notes.length}` };
        },
      },
      documentSequence: {
        findUnique: async () => ({ value: seq }),
        update: async (args: { data: { value: { increment: number } } }) => {
          seq += args.data.value.increment;
          return { value: seq };
        },
        createMany: async () => ({ count: 1 }),
      },
      cashierSession: { findFirst: async () => ({ id: SHIFT }) },
      // `pay()` yashiqni tx ICHIDA o'qiydi (mavjudlik/tenant + valyuta).
      cashDesk: { findFirst: async () => ({ currency: 'UZS' }) },
    };
  }

  const client = {
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const owned = new Set<string>();
      try {
        return await fn(makeTx(owned));
      } finally {
        releaseAll(owned);
      }
    },
    debt: debtModel,
    debtPayment: paymentModel,
    counterparty: {
      findFirst: async () => ({ id: CP, name: 'Madaniyat Shurik', phone: null, description: null }),
    },
    counterpartyBalance: {
      findMany: async () =>
        Object.entries(balanceStore).map(([currency, balanceMinor]) => ({
          currency,
          balanceMinor,
        })),
    },
    cashierSession: { findFirst: async () => ({ id: SHIFT }) },
    organization: { findFirst: async () => null },
  };

  const balanceSvc = {
    applyDelta: vi.fn(
      async (
        _tx: unknown,
        _accountId: string,
        _counterpartyId: string,
        currency: string,
        deltaMinor: bigint,
        meta?: { docType?: string },
      ) => {
        balanceDeltas.push({ deltaMinor, currency, docType: meta?.docType });
        balanceStore[currency] = (balanceStore[currency] ?? 0n) + deltaMinor;
      },
    ),
  };

  const money = {
    applyDeltas: vi.fn(
      async (_tx: unknown, _accountId: string, deltas: Array<Record<string, unknown>>) => {
        for (const d of deltas) {
          moneyDeltas.push({
            deltaMinor: d.deltaMinor as bigint,
            documentKind: d.documentKind as string,
          });
        }
      },
    ),
  };

  const service = new PosDebtPaymentService(
    { client } as never,
    balanceSvc as never,
    money as never,
  );

  return { service, debts, payments, notes, balanceDeltas, moneyDeltas, balanceStore };
}

const payload = (amountMinor: bigint) => ({
  counterpartyId: CP,
  amountMinor: amountMinor.toString(),
  currency: 'UZS',
  method: 'cash',
  cashDeskId: DESK,
  retailShiftId: SHIFT,
});

describe("P1 — balansdagi qarzni POS'da to'lash", () => {
  it("reyestr BO'SH, balansda qarz bor — to'lov QABUL QILINADI", async () => {
    // Prod holati: «Madaniyat Shurik» balansda 4 617 050 so'm, reyestr 0.
    const db = makeDb([], { UZS: 461_705_000n });

    const res = await db.service.pay(ACC, USER, payload(100_000n));

    expect(res.receipt.paidMinor).toBe('100000');
    expect(db.payments).toHaveLength(1);
    expect(db.payments[0]?.retailShiftId).toBe(SHIFT);
  });

  it("adopsiya qatori balansga `+total` YOZMAYDI — bitta to'lov = bitta manfiy delta", async () => {
    // 🔴 Yoriqning yuragi: `Debt.create` odatda balansga `+total` yozadi
    // (`debt.service.ts` simmetriyasi). Adopsiya qatori uchun bu IKKI KARRA
    // sanash bo'lardi — qarz balansda allaqachon bor.
    const db = makeDb([], { UZS: 461_705_000n });

    await db.service.pay(ACC, USER, payload(100_000n));

    expect(db.balanceDeltas).toEqual([
      { deltaMinor: -100_000n, currency: 'UZS', docType: 'debtpayment' },
    ]);
    expect(db.balanceStore.UZS).toBe(461_605_000n);
  });

  it('adopsiya qatori BELGILANADI va shu tranzaksiyada yopiladi', async () => {
    const db = makeDb([], { UZS: 461_705_000n });

    await db.service.pay(ACC, USER, payload(100_000n));

    const adopted = db.debts.find((d) => d.balanceAdopted);
    expect(adopted).toBeDefined();
    expect(adopted?.totalMinor).toBe(100_000n);
    expect(adopted?.paidMinor).toBe(100_000n);
    expect(adopted?.status).toBe('paid');
    expect(adopted?.closedAt).not.toBeNull();
    // Tarixda ko'rinishi uchun izoh yozuvi ham tushadi.
    expect(db.notes.some((n) => n.debtId === adopted?.id)).toBe(true);
  });

  it("naqd YASHIQQA to'liq summada kiradi (smena «kutilgan naqd» zanjiri)", async () => {
    const db = makeDb([], { UZS: 461_705_000n });

    await db.service.pay(ACC, USER, payload(100_000n));

    expect(db.moneyDeltas).toEqual([{ deltaMinor: 100_000n, documentKind: 'debtpayment' }]);
  });

  it('avval REYESTR, qolgani balansdan — aralash holat', async () => {
    const db = makeDb([debt({ id: 'a', totalMinor: 500_000n })], { UZS: 1_000_000n });

    await db.service.pay(ACC, USER, payload(800_000n));

    const registry = db.debts.find((d) => d.id === 'a');
    expect(registry?.paidMinor).toBe(500_000n);
    expect(registry?.status).toBe('paid');
    const adopted = db.debts.find((d) => d.balanceAdopted);
    expect(adopted?.totalMinor).toBe(300_000n);
    // Balansga jami −800 000 (ikki qator, ikki delta) tushdi, +hech nima.
    expect(db.balanceDeltas.reduce((a, d) => a + d.deltaMinor, 0n)).toBe(-800_000n);
  });

  it("balansdan ORTIQ to'lov RAD etiladi va hech nima yozilmaydi", async () => {
    const db = makeDb([], { UZS: 1_000_000n });

    await expect(db.service.pay(ACC, USER, payload(1_200_000n))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(db.payments).toHaveLength(0);
    expect(db.debts).toHaveLength(0);
    expect(db.balanceDeltas).toHaveLength(0);
  });

  it("balans qatori YO'Q va reyestr bo'sh — mavjud xato saqlanadi", async () => {
    const db = makeDb([], {});

    await expect(db.service.pay(ACC, USER, payload(100_000n))).rejects.toThrow(/ochiq qarz/i);
    expect(db.debts).toHaveLength(0);
  });

  it('balans MANFIY (biz qarzdormiz) — qarz sifatida qabul qilinmaydi', async () => {
    const db = makeDb([], { UZS: -183_250_000n });

    await expect(db.service.pay(ACC, USER, payload(100_000n))).rejects.toThrow(/ochiq qarz/i);
    expect(db.debts).toHaveLength(0);
  });

  it("PARALLEL ikki to'lov balansdan ORTIQ yoza olmaydi (balans qulfi)", async () => {
    // 🔴 Qulfsiz: ikkalasi ham 1 000 000 balansni ko'radi va 700 000 dan
    // yozadi ⇒ balans −400 000 ga tushib, mijoz to'lamagan 400 000 «to'langan»
    // bo'lib qolardi. Reyestr bo'sh bo'lgani uchun `debts … FOR UPDATE`
    // hech nimani ushlamaydi — qulf AYNAN balans qatorida bo'lishi shart.
    const db = makeDb([], { UZS: 1_000_000n });

    const results = await Promise.allSettled([
      db.service.pay(ACC, USER, payload(700_000n)),
      db.service.pay(ACC, USER, payload(700_000n)),
    ]);

    const ok = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(db.balanceStore.UZS).toBe(300_000n);
  });
});

describe('P1 — `summary()` to`lanadigan qarzni ochiq aytadi', () => {
  it("reyestr bo'sh bo'lsa ham `payableMinor` balansdan keladi", async () => {
    const db = makeDb([], { UZS: 461_705_000n });

    const s = await db.service.summary(ACC, CP, 'UZS');

    expect(s.payableMinor).toBe('461705000');
    // Mavjud maydonlar o'zgarmaydi — mijoz kartasi ular ustiga qurilgan.
    expect(s.outstandingMinor).toBe('0');
    expect(s.balanceMinor).toBe('461705000');
  });

  it("balans o'lchanmagan bo'lsa `payableMinor` = reyestr qoldig'i", async () => {
    const db = makeDb([debt({ id: 'a', totalMinor: 500_000n })], {});

    const s = await db.service.summary(ACC, CP, 'UZS');

    expect(s.payableMinor).toBe('500000');
    expect(s.balanceMinor).toBeNull();
  });
});
