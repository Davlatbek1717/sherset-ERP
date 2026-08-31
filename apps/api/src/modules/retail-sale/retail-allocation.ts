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
 *
 * ---------------------------------------------------------------------------
 * 🔷 VITRINA (egasi, 2026-08-31) — `StoreCell.vitrina` belgili yacheyka
 * «ko'rsatish uchun»: 1/2-holatlarda umuman qatnashmaydi, 3-holatda MUTLAQ
 * OXIRGI (barcha omborlarning yacheykasiz qoldig'idan ham keyin). Ya'ni
 * vitrinadagi tovar faqat tizimda BOSHQA HECH NARSA qolmaganda sotiladi.
 *
 * 🔷 «18% SIZISH» TUZATISHI (2026-08-31): yacheykasi BOR tovarda yacheykasiz
 * psevdo-manba endi 2-holatda g'olib chiqolmaydi — bitta yacheyka yolg'iz
 * qoplamasa taqsimot yacheykalarni BO'LIB oladi (3-holat), hovuzga esa faqat
 * yacheykalar tugagach tushadi. O'lchov (jonli ledger, 08-27…08-31): sanalgan
 * tovar sotuvining 18% i hovuzga «qochib», sanalgan yacheykalar muzlab qolardi.
 *
 * ---------------------------------------------------------------------------
 * 🔴 K3 (K-reja 7.1) — BO'LINADIGAN TOVAR ISTISNOSI (egasi, 2026-08-25).
 * `pieceTracked = true` tovarlarda (kabel, sim, shlang — rulondan metrlab
 * sotiladigan) **3-holat QO'LLANMAYDI**: 180 m ni «100 + 80» deb ikki
 * yacheykadan taqsimlash mijozga YAROQSIZ, chunki unga UZLUKSIZ bo'lak kerak.
 * Bunday tovarda avto-taqsimot 1- va 2-holat bilan cheklanadi (bitta manba
 * butun miqdorni qoplashi shart); qoplamasa — bo'lish emas, `no-single-source`
 * sababi bilan yetishmovchilik qaytadi va KASSIR mijoz bilan kelishadi
 * («150 + 30 ga rozimi?»). Qaror mijoznikida — tizim o'zi bo'lmaydi.
 * To'liq tavsif: `docs/plans/2026-08-25-bolinadigan-tovar-bolak-hisobi.md`.
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
  /**
   * «Vitrina» (egasi, 2026-08-31) — ko'rsatish uchun qo'yilgan tovar yacheykasi
   * (`StoreCell.vitrina`). Taqsimotda ENG OXIRGI navbat: 1/2-holatlarda umuman
   * qatnashmaydi, 3-holat (bo'linish)da esa BARCHA boshqa manbalardan (boshqa
   * omborlarning yacheykasiz qoldig'i ham) keyin turadi — «faqat hech qayerda
   * qolmasa sotiladi».
   */
  vitrina?: boolean;
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
  /**
   * K3 (7.1) — bo'linadigan tovarlar (`Product.pieceTracked`). BO'SH/berilmagan
   * bo'lsa xulq BAYT-BAYTGA avvalgidek: bayroq hech qayerda yoqilmagan
   * akkauntda bu maydon hech narsani o'zgartirmaydi.
   */
  pieceTracked?: ReadonlySet<string>;
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

/**
 * Yetishmovchilik SABABI — xabar matni va kassirning keyingi qadami shunga
 * bog'liq (IS-5: nosozlik sababi ko'rinmasa, kassir nima qilishni bilmaydi).
 *
 *  - `insufficient` — tizimda jami yetmaydi (avvalgi yagona holat);
 *  - `no-single-source` — jami YETADI, lekin bitta manba yolg'iz qoplamaydi
 *    va tovar bo'linadigan (K3/7.1) ⇒ bo'lib yuborish TAQIQLANGAN.
 */
export type ShortfallReason = 'insufficient' | 'no-single-source';

export interface AllocationShortfall {
  assortmentId: string;
  requested: string;
  missing: string;
  reason: ShortfallReason;
  /** `no-single-source` da — eng katta YOLG'IZ manba (kassirga taklif uchun). */
  largestSingle?: string;
}

export interface AllocationResult {
  allocations: Allocation[];
  /** Butun kaskadda ham topilmagan qism (haqiqiy defitsit). */
  shortfalls: AllocationShortfall[];
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
  /** Vitrina yacheyka — faqat oxirgi chora (AllocCell.vitrina izohiga qarang). */
  isVitrina: boolean;
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
  if (!fallbackStoreId) return [];
  const fallback = stores.find((s) => s.id === fallbackStoreId);
  // BRAK ombori zaxira yo'lda ham manba bo'lolmaydi.
  if (fallback?.isBrak) return [];
  // Ombor ro'yxatda topilmasa ham (arxivlangan, yoki ro'yxat boshqa filtr
  // bilan o'qilgan) SINTETIK yozuv qaytariladi: kaskadsiz o'rnatmada kassa
  // AVVALGIDEK smena omboridan sotishi shart. Bo'sh ro'yxat qaytarish har
  // sotuvni 400 ga aylantirardi — F6 ning «xulq bayt-baytga o'zgarmaydi»
  // kafolatini buzgan bo'lardi.
  return [
    fallback
      ? { ...fallback, posPriority: 1 }
      : {
          id: fallbackStoreId,
          name: '',
          posPriority: 1,
          isPosFront: false,
          isBrak: false,
        },
  ];
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

    // Vitrina yacheykalar tomni ODDIYlardan KEYIN, yacheykasiz remainder'dan
    // OLDIN iste'mol qiladi: vitrinadagi jismoniy tovar «yacheykasiz qoldiq»
    // psevdo-manbasiga qo'shilib ketmasin (aks holda reja vitrinani chetlab
    // o'sha tovarni «yacheykasiz» deb sotib yuborardi).
    const own = cells
      .filter((c) => c.storeId === store.id)
      .map((c) => ({ ...c, micro: parseDecimalScaled(c.qty) }))
      .filter((c) => c.micro > 0n)
      .sort(
        (a, b) =>
          (a.vitrina === true ? 1 : 0) - (b.vitrina === true ? 1 : 0) ||
          (b.micro > a.micro ? 1 : b.micro < a.micro ? -1 : 0),
      );

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
        isVitrina: c.vitrina === true,
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
        isVitrina: false,
      });
    }
  }
  return out;
}

