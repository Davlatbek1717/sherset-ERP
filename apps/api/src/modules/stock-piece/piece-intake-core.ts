import { addDecimals, compareDecimals } from '../shared/decimal.js';
import { PIECE_STATUS, isPieceLabel, isScrapLength } from './stock-piece-core.js';
import { issuePieceLabels, parseLengthInput } from './stock-piece-registry-core.js';

/**
 * K5 (bo'linadigan tovar — OMMAVIY KIRITISH) — SOF yadro.
 * Prisma yo'q, SQL yo'q, Nest yo'q. Reja:
 * `docs/plans/2026-08-25-bolinadigan-tovar-bolak-hisobi.md`, K5 fazasi.
 *
 * ---------------------------------------------------------------------------
 * 🔷 K5 NIMA UCHUN KERAK
 *
 * K1 modelni qurdi, K2 qo'lda kiritish ekranini berdi, K3 kassirga ko'rsatdi,
 * K4 kesimni yozdi. Lekin reyestr HAMON qo'lda to'ldiriladi — ya'ni:
 *   (a) birinchi to'ldirish 4428 tovar uchun amalda bajarib bo'lmaydigan ish;
 *   (b) yangi kelgan rulonlar reyestrga TUSHMAYDI va u har priyomkadan keyin
 *       eskiradi (K-reja 8-bo'lim, K5 maqsadi).
 * K5 uchta HAQIQIY ish oqimini reyestrga ulaydi: SANASH, PRIYOMKA, VOZVRAT.
 *
 * ---------------------------------------------------------------------------
 * 🔴 QOLDIQQA TEGILMAYDI — K1…K4 bilan AYNI intizom.
 *
 * Bu modul `Stock`/`StockByCell` so'zini umuman bilmaydi. Sanash qoldiqni
 * o'zgartiradi (bu inventarizatsiyaning O'Z ishi, `inventory.service` orqali),
 * bo'lak reyestri esa uning YONIDA hizalanadi. Ikkalasi BIR tranzaksiyada
 * yuradi — aks holda qoldiq to'g'rilanib reyestr eski qolardi va sverka
 * yolg'on farq berardi.
 *
 * ---------------------------------------------------------------------------
 * 🔷 KANONIK MATN FORMATI (`pieceEntry`)
 *
 *     250x3 + BLK-000041:200 + ?:150
 *     └───┘   └────────────┘   └───┘
 *     butun    mavjud bo'lak   yangi bo'lak
 *     rulon    (yorlig'i bor)  (yorliq beriladi)
 *
 * JSON EMAS, ataylab: bu matn omborchining ekranida shundoq turadi, DB'da
 * odam o'qiy oladi va K4 ning `retail_sale_positions.piece_lengths` («150+30»)
 * naqshi bilan bir oilada (bir xil `+` ajratgichi, bir xil `parseLengthInput`
 * — ya'ni vergul ham nuqtaga o'giriladi).
 *
 * NEGA butun rulon va bo'lak BOSHQA-BOSHQA yoziladi (K-Q3): butun rulonlar
 * bir-biridan farq qilmaydi (uchala 250 m bir xil) va yorliq OLMAYDI — ular
 * uchun faqat «uzunlik × soni» kerak. Bo'lak esa individ: uning yorlig'i BOR
 * va sanashda omborchi o'sha yorliqni SKANERLAYDI. Shu sabab yorliqli bo'lak
 * sanalganda YANGI yorliq bosilmaydi — mavjud qator joyida qoladi
 * (`planRecount` → `keep`). Bu K-rejaning «yorliqqa ishoniladi» qoidasini
 * buzmaydi va omborchini keraksiz qayta bosishdan qutqaradi.
 */

// ---------------------------------------------------------------------------
// Chegaralar
// ---------------------------------------------------------------------------

/** Bitta kiritishdagi maksimal guruh soni (matn uzunligi tuzog'iga qarshi). */
export const MAX_INTAKE_GROUPS = 100;

/** Bitta kiritishdan chiqadigan maksimal JISMONIY bo'lak soni. */
export const MAX_INTAKE_PIECES = 500;

/** Butun rulon guruhidagi maksimal son (`250x3`). */
export const MAX_WHOLE_COUNT = 200;

/** Yorliqsiz yangi bo'lak belgisi: `?:150`. */
export const NEW_PIECE_MARK = '?';

const GROUP_SEPARATOR = '+';
const COUNT_SEPARATOR = /[x×*]/i;
const LABEL_SEPARATOR = ':';

