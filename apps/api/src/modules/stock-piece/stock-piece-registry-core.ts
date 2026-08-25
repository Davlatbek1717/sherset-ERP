import { addDecimals, compareDecimals, subtractDecimals } from '../shared/decimal.js';
import {
  PIECE_STATUS,
  type PieceViolation,
  formatPieceLabel,
  isScrapLength,
  validatePiece,
} from './stock-piece-core.js';

/**
 * K2 (bo'lak reyestri boshqaruvi) — SOF yadro. Prisma yo'q, SQL yo'q.
 * Reja: `docs/plans/2026-08-25-bolinadigan-tovar-bolak-hisobi.md`, K2 fazasi.
 *
 * Uch ish qiladi:
 *   1. **Kiritish qiymatini normallashtirish** — omborchi «250,5» deb yozadi,
 *      baza esa `Decimal(20,6)` kutadi.
 *   2. **Yorliq raqamini berish** — `BLK-000041` ketma-ketligi (K1 faqat
 *      formatlagan edi: «`seq` ni kim beradi — K2 hal qiladi»).
 *   3. **Ekran ko'rinishi** — butun rulonlar GURUHLANADI (`250 m × 3`),
 *      bo'laklar esa alohida qator (K-reja 3-bo'lim: butun rulonlar
 *      almashtiriladigan, bo'laklar individ) + har yacheyka uchun sverka.
 *
 * 🔴 **K2 QOLDIQQA UMUMAN TEGMAYDI.** Bu ekran `stock_pieces` ni to'ldiradi,
 * `Stock`/`StockByCell` esa haqiqat manbai bo'lib qolaveradi. Shuning uchun
 * bu yerdagi har amal STOK-NEYTRAL: bo'lak yopilsa reyestr kamayadi va
 * sverka DARHOL farq ko'rsatadi — bu nuqson emas, K2/4-vazifaning O'ZI
 * («har o'zgarish sverkani buzsa ekranda darhol ko'rinadi»). Qoldiqning
 * o'zini tuzatish — inventarizatsiya/hisobdan chiqarish ishi (K4/K5).
 */

// ---------------------------------------------------------------------------
// 1. Uzunlik kiritish
// ---------------------------------------------------------------------------

/** `Decimal(20,6)` — butun qismi 14 raqamdan oshmaydi (20 − 6). */
const MAX_INT_DIGITS = 14;

export type LengthParseError =
  | 'empty'
  | 'not-a-number'
  | 'negative'
  | 'too-many-decimals'
  | 'too-large';

export interface LengthParseResult {
  /** Normallashgan `Decimal(20,6)` satri (`'250.5'`). */
  value?: string;
  error?: LengthParseError;
}

/**
 * Omborchi kiritgan uzunlikni bazaga yaroqli satrga aylantiradi.
 *
 * Vergul NUQTAga ATAYLAB o'giriladi: omborchining klaviaturasi (uz/ru) vergul
 * beradi va `Decimal('250,5')` jimgina yiqilardi — kesim yo'qotishi aynan
 * shunday jim yo'qoladi.
 */
export function parseLengthInput(raw: string): LengthParseResult {
  const trimmed = raw.trim().replace(',', '.').replace(/\s+/g, '');
  if (!trimmed) return { error: 'empty' };
  if (trimmed.startsWith('-')) return { error: 'negative' };
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return { error: 'not-a-number' };

  const [intPart = '0', fracPart = ''] = trimmed.split('.');
  if (fracPart.length > 6) return { error: 'too-many-decimals' };

  const normalizedInt = intPart.replace(/^0+(?=\d)/, '');
  if (normalizedInt.length > MAX_INT_DIGITS) return { error: 'too-large' };

  const normalizedFrac = fracPart.replace(/0+$/, '');
  return { value: normalizedFrac ? `${normalizedInt}.${normalizedFrac}` : normalizedInt };
}

// ---------------------------------------------------------------------------
// 2. Yorliq ketma-ketligi
// ---------------------------------------------------------------------------

/**
 * Yorliqdagi tartib raqami. `BLK-000041` → `41`; boshqa har narsa → `null`.
 * Katta-kichik harf farqsiz (skaner turlicha yuboradi — K1 `isPieceLabel`
 * bilan bir xil qoida).
 */
