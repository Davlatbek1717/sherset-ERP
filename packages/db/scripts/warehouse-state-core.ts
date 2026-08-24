/**
 * H2 (2026-08-24 split-kassa hodisasi) — JONLI HOLAT reyestrining SOF yadrosi.
 * SQL/Prisma YO'Q: kirish — xom qatorlar + reyestr matni, chiqish — deterministik
 * hisobot va DRIFT ro'yxati. Shu tufayli butun mantiq DB'siz unit-test bilan
 * qulflanadi (apps/api/src/scripts/warehouse-state-core.test.ts), CLI
 * (`warehouse-state.ts`) esa faqat O'QISH qobig'i — u hech nima YOZMAYDI.
 *
 * Nega bu modul bor (hodisa rejasi, IS-7): kod git'da versiyalanadi, jonli
 * ma'lumot holati esa — qaysi ombor bor, `__posPriority` kimda, yacheykalar
 * qayerda — hech qayerda yozilmagan edi. 2026-08-23 dagi split tovarni kassa
 * yeta olmaydigan omborga ko'chirdi va buni ERTASI KUNI odam aytgani uchun
 * bildik. Bu modul o'sha ko'rinmas holatni O'LCHAYDI va reyestr bilan
 * solishtiradi.
 *
 * ⚠️ TAKRORLANGAN MANTIQ: `readPosPriority` va kaskad tartibi apps/api dagi
 * `retail-stock-cascade.ts` bilan AYNAN bir xil bo'lishi SHART (packages/db
 * app qatlamiga qaray olmaydi — `warehouse-split-core.ts` dagi cost-basis
 * takrori bilan bir sabab). Birini o'zgartirsangiz ikkinchisini ham.
 */

import {
  formatDecimalScaled,
  parseCellCode,
  parseDecimalScaled,
  storeNameFor,
} from './warehouse-split-core.js';

// ---------------------------------------------------------------------------
// Kirish qatorlari (CLI aynan shu shaklda o'qiydi)
// ---------------------------------------------------------------------------

export interface StateStoreRow {
  id: string;
  name: string;
  archived: boolean;
  attributes: unknown;
}

export interface StateCellRow {
  id: string;
  storeId: string;
  zoneId: string | null;
  name: string;
}

/** Ombor jamisi — `Stock.qty` yig'indisi (Decimal(20,6) satr). */
export interface StateStoreStockRow {
  storeId: string;
  qty: string;
}

/** Yacheykalardagi qoldiq — `StockByCell.qty` yig'indisi (Decimal(20,6) satr). */
export interface StateCellStockRow {
  storeId: string;
  qty: string;
}

/** Ochiq kassir-smenalari: qaysi ombordan sotilyapti. */
export interface StateOpenSessionRow {
  storeId: string;
  sessions: number;
}

export interface WarehouseStateInput {
  stores: readonly StateStoreRow[];
  cells: readonly StateCellRow[];
  storeStock: readonly StateStoreStockRow[];
  cellStock: readonly StateCellStockRow[];
  openSessions: readonly StateOpenSessionRow[];
}

// ---------------------------------------------------------------------------
// Store.attributes belgilarini o'qish (apps/api naqshlari bilan bir xil)
// ---------------------------------------------------------------------------

/** `retail-stock-cascade.ts#readPosPriority` bilan AYNAN bir xil qoida. */
export function readPosPriority(attributes: unknown): number | null {
  if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) return null;
  const v = (attributes as Record<string, unknown>).__posPriority;
  return typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : null;
}

function readBoolFlag(attributes: unknown, key: string): boolean {
  if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) return false;
  return (attributes as Record<string, unknown>)[key] === true;
}

/** G3 BRAK ombori — ATAYLAB POS yeta olmaydigan qoldiq (istisno qilinadi). */
export const BRAK_STORE_KEY = '__brakStore';
/** F7 hovuz-ombori («Taqsimlanmagan»). */
export const UNASSIGNED_SOURCE_KEY = '__unassignedSource';

// ---------------------------------------------------------------------------
// Hisobot shakli
// ---------------------------------------------------------------------------

export type ReachStatus =
  /** POS shu ombordan avtomatik ayiradi (kaskadning BIRINCHI ombori). */
  | 'reachable'
  /** Kaskadda bor, lekin birinchi emas ⇒ bosh omborchi tasdig'i (G4) kerak — G4 hali YO'Q. */
  | 'needs_approval'
  /** Kaskadda umuman yo'q ⇒ POS hech qachon yeta olmaydi. */
  | 'outside_cascade'
  /** BRAK ombori — ataylab yetib bo'lmaydi, xavf EMAS. */
  | 'brak';