// ---------------------------------------------------------------------------
// 1. Kiritish matnini o'qish
// ---------------------------------------------------------------------------

/** Butun rulon guruhi: `250x3`. Yorliq OLMAYDI (K-Q3). */
export interface WholeGroupEntry {
  length: string;
  count: number;
}

/** Individ bo'lak: `BLK-000041:200` (mavjud) yoki `?:150` (yangi). */
export interface PieceEntryItem {
  /** NULL = yorliq hali yo'q, kiritishda beriladi. */
  label: string | null;
  length: string;
}

export type IntakeParseError =
  | 'empty'
  /** Guruhni umuman o'qib bo'lmadi. */
  | 'bad-group'
  /** Uzunlik son emas / manfiy / 6 xonadan ko'p kasr. */
  | 'bad-length'
  /** `x` dan keyingi son butun va 1..200 emas. */
  | 'bad-count'
  /** Yorliq `BLK-` makonidan tashqarida (7.3). */
  | 'bad-label'
  /** Bir yorliq ikki marta sanaldi — jismonan mumkin emas. */
  | 'duplicate-label'
  /** 1 m dan kalta — chiqindi, reyestrga kirmaydi (K-Q6). */
  | 'scrap-length'
  | 'too-many-groups'
  | 'too-many-pieces';

export interface IntakeEntry {
  whole: WholeGroupEntry[];
  pieces: PieceEntryItem[];
  /** Σ uzunlik — `quantity`/`actualQty` bilan solishtiriladi. */
  total: string;
  /** Jismoniy bo'laklar soni (butun rulonlar ham sanaladi). */
  pieceCount: number;
}

export interface IntakeParseResult {
  entry?: IntakeEntry;
  error?: IntakeParseError;
  /** Xato qaysi guruhda (odamga ko'rsatish uchun, 1 dan boshlab). */
  groupIndex?: number;
}

/**
 * `«250x3+BLK-000041:200+?:150»` → tuzilgan kiritish.
 *
 * Xato JIMGINA yutilmaydi (K4 `parsePieceLengths` dan farqi shu): sanash va
 * priyomka natijasi `quantity` ga TENG bo'lishi shart, ya'ni bitta tushib
 * qolgan guruh jimgina noto'g'ri miqdorga olib borardi. Shuning uchun bu yerda
 * har xato KODI bilan qaytadi va chaqiruvchi 400 beradi.
 */
export function parsePieceEntry(raw: string | null | undefined): IntakeParseResult {
  const text = (raw ?? '').trim();
  if (!text) return { error: 'empty' };

  const parts = text
    .split(GROUP_SEPARATOR)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (parts.length === 0) return { error: 'empty' };
  if (parts.length > MAX_INTAKE_GROUPS) return { error: 'too-many-groups' };

  const whole: WholeGroupEntry[] = [];
  const pieces: PieceEntryItem[] = [];
  const seenLabels = new Set<string>();
  let total = '0';
  let pieceCount = 0;

  for (const [i, part] of parts.entries()) {
    const groupIndex = i + 1;

    // ── Bo'lak: `BLK-000041:200` yoki `?:150` ──────────────────────────────
    if (part.includes(LABEL_SEPARATOR)) {
      const sep = part.indexOf(LABEL_SEPARATOR);
      const labelRaw = part.slice(0, sep).trim();
      const lengthRaw = part.slice(sep + 1).trim();

      const { value: length } = parseLengthInput(lengthRaw);
      if (length === undefined) return { error: 'bad-length', groupIndex };
      if (compareDecimals(length, '0') <= 0) return { error: 'bad-length', groupIndex };
      if (isScrapLength(length)) return { error: 'scrap-length', groupIndex };

      let label: string | null = null;
      if (labelRaw !== NEW_PIECE_MARK && labelRaw !== '') {
        const upper = labelRaw.toUpperCase();
        if (!isPieceLabel(upper)) return { error: 'bad-label', groupIndex };
        if (seenLabels.has(upper)) return { error: 'duplicate-label', groupIndex };
        seenLabels.add(upper);
        label = upper;
      }

      pieces.push({ label, length });
      total = addDecimals(total, length);
      pieceCount += 1;
      if (pieceCount > MAX_INTAKE_PIECES) return { error: 'too-many-pieces', groupIndex };
      continue;
    }

    // ── Butun rulon: `250x3` yoki `250` ────────────────────────────────────
    const [lengthRaw = '', countRaw] = part.split(COUNT_SEPARATOR).map((s) => s.trim());
    const { value: length } = parseLengthInput(lengthRaw);
    if (length === undefined) return { error: 'bad-length', groupIndex };
    if (compareDecimals(length, '0') <= 0) return { error: 'bad-length', groupIndex };
    if (isScrapLength(length)) return { error: 'scrap-length', groupIndex };

    let count = 1;
    if (countRaw !== undefined) {
      if (!/^\d+$/.test(countRaw)) return { error: 'bad-count', groupIndex };
      count = Number.parseInt(countRaw, 10);
      if (count < 1 || count > MAX_WHOLE_COUNT) return { error: 'bad-count', groupIndex };
    }
    if (part.split(COUNT_SEPARATOR).length > 2) return { error: 'bad-group', groupIndex };

    whole.push({ length, count });
    for (let n = 0; n < count; n++) total = addDecimals(total, length);
    pieceCount += count;
    if (pieceCount > MAX_INTAKE_PIECES) return { error: 'too-many-pieces', groupIndex };
  }

  return { entry: { whole, pieces, total, pieceCount } };
}

