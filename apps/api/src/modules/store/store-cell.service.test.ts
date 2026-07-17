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
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      ...(overrides.product ?? {}),
    },
    productLocation: {
      findMany: vi.fn().mockResolvedValue([]),
      ...(overrides.productLocation ?? {}),
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

  it('dublikat kod — BadRequest', async () => {
    const prisma = makePrisma({
      storeCell: { findFirst: vi.fn().mockResolvedValue({ id: CELL }) },
    });
    const svc = new StoreCellService(prisma);
    await expect(svc.createOne(ACC, STORE, { code: '04-03-01-05' })).rejects.toThrow(
      BadRequestException,
    );
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
});
