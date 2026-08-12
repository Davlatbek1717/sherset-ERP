import { BadRequestException, ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { mockDocumentSequence } from '../../prisma/document-sequence.mock.js';
import { RetailSaleService } from './retail-sale.service.js';

/**
 * QA 2026-08-10 — refund() ning ikki qo'riqchisi.
 *
 * **A. Vozvrat zanjiri (cheksiz pul generatori).** refund() yaratadigan mirror
 * chek ham `state:'posted'` bilan tug'iladi va unda to'lov qatorlari YO'Q —
 * ya'ni `originalDebtMinor = 0` bo'lib butun summa naqd qaytariladi. Guard
 * bo'lmasa mirror'ning o'zini qayta-qayta refund qilib kassadan cheksiz pul
 * (va omborga cheksiz stok) olish mumkin. Qaytarish faqat ASL chekdan.
 *
 * **B. Smena atomik claim qilinmaydi.** refund() smena holatini tranzaksiyadan
 * TASHQARIDA o'qiydi, tx ichida esa smenani SHARTSIZ `update` qilardi. Ikki
 * o'qish orasida `close()` yugursa, qaytarish YOPILGAN smenaga tushadi: pul
 * yashiqdan chiqadi, `close()` esa uni sanamagan ⇒ smena naqdi to'g'ri
 * chiqmaydi. post() dagi SALES-07 naqshi (retail-sale-post-guards.test.ts)
 * refund uchun ham: `updateMany({where:{id, accountId, state:'open'}})` +
 * count tekshiruvi.
 *
 * Dublyor Postgres semantikasini halol modellaydi: `findFirst` — DETACHED
 * (eskirgan) nusxa (smena doim 'open' ko'rinadi), `updateMany` esa JONLI
 * qator ustida shartni atomik baholaydi.
 */

const ACCOUNT = 'acc-1';
const USER_ID = 'user-1';
const SALE_ID = 'sale-1';
const SESSION_ID = 'sess-1';
const CASHDESK_ID = 'cd-1';
const STORE_ID = 'store-1';
const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';

type Row = Record<string, unknown>;

function makeHarness(
  opts: {
    /** Chek o'zi vozvrat mirror'i bo'lsa — asl chek id'si. */
    refundedFromId?: string | null;
    /** JONLI smena holati (snapshot DOIM 'open' — eskirgan o'qish). */
    liveSessionState?: string;
  } = {},
) {
  const isMirror = Boolean(opts.refundedFromId);
  const sessionRow: Row = {
    id: SESSION_ID,
    accountId: ACCOUNT,
    state: opts.liveSessionState ?? 'open',
  };

  const tx = {
    retailSale: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn(async (args: { data: Row }) => ({ id: 'refund-1', ...args.data })),
    },
    retailSalePosition: { findMany: vi.fn().mockResolvedValue([]) },
    stockOperation: { findMany: vi.fn().mockResolvedValue([]) },
    cashierAuditEvent: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    cashierSession: {
      // Eski (buggy) shartsiz yo'l — fix'dan keyin bu chaqirilmasligi kerak.
      update: vi.fn().mockResolvedValue({}),
      // JONLI qator ustida shartni baholaydi (SALES-07 naqshi).
      updateMany: vi.fn(async (args: { where: Row; data: Row }) => {
        if (args.where.id !== sessionRow.id) return { count: 0 };
        if (args.where.state !== undefined && args.where.state !== sessionRow.state) {
          return { count: 0 };
        }
        Object.assign(sessionRow, args.data);
        return { count: 1 };
      }),
    },
  };

  const client = {
    documentSequence: mockDocumentSequence(),
    employee: { findUnique: vi.fn(async () => null) },
    bonusOperation: { findFirst: vi.fn(async () => null) },
    cashierAuditEvent: { findFirst: vi.fn(async () => null) },
    retailSale: {
      findFirst: vi.fn().mockResolvedValue({
        id: SALE_ID,
        name: isMirror ? 'ТРН-2026-00002' : 'ТРН-2026-00001',
        state: 'posted',
        version: 1,
        sessionId: SESSION_ID,
        agentId: null,
        refundedFromId: opts.refundedFromId ?? null,
        sumMinor: 100_000n,
        session: {
          id: SESSION_ID,
          state: 'open', // DETACHED nusxa — o'qish onida smena ochiq edi.
          cashDeskId: CASHDESK_ID,
          storeId: STORE_ID,
          cashDesk: { currency: 'UZS' },
        },
        // Mirror chekda to'lov qatorlari YO'Q — bug aynan shu yerdan:
        // qarz ulushi 0 deb o'qiladi va butun summa naqdga ochiladi.
        // P5: dublyor SERVER select'ining shaklini takrorlaydi —
        // `amountBaseMinor` naqd cap'i uchun O'QILADI.
        payments: isMirror
          ? []
          : [{ method: 'CASH_UZS', amountMinor: 100_000n, amountBaseMinor: 100_000n }],
        positions: [
          {
            productId: PRODUCT_ID,
            quantity: '1',
            priceMinor: 100_000n,
            discount: '0',
            sumMinor: 100_000n,
            costMinor: null,
            basePriceMinor: null,
          },
        ],
      }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    $transaction: vi
      .fn()
      .mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };

  const money = { applyDeltas: vi.fn().mockResolvedValue(undefined) };
  const svc = new RetailSaleService(
    { client } as never,
    { applyDeltas: vi.fn().mockResolvedValue(undefined) } as never,
    money as never,
    { createOperation: vi.fn() } as never,
    undefined as never,
    { applyDelta: vi.fn().mockResolvedValue(undefined) } as never,
    // F8: CustomerOrderService — zakazsiz chekda chaqirilmaydi.
    { applyPayment: async () => {} } as never,
  );
  return { svc, tx, client, money, sessionRow };
}

const CASH_REFUND_REQ = {
  positions: [{ productId: PRODUCT_ID, quantity: '1' }],
  cashAmountMinor: '100000',
  cardAmountMinor: '0',
};

describe('refund() — vozvrat chekini QAYTA refund qilib bo`lmaydi (cheksiz pul generatori)', () => {
  it('mirror chekni refund qilishga urinish → 400, pul ham, mirror ham YO`Q', async () => {
    const { svc, tx, money } = makeHarness({ refundedFromId: 'original-sale-0' });

    await expect(svc.refund(ACCOUNT, USER_ID, SALE_ID, CASH_REFUND_REQ)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    // Kassadan bir tiyin ham chiqmaydi, ikkinchi darajali mirror yaratilmaydi.
    expect(money.applyDeltas).not.toHaveBeenCalled();
    expect(tx.retailSale.create).not.toHaveBeenCalled();
  });

  it('asl (refundedFromId = null) chek hamon qaytariladi', async () => {
    const { svc, money } = makeHarness();

    await svc.refund(ACCOUNT, USER_ID, SALE_ID, CASH_REFUND_REQ);

    expect(money.applyDeltas).toHaveBeenCalledTimes(1);
  });
});

describe('refund() — smena atomik claim qilinadi (SALES-07 naqshi)', () => {
  it('o`qish bilan tranzaksiya orasida smena yopilsa → 409', async () => {
    const { svc, sessionRow } = makeHarness({ liveSessionState: 'closed' });

    await expect(svc.refund(ACCOUNT, USER_ID, SALE_ID, CASH_REFUND_REQ)).rejects.toBeInstanceOf(
      ConflictException,
    );

    // Claim rad etildi — agregat oshmaydi. (Haqiqiy bazada butun tranzaksiya,
    // jumladan pul/ombor kaskadi ham, orqaga qaytadi.)
    expect(sessionRow.returnsCount).toBeUndefined();
  });

  it('smena ochiq bo`lsa claim SHARTLI updateMany bilan o`tadi va agregat oshadi', async () => {
    const { svc, tx, sessionRow } = makeHarness();

    await svc.refund(ACCOUNT, USER_ID, SALE_ID, CASH_REFUND_REQ);

    expect(tx.cashierSession.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.cashierSession.updateMany.mock.calls[0]?.[0]?.where).toMatchObject({
      id: SESSION_ID,
      accountId: ACCOUNT,
      state: 'open',
    });
    expect(sessionRow.returnsCount).toEqual({ increment: 1 });
    expect(sessionRow.returnsSumMinor).toEqual({ increment: 100_000n });
    // Eski shartsiz yo'l o'lik: hech kim `update` chaqirmaydi.
    expect(tx.cashierSession.update).not.toHaveBeenCalled();
  });
});
