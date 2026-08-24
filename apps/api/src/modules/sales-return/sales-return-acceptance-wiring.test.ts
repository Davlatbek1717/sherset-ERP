import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { BRAK_STORE_KEY } from './sales-return-acceptance.js';
import { SalesReturnAcceptanceService } from './sales-return-acceptance.service.js';

/**
 * G3 — qabul oqimining SIMLARI: manba chek to'g'ri tanlanadimi (mirror rad
 * etiladimi), cap ikkala yo'nalishdan yig'iladimi, hujjat(lar) qanday
 * yaratiladi (ombor kesimi, `retailSaleId`, chek narxi, `applicable`) va
 * yorliq ma'lumoti javobda qaytadimi. Sof arifmetika
 * `sales-return-acceptance.test.ts` da.
 */

const ACCOUNT = 'acc-1';
const USER = 'katta-omborchi-1';
const SALE = '11111111-1111-4111-8111-000000000001';
const AGENT = '11111111-1111-4111-8111-000000000002';
const ORG = '11111111-1111-4111-8111-000000000003';
const P1 = '11111111-1111-4111-8111-000000000004';
const P2 = '11111111-1111-4111-8111-000000000005';
const CELL_GOOD = '11111111-1111-4111-8111-000000000006';
const CELL_BRAK = '11111111-1111-4111-8111-000000000007';

interface SaleOverrides {
  state?: string;
  refundedFromId?: string | null;
  agentId?: string | null;
  organizationId?: string | null;
}

function makeSale(o: SaleOverrides = {}) {
  return {
    id: SALE,
    name: 'CH-000123',
    moment: new Date('2026-08-24T09:00:00Z'),
    state: o.state ?? 'posted',
    sumMinor: 50000n,
    agentId: o.agentId === undefined ? AGENT : o.agentId,
    organizationId: o.organizationId === undefined ? ORG : o.organizationId,
    currency: 'UZS',
    rateValue: 100000000n,
    vatEnabled: true,
    vatIncluded: false,
    refundedFromId: o.refundedFromId ?? null,
    agent: { id: AGENT, name: 'Mijoz A' },
    positions: [
      { productId: P1, quantity: '5', priceMinor: 10000n, discount: '0' },
      { productId: P2, quantity: '2', priceMinor: 20000n, discount: '5' },
    ],
  };
}

interface HarnessOpts {
  sale?: ReturnType<typeof makeSale> | null;
  mirrors?: Array<{ positions: Array<{ productId: string; quantity: string }> }>;
  priorReturnPositions?: Array<{ assortmentId: string; quantity: string }>;
  cells?: Array<{
    id: string;
    name: string;
    storeId: string;
    store: { attributes: Record<string, unknown> };
  }>;
  organizations?: Array<{ id: string }>;
  stores?: Array<{ id: string; name: string; attributes: Record<string, unknown> }>;
  receipts?: unknown[];
}

function makeHarness(opts: HarnessOpts = {}) {
  const created: unknown[] = [];
  const create = vi.fn(async (_acc: string, _user: string, input: Record<string, unknown>) => {
    created.push(input);
    return {
      id: `sr-${created.length}`,
      name: `ВП-2026-0000${created.length}`,
      state: input.applicable ? 'posted' : 'draft',
      sumMinor: 12345n,
    };
  });

  const client = {
    retailSale: {
      findFirst: vi.fn().mockResolvedValue(opts.sale === undefined ? makeSale() : opts.sale),
      findMany: vi.fn(async (args: { where?: { refundedFromId?: unknown } }) =>
        args.where && 'refundedFromId' in args.where && args.where.refundedFromId === SALE
          ? (opts.mirrors ?? [])
          : (opts.receipts ?? []),
      ),
    },
    salesReturnPosition: {
      findMany: vi.fn().mockResolvedValue(opts.priorReturnPositions ?? []),
    },
    product: {
      findMany: vi.fn().mockResolvedValue([
        { id: P1, name: 'Tovar 1', code: 'K1', article: 'A1', barcodes: ['4780000000001'] },
        { id: P2, name: 'Tovar 2', code: 'K2', article: null, barcodes: [] },
      ]),
    },
    storeCell: {
      findMany: vi.fn().mockResolvedValue(
        opts.cells ?? [
          { id: CELL_GOOD, name: '07-01-01-01', storeId: 'store-07', store: { attributes: {} } },
          {
            id: CELL_BRAK,
            name: '99-01-01-01',
            storeId: 'store-brak',
            store: { attributes: { [BRAK_STORE_KEY]: true } },
          },
        ],
      ),
    },
    organization: {
      findMany: vi.fn().mockResolvedValue(opts.organizations ?? [{ id: ORG }]),
    },
    store: {
      findMany: vi.fn().mockResolvedValue(opts.stores ?? []),
    },
  };

  const service = new SalesReturnAcceptanceService({ client } as never, { create } as never);
  return { service, client, create, created };
}

