import { addDecimals, compareDecimals, subtractDecimals } from '../shared/decimal.js';
import { PIECE_STATUS, isScrapLength } from './stock-piece-core.js';
import { issuePieceLabels, parseLengthInput } from './stock-piece-registry-core.js';

/**
 * K4 (bo'linadigan tovar — omborchi KESIM oqimi) — SOF yadro.
 * Prisma yo'q, SQL yo'q, Nest yo'q. Reja:
 * `docs/plans/2026-08-25-bolinadigan-tovar-bolak-hisobi.md`, K4 fazasi.
 *
 * ---------------------------------------------------------------------------
 * 🔷 ASOSIY QOIDA — KESIM QOLDIQNI O'ZGARTIRMAYDI (K-reja 2-bo'lim).
 *
 * 250 m lik rulondan 180 m kesilganda ombordagi kabel KAMAYMAYDI: `250`
 * o'rniga `180 + 70` bo'ladi. Jami — o'sha 250. Qoldiq faqat TO'LOVDA
 * kamayadi (F-reja Q1: ayirish momenti — pul to'langanda).
 *
 * Shundan ikki og'ir oqibat O'Z-O'ZIDAN hal bo'ladi:
 *   1. kassa vaqti bilan ombor vaqti orasida teshik yo'q — `SUM(bo'laklar) =
 *      StockByCell.qty` invarianti «kesildi lekin hali to'lanmadi» oralig'ida
 *      HAM saqlanadi;
 *   2. mijoz kesilgandan keyin voz kechsa hech nima buzilmaydi — 180 m
 *      yorliq bilan omborda qolaveradi (kabelni qaytarib ulab bo'lmaydi).
 *
 * ---------------------------------------------------------------------------
 * 🔴 CHIQINDI VA KESIM YO'QOTISHI — EGASINING 2026-08-25 QARORI.
 *
 * Reja «avtomatik hisobdan chiqarish» degan edi va bu ikki xil o'qilardi:
 * (a) qoldiqni ham kamaytirish yoki (b) faqat reyestrdan chiqarish. Egasi
 * IKKINCHISINI tanladi: **qoldiqqa TEGILMAYDI**. Ya'ni 1 m dan kalta qirqindi
 * va omborchi tuzatgan farq `stock_pieces` dan chiqadi (`consumed`, sababi
 * bilan), `Stock`/`StockByCell` esa o'z holicha qoladi — sverka farqni
 * KO'RSATADI va uni tuzatish inventarizatsiya ishi (K5).
 *
 * Sabab shu bilan bir qatorda K-rejaning butun tamoyili: reyestr qoldiqning
 * YONIDA turadi, uning O'RNIDA emas. 2026-08-24 da savdo aynan qoldiq
 * mexanizmiga tegilgani uchun 46 daqiqa to'xtagan edi
 * (`docs/plans/2026-08-24-split-kassa-hodisasi.md`).
 *
 * ⇒ **Bu modulda `Stock`/`StockByCell` so'zi umuman uchramaydi.** Kesim
 * natijasi — faqat `stock_pieces` qatorlari.
 *
 * ---------------------------------------------------------------------------
 * 🔷 ZANJIR INVARIANTI (test bilan qulflangan):
 *
 *     manba.length === mijoz.length + qoldiq.length + chiqindi.length + yo'qotish.length
 *
 * Ya'ni har kesim manba uzunligini QOLDIQSIZ taqsimlaydi va har bo'lakcha
 * `sourcePieceId` bilan manbaga bog'lanadi. Shuning uchun chiqindi ham,
 * yo'qotish ham JADVALGA YOZILADI (`consumed` qator sifatida) — yozilmasa
 * sverkadagi farq sababsiz paydo bo'lardi va hech kim uni tushuntira olmasdi
 * (IS-5: ko'rinmaydigan nosozlik).
 */

// ---------------------------------------------------------------------------
// Kassirning kelishuvi: «150+30»
// ---------------------------------------------------------------------------

/** Kassir kelishgan tarkib ajratgichi. */
const PIECE_LENGTHS_SEPARATOR = '+';

