import { Prisma as PrismaRuntime } from '@moysklad/db';
import { describe, expect, it, vi } from 'vitest';
import { PosDebtPaymentSchema } from './debt.schema.js';
import { PosDebtPaymentService } from './pos-debt-payment.service.js';

/**
 * POS QARZ TO'LOVI — IDEMPOTENTLIK (Faza 3).
 *
 * MUAMMO (real, kassa monoblokida): `POST /debts/pos/pay` tranzaksiyasi COMMIT
 * bo'ladi, javob esa tarmoqda yo'qoladi (Wi-Fi uzildi). Kassir «Failed to
 * fetch» ko'radi va tugmani QAYTA bosadi ⇒ IKKINCHI to'lov to'plami yoziladi:
 * yashiqqa ikkinchi kirim tushadi, smenaning «kutilgan naqd»i ikki barobar
 * oshadi va yopishda SOXTA KAMOMAD chiqadi. Qisman to'lovda hech narsa
 * to'smaydi (to'liq to'lovda faqat «qarz yo'q» xatosi tasodifan qutqaradi).
 *
 * SHARTNOMA (tuzatishdan keyin):
 *   1. `clientRequestId` (uuid, ixtiyoriy) — bitta klient urinishining kaliti.
 *   2. Kalit `pos_debt_payment_requests` ga TRANZAKSIYANING BIRINCHI YOZUVI
 *      sifatida yoziladi (`@@unique([accountId, clientRequestId])`).
 *   3. Takroriy so'rov (kalit allaqachon bor) YANGI pul YOZMAYDI — server
 *      BIRINCHI chekni qaytaradi.
 *   4. Kalit BERILMASA xulq o'zgarmaydi (eski klient buzilmaydi) — himoya ham
 *      yo'q. Buni oxirgi test ATAYLAB o'lchaydi: aks holda «hech narsa ikki
 *      marta yozilmadi» degan da'vo vakuum bo'lardi.
 *
 * ⚠️ FAKE'DA ROLLBACK YO'Q. Haqiqiy Postgres unique-konfliktda butun
 * tranzaksiyani orqaga qaytaradi; bu double esa qaytarmaydi. Shuning uchun
 * «yangi to'lov qatori yozilmadi» degan tasdiq bu yerda ROLLBACKni emas,
 * kalit yozuvi tranzaksiyada BIRINCHI ekanini pinlaydi (agar u oxirida
 * bo'lsa — qatorlar allaqachon yozilgan bo'lardi va test qizil bo'ladi).
 */

const ACC = '11111111-1111-1111-1111-111111111111';
const CP = '22222222-2222-2222-2222-222222222222';
const REQ_A = '33333333-3333-3333-3333-333333333333';
const REQ_B = '44444444-4444-4444-4444-444444444444';
/** Ilgari (birinchi urinishda) yozilgan chek. */
const PRIOR_BATCH = '55555555-5555-5555-5555-555555555555';

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
  id: string;
  accountId: string;
  debtId: string;
  batchId: string;
  amountMinor: bigint;
  method: string;
  currency: string;
  exchangeRate: bigint | null;
  amountOriginalMinor: bigint | null;
  reversedAt: Date | null;
  createdAt: Date;
}

interface RequestRow {
  accountId: string;
  clientRequestId: string;
  batchId: string;
}

/** Postgres `23505` ning Prisma qobig'i — AYNAN servis tutadigan xato turi. */
function uniqueViolation(): Error {
  return new PrismaRuntime.PrismaClientKnownRequestError(
    'Unique constraint failed on the fields: (`account_id`,`client_request_id`)',
    { code: 'P2002', clientVersion: '5.22.0' },
  );
}