export function parsePieceLabelSeq(label: string): number | null {
  const m = /^BLK-(\d{6,})$/.exec(label.trim().toUpperCase());
  if (!m?.[1]) return null;
  const n = Number.parseInt(m[1], 10);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/**
 * Akkauntdagi ENG KATTA yorliqdan keyingi raqam.
 *
 * Chaqiruvchi bazadan `label DESC` bo'yicha BITTA qatorni oladi. Yorliqlar
 * 6 xonaga to'ldirilgani uchun leksikografik tartib 9 999 999 gacha raqamli
 * tartib bilan bir xil; undan keyin ham unikallik buzilmaydi, faqat raqam
 * «sakraydi» (jonli omborda erishib bo'lmaydigan chegara).
 *
 * Poyga: ikki omborchi bir vaqtda bossa ikkalasi ham bir xil raqamni oladi.
 * Buni SERVIS qayta urinish bilan yopadi, DB unikal indeksi esa oxirgi to'siq
 * bo'lib qoladi (K1 hisobotining «poyga xavfi bor» bandi).
 */
export function nextPieceSeq(maxLabel: string | null | undefined): number {
  if (!maxLabel) return 1;
  const seq = parsePieceLabelSeq(maxLabel);
  return seq === null ? 1 : seq + 1;
}

/** Ketma-ket `count` ta yorliq: `startSeq`, `startSeq+1`, … */
export function issuePieceLabels(startSeq: number, count: number): string[] {
  if (!Number.isInteger(count) || count < 1) throw new Error('piece label count must be >= 1');
  return Array.from({ length: count }, (_, i) => formatPieceLabel(startSeq + i));
}

// ---------------------------------------------------------------------------
// 3. Kiritish rejasi (create)
// ---------------------------------------------------------------------------

export interface PieceCreateDraft {
  length: string;
  whole: boolean;
  label: string | null;
  status: string;
}

export interface PlanCreateInput {
  /** Normallashgan uzunlik (`parseLengthInput` chiqishi). */
  length: string;
  /** Butun rulonmi (yorliqsiz) — K-Q3. */
  whole: boolean;
  /** Nechta bir xil qator (butun rulon: «250 × 3»). */
  count: number;
  /** Birinchi yorliq raqami (bo'laklar uchun). */
  startSeq: number;
}

export type PlanCreateError =
  | 'count-out-of-range'
  | 'length-not-positive'
  /** 1 m dan kalta — bu chiqindi, reyestrga kiritilmaydi (K-Q6). */
  | 'scrap-length';

export interface PlanCreateResult {
  drafts?: PieceCreateDraft[];
  error?: PlanCreateError;
  /** Qator qoidasini buzsa (himoya qavati — normal yo'lda bo'sh). */
  violations?: PieceViolation[];
}

/** Bir bosishda ochiladigan maksimal qator soni (tasodifiy nol qo'shilishi). */
export const MAX_CREATE_COUNT = 200;

/**
 * «Qo'shish» tugmasining rejasi. HECH NARSA yozmaydi — faqat qatorlar shaklini
 * qaytaradi va har birini K1 guardidan (`validatePiece`) o'tkazadi.
 *
 * Chiqindi chegarasi (1 m) kiritishda ham qo'llanadi: aks holda omborchi
 * 0,4 m lik qirqindini reyestrga qo'yib, uni abadiy «bor» qilib qo'yardi
 * (K-Q6 ning aynan oldini olmoqchi bo'lgan holati).
 */
export function planPieceCreation(input: PlanCreateInput): PlanCreateResult {
  const { length, whole, count, startSeq } = input;
  if (!Number.isInteger(count) || count < 1 || count > MAX_CREATE_COUNT) {
    return { error: 'count-out-of-range' };
  }
  if (compareDecimals(length, '0') <= 0) return { error: 'length-not-positive' };
  if (isScrapLength(length)) return { error: 'scrap-length' };

  const labels = whole ? null : issuePieceLabels(startSeq, count);
  const drafts: PieceCreateDraft[] = Array.from({ length: count }, (_, i) => ({
    length,
    whole,
    label: labels ? (labels[i] ?? null) : null,
    status: PIECE_STATUS.active,
  }));

  for (const d of drafts) {
    const violations = validatePiece(d);
    if (violations.length > 0) return { violations };
  }
  return { drafts };
}

// ---------------------------------------------------------------------------
// 4. Ekran ko'rinishi
// ---------------------------------------------------------------------------

export interface RegistryPieceInput {
  id: string;
  cellId: string | null;
  length: string;
  whole: boolean;
  label: string | null;
  status: string;
  sourcePieceId: string | null;
  updatedAt: string;
}

export interface RegistryCellStock {
  cellId: string;
  qty: string;
}

export interface RegistryCellName {
  id: string;
  name: string;
}

export interface BuildRegistryInput {
  /** Doiradagi (ombor × tovar) bo'laklar (`consumed` lari ham). */
  pieces: readonly RegistryPieceInput[];
  /** Yacheykalardagi qoldiq (`StockByCell`). */
  cellStock: readonly RegistryCellStock[];
  /** Ombordagi JAMI qoldiq (`Stock`) — yacheykasiz bo'g'in shundan chiqadi. */
  storeQty: string;
  cells: readonly RegistryCellName[];
}

export interface RegistryWholeGroup {
  length: string;
  count: number;
  /** Guruhdagi qatorlar (bittasini yopish/tuzatish uchun kerak). */
  pieceIds: string[];
}

export interface RegistryPieceRow {
  id: string;
  label: string | null;
  length: string;
  sourcePieceId: string | null;
  updatedAt: string;
  /** Qator model qoidasini buzsa — ekranda qizil (K1 `validatePiece`). */
  violations: PieceViolation[];
}

export type RegistryDiffStatus = 'ok' | 'excess' | 'missing';

export interface RegistryCellGroup {
  /** NULL = ombordagi yacheykasiz («Yacheykasiz») hovuz. */
  cellId: string | null;
  cellName: string | null;
  stockQty: string;
  registryQty: string;
  diffQty: string;
  status: RegistryDiffStatus;
  wholeGroups: RegistryWholeGroup[];
  pieces: RegistryPieceRow[];
  /** Yacheykadagi eng uzun UZLUKSIZ bo'lak (butun rulon ham sanaladi). */
  longest: string | null;
}

export interface RegistryView {
  cells: RegistryCellGroup[];
  totals: {
    stockQty: string;
    registryQty: string;
    diffQty: string;
    status: RegistryDiffStatus;
    activePieces: number;
    wholeCount: number;
    /** Butun ombor bo'yicha eng uzun uzluksiz — K3 shu sondan foydalanadi. */
    longest: string | null;
  };
  /** Qoidani buzgan FAOL qatorlar soni (ekranda ogohlantirish bo'ladi). */
  invalidPieces: number;
  /** 1 m dan kalta FAOL qatorlar — chiqindi, hisobdan chiqarilishi kerak. */
  scrapPieces: number;
}

function diffStatus(diff: string): RegistryDiffStatus {
  const cmp = compareDecimals(diff, '0');
  return cmp === 0 ? 'ok' : cmp > 0 ? 'excess' : 'missing';
}

function longerOf(a: string | null, b: string): string {
  return a === null || compareDecimals(b, a) > 0 ? b : a;
}

/**
 * (Ombor × tovar) doirasidagi reyestr ko'rinishi.
 *
 * Sverka bu yerda ham IKKI QATLAMLI — K1 dagi `buildPieceReconciliation` bilan
 * AYNAN bir xil qoida (yacheykali bo'g'in `StockByCell` ga, yacheykasiz bo'g'in
 * `Stock − Σ StockByCell` ga solishtiriladi). Ikkalasi bir sondan chiqishi
 * `stock-piece-registry-core.test.ts` da qulflangan: ekran bir son, hisobot
 * boshqa son ko'rsatsa omborchi qaysi biriga ishonishini bilmasdi.
 *
 * FAQAT `status='active'` qatorlar sanaladi (`consumed` — ketgan yoki hisobdan
 * chiqarilgan, u qoldiqda ham yo'q).
 */
export function buildRegistryView(input: BuildRegistryInput): RegistryView {
  const cellName = new Map(input.cells.map((c) => [c.id, c.name]));

  // --- Qoldiq bo'g'inlari ---------------------------------------------------
  const stockByCell = new Map<string, string>();
  let celledSum = '0';
  for (const row of input.cellStock) {
    stockByCell.set(row.cellId, addDecimals(stockByCell.get(row.cellId) ?? '0', row.qty));
    celledSum = addDecimals(celledSum, row.qty);
  }
  const uncelledStock = subtractDecimals(input.storeQty, celledSum);

  // --- Reyestr --------------------------------------------------------------
  interface Acc {
    registryQty: string;
    whole: Map<string, RegistryWholeGroup>;
    pieces: RegistryPieceRow[];
    longest: string | null;
  }
  const acc = new Map<string, Acc>();
  const keyOf = (cellId: string | null): string => cellId ?? '';
  const ensure = (cellId: string | null): Acc => {
    const k = keyOf(cellId);
    let a = acc.get(k);
    if (!a) {
      a = { registryQty: '0', whole: new Map(), pieces: [], longest: null };
      acc.set(k, a);
    }
    return a;
  };

  let activePieces = 0;
  let wholeCount = 0;
  let invalidPieces = 0;
  let scrapPieces = 0;

  for (const p of input.pieces) {
    if (p.status !== PIECE_STATUS.active) continue;
    activePieces += 1;
    const a = ensure(p.cellId);
    a.registryQty = addDecimals(a.registryQty, p.length);
    a.longest = longerOf(a.longest, p.length);

    const violations = validatePiece(p);
    if (violations.length > 0) invalidPieces += 1;
    if (isScrapLength(p.length)) scrapPieces += 1;

    if (p.whole) {
      wholeCount += 1;
      const g = a.whole.get(p.length);
      if (g) {
        g.count += 1;
        g.pieceIds.push(p.id);
      } else {
        a.whole.set(p.length, { length: p.length, count: 1, pieceIds: [p.id] });
      }
    } else {
      a.pieces.push({
        id: p.id,
        label: p.label,
        length: p.length,
        sourcePieceId: p.sourcePieceId,
        updatedAt: p.updatedAt,
        violations,
      });
    }
  }

  // --- Guruhlar -------------------------------------------------------------
  // Qoldig'i BOR yoki reyestrida qatori BOR har yacheyka ko'rinadi: «qoldiq
  // bor, reyestr bo'sh» aynan omborchi to'ldirishi kerak bo'lgan holat.
  const cellIds = new Set<string>(stockByCell.keys());
  for (const p of input.pieces) {
    if (p.status === PIECE_STATUS.active && p.cellId) cellIds.add(p.cellId);
  }

  const groups: RegistryCellGroup[] = [];
  const push = (cellId: string | null, stockQty: string): void => {
    const a = acc.get(keyOf(cellId));
    const registryQty = a?.registryQty ?? '0';
    const empty = !a || (a.whole.size === 0 && a.pieces.length === 0);
    // Ikkala tomoni ham nol va qatori yo'q bo'g'in — shovqin, ko'rsatilmaydi.
    if (compareDecimals(stockQty, '0') === 0 && compareDecimals(registryQty, '0') === 0 && empty) {
      return;
    }
    const diff = subtractDecimals(registryQty, stockQty);
    groups.push({
      cellId,
      cellName: cellId ? (cellName.get(cellId) ?? cellId) : null,
      stockQty,
      registryQty,
      diffQty: diff,
      status: diffStatus(diff),
      wholeGroups: [...(a?.whole.values() ?? [])].sort((x, y) =>
        compareDecimals(y.length, x.length),
      ),
      pieces: [...(a?.pieces ?? [])].sort((x, y) => compareDecimals(y.length, x.length)),
      longest: a?.longest ?? null,
    });
  };

  push(null, uncelledStock);
  const sortedCells = [...cellIds].sort((x, y) =>
    (cellName.get(x) ?? x).localeCompare(cellName.get(y) ?? y),
  );
  for (const cellId of sortedCells) push(cellId, stockByCell.get(cellId) ?? '0');

  const registryTotal = groups.reduce((s, g) => addDecimals(s, g.registryQty), '0');
  const diffTotal = subtractDecimals(registryTotal, input.storeQty);
  const longest = groups.reduce<string | null>(
    (best, g) => (g.longest === null ? best : longerOf(best, g.longest)),
    null,
  );

  return {
    cells: groups,
    totals: {
      stockQty: input.storeQty,
      registryQty: registryTotal,
      diffQty: diffTotal,
      status: diffStatus(diffTotal),
      activePieces,
      wholeCount,
      longest,
    },
    invalidPieces,
    scrapPieces,
  };
}
