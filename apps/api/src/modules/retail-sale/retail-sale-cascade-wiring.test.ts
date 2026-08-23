import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { mockDocumentSequence } from '../../prisma/document-sequence.mock.js';
import { RetailSaleService } from './retail-sale.service.js';

/**
 * F6 — kaskadning SIMLARI: `Store.attributes.__posPriority` sozlangan bo'lsa
 * post/picking/cancel/refund stok amallari SMENA omborida emas, KASKADNING
 * BIRINCHI omborida («Ombor 07») yuradi; sozlanmagan bo'lsa xulq eskisidek.
 * Sof taqsimot mantiqi `retail-stock-cascade.test.ts` da — bu fayl WIRING
 * uchun: to'g'ri hisob noto'g'ri omborga ulansa qiymati yo'q.
 */

const ACCOUNT = 'acc-1';
const USER_ID = 'user-1';
const USER_NAME = 'Kassir';
const SALE_ID = 'sale-1';
const SESSION_ID = 'sess-1';
const STORE_UN = 'store-unassigned';
const STORE_07 = 'store-07';
const STORE_02 = 'store-02';
const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';

const CASCADE_ROWS = [
  { id: STORE_02, name: 'Ombor 02', allowNegativeStock: false, attributes: { __posPriority: 2 } },
  { id: STORE_07, name: 'Ombor 07', allowNegativeStock: false, attributes: { __posPriority: 1 } },
];

function makeStockStub() {
  return {
    lockBalances: vi.fn().mockResolvedValue(new Map()),
    assertAvailable: vi.fn(),
    applyDeltas: vi.fn().mockResolvedValue(undefined),
    applyReservationDeltas: vi.fn().mockResolvedValue(undefined),
    releaseReservationByDoc: vi.fn().mockResolvedValue(false),
  };
}

function makeService(client: unknown, stock: ReturnType<typeof makeStockStub>) {
  return new RetailSaleService(
    { client } as never,
    stock as never,
    { applyDeltas: vi.fn().mockResolvedValue(undefined) } as never,
    { computeEarnedPoints: vi.fn(), createOperation: vi.fn() } as never,
    { emit: vi.fn().mockResolvedValue(undefined) } as never,
    { applyDelta: vi.fn().mockResolvedValue(undefined) } as never,
    { applyPayment: async () => {} } as never,
  );
}

// ── post() ────────────────────────────────────────────────────────────────

function makePostHarness(opts: { stores: unknown[] }) {
  const tx = {
    retailSale: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        id: SALE_ID,
        state: 'posted',
        agentId: null,
        sumMinor: 100_000n,
      }),
    },
    retailSalePayment: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    cashierSession: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    retailSalePosition: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    cashierAuditEvent: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    stockReservation: { findMany: vi.fn().mockResolvedValue([]) },
    stock: { findMany: vi.fn().mockResolvedValue([]) },
    counterpartyBalance: { findFirst: vi.fn(async () => ({ balanceMinor: 0n })) },
  };
  const client = {
    employee: { findUnique: vi.fn(async () => null) },
    store: { findMany: vi.fn(async () => opts.stores) },
    product: { findMany: vi.fn(async () => []) },
    priceType: { findMany: vi.fn(async () => []) },
    retailSale: {
      findFirst: vi.fn().mockResolvedValue({
        id: SALE_ID,
        name: 'CHK-1',
        state: 'draft',
        sumMinor: 100_000n,
        sessionId: SESSION_ID,
        agentId: null,
        customerOrderId: null,
        session: {
          id: SESSION_ID,
          state: 'open',
          cashDeskId: 'cd-1',
          storeId: STORE_UN,
          salesCount: 0,
          salesSumMinor: 0n,
          store: { allowNegativeStock: false },
          cashDesk: { currency: 'UZS' },
        },
        positions: [
          {
            id: 'pos-1',
            productId: PRODUCT_ID,
            quantity: 2,
            priceMinor: 50_000n,
            discount: 0,
            product: { name: 'Tovar A' },
          },
        ],
      }),
    },
    $transaction: vi
      .fn()
      .mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  return { client, tx };
}

const POST_BODY = {
  cashAmountMinor: '100000',
  cardAmountMinor: '0',
  expectedSumMinor: '100000',
};