/** Xato kodining odamga ko'rinadigan matni (server javobida). */
export function intakeErrorMessage(error: IntakeParseError, groupIndex?: number): string {
  const at = groupIndex ? ` (${groupIndex}-guruh)` : '';
  switch (error) {
    case 'empty':
      return "Bo'lak tarkibi kiritilmagan";
    case 'bad-group':
      return `Tarkibni o'qib bo'lmadi${at} — namuna: «250x3 + BLK-000041:200 + ?:150»`;
    case 'bad-length':
      return `Uzunlik noto'g'ri${at}`;
    case 'bad-count':
      return `Rulonlar soni 1..${MAX_WHOLE_COUNT} oralig'ida butun son bo'lishi kerak${at}`;
    case 'bad-label':
      return `Yorliq «BLK-» makonida emas${at} — yangi bo'lak uchun «?» yozing`;
    case 'duplicate-label':
      return `Bitta yorliq ikki marta kiritilgan${at}`;
    case 'scrap-length':
      return `1 m dan kalta qoldiq CHIQINDI — reyestrga kiritilmaydi${at} (K-Q6)`;
    case 'too-many-groups':
      return `Guruhlar soni ${MAX_INTAKE_GROUPS} dan oshmasligi kerak`;
    case 'too-many-pieces':
      return `Bo'laklar soni ${MAX_INTAKE_PIECES} dan oshmasligi kerak`;
  }
}

/** Tuzilgan kiritishni kanonik matnga qaytaradi (ekran va DB uchun bir shakl). */
export function formatPieceEntry(entry: {
  whole: readonly WholeGroupEntry[];
  pieces: readonly PieceEntryItem[];
}): string {
  const parts: string[] = [];
  for (const g of entry.whole) parts.push(g.count > 1 ? `${g.length}x${g.count}` : g.length);
  for (const p of entry.pieces) parts.push(`${p.label ?? NEW_PIECE_MARK}:${p.length}`);
  return parts.join(GROUP_SEPARATOR);
}

// ---------------------------------------------------------------------------
// 2. Miqdor bilan mosligi
// ---------------------------------------------------------------------------

export type QuantityMatch =
  /** Σ bo'laklar === miqdor. */
  | 'exact'
  /** Σ < miqdor — tarkib to'liq kiritilmagan. */
  | 'short'
  /** Σ > miqdor — ortiqcha kiritilgan. */
  | 'over';

/**
 * Kiritilgan tarkib hujjat qatorining miqdoriga mos keladimi.
 *
 * 🔴 Nega TENG bo'lishi SHART (nega «taxminan» yaramaydi): sanash natijasi
 * `StockByCell.qty` ga aylanadi, priyomka esa qoldiqqa QO'SHILADI. Σ bo'laklar
 * miqdordan farq qilsa, hujjat post bo'lgan zahoti reyestr va qoldiq HAR DOIM
 * bir-biriga zid bo'lardi — ya'ni sverka birinchi kundan qizil bo'lib qolardi
 * va signal «bo'ri keldi» ga aylanardi (G3/H2 dagi AYNI xato-klass).
 */
export function matchQuantity(total: string, quantity: string): QuantityMatch {
  const cmp = compareDecimals(total, quantity);
  return cmp === 0 ? 'exact' : cmp < 0 ? 'short' : 'over';
}

