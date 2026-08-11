import { describe, expect, it, vi } from 'vitest';
import { CellStockNotEmptyException } from '../shared/cell-stock-guard.js';
import { ProductCellMoveService } from './product-cell-move.service.js';

/**
 * REVIEW TOPILMASI (2026-08-11, Critical) — qulf CHETLAB O'TILARDI.
 *
 * Q1 qulfi dastlab faqat `StoreAddressService.unassignProduct` ichiga
 * qo'yilgan va «yagona haqiqat manbai» deb e'lon qilingan edi. Aslida
 * `ProductCellLink` ni o'chiruvchi IKKINCHI yo'l bor:
 *
 *   `POST /products/:id/cell-rebind` → `ProductCellMoveService.rebind()`
 *   (ruxsat `product.update` — ombor menejerida ham, adminda ham BOR)
 *
 * U eski uy-yacheykaning link qatorini QULFSIZ o'chirardi, docblock'ida esa
 * «No stock moves … can never touch the ledger» deb yozilgani uchun ko'zga
 * tashlanmasdi. Bu AYNAN Q1 to'sayotgan fantom-klass: bog'lanish uziladi,
 * `StockByCell` qatori qoladi, keyingi «Umumiy sanash» uning ustiga qo'shadi.
 *
 * NEGA butun amal rad etiladi (faqat link o'chirish emas): `rebind`
 * `__yacheyka`/`__polka` atributlarini ham ko'chiradi, ular esa
 * `getCellProducts` / `getCellStock` / `getAddressStorage` uchun bog'lanishning
 * IKKINCHI manbai (nom bo'yicha moslash). Faqat linkni saqlab, yorliqni
 * ko'chirish xuddi shu nomuvofiqlikni tug'dirardi.
 *
 * `rebind` KO'CHIRISH ZANJIRINING bir qismi EMAS — buni kod isbotlaydi:
 * `apps/web/src/components/products/cell-move-modal.tsx` `rebind` rejimini
 * FAQAT `isBinding && !cellId` (yechilmagan yorliq) qatori uchun tanlaydi va
 * `submit()` bitta POST yuboradi; qoldiqni ko'chiradigan yo'llar — alohida
 * `cell-move` / `cell-place` rejimlari.
 */

const PROD = '11111111-1111-1111-1111-111111111111';
const OLD_CELL = '22222222-2222-2222-2222-222222222222';
const NEW_CELL = '33333333-3333-3333-3333-333333333333';

interface FakeOpts {
  /** Eski uy-yacheykada shu mahsulotning qoldig'i. */
  oldCellQty?: string | null;
}

function makeService({ oldCellQty = null }: FakeOpts = {}) {
  const product = {
    id: PROD,
    attributes: { __yacheyka: 'ESKI-1', __polka: 'A' } as Record<string, unknown>,
  };
  const cells: Record<string, { id: string; name: string; storeId: string }> = {
    [OLD_CELL]: { id: OLD_CELL, name: 'ESKI-1', storeId: 'store-1' },
    [NEW_CELL]: { id: NEW_CELL, name: 'YANGI-2', storeId: 'store-1' },
  };

  const tx = {
    product: {
      findFirst: vi.fn(async () => product),
      update: vi.fn(async ({ data }: { data: { attributes: Record<string, unknown> } }) => {
        product.attributes = data.attributes;
        return product;
      }),
    },
    storeCell: {
      findFirst: vi.fn(async ({ where }: { where: { id?: string; name?: string } }) => {
        if (where.id) return { ...cells[where.id], zone: null };
        const hit = Object.values(cells).find((c) => c.name === where.name);
        return hit ? { ...hit, zone: null } : null;
      }),
    },
    productCellLink: {
      deleteMany: vi.fn(async () => ({ count: 1 })),
      upsert: vi.fn(async () => ({})),
    },
    stockByCell: {
      findFirst: vi.fn(async ({ where }: { where: { cellId: string } }) =>
        where.cellId === OLD_CELL && oldCellQty !== null ? { qty: oldCellQty } : null,
      ),
    },
  };

  const client = {
    ...tx,
    // Tranzaksiya bir xil fake ustida ishlaydi — chaqiruvlar sanog'i bitta
    // joyda yig'iladi, ya'ni «o'chirilmadi» tasdig'i tranzaksiya ichini ham
    // qamrab oladi.
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };

  const svc = new ProductCellMoveService({ client } as never, {} as never);
  return { svc, tx, client, product };
}

describe('rebind — eski yacheykada qoldiq bo`lsa bog`lanish UZILMAYDI (Q1 Critical)', () => {
  it('eski uy-yacheykada qoldiq bor ⇒ 409 va HECH NARSA o`zgarmaydi', async () => {
    const { svc, tx, product } = makeService({ oldCellQty: '26' });

    await expect(
      svc.rebind('acc-1', 'user-1', PROD, { toCellId: NEW_CELL }),
    ).rejects.toBeInstanceOf(CellStockNotEmptyException);

    // Link O'CHIRILMADI — fantom tug'ilmaydi.
    expect(tx.productCellLink.deleteMany).not.toHaveBeenCalled();
    // Yorliq ham ko'chmadi: `__yacheyka` bog'lanishning IKKINCHI manbai.
    expect(tx.product.update).not.toHaveBeenCalled();
    expect(product.attributes.__yacheyka).toBe('ESKI-1');
    // Yangi link ham yozilmadi (yarim bajarilgan holat qolmaydi).
    expect(tx.productCellLink.upsert).not.toHaveBeenCalled();
  });

  it('xato Q1 ning AYNAN o`sha kodi/payloadini beradi (FE bitta shoxni biladi)', async () => {
    const { svc } = makeService({ oldCellQty: '26' });

    const err = await svc
      .rebind('acc-1', 'user-1', PROD, { toCellId: NEW_CELL })
      .then(() => null)
      .catch((e: unknown) => e as CellStockNotEmptyException);

    const body = err?.getResponse() as { code?: string; qty?: string; cell?: string };
    expect(body.code).toBe('CELL_STOCK_NOT_EMPTY');
    expect(body.qty).toBe('26');
    expect(body.cell).toBe('ESKI-1');
  });

  it('qoldiq YO`Q ⇒ mavjud xulq BUZILMAYDI (yorliq ko`chadi, link almashadi)', async () => {
    const { svc, tx, product } = makeService({ oldCellQty: null });

    const res = await svc.rebind('acc-1', 'user-1', PROD, { toCellId: NEW_CELL });

    expect(res).toEqual({ ok: true, cellName: 'YANGI-2', polka: '2' });
    expect(product.attributes.__yacheyka).toBe('YANGI-2');
    expect(tx.productCellLink.deleteMany).toHaveBeenCalledTimes(1);
    expect(tx.productCellLink.upsert).toHaveBeenCalledTimes(1);
  });

  it('qulf + o`chirish BITTA serializable tranzaksiyada (poyga oynasi yopiq)', async () => {
    const { svc, client } = makeService({ oldCellQty: null });

    await svc.rebind('acc-1', 'user-1', PROD, { toCellId: NEW_CELL });

    expect(client.$transaction).toHaveBeenCalledTimes(1);
    const opts = client.$transaction.mock.calls[0]?.[1] as { isolationLevel?: string };
    expect(opts?.isolationLevel).toBe('Serializable');
  });
});
