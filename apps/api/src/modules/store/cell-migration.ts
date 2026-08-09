/**
 * F019 — ombor migratsiyasi 1–2-qadam (SOF planlovchilar, DB yo'q).
 *
 * MUAMMO (7-bo'lim TZ §0.2 P1): ikkita parallel manzil tizimi bir-birini bilmaydi —
 * sherset uslubi `Product.attributes.__yacheyka = "01-02-03-05"` (bitta matn), climart
 * uslubi esa `StoreZone` / `StoreCell` / `StockByCell` (validatsiyalangan manzil +
 * yacheyka bo'yicha REAL qoldiq). Migratsiya birinchisidan ikkinchisini quradi:
 *
 *   1-qadam: `__yacheyka` kodlaridan `StoreZone` (kodning 1-segmenti = sklad) +
 *            `StoreCell` (butun kod = nom) generatsiya qilinadi.
 *   2-qadam: har tovarning joriy `Stock.qty` si asosiy yacheykasiga `StockByCell`
 *            qatori sifatida ko'chiriladi.
 *
 * NEGA SOF FUNKSIYALAR: butun matematika (bo'laklash · farq · idempotentlik ·
 * rollback shartlari) DBsiz testlanadi; `cell-migration.runner.ts` faqat kirish/
 * chiqishni ulaydi. Bu «DRY nima ko'rsatsa APPLY aynan shuni yozadi» xossasini
 * kafolatlaydi — yacheyka-diapazon-generatori spec'ining kalit tamoyili
 * (`2026-07-29-yacheyka-diapazon-generatori-design.md`), o'sha yerda ham ikkita
 * parallel implementatsiya ataylab rad etilgan edi.
 *
 * MIQDOR ARIFMETIKASI: hamma joyda 1e6-shkalali `bigint` (`Decimal(20,6)` ning
 * aynan shkalasi) — `Number` bilan hisoblansa 0.1+0.2 klassi farqni «drift» deb
 * ko'rsatib, mavjud bo'lmagan muammoni hisobotga chiqarardi.
 */
import { formatDecimalScaled, parseDecimalScaled } from '../demand/fifo-consumer.js';

const toMicro = parseDecimalScaled;
const fromMicro = formatDecimalScaled;

/** `StoreCell.name` / `StoreZone.name` = VarChar(255). */
const MAX_NAME_LEN = 255;

/** Kanonik kod `sklad-polka-qavat-yacheyka` = 4 segment; 2–3 tasi qabul qilinadi. */
const MIN_SEGMENTS = 2;
const MAX_SEGMENTS = 4;

export type CellCodeInvalidReason =
  | 'empty'
  | 'whitespace'
  | 'too-long'
  | 'segment-count'
  | 'empty-segment'
  | 'bad-segment-chars'
  | 'zone-not-numeric';

export interface ParsedCellCode {
  raw: string;
  /** Tashqi bo'shliqdan tozalangan kod — `StoreCell.name` shu bo'ladi. */
  normalized: string;
  /** Kodning 1-segmenti = `StoreZone.name` (TZ §2: sklad darajasi). */
  zoneName: string;
  segments: string[];
}

export type CellCodeResult =
  | { ok: true; value: ParsedCellCode }
  | { ok: false; raw: string; reason: CellCodeInvalidReason; message: string };

const fail = (raw: string, reason: CellCodeInvalidReason, message: string): CellCodeResult => ({
  ok: false,
  raw,
  reason,
  message,
});