/** Yolg'iz qoplaydiganlar orasidan ENG KICHIGI (bitta hovuz ichida). */
function pickSmallest(pool: readonly Source[], need: bigint): Source | null {
  let best: Source | null = null;
  for (const s of pool) {
    if (s.qty < need) continue;
    if (!best || s.qty < best.qty) best = s;
  }
  return best;
}

/**
 * Yolg'iz qoplaydigan manba — «eng kichigi» qoidasi.
 *
 * BOSQICHLAR: avval REAL (vitrinasiz) yacheykalar. Sabab — egasining «eng
 * kichigi» qoidasining MAQSADI yacheykani BO'SHATISH (javonda joy ochilsin).
 * Yacheykasiz qoldiq javonda turmaydi, uni «bo'shatish» hech narsa bermaydi,
 * omborchiga aniq manzil ham qolmaydi.
 *
 * 🔴 2026-08-31 tuzatishi («18% sizish»): tovarning yacheykalari BOR bo'lsa-yu
 * hech biri yolg'iz qoplamasa, endi yacheykasiz psevdo-manba G'OLIB CHIQMAYDI —
 * taqsimot 3-holatga (yacheykalarni bo'lib olish) tushadi. Ilgari H5 soxta
 * qoldig'i (~10 000/tovar) har doim «yolg'iz qoplab» yacheykalarni muzlatib
 * qo'yardi: yacheykada 5+4 turgan tovarning 6 talik cheki to'liq hovuzdan
 * yozilardi va sanalgan yacheyka qimirlamasdi. Yacheykasi YO'Q (sanalmagan)
 * tovarda xulq o'zgarmagan: yacheykasiz qoldiq avvalgidek yolg'iz manba.
 *
 * `allowUncelledOverCells` (K3 bo'linadigan tovar): unda bo'lish YO'Q, manba
 * yolg'iz bo'lishi SHART — yacheykasiz qoldiq avvalgidek to'liq qatnashadi
 * (aks holda rulonli tovar hovuzdan umuman sotilmay qolardi), vitrina esa
 * bu yerda ham eng oxirgi chora.
 */
