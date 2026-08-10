import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { StoreAddressService } from './store-address.service.js';

/**
 * EGASINING QARORI (2026-08-11, Q1) — «chiqarib qo'shish» QOLDIQ bor bo'lsa
 * BLOKLANADI.
 *
 * O'lchangan muammo: `unassignProduct` bog'lanishni (`ProductCellLink` +
 * `__yacheyka`) uzardi, lekin `StockByCell` qatorini QOLDIRARDI. Natijada ikki
 * sirt bir-biriga zid gapirardi — `getCellStock` tovarni ko'rsatardi,
 * `getCellProducts` esa «yo'q» derdi — va keyingi «Umumiy sanash»
 * (`mode:'add'`) FANTOM qoldiq ustiga qo'shardi (26 + 100 = 126, aslida
 * yacheyka bo'sh deb hisoblangan edi).
 *
 * Egasining qarori: **hujjatsiz stok o'zgarmasin**. Avto-«Списание» YOZILMAYDI
 * (u hujjat yaratardi-yu, omborchi so'ramagan chiqim bo'lardi) — o'rniga amal
 * RAD ETILADI va foydalanuvchiga aniq yo'l ko'rsatiladi: «avval sanab 0 ga
 * tushiring yoki boshqa yacheykaga ko'chiring».
 *
 * Qulf SERVERDA — yagona haqiqat manbai: DELETE endpointini har qanday
 * chaqiruvchi (Scan oynasi, «Ko'chirish», kelajakdagi skript) shu qoidaga
 * bo'ysunadi.
 */

const PROD = '11111111-1111-1111-1111-111111111111';

interface FakeOpts {
  /** `StockByCell` qatori (qty > 0 bo'lsa qulf ishlashi kerak). */
  stock?: { qty: string; assortmentKind?: string } | null;
}

function makeService({ stock = null }: FakeOpts = {}) {
  const product = {
    id: PROD,
    name: 'Tovar 1',
    attributes: { __yacheyka: '01-01-01-01', __polka: 'A' } as Record<string, unknown>,
  };
  const client = {
    store: { findFirst: vi.fn(async () => ({ id: 'store-1' })) },
    storeCell: {
      findFirst: vi.fn(async () => ({ id: 'cell-A', name: '01-01-01-01', zone: null })),
    },
    product: {
      findFirst: vi.fn(async () => product),
      update: vi.fn(async ({ data }: { data: { attributes: Record<string, unknown> } }) => {
        product.attributes = data.attributes;
        return product;
      }),
    },
    productCellLink: {
      deleteMany: vi.fn(async () => ({ count: 1 })),
    },
    stockByCell: {
      findFirst: vi.fn(async ({ where }: { where: { assortmentKind?: string } }) =>
        // Kind filtri qulfning bir qismi — fake uni HURMAT qiladi, aks holda
        // «faqat product qatori bloklaydi» tasdig'i vakuum bo'lardi.
        stock &&
        (!where.assortmentKind || where.assortmentKind === (stock.assortmentKind ?? 'product'))
          ? { qty: stock.qty }
          : null,
      ),
    },
  };
  const svc = new StoreAddressService({ client } as never, {} as never, {} as never);
  return { svc, client, product };
}

describe('unassignProduct — qoldiq bor yacheykadan chiqarish RAD ETILADI (Q1)', () => {
  it('qoldiq > 0 ⇒ ConflictException va HECH NARSA o`chirilmaydi', async () => {
    const { svc, client, product } = makeService({ stock: { qty: '26' } });

    await expect(svc.unassignProduct('acc-1', 'store-1', 'cell-A', PROD)).rejects.toBeInstanceOf(
      ConflictException,
    );

    // Yagona muhim invariant: bog'lanish TEGILMAGAN qoladi — aks holda
    // «rad etildi» degan javob bilan birga fantom qoldiq baribir tug'ilardi.
    expect(client.productCellLink.deleteMany).not.toHaveBeenCalled();
    expect(client.product.update).not.toHaveBeenCalled();
    expect(product.attributes.__yacheyka).toBe('01-01-01-01');
  });

  it('xato MASHINA o`qiy oladigan sabab + qoldiq miqdorini olib yuradi', async () => {
    const { svc } = makeService({ stock: { qty: '26' } });

    const err = await svc
      .unassignProduct('acc-1', 'store-1', 'cell-A', PROD)
      .then(() => null)
      .catch((e: unknown) => e as ConflictException);

    expect(err).toBeInstanceOf(ConflictException);
    const body = err?.getResponse() as {
      code?: string;
      qty?: string;
      cell?: string;
      productId?: string;
      message?: string;
    };
    expect(body.code).toBe('CELL_STOCK_NOT_EMPTY');
    expect(body.qty).toBe('26');
    expect(body.cell).toBe('01-01-01-01');
    expect(body.productId).toBe(PROD);
    // Odam o'qiydigan matn ham YO'L KO'RSATADI (sanang / ko'chiring).
    expect(body.message).toContain('26');
    expect(body.message).toMatch(/[Ss]ana/);
  });

  it('qoldiq YO`Q (qator umuman yo`q) ⇒ avvalgidek chiqaradi', async () => {
    const { svc, client, product } = makeService({ stock: null });

    const res = await svc.unassignProduct('acc-1', 'store-1', 'cell-A', PROD);

    expect(res).toEqual({ unassigned: true });
    expect(client.productCellLink.deleteMany).toHaveBeenCalledTimes(1);
    expect(product.attributes.__yacheyka).toBeUndefined();
  });

  it('qoldiq 0 (qator bor, lekin bo`sh) ⇒ chiqaradi — `qty>0` filtri ishlaydi', async () => {
    // `qty: { gt: 0 }` filtri tufayli nol qator umuman qaytmaydi: fake
    // findFirst ni `stock: null` bilan modellashtiradi. Bu yerda esa qulf
    // SO'ROVINING shakli tasdiqlanadi — filtrsiz so'rov nol qatorni ham
    // «qoldiq bor» deb o'qib, bo'shatilgan yacheykani abadiy qulflab qo'yardi.
    const { svc, client } = makeService({ stock: null });

    await svc.unassignProduct('acc-1', 'store-1', 'cell-A', PROD);

    const where = client.stockByCell.findFirst.mock.calls[0]?.[0]?.where as {
      qty?: { gt: number };
      cellId?: string;
      assortmentId?: string;
      assortmentKind?: string;
    };
    expect(where.qty).toEqual({ gt: 0 });
    expect(where.cellId).toBe('cell-A');
    expect(where.assortmentId).toBe(PROD);
    // Faqat `product` turi: «Sanash» (davo yo'li) aynan shu turga yozadi, ya'ni
    // boshqa turdagi qatorga qulf qo'yilsa foydalanuvchi chiqa olmaydigan
    // tuzoqqa tushardi.
    expect(where.assortmentKind).toBe('product');
  });
});
