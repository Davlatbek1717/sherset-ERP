import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PosDebtPaymentService } from './pos-debt-payment.service.js';

/**
 * F6 — POS «Qarz to'lovi» DOLLARDA.
 *
 * Qulflanadigan shartnomalar (buzilsa PUL noto'g'ri hisoblanadi):
 *
 *  1. **O'girish SERVERDA** — klient sent yuboradi, so'm qiymatini server
 *     `usdCentsToSomTiyin` bilan hisoblaydi (`retail-tenders.ts` bilan bitta
 *     formula). Klientning so'm hisobiga ishonilsa, ikki manba bir-biridan
 *     uzoqlashardi va farq qarz qoldig'ida qolardi.
 *  2. **Qarz daftari simmetriyasi** — qarz yaratishda `+total`, to'lovda
 *     `−paid`; to'lov MANFIY delta va u SO'MDA (qarz valyutasida), sentda emas.
 *     (Xotira: «debt daftari simmetriya yopildi».)
 *  3. **Yashiq BITTA valyutali** — daftar harakati faqat to'lov valyutasi
 *     KASSA valyutasiga teng bo'lganda yoziladi va JISMONIY summada (USD →
 *     sent), so'm ekvivalentida emas. Dollar so'm kassasiga tushmaydi: u smena
 *     hisobida (`CashierSession.*CashUsdMinor`) yuriladi. 2026-08-12'gacha bu
 *     yerga `currency: 'USD'` deltasi yozilardi va `MoneyService` uni
 *     «Currency mismatch» bilan rad etib butun to'lovni yiqitardi.
 *  4. **Kurs MUZLATILADI** — `DebtPayment.exchangeRate` ga yoziladi va chek
 *     uni qaytaradi (ertangi kurs bilan qayta baholanmaydi).
 *  5. **Har qator o'z sentini oladi** — storno qatordan-qatorga ishlaydi.
 *
 * NON-VACUOUS: F6'gacha `currency: 'USD'` schema'da kurssiz qabul qilinardi va
 * servis sentni TIYIN deb qarzdan ayirardi — 1-test $100 ni 100 tiyin deb
 * hisoblab yiqilardi.
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
  currency: string;
  exchangeRate: bigint | null;
  amountOriginalMinor: bigint | null;
  method: string;
  batchId: string;
  reversedAt: Date | null;
}

const ACC = '11111111-1111-1111-1111-111111111111';
const CP = '22222222-2222-2222-2222-222222222222';
const DESK = '33333333-3333-3333-3333-333333333333';
/** 12 800,00 so'm × 10^8 — kanonik masshtab (DB-01). */
const RATE_E8 = '1280000000000';

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

interface Where {
  accountId?: string;
  counterpartyId?: string;
  deletedAt?: null;
  id?: string | { in: string[] };
  status?: { notIn?: string[] };
  debtId?: string;
  reversedAt?: null;
  batchId?: string;
}

