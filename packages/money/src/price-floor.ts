/**
 * NARX POLI — «minimal narx» qoidasi (P12, egasining qarori 2026-08-11/12).
 *
 * Egasining formulasi: kassir tovarni **sotib olingan narxdan past** sotolmasin.
 * Bu ogohlantirish emas — QULF: ekranda «Saqlash» bloklanadi VA server chekni
 * rad etadi (ekran qulfi himoya emas, haqiqiy chegara serverda).
 *
 * NEGA `@moysklad/money` da: qoidani POS ekrani ham, `retail-sale.post()` ham
 * o'qiydi. Ikki nusxa yozilsa ular jimgina ayrilardi va ekran «bo'ladi» deb
 * turgan chekni server rad etardi (yoki teskarisi — teshik).
 *
 * Ikki shartnoma bu yerda tugunlangan:
 *
 *  1. **NULL ≠ 0.** Tan narx NULL = «hech qachon yig'ilmagan» ⇒ POL YO'Q.
 *     `?? 0n` yozish prodda 996 ta tovarni (o'lchangan) pol=0 bilan ochib
 *     berardi — `retail-cost-freeze-null-contract` xotirasidagi bug-klass.
 *
 *  2. **Pol = min(tan, karta chakana narxi).** Prodda 46 tovarda karta narxining
 *     o'zi tan narxdan past (import xatosi). Sof «pol = tan» ularni savdodan
 *     chiqarardi; egasi karta narxida sotishga ruxsat berdi (2026-08-12 qarori),
 *     undan pastga esa baribir yo'q.
 */

import { computePositionTotal, scaleMinorByQty } from './position.js';

/**
 * Bitta tovarning narx poli (birlik uchun, tiyinda). `null` = pol yo'q —
 * chegara qo'yishga ma'lumot yetarli emas, taxmin qilinmaydi.
 */
export function priceFloorMinor(args: {
  /** `Product.buyPrice` — tan narx. NULL = yig'ilmagan. */
  costMinor: bigint | null;
  /** Kartaning chakana («Розничная цена») qavati. NULL = narx yo'q. */
  basePriceMinor: bigint | null;
}): bigint | null {
  const { costMinor, basePriceMinor } = args;
  if (costMinor == null) return null;
  if (basePriceMinor == null) return costMinor;
  return basePriceMinor < costMinor ? basePriceMinor : costMinor;
}

export interface LineFloorInput {
  /** Miqdor — o'nlik SATR (scale 6): 1.5 kg ham polga bo'ysunadi. */
  quantity: string;
  /** Kassir kiritgan birlik narxi (chegirmagacha). */
  priceMinor: bigint;
  /** Chek/savat chegirmasi foizi — satr ("25"). */
  discount: string;
  /** `priceFloorMinor` natijasi; `null` = pol yo'q ⇒ buzilish bo'lishi mumkin emas. */
  floorMinor: bigint | null;
}

export interface LineFloorBreach {
  /** Chegirmadan KEYINGI qator jamisi. */
  effectiveLineMinor: bigint;
  /** Shu miqdordagi pol jamisi. */
  floorLineMinor: bigint;
}

/**
 * Qator polni buzdimi. `null` = buzilmagan (yoki pol yo'q).
 *
 * Solishtiruv BIRLIK narxda emas, QATOR JAMISIda: chek chegirmasi qator jamiga
 * qo'llanadi va yaxlitlanadi (`computePositionTotal`), ya'ni birlik narxni
 * qayta hisoblash serverning saqlaydigan summasidan bir tiyinga ayrilardi.
 * Egasining qarori (2026-08-12): chegirma polni buzsa — chek RAD ETILADI
 * (chegirma jimgina qisilmaydi).
 */
export function lineFloorBreach(input: LineFloorInput): LineFloorBreach | null {
  if (input.floorMinor == null) return null;
  const effectiveLineMinor = computePositionTotal(
    {
      quantity: input.quantity,
      priceMinor: input.priceMinor.toString(),
      discount: input.discount,
      vat: null,
    },
    false,
    false,
  ).totalMinor;
  const floorLineMinor = scaleMinorByQty(input.floorMinor, input.quantity);
  if (effectiveLineMinor >= floorLineMinor) return null;
  return { effectiveLineMinor, floorLineMinor };
}
