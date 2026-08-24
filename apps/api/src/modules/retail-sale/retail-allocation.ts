import { formatDecimalScaled, parseDecimalScaled } from '../shared/decimal.js';

/**
 * G4 (omborchi-tsd rejasi, 2026-08-24 da QAYTA YOZILGAN) — kassaning KO'P OMBORLI
 * AVTO-TAQSIMOT dvigateli. SOF modul: Prisma yo'q, faqat hisob.
 *
 * Egasining Q1-v2 qarori (G-reja 1-bo'lim, KANONIK jadval):
 *   **Omborchi tasdig'i degan narsa YO'Q.** Kassir buyurtma yozganda tizim
 *   tovarni BARCHA omborlarning yacheykalari kesimida ko'radi va o'zi taqsimlaydi:
 *
 *   1. «Kassa oldidagi ombor» (07) dagi manba butun miqdorni qoplasa → O'SHANDAN
 *      (yig'ish kerak emas, mijoz darhol oladi);
 *   2. aks holda, YOLG'IZ qoplaydigan manbalar orasidan yetadigan ENG KICHIGI →
 *      hammasi bitta joydan (bitta omborchi, bitta yurish; kichik yacheyka
 *      bo'shaydi, javonda joy ochiladi);
 *   3. hech biri yolg'iz qoplamasa → bo'linadi: avval boshqa omborlar,
 *      **07 ENG OXIRIDA** (u kassa oldidagi ombor, donali savdo uchun turibdi
 *      va baribir boshqalardan to'ldiriladi — buyurtmalar uni bo'shatmasin).
 *
 * ⚠️ Bu modul F6 ning `allocateAcrossStores` ini ALMASHTIRMAYDI, undan boshqa
 * masalani yechadi: F6 «prioritet tartibida ketma-ket ol» qiladi va YACHEYKA
 * tushunchasi yo'q; Q1-v2 esa 07 ni goh birinchi, goh oxirgi qo'yadi va manba
 * YACHEYKA darajasida tanlanadi.
 *
 * ---------------------------------------------------------------------------
 * E1 (G-reja, «kod bilan solishtirildi») — YACHEYKASIZ QOLDIQ.
 * Jonlida qoldiqning ~94 % i hech bir yacheykaga biriktirilmagan. Faqat
 * `StockByCell` ga tayangan taqsimot tovarlarning aksariyati uchun reja qura
 * olmasdi va kassa to'xtardi. Shuning uchun har ombor uchun yacheykasiz qoldiq
 * ham MANBA hisoblanadi — `cellId = null` bo'lgan «psevdo-yacheyka» sifatida.
 * Real yacheyka bilan teng holatda REAL yacheyka afzal: kassir/omborchi
 * ekranda aniq manzilni ko'rsin.
 *
 * ---------------------------------------------------------------------------
 * 🔷 DOMEN INVARIANTI (egasi, 2026-08-25): **«Kassa oldidagi ombor» (07) da
 * bitta tovar FAQAT BITTA yacheykada bo'ladi.** Shuning uchun «07 da yetarli,
 * lekin bitta yacheykasi yolg'iz qoplamaydi» degan holat TO'G'RI ma'lumotda
 * UMUMAN YUZ BERMAYDI — 1-holat tekshiruvi 07 uchun to'liq yetarli.
 *
 * Invariant BUZILGAN ma'lumotda (07 da bir tovar ikki yacheykada) xulq ataylab
 * o'zgarmaydi: taqsimot 2/3-holatga tushadi va kassa TO'XTAMAYDI, lekin natijada
 * `warnings: [{ code: 'front-multi-cell' }]` chiqadi. Jimgina o'tkazib yuborish
 * IS-5 xatosini (ko'rinmaydigan nosozlik) takrorlardi.
 *
 * E4 — BRAK ombori (G3, `__brakStore`) manba sifatida QATNASHMAYDI: brak tovar
 * mijozga sotilmaydi. F6 kaskadida u `__posPriority` yo'qligi bilan chiqib
 * turardi; bu dvigatel esa yacheykalardan ishlagani uchun ISTISNO OCHIQ yozilgan.
 */

// ---------------------------------------------------------------------------
// Store.attributes belgilari
// ---------------------------------------------------------------------------