export function quantityMismatchMessage(total: string, quantity: string): string {
  return `Bo'laklar yig'indisi (${total}) qator miqdoriga (${quantity}) teng emas`;
}

// ---------------------------------------------------------------------------
// 3. SANASH rejasi (K5/1-vazifa)
// ---------------------------------------------------------------------------

/** Reyestrda turgan FAOL bo'lak (sanash doirasi: ombor × yacheyka × tovar). */
export interface ExistingPiece {
  id: string;
  length: string;
  whole: boolean;
  label: string | null;
}

export interface PlanRecountInput {
  existing: readonly ExistingPiece[];
  entry: IntakeEntry;
  /** Yangi yorliqlar uchun birinchi tartib raqami (`nextPieceSeq` chiqishi). */
  startSeq: number;
}

/** Sanashda yaratiladigan qator. */
export interface RecountCreate {
  length: string;
  whole: boolean;
  label: string | null;
}

/** Uzunligi tuzatilgan MAVJUD qator — yorliq raqami O'ZGARMAYDI. */
export interface RecountAdjust {
  id: string;
  length: string;
  /** Eski uzunlik (yorliq qayta bosilishi kerakligini ekran shundan biladi). */
  previousLength: string;
  label: string | null;
}

export interface PlanRecountResult {
  /** Tegilmagan qatorlar (sanoq mavjud holat bilan mos tushdi). */
  keep: string[];
  /** Uzunligi tuzatilganlar. */
  adjust: RecountAdjust[];
  /** Yangi ochiladigan qatorlar. */
  create: RecountCreate[];
  /** Sanashda TOPILMAGAN — reyestrdan chiqadi (`consumed`, sabab `recount`). */
  close: string[];
  /** Bosilishi kerak bo'lgan yorliqlar (yangi + uzunligi tuzatilgan). */
  labels: string[];
  /** Sanalgan, lekin reyestrda topilmagan yorliqlar (ogohlantirish). */
  unknownLabels: string[];
}

/**
 * Sanash — MUTLAQ amal: yacheykadagi reyestr sanoq natijasiga TENGLASHTIRILADI.
 *
 * Nega mutlaq (K5/1-vazifa va F-rejaning «faqat yacheyka kesimida» qoidasi):
 * omborchi javonni ko'zi bilan ko'rib turibdi va uning ko'rgani — haqiqat.
 * «Qo'shish/ayirish» semantikasi bo'lsa har sanash oldingi xatoni ustiga
 * yig'ardi va reyestr hech qachon tozalanmasdi.
 *
 * O'ZGARISH MINIMAL (bu funksiyaning butun ma'nosi):
 *   · yorlig'i sanalgan va uzunligi bir xil bo'lak — TEGILMAYDI (`keep`),
 *     ya'ni yorliq QAYTA BOSILMAYDI;
 *   · yorlig'i sanalgan, uzunligi boshqa — MAVJUD qator tuzatiladi
 *     (`adjust`), yorliq RAQAMI o'zgarmaydi, lekin qayta bosiladi (unda eski
 *     uzunlik yozilgan — reja 5-bo'limining eng qat'iy bandi);
 *   · `?` — yangi qator + yangi yorliq;
 *   · sanashda uchramagan mavjud qator — `close` (reyestrdan chiqadi).
 *
 * Butun rulonlar ALMASHTIRILADIGAN (K-Q3): ular yorliqsiz, ya'ni «qaysi biri»
 * degan savol ma'nosiz. Shuning uchun ular (uzunlik → son) kesimida
 * solishtiriladi: kami YARATILADI, ortig'i YOPILADI, tengi tegilmaydi.
 */
