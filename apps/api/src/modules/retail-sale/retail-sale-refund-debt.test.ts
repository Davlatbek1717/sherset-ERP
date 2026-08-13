import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { mockDocumentSequence } from '../../prisma/document-sequence.mock.js';
import { RetailSaleService } from './retail-sale.service.js';

/**
 * SALES-04 + SALES-05 (Faza 7) — what a POS return actually settles.
 *
 * Two holes, both at the service WIRING level (the pure rules are covered in
 * `retail-refund-validation.test.ts` / `retail-loyalty.test.ts`; pricing them
 * right is worthless if `refund()` never asks):
 *
 *  SALES-04 — a receipt sold on credit refunded CASH: the till paid out money
 *    it never took, and the debt stayed on the customer's balance. Two losses
 *    from one return, and no mechanism existed to give the credit back.
 *
 *  SALES-05 — refunding 1 of 10 items flipped the receipt to 'refunded', so
 *    the other 9 could never be returned; and the bonus earned on all 10 was
 *    clawed back in full.
 */

const ACCOUNT = 'acc-1';
const USER_ID = 'user-1';
const SALE_ID = 'sale-1';
const SESSION_ID = 'sess-1';
const CASHDESK_ID = 'cd-1';
const STORE_ID = 'store-1';
const AGENT_ID = '22222222-2222-4222-8222-222222222222';
const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';

interface OriginalPosition {
  productId: string | null;
  quantity: string;
  priceMinor: bigint;
  discount: string;
  sumMinor: bigint;
}

interface PriorRefund {
  sumMinor: bigint;
  cashAmountMinor: bigint;
  cardAmountMinor: bigint;
  debtReturnMinor: bigint;
  positions: { productId: string; quantity: string }[];
}

function makeHarness(opts: {
  positions: OriginalPosition[];
  /**
   * Original tenders — DEBT rows are the credit the receipt put on the
   * account; CASH_* rows are what the DRAWER took (P5 naqd cap'i).
   * `amountBaseMinor` berilmasa `amountMinor` deb olinadi (so'm qatorlarida
   * ular teng) — dublyor SERVER select'ining shaklini takrorlaydi.
   */
  payments?: { method: string; amountMinor: bigint; amountBaseMinor?: bigint }[];
  priorRefunds?: PriorRefund[];
  agentId?: string | null;
  /** The SOLD_ON_CREDIT audit event of the original sale, if one was written. */
  creditEventAgentId?: string;
  /** The original sale's recorded EARNING bonus op, if any. */
  earnedPoints?: number;
}) {
  const created: { data: Record<string, unknown> }[] = [];
  const sumMinor = opts.positions.reduce((a, p) => a + p.sumMinor, 0n);

  const tx = {
    retailSale: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn().mockImplementation(async (args: { data: Record<string, unknown> }) => {
        created.push(args);
        return { id: 'refund-1', ...args.data };
      }),
    },
    retailSalePosition: { findMany: vi.fn().mockResolvedValue([]) },
    stockOperation: { findMany: vi.fn().mockResolvedValue([]) },
    cashierAuditEvent: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    // refund() endi smenani post() dagi SALES-07 naqshida SHARTLI claim
    // qiladi (`updateMany where state:'open'`) — dublyor shu yuzani beradi.
    cashierSession: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };

  const client = {
    documentSequence: mockDocumentSequence(),
    employee: { findUnique: vi.fn(async () => null) },
    // F6 (2026-08-13) — refund() qaytaruvchi kassirning JORIY ochiq smenasini
    // topadi; bu jihozda u ASL chek smenasining o'zi (bir-smena stsenariysi),
    // shuning uchun qarz/pul assertlari o'zgarmaydi.
    cashierSession: {
      findFirst: vi.fn(async () => ({
        id: SESSION_ID,
        cashDeskId: CASHDESK_ID,
        storeId: STORE_ID,
        cashDesk: { currency: 'UZS' },
      })),
    },
    cashierAuditEvent: {
      findFirst: vi.fn(async () =>
        opts.creditEventAgentId ? { payload: { agentId: opts.creditEventAgentId } } : null,
      ),
    },
    bonusOperation: {
      findFirst: vi.fn(async (args: { where: { transactionType: string } }) =>
        args.where.transactionType === 'EARNING' && opts.earnedPoints
          ? { agentId: AGENT_ID, bonusProgramId: 'prog-1', bonusValue: opts.earnedPoints }
          : null,
      ),
    },
    retailSale: {
      findFirst: vi.fn().mockResolvedValue({
        id: SALE_ID,
        name: 'ТРН-2026-00001',
        state: 'posted',
        version: 3,
        sessionId: SESSION_ID,
        agentId: opts.agentId ?? null,
        sumMinor,
        session: {
          id: SESSION_ID,
          state: 'open',
          cashDeskId: CASHDESK_ID,
          storeId: STORE_ID,
          cashDesk: { currency: 'UZS' },
        },
        payments: (opts.payments ?? []).map((p) => ({
          amountBaseMinor: p.amountMinor,
          ...p,
        })),
        positions: opts.positions.map((p) => ({
          costMinor: null,
          basePriceMinor: null,
          ...p,
        })),
      }),
      // Earlier refunds mirrored from this receipt (cumulative caps).
      findMany: vi.fn().mockResolvedValue(opts.priorRefunds ?? []),
    },
    $transaction: vi
      .fn()
      .mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };

  const money = { applyDeltas: vi.fn().mockResolvedValue(undefined) };
  const balance = { applyDelta: vi.fn().mockResolvedValue(undefined) };
  const loyalty = { computeEarnedPoints: vi.fn(), createOperation: vi.fn() };

  const svc = new RetailSaleService(
    { client } as never,
    { applyDeltas: vi.fn() } as never,
    money as never,
    loyalty as never,
    undefined as never,
    balance as never,
    // F8: CustomerOrderService — zakazsiz chekda chaqirilmaydi.
    { applyPayment: async () => {} } as never,
  );
  return { svc, tx, client, created, money, balance, loyalty };
}

