import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PosDebtPaymentService } from './pos-debt-payment.service.js';

/**
 * Faza 4 — `M-10` (race) + `DUP-07` (recalc-dublikat) regressiya to'plami.
 *
 * TUZATISHDAN OLDINGI holat (nega bu testlar kerak):
 *   - `loadOpenDebts` va FIFO reja `$transaction`dan TASHQARIDA hisoblanardi →
 *     ikki parallel to'lov BIR XIL eski `paidMinor`ni ko'rib, ikkalasi ham
 *     to'liq allokatsiya qilardi;
 *   - `tx.debt.update({ paidMinor: debt.paidMinor + alloc })` — eski o'qishga
 *     asoslangan ABSOLYUT set → bitta to'lov jimgina yo'qolardi (DebtPayment
 *     qatori bor, `paidMinor`da yo'q);
 *   - `closedAt` hech qachon yozilmasdi, `nextContactAt` tozalanmasdi;
 *   - `deletedAt` filtri yo'q edi → operator o'chirgan qarz FIFO'da turaverardi.
 *
 * DOUBLE Postgres semantikasini HALOL modellaydi:
 *   - `$queryRaw` (`… FOR UPDATE`) — qulf oladi; band bo'lsa KUTADI, qulf
 *     olingandan KEYIN WHERE'ni QAYTA baholaydi (EvalPlanQual: raqib tx qarzni
 *     yopib qo'ygan bo'lsa qator to'plamdan tushib qoladi);
 *   - `findMany`/`aggregate` — qulfsiz o'qish: `await` bilan YIELD qiladi, ya'ni
 *     ikki chaqiruvchi haqiqatan bir-birining orasiga tusha oladi;
 *   - `update`/`create` — birinchi `await`gacha sinxron ishlaydi = qulflangan
 *     qator yozuvi kabi atomik;
 *   - `$transaction` tugaganda tx ushlagan qulflar bo'shaydi.
 *   (Qulf shu yerda kontragent kesimida — real `FOR UPDATE` qator kesimida
 *   qulflaydi; bir xil tartibda (createdAt asc) olingani uchun kuzatilayotgan
 *   xulq bir xil. Hech bir test yo'li «yozib bo'lib keyin throw» qilmaydi,
 *   shuning uchun double rollback modellamaydi.)
 *
 * NON-VACUOUS: tuzatishdan OLDINGI servisda 1-test `paidMinor` 50 000 (100 000
 * o'rniga), 2-test 0 ta rad (1 o'rniga), 3-test `closedAt: null`, 4-test
 * o'chirilgan qarzga allokatsiya beradi — ya'ni har biri yiqiladi.
 */

interface DebtRow {
  id: string;
  accountId: string;
  counterpartyId: string;
  name: string;
  totalMinor: bigint;
  paidMinor: bigint;
  currency: string;
  status: string;
  nextContactAt: Date | null;
  closedAt: Date | null;
  createdAt: Date;
  deletedAt: Date | null;
}

interface PaymentRow {
  debtId: string;
  amountMinor: bigint;
  batchId: string;
  reversedAt: Date | null;
}

const ACC = '11111111-1111-1111-1111-111111111111';
const CP = '22222222-2222-2222-2222-222222222222';

function debt(over: Partial<DebtRow> & { id: string; totalMinor: bigint }): DebtRow {
  return {
    accountId: ACC,
    counterpartyId: CP,
    name: `QRZ-${over.id}`,
    paidMinor: 0n,
    currency: 'UZS',
    status: 'unpaid',
    nextContactAt: new Date('2026-08-20T00:00:00Z'),
    closedAt: null,
    createdAt: new Date('2026-08-01T00:00:00Z'),
    deletedAt: null,
    ...over,
  };
}

