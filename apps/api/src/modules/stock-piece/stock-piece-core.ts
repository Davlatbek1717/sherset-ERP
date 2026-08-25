import {
  addDecimals,
  compareDecimals,
  parseDecimalScaled,
  subtractDecimals,
} from '../shared/decimal.js';

/**
 * K1 (bo'linadigan tovar — kabel/sim/shlang) — bo'lak reyestrining SOF yadrosi.
 * Prisma yo'q, SQL yo'q, faqat hisob va qoidalar.
 * Reja: `docs/plans/2026-08-25-bolinadigan-tovar-bolak-hisobi.md`.
 *
 * Ikki ish qiladi:
 *   1. **Guardlar** — modelning qat'iy qoidalari (`whole` ⟹ yorliqsiz, bo'lak
 *      yorliq bilan, `BLK-` makoni, uzunlik musbat). Ular migratsiyada CHECK
 *      bo'lib ham turibdi, lekin lokal `prisma db push` bilan qurilgan bazada
 *      CHECK BO'LMAYDI (push sxemadan quradi, sxema esa CHECK'ni ifodalay
 *      olmaydi) — shuning uchun ikkinchi qavat SHU YERDA va testlar bilan
 *      qulflangan. K2 (bo'lak kiritish ekrani) yozishdan oldin shuni chaqiradi.
 *   2. **Sverka** — reyestr va qoldiq mos keladimi.
 *
 * NEGA SVERKA «kassa to'xtamaydi» bo'lishi SHART (K-reja 10-bo'lim, 5-band):
 * bo'lak reyestri qoldiqning YONIDA turadi, uning O'RNIDA emas. Eng yomon
 * holatda reyestr noto'g'ri bo'ladi va sverka buni ko'rsatadi — kassa esa
 * avvalgidek ishlayveradi. 2026-08-24 da savdo aynan qoldiq mexanizmiga
 * tegilgani uchun 46 daqiqa to'xtagan edi
 * (`docs/plans/2026-08-24-split-kassa-hodisasi.md`).
 */

// ---------------------------------------------------------------------------
// Yorliq makoni (K-reja 7.3)
// ---------------------------------------------------------------------------

/**
 * Bo'lak yorlig'ining prefiksi. **Bu qiymatning YAGONA uyi shu yer** —
 * `tsd-scan.ts` uni shundan import qiladi (`PIECE_CODE_PREFIX`).
 *
 * Nega alohida makon: G-rejada tovar shtrixlari ATAYLAB unikal EMAS va har
 * skaner mijozi multi-hit tanlovni qo'llaydi. Bo'lak yorlig'i esa aynan BITTA
 * jismoniy bo'lakni bildiradi. Ikkalasi bir qidiruvga tushsa omborchi bo'lakni
 * skanerlaganda TOVAR tanlovi ochilib, kesim oqimi quladi.
 */
export const PIECE_LABEL_PREFIX = 'BLK-';

/** `BLK-` + kamida 6 raqam. Tovar shtrixlariga (EAN13/Code128) o'xshamaydi. */
const PIECE_LABEL_RE = /^BLK-\d{6,}$/;

/** Kod bo'lak yorlig'imi (katta-kichik harf farqsiz — skaner turlicha yuboradi). */
export function isPieceLabel(code: string): boolean {
  return PIECE_LABEL_RE.test(code.trim().toUpperCase());
}

/** Ketma-ket raqamdan yorliq: `41` -> `BLK-000041`. K2 shundan foydalanadi. */
export function formatPieceLabel(seq: number): string {
  if (!Number.isInteger(seq) || seq < 1) {
    throw new Error('piece label seq must be a positive integer');
  }
  return `${PIECE_LABEL_PREFIX}${String(seq).padStart(6, '0')}`;
}

// ---------------------------------------------------------------------------
// Holat lug'ati
// ---------------------------------------------------------------------------

/** `active` — omborda, sverkaga kiradi. `consumed` — ketgan/hisobdan chiqarilgan. */
export const PIECE_STATUS = { active: 'active', consumed: 'consumed' } as const;
export type PieceStatus = (typeof PIECE_STATUS)[keyof typeof PIECE_STATUS];

const KNOWN_STATUSES: readonly string[] = [PIECE_STATUS.active, PIECE_STATUS.consumed];

/**
 * Eng kichik FOYDALI bo'lak — 1 m (egasi, K-Q6). Undan kaltasi chiqindi va
 * hisobdan chiqariladi (K4), aks holda qoldiqda «bor» bo'lib turaveradi.
 */
export const MIN_USEFUL_LENGTH = '1';

