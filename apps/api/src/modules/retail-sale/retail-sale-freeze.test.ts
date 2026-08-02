import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { mockDocumentSequence } from '../../prisma/document-sequence.mock.js';
import { RetailSaleService } from './retail-sale.service.js';

/**
 * Kassa TZ §5.3 — `post()` freezes cost + base price onto the receipt lines.
 *
 * What these tests defend, in order of how badly each would hurt:
 *   1. the numbers are written at all, and from the product CARD (not the line);
 *   2. an absent cost is written as NULL, never coerced to 0 — a 0 cost is what
 *      makes a report claim 100% margin;
 *   3. the write is inside the post transaction, so a receipt that fails to post
 *      is not left holding a snapshot;
 *   4. a lost CAS race writes nothing at all.
 */

const ACCOUNT = 'acc-1';
const USER_ID = 'user-1';
const SALE_ID = 'sale-1';
const SESSION_ID = 'sess-1';
const CASHDESK_ID = 'cd-1';
const STORE_ID = 'store-1';
const DEFAULT_TYPE = 'pt-retail';

function makeStockStub() {
  return {
    lockBalances: vi.fn().mockResolvedValue(new Map()),
    assertAvailable: vi.fn(),
    applyDeltas: vi.fn().mockResolvedValue(undefined),
  };
}

function makeMoneyStub() {
  return { applyDeltas: vi.fn().mockResolvedValue(undefined) };
}

interface Position {
  id: string;
  productId: string | null;
  quantity: string;
}

interface ProductCard {
  id: string;
  buyPrice: bigint | null;
  salePrices: unknown;
}

function makeHarness(opts: {
  positions: Position[];
  products: ProductCard[];
  casCount?: number;
  defaultPriceTypeId?: string | null;
}) {
  const positionUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
  const tx = {
    retailSale: {
      updateMany: vi.fn().mockResolvedValue({ count: opts.casCount ?? 1 }),
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        id: SALE_ID,
        state: 'posted',
        agentId: null,
        sumMinor: 100_000n,
      }),
    },
    retailSalePosition: { updateMany: positionUpdateMany },
    cashDesk: { update: vi.fn().mockResolvedValue({}) },
    cashierSession: { update: vi.fn().mockResolvedValue({}) },
  };

  const productFindMany = vi.fn().mockResolvedValue(opts.products);
  const client = {
    documentSequence: mockDocumentSequence(),
    employee: { findUnique: vi.fn(async () => null) },
    product: { findMany: productFindMany },
    priceType: {
      findFirst: vi
        .fn()
        .mockResolvedValue(
          opts.defaultPriceTypeId === null ? null : { id: opts.defaultPriceTypeId ?? DEFAULT_TYPE },
        ),
    },
    retailSale: {
      findFirst: vi.fn().mockResolvedValue({
        id: SALE_ID,
        name: 'ТРН-2026-00001',
        state: 'draft',
        sumMinor: 100_000n,
        sessionId: SESSION_ID,
        session: {
          id: SESSION_ID,
          state: 'open',
          cashDeskId: CASHDESK_ID,
          storeId: STORE_ID,
          salesCount: 0,
          salesSumMinor: 0n,
          store: { allowNegativeStock: true },
          cashDesk: { currency: 'UZS' },
        },
        positions: opts.positions,
      }),
    },
    $transaction: vi
      .fn()
      .mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };

  const svc = new RetailSaleService(
    { client } as never,
    makeStockStub() as never,
    makeMoneyStub() as never,
  );
  return { svc, tx, client, positionUpdateMany, productFindMany };
}

const PAYMENT = {
  cashAmountMinor: '100000',
  cardAmountMinor: '0',
  expectedSumMinor: '100000',
};