/**
 * `__yacheyka` satrini zona + yacheyka nomiga bo'laklaydi.
 *
 * QAT'IYLIK SABABI: 1-segment RAQAM bo'lishi SHART, chunki yig'ish varag'ini
 * omborchilarga taqsimlaydigan `skladNoOf()` (`restock-task.service.ts:46`,
 * `retail-sale.service.ts:109`) aynan shuni `Number()` qiladi — raqam bo'lmasa
 * pozitsiya bugun ham jimgina «biriktirilmagan» varaqqa tushadi. Ya'ni bu
 * qat'iylik yangi cheklov emas, mavjud jim xulqni KO'RINADIGAN qiladi.
 *
 * Har rad etish SABAB bilan qaytadi — chaqiruvchi uni hisobotga chiqaradi,
 * jimgina tashlab ketmaydi (reja: «noto'g'ri formatdagi kod jimgina
 * tashlanmaydi»).
 */
export function parseCellCode(raw: string): CellCodeResult {
  const normalized = raw.trim();
  if (normalized === '') return fail(raw, 'empty', "kod bo'sh");
  if (/\s/.test(normalized)) {
    return fail(raw, 'whitespace', `«${normalized}»: kod ichida bo'shliq bor`);
  }
  if (normalized.length > MAX_NAME_LEN) {
    return fail(
      raw,
      'too-long',
      `kod ${MAX_NAME_LEN} belgidan uzun («${normalized.slice(0, 40)}…»)`,
    );
  }

  const segments = normalized.split('-');
  if (segments.length < MIN_SEGMENTS || segments.length > MAX_SEGMENTS) {
    return fail(
      raw,
      'segment-count',
      `«${normalized}»: ${segments.length} ta segment — ${MIN_SEGMENTS}–${MAX_SEGMENTS} kutilgan`,
    );
  }
  if (segments.some((s) => s === '')) {
    return fail(raw, 'empty-segment', `«${normalized}»: bo'sh segment bor`);
  }
  if (segments.some((s) => !/^[A-Za-z0-9]+$/.test(s))) {
    return fail(raw, 'bad-segment-chars', `«${normalized}»: segmentda begona belgi bor`);
  }

  const zoneName = segments[0] ?? '';
  if (!/^\d+$/.test(zoneName)) {
    return fail(
      raw,
      'zone-not-numeric',
      `«${normalized}»: sklad segmenti («${zoneName}») raqam emas`,
    );
  }

  return { ok: true, value: { raw, normalized, zoneName, segments } };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1-qadam — zona/yacheyka generatsiyasi
// ─────────────────────────────────────────────────────────────────────────────

/** Bitta (ombor × kod × tovar) ehtiyoji. */
export interface CellNeed {
  storeId: string;
  code: string;
  productId: string;
}

export interface GenerationPlan {
  zonesToCreate: Array<{ storeId: string; name: string; sortOrder: number }>;
  cellsToCreate: Array<{ storeId: string; name: string; zoneName: string; sortOrder: number }>;
  zonesExisting: number;
  cellsExisting: number;
  /** Rad etilgan kodlar — kod bo'yicha guruhlangan, tovar id'lari bilan. */
  invalid: Array<{
    code: string;
    reason: CellCodeInvalidReason;
    message: string;
    productIds: string[];
  }>;
  /** Qabul qilingan, lekin 4 segmentdan qisqa kodlar (ogohlantirish). */
  shortCodes: Array<{ code: string; segments: number; productIds: string[] }>;
  /** Bir xil sklad ikki xil yozuvda («01» va «1») — ikkita zona chiqadi. */
  zonePaddingCollisions: Array<{ storeId: string; numeric: number; names: string[] }>;
}

const storeKey = (storeId: string, name: string) => `${storeId}|${name}`;

/**
 * `__yacheyka` ehtiyojlaridan yaratilishi kerak bo'lgan zona/yacheykalarni
 * hisoblaydi. Mavjudlari QAYTA yaratilmaydi (generator idempotent — spec'ning
 * 3-qarori), yangi `sortOrder` esa ombordagi eng kattadan keyin davom etadi,
 * shuning uchun mavjud tartib buzilmaydi.
 */
export function planCellGeneration(input: {
  needs: CellNeed[];
  existingZones: Array<{ storeId: string; name: string; sortOrder: number }>;
  existingCells: Array<{ storeId: string; name: string; sortOrder: number }>;
}): GenerationPlan {
  const zoneExists = new Set(input.existingZones.map((z) => storeKey(z.storeId, z.name)));
  const cellExists = new Set(input.existingCells.map((c) => storeKey(c.storeId, c.name)));

  const invalidByCode = new Map<
    string,
    { code: string; reason: CellCodeInvalidReason; message: string; productIds: string[] }
  >();
  const shortByCode = new Map<string, { code: string; segments: number; productIds: string[] }>();

  // (ombor|nom) → reja qatori. Map takroriy kodni o'zi yig'ib beradi.
  const wantedCells = new Map<string, { storeId: string; name: string; zoneName: string }>();
  const wantedZones = new Map<string, { storeId: string; name: string }>();
  // Ombor bo'yicha: sklad RAQAMI → uchragan yozuvlar («01» va «1» to'qnashuvi).
  const zoneSpellings = new Map<string, Map<number, Set<string>>>();

  for (const need of input.needs) {
    const parsed = parseCellCode(need.code);
    if (!parsed.ok) {
      const key = `${parsed.reason}|${need.code}`;
      const row = invalidByCode.get(key);
      if (row) row.productIds.push(need.productId);
      else {
        invalidByCode.set(key, {
          code: need.code,
          reason: parsed.reason,
          message: parsed.message,
          productIds: [need.productId],
        });
      }
      continue;
    }

    const { normalized, zoneName, segments } = parsed.value;
    if (segments.length < MAX_SEGMENTS) {
      const row = shortByCode.get(normalized);
      if (row) row.productIds.push(need.productId);
      else {
        shortByCode.set(normalized, {
          code: normalized,
          segments: segments.length,
          productIds: [need.productId],
        });
      }
    }

    wantedCells.set(storeKey(need.storeId, normalized), {
      storeId: need.storeId,
      name: normalized,
      zoneName,
    });
    wantedZones.set(storeKey(need.storeId, zoneName), { storeId: need.storeId, name: zoneName });

    const perStore = zoneSpellings.get(need.storeId) ?? new Map<number, Set<string>>();
    const numeric = Number(zoneName);
    const names = perStore.get(numeric) ?? new Set<string>();
    names.add(zoneName);
    perStore.set(numeric, names);
    zoneSpellings.set(need.storeId, perStore);
  }

  // Mavjud zonalar ham to'qnashuvga hissa qo'shadi: bazada «01» turgan bo'lsa va
  // yangi kod «1» bersa, ikkitasi ham qoladi — buni ko'rsatmaslik jim qaror bo'lardi.
  for (const z of input.existingZones) {
    if (!/^\d+$/.test(z.name)) continue;
    const perStore = zoneSpellings.get(z.storeId);
    if (!perStore) continue;
    const numeric = Number(z.name);
    const names = perStore.get(numeric);
    if (names) names.add(z.name);
  }

  const byName = (a: { name: string }, b: { name: string }) =>
    a.name.localeCompare(b.name, undefined, { numeric: true });

  const nextSortOrder = (rows: Array<{ storeId: string; sortOrder: number }>, storeId: string) => {
    let max = -1;
    for (const r of rows) if (r.storeId === storeId && r.sortOrder > max) max = r.sortOrder;
    return max + 1;
  };

  const zoneCursor = new Map<string, number>();
  const zonesToCreate = [...wantedZones.values()]
    .filter((z) => !zoneExists.has(storeKey(z.storeId, z.name)))
    .sort(byName)
    .map((z) => {
      const next = zoneCursor.get(z.storeId) ?? nextSortOrder(input.existingZones, z.storeId);
      zoneCursor.set(z.storeId, next + 1);
      return { ...z, sortOrder: next };
    });

  const cellCursor = new Map<string, number>();
  const cellsToCreate = [...wantedCells.values()]
    .filter((c) => !cellExists.has(storeKey(c.storeId, c.name)))
    .sort(byName)
    .map((c) => {
      const next = cellCursor.get(c.storeId) ?? nextSortOrder(input.existingCells, c.storeId);
      cellCursor.set(c.storeId, next + 1);
      return { ...c, sortOrder: next };
    });

  const zonePaddingCollisions: GenerationPlan['zonePaddingCollisions'] = [];
  for (const [sid, perStore] of zoneSpellings) {
    for (const [numeric, names] of perStore) {
      if (names.size > 1) {
        zonePaddingCollisions.push({ storeId: sid, numeric, names: [...names].sort() });
      }
    }
  }

  return {
    zonesToCreate,
    cellsToCreate,
    zonesExisting: wantedZones.size - zonesToCreate.length,
    cellsExisting: wantedCells.size - cellsToCreate.length,
    invalid: [...invalidByCode.values()],
    shortCodes: [...shortByCode.values()],
    zonePaddingCollisions,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2-qadam — `Stock` → `StockByCell` backfill
// ─────────────────────────────────────────────────────────────────────────────

export type UnaddressedReason =
  | 'no-home-code'
  | 'invalid-code'
  | 'cell-missing'
  | 'not-a-product'
  | 'over-allocated';

export interface StockRow {
  storeId: string;
  assortmentKind: string;
  assortmentId: string;
  qty: string;
}

export interface CellStockRow extends StockRow {
  cellId: string;
}

export interface BackfillPlan {
  writes: Array<{
    storeId: string;
    cellId: string;
    assortmentKind: string;
    assortmentId: string;
    /** Yacheykaga QO'SHILADIGAN miqdor (ombor jami − allaqachon yacheykalardagi). */
    deltaQty: string;
    /** Shu (yacheyka × tovar) qatori bazada ALLAQACHON bormi. */
    existing: boolean;
  }>;
  unaddressed: Array<{
    storeId: string;
    assortmentKind: string;
    assortmentId: string;
    qty: string;
    reason: UnaddressedReason;
  }>;
  /** Farqi 0 bo'lgan (ombor × tovar) juftliklari — qayta yugurtirishda hammasi shu yerda. */
  alreadyBalanced: number;
}

const assortKey = (r: { storeId: string; assortmentKind: string; assortmentId: string }) =>
  `${r.storeId}|${r.assortmentKind}|${r.assortmentId}`;

/**
 * Har (ombor × tovar) uchun FARQNI asosiy yacheykaga yozishni rejalashtiradi:
 *
 *     delta = Stock.qty − Σ StockByCell.qty
 *
 * IDEMPOTENTLIK ayni shu formuladan kelib chiqadi — ikkinchi yugurtirishda
 * delta 0 bo'ladi va hech narsa yozilmaydi. «Butun `Stock.qty` ni yozish»
 * varianti ataylab RAD etildi: yacheykada allaqachon turgan qoldiq ikki marta
 * sanalib, `Σ StockByCell > Stock` driftini YARATARDI (bu aynan
 * `applyDeltas` `cellMode` gotcha'si bilan bir bug-klass).
 *
 * `delta < 0` (yacheykalar jamidan oshib ketgan) — TUZATILMAYDI: bu mavjud
 * ma'lumot muammosi, uni jim «to'g'rilash» qoldiqni yo'q qilish bo'lardi.
 * Hisobotga `over-allocated` bo'lib tushadi.
 */
export function planStockBackfill(input: {
  stocks: StockRow[];
  homeCodeByProduct: Map<string, string>;
  /** `${storeId}|${cellName}` → cellId. */
  cellIdByStoreCode: Map<string, string>;
  byCell: CellStockRow[];
}): BackfillPlan {
  const cellSumByAssort = new Map<string, bigint>();
  const cellHas = new Set<string>();
  for (const r of input.byCell) {
    const k = assortKey(r);
    cellSumByAssort.set(k, (cellSumByAssort.get(k) ?? 0n) + toMicro(r.qty));
    cellHas.add(`${k}|${r.cellId}`);
  }

  const plan: BackfillPlan = { writes: [], unaddressed: [], alreadyBalanced: 0 };

  for (const s of input.stocks) {
    const delta = toMicro(s.qty) - (cellSumByAssort.get(assortKey(s)) ?? 0n);
    if (delta === 0n) {
      plan.alreadyBalanced += 1;
      continue;
    }

    const unaddressed = (reason: UnaddressedReason) =>
      plan.unaddressed.push({
        storeId: s.storeId,
        assortmentKind: s.assortmentKind,
        assortmentId: s.assortmentId,
        qty: fromMicro(delta),
        reason,
      });

    if (delta < 0n) {
      unaddressed('over-allocated');
      continue;
    }
    // Variant/komplekt uchun `__yacheyka` atributi umuman yo'q (u faqat `Product` da).
    if (s.assortmentKind !== 'product') {
      unaddressed('not-a-product');
      continue;
    }

    const code = input.homeCodeByProduct.get(s.assortmentId);
    if (code === undefined || code.trim() === '') {
      unaddressed('no-home-code');
      continue;
    }
    const parsed = parseCellCode(code);
    if (!parsed.ok) {
      unaddressed('invalid-code');
      continue;
    }
    const cellId = input.cellIdByStoreCode.get(storeKey(s.storeId, parsed.value.normalized));
    if (cellId === undefined) {
      unaddressed('cell-missing');
      continue;
    }

    plan.writes.push({
      storeId: s.storeId,
      cellId,
      assortmentKind: s.assortmentKind,
      assortmentId: s.assortmentId,
      deltaQty: fromMicro(delta),
      existing: cellHas.has(`${assortKey(s)}|${cellId}`),
    });
  }

  return plan;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tekshiruv hisoboti — `Σ StockByCell == Stock`
// ─────────────────────────────────────────────────────────────────────────────

export interface StockDiffRow {
  storeId: string;
  assortmentKind: string;
  assortmentId: string;
  stockQty: string;
  cellQty: string;
  /** `stockQty − cellQty`: musbat = yacheykaga biriktirilmagan qoldiq. */
  diff: string;
}

export interface StockDiffReport {
  rows: StockDiffRow[];
  mismatches: number;
  /** Farqlarning modul yig'indisi — bitta raqamli «sog'liq» o'lchovi. */
  totalAbsDiff: string;
}

/**
 * TZ §3.1 ning doimiy tekshiruvi. YETIM yacheyka qatorlari (ombor darajasida
 * `Stock` qatori YO'Q, lekin yacheykada qoldiq bor) ham hisobga olinadi —
 * faqat `stocks` bo'yicha aylanish ularni ko'rmay qolardi va hisobot «0 farq»
 * deb yolg'on aytardi.
 */
export function diffStockVsCells(stocks: StockRow[], byCell: CellStockRow[]): StockDiffReport {
  const stockMicro = new Map<string, bigint>();
  const meta = new Map<string, { storeId: string; assortmentKind: string; assortmentId: string }>();
  for (const s of stocks) {
    const k = assortKey(s);
    stockMicro.set(k, (stockMicro.get(k) ?? 0n) + toMicro(s.qty));
    meta.set(k, {
      storeId: s.storeId,
      assortmentKind: s.assortmentKind,
      assortmentId: s.assortmentId,
    });
  }

  const cellMicro = new Map<string, bigint>();
  for (const c of byCell) {
    const k = assortKey(c);
    cellMicro.set(k, (cellMicro.get(k) ?? 0n) + toMicro(c.qty));
    if (!meta.has(k)) {
      meta.set(k, {
        storeId: c.storeId,
        assortmentKind: c.assortmentKind,
        assortmentId: c.assortmentId,
      });
    }
  }

  const rows: StockDiffRow[] = [];
  let totalAbs = 0n;
  for (const [k, m] of meta) {
    const s = stockMicro.get(k) ?? 0n;
    const c = cellMicro.get(k) ?? 0n;
    const diff = s - c;
    if (diff === 0n) continue;
    totalAbs += diff < 0n ? -diff : diff;
    rows.push({ ...m, stockQty: fromMicro(s), cellQty: fromMicro(c), diff: fromMicro(diff) });
  }

  return { rows, mismatches: rows.length, totalAbsDiff: fromMicro(totalAbs) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Qaytarish (rollback)
// ─────────────────────────────────────────────────────────────────────────────

export interface CellMigrationManifest {
  version: 1;
  appliedAt: string;
  accountId: string;
  zones: Array<{ id: string; storeId: string; name: string }>;
  cells: Array<{ id: string; storeId: string; name: string }>;
  stock: Array<{
    storeId: string;
    cellId: string;
    assortmentKind: string;
    assortmentId: string;
    deltaQty: string;
    created: boolean;
  }>;
}

export type RollbackBlockReason =
  | 'stock-drifted'
  | 'stock-below-delta'
  | 'cell-not-empty'
  | 'cell-in-use'
  | 'zone-not-empty';

export interface RollbackPlan {
  stockDeletes: Array<{
    storeId: string;
    cellId: string;
    assortmentKind: string;
    assortmentId: string;
  }>;
  stockDecrements: Array<{
    storeId: string;
    cellId: string;
    assortmentKind: string;
    assortmentId: string;
    qty: string;
  }>;
  cellDeletes: string[];
  zoneDeletes: string[];
  blocked: Array<{ reason: RollbackBlockReason; detail: string }>;
}

/**
 * Migratsiyani manifest bo'yicha bekor qiladi — «hamma yacheykani o'chir» EMAS.
 *
 * MANIFEST NEGA KERAK: migratsiyadan keyin bazada mavjud bo'lgan zona/yacheyka
 * bilan migratsiya YARATGANINI ajratishning boshqa ishonchli yo'li yo'q. Qaysi
 * qatorni yozganini eslamaydigan rollback foydalanuvchi qo'lda kiritgan
 * yacheykalarni ham o'chirib yuborardi.
 *
 * FAIL-CLOSED: migratsiyadan keyin qoldiq o'zgargan bo'lsa (real harakat
 * bo'lgan) — o'chirmaydi, `blocked` ga yozadi. «Taxminan tiklash» qoldiqni
 * yo'q qilish demakdir.
 */
export function planRollback(input: {
  manifest: CellMigrationManifest;
  currentByCell: CellStockRow[];
  /** Hujjat pozitsiyasi / tovar-biriktirmasi ushlab turgan yacheykalar. */
  cellsInUse: Set<string>;
  /** `zoneId → o'sha zonadagi JORIY yacheykalar soni` (o'lchanmasa manifestdan olinadi). */
  zoneCellCounts?: Map<string, number>;
}): RollbackPlan {
  const plan: RollbackPlan = {
    stockDeletes: [],
    stockDecrements: [],
    cellDeletes: [],
    zoneDeletes: [],
    blocked: [],
  };

  const cellRowKey = (r: {
    storeId: string;
    cellId: string;
    assortmentKind: string;
    assortmentId: string;
  }) => `${r.storeId}|${r.cellId}|${r.assortmentKind}|${r.assortmentId}`;

  const current = new Map<string, bigint>();
  for (const r of input.currentByCell) current.set(cellRowKey(r), toMicro(r.qty));

  // Rollbackdan KEYIN har yacheykada qoladigan qoldiq (o'chirish shartini shundan hisoblaymiz).
  const remainingByCell = new Map<string, bigint>();
  for (const r of input.currentByCell) {
    remainingByCell.set(r.cellId, (remainingByCell.get(r.cellId) ?? 0n) + toMicro(r.qty));
  }

  for (const entry of input.manifest.stock) {
    const key = cellRowKey(entry);
    const now = current.get(key) ?? 0n;
    const delta = toMicro(entry.deltaQty);
    const label = `${entry.assortmentId} @ ${entry.cellId}`;

    if (entry.created) {
      // Migratsiya YARATGAN qator: aynan o'zi turgan bo'lsa o'chiriladi.
      if (now !== delta) {
        plan.blocked.push({
          reason: 'stock-drifted',
          detail: `${label}: yozilgan ${entry.deltaQty}, hozir ${fromMicro(now)} — o'chirilmadi`,
        });
        continue;
      }
      plan.stockDeletes.push({
        storeId: entry.storeId,
        cellId: entry.cellId,
        assortmentKind: entry.assortmentKind,
        assortmentId: entry.assortmentId,
      });
      remainingByCell.set(entry.cellId, (remainingByCell.get(entry.cellId) ?? 0n) - now);
      continue;
    }

    // Mavjud qatorga QO'SHILGAN: faqat o'sha qo'shimchani qaytarib olamiz.
    if (now < delta) {
      plan.blocked.push({
        reason: 'stock-below-delta',
        detail: `${label}: qo'shilgan ${entry.deltaQty}, hozir ${fromMicro(now)} — kamaytirilmadi`,
      });
      continue;
    }
    plan.stockDecrements.push({
      storeId: entry.storeId,
      cellId: entry.cellId,
      assortmentKind: entry.assortmentKind,
      assortmentId: entry.assortmentId,
      qty: entry.deltaQty,
    });
    remainingByCell.set(entry.cellId, (remainingByCell.get(entry.cellId) ?? 0n) - delta);
  }

  const deletedCells = new Set<string>();
  for (const cell of input.manifest.cells) {
    const left = remainingByCell.get(cell.id) ?? 0n;
    if (left !== 0n) {
      plan.blocked.push({
        reason: 'cell-not-empty',
        detail: `${cell.name}: ${fromMicro(left)} qoldiq qoldi — yacheyka o'chirilmadi`,
      });
      continue;
    }
    if (input.cellsInUse.has(cell.id)) {
      plan.blocked.push({
        reason: 'cell-in-use',
        detail: `${cell.name}: hujjat/biriktirma ishlatmoqda — yacheyka o'chirilmadi`,
      });
      continue;
    }
    plan.cellDeletes.push(cell.id);
    deletedCells.add(cell.id);
  }

  const manifestCellsByZone = new Map<string, number>();
  for (const c of input.manifest.cells) {
    if (!deletedCells.has(c.id)) continue;
    // Manifest zona↔yacheyka bog'lanishini saqlamaydi (yacheyka nomining 1-segmenti yetarli).
    const zoneName = c.name.split('-')[0] ?? '';
    const zone = input.manifest.zones.find((z) => z.storeId === c.storeId && z.name === zoneName);
    if (!zone) continue;
    manifestCellsByZone.set(zone.id, (manifestCellsByZone.get(zone.id) ?? 0) + 1);
  }

  for (const zone of input.manifest.zones) {
    const liveCells = input.zoneCellCounts?.get(zone.id);
    const removing = manifestCellsByZone.get(zone.id) ?? 0;
    // O'lchov berilmasa manifestning o'zi yagona manba: migratsiya yaratgan
    // yacheykalar hammasi o'chsa zona bo'shaydi.
    const willRemain =
      liveCells === undefined
        ? input.manifest.cells.filter((c) => c.name.startsWith(`${zone.name}-`)).length - removing
        : liveCells - removing;
    if (willRemain > 0) {
      plan.blocked.push({
        reason: 'zone-not-empty',
        detail: `zona «${zone.name}»: ${willRemain} yacheyka qoldi — zona o'chirilmadi`,
      });
      continue;
    }
    plan.zoneDeletes.push(zone.id);
  }

  return plan;
}