/** Qolgan uzunlik chiqindimi (1 m dan kalta). */
export function isScrapLength(length: string): boolean {
  return compareDecimals(length, MIN_USEFUL_LENGTH) < 0;
}

// ---------------------------------------------------------------------------
// Guard
// ---------------------------------------------------------------------------

export interface PieceDraft {
  /** Decimal(20,6) satri. */
  length: string;
  whole: boolean;
  label: string | null;
  status: string;
}

export type PieceViolation =
  /** Butun rulonda yorliq bor — K-Q3 buzilgan. */
  | 'whole-with-label'
  /** Bo'lak yorliqsiz — u holda uni skanerlab topib bo'lmaydi (K-reja 5-bo'lim). */
  | 'piece-without-label'
  /** Yorliq `BLK-` makonida emas — tovar shtrixi bilan aralashadi (7.3). */
  | 'label-outside-piece-space'
  /** Uzunlik manfiy. */
  | 'length-negative'
  /** Faol bo'lakning uzunligi nol — sverkani jimgina chalg'itadi. */
  | 'active-length-not-positive'
  /** Notanish holat — sverkadan jimgina tushib qolardi. */
  | 'unknown-status';

/**
 * Bo'lak qatorining qoidalarini tekshiradi. Bo'sh massiv = joyida.
 *
 * Bu funksiya HECH NARSA yozmaydi va hech nimani to'xtatmaydi — chaqiruvchi
 * qaror qiladi: K2 yozishdan oldin RAD etadi, sverka esa mavjud qatorlarda
 * OGOHLANTIRISH sifatida ko'rsatadi (kassa to'xtamaydi).
 */
export function validatePiece(draft: PieceDraft): PieceViolation[] {
  const out: PieceViolation[] = [];
  const label = draft.label?.trim() ?? '';

  if (draft.whole && label) out.push('whole-with-label');
  if (!draft.whole && !label) out.push('piece-without-label');
  if (label && !isPieceLabel(label)) out.push('label-outside-piece-space');

  const scaled = parseDecimalScaled(draft.length);
  if (scaled < 0n) out.push('length-negative');
  else if (draft.status === PIECE_STATUS.active && scaled === 0n) {
    out.push('active-length-not-positive');
  }

  if (!KNOWN_STATUSES.includes(draft.status)) out.push('unknown-status');

  return out;
}

/** `validatePiece` ning otiladigan varianti — yozish yo'llari uchun (K2). */
export function assertValidPiece(draft: PieceDraft): void {
  const violations = validatePiece(draft);
  if (violations.length > 0) {
    throw new Error(`invalid stock piece: ${violations.join(', ')}`);
  }
}

// ---------------------------------------------------------------------------
// Sverka
// ---------------------------------------------------------------------------

export interface ReconProduct {
  id: string;
  name: string;
  code: string | null;
  uom: string | null;
  pieceTracked: boolean;
}

export interface ReconStore {
  id: string;
  name: string;
}

export interface ReconCell {
  id: string;
  name: string;
}

/** `stock_pieces` qatori (faol ham, consumed ham — filtr yadroda). */
export interface ReconPiece {
  storeId: string;
  cellId: string | null;
  assortmentKind: string;
  assortmentId: string;
  length: string;
  whole: boolean;
  label: string | null;
  status: string;
}

/** `stock_by_cell` qatori. */
export interface ReconCellStock {
  storeId: string;
  cellId: string;
  assortmentKind: string;
  assortmentId: string;
  qty: string;
}

/** `stocks` qatori (ombor jamisi). */
export interface ReconStoreStock {
  storeId: string;
  assortmentKind: string;
  assortmentId: string;
  qty: string;
}

export interface ReconInput {
  /** Bayrog'i YOQILGAN tovarlar (sverka mezoni) + reyestrda uchraydigan boshqalari. */
  products: readonly ReconProduct[];
  stores: readonly ReconStore[];
  cells: readonly ReconCell[];
  pieces: readonly ReconPiece[];
  cellStock: readonly ReconCellStock[];
  storeStock: readonly ReconStoreStock[];
  /** Qaytariladigan qator chegarasi (0 = cheksiz). Kesilgani `truncated` da. */
  limit?: number;
  /** Faqat farqli qatorlar. */
  onlyDiff?: boolean;
}

export type ReconRowStatus = 'ok' | 'excess' | 'missing';

export interface ReconRow {
  storeId: string;
  storeName: string;
  /** NULL = ombordagi yacheykasiz («Без ячейки») qoldiq. */
  cellId: string | null;
  cellName: string | null;
  assortmentKind: string;
  assortmentId: string;
  productName: string | null;
  productCode: string | null;
  uom: string | null;
  /** Qoldiq (haqiqat manbai). */
  stockQty: string;
  /** Reyestr: faol bo'laklar yig'indisi. */
  registryQty: string;
  /** `registryQty - stockQty`. Musbat = reyestrda ortiqcha. */
  diffQty: string;
  pieceCount: number;
  wholeCount: number;
  status: ReconRowStatus;
}