/**
 * «Kassa oldidagi ombor» (07) belgisi. `__posPriority` / `__unassignedSource` /
 * `__brakStore` bilan BIR NAQSH: `Store.attributes` JSON'ida, migratsiyasiz.
 *
 * Nega prioritetning o'zi yetmaydi: `__posPriority = 1` faqat TARTIBNI beradi,
 * Q1-v2 esa 07 dan ikki xil foydalanadi — yolg'iz qoplasa BIRINCHI, bo'linishda
 * esa ENG OXIRGI. Bu ikki xulqni bitta raqam bilan ifodalab bo'lmaydi.
 */
export const POS_FRONT_STORE_KEY = '__posFrontStore';

/** Faqat aynan `true` hisoblanadi (`readBrakStore` bilan bir xil qat'iylik). */
export function readPosFrontStore(attributes: unknown): boolean {
  if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) return false;
  return (attributes as Record<string, unknown>)[POS_FRONT_STORE_KEY] === true;
}

// ---------------------------------------------------------------------------
// Kirish
// ---------------------------------------------------------------------------

export interface AllocStore {
  id: string;
  name: string;
  /** `Store.attributes.__posPriority` — kaskad tartibi (kichigi oldin). null = kaskadda EMAS. */
  posPriority: number | null;
  /** `Store.attributes.__posFrontStore` — «kassa oldidagi ombor» (07). Bo'linishda OXIRGI. */
  isPosFront: boolean;
  /** `Store.attributes.__brakStore` — manba sifatida ISHLATILMAYDI. */
  isBrak: boolean;
}

/** Yacheykadagi mavjudlik — `StockByCell.qty`. */
export interface AllocCell {
  storeId: string;
  cellId: string;
  cellName: string;
  qty: string;
}

/** Ombor darajasidagi «доступно» = `Stock.qty − reservedQty`. */
export interface AllocStoreAvailable {
  storeId: string;
  available: string;
}

export interface AllocRequest {
  assortmentId: string;
  requested: string;
}

export interface AllocationInput {
  requests: readonly AllocRequest[];
  stores: readonly AllocStore[];
  /** (assortmentId → yacheykalar). Faqat qty > 0 qatorlar kutiladi. */
  cellsByProduct: ReadonlyMap<string, readonly AllocCell[]>;
  /** (assortmentId → ombor darajasidagi «доступно»). */
  availableByProduct: ReadonlyMap<string, readonly AllocStoreAvailable[]>;
  /**
   * Kaskad umuman sozlanmagan akkauntda (hech bir omborda `__posPriority` yo'q)
   * POS eski yo'l bilan — smena omboridan ishlaydi (F6 zaxira yo'li).
   */
  fallbackStoreId?: string | null;
}

// ---------------------------------------------------------------------------
// Chiqish
// ---------------------------------------------------------------------------

export interface Allocation {
  assortmentId: string;
  storeId: string;
  storeName: string;
  /** null = yacheykasiz qoldiqdan (E1). */
  cellId: string | null;
  cellName: string | null;
  qty: string;
}

/** Qaysi qoida ishlagani — POS ekranida ham, testlarda ham kerak. */
export type AllocationRule = 'front' | 'single' | 'split' | 'none';

/**
 * Ma'lumot INVARIANTI buzilgani signali (hodisa saboqi IS-5: nosozlik ko'rinmasa
 * 46 daqiqa davom etadi). Taqsimotni TO'XTATMAYDI — faqat ko'rinadi.
 */
export interface AllocationWarning {
  code: 'front-multi-cell';
  assortmentId: string;
  /** Qoida buzilgan ombor. */
  storeId: string;
  /** Nechta yacheykada topildi (qoida bo'yicha 1 bo'lishi kerak). */
  cells: number;
}

export interface AllocationResult {
  allocations: Allocation[];
  /** Butun kaskadda ham topilmagan qism (haqiqiy defitsit). */
  shortfalls: Array<{ assortmentId: string; requested: string; missing: string }>;
  rules: Array<{ assortmentId: string; rule: AllocationRule }>;
  warnings: AllocationWarning[];
}

// ---------------------------------------------------------------------------
// Ichki: manba (yacheyka yoki yacheykasiz qoldiq)
// ---------------------------------------------------------------------------