function smallestCovering(
  sources: readonly Source[],
  need: bigint,
  opts: {
    /**
     * Yacheykasiz qoldiq qachon yolg'iz manba bo'la oladi:
     *  - `'har doim'` — front (07 semantikasi: «qoplasa — o'shandan») va K3;
     *  - `'yacheyka-bolmasa'` — oddiy tovar (2026-08-31 «18% sizish» tuzatishi):
     *    yacheykasi BOR tovarda hovuz g'olib chiqmaydi, 3-holat bo'lib oladi.
     */
    uncelled: 'har doim' | 'yacheyka-bolmasa';
    /** Vitrina oxirgi chora sifatida qatnashadimi (faqat K3 da true). */
    vitrinaFallback?: boolean;
  },
): Source | null {
  const cellsNV = sources.filter((s) => s.isCell && !s.isVitrina);
  const uncelled = sources.filter((s) => !s.isCell);
  const fromCells = pickSmallest(cellsNV, need);
  if (fromCells) return fromCells;
  const uncelledOk = opts.uncelled === 'har doim' || cellsNV.length === 0;
  const fromUncelled = uncelledOk ? pickSmallest(uncelled, need) : null;
  if (fromUncelled) return fromUncelled;
  if (opts.vitrinaFallback) {
    return pickSmallest(
      sources.filter((s) => s.isVitrina),
      need,
    );
  }
  return null;
}

/**
 * Bo'linish tartibi (3-holat): avval boshqa omborlar (kaskad prioriteti bo'yicha),
 * **07 ENG OXIRIDA**. Ombor ichida KATTADAN kichikka — tegiladigan yacheyka soni
 * (ya'ni omborchining yurishi) kamaysin. Real yacheyka yacheykasizdan oldin:
 * omborchi aniq manzilga borsin, «qolgan joydan top» oxirgi chora bo'lsin.
 *
 * VITRINA — MUTLAQ OXIRGI (hamma omborning hamma manbasidan keyin): «faqat
 * hech qayerda qolmasa sotiladi» (egasi, 2026-08-31).
 *
 * Diqqat — 2-holatdagi «eng kichik» bilan qarama-qarshi emas: u yerda maqsad
 * kichik yacheykani BO'SHATISH, bu yerda esa yurishlar sonini KAMAYTIRISH.
 */
