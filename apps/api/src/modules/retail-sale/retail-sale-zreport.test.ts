import { describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';
import { RetailSaleService } from './retail-sale.service.js';

/**
 * QA 2026-08-10 — legacy zReport() ning ikki nuqsoni.
 *
 * **A. Naqd tushum qaytimni ayirmasdi.** `cashSalesMinor = Σ cashAmountMinor`
 * — lekin `cashAmountMinor` mijoz BERGAN naqd; yashiqqa `cash − change`
 * tushadi (money-ledger ham, cashier-session.service.ts'dagi to'g'ri formula
 * ham shuni yozadi). Qaytim ayirilmasa Z-hisobot naqdi har qaytim summasicha
 * ko'p ko'rinadi.
 *
 * **B. `sessionId` Zod'siz.** Controller query'ni validatsiyasiz uzatardi:
 * noto'g'ri uuid Prisma P2023 bilan 500 qaytarardi. Endi servis kirishda
 * `z.string().uuid()` bilan tekshiradi — ZodError → global filtr 400 qiladi.
 */

const ACCOUNT = 'acc-1';
const SESSION_ID = '33333333-3333-4333-8333-333333333333';

function makeHarness() {
  const sessionFindFirst = vi.fn(async () => ({
    id: SESSION_ID,
    state: 'closed',
    openedAt: new Date('2026-08-10T03:00:00Z'),
    closedAt: new Date('2026-08-10T15:00:00Z'),
    cashier: { id: 'emp-1', name: 'Kassir' },
    cashDesk: { id: 'cd-1', name: 'Kassa', currency: 'UZS' },
    store: { id: 'st-1', name: 'Ombor' },
    organization: { id: 'org-1', name: 'Org' },
    openingCashMinor: 0n,
    closingCashMinor: null,
    expectedCashMinor: null,
    discrepancyMinor: null,
  }));

  const aggregate = vi.fn(
    async (args: { where: { refundedFromId: unknown }; _sum: Record<string, boolean> }) =>
      args.where.refundedFromId === null
        ? {
            // Sotuvlar: mijozlar 110 000 naqd berdi, 10 000 qaytim oldi —
            // yashiqqa 100 000 tushdi.
            _sum: {
              sumMinor: 100_000n,
              cashAmountMinor: 110_000n,
              cardAmountMinor: 0n,
              changeMinor: 10_000n,
            },
            _count: { id: 2 },
          }
        : {
            _sum: { sumMinor: 0n, cashAmountMinor: 0n, cardAmountMinor: 0n, changeMinor: 0n },
            _count: { id: 0 },
          },
  );

  const client = {
    cashierSession: { findFirst: sessionFindFirst },
    retailSale: { aggregate },
  };

  const svc = new RetailSaleService(
    { client } as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    // F8: CustomerOrderService — zakazsiz chekda chaqirilmaydi.
    { applyPayment: async () => {} } as never,
  );
  return { svc, sessionFindFirst, aggregate };
}

describe('zReport() — naqd tushum qaytimni ayiradi', () => {
  it('cashSalesMinor = Σ cash − Σ change (yashiqdagi haqiqiy naqd)', async () => {
    const { svc, aggregate } = makeHarness();

    const report = (await svc.zReport(ACCOUNT, SESSION_ID)) as { cashSalesMinor: string };

    expect(report.cashSalesMinor).toBe('100000');
    // So'rov shakli ham qulflanadi: sotuv agregati changeMinor'ni SO'RAYDI —
    // aks holda haqiqiy Prisma uni qaytarmaydi va ayirma jim 0 bo'lardi.
    const salesCall = aggregate.mock.calls.find((c) => c[0]?.where?.refundedFromId === null);
    expect(salesCall?.[0]?._sum).toMatchObject({ changeMinor: true });
  });
});

describe('zReport() — sessionId Zod bilan tekshiriladi', () => {
  it('noto`g`ri uuid → ZodError (global filtr 400 qiladi), DB so`rovi ketmaydi', async () => {
    const { svc, sessionFindFirst } = makeHarness();

    await expect(svc.zReport(ACCOUNT, 'not-a-uuid')).rejects.toBeInstanceOf(ZodError);
    expect(sessionFindFirst).not.toHaveBeenCalled();
  });

  it('sessionId umuman berilmasa ham ZodError — Prisma P2023/500 emas', async () => {
    const { svc, sessionFindFirst } = makeHarness();

    await expect(svc.zReport(ACCOUNT, undefined as unknown as string)).rejects.toBeInstanceOf(
      ZodError,
    );
    expect(sessionFindFirst).not.toHaveBeenCalled();
  });
});
