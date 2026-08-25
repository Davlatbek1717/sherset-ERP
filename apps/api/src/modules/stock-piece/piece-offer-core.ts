import { addDecimals, compareDecimals, subtractDecimals } from '../shared/decimal.js';
import { PIECE_STATUS } from './stock-piece-core.js';

/**
 * K3 (bo'linadigan tovar — kabel/sim/shlang) — KASSIR ko'rinishining SOF
 * yadrosi. Prisma yo'q, SQL yo'q, faqat hisob.
 * Reja: `docs/plans/2026-08-25-bolinadigan-tovar-bolak-hisobi.md`, K3 fazasi.
 *
 * Ikki ish qiladi:
 *   1. **Tarkib** (`buildPieceComposition`) — `3 × 250 · 200 · 150 · 70 · 50`
 *      va «eng uzun uzluksiz». Butun rulonlar GURUHLANADI (K-reja 3-bo'lim:
 *      ular bir-biridan farq qilmaydi), bo'laklar esa individ — har biri
 *      o'z yorlig'i bilan.
 *   2. **Taklif** (`planPieceOffer`) — kassir so'ralgan miqdorni kiritganda:
 *      uzluksiz bo'lak bormi, yo'q bo'lsa qanday bo'lib berish mumkin.
 *
 * 🔴 **TIZIM HECH QACHON O'ZI TANLAMAYDI** (K-reja 4-bo'lim, vakolat
 * chegarasi). Bu yadro faqat KO'RSATADI va TAKLIF qiladi:
 *   · nechta bo'lak va qaysi uzunliklar — KASSIR mijoz bilan kelishadi (K-Q5);
 *   · qaysi JISMONIY bo'lakdan kesish — OMBORCHI hal qiladi (K-Q4).
 * Shuning uchun natijadagi `single` ham, `suggestion` ham TAVSIYA: ularni
 * bajarishga majburlaydigan kod yo'q va bo'lmasligi kerak.
 *
 * 🔴 **Reyestr bo'sh bo'lsa — SUKUT** (`no-registry`). Jonlida bayroq
 * yoqilgan tovarning reyestri hali to'ldirilmagan bo'lishi NORMAL holat
 * (K5 gacha u qo'lda to'ladi). Bunday paytda ekran ogohlantirish bermaydi va
 * HECH NARSANI to'smaydi — aks holda birinchi bayroq yoqilgan kunda kassa
 * «bo'lak yo'q» deb savdoni to'xtatgan bo'lardi. Bu 2026-08-24 hodisasining
 * aynan shakli bo'lardi (`docs/plans/2026-08-24-split-kassa-hodisasi.md`).
 */

// ---------------------------------------------------------------------------
// Kirish
// ---------------------------------------------------------------------------

/** Reyestr qatori — `stock_pieces` ning ekranga kerak bo'lgan qismi. */
export interface OfferPiece {
  id: string;
  storeId: string;
  cellId: string | null;
  cellName: string | null;
  /** `Decimal(20,6)` satri. */
  length: string;
  whole: boolean;
  label: string | null;
  status: string;
}

// ---------------------------------------------------------------------------
// 1. Tarkib
// ---------------------------------------------------------------------------

/** Butun rulonlar guruhi — `250 m × 3` (yorliqsiz, almashtiriladigan). */
export interface CompositionWholeGroup {
  length: string;
  count: number;
}

/** Bitta BO'LAK — individ, yorlig'i bilan (K-reja 3-bo'lim jadvali). */
export interface CompositionPiece {
  id: string;
  label: string | null;
  length: string;
  cellName: string | null;
}

export interface PieceComposition {
  wholeGroups: CompositionWholeGroup[];
  pieces: CompositionPiece[];
  /** Faol bo'laklar yig'indisi (reyestr bo'yicha, qoldiq EMAS). */
  registryQty: string;
  activePieces: number;
  wholeCount: number;
  /** Eng uzun UZLUKSIZ bo'lak (butun rulon ham sanaladi). */
  longest: string | null;
}

/**
 * (Ombor × tovar) doirasidagi tarkib.
 *
 * FAQAT `status='active'` qatorlar — `consumed` mijozga ketgan yoki hisobdan
 * chiqarilgan, u qoldiqda ham yo'q (K1 `buildPieceReconciliation` bilan
 * AYNAN bir qoida).
 */
export function buildPieceComposition(pieces: readonly OfferPiece[]): PieceComposition {
  const whole = new Map<string, CompositionWholeGroup>();
  const rows: CompositionPiece[] = [];
  let registryQty = '0';
  let activePieces = 0;
  let wholeCount = 0;
  let longest: string | null = null;

  for (const p of pieces) {
    if (p.status !== PIECE_STATUS.active) continue;
    activePieces += 1;
    registryQty = addDecimals(registryQty, p.length);
    if (longest === null || compareDecimals(p.length, longest) > 0) longest = p.length;

    if (p.whole) {
      wholeCount += 1;
      const g = whole.get(p.length);
      if (g) g.count += 1;
      else whole.set(p.length, { length: p.length, count: 1 });
    } else {
      rows.push({ id: p.id, label: p.label, length: p.length, cellName: p.cellName });
    }
  }

  return {
    // Ikkalasi ham KATTADAN kichikka: kassir «eng uzuni qaysi» degan savolga
    // ro'yxatning boshidan javob topsin.
    wholeGroups: [...whole.values()].sort((a, b) => compareDecimals(b.length, a.length)),
    pieces: rows.sort((a, b) => compareDecimals(b.length, a.length)),
    registryQty,
    activePieces,
    wholeCount,
    longest,
  };
}