function splitOrder(a: Source, b: Source): number {
  if (a.isVitrina !== b.isVitrina) return a.isVitrina ? 1 : -1;
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

    const isPiece = input.pieceTracked?.has(assortmentId) === true;

    // ── 1-holat: kassa oldidagi ombor (07) yolg'iz qoplaydimi ───────────────
    // Vitrina bu yerda QATNASHMAYDI — 07 ning o'zida ham vitrina oxirgi chora.
    const front = sources.filter((s) => s.isPosFront);
    // Invariant qo'riqchisi: 07 da bitta tovar bitta yacheykada bo'lishi kerak.
    const frontCells = front.filter((s) => s.isCell && !s.isVitrina);
    if (frontCells.length > 1) {
      warnings.push({
        code: 'front-multi-cell',
        assortmentId,
        storeId: frontCells[0]?.storeId ?? '',
        cells: frontCells.length,
      });
    }
    const frontHit = smallestCovering(front, need, { uncelled: 'har doim' });
    if (frontHit) {
      push(frontHit, need);
      rules.push({ assortmentId, rule: 'front' });
      continue;
    }

    // ── 2-holat: boshqa manbalardan YOLG'IZ qoplaydigan eng kichigi ─────────
    // Oddiy tovar: yacheykasi bor bo'lsa hovuz g'olib chiqmaydi (18% sizish
    // tuzatishi) — 3-holat yacheykalarni bo'lib oladi. K3 tovar: bo'lish yo'q,
    // shuning uchun hovuz avvalgidek yolg'iz manba, vitrina — oxirgi chora.
    const others = sources.filter((s) => !s.isPosFront);
    const singleHit = smallestCovering(others, need, {
      uncelled: isPiece ? 'har doim' : 'yacheyka-bolmasa',
      vitrinaFallback: isPiece,
    });
    if (singleHit) {
      push(singleHit, need);
      rules.push({ assortmentId, rule: 'single' });
      continue;
    }

    // ── K3 (7.1): bo'linadigan tovarda 3-holat QO'LLANMAYDI ────────────────
    // Bir necha yacheykadan yig'ilgan 180 m mijozga yaroqsiz — unga UZLUKSIZ
    // bo'lak kerak. Shuning uchun taqsimot shu yerda TO'XTAYDI va qaror
    // kassirga qaytadi (mijoz bilan kelishish: «150 + 30»). Xabar «yetmaydi»
    // emas — jami YETADI, faqat bir bo'lakda emas.
    if (isPiece) {
      const total = sources.reduce((sum, s) => sum + s.qty, 0n);
      const largest = sources.reduce((max, s) => (s.qty > max ? s.qty : max), 0n);
      shortfalls.push({
        assortmentId,
        requested: formatDecimalScaled(need),
        missing: formatDecimalScaled(total < need ? need - total : need),
        reason: total < need ? 'insufficient' : 'no-single-source',
        largestSingle: formatDecimalScaled(largest),
      });
      rules.push({ assortmentId, rule: 'none' });
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
        reason: 'insufficient',
      });
    }
    rules.push({
      assortmentId,
      rule: allocations.length > 0 && need > remaining ? 'split' : 'none',
    });
  }

  return { allocations, shortfalls, rules, warnings };
}

// ---------------------------------------------------------------------------
// K3 — bo'linadigan tovarlar to'plami
// ---------------------------------------------------------------------------

/**
 * Chek pozitsiyalaridan bo'linadigan tovarlar to'plami (`Product.pieceTracked`).
 *
 * Bayroq POZITSIYA bilan birga o'qiladi (`product: { select: { pieceTracked } }`),
 * ALOHIDA so'rov QILINMAYDI: `post()` va `sendToPicking()` allaqachon tovar
 * relationini oladi, ya'ni bu maydon bepul keladi. Bayroqni bilmaydigan
 * chaqiruvchida (maydon `undefined`) natija BO'SH ⇒ xulq bayt-baytga
 * avvalgidek — «bayroq o'chiq bo'lsa hech narsa o'zgarmaydi» qabul mezoni
 * shu yerdan boshlanadi.
 */
