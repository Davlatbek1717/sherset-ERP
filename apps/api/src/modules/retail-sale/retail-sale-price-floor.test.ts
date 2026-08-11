import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { mockDocumentSequence } from '../../prisma/document-sequence.mock.js';
import { RetailSaleService } from './retail-sale.service.js';

/**
 * P12 — `post()` NARX SIYOSATINI qo'llaydimi (egasining qarori 2026-08-12).
 *
 * `price-policy-guard.test.ts` qoidaning O'ZINI sinaydi; bu yerdagi savol
 * boshqa — chek yopish yo'li o'sha qoidani haqiqatan chaqiradimi va rad etilgan
 * chekda PUL QIMIRLAMAYDImi. Ikkisi alohida: qoida to'g'ri bo'lib, `post()` uni
 * chaqirmasa ham hamma test yashil qolardi (repo'ning ma'lum «yetim modul»
 * klassi).
 *
 * Harness `retail-sale-post-guards.test.ts` dagi dublyordan olingan: `findFirst`
 * — detached snapshot, `updateMany` — jonli qator.
 */

const ACC = 'acc-1';
const USER = 'user-1';
const SALE = 'sale-1';
const SESSION = 'sess-1';
const PRODUCT = 'prod-1';

type Row = Record<string, unknown>;

function matchesState(cond: unknown, value: unknown): boolean {
  if (cond === undefined) return true;
  if (typeof cond === 'object' && cond !== null && 'in' in cond) {
    return (cond as { in: unknown[] }).in.includes(value);
  }
  return cond === value;
}

interface Opts {
  /** Kassir kiritgan birlik narxi (tiyin). */
  priceMinor: bigint;
  /** Chek chegirmasi foizi. */
  discount?: string;
  /** Karta tan narxi — `null` = yig'ilmagan (pol YO'Q). */
  buyPrice?: bigint | null;
  /** Karta chakana narxi (tiyin). */
  basePrice?: bigint | null;
  quantity?: string;
}

function makeHarness(opts: Opts) {
  const quantity = opts.quantity ?? '1';
  const discount = opts.discount ?? '0';
  // Chek summasi = qator jamisi (chegirma bilan) — `expectedSumMinor` shu.
  const gross = opts.priceMinor * BigInt(quantity === '1' ? 1 : Number(quantity));
  const sumMinor = (gross * (100n - BigInt(discount))) / 100n;

  const sessionRow: Row = { id: SESSION, accountId: ACC, state: 'open' };
  const saleRow: Row = { id: SALE, accountId: ACC, state: 'draft', agentId: null };

  const tx = {
    retailSale: {
      updateMany: vi.fn(async (args: { where: Row; data: Row }) => {
        if (!matchesState(args.where.state, saleRow.state)) return { count: 0 };
        Object.assign(saleRow, args.data);
        return { count: 1 };
      }),
      findUniqueOrThrow: vi.fn(async () => ({ ...saleRow, sumMinor })),
    },
    retailSalePayment: { createMany: vi.fn(async () => ({ count: 1 })) },
    retailSalePosition: { updateMany: vi.fn(async () => ({ count: 1 })) },
    cashierAuditEvent: { createMany: vi.fn(async () => ({ count: 1 })) },
    counterpartyBalance: { findFirst: vi.fn(async () => ({ balanceMinor: 0n })) },
    cashierSession: {
      update: vi.fn(async () => ({ ...sessionRow })),
      updateMany: vi.fn(async (args: { where: Row; data: Row }) => {
        if (args.where.id !== sessionRow.id) return { count: 0 };
        if (!matchesState(args.where.state, sessionRow.state)) return { count: 0 };
        Object.assign(sessionRow, args.data);
        return { count: 1 };
      }),
    },
  };

  const client = {
    documentSequence: mockDocumentSequence(),
    employee: { findUnique: vi.fn(async () => null) },
    product: {
      findMany: vi.fn(async () => [
        {
          id: PRODUCT,
          name: 'Rubilnik seriy 400A',
          buyPrice: opts.buyPrice === undefined ? 80_000n : opts.buyPrice,
          salePrices:
            opts.basePrice === null
              ? []
              : [{ priceTypeId: 'pt-default', value: String(opts.basePrice ?? 100_000n) }],
        },
      ]),
    },
    priceType: {
      findMany: vi.fn(async () => [{ id: 'pt-default', isDefault: true }]),
    },
    counterparty: {
      findFirst: vi.fn(async (a: { where: { id: string } }) => ({ id: a.where.id })),
    },
    retailSale: {
      findFirst: vi.fn(async () => ({
        id: SALE,
        name: 'ТРН-1',
        state: 'draft',
        agentId: null,
        sumMinor,
        sessionId: SESSION,
        organizationId: 'org-1',
        session: {
          id: SESSION,
          state: 'open',
          cashDeskId: 'cd-1',
          storeId: 'st-1',
          salesCount: 0,
          salesSumMinor: 0n,
          store: { allowNegativeStock: true },
          cashDesk: { currency: 'UZS' },
        },
        positions: [
          {
            id: 'pos-1',
            productId: PRODUCT,
            quantity,
            priceMinor: opts.priceMinor,
            discount,
            product: { name: 'Rubilnik seriy 400A' },
          },
        ],
      })),
    },
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };

  const money = { applyDeltas: vi.fn(async () => undefined) };
  const stock = {
    lockBalances: vi.fn(async () => new Map()),
    assertAvailable: vi.fn(),
    applyDeltas: vi.fn(async () => undefined),
  };

  const svc = new RetailSaleService(
    { client } as never,
    stock as never,
    money as never,
    { computeEarnedPoints: vi.fn(), createOperation: vi.fn() } as never,
    {} as never,
    { applyDelta: vi.fn(async () => undefined) } as never,
    { applyPayment: async () => {} } as never,
  );
  const pay = () =>
    svc.post(ACC, USER, SALE, {
      cashAmountMinor: sumMinor.toString(),
      cardAmountMinor: '0',
      expectedSumMinor: sumMinor.toString(),
    });
  return { svc, pay, money, stock, saleRow };
}