interface FakeOpts {
  /** Oldindan yozilgan idempotentlik kalitlari (birinchi urinish COMMIT bo'lgan). */
  seedRequests?: RequestRow[];
  /** Shu kalitlarga tegishli chek qatorlari (`receipt()` ularni o'qiydi). */
  seedPayments?: PaymentRow[];
  /**
   * POYGA modeli: kalit reyestridan BIRINCHI o'qish `null` qaytaradi (tez yo'l
   * eskirgan snapshotni ko'radi), keyingilari haqiqatni. Shu bilan tez yo'l
   * CHETLAB o'tiladi va tranzaksiya ichidagi unique-qulf sinaladi.
   */
  blindFirstRequestRead?: boolean;
}

function makeDb(opts: FakeOpts = {}) {
  const debts: DebtRow[] = [
    {
      id: 'd1',
      accountId: ACC,
      counterpartyId: CP,
      name: 'QRZ-2026-00001',
      totalMinor: 100_000n,
      paidMinor: 0n,
      currency: 'UZS',
      status: 'unpaid',
      nextContactAt: null,
      closedAt: null,
      createdAt: new Date('2026-08-01T00:00:00Z'),
      deletedAt: null,
    },
  ];
  const payments: PaymentRow[] = [...(opts.seedPayments ?? [])];
  const requests: RequestRow[] = [...(opts.seedRequests ?? [])];

  let txCalls = 0;
  let requestReads = 0;

  const open = () =>
    debts.filter((d) => d.deletedAt === null && d.status !== 'paid' && d.status !== 'cancelled');

  const debtModel = {
    findMany: async () => open().map((d) => ({ ...d })),
    findFirstOrThrow: async (args: { where: { id: string } }) => {
      const row = debts.find((d) => d.id === args.where.id);
      if (!row) throw new Error('debt not found');
      return { ...row };
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
  };

  const paymentCreate = async (args: {
    data: {
      accountId: string;
      debtId: string;
      batchId: string;
      amountMinor: bigint;
      method: string;
      currency: string;
      exchangeRate: bigint | null;
      amountOriginalMinor: bigint | null;
    };
  }) => {
    const row: PaymentRow = {
      id: `pay-${payments.length + 1}`,
      accountId: args.data.accountId,
      debtId: args.data.debtId,
      batchId: args.data.batchId,
      amountMinor: args.data.amountMinor,
      method: args.data.method,
      currency: args.data.currency,
      exchangeRate: args.data.exchangeRate,
      amountOriginalMinor: args.data.amountOriginalMinor,
      reversedAt: null,
      createdAt: new Date('2026-08-12T10:00:00Z'),
    };
    payments.push(row);
    return row;
  };

  const paymentAggregate = async (args: { where: { debtId: string } }) => ({
    _sum: {
      amountMinor: payments
        .filter((p) => p.debtId === args.where.debtId && p.reversedAt === null)
        .reduce((a, p) => a + p.amountMinor, 0n),
    },
  });

  /** `receipt()` o'qiydigan shakl — nested `debt` va `receivedBy` bilan. */
  const paymentFindMany = async (args: { where: { accountId: string; batchId: string } }) =>
    payments
      .filter((p) => p.accountId === args.where.accountId && p.batchId === args.where.batchId)
      .map((p) => ({
        ...p,
        debt: { id: p.debtId, name: 'QRZ-2026-00001', counterpartyId: CP },
        receivedBy: { id: 'u1', name: 'Kassir' },
      }));

  const requestFindFirst = vi.fn(
    async (args: { where: { accountId: string; clientRequestId: string } }) => {
      requestReads += 1;
      if (opts.blindFirstRequestRead && requestReads === 1) return null;
      return (
        requests.find(
          (r) =>
            r.accountId === args.where.accountId &&
            r.clientRequestId === args.where.clientRequestId,
        ) ?? null
      );
    },
  );

  /**
   * 🔴 ATAYLAB FAQAT `tx` da. Kalit tranzaksiyadan TASHQARIDA yozilsa
   * (`this.prisma.client…create`) bu double'da metod umuman yo'q ⇒ test
   * qizil bo'ladi: qulf tranzaksiya chegarasi ichida bo'lishi shart.
   */
  const requestCreate = vi.fn(async (args: { data: RequestRow }) => {
    const dup = requests.some(
      (r) => r.accountId === args.data.accountId && r.clientRequestId === args.data.clientRequestId,
    );
    if (dup) throw uniqueViolation();
    requests.push({ ...args.data });
    return { id: 'req-1', ...args.data };
  });

  const tx = {
    // Balans qatori seed qilinmagan ⇒ bo'sh natija = «qator yo'q» (adopsiya yo'q).
    $queryRaw: async (s: TemplateStringsArray) =>
      s.join(' ').includes('counterparty_balances') ? [] : open().map((d) => ({ id: d.id })),
    debt: debtModel,
    debtPayment: { create: paymentCreate, aggregate: paymentAggregate },
    posDebtPaymentRequest: { create: requestCreate },
  };

  const client = {
    $transaction: async <T>(fn: (t: unknown) => Promise<T>) => {
      txCalls += 1;
      return fn(tx);
    },
    debt: debtModel,
    debtPayment: { findMany: paymentFindMany, aggregate: paymentAggregate },
    posDebtPaymentRequest: { findFirst: requestFindFirst },
    counterparty: {
      findFirst: async () => ({ id: CP, name: 'Mijoz', phone: null }),
    },
    organization: {
      findFirst: async () => ({ name: 'Sherset', legalTitle: 'Sherset MChJ' }),
    },
  };

  const balances = { applyDelta: vi.fn(async () => undefined) };
  const money = { applyDeltas: vi.fn(async () => undefined) };

  const svc = new PosDebtPaymentService({ client } as never, balances as never, money as never);

  return {
    svc,
    payments,
    requests,
    requestCreate,
    money,
    txCount: () => txCalls,
  };
}

/** Javobdagi `replayed` bayrog'i — union tipini kengaytirmasdan o'qish. */
function replayedOf(res: unknown): unknown {
  return (res as { replayed?: unknown }).replayed;
}

const payArgs = (over: Record<string, unknown> = {}) => ({
  counterpartyId: CP,
  amountMinor: '50000',
  ...over,
});

const seededPrior = (): FakeOpts => ({
  seedRequests: [{ accountId: ACC, clientRequestId: REQ_A, batchId: PRIOR_BATCH }],
  seedPayments: [
    {
      id: 'pay-prior',
      accountId: ACC,
      debtId: 'd1',
      batchId: PRIOR_BATCH,
      amountMinor: 50_000n,
      method: 'cash',
      currency: 'UZS',
      exchangeRate: null,
      amountOriginalMinor: null,
      reversedAt: null,
      createdAt: new Date('2026-08-12T09:00:00Z'),
    },
  ],
});

describe('POS qarz to`lovi — idempotentlik sxemasi', () => {
  it('sxema `clientRequestId` ni QABUL qiladi (uuid)', () => {
    const parsed = PosDebtPaymentSchema.parse({
      counterpartyId: CP,
      amountMinor: '5000',
      clientRequestId: REQ_A,
    });

    expect(parsed.clientRequestId).toBe(REQ_A);
  });

  it('buzuq `clientRequestId` RAD etiladi (jim tashlanmaydi)', () => {
    expect(() =>
      PosDebtPaymentSchema.parse({
        counterpartyId: CP,
        amountMinor: '5000',
        clientRequestId: 'salom',
      }),
    ).toThrow();
  });

  it('`clientRequestId` berilmasa sxema o`tadi (maydon ixtiyoriy)', () => {
    const parsed = PosDebtPaymentSchema.parse({ counterpartyId: CP, amountMinor: '5000' });

    expect(parsed.clientRequestId).toBeUndefined();
  });
});

describe('POS qarz to`lovi — takroriy so`rov pul YOZMAYDI', () => {
  it('AYNI kalit bilan ikkinchi so`rov ikkinchi to`lovni yozmaydi (chek AYNI)', async () => {
    const { svc, payments } = makeDb();

    const first = await svc.pay(ACC, 'u1', payArgs({ clientRequestId: REQ_A }));
    const second = await svc.pay(ACC, 'u1', payArgs({ clientRequestId: REQ_A }));

    // 🔴 ASOSIY TASDIQ: bitta jismoniy to'lov = bitta qator to'plami.
    expect(payments).toHaveLength(1);
    expect(second.batchId).toBe(first.batchId);
    expect(second.receipt.paidMinor).toBe('50000');
    expect(replayedOf(second)).toBe(true);
    expect(replayedOf(first)).toBe(false);
  });

  it('takroriy so`rov YASHIQ daftariga ikkinchi kirim yozmaydi', async () => {
    const { svc, money } = makeDb();

    await svc.pay(ACC, 'u1', payArgs({ clientRequestId: REQ_A }));
    await svc.pay(ACC, 'u1', payArgs({ clientRequestId: REQ_A }));

    // Smenaning «kutilgan naqd»i ikki barobar oshmasin (soxta kamomad sababi).
    expect(money.applyDeltas).toHaveBeenCalledTimes(1);
  });

  it('BOSHQA kalit — bu boshqa to`lov, o`tadi (qulf hamma narsani to`smaydi)', async () => {
    const { svc, payments } = makeDb();

    await svc.pay(ACC, 'u1', payArgs({ clientRequestId: REQ_A }));
    await svc.pay(ACC, 'u1', payArgs({ clientRequestId: REQ_B }));

    expect(payments).toHaveLength(2);
  });

  it('TEZ YO`L: kalit allaqachon bor ⇒ tranzaksiya UMUMAN ochilmaydi', async () => {
    const { svc, payments, txCount } = makeDb(seededPrior());

    const res = await svc.pay(ACC, 'u1', payArgs({ clientRequestId: REQ_A }));

    // Tez yo'l bo'lmasa tranzaksiya ochilib unique-konfliktga urilardi —
    // natija bir xil, LEKIN har retry qulf/rollback narxini to'lardi.
    expect(txCount()).toBe(0);
    expect(res.batchId).toBe(PRIOR_BATCH);
    expect(replayedOf(res)).toBe(true);
    expect(payments).toHaveLength(1);
  });

  it('POYGA: tez yo`l ko`rmasa unique konflikt (P2002) tutiladi va BIRINCHI chek qaytariladi', async () => {
    const { svc, payments, txCount } = makeDb({
      ...seededPrior(),
      blindFirstRequestRead: true,
    });

    const res = await svc.pay(ACC, 'u1', payArgs({ clientRequestId: REQ_A }));

    // Tranzaksiya OCHILDI (tez yo'l ko'rmadi), lekin pul yozilmadi.
    expect(txCount()).toBe(1);
    expect(res.batchId).toBe(PRIOR_BATCH);
    expect(replayedOf(res)).toBe(true);
    // Kalit yozuvi tranzaksiyada BIRINCHI: undan keyingi hech bir yozuv
    // bajarilmagan (fake'da rollback yo'q — fayl sarlavhasidagi izoh).
    expect(payments).toHaveLength(1);
  });

  it('takrorda javob SHAKLI o`zgarmaydi — kassir ekrani ikki holatni farqlamaydi', async () => {
    const { svc } = makeDb();

    const first = await svc.pay(ACC, 'u1', payArgs({ clientRequestId: REQ_A }));
    const second = await svc.pay(ACC, 'u1', payArgs({ clientRequestId: REQ_A }));

    expect(Object.keys(second).sort()).toEqual(Object.keys(first).sort());
    expect(Object.keys(second.receipt).sort()).toEqual(Object.keys(first.receipt).sort());
  });

  it('KALIT BERILMASA himoya YO`Q — ikki so`rov ikki to`lov yozadi (test vakuum emas)', async () => {
    const { svc, payments, requestCreate } = makeDb();

    await svc.pay(ACC, 'u1', payArgs());
    await svc.pay(ACC, 'u1', payArgs());

    // Bu AYNAN tuzatilgan bug'ning o'zi — eski klient uchun xulq o'zgarmadi.
    expect(payments).toHaveLength(2);
    expect(requestCreate).not.toHaveBeenCalled();
  });
});