describe('F6 — post(): stok ombori kaskaddan', () => {
  it('kaskad sozlangan: ayirish PRIORITETI ENG KICHIK ombordan (07), smena omboridan emas', async () => {
    const { client } = makePostHarness({ stores: CASCADE_ROWS });
    const stock = makeStockStub();

    await makeService(client, stock).post(ACCOUNT, USER_ID, SALE_ID, POST_BODY);

    // Qulf ham, deltalar ham 07 da.
    expect(stock.lockBalances.mock.calls[0][2]).toBe(STORE_07);
    expect(stock.applyDeltas).toHaveBeenCalledTimes(1);
    const deltas = stock.applyDeltas.mock.calls[0][3] as Array<{
      storeId: string;
      qtyDelta: string;
    }>;
    expect(deltas).toHaveLength(1);
    expect(deltas[0].storeId).toBe(STORE_07);
    expect(deltas[0].qtyDelta).toBe('-2');
  });

  it('kaskad sozlanmagan: eski xulq — smena ombori, hold-so‘rovi ham YO‘Q', async () => {
    const { client, tx } = makePostHarness({
      stores: [{ id: STORE_UN, name: 'Taqsimlanmagan', allowNegativeStock: false, attributes: {} }],
    });
    const stock = makeStockStub();

    await makeService(client, stock).post(ACCOUNT, USER_ID, SALE_ID, POST_BODY);

    expect(stock.lockBalances.mock.calls[0][2]).toBe(STORE_UN);
    const deltas = stock.applyDeltas.mock.calls[0][3] as Array<{ storeId: string }>;
    expect(deltas[0].storeId).toBe(STORE_UN);
    // Kaskadsiz yo'l bitta ham ortiqcha so'rov qilmaydi (post()dagi izoh).
    expect(tx.stockReservation.findMany).not.toHaveBeenCalled();
  });

  it('07 yetmasa: 400 ichida G4 uchun kaskad-reja; hech narsa ayirilmaydi', async () => {
    const { client, tx } = makePostHarness({ stores: CASCADE_ROWS });
    const stock = makeStockStub();
    // Haqiqiy assertAvailable shakli bilan InsufficientStock (07 da 2 dona kam).
    stock.assertAvailable.mockImplementation(() => {
      throw new BadRequestException({
        error: 'InsufficientStock',
        message: "Omborda yetarli miqdor yo'q",
        details: {
          shortages: [
            {
              assortmentKind: 'product',
              assortmentId: PRODUCT_ID,
              requested: '2',
              available: '0',
              shortage: '2',
            },
          ],
        },
      });
    });
    tx.stock.findMany.mockResolvedValue([
      { storeId: STORE_02, assortmentId: PRODUCT_ID, qty: '10', reservedQty: '1' },
    ]);

    let caught: BadRequestException | null = null;
    try {
      await makeService(client, stock).post(ACCOUNT, USER_ID, SALE_ID, POST_BODY);
    } catch (e) {
      caught = e as BadRequestException;
    }
    expect(caught).toBeInstanceOf(BadRequestException);
    const resp = caught?.getResponse() as {
      message: string;
      details: {
        cascadePlan: Array<{ storeId: string; qty: string; storeName: string | null }>;
        stillMissing: unknown[];
      };
    };
    // Xabar 07 nomi bilan va bosh omborchi tasdig'iga (G4) ishora qiladi.
    expect(resp.message).toContain('Ombor 07');
    expect(resp.message).toContain("bosh omborchi tasdig'i");
    // G4 darvozasi uchun tayyor reja: 2 dona Ombor 02 dan.
    expect(resp.details.cascadePlan).toEqual([
      { storeId: STORE_02, assortmentId: PRODUCT_ID, qty: '2', storeName: 'Ombor 02' },
    ]);
    expect(resp.details.stillMissing).toEqual([]);
    expect(stock.applyDeltas).not.toHaveBeenCalled();
  });
});

// ── sendToPicking() ───────────────────────────────────────────────────────

describe('F6 — sendToPicking(): rezerv kaskad omborida', () => {
  it('hold post() ayiradigan omborda (07) yoziladi', async () => {
    const tx = {
      retailSale: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };
    const client = {
      store: { findMany: vi.fn(async () => CASCADE_ROWS) },
      skladKeeper: { findMany: vi.fn().mockResolvedValue([]) },
      retailSale: {
        findFirst: vi.fn().mockResolvedValue({
          id: SALE_ID,
          state: 'draft',
          name: 'CHK-1',
          storeId: null,
          store: null,
          session: {
            storeId: STORE_UN,
            store: { allowNegativeStock: false, name: 'Taqsimlanmagan' },
          },
          positions: [{ productId: PRODUCT_ID, quantity: 3 }],
        }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: SALE_ID, state: 'picking' }),
      },
      $transaction: vi
        .fn()
        .mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    };
    const stock = makeStockStub();

    await makeService(client, stock).sendToPicking(ACCOUNT, SALE_ID, USER_ID, USER_NAME);

    expect(stock.lockBalances.mock.calls[0][2]).toBe(STORE_07);
    const deltas = stock.applyReservationDeltas.mock.calls[0][3] as Array<{
      storeId: string;
      qtyDelta: string;
      reason: string;
    }>;
    expect(deltas[0].storeId).toBe(STORE_07);
    expect(deltas[0].qtyDelta).toBe('3');
    expect(deltas[0].reason).toBe('reserve');
  });
});