describe("P12 · post() narx polini qo'llaydi", () => {
  it('poldan past narxli chek RAD etiladi va pul qimirlamaydi', async () => {
    const h = makeHarness({ priceMinor: 79_900n, buyPrice: 80_000n });

    await expect(h.pay()).rejects.toBeInstanceOf(BadRequestException);

    expect(h.money.applyDeltas).not.toHaveBeenCalled();
    expect(h.stock.applyDeltas).not.toHaveBeenCalled();
    expect(h.saleRow.state).toBe('draft');
  });

  it("polga teng narxli chek o'tadi", async () => {
    const h = makeHarness({ priceMinor: 80_000n, buyPrice: 80_000n });
    await h.pay();
    expect(h.saleRow.state).toBe('posted');
  });

  it('chek chegirmasi polni buzsa RAD etiladi', async () => {
    // 1 000 so'm − 25% = 750 so'm < pol 800 so'm.
    const h = makeHarness({ priceMinor: 100_000n, discount: '25', buyPrice: 80_000n });
    await expect(h.pay()).rejects.toBeInstanceOf(BadRequestException);
    expect(h.money.applyDeltas).not.toHaveBeenCalled();
  });

  it("tan narx NULL bo'lgan tovarda past narx ham o'tadi (NULL ≠ pol 0)", async () => {
    const h = makeHarness({ priceMinor: 1_00n, buyPrice: null });
    await h.pay();
    expect(h.saleRow.state).toBe('posted');
  });

  it('0 narxli qator RAD etiladi (egasining qarori: TAQIQ)', async () => {
    const h = makeHarness({ priceMinor: 0n, buyPrice: null });
    await expect(h.pay()).rejects.toBeInstanceOf(BadRequestException);
    expect(h.money.applyDeltas).not.toHaveBeenCalled();
  });

  it("karta narxi tan narxdan past tovar o'z karta narxida sotiladi", async () => {
    // Prod holati: chakana 35 000 < tan 245 000 ⇒ pol = 35 000.
    const h = makeHarness({ priceMinor: 3_500_000n, buyPrice: 24_500_000n, basePrice: 3_500_000n });
    await h.pay();
    expect(h.saleRow.state).toBe('posted');
  });
});
