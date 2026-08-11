import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PosDebtPaymentService } from './pos-debt-payment.service.js';

/**
 * `retailShiftId` — KLIENTDAN keladi va tuzatishdan oldin TEKSHIRUVSIZ
 * yozilardi: yopiq/begona/mavjud bo'lmagan smena id yuborilsa jim qabul
 * qilinar edi. Oqibati: naqd pul JORIY smenaning «kutilgan naqd» hisobiga
 * (TZ §8.4) tushmaydi → smena yakunida reconciliation buziladi — bu kamomadni
 * yashirishning tayyor yo'li.
 *
 * SHARTNOMA (tuzatishdan keyin): `retailShiftId` berilgan bo'lsa u FAQAT shu
 * akkauntning OCHIQ (`state: 'open'`) smenasi bo'lishi mumkin; aks holda 400
 * va HECH QANDAY yozuv qilinmaydi. Berilmagan bo'lsa xulq o'zgarmaydi
 * (smena tekshiruvi umuman so'ralmaydi — eski chaqiruvchilar buzilmaydi).
 *
 * NON-VACUOUS: tuzatishdan oldin 400 kutgan uch test ham to'lovni yozib
 * yuboradi (fulfilled) — har biri yiqiladi.
 */

const ACC = '11111111-1111-1111-1111-111111111111';
const OTHER_ACC = '99999999-9999-9999-9999-999999999999';
const CP = '22222222-2222-2222-2222-222222222222';
const SHIFT_OPEN = '55555555-5555-5555-5555-555555555555';
const SHIFT_CLOSED = '66666666-6666-6666-6666-666666666666';
const SHIFT_FOREIGN = '77777777-7777-7777-7777-777777777777';
const SHIFT_MISSING = '88888888-8888-8888-8888-888888888888';

interface SessionRow {
  id: string;
  accountId: string;
  state: string;
}

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

/**
 * SERIAL (parallellik yo'q) yengil double — bu fayl faqat smena-validatsiya
 * shartnomasini tekshiradi; qulf/race semantikasi
 * `pos-debt-payment.service.test.ts` da alohida modellangan.
 */
function makeDb(sessions: SessionRow[]) {
  const debts: DebtRow[] = [
    {
      id: 'd1',
      accountId: ACC,
      counterpartyId: CP,
      name: 'QRZ-d1',
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
  const payments: Array<{ debtId: string; amountMinor: bigint; retailShiftId: string | null }> = [];

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

  const paymentModel = {
    create: async (args: {
      data: { debtId: string; amountMinor: bigint; retailShiftId: string | null };
    }) => {
      payments.push({
        debtId: args.data.debtId,
        amountMinor: args.data.amountMinor,
        retailShiftId: args.data.retailShiftId,
      });
      return { id: `pay-${payments.length}` };
    },
    aggregate: async (args: { where: { debtId: string } }) => ({
      _sum: {
        amountMinor: payments
          .filter((p) => p.debtId === args.where.debtId)
          .reduce((a, p) => a + p.amountMinor, 0n),
      },
    }),
  };

  const tx = {
    // P1 — `pay()` avval BALANS qatorini qulflaydi. Bu to'plam smena
    // wiring'ini o'lchaydi va balansni seed qilmaydi ⇒ bo'sh natija =
    // «qator yo'q» (adopsiya yo'q).
    $queryRaw: async (s: TemplateStringsArray) =>
      s.join(' ').includes('counterparty_balances') ? [] : open().map((d) => ({ id: d.id })),
    debt: debtModel,
    debtPayment: paymentModel,
  };

  const sessionFindFirst = vi.fn(
    async (args: { where: { id: string; accountId: string; state: string } }) =>
      sessions.find(
        (s) =>
          s.id === args.where.id &&
          s.accountId === args.where.accountId &&
          s.state === args.where.state,
      ) ?? null,
  );

  const client = {
    cashierSession: { findFirst: sessionFindFirst },
    $transaction: async <T>(fn: (t: unknown) => Promise<T>) => fn(tx),
    debt: debtModel,
    debtPayment: paymentModel,
  };

  const balances = { applyDelta: vi.fn(async () => undefined) };
  const money = { applyDeltas: vi.fn(async () => undefined) };

  const svc = new PosDebtPaymentService({ client } as never, balances as never, money as never);
  return { svc, payments, sessionFindFirst };
}

const SESSIONS: SessionRow[] = [
  { id: SHIFT_OPEN, accountId: ACC, state: 'open' },
  { id: SHIFT_CLOSED, accountId: ACC, state: 'closed' },
  { id: SHIFT_FOREIGN, accountId: OTHER_ACC, state: 'open' },
];

const payWith = (svc: PosDebtPaymentService, retailShiftId: string) =>
  svc.pay(ACC, 'u1', { counterpartyId: CP, amountMinor: '50000', retailShiftId });

describe('PosDebtPaymentService.pay — retailShiftId validatsiyasi', () => {
  it('YOPIQ smena id → 400, to`lov yozilmaydi', async () => {
    const { svc, payments } = makeDb(SESSIONS);

    await expect(payWith(svc, SHIFT_CLOSED)).rejects.toBeInstanceOf(BadRequestException);
    expect(payments).toHaveLength(0);
  });

  it('BEGONA akkaunt smenasi → 400, to`lov yozilmaydi', async () => {
    const { svc, payments } = makeDb(SESSIONS);

    await expect(payWith(svc, SHIFT_FOREIGN)).rejects.toBeInstanceOf(BadRequestException);
    expect(payments).toHaveLength(0);
  });

  it('MAVJUD BO`LMAGAN smena id → 400, to`lov yozilmaydi', async () => {
    const { svc, payments } = makeDb(SESSIONS);

    await expect(payWith(svc, SHIFT_MISSING)).rejects.toBeInstanceOf(BadRequestException);
    expect(payments).toHaveLength(0);
  });

  it('to`g`ri OCHIQ smena → to`lov o`tadi va qatorga yoziladi', async () => {
    const { svc, payments } = makeDb(SESSIONS);

    const res = await payWith(svc, SHIFT_OPEN);

    expect(res.receipt.paidMinor).toBe('50000');
    expect(payments).toHaveLength(1);
    expect(payments[0]?.retailShiftId).toBe(SHIFT_OPEN);
  });

  it('retailShiftId berilmasa smena SO`RALMAYDI (eski chaqiruvchilar buzilmaydi)', async () => {
    const { svc, payments, sessionFindFirst } = makeDb(SESSIONS);

    await svc.pay(ACC, 'u1', { counterpartyId: CP, amountMinor: '50000' });

    expect(sessionFindFirst).not.toHaveBeenCalled();
    expect(payments).toHaveLength(1);
    expect(payments[0]?.retailShiftId).toBeNull();
  });
});