// ---------------------------------------------------------------------------
// 2. Taklif
// ---------------------------------------------------------------------------

export type OfferVerdict =
  /** Reyestr bo'sh — maslahat YO'Q, ekran jim turadi (yuqoridagi izoh). */
  | 'no-registry'
  /** So'ralgan miqdorni YOLG'IZ qoplaydigan uzluksiz bo'lak bor. */
  | 'single'
  /** Uzluksiz bo'lak yo'q, lekin jami yetadi — kassir mijoz bilan kelishadi. */
  | 'needs-split'
  /** Reyestrdagi jami ham yetmaydi. */
  | 'not-enough';

/** Tavsiya qilingan manba bo'lak (K-Q4: majburlash EMAS). */
export interface OfferSource {
  id: string;
  label: string | null;
  length: string;
  whole: boolean;
  cellName: string | null;
}

export interface PieceOffer {
  requested: string;
  verdict: OfferVerdict;
  /**
   * `single` da — yetadigan ENG KICHIK bo'lak. Q1-v2 ning «eng kichigi»
   * falsafasi (kichik qoldiqlar yig'ilib qolmasin) bo'laklarga aynan mos
   * tushadi, LEKIN K-Q4 bo'yicha bu faqat TAVSIYA: omborchi 200 m likdan
   * kesishni qulay deb topsa, shundan kesadi.
   */
  single: OfferSource | null;
  /**
   * `needs-split` da — kassir mijozga aytadigan variant (`150 + 30`).
   * Uzunliklar KATTADAN kichikka; oxirgisi kesiladigan qism.
   */
  suggestion: string[];
  /** Eng uzun uzluksiz — ekranda alohida qator (K3/1-vazifa). */
  longest: string | null;
  /** Reyestrdagi faol bo'laklar yig'indisi. */
  registryQty: string;
  /** `not-enough` da yetmagan miqdor, aks holda `'0'`. */
  missing: string;
}

export interface PlanOfferInput {
  pieces: readonly OfferPiece[];
  /** Kassir so'ragan miqdor (`Decimal(20,6)` satri). */
  requested: string;
}

/**
 * Kesilgan bo'lakni butun rulondan afzal ko'radi (teng uzunlikda).
 *
 * Sabab jismoniy: 250 m lik BUTUN rulon va 250 m lik bo'lak ikkalasi ham
 * yetadi, lekin butun rulonni kesish yangi bo'lak tug'diradi — javonda yana
 * bitta «qoldiq» paydo bo'ladi. Allaqachon kesilganidan kesish esa bo'laklar
 * sonini oshirmaydi.
 */
function preferPiece(a: OfferSource, b: OfferSource): OfferSource {
  const cmp = compareDecimals(a.length, b.length);
  if (cmp !== 0) return cmp < 0 ? a : b;
  if (a.whole !== b.whole) return a.whole ? b : a;
  return a;
}

function toSource(p: OfferPiece): OfferSource {
  return { id: p.id, label: p.label, length: p.length, whole: p.whole, cellName: p.cellName };
}

/**
 * So'ralgan miqdor uchun taklif.
 *
 * Uch bosqich:
 *   1. YOLG'IZ qoplaydigan bo'lak bormi → `single` (eng kichigi, tavsiya);
 *   2. yo'q, lekin jami yetadi → `needs-split` + `150 + 30` taklifi;
 *   3. jami ham yetmaydi → `not-enough` (kassir mijozga «bunchasi yo'q» deydi).
 *
 * Reyestr bo'sh bo'lsa `no-registry` — ogohlantirish YO'Q (fayl boshidagi izoh).
 */
export function planPieceOffer(input: PlanOfferInput): PieceOffer {
  const active = input.pieces.filter((p) => p.status === PIECE_STATUS.active);
  const composition = buildPieceComposition(input.pieces);
  const base = {
    requested: input.requested,
    single: null,
    suggestion: [] as string[],
    longest: composition.longest,
    registryQty: composition.registryQty,
    missing: '0',
  };

  if (active.length === 0) return { ...base, verdict: 'no-registry' };
  // So'ralgan miqdor hali kiritilmagan (0 yoki manfiy) — tarkib ko'rinadi,
  // ogohlantirish esa hali erta.
  if (compareDecimals(input.requested, '0') <= 0) return { ...base, verdict: 'no-registry' };

  let single: OfferSource | null = null;
  for (const p of active) {
    if (compareDecimals(p.length, input.requested) < 0) continue;
    const src = toSource(p);
    single = single === null ? src : preferPiece(single, src);
  }
  if (single !== null) return { ...base, verdict: 'single', single };

  if (compareDecimals(composition.registryQty, input.requested) < 0) {
    return {
      ...base,
      verdict: 'not-enough',
      missing: subtractDecimals(input.requested, composition.registryQty),
    };
  }

  // Taklif: KATTADAN kichikka — mijoz iloji boricha kam bo'lak olsin
  // («150 + 30», «100 + 80 + 20» emas).
  const suggestion: string[] = [];
  let remaining = input.requested;
  for (const p of [...active].sort((a, b) => compareDecimals(b.length, a.length))) {
    if (compareDecimals(remaining, '0') <= 0) break;
    const take = compareDecimals(p.length, remaining) < 0 ? p.length : remaining;
    suggestion.push(take);
    remaining = subtractDecimals(remaining, take);
  }
  return { ...base, verdict: 'needs-split', suggestion };
}