export function collectPieceTracked(
  positions: ReadonlyArray<{
    productId: string | null;
    product?: { pieceTracked?: boolean | null } | null;
  }>,
): Set<string> {
  const out = new Set<string>();
  for (const p of positions) {
    if (p.productId && p.product?.pieceTracked === true) out.add(p.productId);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Xabar
// ---------------------------------------------------------------------------

/**
 * Yetishmovchilik xabari — kassir EKRANDA ko'radigan matn.
 *
 * Ikki sabab ikki xil ish talab qiladi, shuning uchun matn ham ikki xil:
 *  - `insufficient` — tovar yo'q, xabar AVVALGIDEK (bayroq yoqilmagan
 *    akkauntda matn bir harf ham o'zgarmaydi);
 *  - `no-single-source` (K3/7.1) — tovar BOR, lekin bir manbada emas.
 *    «Yetmaydi» deyish YOLG'ON bo'lardi va kassir mijozga yo'q deb qaytarardi;
 *    aslida qilinadigan ish — mijoz bilan kelishib qatorni bo'lish.
 */
export function buildShortfallMessage(shortfalls: readonly AllocationShortfall[]): string {
  const blocked = shortfalls.filter((s) => s.reason === 'no-single-source');
  const missing = shortfalls.filter((s) => s.reason !== 'no-single-source');
  const parts: string[] = [];

  if (missing.length > 0) {
    parts.push(
      "Tizimdagi hech bir omborda yetarli miqdor yo'q. Yetishmagan tovar(lar): " +
        missing.map((sf) => `${sf.assortmentId} — ${sf.missing} ta`).join('; '),
    );
  }
  if (blocked.length > 0) {
    parts.push(
      "Bo'linadigan tovar: so'ralgan miqdorni YOLG'IZ qoplaydigan uzluksiz bo'lak yo'q " +
        "(bo'lib yuborilmaydi). Mijoz bilan kelishib qatorni bo'ling. Tovar(lar): " +
        blocked
          .map(
            (sf) =>
              `${sf.assortmentId} — ${sf.requested} so'raldi, eng kattasi ${sf.largestSingle ?? '0'}`,
          )
          .join('; '),
    );
  }
  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// Pozitsiyalarga yoyish
// ---------------------------------------------------------------------------

export interface AllocPosition {
  id: string;
  assortmentId: string;
  quantity: string;
}

export interface PositionAllocation {
  positionId: string;
  assortmentId: string;
  storeId: string;
  cellId: string | null;
  qty: string;
}

/**
 * Taqsimot TOVAR kesimida hisoblanadi (bir tovar chekda bir necha qatorda
 * kelishi mumkin \u2014 F6 `allocateAcrossStores` naqshi), lekin saqlash va
 * `post()` deltalari POZITSIYA kesimida bo'lishi kerak:
 *   \u00b7 `retail_sale_position_allocations` qatori pozitsiyaga bog'lanadi;
 *   \u00b7 ledger `docPositionId` bilan yoziladi (hisobotlar shunga tayanadi).
 *
 * Shuning uchun tovar bo'yicha ajratmalar pozitsiyalarga TARTIB bilan
 * yoyiladi: birinchi pozitsiya to'lguncha birinchi manbadan, keyingisi
 * qolganidan. Bo'linish natijasi o'zgarmaydi \u2014 faqat kimga tegishli ekani
 * aniqlanadi.
 */
export function spreadAllocationsToPositions(
  allocations: readonly Allocation[],
  positions: readonly AllocPosition[],
): PositionAllocation[] {
  const queue = new Map<string, Array<{ storeId: string; cellId: string | null; qty: bigint }>>();
  for (const a of allocations) {
    const list = queue.get(a.assortmentId) ?? [];
    list.push({ storeId: a.storeId, cellId: a.cellId, qty: parseDecimalScaled(a.qty) });
    queue.set(a.assortmentId, list);
  }

  const out: PositionAllocation[] = [];
  for (const p of positions) {
    let need = parseDecimalScaled(p.quantity);
    if (need <= 0n) continue;
    const list = queue.get(p.assortmentId);
    if (!list) continue;
    for (const src of list) {
      if (need <= 0n) break;
      if (src.qty <= 0n) continue;
      const take = src.qty < need ? src.qty : need;
      out.push({
        positionId: p.id,
        assortmentId: p.assortmentId,
        storeId: src.storeId,
        cellId: src.cellId,
        qty: formatDecimalScaled(take),
      });
      src.qty -= take;
      need -= take;
    }
  }
  return out;
}
