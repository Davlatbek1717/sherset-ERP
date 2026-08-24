/**
 * G3 (2026-08-24, omborchi-tsd-mijozlar rejasi) — vozvrat QABUL oqimining sof
 * yadrosi: SQL/Prisma yo'q, faqat arifmetika va tasnif. Testi
 * `sales-return-acceptance.test.ts`.
 *
 * ── Nima uchun alohida modul ────────────────────────────────────────────────
 * Qabul oqimi ikkita nozik hisobni yuritadi va ikkalasi ham pul/qoldiqqa
 * ta'sir qiladi:
 *
 * 1. **Chek bo'yicha qaytarish cap'i.** Bitta kassa chekidan qaytarilishi
 *    mumkin bo'lgan miqdor ikki YO'NALISHDAN kamayadi:
 *      · POS'ning o'z «mirror» qaytarishlari (`RetailSale.refundedFromId`) —
 *        pul kassada DARHOL qaytarilgan, tovar kaskad omboriga yacheykasiz
 *        kirgan (`retail-sale.service` refund yo'li);
 *      · shu chekka bog'langan avvalgi ВП hujjatlari (`SalesReturn.retailSaleId`).
 *    Ikkalasini hisobga olmaslik «bir tovarni ikki marta qaytarish» yo'lini
 *    ochib qo'yardi: mijoz kassada pulni olib, keyin omborda yana bir bor
 *    qaytim yozdirardi (G1 to'lovi bilan ikkinchi marta pul olardi).
 *    Cap TOVAR (productId) kesimida — POS'ning o'z `validateRefundPositions`
 *    guard'i ham aynan shu kesimda ishlaydi (chek pozitsiyalari birlashishi
 *    mumkin), ikki qatlam bir tilda gapiradi.
 *
 * 2. **Sifatli / BRAK ajratish.** Egasining qoidasi (reja 1-bo'lim): brak tovar
 *    sotuv qoldig'iga ARALASHMASLIGI kerak. Kassa kaskadi (F6) omborni
 *    `Store.attributes.__posPriority` bo'yicha tanlaydi, ya'ni «sotiladigan»
 *    birlik — OMBOR, yacheyka emas. Shuning uchun brak alohida OMBORGA
 *    (`__brakStore`) tushadi: u kaskadda qatnashmaydi ⇒ POS undan hech qachon
 *    ayirmaydi. Yacheyka-zona konventsiyasi (bir ombor ichida «BRAK» zonasi)
 *    bu shartni BAJARA OLMAYDI — ombor-darajadagi Stock baribir sotuvga ochiq
 *    qolardi va `assertAvailableCascade` yetarlilik tekshiruvi brak tovarni
 *    ham «bor» deb hisoblardi.
 *
 * Bitta ВП hujjati BITTA omborga tegishli (`assertCellsInStore` — barcha
 * yacheykalar hujjat ombori ichida bo'lishi shart), shuning uchun sifatli va
 * brak qatorlar bo'lgan qabul IKKI hujjat bo'lib yoziladi. Bu qasddan:
 * `SalesReturn.storeId` ni pozitsiya darajasiga tushirish qoldiq/tannarx
 * yozuvining butun zanjirini (post/unpost/cancel deltalari, cost-freeze)
 * qayta qurishni talab qilardi.
 */

import { addDecimals, compareDecimals, subtractDecimals } from '../shared/decimal.js';

/** Store.attributes ichidagi BRAK-ombor belgisi (F6 `__posPriority` / F7 `__unassignedSource` naqshi — migratsiya yo'q). */
export const BRAK_STORE_KEY = '__brakStore';

/** attributes JSON'idan BRAK belgisini o'qiydi — faqat aynan `true` hisoblanadi. */
export function readBrakStore(attributes: unknown): boolean {
  if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) return false;
  return (attributes as Record<string, unknown>)[BRAK_STORE_KEY] === true;
}

/** Chek pozitsiyasi (asl sotuv) — narx AYNAN shu yerdan olinadi, so'rovdan emas. */
export interface SoldLine {
  productId: string;
  quantity: string;
  priceMinor: string;
  discount: string;
}

/** Avval qaytarilgan miqdor (POS mirror yoki ВП) — tovar kesimida. */
export interface ReturnedLine {
  productId: string;
  quantity: string;
}

export interface ReturnableLine {
  productId: string;
  /** Chekda sotilgan jami (bir tovar bir necha qatorda bo'lsa — yig'indi). */
  soldQty: string;
  /** POS mirror qaytarishlari bo'yicha jami. */
  posRefundedQty: string;
  /** Shu chekka bog'langan ВП hujjatlari bo'yicha jami. */
  warehouseReturnedQty: string;
  /** soldQty − posRefundedQty − warehouseReturnedQty (hech qachon manfiy emas). */
  remainingQty: string;
  priceMinor: string;
  discount: string;
}

/**
 * Chek bo'yicha qaytarilishi mumkin bo'lgan qatorlar.
 *
 * Bir tovar chekda bir necha qatorda uchrasa YIG'ILADI (POS shunday ruxsat
 * beradi), narx/chegirma esa BIRINCHI qatordan olinadi — `priceRefundFromOriginal`
 * bilan bir naqsh: qaytarish narxi mijoz to'lagan narx, so'rovdagi narx EMAS.
 */