// ── cancel() ──────────────────────────────────────────────────────────────

describe('F6 — cancel(): qulf hold HAQIQATAN turgan omborga', () => {
  it('rezerv 07 da yozilgan bo‘lsa, qulf ham 07 da (smena omborida emas)', async () => {
    const tx = {
      retailSale: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      stockReservation: { findMany: vi.fn().mockResolvedValue([{ storeId: STORE_07 }]) },
      cashierAuditEvent: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    };
    const client = {
      store: { findMany: vi.fn(async () => CASCADE_ROWS) },
      restockTask: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      retailSale: {
        findFirst: vi.fn().mockResolvedValue({
          id: SALE_ID,
          state: 'picking',
          name: 'CHK-1',
          sessionId: SESSION_ID,
          sumMinor: 100_000n,
          session: { storeId: STORE_UN },
          positions: [{ productId: PRODUCT_ID, quantity: 2 }],
        }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: SALE_ID, state: 'cancelled' }),
      },
      $transaction: vi
        .fn()
        .mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    };
    const stock = makeStockStub();

    await makeService(client, stock).cancel(ACCOUNT, USER_ID, SALE_ID);

    expect(stock.lockBalances).toHaveBeenCalledTimes(1);
    expect(stock.lockBalances.mock.calls[0][2]).toBe(STORE_07);
    expect(stock.releaseReservationByDoc).toHaveBeenCalledWith(
      tx,
      ACCOUNT,
      USER_ID,
      'retailsale',
      SALE_ID,
      'release_cancel',
    );
  });
});

// ── refund() ──────────────────────────────────────────────────────────────

describe('F6 — refund(): qaytgan tovar kaskad omboriga kiradi', () => {
  it('kirim deltasi 07 ga (sotuv ayirgan ombor), smena omboriga emas', async () => {
    const stockApplyDeltas = vi.fn().mockResolvedValue(undefined);
    const tx = {
      retailSale: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn().mockImplementation(async (args: { data: Record<string, unknown> }) => ({
          id: 'refund-1',
          ...args.data,
        })),
      },
      retailSalePosition: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: 'rp-1', productId: PRODUCT_ID, quantity: '1', position: 1 }]),
      },
      stockOperation: { findMany: vi.fn().mockResolvedValue([]) },
      cashierAuditEvent: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
      cashierSession: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };
    const client = {
      documentSequence: mockDocumentSequence(),
      employee: { findUnique: vi.fn(async () => null) },
      store: { findMany: vi.fn(async () => CASCADE_ROWS) },
      bonusOperation: { findFirst: vi.fn(async () => null) },
      cashierSession: {
        findFirst: vi.fn(async () => ({
          id: SESSION_ID,
          cashDeskId: 'cd-1',
          storeId: STORE_UN,
          cashDesk: { currency: 'UZS' },
        })),
      },
      retailSale: {
        findFirst: vi.fn().mockResolvedValue({
          id: SALE_ID,
          name: 'ТРН-2026-00001',
          state: 'posted',
          version: 1,
          sumMinor: 10_000n,
          sessionId: SESSION_ID,
          agentId: null,
          refundedFromId: null,
          organizationId: null,
          payments: [],
          session: {
            id: SESSION_ID,
            state: 'open',
            cashDeskId: 'cd-1',
            storeId: STORE_UN,
            cashDesk: { currency: 'UZS' },
          },
          positions: [
            {
              productId: PRODUCT_ID,
              quantity: '1',
              priceMinor: 10_000n,
              discount: '0',
              sumMinor: 10_000n,
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
    const svc = new RetailSaleService(
      { client } as never,
      { applyDeltas: stockApplyDeltas } as never,
      { applyDeltas: vi.fn().mockResolvedValue(undefined) } as never,
      { createOperation: vi.fn() } as never,
      undefined as never,
      { applyDelta: vi.fn().mockResolvedValue(undefined) } as never,
      { applyPayment: async () => {} } as never,
    );

    await svc.refund(ACCOUNT, USER_ID, SALE_ID, {
      positions: [{ productId: PRODUCT_ID, quantity: '1' }],
      cashAmountMinor: '10000',
      cardAmountMinor: '0',
    });

    expect(stockApplyDeltas).toHaveBeenCalledTimes(1);
    const deltas = stockApplyDeltas.mock.calls[0][3] as Array<{
      storeId: string;
      qtyDelta: string;
      reason: string;
    }>;
    expect(deltas[0].storeId).toBe(STORE_07);
    expect(deltas[0].qtyDelta).toBe('1');
    expect(deltas[0].reason).toBe('unpost');
  });
});