/** Bir qatorga kelishilishi mumkin bo'lgan maksimal bo'lak soni. */
export const MAX_AGREED_PIECES = 20;

/**
 * `«150+30»` → `['150', '30']`. Noto'g'ri/bo'sh qiymat → bo'sh massiv.
 *
 * Format ATAYLAB oddiy matn (JSON emas): u omborchining ekranida shundoq
 * ko'rinadi va DB'da odam o'qiy oladi. Har bo'lak `parseLengthInput` dan
 * o'tadi — ya'ni vergul («150,5») shu yerda ham nuqtaga o'giriladi.
 */
export function parsePieceLengths(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const out: string[] = [];
  for (const part of raw.split(PIECE_LENGTHS_SEPARATOR)) {
    const { value } = parseLengthInput(part);
    if (value === undefined) continue;
    if (compareDecimals(value, '0') <= 0) continue;
    out.push(value);
    if (out.length >= MAX_AGREED_PIECES) break;
  }
  return out;
}

/**
 * `['150', '30']` → `«150+30»`. Bitta yoki nol bo'lak → `null`.
 *
 * Bitta bo'lak — bu «bo'linmagan qator», ya'ni saqlanadigan kelishuv yo'q:
 * ustunni to'ldirish omborchiga hech narsa qo'shmaydi, faqat shovqin bo'lardi.
 */
export function formatPieceLengths(lengths: readonly string[] | null | undefined): string | null {
  if (!lengths || lengths.length < 2) return null;
  const parsed = lengths
    .map((l) => parseLengthInput(l).value)
    .filter((v): v is string => v !== undefined && compareDecimals(v, '0') > 0)
    .slice(0, MAX_AGREED_PIECES);
  return parsed.length >= 2 ? parsed.join(PIECE_LENGTHS_SEPARATOR) : null;
}

// ---------------------------------------------------------------------------
// Kesim rejasi
// ---------------------------------------------------------------------------

/** `stock_pieces.consumed_reason` yopiq lug'ati (migratsiyadagi CHECK bilan bir xil). */
export const PIECE_CONSUMED_REASON = {
  /** Mijozga ketdi — `post()` da, to'lov paytida. */
  sold: 'sold',
  /** 1 m dan kalta qoldiq (K-Q6) — chiqindi. */
  scrap: 'scrap',
  /** Omborchi tuzatgan farq: kesim yo'qotishi (250 − 180 = 70, aslida 68). */
  cutLoss: 'cut-loss',
  /** K2 ekranidagi «tugadi». */
  closed: 'closed',
} as const;
export type PieceConsumedReason =
  (typeof PIECE_CONSUMED_REASON)[keyof typeof PIECE_CONSUMED_REASON];

export interface CutSource {
  /** Manba bo'lakning QOLGAN uzunligi. */
  length: string;
  /** Butun rulonmi (yorliqsiz). */
  whole: boolean;
  /** `active` bo'lmagan bo'lakni kesib bo'lmaydi. */
  status: string;
  /** Manba yorlig'i (butun rulonda `null`). */
  label: string | null;
}

export interface PlanCutInput {
  source: CutSource;
  /** Mijozga ketadigan uzunlik (omborchi kiritadi yoki chekdan keladi). */
  cutLength: string;
  /**
   * Omborchi O'LCHAGAN qoldiq. Berilmasa `manba − kesim` deb olinadi.
   *
   * Nega tuzatish kerak (K-reja 5-bo'lim): tizim `250 − 180 = 70` deb taklif
   * qiladi, haqiqatda 68 chiqishi mumkin (kesim yo'qotishi, yoki rulonda
   * boshidan 247 m bo'lgan). Farq JIM YO'QOLMASLIGI uchun u alohida
   * `cut-loss` qatori bo'lib yoziladi.
   */
  remainingLength?: string | null;
  /** Yangi yorliqlar uchun birinchi tartib raqami (`nextPieceSeq` chiqishi). */
  startSeq: number;
}

