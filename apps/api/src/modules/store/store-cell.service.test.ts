import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { StoreCellService } from './store-cell.service.js';

/**
 * Adresli saqlash (2026-07-16 TZ) xulq-qulflari — service darajasida, mock
 * Prisma bilan (lokal DB'siz ham yugadi):
 *   §4  «Polka qo'shish» 3 input MAJBURIY;
 *   §5  prefiks NN-NN-NN + miqdor N → prefix-01…prefix-NN KETMA-KET kodlar
 *       (kanonik padded), mavjudlari tashlab ketiladi;
 *   §6  yaratilganlar ombor yacheykalari ro'yxatida chiqadi;
 *   §7  ro'yxat qatori: kod + polka yorlig'i (+ band/bo'sh hisob);
 *   §8  «+» biriktirish — tanlangan tovarlarning loc* manzili yacheyka
 *       segmentlariga o'rnatiladi (version ham oshadi);
 *   §10 akkaunt-bo'ylab qidiruv (tovar kartochkasidagi dropdown).
 */

const ACC = 'acc-1';
const STORE = '22222222-2222-2222-2222-222222222222';
const CELL = '33333333-3333-3333-3333-333333333333';
const P1 = '44444444-4444-4444-4444-444444444444';
const P2 = '55555555-5555-5555-5555-555555555555';

// Minimal prisma stub — faqat StoreCellService tegadigan metodlar.
function makePrisma(overrides: Record<string, Record<string, unknown>> = {}) {
  const client = {
    store: {
      findFirst: vi.fn().mockResolvedValue({ id: STORE, name: 'Щит цех', code: '04' }),
      ...(overrides.store ?? {}),
    },
    storeCell: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn().mockImplementation(({ data }: { data: unknown }) => ({
        id: CELL,
        ...(data as object),
      })),
      delete: vi.fn().mockResolvedValue({}),
      ...(overrides.storeCell ?? {}),
    },
    product: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      update: vi.fn().mockResolvedValue({}),
      ...(overrides.product ?? {}),
    },
    productLocation: {
      findMany: vi.fn().mockResolvedValue([]),
      ...(overrides.productLocation ?? {}),
    },
    stock: {
      findMany: vi.fn().mockResolvedValue([]),
      ...(overrides.stock ?? {}),
    },
  };
  return { client } as never;
}

