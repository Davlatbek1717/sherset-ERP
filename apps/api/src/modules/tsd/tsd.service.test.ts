import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { TsdService } from './tsd.service.js';

/**
 * TSD skan endpointi — wiring (G-reja G5).
 *
 * Eng muhim qulf: javobda NARX bo'lmasligi. Test buni javob shaklidan emas,
 * SO'ROVDAN ham tekshiradi — `select` oq ro'yxati ishlatilganini.
 */

const PRODUCT = {
  id: 'p1',
  name: 'Kabel 2x1.5',
  code: 'K-15',
  article: 'ART-15',
  barcodes: ['4780001'],
  uom: 'm',
  archived: false,
  attributes: { __yacheyka: '02-03-01-04' },
};

function makePrisma(over: { products?: unknown[] } = {}) {
  const findMany = vi.fn().mockResolvedValue(over.products ?? [PRODUCT]);
  const client = {
    product: { findMany },
    stock: {
      findMany: vi.fn().mockResolvedValue([{ assortmentId: 'p1', qty: 180 }]),
    },
    stockByCell: {
      findMany: vi.fn().mockResolvedValue([
        {
          assortmentId: 'p1',
          storeId: 's1',
          cellId: 'c1',
          qty: { toString: () => '100' },
          store: { name: 'Ombor 02' },
          cell: { name: '02-03-01-04' },
        },
      ]),
    },
  };
  return { prisma: { client } as never, findMany, client };
}

describe('TsdService.scan — narxsizlik', () => {
  it('tovar so`rovi `select` OQ RO`YXATI bilan ketadi (narx ustunlari so`ralmaydi)', async () => {
    const { prisma, findMany } = makePrisma();
    await new TsdService(prisma).scan('acc-1', { code: '4780001' });
    const args = findMany.mock.calls[0]?.[0] as { select: Record<string, unknown> };
    expect(args.select).toBeDefined();
    expect(Object.keys(args.select).filter((k) => /price|cost/i.test(k))).toEqual([]);
  });

  it('javobda narx-nomli kalit yo`q', async () => {
    const { prisma } = makePrisma();
    const out = await new TsdService(prisma).scan('acc-1', { code: '4780001' });
    expect(JSON.stringify(out)).not.toMatch(/price|Price/);
  });
});

describe('TsdService.scan — natija shakli', () => {
  it('tovar topilganda yacheyka kesimi va jami qoldiq qaytadi', async () => {
    const { prisma } = makePrisma();
    const out = await new TsdService(prisma).scan('acc-1', { code: '4780001' });
    expect(out.kind).toBe('product');
    expect(out.products[0]).toMatchObject({
      id: 'p1',
      homeCell: '02-03-01-04',
      totalQty: '180',
    });
    expect(out.products[0]?.cells[0]).toMatchObject({
      storeName: 'Ombor 02',
      cellName: '02-03-01-04',
      qty: '100',
    });
  });

  it('topilmasa `none`', async () => {
    const { prisma } = makePrisma({ products: [] });
    const out = await new TsdService(prisma).scan('acc-1', { code: 'yo`q' });
    expect(out.kind).toBe('none');
  });

  it('yacheyka kodida tovar UMUMAN qidirilmaydi', async () => {
    const { prisma, findMany } = makePrisma();
    const out = await new TsdService(prisma).scan('acc-1', { code: '01-02-03-04' });
    expect(out.kind).toBe('cell');
    expect(findMany).not.toHaveBeenCalled();
  });

  it('bo`lak kodi (K-reja) — `supported: false`, tovar tanlovi OCHILMAYDI', async () => {
    const { prisma, findMany } = makePrisma();
    const out = await new TsdService(prisma).scan('acc-1', { code: 'BLK-000123' });
    expect(out).toMatchObject({ kind: 'piece', piece: { supported: false } });
    expect(findMany).not.toHaveBeenCalled();
  });

  it('kodsiz so`rov 400', async () => {
    const { prisma } = makePrisma();
    await expect(new TsdService(prisma).scan('acc-1', {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('tenant bo`yicha filtrlanadi', async () => {
    const { prisma, findMany } = makePrisma();
    await new TsdService(prisma).scan('acc-9', { code: '4780001' });
    const args = findMany.mock.calls[0]?.[0] as { where: Record<string, unknown> };
    expect(args.where).toMatchObject({ accountId: 'acc-9', deletedAt: null });
  });
});
