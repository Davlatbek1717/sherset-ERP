/**
 * P12 — chek post qilinishidagi NARX SIYOSATI (egasining qarori 2026-08-12).
 *
 * Ikki qoida, ikkalasi ham SERVERDA (ekrandagi qulf himoya emas — POS chetlab
 * o'tilishi yoki eski qobiq ishlatilishi mumkin):
 *
 *   1. **0-narx TAQIQ.** Narxsiz qator bilan chek yopilmaydi. Prodda o'lchangan:
 *      4905 tovardan 488 tasida chakana narx umuman yo'q ⇒ savatga tushsa
 *      0 so'mlik qator bo'lardi va tovar tekin chiqib ketardi.
 *   2. **Narx POLI** (`@moysklad/money` → `priceFloorMinor`): chek chegirmasidan
 *      KEYINGI qator jamisi pol jamisidan past bo'lsa — rad. Pol = min(tan narx,
 *      karta chakana narxi); tan narx NULL bo'lsa pol YO'Q (NULL ≠ 0).
 *
 * Sof funksiya: qaror Prisma'siz sinaladi (`compute-positions.ts` naqshi), va
 * ekran bilan AYNI `@moysklad/money` funksiyalariga tayanadi — ikkinchi nusxa
 * yozilsa ekran «bo'ladi» degan chekni server rad etib turardi.
 */

import { lineFloorBreach, priceFloorMinor } from '@moysklad/money';

export interface PricePolicyLine {
  /** Xizmat qatorida `null` — bunda pol yo'q, lekin 0-narx taqiqi qoladi. */
  productId: string | null;
  productName?: string | null;
  /** O'nlik satr (scale 6). */
  quantity: string;
  /** Kassir kiritgan birlik narxi, chegirmagacha. */
  priceMinor: bigint;
  /** Chek/savat chegirmasi foizi ("25"), bo'lmasa "0". */
  discount: string;
}

/** `price-snapshot.ts` muzlatadigan ikki raqam — pol shulardan chiqadi. */
export interface PricePolicyFloors {
  costMinor: bigint | null;
  basePriceMinor: bigint | null;
}

const som = (minor: bigint) => `${(minor / 100n).toLocaleString('ru-RU')} so'm`;
const label = (l: PricePolicyLine) => `«${l.productName ?? l.productId ?? 'tovar'}»`;

/**
 * Chek post bo'lishiga to'sqinlik qiladigan BIRINCHI sabab (kassirga
 * ko'rsatiladigan matn), yoki `null` — siyosat buzilmagan.
 *
 * Birinchi buzilishda to'xtaydi: kassir kassada turibdi va bir vaqtda bitta
 * qatorni tuzatadi; ro'yxat berish uni chalg'itardi.
 */
export function checkSalePricePolicy(
  lines: ReadonlyArray<PricePolicyLine>,
  floorsByProduct: ReadonlyMap<string, PricePolicyFloors>,
): string | null {
  for (const l of lines) {
    const floors = l.productId ? floorsByProduct.get(l.productId) : undefined;
    const floorMinor = floors
      ? priceFloorMinor({ costMinor: floors.costMinor, basePriceMinor: floors.basePriceMinor })
      : null;

    // 1) 0-narx. Chegirmadan keyin ham 0 bo'lishi mumkin (100%) — shuning uchun
    // `lineFloorBreach` ning o'lchoviga tayanmasdan alohida tekshiriladi:
    // polsiz tovarda (996 ta) hech qanday pol-buzilish bo'lmaydi, lekin 0 narx
    // baribir taqiqlangan.
    const zeroFloor = lineFloorBreach({
      quantity: l.quantity,
      priceMinor: l.priceMinor,
      discount: l.discount,
      // Sun'iy «1 tiyin» poli: qator jamisi 0 bo'lsa buziladi, aks holda yo'q.
      floorMinor: 1n,
    });
    if (l.priceMinor <= 0n || zeroFloor != null) {
      return `${label(l)} narxsiz — 0 so'mlik qator bilan chek yopilmaydi. Tovar kartasiga narx kiriting yoki qatorda narx ko'rsating.`;
    }

    // 2) Narx poli.
    const breach = lineFloorBreach({
      quantity: l.quantity,
      priceMinor: l.priceMinor,
      discount: l.discount,
      floorMinor,
    });
    if (breach != null && floorMinor != null) {
      const discountNote = Number(l.discount) > 0 ? ' (chegirmadan keyin)' : '';
      return `${label(l)} minimal narxdan past${discountNote}: qator ${som(breach.effectiveLineMinor)}, minimal ${som(breach.floorLineMinor)} (birligi ${som(floorMinor)}). Chek qabul qilinmadi.`;
    }
  }
  return null;
}