export type ReconWarningCode =
  /** Reyestrda bo'lagi bor, lekin tovarning bayrog'i O'CHIQ. */
  | 'pieces-without-flag'
  /** Qator model qoidasini buzadi (`validatePiece`). */
  | 'invalid-piece';

export interface ReconWarning {
  code: ReconWarningCode;
  assortmentKind: string;
  assortmentId: string;
  productName: string | null;
  /** `invalid-piece` uchun — buzilgan qoidalar. */
  violations?: PieceViolation[];
  /** Nechta qator shu ogohlantirishga tushdi. */
  count: number;
}

export interface ReconReport {
  totals: {
    /** Bayrog'i yoqilgan tovarlar soni. */
    trackedProducts: number;
    /** Tekshirilgan (ombor x yacheyka x tovar) bo'g'inlari. */
    buckets: number;
    /** Farq topilgan bo'g'inlar. */
    diffBuckets: number;
    /** Reyestrdagi faol bo'laklar soni. */
    activePieces: number;
    stockQty: string;
    registryQty: string;
    diffQty: string;
  };
  rows: ReconRow[];
  warnings: ReconWarning[];
  /** Chegara tufayli KO'RSATILMAGAN qatorlar soni (jim kesish yo'q). */
  truncated: number;
}

function bucketKey(storeId: string, cellId: string | null, kind: string, id: string): string {
  return `${storeId} ${cellId ?? ''} ${kind} ${id}`;
}

interface Bucket {
  storeId: string;
  cellId: string | null;
  assortmentKind: string;
  assortmentId: string;
  stockQty: string;
  registryQty: string;
  pieceCount: number;
  wholeCount: number;
}

/**
 * Reyestr <-> qoldiq sverkasi.
 *
 * IKKI QATLAM (G-reja E1 bilan bir sabab): qoldiqning ~94 % i jonlida hech
 * bir yacheykaga biriktirilmagan. Shuning uchun har (ombor x tovar) uchun
 * IKKI xil bo'g'in tekshiriladi:
 *   (a) yacheykali — `StockByCell.qty`;
 *   (b) yacheykasiz — `Stock.qty - Sum(StockByCell.qty)` (`cellId = null`).
 * Ikkalasining yig'indisi ombor jamisiga teng, ya'ni tovarning HAR donasi
 * sverkaga kiradi va reyestr «yarim to'la» bo'lib qolmaydi.
 *
 * Faqat `status='active'` bo'laklar sanaladi: `consumed` — mijozga ketgan yoki
 * hisobdan chiqarilgan, u qoldiqda ham yo'q.
 */