export function computeReturnableLines(
  sold: readonly SoldLine[],
  posRefunded: readonly ReturnedLine[],
  warehouseReturned: readonly ReturnedLine[],
): ReturnableLine[] {
  const order: string[] = [];
  const soldQty = new Map<string, string>();
  const price = new Map<string, { priceMinor: string; discount: string }>();
  for (const line of sold) {
    if (!soldQty.has(line.productId)) {
      order.push(line.productId);
      price.set(line.productId, { priceMinor: line.priceMinor, discount: line.discount });
    }
    soldQty.set(line.productId, addDecimals(soldQty.get(line.productId) ?? '0', line.quantity));
  }

  const sum = (rows: readonly ReturnedLine[]) => {
    const acc = new Map<string, string>();
    for (const r of rows) {
      acc.set(r.productId, addDecimals(acc.get(r.productId) ?? '0', r.quantity));
    }
    return acc;
  };
  const pos = sum(posRefunded);
  const wh = sum(warehouseReturned);

  return order.map((productId) => {
    const total = soldQty.get(productId) ?? '0';
    const posQty = pos.get(productId) ?? '0';
    const whQty = wh.get(productId) ?? '0';
    const remaining = subtractDecimals(subtractDecimals(total, posQty), whQty);
    const p = price.get(productId) ?? { priceMinor: '0', discount: '0' };
    return {
      productId,
      soldQty: total,
      posRefundedQty: posQty,
      warehouseReturnedQty: whQty,
      // Manfiy qoldiq — ma'lumot anomaliyasi (masalan chek tahriri); 0 ga
      // qisiladi, aks holda cap tekshiruvi «−2 gacha qaytarsa bo'ladi» degan
      // ma'nosiz javob berardi.
      remainingQty: compareDecimals(remaining, '0') > 0 ? remaining : '0',
      priceMinor: p.priceMinor,
      discount: p.discount,
    };
  });
}

/** Omborchi so'ragan qator: tovar × miqdor × yacheyka. */
export interface AcceptanceRequestLine {
  productId: string;
  quantity: string;
  cellId: string;
}

/** Yacheykaning qaysi omborga tegishli ekani va o'sha ombor BRAK'mi. */
export interface CellTarget {
  cellId: string;
  cellName: string;
  storeId: string;
  brak: boolean;
}

export interface PlannedPosition {
  productId: string;
  quantity: string;
  cellId: string;
  cellName: string;
  priceMinor: string;
  discount: string;
}

export interface PlannedDocument {
  storeId: string;
  brak: boolean;
  positions: PlannedPosition[];
}

export type AcceptancePlan =
  | { ok: true; documents: PlannedDocument[] }
  | { ok: false; error: string };

/**
 * So'ralgan qatorlarni tekshirib, ombor kesimida hujjatlarga bo'ladi.
 *
 * Tekshiruvlar (hammasi 400 ga aylanadi):
 *   · miqdor musbat bo'lishi;
 *   · yacheyka ma'lum bo'lishi (`targets` da);
 *   · TOVAR bo'yicha jami so'ralgan ≤ `remainingQty` (bir tovarni ikki
 *     yacheykaga bo'lib qabul qilish MUMKIN — jami cap bilan tekshiriladi);
 *   · chekda umuman yo'q tovar so'ralmasligi.
 *
 * Natija — ombor kesimida guruhlangan hujjat rejalari (sifatli / brak).
 * Tartib barqaror: birinchi uchragan ombor birinchi hujjat.
 */
export function planAcceptance(
  lines: readonly AcceptanceRequestLine[],
  returnable: readonly ReturnableLine[],
  targets: readonly CellTarget[],
): AcceptancePlan {
  if (lines.length === 0) return { ok: false, error: "Qabul qilinadigan qator yo'q" };

  const byProduct = new Map(returnable.map((r) => [r.productId, r]));
  const byCell = new Map(targets.map((c) => [c.cellId, c]));

  const wanted = new Map<string, string>();
  for (const line of lines) {
    if (compareDecimals(line.quantity, '0') <= 0) {
      return { ok: false, error: `Miqdor musbat bo'lishi kerak (${line.productId})` };
    }
    if (!byCell.has(line.cellId)) {
      return { ok: false, error: 'Tanlangan yacheyka topilmadi' };
    }
    if (!byProduct.has(line.productId)) {
      return { ok: false, error: 'Bu tovar chekda yo‘q' };
    }
    wanted.set(line.productId, addDecimals(wanted.get(line.productId) ?? '0', line.quantity));
  }

  for (const [productId, qty] of wanted) {
    const row = byProduct.get(productId);
    if (!row) continue;
    if (compareDecimals(qty, row.remainingQty) > 0) {
      return {
        ok: false,
        error: `Qaytarish mumkin: ${row.remainingQty} (sotilgan ${row.soldQty} − kassada qaytarilgan ${row.posRefundedQty} − omborda qabul qilingan ${row.warehouseReturnedQty}), so'ralmoqda ${qty}`,
      };
    }
  }

  const docs = new Map<string, PlannedDocument>();
  for (const line of lines) {
    const cell = byCell.get(line.cellId);
    const row = byProduct.get(line.productId);
    if (!cell || !row) continue; // yuqorida tekshirilgan — tip toraytirish uchun
    let doc = docs.get(cell.storeId);
    if (!doc) {
      doc = { storeId: cell.storeId, brak: cell.brak, positions: [] };
      docs.set(cell.storeId, doc);
    }
    doc.positions.push({
      productId: line.productId,
      quantity: line.quantity,
      cellId: cell.cellId,
      cellName: cell.cellName,
      priceMinor: row.priceMinor,
      discount: row.discount,
    });
  }

  return { ok: true, documents: [...docs.values()] };
}