describe('RetailSaleService.post — price freeze', () => {
  it('writes the card cost + retail tier onto the line', async () => {
    const { svc, positionUpdateMany } = makeHarness({
      positions: [{ id: 'pos-1', productId: 'p1', quantity: '2' }],
      products: [
        {
          id: 'p1',
          buyPrice: 2_480_000n,
          salePrices: [
            { priceTypeId: 'pt-wholesale', value: '2800000' },
            { priceTypeId: DEFAULT_TYPE, value: '3600000' },
          ],
        },
      ],
    });

    await svc.post(ACCOUNT, USER_ID, SALE_ID, PAYMENT);

    expect(positionUpdateMany).toHaveBeenCalledTimes(1);
    expect(positionUpdateMany).toHaveBeenCalledWith({
      where: { retailSaleId: SALE_ID, accountId: ACCOUNT, productId: 'p1' },
      data: { costMinor: 2_480_000n, basePriceMinor: 3_600_000n },
    });
  });

  it('writes NULL cost — never 0 — when the card has no buyPrice', async () => {
    const { svc, positionUpdateMany } = makeHarness({
      positions: [{ id: 'pos-1', productId: 'p1', quantity: '1' }],
      products: [
        { id: 'p1', buyPrice: null, salePrices: [{ priceTypeId: DEFAULT_TYPE, value: '500' }] },
      ],
    });

    await svc.post(ACCOUNT, USER_ID, SALE_ID, PAYMENT);

    const data = positionUpdateMany.mock.calls[0]?.[0]?.data;
    expect(data).toEqual({ costMinor: null, basePriceMinor: 500n });
    // Explicit: a NULL cost must not have been rewritten as a zero cost.
    expect(data.costMinor).not.toBe(0n);
  });

  it('skips the write entirely for a product with no cost and no price', async () => {
    const { svc, positionUpdateMany } = makeHarness({
      positions: [{ id: 'pos-1', productId: 'p1', quantity: '1' }],
      products: [{ id: 'p1', buyPrice: null, salePrices: null }],
    });

    await svc.post(ACCOUNT, USER_ID, SALE_ID, PAYMENT);

    expect(positionUpdateMany).not.toHaveBeenCalled();
  });

  it('issues ONE statement per distinct product, not per line', async () => {
    const { svc, positionUpdateMany } = makeHarness({
      positions: [
        { id: 'pos-1', productId: 'p1', quantity: '1' },
        { id: 'pos-2', productId: 'p1', quantity: '3' },
        { id: 'pos-3', productId: 'p2', quantity: '1' },
      ],
      products: [
        { id: 'p1', buyPrice: 100n, salePrices: [{ priceTypeId: DEFAULT_TYPE, value: '300' }] },
        { id: 'p2', buyPrice: 700n, salePrices: [{ priceTypeId: DEFAULT_TYPE, value: '900' }] },
      ],
    });

    await svc.post(ACCOUNT, USER_ID, SALE_ID, PAYMENT);

    expect(positionUpdateMany).toHaveBeenCalledTimes(2);
  });

  it('ignores service-only lines (productId === null) without querying for them', async () => {
    const { svc, positionUpdateMany, productFindMany } = makeHarness({
      positions: [{ id: 'pos-1', productId: null, quantity: '1' }],
      products: [],
    });

    await svc.post(ACCOUNT, USER_ID, SALE_ID, PAYMENT);

    expect(productFindMany).not.toHaveBeenCalled();
    expect(positionUpdateMany).not.toHaveBeenCalled();
  });

  it('writes nothing when the CAS state guard loses the race', async () => {
    const { svc, positionUpdateMany } = makeHarness({
      positions: [{ id: 'pos-1', productId: 'p1', quantity: '1' }],
      products: [
        { id: 'p1', buyPrice: 100n, salePrices: [{ priceTypeId: DEFAULT_TYPE, value: '300' }] },
      ],
      casCount: 0,
    });

    await expect(svc.post(ACCOUNT, USER_ID, SALE_ID, PAYMENT)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(positionUpdateMany).not.toHaveBeenCalled();
  });

  it('still resolves a base price when the account has no default PriceType', async () => {
    const { svc, positionUpdateMany } = makeHarness({
      positions: [{ id: 'pos-1', productId: 'p1', quantity: '1' }],
      products: [
        { id: 'p1', buyPrice: 10n, salePrices: [{ priceTypeId: 'default', value: '250' }] },
      ],
      defaultPriceTypeId: null,
    });

    await svc.post(ACCOUNT, USER_ID, SALE_ID, PAYMENT);

    expect(positionUpdateMany.mock.calls[0]?.[0]?.data).toEqual({
      costMinor: 10n,
      basePriceMinor: 250n,
    });
  });
});