export function planRecount(input: PlanRecountInput): PlanRecountResult {
  const { existing, entry } = input;

  const keep: string[] = [];
  const adjust: RecountAdjust[] = [];
  const create: RecountCreate[] = [];
  const close: string[] = [];
  const unknownLabels: string[] = [];

  // ── Bo'laklar (yorliqli) ──────────────────────────────────────────────────
  const byLabel = new Map<string, ExistingPiece>();
  for (const p of existing) {
    if (!p.whole && p.label) byLabel.set(p.label.toUpperCase(), p);
  }
  const touched = new Set<string>();
  let newPieces = 0;

  for (const item of entry.pieces) {
    if (item.label) {
      const found = byLabel.get(item.label);
      if (found) {
        touched.add(found.id);
        if (compareDecimals(found.length, item.length) === 0) keep.push(found.id);
        else {
          adjust.push({
            id: found.id,
            length: item.length,
            previousLength: found.length,
            label: found.label,
          });
        }
        continue;
      }
      // Yorliq sanaldi, lekin bu doirada bunday bo'lak YO'Q. Sanoqni RAD
      // ETMAYMIZ (omborchi javonda ko'rib turibdi — bo'lak boshqa yacheykadan
      // ko'chgan yoki reyestrdan tushib qolgan): qator YANGIDAN ochiladi va
      // yorliq ogohlantirishga tushadi, ya'ni nosozlik KO'RINADI (IS-5).
      unknownLabels.push(item.label);
    }
    newPieces += 1;
  }

  // ── Butun rulonlar (almashtiriladigan) ───────────────────────────────────
  const wholeByLength = new Map<string, string[]>();
  for (const p of existing) {
    if (!p.whole) continue;
    const list = wholeByLength.get(p.length) ?? [];
    list.push(p.id);
    wholeByLength.set(p.length, list);
  }

  for (const g of entry.whole) {
    const pool = wholeByLength.get(g.length) ?? [];
    const reused = Math.min(pool.length, g.count);
    for (let i = 0; i < reused; i++) {
      const id = pool[i];
      if (id) {
        keep.push(id);
        touched.add(id);
      }
    }
    for (let i = reused; i < g.count; i++) {
      create.push({ length: g.length, whole: true, label: null });
    }
    wholeByLength.set(g.length, pool.slice(reused));
  }

  // ── Sanashda uchramaganlar ────────────────────────────────────────────────
  for (const p of existing) {
    if (!touched.has(p.id)) close.push(p.id);
  }

  // ── Yangi bo'laklarga yorliq ──────────────────────────────────────────────
  const fresh = newPieces > 0 ? issuePieceLabels(input.startSeq, newPieces) : [];
  let cursor = 0;
  for (const item of entry.pieces) {
    if (item.label && byLabel.has(item.label)) continue;
    create.push({ length: item.length, whole: false, label: fresh[cursor] ?? null });
    cursor += 1;
  }

  // Bosiladigan yorliqlar: yangilari + uzunligi tuzatilganlari. `keep` GA
  // KIRMAYDI — o'zgarmagan bo'lakning yorlig'i hamon to'g'ri.
  const labels = [...fresh, ...adjust.map((a) => a.label).filter((l): l is string => l !== null)];

  return { keep, adjust, create, close, labels, unknownLabels };
}

// ---------------------------------------------------------------------------
// 4. PRIYOMKA rejasi (K5/2-vazifa)
// ---------------------------------------------------------------------------

export type IntakeSupplyError =
  /** Priyomkada bo'lak (yorliqli yoki `?`) kiritilgan — faqat butun rulon. */
  'pieces-not-allowed';

export interface PlanSupplyIntakeResult {
  create?: RecountCreate[];
  error?: IntakeSupplyError;
}

/**
 * Priyomka: kelgan rulonlar reyestrga tushadi.
 *
 * 🔴 **Faqat BUTUN RULON.** Yetkazuvchidan kelgan tovar ta'rifiga ko'ra butun
 * o'ram — u yorliq OLMAYDI (K-Q3) va almashtiriladigan. Agar yetkazuvchi
 * qoldiq bo'lak bergan bo'lsa, omborchi uni K2 ekranida bo'lak sifatida
 * qo'shadi va o'sha yerda yorliq bosadi. Bu chegara ATAYLAB: priyomka
 * ekranida yorliq bosish oqimi yo'q, ya'ni bo'lakni jimgina qabul qilish
 * uni YORLIQSIZ qoldirardi — reyestrdagi yorliqsiz bo'lakni esa omborchi
 * javondan topa olmaydi (K1 `piece-without-label` guardi ham aynan shu).
 */
export function planSupplyIntake(entry: IntakeEntry): PlanSupplyIntakeResult {
  if (entry.pieces.length > 0) return { error: 'pieces-not-allowed' };
  const create: RecountCreate[] = [];
  for (const g of entry.whole) {
    for (let i = 0; i < g.count; i++) create.push({ length: g.length, whole: true, label: null });
  }
  return { create };
}

export function supplyIntakeErrorMessage(error: IntakeSupplyError): string {
  return error === 'pieces-not-allowed'
    ? "Priyomkada faqat BUTUN rulon kiritiladi («250x5»). Qoldiq bo'lak omborchi ekranida yorliq bilan qo'shiladi"
    : error;
}