/** 100 000 tiyinlik chek, 10 dona. */
const TEN: OriginalPosition[] = [
  { productId: PRODUCT_ID, quantity: '10', priceMinor: 10_000n, discount: '0', sumMinor: 100_000n },
];

const refundReq = (quantity: string, over: Record<string, string> = {}) => ({
  positions: [{ productId: PRODUCT_ID, quantity }],
  cashAmountMinor: '0',
  cardAmountMinor: '0',
  ...over,
});

describe('refund() — a receipt sold on credit gives the CREDIT back (SALES-04)', () => {
  it('clears the customer debt and pays out NO cash on a 100% credit receipt', async () => {
    const { svc, balance, money, created } = makeHarness({
      positions: TEN,
      payments: [{ method: 'DEBT', amountMinor: 100_000n }],
      agentId: AGENT_ID,
    });

    await svc.refund(ACCOUNT, USER_ID, SALE_ID, refundReq('10'));

    expect(balance.applyDelta).toHaveBeenCalledTimes(1);
    const [, acc, cp, cur, delta] = balance.applyDelta.mock.calls[0];
    expect({ acc, cp, cur, delta }).toEqual({
      acc: ACCOUNT,
      cp: AGENT_ID,
      cur: 'UZS',
      delta: -100_000n,
    });
    // Kassadan bir tiyin ham chiqmaydi — u yerga hech qachon pul kelmagan.
    expect(money.applyDeltas).not.toHaveBeenCalled();
    expect(created[0]?.data.debtReturnMinor).toBe(100_000n);
  });

  it('REJECTS paying cash back for goods bought entirely on credit', async () => {
    const { svc, balance, money } = makeHarness({
      positions: TEN,
      payments: [{ method: 'DEBT', amountMinor: 100_000n }],
      agentId: AGENT_ID,
    });

    await expect(
      svc.refund(ACCOUNT, USER_ID, SALE_ID, refundReq('10', { cashAmountMinor: '100000' })),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(money.applyDeltas).not.toHaveBeenCalled();
    expect(balance.applyDelta).not.toHaveBeenCalled();
  });

  it('splits a mixed receipt: cash back up to what was paid, the rest off the debt', async () => {
    // 100 000: 40 000 naqd + 60 000 qarz.
    const { svc, balance, money, created } = makeHarness({
      positions: TEN,
      payments: [
        { method: 'CASH_UZS', amountMinor: 40_000n },
        { method: 'DEBT', amountMinor: 60_000n },
      ],
      agentId: AGENT_ID,
    });

    await svc.refund(ACCOUNT, USER_ID, SALE_ID, refundReq('10', { cashAmountMinor: '40000' }));

    expect(money.applyDeltas.mock.calls[0]?.[2]).toEqual([
      expect.objectContaining({ deltaMinor: -40_000n }),
    ]);
    expect(balance.applyDelta.mock.calls[0]?.[4]).toBe(-60_000n);
    expect(created[0]?.data.debtReturnMinor).toBe(60_000n);
  });

  it('REJECTS cash above the money share of a mixed receipt', async () => {
    const { svc, money } = makeHarness({
      positions: TEN,
      payments: [
        { method: 'CASH_UZS', amountMinor: 40_000n },
        { method: 'DEBT', amountMinor: 60_000n },
      ],
      agentId: AGENT_ID,
    });

    await expect(
      svc.refund(ACCOUNT, USER_ID, SALE_ID, refundReq('10', { cashAmountMinor: '40001' })),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(money.applyDeltas).not.toHaveBeenCalled();
  });

  it('writes down only the refunded SHARE of the debt on a partial return', async () => {
    const { svc, balance, created } = makeHarness({
      positions: TEN,
      payments: [{ method: 'DEBT', amountMinor: 100_000n }],
      agentId: AGENT_ID,
    });

    await svc.refund(ACCOUNT, USER_ID, SALE_ID, refundReq('3'));

    expect(balance.applyDelta.mock.calls[0]?.[4]).toBe(-30_000n);
    expect(created[0]?.data.debtReturnMinor).toBe(30_000n);
  });

  it('does not touch the debt of an earlier refund a second time (cumulative)', async () => {
    const { svc, balance } = makeHarness({
      positions: TEN,
      payments: [{ method: 'DEBT', amountMinor: 100_000n }],
      agentId: AGENT_ID,
      priorRefunds: [
        {
          sumMinor: 30_000n,
          cashAmountMinor: 0n,
          cardAmountMinor: 0n,
          debtReturnMinor: 30_000n,
          positions: [{ productId: PRODUCT_ID, quantity: '3' }],
        },
      ],
    });

    await svc.refund(ACCOUNT, USER_ID, SALE_ID, refundReq('7'));

    // Qolgan 7 dona = 70 000; jami 100 000 dan oshmaydi.
    expect(balance.applyDelta.mock.calls[0]?.[4]).toBe(-70_000n);
  });

  it('finds the debtor of a LEGACY receipt from its SOLD_ON_CREDIT audit event', async () => {
    // Bu tuzatishdan OLDIN sotilgan qarz cheklarida `agentId` NULL: to'lov
    // oynasidagi mijoz chekka yozilmasdi. Qarz kimga yozilgani faqat audit
    // izida qolgan — aks holda prodda turgan har qarz chekini qaytarib
    // bo'lmasdi.
    const { svc, balance } = makeHarness({
      positions: TEN,
      payments: [{ method: 'DEBT', amountMinor: 100_000n }],
      agentId: null,
      creditEventAgentId: AGENT_ID,
    });

    await svc.refund(ACCOUNT, USER_ID, SALE_ID, refundReq('10'));

    expect(balance.applyDelta.mock.calls[0]?.[2]).toBe(AGENT_ID);
    expect(balance.applyDelta.mock.calls[0]?.[4]).toBe(-100_000n);
  });

  it('lets a legacy receipt still be refunded with an explicit zero debt return', async () => {
    // Audit izi ham yo'q bo'lsa: tovar omborga qaytadi, kassadan pul chiqmaydi
    // (qarz ulushiga naqd cheklovi 0), qarz esa qo'lda tuzatiladi.
    const { svc, balance, money, created } = makeHarness({
      positions: TEN,
      payments: [{ method: 'DEBT', amountMinor: 100_000n }],
      agentId: null,
    });

    await svc.refund(ACCOUNT, USER_ID, SALE_ID, refundReq('10', { debtReturnMinor: '0' }));

    expect(balance.applyDelta).not.toHaveBeenCalled();
    expect(money.applyDeltas).not.toHaveBeenCalled();
    expect(created[0]?.data.debtReturnMinor).toBe(0n);
  });

  it('REJECTS a credit refund when the receipt has no customer to credit', async () => {
    const { svc, balance } = makeHarness({
      positions: TEN,
      payments: [{ method: 'DEBT', amountMinor: 100_000n }],
      agentId: null,
    });

    await expect(svc.refund(ACCOUNT, USER_ID, SALE_ID, refundReq('10'))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(balance.applyDelta).not.toHaveBeenCalled();
  });

  it('a plain cash receipt still refunds in cash and never touches a balance', async () => {
    const { svc, balance, money } = makeHarness({
      positions: TEN,
      payments: [{ method: 'CASH_UZS', amountMinor: 100_000n }],
      agentId: AGENT_ID,
    });

    await svc.refund(ACCOUNT, USER_ID, SALE_ID, refundReq('10', { cashAmountMinor: '100000' }));

    expect(money.applyDeltas.mock.calls[0]?.[2]).toEqual([
      expect.objectContaining({ deltaMinor: -100_000n }),
    ]);
    expect(balance.applyDelta).not.toHaveBeenCalled();
  });
});

describe('refund() — a partial return leaves the receipt open (SALES-05)', () => {
  it('keeps the receipt POSTED when units are still out', async () => {
    const { svc, tx } = makeHarness({
      positions: TEN,
      payments: [{ method: 'CASH_UZS', amountMinor: 100_000n }],
    });

    await svc.refund(ACCOUNT, USER_ID, SALE_ID, refundReq('1', { cashAmountMinor: '10000' }));

    expect(tx.retailSale.updateMany.mock.calls[0][0].data.state).toBeUndefined();
  });

  it('closes the receipt once the last unit comes back', async () => {
    const { svc, tx } = makeHarness({
      positions: TEN,
      payments: [{ method: 'CASH_UZS', amountMinor: 100_000n }],
      priorRefunds: [
        {
          sumMinor: 90_000n,
          cashAmountMinor: 90_000n,
          cardAmountMinor: 0n,
          debtReturnMinor: 0n,
          positions: [{ productId: PRODUCT_ID, quantity: '9' }],
        },
      ],
    });

    await svc.refund(ACCOUNT, USER_ID, SALE_ID, refundReq('1', { cashAmountMinor: '10000' }));

    expect(tx.retailSale.updateMany.mock.calls[0][0].data.state).toBe('refunded');
  });

  it('accepts the remaining 9 after 1 was already returned (the real scenario)', async () => {
    const { svc, created } = makeHarness({
      positions: TEN,
      payments: [{ method: 'CASH_UZS', amountMinor: 100_000n }],
      priorRefunds: [
        {
          sumMinor: 10_000n,
          cashAmountMinor: 10_000n,
          cardAmountMinor: 0n,
          debtReturnMinor: 0n,
          positions: [{ productId: PRODUCT_ID, quantity: '1' }],
        },
      ],
    });

    await svc.refund(ACCOUNT, USER_ID, SALE_ID, refundReq('9', { cashAmountMinor: '90000' }));

    expect(created[0]?.data.sumMinor).toBe(90_000n);
  });

  it('REJECTS the 11th unit across two refunds (cumulative over-refund)', async () => {
    const { svc, money } = makeHarness({
      positions: TEN,
      payments: [{ method: 'CASH_UZS', amountMinor: 100_000n }],
      priorRefunds: [
        {
          sumMinor: 40_000n,
          cashAmountMinor: 40_000n,
          cardAmountMinor: 0n,
          debtReturnMinor: 0n,
          positions: [{ productId: PRODUCT_ID, quantity: '4' }],
        },
      ],
    });

    await expect(
      svc.refund(ACCOUNT, USER_ID, SALE_ID, refundReq('7', { cashAmountMinor: '70000' })),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(money.applyDeltas).not.toHaveBeenCalled();
  });

  it('REJECTS cash already paid back by an earlier refund (cumulative money cap)', async () => {
    const { svc, money } = makeHarness({
      positions: TEN,
      payments: [{ method: 'CASH_UZS', amountMinor: 100_000n }],
      priorRefunds: [
        {
          sumMinor: 40_000n,
          // Bu qaytarishda 40 000 emas, 60 000 chiqib ketgan bo'lsa (buzuq
          // ma'lumot/qo'l bilan tuzatish) — qolganiga cheklov qattiqroq.
          cashAmountMinor: 60_000n,
          cardAmountMinor: 0n,
          debtReturnMinor: 0n,
          positions: [{ productId: PRODUCT_ID, quantity: '4' }],
        },
      ],
    });

    await expect(
      svc.refund(ACCOUNT, USER_ID, SALE_ID, refundReq('6', { cashAmountMinor: '60000' })),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(money.applyDeltas).not.toHaveBeenCalled();
  });

  it('serializes concurrent refunds on the receipt VERSION (stale cumulative read)', async () => {
    // Ikki parallel qaytarish bir xil «oldingi qaytarishlar» ro'yxatini o'qiydi;
    // versiya-qulfi bo'lmasa ikkalasi ham to'liq summani qaytarardi.
    const { svc, tx } = makeHarness({
      positions: TEN,
      payments: [{ method: 'CASH_UZS', amountMinor: 100_000n }],
    });

    await svc.refund(ACCOUNT, USER_ID, SALE_ID, refundReq('1', { cashAmountMinor: '10000' }));

    expect(tx.retailSale.updateMany.mock.calls[0][0].where).toMatchObject({
      id: SALE_ID,
      accountId: ACCOUNT,
      state: 'posted',
      version: 3,
    });
    expect(tx.retailSale.updateMany.mock.calls[0][0].data.version).toEqual({ increment: 1 });
  });
});

describe('refund() — loyalty clawback follows the refunded share (SALES-05)', () => {
  it('claws back only the share of a partial refund', async () => {
    const { svc, loyalty } = makeHarness({
      positions: TEN,
      payments: [{ method: 'CASH_UZS', amountMinor: 100_000n }],
      agentId: AGENT_ID,
      earnedPoints: 1000,
    });

    await svc.refund(ACCOUNT, USER_ID, SALE_ID, refundReq('1', { cashAmountMinor: '10000' }));

    expect(loyalty.createOperation).toHaveBeenCalledTimes(1);
    expect(loyalty.createOperation.mock.calls[0][2]).toMatchObject({ bonusValue: -100 });
  });

  it('claws back the whole recorded value on a full refund', async () => {
    const { svc, loyalty } = makeHarness({
      positions: TEN,
      payments: [{ method: 'CASH_UZS', amountMinor: 100_000n }],
      agentId: AGENT_ID,
      earnedPoints: 1000,
    });

    await svc.refund(ACCOUNT, USER_ID, SALE_ID, refundReq('10', { cashAmountMinor: '100000' }));

    expect(loyalty.createOperation.mock.calls[0][2]).toMatchObject({ bonusValue: -1000 });
  });
});

/**
 * P5 (2026-08-12) — 🔴 KANAL CAP'i, WIRING darajasida.
 *
 * Sof qoida `retail-refund-validation.test.ts` da; bu yerdagi savol boshqa:
 * `refund()` uni HAQIQATAN chaqiradimi va chekning to'lov qatorlaridan
 * naqd ulushini TO'G'RI o'qiydimi.
 *
 * Prod dalili (`ops-p5-live-verify.ts` R1, 2026-08-12): 100% KARTA bilan
 * to'langan ТРН-2026-00033 `cashAmountMinor = 20000` bilan qaytarildi va
 * **201** oldi; kassa qoldig'i 85 357,21 → 85 157,21 so'm. Ya'ni yashiq
 * o'zi hech qachon olmagan 200 so'mni chiqarib yubordi.
 */
describe('refund() — yashiq olmagan pulni qaytara olmaydi (P5)', () => {
  it('🔴 REJECTS naqd qaytarishni 100% KARTA bilan to`langan chekda', async () => {
    const { svc, money } = makeHarness({
      positions: TEN,
      payments: [{ method: 'CARD', amountMinor: 100_000n }],
    });

    await expect(
      svc.refund(ACCOUNT, USER_ID, SALE_ID, refundReq('10', { cashAmountMinor: '100000' })),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(money.applyDeltas).not.toHaveBeenCalled();
  });

  it('🔴 REJECTS naqd qaytarishni TERMINAL chekda', async () => {
    const { svc, money } = makeHarness({
      positions: TEN,
      payments: [{ method: 'TERMINAL', amountMinor: 100_000n }],
    });

    await expect(
      svc.refund(ACCOUNT, USER_ID, SALE_ID, refundReq('10', { cashAmountMinor: '1' })),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(money.applyDeltas).not.toHaveBeenCalled();
  });

  it('o`sha chek KARTA qatori orqali qaytariladi — yashiq qimirlamaydi', async () => {
    const { svc, money, created } = makeHarness({
      positions: TEN,
      payments: [{ method: 'CARD', amountMinor: 100_000n }],
    });

    await svc.refund(ACCOUNT, USER_ID, SALE_ID, refundReq('10', { cardAmountMinor: '100000' }));

    expect(money.applyDeltas).not.toHaveBeenCalled();
    expect(created[0]?.data.cardAmountMinor).toBe(100_000n);
    expect(created[0]?.data.cashAmountMinor).toBe(0n);
  });

  it('ARALASH chekda naqd FAQAT naqd ulushigacha chiqadi', async () => {
    // 100 000: 30 000 naqd + 70 000 karta.
    const { svc, money } = makeHarness({
      positions: TEN,
      payments: [
        { method: 'CASH_UZS', amountMinor: 30_000n },
        { method: 'CARD', amountMinor: 70_000n },
      ],
    });

    await expect(
      svc.refund(ACCOUNT, USER_ID, SALE_ID, refundReq('10', { cashAmountMinor: '30001' })),
    ).rejects.toBeInstanceOf(BadRequestException);

    const ok = makeHarness({
      positions: TEN,
      payments: [
        { method: 'CASH_UZS', amountMinor: 30_000n },
        { method: 'CARD', amountMinor: 70_000n },
      ],
    });
    await ok.svc.refund(
      ACCOUNT,
      USER_ID,
      SALE_ID,
      refundReq('10', { cashAmountMinor: '30000', cardAmountMinor: '70000' }),
    );
    expect(ok.money.applyDeltas.mock.calls[0]?.[2]).toEqual([
      expect.objectContaining({ deltaMinor: -30_000n }),
    ]);
    expect(money.applyDeltas).not.toHaveBeenCalled();
  });

  it('🔴 MK31 — DOLLAR cheki so`mda qaytariladi: `amountBaseMinor` o`qiladi, sent EMAS', async () => {
    // $8.38 ≈ 100 000 tiyin. `amountMinor` (838 sent) naqd cap deb o'qilsa
    // dollar chekni umuman qaytarib bo'lmasdi (cap 8,38 so'm chiqardi).
    const { svc, money } = makeHarness({
      positions: TEN,
      payments: [{ method: 'CASH_USD', amountMinor: 838n, amountBaseMinor: 100_000n }],
    });

    await svc.refund(ACCOUNT, USER_ID, SALE_ID, refundReq('10', { cashAmountMinor: '100000' }));

    expect(money.applyDeltas.mock.calls[0]?.[2]).toEqual([
      expect.objectContaining({ deltaMinor: -100_000n }),
    ]);
  });

  it('QISMAN qaytarishlar zanjirida naqd cap KÜMÜLATIV (bo`lib chiqarib bo`lmaydi)', async () => {
    // 100 000: 30 000 naqd + 70 000 karta. Birinchi qaytarishda 30 000 naqd
    // allaqachon chiqqan ⇒ ikkinchisiga naqd qolmaydi.
    const { svc, money } = makeHarness({
      positions: TEN,
      payments: [
        { method: 'CASH_UZS', amountMinor: 30_000n },
        { method: 'CARD', amountMinor: 70_000n },
      ],
      priorRefunds: [
        {
          sumMinor: 100_000n,
          cashAmountMinor: 30_000n,
          cardAmountMinor: 0n,
          debtReturnMinor: 0n,
          positions: [],
        },
      ],
    });

    await expect(
      svc.refund(ACCOUNT, USER_ID, SALE_ID, refundReq('10', { cashAmountMinor: '1' })),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(money.applyDeltas).not.toHaveBeenCalled();
  });
});