export function buildPieceReconciliation(input: ReconInput): ReconReport {
  const productById = new Map(input.products.map((p) => [p.id, p]));
  const storeName = new Map(input.stores.map((s) => [s.id, s.name]));
  const cellName = new Map(input.cells.map((c) => [c.id, c.name]));

  const tracked = new Set(input.products.filter((p) => p.pieceTracked).map((p) => p.id));

  // --- 1. Qoldiq bo'g'inlari ------------------------------------------------
  const buckets = new Map<string, Bucket>();
  const ensure = (storeId: string, cellId: string | null, kind: string, id: string): Bucket => {
    const key = bucketKey(storeId, cellId, kind, id);
    let b = buckets.get(key);
    if (!b) {
      b = {
        storeId,
        cellId,
        assortmentKind: kind,
        assortmentId: id,
        stockQty: '0',
        registryQty: '0',
        pieceCount: 0,
        wholeCount: 0,
      };
      buckets.set(key, b);
    }
    return b;
  };

  // Yacheykali qoldiq + (ombor x tovar) bo'yicha yacheykalar yig'indisi.
  const celledSum = new Map<string, string>();
  for (const row of input.cellStock) {
    if (!tracked.has(row.assortmentId)) continue;
    ensure(row.storeId, row.cellId, row.assortmentKind, row.assortmentId).stockQty = row.qty;
    const k = bucketKey(row.storeId, null, row.assortmentKind, row.assortmentId);
    celledSum.set(k, addDecimals(celledSum.get(k) ?? '0', row.qty));
  }

  // Yacheykasiz qoldiq = ombor jamisi - yacheykalardagi.
  for (const row of input.storeStock) {
    if (!tracked.has(row.assortmentId)) continue;
    const k = bucketKey(row.storeId, null, row.assortmentKind, row.assortmentId);
    const uncelled = subtractDecimals(row.qty, celledSum.get(k) ?? '0');
    ensure(row.storeId, null, row.assortmentKind, row.assortmentId).stockQty = uncelled;
  }

  // --- 2. Reyestr -----------------------------------------------------------
  const warnCounts = new Map<string, ReconWarning>();
  const addWarning = (w: Omit<ReconWarning, 'count'>): void => {
    const key = `${w.code} ${w.assortmentKind} ${w.assortmentId} ${(w.violations ?? []).join(',')}`;
    const found = warnCounts.get(key);
    if (found) found.count += 1;
    else warnCounts.set(key, { ...w, count: 1 });
  };

  let activePieces = 0;
  for (const piece of input.pieces) {
    const product = productById.get(piece.assortmentId);
    const violations = validatePiece(piece);
    if (violations.length > 0) {
      addWarning({
        code: 'invalid-piece',
        assortmentKind: piece.assortmentKind,
        assortmentId: piece.assortmentId,
        productName: product?.name ?? null,
        violations,
      });
    }
    if (piece.status !== PIECE_STATUS.active) continue;
    activePieces += 1;

    if (!tracked.has(piece.assortmentId)) {
      // Bayroq o'chiq, reyestr esa to'la — jim qolish IS-5 xatosi bo'lardi.
      addWarning({
        code: 'pieces-without-flag',
        assortmentKind: piece.assortmentKind,
        assortmentId: piece.assortmentId,
        productName: product?.name ?? null,
      });
      continue;
    }

    const b = ensure(piece.storeId, piece.cellId, piece.assortmentKind, piece.assortmentId);
    b.registryQty = addDecimals(b.registryQty, piece.length);
    b.pieceCount += 1;
    if (piece.whole) b.wholeCount += 1;
  }

  // --- 3. Qatorlar ----------------------------------------------------------
  let totalStock = '0';
  let totalRegistry = '0';
  let diffBuckets = 0;
  const rows: ReconRow[] = [];

  for (const b of buckets.values()) {
    // Ikkala tomoni ham nol bo'g'in shovqin (masalan qoldig'i tugagan yacheyka).
    if (b.stockQty === '0' && b.registryQty === '0' && b.pieceCount === 0) continue;

    const diff = subtractDecimals(b.registryQty, b.stockQty);
    const cmp = compareDecimals(diff, '0');
    if (cmp !== 0) diffBuckets += 1;

    totalStock = addDecimals(totalStock, b.stockQty);
    totalRegistry = addDecimals(totalRegistry, b.registryQty);

    const product = productById.get(b.assortmentId);
    rows.push({
      storeId: b.storeId,
      storeName: storeName.get(b.storeId) ?? b.storeId,
      cellId: b.cellId,
      cellName: b.cellId ? (cellName.get(b.cellId) ?? b.cellId) : null,
      assortmentKind: b.assortmentKind,
      assortmentId: b.assortmentId,
      productName: product?.name ?? null,
      productCode: product?.code ?? null,
      uom: product?.uom ?? null,
      stockQty: b.stockQty,
      registryQty: b.registryQty,
      diffQty: diff,
      pieceCount: b.pieceCount,
      wholeCount: b.wholeCount,
      status: cmp === 0 ? 'ok' : cmp > 0 ? 'excess' : 'missing',
    });
  }

  // Farqlar birinchi (kattaligi bo'yicha), so'ng ombor -> tovar -> yacheyka.
  const abs = (v: string): bigint => {
    const s = parseDecimalScaled(v);
    return s < 0n ? -s : s;
  };
  rows.sort((a, x) => {
    const da = abs(a.diffQty);
    const dx = abs(x.diffQty);
    if (da !== dx) return da > dx ? -1 : 1;
    return (
      a.storeName.localeCompare(x.storeName) ||
      (a.productName ?? '').localeCompare(x.productName ?? '') ||
      (a.cellName ?? '').localeCompare(x.cellName ?? '')
    );
  });

  const visible = input.onlyDiff ? rows.filter((r) => r.status !== 'ok') : rows;
  const limit = input.limit ?? 0;
  const capped = limit > 0 ? visible.slice(0, limit) : visible;

  return {
    totals: {
      trackedProducts: tracked.size,
      buckets: rows.length,
      diffBuckets,
      activePieces,
      stockQty: totalStock,
      registryQty: totalRegistry,
      diffQty: subtractDecimals(totalRegistry, totalStock),
    },
    rows: capped,
    warnings: [...warnCounts.values()],
    truncated: visible.length - capped.length,
  };
}