interface Source {
  storeId: string;
  storeName: string;
  cellId: string | null;
  cellName: string | null;
  /** micro-birlik (×1e6). */
  qty: bigint;
  isPosFront: boolean;
  posPriority: number;
  /** Real yacheyka teng holatda yacheykasizdan afzal. */
  isCell: boolean;
}

/**
 * Kaskadda qatnashadigan omborlar: prioriteti bor, BRAK emas.
 * Kaskad sozlanmagan bo'lsa — `fallbackStoreId` yolg'iz ombor sifatida
 * (F6 dagi «xulq bayt-baytga o'zgarmaydi» zaxira yo'li).
 */
export function resolveAllocStores(
  stores: readonly AllocStore[],
  fallbackStoreId?: string | null,
): AllocStore[] {
  const cascade = stores
    .filter((s) => s.posPriority !== null && !s.isBrak)
    .sort((a, b) => (a.posPriority ?? 0) - (b.posPriority ?? 0) || a.name.localeCompare(b.name));
  if (cascade.length > 0) return cascade;
  const fallback = stores.find((s) => s.id === fallbackStoreId && !s.isBrak);
  return fallback ? [{ ...fallback, posPriority: 1 }] : [];
}

/**
 * Bitta tovar uchun manbalar ro'yxati.
 *
 * Ombor darajasidagi «доступно» (qty − rezerv) — QAT'IY TOM: yacheykalar
 * yig'indisi undan katta bo'lishi mumkin (rezerv ombor darajasida turadi),
 * shuning uchun yacheykalar KATTADAN kichikka to'ldirilib, tom tugaganda
 * kesiladi. Qolgani — yacheykasiz psevdo-manba.
 */
function buildSources(
  stores: readonly AllocStore[],
  cells: readonly AllocCell[],
  available: readonly AllocStoreAvailable[],
): Source[] {
  const availByStore = new Map(available.map((a) => [a.storeId, parseDecimalScaled(a.available)]));
  const out: Source[] = [];

  for (const store of stores) {
    let cap = availByStore.get(store.id) ?? 0n;
    if (cap <= 0n) continue;

    const own = cells
      .filter((c) => c.storeId === store.id)
      .map((c) => ({ ...c, micro: parseDecimalScaled(c.qty) }))
      .filter((c) => c.micro > 0n)
      .sort((a, b) => (b.micro > a.micro ? 1 : b.micro < a.micro ? -1 : 0));

    for (const c of own) {
      if (cap <= 0n) break;
      const qty = c.micro < cap ? c.micro : cap;
      out.push({
        storeId: store.id,
        storeName: store.name,
        cellId: c.cellId,
        cellName: c.cellName,
        qty,
        isPosFront: store.isPosFront,
        posPriority: store.posPriority ?? 0,
        isCell: true,
      });
      cap -= qty;
    }
    if (cap > 0n) {
      // E1 — yacheykasiz qoldiq ham manba (aks holda tovarlarning ~94 % i uchun
      // umuman reja qurilmasdi).
      out.push({
        storeId: store.id,
        storeName: store.name,
        cellId: null,
        cellName: null,
        qty: cap,
        isPosFront: store.isPosFront,
        posPriority: store.posPriority ?? 0,
        isCell: false,
      });
    }
  }
  return out;
}

/**
 * Yolg'iz qoplaydiganlar orasidan ENG KICHIGI.
 *
 * IKKI BOSQICH: avval REAL yacheykalar, ular orasidan hech biri qoplamasagina
 * yacheykasiz qoldiq. Sabab — egasining «eng kichigi» qoidasining MAQSADI
 * yacheykani BO'SHATISH (javonda joy ochilsin). Yacheykasiz qoldiq javonda
 * turmaydi, ya'ni uni «bo'shatish» hech narsa bermaydi, ustiga omborchiga
 * aniq manzil ham qolmaydi. Shuning uchun real yacheyka KATTAROQ bo'lsa ham
 * yacheykasizdan afzal.
 */
function smallestCovering(sources: readonly Source[], need: bigint): Source | null {
  const pick = (pool: readonly Source[]): Source | null => {
    let best: Source | null = null;
    for (const s of pool) {
      if (s.qty < need) continue;
      if (!best || s.qty < best.qty) best = s;
    }
    return best;
  };
  return pick(sources.filter((s) => s.isCell)) ?? pick(sources.filter((s) => !s.isCell));
}