describe("StoreCellService.generate («Polka qo'shish» §4–5)", () => {
  it('prefix + count → prefix-01…prefix-NN ketma-ket kanonik kodlar', async () => {
    const prisma = makePrisma({
      storeCell: { createMany: vi.fn().mockResolvedValue({ count: 3 }) },
    });
    const svc = new StoreCellService(prisma);
    const res = await svc.generate(ACC, STORE, { shelf: '032', prefix: '04-03-01', count: 3 });
    expect(res).toEqual({
      created: 3,
      skipped: 0,
      codes: ['04-03-01-01', '04-03-01-02', '04-03-01-03'],
    });
    const call = (prisma as { client: { storeCell: { createMany: ReturnType<typeof vi.fn> } } })
      .client.storeCell.createMany.mock.calls[0]?.[0];
    expect(call.skipDuplicates).toBe(true);
    expect(call.data).toEqual([
      { accountId: ACC, storeId: STORE, code: '04-03-01-01', shelf: '032' },
      { accountId: ACC, storeId: STORE, code: '04-03-01-02', shelf: '032' },
      { accountId: ACC, storeId: STORE, code: '04-03-01-03', shelf: '032' },
    ]);
  });

  it('unpadded prefiks kanoniklashadi (4-3-1 → 04-03-01-…)', async () => {
    const prisma = makePrisma({
      storeCell: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    });
    const svc = new StoreCellService(prisma);
    const res = await svc.generate(ACC, STORE, { shelf: 'A', prefix: '4-3-1', count: 1 });
    expect(res.codes).toEqual(['04-03-01-01']);
  });

  it('mavjud kodlar tashlab ketiladi — created/skipped hisobot', async () => {
    // 20 talab qilindi, DB faqat 15 tasini yaratdi (5 tasi allaqachon bor).
    const prisma = makePrisma({
      storeCell: { createMany: vi.fn().mockResolvedValue({ count: 15 }) },
    });
    const svc = new StoreCellService(prisma);
    const res = await svc.generate(ACC, STORE, { shelf: '032', prefix: '04-03-01', count: 20 });
    expect(res.created).toBe(15);
    expect(res.skipped).toBe(5);
    expect(res.codes).toHaveLength(20);
    expect(res.codes[19]).toBe('04-03-01-20');
  });

  it("3 inputning istalgani bo'sh bo'lsa — BadRequest (§4 hammasi majburiy)", async () => {
    const svc = new StoreCellService(makePrisma());
    await expect(svc.generate(ACC, STORE, { prefix: '04-03-01', count: 5 })).rejects.toThrow(
      BadRequestException,
    );
    await expect(
      svc.generate(ACC, STORE, { shelf: '', prefix: '04-03-01', count: 5 }),
    ).rejects.toThrow(BadRequestException);
    await expect(svc.generate(ACC, STORE, { shelf: '032', count: 5 })).rejects.toThrow(
      BadRequestException,
    );
    await expect(svc.generate(ACC, STORE, { shelf: '032', prefix: '04-03-01' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it("noto'g'ri prefiks (to'liq 4-qismli kod) va count>99 rad etiladi", async () => {
    const svc = new StoreCellService(makePrisma());
    await expect(
      svc.generate(ACC, STORE, { shelf: '032', prefix: '04-03-01-01', count: 5 }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      svc.generate(ACC, STORE, { shelf: '032', prefix: '04-03-01', count: 100 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('notanish ombor — 404 (tenant guard)', async () => {
    const prisma = makePrisma({ store: { findFirst: vi.fn().mockResolvedValue(null) } });
    const svc = new StoreCellService(prisma);
    await expect(
      svc.generate(ACC, STORE, { shelf: '032', prefix: '04-03-01', count: 5 }),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('StoreCellService.createOne («+ Yacheyka»)', () => {
  it('kodni kanoniklashtirib yaratadi', async () => {
    const prisma = makePrisma();
    const svc = new StoreCellService(prisma);
    const res = (await svc.createOne(ACC, STORE, { code: '4-3-1-5', shelf: '032' })) as {
      code: string;
      shelf: string | null;
    };
    expect(res.code).toBe('04-03-01-05');
    expect(res.shelf).toBe('032');
  });

  it('dublikat kod — SHU omborda — BadRequest, xabar «allaqachon mavjud»', async () => {
    const prisma = makePrisma({
      storeCell: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: CELL, storeId: STORE, store: { name: 'Щит цех' } }),
      },
    });
    const svc = new StoreCellService(prisma);
    await expect(svc.createOne(ACC, STORE, { code: '04-03-01-05' })).rejects.toThrow(
      BadRequestException,
    );
    await expect(svc.createOne(ACC, STORE, { code: '04-03-01-05' })).rejects.toThrow(
      /allaqachon mavjud/,
    );
  });

  // 2026-07-20 tuzatish: kod BUTUN AKKAUNT bo'yicha yagona (@@unique([accountId,
  // code])) — boshqa omborda ishlatilgan kod ham rad etiladi, va xabar aynan
  // qaysi omborda band ekanini aytadi (chalkashlik bo'lmasin: bu omborda
  // ko'rinmasa ham, kod band).
  it('dublikat kod — BOSHQA omborda — BadRequest, xabar ombor nomini aytadi', async () => {
    const OTHER_STORE = '99999999-9999-9999-9999-999999999999';
    const findFirst = vi
      .fn()
      .mockResolvedValue({ id: 'other-cell', storeId: OTHER_STORE, store: { name: 'Filial-2' } });
    const prisma = makePrisma({ storeCell: { findFirst } });
    const svc = new StoreCellService(prisma);
    await expect(svc.createOne(ACC, STORE, { code: '04-03-01-05' })).rejects.toThrow(/Filial-2/);
    // Dublikat tekshiruvi storeId'siz, akkaunt bo'yicha (Bug fix — avval
    // faqat shu ombor ichida tekshirilardi).
    expect(findFirst.mock.calls[0]?.[0]?.where).toEqual({ accountId: ACC, code: '04-03-01-05' });
  });

  it('notanish ombor — 404 (tenant guard)', async () => {
    const prisma = makePrisma({ store: { findFirst: vi.fn().mockResolvedValue(null) } });
    const svc = new StoreCellService(prisma);
    await expect(svc.createOne(ACC, STORE, { code: '04-03-01-05' })).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('StoreCellService.delete (🗑 amali)', () => {
  it("mavjud yacheykani o'chiradi (shu ombor + akkaunt bo'yicha scoped)", async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: CELL });
    const del = vi.fn().mockResolvedValue({});
    const prisma = makePrisma({ storeCell: { findFirst, delete: del } });
    const svc = new StoreCellService(prisma);
    const res = await svc.delete(ACC, STORE, CELL);
    expect(res).toEqual({ ok: true });
    expect(findFirst.mock.calls[0]?.[0]?.where).toEqual({
      id: CELL,
      accountId: ACC,
      storeId: STORE,
    });
    expect(del).toHaveBeenCalledWith({ where: { id: CELL } });
  });

  it('notanish/begona yacheyka — 404, delete chaqirilmaydi', async () => {
    const del = vi.fn();
    const prisma = makePrisma({
      storeCell: { findFirst: vi.fn().mockResolvedValue(null), delete: del },
    });
    const svc = new StoreCellService(prisma);
    await expect(svc.delete(ACC, STORE, CELL)).rejects.toThrow(NotFoundException);
    expect(del).not.toHaveBeenCalled();
  });
});

describe("StoreCellService.list (§6–7 — ro'yxat + band/bo'sh hisob)", () => {
  it('kod + polka + productCount (Product.loc* ∪ ProductLocation) qaytaradi', async () => {
    const prisma = makePrisma({
      storeCell: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'c1', code: '04-03-01-01', shelf: '032' },
          { id: 'c2', code: '04-03-01-02', shelf: '032' },
          { id: 'c3', code: '04-03-01-03', shelf: null },
        ]),
      },
      product: {
        // Asosiy manzili 04-03-01-01 bo'lgan bitta tovar.
        findMany: vi
          .fn()
          .mockResolvedValue([{ locSklad: 4, locPolka: 3, locQavat: 1, locYacheyka: 1 }]),
        updateMany: vi.fn(),
      },
      productLocation: {
        // Qo'shimcha manzil sifatida 04-03-01-03 (qavat/yacheyka NULL emas).
        findMany: vi.fn().mockResolvedValue([{ sklad: 4, polka: 3, qavat: 1, yacheyka: 3 }]),
      },
    });
    const svc = new StoreCellService(prisma);
    const res = await svc.list(ACC, STORE);
    expect(res.items).toEqual([
      { id: 'c1', code: '04-03-01-01', shelf: '032', productCount: 1 },
      { id: 'c2', code: '04-03-01-02', shelf: '032', productCount: 0 },
      { id: 'c3', code: '04-03-01-03', shelf: null, productCount: 1 },
    ]);
  });

  it("NULL segmentlar kanonik kodda «00» bo'ladi (formatBinLocation bilan mos)", async () => {
    const prisma = makePrisma({
      storeCell: {
        findMany: vi.fn().mockResolvedValue([{ id: 'c1', code: '04-00-00-00', shelf: null }]),
      },
      product: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ locSklad: 4, locPolka: null, locQavat: null, locYacheyka: null }]),
        updateMany: vi.fn(),
      },
    });
    const svc = new StoreCellService(prisma);
    const res = await svc.list(ACC, STORE);
    expect(res.items[0]?.productCount).toBe(1);
  });

  // 2026-07-20 unumdorlik tuzatishi: hali yacheyka yaratilmagan (bo'sh)
  // omborda butun-akkaunt Product/ProductLocation skaneri BEKORCHI —
  // occupancyMap umuman chaqirilmasligi kerak.
  it("bo'sh omborda (yacheyka yo'q) occupancy skaneri chaqirilmaydi", async () => {
    const productFindMany = vi.fn().mockResolvedValue([]);
    const locationFindMany = vi.fn().mockResolvedValue([]);
    const prisma = makePrisma({
      storeCell: { findMany: vi.fn().mockResolvedValue([]) },
      product: { findMany: productFindMany, updateMany: vi.fn() },
      productLocation: { findMany: locationFindMany },
    });
    const svc = new StoreCellService(prisma);
    const res = await svc.list(ACC, STORE);
    expect(res.items).toEqual([]);
    expect(productFindMany).not.toHaveBeenCalled();
    expect(locationFindMany).not.toHaveBeenCalled();
  });
});

describe('StoreCellService.assign (§8 — «+» tovar biriktirish)', () => {
  it("tanlangan tovarlarning loc* manzili yacheyka segmentlariga o'rnatiladi (version++)", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 2 });
    const prisma = makePrisma({
      storeCell: { findFirst: vi.fn().mockResolvedValue({ code: '04-03-01-07' }) },
      product: { findMany: vi.fn().mockResolvedValue([]), updateMany },
    });
    const svc = new StoreCellService(prisma);
    const res = await svc.assign(ACC, STORE, CELL, { productIds: [P1, P2] });
    expect(res).toEqual({ ok: true, updated: 2 });
    expect(updateMany).toHaveBeenCalledWith({
      where: { accountId: ACC, deletedAt: null, id: { in: [P1, P2] } },
      data: {
        locSklad: 4,
        locPolka: 3,
        locQavat: 1,
        locYacheyka: 7,
        version: { increment: 1 },
      },
    });
  });

  it('notanish yacheyka — 404', async () => {
    const svc = new StoreCellService(makePrisma());
    await expect(svc.assign(ACC, STORE, CELL, { productIds: [P1] })).rejects.toThrow(
      NotFoundException,
    );
  });

  it("bo'sh productIds — BadRequest", async () => {
    const prisma = makePrisma({
      storeCell: { findFirst: vi.fn().mockResolvedValue({ code: '04-03-01-07' }) },
    });
    const svc = new StoreCellService(prisma);
    await expect(svc.assign(ACC, STORE, CELL, { productIds: [] })).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('StoreCellService.resolveByCode (Skan 1-bosqich — yacheyka)', () => {
  it('tireli kodni kanoniklashtirib shu ombordagi yacheykani qaytaradi', async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: CELL, code: '04-03-01-05', shelf: '032' });
    const prisma = makePrisma({ storeCell: { findFirst } });
    const svc = new StoreCellService(prisma);
    const res = await svc.resolveByCode(ACC, STORE, { code: '4-3-1-5' });
    expect(res).toEqual({ id: CELL, code: '04-03-01-05', shelf: '032' });
    // Qidiruv kanonik padded kod bilan boradi.
    expect(findFirst.mock.calls[0]?.[0]?.where).toEqual({
      accountId: ACC,
      storeId: STORE,
      code: '04-03-01-05',
    });
  });

  it('8-raqamli label barcode (02170215) ham parse bo`ladi', async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: CELL, code: '02-17-02-15', shelf: null });
    const prisma = makePrisma({ storeCell: { findFirst } });
    const svc = new StoreCellService(prisma);
    await svc.resolveByCode(ACC, STORE, { code: '02170215' });
    expect(findFirst.mock.calls[0]?.[0]?.where.code).toBe('02-17-02-15');
  });

  it('buzuq kod — BadRequest', async () => {
    const svc = new StoreCellService(makePrisma());
    await expect(svc.resolveByCode(ACC, STORE, { code: 'salom' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it("bo'sh kod — BadRequest", async () => {
    const svc = new StoreCellService(makePrisma());
    await expect(svc.resolveByCode(ACC, STORE, { code: '   ' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('shu omborda bunday yacheyka yo`q — 404', async () => {
    const prisma = makePrisma({ storeCell: { findFirst: vi.fn().mockResolvedValue(null) } });
    const svc = new StoreCellService(prisma);
    await expect(svc.resolveByCode(ACC, STORE, { code: '04-03-01-99' })).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('StoreCellService.scanLink (Skan 2-bosqich — mahsulot biriktirish)', () => {
  const cellFound = {
    storeCell: { findFirst: vi.fn().mockResolvedValue({ code: '04-03-01-07' }) },
  };

  it("shtrix-kod bo'yicha mahsulotni topib asosiy loc* ni yacheykaga o'rnatadi", async () => {
    const update = vi.fn().mockResolvedValue({});
    const findFirst = vi.fn().mockResolvedValue({
      id: P1,
      name: 'Bolt M6',
      code: '00123',
      article: 'B-6',
      uom: 'dona',
      barcodes: ['4780000000001'],
      salePrices: [{ priceTypeId: 'default', value: '4500' }],
      locSklad: null,
      locPolka: null,
      locQavat: null,
      locYacheyka: null,
    });
    const prisma = makePrisma({
      ...cellFound,
      product: { findFirst, update, findMany: vi.fn(), updateMany: vi.fn() },
      stock: {
        findMany: vi.fn().mockResolvedValue([{ qty: { toFixed: () => '3.000000' } }]),
      },
    });
    const svc = new StoreCellService(prisma);
    const res = await svc.scanLink(ACC, STORE, CELL, { barcode: '4780000000001' });
    expect(res.ok).toBe(true);
    expect(res.alreadyLinked).toBe(false);
    // Sotuv narxi + jami qoldiq bor; TAN NARX (buyPrice) javobda YO'Q.
    expect(res.product).toEqual({
      id: P1,
      name: 'Bolt M6',
      code: '00123',
      article: 'B-6',
      uom: 'dona',
      barcode: '4780000000001',
      salePrice: '4500',
      totalQty: 3,
    });
    expect(res.product).not.toHaveProperty('buyPrice');
    expect(res.cell).toEqual({ code: '04-03-01-07' });
    // barcodes[] aniq token bo'yicha qidiruv.
    expect(findFirst.mock.calls[0]?.[0]?.where).toMatchObject({
      accountId: ACC,
      deletedAt: null,
      barcodes: { has: '4780000000001' },
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: P1 },
      data: {
        locSklad: 4,
        locPolka: 3,
        locQavat: 1,
        locYacheyka: 7,
        version: { increment: 1 },
      },
    });
  });

  it('mahsulot allaqachon shu yacheykada — alreadyLinked, qayta yozuv YO`Q', async () => {
    const update = vi.fn();
    const findFirst = vi.fn().mockResolvedValue({
      id: P1,
      name: 'Bolt M6',
      code: '00123',
      article: null,
      uom: 'dona',
      barcodes: ['4780000000001'],
      salePrices: [{ priceTypeId: 'default', value: '4500' }],
      locSklad: 4,
      locPolka: 3,
      locQavat: 1,
      locYacheyka: 7,
    });
    const prisma = makePrisma({
      ...cellFound,
      product: { findFirst, update, findMany: vi.fn(), updateMany: vi.fn() },
    });
    const svc = new StoreCellService(prisma);
    const res = await svc.scanLink(ACC, STORE, CELL, { barcode: '4780000000001' });
    expect(res.alreadyLinked).toBe(true);
    expect(update).not.toHaveBeenCalled();
  });

  it('shtrix-kod topilmadi — 404', async () => {
    const prisma = makePrisma({
      ...cellFound,
      product: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn() },
    });
    const svc = new StoreCellService(prisma);
    await expect(svc.scanLink(ACC, STORE, CELL, { barcode: '0000000000000' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('notanish yacheyka — 404', async () => {
    const prisma = makePrisma({ storeCell: { findFirst: vi.fn().mockResolvedValue(null) } });
    const svc = new StoreCellService(prisma);
    await expect(svc.scanLink(ACC, STORE, CELL, { barcode: '4780000000001' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it("bo'sh barcode — BadRequest", async () => {
    const prisma = makePrisma(cellFound);
    const svc = new StoreCellService(prisma);
    await expect(svc.scanLink(ACC, STORE, CELL, { barcode: '  ' })).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('StoreCellService.searchAll (§10 — dropdown qidiruvi)', () => {
  it("kod bo'yicha qidiradi va ombor nomini qo'shib qaytaradi", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: 'c1',
        code: '04-03-01-01',
        shelf: '032',
        storeId: STORE,
        store: { id: STORE, name: 'Щит цех' },
      },
    ]);
    const prisma = makePrisma({ storeCell: { findMany } });
    const svc = new StoreCellService(prisma);
    const res = await svc.searchAll(ACC, { search: '04-03' });
    expect(res.items).toEqual([
      { id: 'c1', code: '04-03-01-01', shelf: '032', storeId: STORE, storeName: 'Щит цех' },
    ]);
    const where = findMany.mock.calls[0]?.[0]?.where;
    expect(where.OR).toEqual([
      { code: { contains: '04-03', mode: 'insensitive' } },
      { shelf: { contains: '04-03', mode: 'insensitive' } },
    ]);
  });

  it("search bo'sh bo'lsa — barcha yacheykalarni ko'rsatadi, OR filtrsiz", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = makePrisma({ storeCell: { findMany } });
    const svc = new StoreCellService(prisma);
    await svc.searchAll(ACC, {});
    const where = findMany.mock.calls[0]?.[0]?.where;
    expect(where).toEqual({ accountId: ACC });
    expect(where.OR).toBeUndefined();
  });
});