function makeDb(rows: DebtRow[]) {
  const debts = rows;
  const payments: PaymentRow[] = [];
  const deltas: Array<{
    deltaMinor: bigint;
    currency: string;
    docType?: string;
    docId?: string;
    notice?: string;
  }> = [];
  /** `$transaction` muvaffaqiyatli tugadimi — «commit'dan keyin» isboti uchun. */
  let committed = false;

  // ── qulf (FOR UPDATE) ────────────────────────────────────────────────────
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

  const openOf = (accountId: string, counterpartyId: string) =>
    debts
      .filter(
        (d) =>
          d.accountId === accountId &&
          d.counterpartyId === counterpartyId &&
          d.deletedAt === null &&
          d.status !== 'paid' &&
          d.status !== 'cancelled',
      )
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

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

  function debtModel(owned: Set<string> | null) {
    return {
      findMany: async (args: { where: Where }) => {
        await Promise.resolve(); // qulfsiz o'qish — yield
        return findDebts(args.where).map((d) => ({ ...d }));
      },
      findFirst: async (args: { where: Where }) => {
        await Promise.resolve();
        return findDebts(args.where)[0] ? { ...findDebts(args.where)[0] } : null;
      },
      findFirstOrThrow: async (args: { where: Where }) => {
        await Promise.resolve();
        const row = findDebts(args.where)[0];
        if (!row) throw new Error('debt not found');
        return { ...row };
      },
      update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        // Atomik: birinchi await'gacha — qulflangan qator yozuvi kabi.
        const row = debts.find((d) => d.id === args.where.id);
        if (!row) throw new Error('debt not found');
        for (const [k, v] of Object.entries(args.data)) {
          if (v === undefined) continue;
          (row as unknown as Record<string, unknown>)[k] = v;
        }
        if (owned === null) {
          // shu double'da tx-siz yozuv yo'q — ataylab ushlab qolamiz
          throw new Error('tx-siz debt.update kutilmagan');
        }
        return { ...row };
      },
    };
  }

  const paymentModel = {
    create: async (args: { data: { debtId: string; amountMinor: bigint; batchId: string } }) => {
      payments.push({
        debtId: args.data.debtId,
        amountMinor: args.data.amountMinor,
        batchId: args.data.batchId,
        reversedAt: null,
      });
      return { id: `pay-${payments.length}` };
    },
    aggregate: async (args: { where: Where }) => {
      await Promise.resolve(); // qulfsiz o'qish — yield
      const sum = payments
        .filter((p) => p.debtId === args.where.debtId && p.reversedAt === null)
        .reduce((acc, p) => acc + p.amountMinor, 0n);
      return { _sum: { amountMinor: sum } };
    },
    findMany: async () => [],
  };

  function makeTx(owned: Set<string>) {
    return {
      $queryRaw: async (s: TemplateStringsArray, ...values: unknown[]) => {
        // P1 — `pay()` endi IKKI qulf oladi. Bu to'plam FIFO/qulf xulqini
        // o'lchaydi va balans qatorini SEED QILMAYDI ⇒ bo'sh natija =
        // «qator yo'q» (o'lchanmagan): adopsiya yo'q, reyestr xulqi o'zgarmaydi.
        if (s.join(' ').includes('counterparty_balances')) return [];
        const [accountId, counterpartyId] = values as [string, string];
        await acquire(`cp:${counterpartyId}`, owned);
        // Qulf olingandan KEYIN qayta baholash (EvalPlanQual).
        return openOf(accountId, counterpartyId).map((d) => ({ id: d.id }));
      },
      // `pay()` yashiqni tx ICHIDA o'qiydi (mavjudlik/tenant + valyuta).
      cashDesk: { findFirst: async () => ({ currency: 'UZS' }) },
      debt: debtModel(owned),
      debtPayment: paymentModel,
    };
  }

  const client = {
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const owned = new Set<string>();
      try {
        const out = await fn(makeTx(owned));
        committed = true;
        return out;
      } finally {
        releaseAll(owned);
      }
    },
    debt: debtModel(null),
    debtPayment: paymentModel,
    counterparty: {
      findFirst: async () => ({ id: CP, name: 'Mijoz', phone: null, description: null }),
    },
    // F9 — `summary()` endi IKKINCHI daftarni ham o'qiydi
    // (`CounterpartyBalance`). Bu to'plam FIFO/qulf xulqini o'lchaydi, ya'ni
    // balans bu yerda ahamiyatsiz: bo'sh ro'yxat = «qator yo'q» ⇒ servis
    // `balanceMinor: null` (o'lchanmagan) qaytaradi va reyestr raqamlari
    // o'zgarmaydi.
    counterpartyBalance: { findMany: async () => [] as Array<never> },
    organization: { findFirst: async () => null },
  };

  const notices: Array<{ currency: string; deltaMinor: bigint; committed: boolean }> = [];
  const balances = {
    applyDelta: vi.fn(
      async (
        _tx: unknown,
        _accountId: string,
        _counterpartyId: string,
        currency: string,
        deltaMinor: bigint,
        meta?: { docType?: string; docId?: string; notice?: string },
      ) => {
        deltas.push({
          deltaMinor,
          currency,
          docType: meta?.docType,
          docId: meta?.docId,
          notice: meta?.notice,
        });
      },
    ),
    // 2026-08-28: FIFO bo'laklari xabar chiqarmaydi (`notice: 'defer'`) —
    // hujjat uchun BITTA yig'ma xabar commit'dan keyin shu yerdan o'tadi.
    emitDocumentNotice: vi.fn(async (p: { currency: string; deltaMinor: bigint }) => {
      // `committed` CHAQIRUV PAYTIDA suratga olinadi: xabar tranzaksiya
      // ichidan chiqsa bu yerda `false` bo'lardi.
      notices.push({ currency: p.currency, deltaMinor: p.deltaMinor, committed });
    }),
  };

  // Faza 11 (`M-05`): kassa daftari. Ilgari bu servis MoneyService'ni import
  // ham qilmasdi — naqd yashiqqa tushar, `CashDesk.balanceMinor` va
  // `/money` lentasi esa qimirlamasdi.
  const cashDeltas: Array<Record<string, unknown>> = [];
  const money = {
    applyDeltas: vi.fn(async (_tx: unknown, _acc: string, ds: Array<Record<string, unknown>>) => {
      cashDeltas.push(...ds);
    }),
  };

  const svc = new PosDebtPaymentService({ client } as never, balances as never, money as never);
  return { svc, debts, payments, deltas, balances, cashDeltas, notices };
}