export type SplitState = 'bajarilgan' | 'qaytarilgan' | 'qisman' | 'yacheyka yoq';

export interface StoreState {
  id: string;
  name: string;
  archived: boolean;
  posPriority: number | null;
  isBrak: boolean;
  isUnassignedSource: boolean;
  cells: number;
  cellsWithoutZone: number;
  zones: number;
  /** Ombor jamisi (Stock). */
  storeQty: string;
  /** Yacheykalarga biriktirilgani (StockByCell). */
  cellQty: string;
  /** Yacheykasiz qoldiq = storeQty − cellQty. */
  unassignedQty: string;
  openSessions: number;
  reach: ReachStatus;
}

export interface SplitStatus {
  /** Kod prefiksi o'z omboriga mos yacheykalar. */
  matched: number;
  /** Prefiks boshqa omborni ko'rsatayotgan yacheykalar. */
  mismatched: number;
  /** Kodi `NN-SS-QQ-OO` shakliga tushmaydigan yacheykalar. */
  unparsed: number;
  /** Prefiksi bo'yicha kutilgan, lekin mavjud bo'lmagan ombor nomlari. */
  missingStores: string[];
  state: SplitState;
}

export interface Drift {
  code: string;
  severity: 'xato' | 'ogohlantirish';
  message: string;
}

export interface WarehouseStateReport {
  stores: StoreState[];
  cascade: Array<{ id: string; name: string; posPriority: number }>;
  /** Kaskad sozlanmagan bo'lsa POS smena omboridan ishlaydi (F6 dagi zaxira yo'l). */
  cascadeConfigured: boolean;
  split: SplitStatus;
  /** POS avtomatik yeta olmaydigan qoldiq (BRAK ISTISNO). H3 qo'riqchisining asosi. */
  unreachableQty: string;
  unreachable: Array<{ storeId: string; storeName: string; qty: string; reach: ReachStatus }>;
  totals: { storeQty: string; cellQty: string; cells: number };
}

// ---------------------------------------------------------------------------
// Reyestr (docs/ops/jonli-holat.md ichidagi json bloki)
// ---------------------------------------------------------------------------

export interface RegistryStore {
  name: string;
  /** null = prioritet BO'LMASLIGI kutiladi. */
  posPriority?: number | null;
  brak?: boolean;
  unassignedSource?: boolean;
}

export interface Registry {
  /** Split kutilayotgan holati. */
  split: SplitState;
  stores: RegistryStore[];
  /** POS smenalari shu ombordan ochilishi kutiladi (nom). */
  posSessionStore: string;
  /** Kutilayotgan «yetib bo'lmaydigan qoldiq» — odatda '0'. */
  allowUnreachableQty?: string;
}

/**
 * Reyestr HAM odam o'qiydigan, HAM mashina tekshiradigan bo'lishi uchun
 * bitta faylda turadi: `docs/ops/jonli-holat.md` ichidagi birinchi json
 * fenced bloki. Ikki fayl (md + json) ko'rildi va rad etildi — ular
 * bir-biridan ajralib ketardi va aynan «hujjat haqiqatni aytmaydi»
 * muammosi (IS-7) qaytardi.
 */
export function parseRegistry(markdown: string): Registry {
  const m = /```json\s*\r?\n([\s\S]*?)\r?\n```/.exec(markdown);
  if (!m?.[1]) throw new Error('Reyestrda json bloki topilmadi (docs/ops/jonli-holat.md)');
  const parsed = JSON.parse(m[1]) as Partial<Registry>;
  if (!parsed || typeof parsed !== 'object') throw new Error('Reyestr JSON obyekt emas');
  if (!Array.isArray(parsed.stores)) throw new Error('Reyestrda `stores` massivi yoq');
  if (typeof parsed.posSessionStore !== 'string') {
    throw new Error('Reyestrda `posSessionStore` yoq');
  }
  if (typeof parsed.split !== 'string') throw new Error('Reyestrda `split` yoq');
  return parsed as Registry;
}

// ---------------------------------------------------------------------------
// Yadro
// ---------------------------------------------------------------------------

function sumByStore(rows: readonly { storeId: string; qty: string }[]): Map<string, bigint> {
  const out = new Map<string, bigint>();
  for (const r of rows) out.set(r.storeId, (out.get(r.storeId) ?? 0n) + parseDecimalScaled(r.qty));
  return out;
}

/** Yacheyka kodidan kutilgan ombor nomi (`01-04-02-13` → «Ombor 01»). */
export function expectedStoreNameForCell(cellName: string): string | null {
  const parsed = parseCellCode(cellName);
  return parsed ? storeNameFor(parsed.warehouseNo) : null;
}