// ─── getSource ──────────────────────────────────────────────────────────────

describe('getSource — manba chek va cap', () => {
  it("mavjud bo'lmagan chek 404", async () => {
    const { service } = makeHarness({ sale: null });
    await expect(service.getSource(ACCOUNT, SALE)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('MIRROR (qaytarish) chek manba bo‘la olmaydi — joylashtirishga yo‘naltiradi', async () => {
    const { service } = makeHarness({ sale: makeSale({ refundedFromId: 'asl-chek' }) });
    await expect(service.getSource(ACCOUNT, SALE)).rejects.toThrow(/JOYLASHTIRING/);
  });

  it("o'tkazilmagan chek rad etiladi", async () => {
    const { service } = makeHarness({ sale: makeSale({ state: 'draft' }) });
    await expect(service.getSource(ACCOUNT, SALE)).rejects.toThrow(/draft/);
  });

  it('qaytarilgan (refunded) chek MANBA bo‘la oladi — qolgani qaytariladi', async () => {
    const { service } = makeHarness({
      sale: makeSale({ state: 'refunded' }),
      mirrors: [{ positions: [{ productId: P1, quantity: '2' }] }],
    });
    const res = await service.getSource(ACCOUNT, SALE);
    expect(res.lines[0]).toMatchObject({ productId: P1, posRefundedQty: '2', remainingQty: '3' });
  });

  it('cap ikkala yo‘nalishdan yig‘iladi (POS mirror + avvalgi ВП)', async () => {
    const { service, client } = makeHarness({
      mirrors: [{ positions: [{ productId: P1, quantity: '1' }] }],
      priorReturnPositions: [{ assortmentId: P1, quantity: '2' }],
    });
    const res = await service.getSource(ACCOUNT, SALE);
    expect(res.lines[0]).toMatchObject({
      soldQty: '5',
      posRefundedQty: '1',
      warehouseReturnedQty: '2',
      remainingQty: '2',
    });
    // Bekor qilingan ВП band qilmaydi, bekor qilingan mirror ham.
    expect(client.salesReturnPosition.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: {
        salesReturn: { retailSaleId: SALE, deletedAt: null, state: { not: 'cancelled' } },
      },
    });
    const mirrorCall = client.retailSale.findMany.mock.calls[0]?.[0] as {
      where: { state: { in: string[] } };
    };
    expect(mirrorCall.where.state.in).toEqual(['posted', 'refunded']);
  });

  it('yorliq uchun shtrix qaytadi — shtrixsiz tovarda kod zaxira', async () => {
    const { service } = makeHarness();
    const res = await service.getSource(ACCOUNT, SALE);
    expect(res.lines[0]).toMatchObject({ productName: 'Tovar 1', barcode: '4780000000001' });
    expect(res.lines[1]).toMatchObject({ productName: 'Tovar 2', barcode: 'K2' });
  });
});

// ─── accept ─────────────────────────────────────────────────────────────────

describe('accept — hujjat yaratish', () => {
  it('sifatli qatorlar bitta hujjat: retailSaleId, chek narxi, applicable', async () => {
    const { service, created } = makeHarness();
    const res = await service.accept(ACCOUNT, USER, SALE, {
      positions: [
        { productId: P1, quantity: '2', cellId: CELL_GOOD },
        { productId: P2, quantity: '1', cellId: CELL_GOOD },
      ],
    });
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      agentId: AGENT,
      organizationId: ORG,
      storeId: 'store-07',
      retailSaleId: SALE,
      currency: 'UZS',
      applicable: true,
    });
    const positions = (created[0] as { positions: Array<Record<string, unknown>> }).positions;
    // Narx CHEKDAN — so'rovda umuman yuborilmaydi.
    expect(positions[0]).toMatchObject({
      assortmentId: P1,
      quantity: '2',
      priceMinor: '10000',
      cellId: CELL_GOOD,
      cell: '07-01-01-01',
    });
    expect(positions[1]).toMatchObject({ assortmentId: P2, priceMinor: '20000', discount: '5' });
    expect(res.returns).toHaveLength(1);
    expect(res.returns[0]?.brak).toBe(false);
  });

  it('brak qator ALOHIDA hujjat — BRAK omborida, javobda belgilangan', async () => {
    const { service, created } = makeHarness();
    const res = await service.accept(ACCOUNT, USER, SALE, {
      positions: [
        { productId: P1, quantity: '3', cellId: CELL_GOOD },
        { productId: P1, quantity: '2', cellId: CELL_BRAK },
      ],
    });
    expect(created).toHaveLength(2);
    expect((created[0] as { storeId: string }).storeId).toBe('store-07');
    expect((created[1] as { storeId: string }).storeId).toBe('store-brak');
    expect(res.returns.map((r) => r.brak)).toEqual([false, true]);
  });

  it('javobda YORLIQ ma’lumoti bor (shtrix + yacheyka kodi) — qo‘shimcha so‘rovsiz chop', async () => {
    const { service } = makeHarness();
    const res = await service.accept(ACCOUNT, USER, SALE, {
      positions: [{ productId: P1, quantity: '1', cellId: CELL_BRAK }],
    });
    expect(res.returns[0]?.positions[0]).toMatchObject({
      productName: 'Tovar 1',
      barcode: '4780000000001',
      cellName: '99-01-01-01',
      quantity: '1',
    });
  });

  it('cap oshsa hech qanday hujjat yaratilmaydi', async () => {
    const { service, create } = makeHarness({
      priorReturnPositions: [{ assortmentId: P1, quantity: '4' }],
    });
    await expect(
      service.accept(ACCOUNT, USER, SALE, {
        positions: [{ productId: P1, quantity: '2', cellId: CELL_GOOD }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });

  it('mijozsiz chek qabul qilinmaydi — qaytarim kimga yozilishi noma‘lum', async () => {
    const { service, create } = makeHarness({ sale: makeSale({ agentId: null }) });
    await expect(
      service.accept(ACCOUNT, USER, SALE, {
        positions: [{ productId: P1, quantity: '1', cellId: CELL_GOOD }],
      }),
    ).rejects.toThrow(/mijoz/i);
    expect(create).not.toHaveBeenCalled();
  });

  it('chekda tashkilot yo‘q + akkauntda BITTA tashkilot ⇒ o‘sha olinadi', async () => {
    const { service, created } = makeHarness({
      sale: makeSale({ organizationId: null }),
      organizations: [{ id: 'yagona-org' }],
    });
    await service.accept(ACCOUNT, USER, SALE, {
      positions: [{ productId: P1, quantity: '1', cellId: CELL_GOOD }],
    });
    expect((created[0] as { organizationId: string }).organizationId).toBe('yagona-org');
  });

  it('chekda tashkilot yo‘q + bir NECHTA tashkilot ⇒ 400 (jimgina tanlanmaydi)', async () => {
    const { service, create } = makeHarness({
      sale: makeSale({ organizationId: null }),
      organizations: [{ id: 'org-a' }, { id: 'org-b' }],
    });
    await expect(
      service.accept(ACCOUNT, USER, SALE, {
        positions: [{ productId: P1, quantity: '1', cellId: CELL_GOOD }],
      }),
    ).rejects.toThrow(/tashkilot/i);
    expect(create).not.toHaveBeenCalled();
  });

  it('`post: false` qoralama qoldiradi', async () => {
    const { service, created } = makeHarness();
    await service.accept(ACCOUNT, USER, SALE, {
      positions: [{ productId: P1, quantity: '1', cellId: CELL_GOOD }],
      post: false,
    });
    expect((created[0] as { applicable: boolean }).applicable).toBe(false);
  });

  it('begona yacheyka (boshqa tenant) topilmaydi ⇒ 400', async () => {
    const { service, create } = makeHarness({ cells: [] });
    await expect(
      service.accept(ACCOUNT, USER, SALE, {
        positions: [{ productId: P1, quantity: '1', cellId: CELL_GOOD }],
      }),
    ).rejects.toThrow(/yacheyka/i);
    expect(create).not.toHaveBeenCalled();
  });
});

// ─── listTargets / listReceipts ─────────────────────────────────────────────

describe('listTargets — omborlar, BRAK va standart', () => {
  it('standart = kaskadning BIRINCHI (brak bo‘lmagan) ombori', async () => {
    const { service } = makeHarness({
      stores: [
        { id: 'store-taq', name: 'Taqsimlanmagan', attributes: { __posPriority: 2 } },
        { id: 'store-07', name: 'Ombor 07', attributes: { __posPriority: 1 } },
        { id: 'store-brak', name: 'Brak', attributes: { [BRAK_STORE_KEY]: true } },
      ],
    });
    const res = await service.listTargets(ACCOUNT);
    expect(res.defaultStoreId).toBe('store-07');
    expect(res.brakStoreId).toBe('store-brak');
    expect(res.stores.find((s) => s.id === 'store-brak')?.brak).toBe(true);
  });

  it('kaskad sozlanmagan bo‘lsa standart yo‘q (omborchi o‘zi tanlaydi)', async () => {
    const { service } = makeHarness({
      stores: [{ id: 'store-1', name: 'Ombor', attributes: {} }],
    });
    const res = await service.listTargets(ACCOUNT);
    expect(res.defaultStoreId).toBeNull();
    expect(res.brakStoreId).toBeNull();
  });

  it('BRAK ombori kaskadda bo‘lsa ham standart qilib TANLANMAYDI', async () => {
    const { service } = makeHarness({
      stores: [
        {
          id: 'store-brak',
          name: 'Brak',
          attributes: { [BRAK_STORE_KEY]: true, __posPriority: 1 },
        },
        { id: 'store-07', name: 'Ombor 07', attributes: { __posPriority: 2 } },
      ],
    });
    const res = await service.listTargets(ACCOUNT);
    expect(res.defaultStoreId).toBe('store-07');
  });
});

describe('listReceipts — manba chek qidiruvi', () => {
  it('faqat ASL (mirror emas), o‘tkazilgan cheklar', async () => {
    const { service, client } = makeHarness({ receipts: [] });
    await service.listReceipts(ACCOUNT, { q: 'CH-1' });
    const where = (
      client.retailSale.findMany.mock.calls[0]?.[0] as { where: Record<string, unknown> }
    ).where;
    expect(where).toMatchObject({
      accountId: ACCOUNT,
      deletedAt: null,
      refundedFromId: null,
      state: { in: ['posted', 'refunded'] },
    });
  });

  it('mijoz bo‘yicha filtr o‘tadi', async () => {
    const { service, client } = makeHarness({ receipts: [] });
    await service.listReceipts(ACCOUNT, { agentId: AGENT });
    const where = (
      client.retailSale.findMany.mock.calls[0]?.[0] as { where: Record<string, unknown> }
    ).where;
    expect(where.agentId).toBe(AGENT);
  });
});