/**
 * Bo'linish tartibi (3-holat): avval boshqa omborlar (kaskad prioriteti bo'yicha),
 * **07 ENG OXIRIDA**. Ombor ichida KATTADAN kichikka — tegiladigan yacheyka soni
 * (ya'ni omborchining yurishi) kamaysin. Real yacheyka yacheykasizdan oldin:
 * omborchi aniq manzilga borsin, «qolgan joydan top» oxirgi chora bo'lsin.
 *
 * Diqqat — 2-holatdagi «eng kichik» bilan qarama-qarshi emas: u yerda maqsad
 * kichik yacheykani BO'SHATISH, bu yerda esa yurishlar sonini KAMAYTIRISH.
 */
function splitOrder(a: Source, b: Source): number {
  if (a.isPosFront !== b.isPosFront) return a.isPosFront ? 1 : -1;
  if (a.posPriority !== b.posPriority) return a.posPriority - b.posPriority;
  if (a.isCell !== b.isCell) return a.isCell ? -1 : 1;
  if (a.qty !== b.qty) return b.qty > a.qty ? 1 : -1;
  return (a.cellName ?? '').localeCompare(b.cellName ?? '');
}

// ---------------------------------------------------------------------------
// Yadro
// ---------------------------------------------------------------------------

export function allocateForSale(input: AllocationInput): AllocationResult {
  const stores = resolveAllocStores(input.stores, input.fallbackStoreId);
  const allocations: Allocation[] = [];
  const shortfalls: AllocationResult['shortfalls'] = [];
  const rules: AllocationResult['rules'] = [];
  const warnings: AllocationWarning[] = [];

  // Bir tovar chekda bir necha qatorda kelishi mumkin — jamlab taqsimlanadi
  // (F6 `allocateAcrossStores` naqshi).
  const needByProduct = new Map<string, bigint>();
  for (const r of input.requests) {
    const micro = parseDecimalScaled(r.requested);
    if (micro <= 0n) continue;
    needByProduct.set(r.assortmentId, (needByProduct.get(r.assortmentId) ?? 0n) + micro);
  }

  for (const [assortmentId, need] of needByProduct) {
    const sources = buildSources(
      stores,
      input.cellsByProduct.get(assortmentId) ?? [],
      input.availableByProduct.get(assortmentId) ?? [],
    );
    const push = (s: Source, qty: bigint) => {
      allocations.push({
        assortmentId,
        storeId: s.storeId,
        storeName: s.storeName,
        cellId: s.cellId,
        cellName: s.cellName,
        qty: formatDecimalScaled(qty),
      });
    };

    // ── 1-holat: kassa oldidagi ombor (07) yolg'iz qoplaydimi ───────────────
    const front = sources.filter((s) => s.isPosFront);
    // Invariant qo'riqchisi: 07 da bitta tovar bitta yacheykada bo'lishi kerak.
    const frontCells = front.filter((s) => s.isCell);
    if (frontCells.length > 1) {
      warnings.push({
        code: 'front-multi-cell',
        assortmentId,
        storeId: frontCells[0]?.storeId ?? '',
        cells: frontCells.length,
      });
    }
    const frontHit = smallestCovering(front, need);
    if (frontHit) {
      push(frontHit, need);
      rules.push({ assortmentId, rule: 'front' });
      continue;
    }

    // ── 2-holat: boshqa manbalardan YOLG'IZ qoplaydigan eng kichigi ─────────
    const others = sources.filter((s) => !s.isPosFront);
    const singleHit = smallestCovering(others, need);
    if (singleHit) {
      push(singleHit, need);
      rules.push({ assortmentId, rule: 'single' });
      continue;
    }

    // ── 3-holat: bo'linadi — boshqa omborlar avval, 07 oxirida ─────────────
    let remaining = need;
    for (const s of [...sources].sort(splitOrder)) {
      if (remaining <= 0n) break;
      const take = s.qty < remaining ? s.qty : remaining;
      if (take <= 0n) continue;
      push(s, take);
      remaining -= take;
    }
    if (remaining > 0n) {
      shortfalls.push({
        assortmentId,
        requested: formatDecimalScaled(need),
        missing: formatDecimalScaled(remaining),
      });
    }
    rules.push({
      assortmentId,
      rule: allocations.length > 0 && need > remaining ? 'split' : 'none',
    });
  }

  return { allocations, shortfalls, rules, warnings };
}