function makeDb(rows: DebtRow[], deskCurrency = 'UZS') {
  const debts = rows;
  const payments: PaymentRow[] = [];
  const balanceDeltas: Array<{ currency: string; deltaMinor: bigint }> = [];
  const cashDeltas: Array<Record<string, unknown>> = [];

  const openOf = () =>
    debts
      .filter((d) => d.deletedAt === null && d.status !== 'paid' && d.status !== 'cancelled')
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

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

  const debtModel = {
    findMany: async (args: { where: Where }) => findDebts(args.where).map((d) => ({ ...d })),
    findFirst: async (args: { where: Where }) => {
      const r = findDebts(args.where)[0];
      return r ? { ...r } : null;
    },
    findFirstOrThrow: async (args: { where: Where }) => {
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
  };

  const paymentModel = {
    create: async (args: { data: Record<string, unknown> }) => {
      const d = args.data as unknown as PaymentRow;
      payments.push({
        debtId: d.debtId,
        amountMinor: d.amountMinor,
        currency: d.currency,
        exchangeRate: d.exchangeRate ?? null,
        amountOriginalMinor: d.amountOriginalMinor ?? null,
        method: d.method,
        batchId: d.batchId,
        reversedAt: null,
      });
      return { id: `pay-${payments.length}` };
    },
    aggregate: async (args: { where: Where }) => ({
      _sum: {
        amountMinor: payments
          .filter((p) => p.debtId === args.where.debtId && p.reversedAt === null)
          .reduce((acc, p) => acc + p.amountMinor, 0n),
      },
    }),
    findMany: async (args: { where: Where }) =>
      payments
        .filter((p) => args.where.batchId === undefined || p.batchId === args.where.batchId)
        .map((p, i) => ({
          id: `pay-${i + 1}`,
          amountMinor: p.amountMinor,
          method: p.method,
          currency: p.currency,
          exchangeRate: p.exchangeRate,
          amountOriginalMinor: p.amountOriginalMinor,
          createdAt: new Date('2026-08-11T10:00:00Z'),
          reversedAt: p.reversedAt,
          debt: { id: p.debtId, name: `QRZ-${p.debtId}`, counterpartyId: CP },
          receivedBy: { id: 'u1', name: 'Kassir' },
        })),
  };

  const tx = {
    // P1 — `pay()` avval BALANS qatorini qulflaydi. Bu to'plam dollar
    // konvertatsiyasini o'lchaydi va balansni seed qilmaydi ⇒ bo'sh natija =
    // «qator yo'q» (adopsiya yo'q, reyestr qoldig'i yagona chegara).
    $queryRaw: async (s: TemplateStringsArray) =>
      s.join(' ').includes('counterparty_balances') ? [] : openOf().map((d) => ({ id: d.id })),
    // `pay()` yashiqni tx ICHIDA o'qiydi: mavjudligi/tenant tekshiruvi + BITTA
    // valyutali qoldiq qoidasi (`debt-cash-ledger.deskCurrency`).
    cashDesk: { findFirst: async () => ({ currency: deskCurrency }) },
    debt: debtModel,
    debtPayment: paymentModel,
  };

  const client = {
    $transaction: async <T>(fn: (t: unknown) => Promise<T>): Promise<T> => fn(tx),
    debt: debtModel,
    debtPayment: paymentModel,
    cashierSession: { findFirst: async () => ({ id: 'shift-1' }) },
    counterparty: { findFirst: async () => ({ id: CP, name: 'Mijoz', phone: null }) },
    organization: { findFirst: async () => ({ name: 'Org', legalTitle: null }) },
  };

  const balances = {
    applyDelta: vi.fn(
      async (
        _tx: unknown,
        _accountId: string,
        _cp: string,
        currency: string,
        deltaMinor: bigint,
      ) => {
        balanceDeltas.push({ currency, deltaMinor });
      },
    ),
  };
  const money = {
    applyDeltas: vi.fn(async (_t: unknown, _a: string, ds: Array<Record<string, unknown>>) => {
      cashDeltas.push(...ds);
    }),
  };

  const svc = new PosDebtPaymentService({ client } as never, balances as never, money as never);
  return { svc, debts, payments, balanceDeltas, cashDeltas };
}

describe("PosDebtPaymentService.pay — F6 dollar qarz to'lovi", () => {
  it('$100 to`lovi qarzni SO`M ekvivalentiga kamaytiradi (server o`giradi)', async () => {
    // $100 × 12 800 = 1 280 000 so'm = 128 000 000 tiyin.
    const { svc, debts, payments } = makeDb([debt({ id: 'd1', totalMinor: 200_000_000n })]);

    await svc.pay(ACC, 'u1', {
      counterpartyId: CP,
      amountMinor: '10000', // $100.00 SENTDA
      currency: 'USD',
      exchangeRate: RATE_E8,
      method: 'cash',
      cashDeskId: DESK,
    });

    expect((debts[0] as DebtRow).paidMinor).toBe(128_000_000n);
    expect(payments[0]?.amountMinor).toBe(128_000_000n);
  });

  it('qarz daftari simmetriyasi: to`lov MANFIY delta va SO`MDA (sent emas)', async () => {
    const { svc, balanceDeltas } = makeDb([debt({ id: 'd1', totalMinor: 200_000_000n })]);

    await svc.pay(ACC, 'u1', {
      counterpartyId: CP,
      amountMinor: '10000',
      currency: 'USD',
      exchangeRate: RATE_E8,
    });

    expect(balanceDeltas).toEqual([{ currency: 'UZS', deltaMinor: -128_000_000n }]);
  });

  it('🔴 DOLLAR to`lovi SO`M yashiqqa TUSHMAYDI — to`lov esa o`tadi', async () => {
    // Ilgari bu yerda {currency:'USD'} deltasi yozilardi, `MoneyService` esa
    // uni «Currency mismatch: cash-desk UZS vs delta USD» bilan rad etib BUTUN
    // tranzaksiyani orqaga qaytarardi — kassir dollarni umuman qabul qila
    // olmasdi. Qaror `retail-sale.service.ts` bilan bir xil: chet valyutadagi
    // naqd bu daftarga tushmaydi, u smena hisobida yuriladi.
    const { svc, debts, cashDeltas } = makeDb([debt({ id: 'd1', totalMinor: 200_000_000n })]);

    await svc.pay(ACC, 'u1', {
      counterpartyId: CP,
      amountMinor: '10000',
      currency: 'USD',
      exchangeRate: RATE_E8,
      method: 'cash',
      cashDeskId: DESK,
    });

    expect(cashDeltas).toEqual([]);
    // To'lovning O'ZI o'tdi — qarz kamaydi (rollback yo'q).
    expect((debts[0] as DebtRow).paidMinor).toBe(128_000_000n);
  });

  it('DOLLAR yashiq (USD kassa) bo`lsa — tushadi, SENTDA', async () => {
    const { svc, cashDeltas } = makeDb([debt({ id: 'd1', totalMinor: 200_000_000n })], 'USD');

    const res = await svc.pay(ACC, 'u1', {
      counterpartyId: CP,
      amountMinor: '10000',
      currency: 'USD',
      exchangeRate: RATE_E8,
      method: 'cash',
      cashDeskId: DESK,
    });

    expect(cashDeltas).toHaveLength(1);
    expect(cashDeltas[0]).toMatchObject({
      sourceKind: 'cash_desk',
      sourceId: DESK,
      deltaMinor: 10_000n, // SENT
      currency: 'USD',
      documentKind: 'debtpayment',
      documentId: res.batchId,
    });
  });

  it('kurs va asl summa qatorga MUZLATILADI', async () => {
    const { svc, payments } = makeDb([debt({ id: 'd1', totalMinor: 200_000_000n })]);

    await svc.pay(ACC, 'u1', {
      counterpartyId: CP,
      amountMinor: '10000',
      currency: 'USD',
      exchangeRate: RATE_E8,
    });

    expect(payments[0]).toMatchObject({
      currency: 'USD',
      exchangeRate: 1_280_000_000_000n,
      amountOriginalMinor: 10_000n,
    });
  });

  it('bir necha qarzga bo`linsa har qator O`Z sentini oladi (Σ = asl summa)', async () => {
    const { svc, payments } = makeDb([
      debt({ id: 'd1', totalMinor: 64_000_000n, createdAt: new Date('2026-07-01T00:00:00Z') }),
      debt({ id: 'd2', totalMinor: 64_000_000n, createdAt: new Date('2026-07-02T00:00:00Z') }),
    ]);

    await svc.pay(ACC, 'u1', {
      counterpartyId: CP,
      amountMinor: '10000', // $100 = 128 000 000 tiyin = ikki qarzning aynan jami
      currency: 'USD',
      exchangeRate: RATE_E8,
    });

    expect(payments).toHaveLength(2);
    expect(payments.reduce((a, p) => a + (p.amountOriginalMinor ?? 0n), 0n)).toBe(10_000n);
    expect(payments.map((p) => p.amountOriginalMinor)).toEqual([5_000n, 5_000n]);
  });

  it('ortiqcha to`lov SO`M ekvivalenti bo`yicha rad etiladi', async () => {
    // Qarz 100 000 tiyin, mijoz $100 (= 128 000 000 tiyin) beradi.
    const { svc } = makeDb([debt({ id: 'd1', totalMinor: 100_000n })]);

    await expect(
      svc.pay(ACC, 'u1', {
        counterpartyId: CP,
        amountMinor: '10000',
        currency: 'USD',
        exchangeRate: RATE_E8,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('chek dollar ma`lumotini qaytaradi (PKO qatori uchun)', async () => {
    const { svc } = makeDb([debt({ id: 'd1', totalMinor: 200_000_000n })]);

    const res = await svc.pay(ACC, 'u1', {
      counterpartyId: CP,
      amountMinor: '10000',
      currency: 'USD',
      exchangeRate: RATE_E8,
    });

    expect(res.receipt).toMatchObject({
      currency: 'USD',
      paidMinor: '128000000',
      originalMinor: '10000',
      exchangeRate: RATE_E8,
    });

    const again = await svc.receipt(ACC, res.batchId);
    expect(again).toMatchObject({
      currency: 'USD',
      originalMinor: '10000',
      exchangeRate: RATE_E8,
    });
  });

  it("SO'M to'lovi o'zgarmagan (regressiya yo'q): daftar ham, yashiq ham so'mda", async () => {
    const { svc, debts, payments, balanceDeltas, cashDeltas } = makeDb([
      debt({ id: 'd1', totalMinor: 100_000n }),
    ]);

    await svc.pay(ACC, 'u1', {
      counterpartyId: CP,
      amountMinor: '40000',
      method: 'cash',
      cashDeskId: DESK,
    });

    expect((debts[0] as DebtRow).paidMinor).toBe(40_000n);
    expect(payments[0]).toMatchObject({
      currency: 'UZS',
      exchangeRate: null,
      amountOriginalMinor: null,
    });
    expect(balanceDeltas).toEqual([{ currency: 'UZS', deltaMinor: -40_000n }]);
    expect(cashDeltas[0]).toMatchObject({ deltaMinor: 40_000n, currency: 'UZS' });
  });
});
