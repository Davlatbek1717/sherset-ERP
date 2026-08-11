import type { Prisma } from '@moysklad/db';
import { ConflictException } from '@nestjs/common';

/**
 * «Yacheykada qoldiq bor bo'lsa bog'lanish UZILMAYDI» — egasining qarori
 * (2026-08-11 · Q1), BARCHA yo'llar uchun bitta joyda.
 *
 * Muammo (o'lchangan): mahsulot ↔ yacheyka bog'lanishini uzuvchi kod yo'llari
 * `StockByCell` qatoriga TEGMAYDI. Bog'lanish uzilib, qoldiq qatori qolsa ikki
 * sirt bir-biriga zid gapiradi — `getCellStock` tovarni ko'rsatadi,
 * `getCellProducts` esa «yo'q» deydi — va keyingi «Umumiy sanash»
 * (`setCellStock` `mode:'add'`) FANTOM qoldiq USTIGA qo'shadi (26 + 100 = 126,
 * holbuki yacheyka bo'sh deb hisoblangan edi).
 *
 * Egasining qarori: **hujjatsiz stok o'zgarmaydi** ⇒ avto-«Списание»
 * YOZILMAYDI, amal RAD ETILADI (409) va foydalanuvchiga aniq yo'l ko'rsatiladi.
 *
 * ⚠️ NEGA ALOHIDA FAYL. Birinchi urinishda qulf faqat
 * `StoreAddressService.unassignProduct` ichiga qo'yilgan va «yagona haqiqat
 * manbai» deb e'lon qilingan edi — bu XATO edi: bog'lanishni o'chiruvchi
 * IKKINCHI yo'l bor (`ProductCellMoveService.rebind`, marshrut
 * `POST /products/:id/cell-rebind`, ruxsat `product.update`), u
 * `ProductCellLink` ni qulfsiz o'chirardi va docblock'ida «no stock moves» deb
 * yozilgani uchun ko'zga tashlanmasdi. Qoida endi shu yerda yashaydi; yangi
 * yo'l qo'shgan har kim shu funksiyani chaqirishi shart.
 *
 * ⚠️ QAMROV CHEGARASI — VARIANT qoldig'i ATAYLAB tekshirilmaydi (oshkora
 * qoldiq xavf). `assortmentKind` filtri `'product'` bilan cheklangan, chunki
 * DAVO YO'LI ham shunday: `setCellStock` mahsulotni `product` jadvalidan
 * qidiradi va qatorni `assortmentKind: 'product'` bilan yozadi
 * (`store-address.service.ts`), ya'ni VARIANT qatorini «Sanash» bilan 0 ga
 * tushirib bo'lmaydi. Variantni ham qamrasak, foydalanuvchi qulfni yecha
 * olmaydigan tuzoqqa tushardi. Amaliy oqibat cheklangan: fantom-qo'shish
 * bug'ining o'zi ham product-qatorига bog'liq (`add` rejimi variant qatorini
 * o'qimaydi), ya'ni variant qoldig'i qolganda faqat KO'RINISH nomuvofiqligi
 * saqlanadi (`getCellStock` variantni ko'rsatadi), noto'g'ri hisob emas.
 * To'liq yechim — «Sanash»ni variantga ochish (alohida ish).
 */
export const CELL_STOCK_NOT_EMPTY_CODE = 'CELL_STOCK_NOT_EMPTY';

export class CellStockNotEmptyException extends ConflictException {
  constructor(args: { cell: string; productId: string; qty: string }) {
    super({
      statusCode: 409,
      // Mashina o'qiydigan sabab — FE bu kod bo'yicha aniq bannerni chizadi,
      // xom `message` matniga tayanmasdan.
      code: CELL_STOCK_NOT_EMPTY_CODE,
      qty: args.qty,
      cell: args.cell,
      productId: args.productId,
      message: `«${args.cell}» yacheykasida bu mahsulotdan ${args.qty} dona qoldiq bor — avval «Sanash» bilan 0 ga tushiring yoki boshqa yacheykaga ko'chiring, keyin chiqaring`,
    });
  }
}

/**
 * Yacheykada shu MAHSULOTNING hisoblangan qoldig'i bo'lsa — {@link
 * CellStockNotEmptyException}. Qoldiq yo'q bo'lsa jimgina qaytadi.
 *
 * `Prisma.TransactionClient` ataylab: chaqiruvchi qulfni o'chirish bilan BIR
 * tranzaksiyada bajarishi shart (aks holda tekshiruv bilan o'chirish orasida
 * boshqa sessiya sanoq yozib ulgurardi). Chaqiruvchilar
 * `{ isolationLevel: 'Serializable' }` ishlatadi — `product-cell-move.service`
 * dagi bir xil naqsh.
 *
 * `qty: { not: 0 }` — `gt: 0` EMAS: MANFIY qator ham fantom (u hech bir sirtda
 * ko'rinmaydi, chunki hamma o'quvchi `qty > 0` bilan filtrlaydi, lekin `add`
 * rejimidagi keyingi sanoq undan boshlab qo'shadi ⇒ −5 + 100 = 95). Davo yo'li
 * manfiy qator uchun ham ishlaydi: `set` rejimida 0 kiritilsa delta musbat
 * bo'lib qatorni nolga chiqaradi.
 */
export async function assertCellStockEmpty(
  tx: Prisma.TransactionClient,
  args: {
    accountId: string;
    storeId: string;
    cellId: string;
    cellName: string;
    productId: string;
  },
): Promise<void> {
  const row = await tx.stockByCell.findFirst({
    where: {
      accountId: args.accountId,
      storeId: args.storeId,
      cellId: args.cellId,
      assortmentKind: 'product',
      assortmentId: args.productId,
      qty: { not: 0 },
    },
    select: { qty: true },
  });
  if (!row) return;
  throw new CellStockNotEmptyException({
    cell: args.cellName,
    productId: args.productId,
    qty: String(row.qty),
  });
}