// ---------------------------------------------------------------------------
// 5. VOZVRAT rejasi (K5/3-vazifa)
// ---------------------------------------------------------------------------

/** Mijozdan qaytgan bo'lak — reyestrda topilgan holati. */
export interface ReturningPiece {
  id: string;
  label: string;
  status: string;
  length: string;
}

export interface PlanReturnInput {
  entry: IntakeEntry;
  /** Sanalgan yorliqlar bo'yicha topilgan qatorlar (holatidan qat'i nazar). */
  found: readonly ReturningPiece[];
  startSeq: number;
}

export interface PlanReturnResult {
  /** `consumed` dan `active` ga QAYTADIGAN qatorlar (yorliq qayta bosilmaydi). */
  restore: Array<{ id: string; length: string; label: string; previousLength: string }>;
  /** Yangi ochiladigan qatorlar (yorliqsiz qaytgan yoki reyestrda yo'q). */
  create: RecountCreate[];
  /** Bosiladigan yorliqlar. */
  labels: string[];
  /** Allaqachon FAOL bo'lgan yorliqlar — qaytarilmaydi (ogohlantirish). */
  alreadyActive: string[];
}

/**
 * Vozvrat: mijoz olib ketgan bo'lak omborga QAYTADI.
 *
 * Ikki yo'l:
 *   · yorlig'i bilan qaytdi va o'sha qator reyestrda `consumed` (`sold`) —
 *     u AYNAN o'sha id bilan `active` ga qaytadi. Yorliq QAYTA BOSILMAYDI
 *     (raqam ham, uzunlik ham o'zgarmagan bo'lsa mijozdagi yorliq hamon
 *     to'g'ri) — faqat uzunlik o'zgargan bo'lsa bosiladi;
 *   · yorliqsiz (`?`) yoki reyestrda topilmagan — YANGI qator + yangi yorliq.
 *
 * Nega eski qator TIKLANADI, yangisi ochilmaydi: `sourcePieceId` zanjiri va
 * «bu bo'lak qaysi rulondan chiqqan» tarixi shu qatorda yashaydi. Yangi qator
 * ochilsa zanjir uzilardi va mijozdagi yorliq raqami tizimdagi boshqa qatorga
 * ishora qilib qolardi — ya'ni skaner noto'g'ri bo'lakni ochardi (7.3).
 *
 * 🔴 Allaqachon FAOL bo'lgan yorliq QAYTARILMAYDI: u omborda turibdi degani,
 * ya'ni «qaytdi» deb yozish reyestrni ikki hisoblab qo'yardi. Bu jimgina
 * o'tkazilmaydi — `alreadyActive` bo'lib qaytadi va chaqiruvchi ko'rsatadi.
 */
export function planPieceReturn(input: PlanReturnInput): PlanReturnResult {
  const byLabel = new Map(input.found.map((p) => [p.label.toUpperCase(), p]));

  const restore: PlanReturnResult['restore'] = [];
  const create: RecountCreate[] = [];
  const alreadyActive: string[] = [];
  const reprint: string[] = [];

  // Butun rulon qaytsa — butun rulon bo'lib qaytadi: yorliqsiz, sanoqsiz
  // (K-Q3, almashtiriladigan). Yorliq bosish oqimi ham kerak emas.
  for (const g of input.entry.whole) {
    for (let i = 0; i < g.count; i++) {
      create.push({ length: g.length, whole: true, label: null });
    }
  }

  // Bo'laklar: avval hukm (tiklash / allaqachon faol / yangi), so'ng yorliq.
  const needsLabel: PieceEntryItem[] = [];
  for (const item of input.entry.pieces) {
    if (item.label) {
      const found = byLabel.get(item.label);
      if (found?.status === PIECE_STATUS.active) {
        alreadyActive.push(item.label);
        continue;
      }
      if (found) {
        restore.push({
          id: found.id,
          length: item.length,
          label: found.label,
          previousLength: found.length,
        });
        if (compareDecimals(found.length, item.length) !== 0) reprint.push(found.label);
        continue;
      }
    }
    needsLabel.push(item);
  }

  const labels = needsLabel.length > 0 ? issuePieceLabels(input.startSeq, needsLabel.length) : [];
  for (const [i, item] of needsLabel.entries()) {
    create.push({ length: item.length, whole: false, label: labels[i] ?? null });
  }

  return { restore, create, labels: [...labels, ...reprint], alreadyActive };
}