export type CutError =
  | 'source-not-active'
  | 'cut-not-positive'
  | 'cut-exceeds-source'
  | 'remaining-negative'
  | 'remaining-exceeds-source'
  /** Himoya qavati: zanjir yig'indisi manbaga teng chiqmadi (kod xatosi). */
  | 'chain-mismatch';

/** Kesimdan chiqadigan yangi qator. */
export interface CutChild {
  length: string;
  /** Chiqindi/yo'qotish qatorlari yorliqsiz — ular omborda turmaydi. */
  label: string | null;
  whole: boolean;
  status: string;
  /** `active` qatorlarda `null`. */
  reason: PieceConsumedReason | null;
}

/**
 * Kiritilgan uzunlikni `Decimal(20,6)` satriga keltiradi (vergul → nuqta).
 * Yaroqsiz bo'lsa `null` — chaqiruvchi aniq xato kodini o'zi tanlaydi.
 */
function normalize(raw: string): string | null {
  return parseLengthInput(raw).value ?? null;
}

export type CutRule =
  /** Mijoz manbaning HAMMASINI oladi — kesim YO'Q, manba o'zi band qilinadi. */
  | 'take-whole'
  /** Manba kesiladi: mijozga bir bo'lak, omborga qoldiq. */
  | 'cut';

export interface PlanCutResult {
  error?: CutError;
  rule?: CutRule;
  /** Mijozga ketadigan bo'lak (`take-whole` da — manbaning O'ZI). */
  customer?: CutChild;
  /** Omborda qoladigan yorliqli qoldiq (chiqindi bo'lsa `null`). */
  remainder?: CutChild | null;
  /** 1 m dan kalta qoldiq — reyestrdan chiqadi (K-Q6). */
  scrap?: CutChild | null;
  /** Omborchi tuzatgan farq — reyestrdan chiqadi. */
  loss?: CutChild | null;
  /** Bosiladigan yorliqlar (mijoz bo'lagi + qoldiq). `take-whole` da bo'sh. */
  labels?: string[];
}

/**
 * Bitta kesimning rejasi. HECH NARSA yozmaydi.
 *
 * Uch qadam:
 *   1. mijozga ketadigan bo'lak ajratiladi (yorliq oladi — kassir «200 m
 *      likni oling» deganda mijoz o'zi topsin, K-reja 5-bo'lim);
 *   2. qolgani 1 m dan uzun bo'lsa — YANGI YORLIQLI bo'lak (eski yorliq
 *      YARAMAYDI: unda eski uzunlik yozilgan va odam tizimga emas, yorliqqa
 *      ishonadi — reja 5-bo'limning eng qat'iy bandi);
 *   3. 1 m dan kalta bo'lsa — chiqindi, reyestrdan chiqadi.
 *
 * `take-whole` (mijoz butun manbani oladi) ATAYLAB alohida hukm: jismonan
 * hech narsa kesilmaydi, ya'ni yangi yorliq bosish ham, yangi qator ochish
 * ham kerak emas — manbaning o'zi chek qatoriga biriktiriladi.
 */