export function buildWarehouseState(input: WarehouseStateInput): WarehouseStateReport {
  const storeQty = sumByStore(input.storeStock);
  const cellQty = sumByStore(input.cellStock);
  const sessions = new Map(input.openSessions.map((s) => [s.storeId, s.sessions]));

  const cellsByStore = new Map<string, StateCellRow[]>();
  for (const c of input.cells) {
    const list = cellsByStore.get(c.storeId);
    if (list) list.push(c);
    else cellsByStore.set(c.storeId, [c]);
  }

  // --- kaskad tartibi (apps/api `orderCascadeStores` bilan bir xil) ---
  const cascade = input.stores
    .map((s) => ({ id: s.id, name: s.name, posPriority: readPosPriority(s.attributes) }))
    .filter((s): s is { id: string; name: string; posPriority: number } => s.posPriority !== null)
    .sort((a, b) => a.posPriority - b.posPriority || a.name.localeCompare(b.name));
  const cascadeConfigured = cascade.length > 0;
  const cascadeIds = new Set(cascade.map((s) => s.id));
  const firstCascadeId = cascade[0]?.id ?? null;

  // Kaskad sozlanmagan bo'lsa POS eski yo'l bilan — smena ombori (F6 zaxira yo'li).
  const sessionStoreIds = new Set(
    input.openSessions.filter((s) => s.sessions > 0).map((s) => s.storeId),
  );
  const reachableIds = cascadeConfigured
    ? new Set(firstCascadeId ? [firstCascadeId] : [])
    : sessionStoreIds;

  const stores: StoreState[] = input.stores.map((s) => {
    const cells = cellsByStore.get(s.id) ?? [];
    const zones = new Set(cells.map((c) => c.zoneId).filter((z): z is string => z !== null));
    const sQty = storeQty.get(s.id) ?? 0n;
    const cQty = cellQty.get(s.id) ?? 0n;
    const isBrak = readBoolFlag(s.attributes, BRAK_STORE_KEY);
    const reach: ReachStatus = isBrak
      ? 'brak'
      : reachableIds.has(s.id)
        ? 'reachable'
        : cascadeIds.has(s.id)
          ? 'needs_approval'
          : 'outside_cascade';
    return {
      id: s.id,
      name: s.name,
      archived: s.archived,
      posPriority: readPosPriority(s.attributes),
      isBrak,
      isUnassignedSource: readBoolFlag(s.attributes, UNASSIGNED_SOURCE_KEY),
      cells: cells.length,
      cellsWithoutZone: cells.filter((c) => c.zoneId === null).length,
      zones: zones.size,
      storeQty: formatDecimalScaled(sQty),
      cellQty: formatDecimalScaled(cQty),
      unassignedQty: formatDecimalScaled(sQty - cQty),
      openSessions: sessions.get(s.id) ?? 0,
      reach,
    };
  });

  // --- POS yeta olmaydigan qoldiq (H3 qo'riqchisining asosi) ---
  const unreachable = stores
    .filter((s) => s.reach !== 'reachable' && s.reach !== 'brak')
    .filter((s) => parseDecimalScaled(s.storeQty) > 0n)
    .map((s) => ({ storeId: s.id, storeName: s.name, qty: s.storeQty, reach: s.reach }));
  const unreachableTotal = unreachable.reduce((a, r) => a + parseDecimalScaled(r.qty), 0n);

  // --- split holati (yacheyka prefiksi ↔ ombor) ---
  const storeNames = new Map(input.stores.map((s) => [s.id, s.name]));
  const namesPresent = new Set(input.stores.map((s) => s.name));
  let matched = 0;
  let mismatched = 0;
  let unparsed = 0;
  const missingStores = new Set<string>();
  for (const c of input.cells) {
    const expected = expectedStoreNameForCell(c.name);
    if (!expected) {
      unparsed += 1;
      continue;
    }
    if (storeNames.get(c.storeId) === expected) matched += 1;
    else {
      mismatched += 1;
      if (!namesPresent.has(expected)) missingStores.add(expected);
    }
  }
  const storesHoldingCells = new Set(input.cells.map((c) => c.storeId));
  const splitState: SplitState =
    input.cells.length === 0
      ? 'yacheyka yoq'
      : mismatched === 0
        ? 'bajarilgan'
        : matched === 0 && storesHoldingCells.size === 1
          ? 'qaytarilgan'
          : 'qisman';

  const totals = {
    storeQty: formatDecimalScaled([...storeQty.values()].reduce((a, b) => a + b, 0n)),
    cellQty: formatDecimalScaled([...cellQty.values()].reduce((a, b) => a + b, 0n)),
    cells: input.cells.length,
  };

  return {
    stores,
    cascade,
    cascadeConfigured,
    split: {
      matched,
      mismatched,
      unparsed,
      missingStores: [...missingStores].sort(),
      state: splitState,
    },
    unreachableQty: formatDecimalScaled(unreachableTotal),
    unreachable,
    totals,
  };
}