const paidSum = (payments: PaymentRow[]) =>
  payments.filter((p) => p.reversedAt === null).reduce((a, p) => a + p.amountMinor, 0n);
const deltaSum = (deltas: Array<{ deltaMinor: bigint }>) =>
  deltas.reduce((a, d) => a + d.deltaMinor, 0n);

describe("PosDebtPaymentService.pay — M-10 parallel to'lov", () => {
  it("ikki parallel to'lov: paidMinor = jonli to'lovlar yig'indisi (yo'qolgan to'lov yo'q)", async () => {
    const { svc, debts, payments, deltas } = makeDb([debt({ id: 'd1', totalMinor: 100_000n })]);

    const results = await Promise.allSettled([
      svc.pay(ACC, 'u1', { counterpartyId: CP, amountMinor: '50000' }),
      svc.pay(ACC, 'u2', { counterpartyId: CP, amountMinor: '50000' }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);

    const d1 = debts[0] as DebtRow;
    expect(paidSum(payments)).toBe(100_000n);
    // Denormalizatsiya haqiqatdan ajralmasin — DUP-07 kafolati.
    expect(d1.paidMinor).toBe(100_000n);
    expect(d1.status).toBe('paid');
    // Balans daftari ham bir marta va to'liq harakat qilsin.
    expect(deltaSum(deltas)).toBe(-100_000n);
  });

  it("ortiqcha allokatsiya yo'q: qarzdan katta ikkinchi to'lov rad etiladi", async () => {
    const { svc, debts, payments, deltas } = makeDb([debt({ id: 'd1', totalMinor: 100_000n })]);

    const results = await Promise.allSettled([
      svc.pay(ACC, 'u1', { counterpartyId: CP, amountMinor: '100000' }),
      svc.pay(ACC, 'u2', { counterpartyId: CP, amountMinor: '100000' }),
    ]);

    const rejected = results.filter((r) => r.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(BadRequestException);
    expect(paidSum(payments)).toBe(100_000n);
    expect((debts[0] as DebtRow).paidMinor).toBe(100_000n);
    expect(deltaSum(deltas)).toBe(-100_000n);
  });
});

describe('PosDebtPaymentService.pay — DUP-07 recalc kanonik yo`li', () => {
  it("qarz to'liq yopilganda closedAt yoziladi va nextContactAt tozalanadi", async () => {
    const { svc, debts } = makeDb([debt({ id: 'd1', totalMinor: 40_000n })]);

    await svc.pay(ACC, 'u1', { counterpartyId: CP, amountMinor: '40000' });

    const d1 = debts[0] as DebtRow;
    expect(d1.status).toBe('paid');
    expect(d1.closedAt).toBeInstanceOf(Date);
    expect(d1.nextContactAt).toBeNull();
  });

  it("qisman to'lovda closedAt null qoladi, status 'partial'", async () => {
    const { svc, debts } = makeDb([debt({ id: 'd1', totalMinor: 40_000n })]);

    await svc.pay(ACC, 'u1', { counterpartyId: CP, amountMinor: '15000' });

    const d1 = debts[0] as DebtRow;
    expect(d1.status).toBe('partial');
    expect(d1.closedAt).toBeNull();
    expect(d1.nextContactAt).not.toBeNull();
  });

  it('balans deltasi PKO chek (batchId) havolasi bilan yoziladi', async () => {
    const { svc, deltas } = makeDb([debt({ id: 'd1', totalMinor: 40_000n })]);

    const res = await svc.pay(ACC, 'u1', { counterpartyId: CP, amountMinor: '15000' });

    expect(deltas).toHaveLength(1);
    expect(deltas[0]).toMatchObject({
      deltaMinor: -15_000n,
      currency: 'UZS',
      docType: 'debtpayment',
      docId: res.batchId,
    });
  });

  it("o'chirilgan (soft-delete) qarz FIFO'ga kirmaydi", async () => {
    const { svc, debts, payments } = makeDb([
      // Eskiroq — filtrsiz FIFO aynan shuni birinchi yopardi.
      debt({
        id: 'del',
        totalMinor: 30_000n,
        createdAt: new Date('2026-07-01T00:00:00Z'),
        deletedAt: new Date('2026-07-15T00:00:00Z'),
      }),
      debt({ id: 'live', totalMinor: 20_000n, createdAt: new Date('2026-08-01T00:00:00Z') }),
    ]);

    await svc.pay(ACC, 'u1', { counterpartyId: CP, amountMinor: '20000' });

    expect(payments.map((p) => p.debtId)).toEqual(['live']);
    const del = debts.find((d) => d.id === 'del') as DebtRow;
    expect(del.paidMinor).toBe(0n);
    expect((debts.find((d) => d.id === 'live') as DebtRow).paidMinor).toBe(20_000n);
  });

  it("o'chirilgan qarz qoldig'i ochiq deb ko'rsatilmaydi (ortiqcha to'lov rad etiladi)", async () => {
    const { svc } = makeDb([
      debt({
        id: 'del',
        totalMinor: 30_000n,
        createdAt: new Date('2026-07-01T00:00:00Z'),
        deletedAt: new Date('2026-07-15T00:00:00Z'),
      }),
      debt({ id: 'live', totalMinor: 20_000n, createdAt: new Date('2026-08-01T00:00:00Z') }),
    ]);

    await expect(
      svc.pay(ACC, 'u1', { counterpartyId: CP, amountMinor: '30000' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("naqd to'lov kassa daftariga bir marta yoziladi (M-05)", async () => {
    const { svc, cashDeltas } = makeDb([debt({ id: 'd1', totalMinor: 40_000n })]);

    const res = await svc.pay(ACC, 'u1', {
      counterpartyId: CP,
      amountMinor: '15000',
      method: 'cash',
      cashDeskId: '33333333-3333-3333-3333-333333333333',
    });

    // BITTA jismoniy to'lov = BITTA yashiq harakati, FIFO nechta qarzga
    // bo'lganidan qat'i nazar; havola PKO cheki (batchId) bo'yicha.
    expect(cashDeltas).toHaveLength(1);
    expect(cashDeltas[0]).toMatchObject({
      sourceKind: 'cash_desk',
      sourceId: '33333333-3333-3333-3333-333333333333',
      deltaMinor: 15_000n,
      currency: 'UZS',
      documentKind: 'debtpayment',
      documentId: res.batchId,
      counterpartyId: CP,
    });
  });

  it("bir necha qarzga bo'lingan to'lov ham kassaga BIR marta tushadi", async () => {
    const { svc, cashDeltas } = makeDb([
      debt({ id: 'd1', totalMinor: 10_000n, createdAt: new Date('2026-07-01T00:00:00Z') }),
      debt({ id: 'd2', totalMinor: 10_000n, createdAt: new Date('2026-07-02T00:00:00Z') }),
    ]);

    await svc.pay(ACC, 'u1', {
      counterpartyId: CP,
      amountMinor: '20000',
      method: 'cash',
      cashDeskId: '33333333-3333-3333-3333-333333333333',
    });

    expect(cashDeltas).toHaveLength(1);
    expect(cashDeltas[0]).toMatchObject({ deltaMinor: 20_000n });
  });

  it("terminal to'lovi yashiqqa tushmaydi", async () => {
    const { svc, cashDeltas } = makeDb([debt({ id: 'd1', totalMinor: 40_000n })]);

    await svc.pay(ACC, 'u1', {
      counterpartyId: CP,
      amountMinor: '15000',
      method: 'terminal',
      cashDeskId: '33333333-3333-3333-3333-333333333333',
    });

    expect(cashDeltas).toHaveLength(0);
  });

  it("kassa ko'rsatilmagan naqd to'lov daftarga yozilmaydi", async () => {
    const { svc, cashDeltas } = makeDb([debt({ id: 'd1', totalMinor: 40_000n })]);

    await svc.pay(ACC, 'u1', { counterpartyId: CP, amountMinor: '15000', method: 'cash' });

    expect(cashDeltas).toHaveLength(0);
  });

  it("summary() o'chirilgan qarzni ko'rsatmaydi", async () => {
    const { svc } = makeDb([
      debt({
        id: 'del',
        totalMinor: 30_000n,
        createdAt: new Date('2026-07-01T00:00:00Z'),
        deletedAt: new Date('2026-07-15T00:00:00Z'),
      }),
      debt({ id: 'live', totalMinor: 20_000n }),
    ]);

    const s = await svc.summary(ACC, CP);
    expect(s.openCount).toBe(1);
    expect(s.outstandingMinor).toBe('20000');
    expect(s.debts.map((d) => d.id)).toEqual(['live']);
  });
});

/**
 * 🔴 BITTA TO'LOV = BITTA XABAR (2026-08-28, prodda o'lchangan nuqson).
 *
 * TUZATISHDAN OLDINGI holat. FIFO to'lovni N qarzga bo'lardi, har bo'lak
 * `recalcDebt` → `applyDelta` chaqirardi, `applyDelta` esa HAR SAFAR
 * `COUNTERPARTY_BALANCE_CHANGED` chiqarardi. Natijada:
 *   · mijozga ketadigan xabar BIRINCHI bo'lakning summasini va O'RTADAGI
 *     balansni olardi — 2 616 000 to'lagan mijoz «qabul qilindi: 1 572 000 ·
 *     qolgan qarz: 1 044 000» degan YOLG'ON xabarni ko'rardi (qarzi 0 edi);
 *   · egaga esa bitta to'lov uchun N ta xabar ketardi (`notifyOwner`da dedup
 *     umuman yo'q).
 *
 * Yechim JURNALNI o'zgartirmaydi — har qarz o'z balans qatorini olishi SHART
 * (akt-sverka va hisobotlar shundan yuriladi). Ajratilgan narsa — XABAR:
 * bo'laklar `notice: 'defer'` bilan yoziladi, hujjat esa COMMIT'dan keyin
 * bitta `emitDocumentNotice` bilan e'lon qilinadi.
 *
 * NON-VACUOUS: tuzatishdan oldingi kodda 1-test `notices` ni BO'SH ko'radi
 * (metod umuman chaqirilmasdi), 3-test esa `notice` maydonini `undefined`
 * topadi.
 */
describe("PosDebtPaymentService.pay — bitta to'lov = bitta xabar", () => {
  /** 100k + 200k + 300k = 600k — bitta to'lov uchta qarzga bo'linadi. */
  const threeDebts = () => [
    debt({ id: 'd1', totalMinor: 100_000n, createdAt: new Date('2026-08-01T00:00:00Z') }),
    debt({ id: 'd2', totalMinor: 200_000n, createdAt: new Date('2026-08-02T00:00:00Z') }),
    debt({ id: 'd3', totalMinor: 300_000n, createdAt: new Date('2026-08-03T00:00:00Z') }),
  ];

  it("uch qarzga bo'lingan to'lov: xabar BITTA va TO'LIQ summada", async () => {
    const { svc, deltas, notices } = makeDb(threeDebts());
    await svc.pay(ACC, 'u1', { counterpartyId: CP, amountMinor: '600000' });

    // Jurnal — uch qator (o'zgarmaydi, buxgalteriya shunday bo'lishi kerak).
    expect(deltas).toHaveLength(3);
    expect(deltaSum(deltas)).toBe(-600_000n);

    // Xabar — BITTA, va u bo'lakning emas, HUJJATNING summasi.
    expect(notices).toHaveLength(1);
    expect(notices[0]?.deltaMinor).toBe(-600_000n);
    expect(notices[0]?.currency).toBe('UZS');
  });

  it("har bo'lak `notice: 'defer'` bilan yoziladi — bo'lak xabari YO'Q", async () => {
    const { svc, deltas } = makeDb(threeDebts());
    await svc.pay(ACC, 'u1', { counterpartyId: CP, amountMinor: '600000' });

    expect(deltas).toHaveLength(3);
    for (const d of deltas) expect(d.notice).toBe('defer');
  });

  it("xabar COMMIT'dan KEYIN chiqadi (rollbackda fantom xabar bo'lmasin)", async () => {
    const { svc, notices } = makeDb(threeDebts());
    await svc.pay(ACC, 'u1', { counterpartyId: CP, amountMinor: '600000' });

    expect(notices).toHaveLength(1);
    // Tranzaksiya ichidan chiqsa bu `false` bo'lardi.
    expect(notices[0]?.committed).toBe(true);
  });

  it("bitta qarzga tushgan to'lov ham AYNI yo'ldan o'tadi (shox ikkiga bo'linmaydi)", async () => {
    const { svc, deltas, notices } = makeDb([debt({ id: 'd1', totalMinor: 100_000n })]);
    await svc.pay(ACC, 'u1', { counterpartyId: CP, amountMinor: '100000' });

    expect(deltas).toHaveLength(1);
    expect(deltas[0]?.notice).toBe('defer');
    expect(notices).toHaveLength(1);
    expect(notices[0]?.deltaMinor).toBe(-100_000n);
  });

  it("rad etilgan to'lov xabar CHIQARMAYDI", async () => {
    const { svc, notices } = makeDb([debt({ id: 'd1', totalMinor: 100_000n })]);
    await expect(
      svc.pay(ACC, 'u1', { counterpartyId: CP, amountMinor: '999000' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(notices).toHaveLength(0);
  });

  it("ikki ALOHIDA to'lov — ikki xabar (dedup haqiqiy to'lovni yutmaydi)", async () => {
    const { svc, notices } = makeDb([debt({ id: 'd1', totalMinor: 100_000n })]);
    await svc.pay(ACC, 'u1', { counterpartyId: CP, amountMinor: '40000' });
    await svc.pay(ACC, 'u1', { counterpartyId: CP, amountMinor: '60000' });

    expect(notices.map((n) => n.deltaMinor)).toEqual([-40_000n, -60_000n]);
  });
});