export function planCut(input: PlanCutInput): PlanCutResult {
  const { source, startSeq } = input;
  if (source.status !== PIECE_STATUS.active) return { error: 'source-not-active' };

  const cut = normalize(input.cutLength);
  if (cut === null || compareDecimals(cut, '0') <= 0) return { error: 'cut-not-positive' };
  if (compareDecimals(cut, source.length) > 0) return { error: 'cut-exceeds-source' };

  // ── 1-hukm: mijoz manbaning HAMMASINI oladi ──────────────────────────────
  if (compareDecimals(cut, source.length) === 0) {
    return {
      rule: 'take-whole',
      customer: {
        length: source.length,
        label: source.label,
        whole: source.whole,
        status: PIECE_STATUS.active,
        reason: null,
      },
      remainder: null,
      scrap: null,
      loss: null,
      labels: [],
    };
  }

  // ── 2-hukm: kesim ────────────────────────────────────────────────────────
  const expected = subtractDecimals(source.length, cut);
  let remaining = expected;
  if (input.remainingLength !== undefined && input.remainingLength !== null) {
    const measured = normalize(input.remainingLength);
    if (measured === null || compareDecimals(measured, '0') < 0) {
      return { error: 'remaining-negative' };
    }
    // Omborchi qoldiqni faqat KAMAYTIRA oladi: kesimdan tovar KO'PAYMAYDI.
    // Ko'paytirish urinishi — o'lchov xatosi yoki noto'g'ri manba tanlangani;
    // ikkalasida ham jimgina qabul qilish reyestrni qoldiqdan uzib qo'yardi.
    if (compareDecimals(measured, expected) > 0) return { error: 'remaining-exceeds-source' };
    remaining = measured;
  }

  const loss = subtractDecimals(expected, remaining);
  const scrapRemainder = compareDecimals(remaining, '0') > 0 && isScrapLength(remaining);

  // Yorliq: mijoz bo'lagiga DOIM, qoldiqqa faqat u omborda qolsa.
  const labelCount = 1 + (compareDecimals(remaining, '0') > 0 && !scrapRemainder ? 1 : 0);
  const labels = issuePieceLabels(startSeq, labelCount);

  const customer: CutChild = {
    length: cut,
    label: labels[0] ?? null,
    whole: false,
    status: PIECE_STATUS.active,
    reason: null,
  };
  const remainder: CutChild | null =
    compareDecimals(remaining, '0') > 0 && !scrapRemainder
      ? {
          length: remaining,
          label: labels[1] ?? null,
          whole: false,
          status: PIECE_STATUS.active,
          reason: null,
        }
      : null;
  const scrap: CutChild | null = scrapRemainder
    ? {
        length: remaining,
        label: null,
        whole: false,
        status: PIECE_STATUS.consumed,
        reason: PIECE_CONSUMED_REASON.scrap,
      }
    : null;
  const lossChild: CutChild | null =
    compareDecimals(loss, '0') > 0
      ? {
          length: loss,
          label: null,
          whole: false,
          status: PIECE_STATUS.consumed,
          reason: PIECE_CONSUMED_REASON.cutLoss,
        }
      : null;

  // Zanjir invarianti — himoya qavati (yuqoridagi izoh).
  const chain = [customer, remainder, scrap, lossChild]
    .filter((c): c is CutChild => c !== null)
    .reduce((sum, c) => addDecimals(sum, c.length), '0');
  if (compareDecimals(chain, source.length) !== 0) return { error: 'chain-mismatch' };

  return { rule: 'cut', customer, remainder, scrap, loss: lossChild, labels };
}

/** Xato kodining omborchiga ko'rinadigan matni (server javobida). */
export function cutErrorMessage(error: CutError): string {
  switch (error) {
    case 'source-not-active':
      return "Bu bo'lak allaqachon reyestrdan chiqqan";
    case 'cut-not-positive':
      return "Kesilgan uzunlik noldan katta bo'lishi kerak";
    case 'cut-exceeds-source':
      return "Kesilgan uzunlik bo'lakdan uzun bo'lishi mumkin emas";
    case 'remaining-negative':
      return "Qolgan uzunlik noto'g'ri";
    case 'remaining-exceeds-source':
      return "Qolgan uzunlik «manba − kesim» dan katta bo'lishi mumkin emas — kesimdan tovar ko'paymaydi";
    case 'chain-mismatch':
      return "Kesim hisobi to'g'ri chiqmadi — qaytadan urinib ko'ring";
  }
}

// ---------------------------------------------------------------------------
// Qator YOPILISHI: kesim yozilganmi
// ---------------------------------------------------------------------------

export interface ReservedPieceLike {
  length: string;
  status: string;
}

export type CutCoverage =
  /** Bo'linadigan tovar EMAS yoki reyestr bo'sh — kesim talab qilinmaydi. */
  | 'not-required'
  /** Kesim yozilgan va so'ralgan miqdorni qoplaydi. */
  | 'covered'
  /** Bo'lak biriktirilgan, lekin yetmaydi. */
  | 'partial'
  /** Hech qanday bo'lak biriktirilmagan. */
  | 'missing';