// ---------------------------------------------------------------------------
// Reyestr bilan solishtirish
// ---------------------------------------------------------------------------

export function diffAgainstRegistry(report: WarehouseStateReport, registry: Registry): Drift[] {
  const drifts: Drift[] = [];
  const byName = new Map(report.stores.map((s) => [s.name, s]));

  for (const expected of registry.stores) {
    const actual = byName.get(expected.name);
    if (!actual) {
      drifts.push({
        code: 'ombor-yoq',
        severity: 'xato',
        message: `Reyestrdagi «${expected.name}» ombori jonlida YOQ`,
      });
      continue;
    }
    if (expected.posPriority !== undefined && actual.posPriority !== expected.posPriority) {
      drifts.push({
        code: 'prioritet',
        severity: 'xato',
        message:
          `«${expected.name}» POS prioriteti: kutilgan ${String(expected.posPriority)}, ` +
          `jonlida ${String(actual.posPriority)}`,
      });
    }
    if (expected.brak !== undefined && actual.isBrak !== expected.brak) {
      drifts.push({
        code: 'brak-belgisi',
        severity: 'xato',
        message: `«${expected.name}» BRAK belgisi: kutilgan ${expected.brak}, jonlida ${actual.isBrak}`,
      });
    }
    if (
      expected.unassignedSource !== undefined &&
      actual.isUnassignedSource !== expected.unassignedSource
    ) {
      drifts.push({
        code: 'hovuz-belgisi',
        severity: 'xato',
        message:
          `«${expected.name}» hovuz (__unassignedSource) belgisi: ` +
          `kutilgan ${expected.unassignedSource}, jonlida ${actual.isUnassignedSource}`,
      });
    }
  }

  const known = new Set(registry.stores.map((s) => s.name));
  for (const s of report.stores) {
    if (known.has(s.name) || s.archived) continue;
    drifts.push({
      code: 'reyestrda-yoq',
      severity: 'ogohlantirish',
      message: `Jonlidagi «${s.name}» ombori reyestrda yoq (qoida 14: reyestrni yangilang)`,
    });
  }

  if (report.split.state !== registry.split) {
    drifts.push({
      code: 'split-holati',
      severity: 'xato',
      message: `Split holati: kutilgan «${registry.split}», jonlida «${report.split.state}»`,
    });
  }

  const posStore = report.stores.find((s) => s.name === registry.posSessionStore);
  if (!posStore) {
    drifts.push({
      code: 'pos-ombori',
      severity: 'xato',
      message: `Reyestrdagi POS smena ombori «${registry.posSessionStore}» jonlida yoq`,
    });
  } else if (posStore.reach !== 'reachable') {
    drifts.push({
      code: 'pos-ombori-yetib-bolmaydi',
      severity: 'xato',
      message:
        `POS smena ombori «${posStore.name}» kaskadning BIRINCHI ombori EMAS ` +
        '(06:46 hodisasining aynan shakli)',
    });
  }
  for (const s of report.stores) {
    if (s.openSessions > 0 && s.name !== registry.posSessionStore) {
      drifts.push({
        code: 'smena-boshqa-omborda',
        severity: 'ogohlantirish',
        message: `«${s.name}» da ochiq smena bor, reyestr esa «${registry.posSessionStore}» ni kutadi`,
      });
    }
  }

  const allowed = parseDecimalScaled(registry.allowUnreachableQty ?? '0');
  if (parseDecimalScaled(report.unreachableQty) > allowed) {
    for (const u of report.unreachable) {
      drifts.push({
        code: 'yetib-bolmaydigan-qoldiq',
        severity: 'xato',
        message:
          `«${u.storeName}» da ${u.qty} dona qoldiq bor, lekin POS unga yeta olmaydi (` +
          (u.reach === 'needs_approval'
            ? 'kaskadda bor, birinchi emas — G4 tasdigi kerak, G4 hali YOQ'
            : 'kaskadda umuman yoq') +
          ')',
      });
    }
  }

  return drifts;
}

/** 0 = holat reyestrga mos; 2 = drift bor (deploy qo'riqchisi shu kodni o'qiydi). */
export function exitCodeFor(drifts: readonly Drift[]): 0 | 2 {
  return drifts.some((d) => d.severity === 'xato') ? 2 : 0;
}
