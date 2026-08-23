import { formatDecimalScaled, parseDecimalScaled } from '../shared/decimal.js';

/**
 * F6 (ombor restrukturizatsiyasi) — kassa KASKAD dvigateli. SOF modul:
 * Prisma yo'q, faqat hisob — adversarial testlar DB'siz yuradi.
 *
 * Egasining Q1 qarori (reja 4-bo'lim + ⚠️ aniqlashtiruv):
 *   · sotuvda tovar ENG YAQIN ombordan ayiriladi — 1-navbatda «Ombor 07»;
 *   · 07 dan TASHQARI omborlardan ayirish AVTOMATIK EMAS — bosh omborchi
 *     tasdig'i orqali (so'rov → avto-Move 07 ga → ayirish 07 dan). Tasdiq
 *     oqimining o'zi G4 fazasida (omborchi-tsd rejasi) quriladi; bu modul
 *     esa o'sha darvoza uchun TAQSIMOT REJASINI hisoblab beradi: yetishmagan
 *     qism qaysi omborlardan (prioritet tartibida, bo'linishi mumkin)
 *     olinishi kerakligini.
 *
 * Prioritet qayerda saqlanadi: `Store.attributes.__posPriority` (butun son,
 * kichigi birinchi). Ataylab JSON kalit, yangi ustun EMAS — bu boxda
 * migratsiya taqiqlangan (store.service'dagi `__cellInventory` bilan AYNI
 * naqsh, o'sha servis lift/merge qiladi). Prioritet qo'yilmagan ombor
 * kaskadda QATNASHMAYDI; hech bir omborda prioritet bo'lmasa kaskad
 * sozlanmagan hisoblanadi va kassa eski yo'l bilan (smena ombori) ishlaydi.
 */

/** Kaskadda qatnashuvchi ombor (prioritet ko'tarilgan holda). */
export interface CascadeStore {
  id: string;
  name: string;
  allowNegativeStock: boolean;
  posPriority: number;
}

/**
 * `Store.attributes` JSON'idan `__posPriority` ni o'qiydi. Faqat musbat
 * butun son ma'noli; qolgan har qanday qiymat (yo'q, null, satr, kasr,
 * 0 va manfiy) — «kaskadda emas» (null).
 */
export function readPosPriority(attributes: unknown): number | null {
  if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) return null;
  const v = (attributes as Record<string, unknown>).__posPriority;
  return typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : null;
}

/**
 * Kaskad tartibi: prioriteti bor omborlar, kichik raqam birinchi.
 * Teng prioritetda nom bo'yicha (barqaror, ko'zga ko'rinadigan tartib).
 */
export function orderCascadeStores(
  stores: ReadonlyArray<{
    id: string;
    name: string;
    allowNegativeStock: boolean;
    attributes: unknown;
  }>,
): CascadeStore[] {
  return stores
    .map((s) => ({
      id: s.id,
      name: s.name,
      allowNegativeStock: s.allowNegativeStock,
      posPriority: readPosPriority(s.attributes),
    }))
    .filter((s): s is CascadeStore => s.posPriority !== null)
    .sort((a, b) => a.posPriority - b.posPriority || a.name.localeCompare(b.name));
}

export interface CascadeRequest {
  assortmentId: string;
  /** Decimal(20,6) satr — chek pozitsiyasi miqdori. */
  requested: string;
}

/** Bitta ombordan bitta assortiment uchun ajratilgan miqdor. */
export interface CascadeAllocation {
  storeId: string;
  assortmentId: string;
  qty: string;
}

export interface CascadePlan {
  allocations: CascadeAllocation[];
  /** Kaskadning BARCHA omborlaridan keyin ham yetishmagan qism. */
  shortfalls: Array<{ assortmentId: string; requested: string; missing: string }>;
}

/**
 * Taqsimot: so'ralgan miqdorlar kaskad omborlaridan TARTIB bilan olinadi;
 * bir pozitsiya bir nechta omborga BO'LINISHI mumkin (qisman yetishmasa).
 * Bir assortiment bir necha qatorda kelsa — jamlab taqsimlanadi.
 *
 * `availableByStore`: storeId → (assortmentId → «доступно» Decimal-satr,
 * qty − reservedQty; manfiy bo'lishi mumkin — u holda bu ombordan 0 olinadi).
 * Hisob aynan micro-birlikda (BigInt) — kasr miqdorlar floatda suzmaydi.
 */
export function allocateAcrossStores(
  requests: ReadonlyArray<CascadeRequest>,
  availableByStore: ReadonlyMap<string, ReadonlyMap<string, string>>,
  storeOrder: ReadonlyArray<string>,
): CascadePlan {
  // Jamlash — assertAvailable bilan bir intizom (ikki 60 talik qator 100
  // talik qoldiqdan alohida-alohida o'tib ketmasin).
  const wanted = new Map<string, bigint>();
  for (const r of requests) {
    const m = parseDecimalScaled(r.requested);
    wanted.set(r.assortmentId, (wanted.get(r.assortmentId) ?? 0n) + m);
  }

  const allocations: CascadeAllocation[] = [];
  const shortfalls: CascadePlan['shortfalls'] = [];

  for (const [assortmentId, totalMicro] of wanted) {
    let remaining = totalMicro;
    if (remaining <= 0n) continue;
    for (const storeId of storeOrder) {
      if (remaining <= 0n) break;
      const availStr = availableByStore.get(storeId)?.get(assortmentId);
      const avail = availStr === undefined ? 0n : parseDecimalScaled(availStr);
      if (avail <= 0n) continue;
      const take = avail < remaining ? avail : remaining;
      allocations.push({ storeId, assortmentId, qty: formatDecimalScaled(take) });
      remaining -= take;
    }
    if (remaining > 0n) {
      shortfalls.push({
        assortmentId,
        requested: formatDecimalScaled(totalMicro),
        missing: formatDecimalScaled(remaining),
      });
    }
  }
  return { allocations, shortfalls };
}