export interface CoverageInput {
  pieceTracked: boolean;
  /** Shu tovar uchun omborda FAOL bo'lak bormi (reyestr to'ldirilganmi). */
  registryHasPieces: boolean;
  /** Qatorga biriktirilgan bo'laklar. */
  reserved: readonly ReservedPieceLike[];
  /** Qator miqdori. */
  quantity: string;
}

/**
 * Qatorni tasdiqlashdan OLDIN kesim yozilganmi.
 *
 * 🔴 `not-required` SUKUT — K3 ning `no-registry` qoidasi bilan AYNI sabab:
 * bayroq yoqilgan-u reyestr hali to'ldirilmagan holat K5 gacha NORMAL
 * (jonlida reyestr BO'SH). Kesimni majburiy qilsak birinchi kundayoq har
 * kabel yig'ishi to'xtardi — ya'ni «bo'lak hisobi» savdoni to'xtatardi.
 * Reyestr to'lgach (K5) shart o'z-o'zidan kuchga kiradi.
 */
export function evaluateCutCoverage(input: CoverageInput): CutCoverage {
  if (!input.pieceTracked) return 'not-required';
  if (!input.registryHasPieces) return 'not-required';

  const active = input.reserved.filter((p) => p.status === PIECE_STATUS.active);
  if (active.length === 0) return 'missing';

  const total = active.reduce((sum, p) => addDecimals(sum, p.length), '0');
  return compareDecimals(total, input.quantity) >= 0 ? 'covered' : 'partial';
}

/** Qator yopilishi mumkinmi (`confirm` yo'lidagi qo'riqchi). */
export function canConfirmPieceLine(coverage: CutCoverage): boolean {
  return coverage === 'not-required' || coverage === 'covered';
}

// ---------------------------------------------------------------------------
// To'lov: bo'laklar reyestrdan chiqadi
// ---------------------------------------------------------------------------

export interface SalePieceLike {
  id: string;
  reservedPositionId: string | null;
  length: string;
  status: string;
}

export interface ConsumePlan {
  /** `consumed` qilinadigan bo'lak identifikatorlari. */
  pieceIds: string[];
  /**
   * (pozitsiya → bo'laklar yig'indisi ≠ qator miqdori) nomuvofiqliklari.
   *
   * TO'XTATMAYDI: to'lov paytida chekni rad etish 2026-08-24 hodisasining
   * aynan shakli bo'lardi (tizim ishlaydi, kassa to'xtaydi). Faqat KO'RINADI
   * — chaqiruvchi log'ga yozadi (IS-5).
   */
  mismatches: Array<{ positionId: string; expected: string; pieces: string }>;
}

/**
 * `post()` uchun: mijozga ketgan bo'laklar reyestrdan chiqadi.
 *
 * Bu YAGONA joy bo'lak `sold` bo'ladigan — va u `post()` ning qoldiq ayirish
 * TRANZAKSIYASI ICHIDA chaqiriladi (K4/6-vazifa). Sabab: qoldiq kamayib
 * bo'lak reyestrda qolsa (yoki teskarisi) sverka darhol yolg'on farq berardi.
 */
export function planSaleConsumption(
  pieces: readonly SalePieceLike[],
  positions: ReadonlyArray<{ id: string; quantity: string }>,
): ConsumePlan {
  const active = pieces.filter((p) => p.status === PIECE_STATUS.active);
  const byPosition = new Map<string, string>();
  for (const p of active) {
    if (!p.reservedPositionId) continue;
    byPosition.set(
      p.reservedPositionId,
      addDecimals(byPosition.get(p.reservedPositionId) ?? '0', p.length),
    );
  }

  const mismatches: ConsumePlan['mismatches'] = [];
  for (const pos of positions) {
    const sum = byPosition.get(pos.id);
    if (sum === undefined) continue; // bo'lak biriktirilmagan — bu holat normal
    if (compareDecimals(sum, pos.quantity) !== 0) {
      mismatches.push({ positionId: pos.id, expected: pos.quantity, pieces: sum });
    }
  }

  return { pieceIds: active.map((p) => p.id), mismatches };
}
