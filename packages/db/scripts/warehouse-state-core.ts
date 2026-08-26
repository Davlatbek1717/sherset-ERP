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
 *
 * 🔴 E5 (2026-08-26) — YETUVCHANLIK MODELI G4-2a DAN KEYIN QAYTA YOZILDI.
 * H2 yozilganda kassa FAQAT kaskadning BIRINCHI omboridan avtomatik ayirardi,
 * qolganlari esa «bosh omborchi tasdig'i kerak» (`needs_approval`) edi.
 * G4-2a (`b4c27d24`) o'sha tasdiq-to'sig'ini OLIB TASHLADI: endi
 * `retail-allocation.ts#resolveAllocStores` prioriteti bor va BRAK bo'lmagan
 * HAMMA omborni manba deb oladi. Ya'ni bu yerdagi eski model deploy'dan keyin
 * YOLG'ON QIZIL berardi (dossier D1) — qoida 13 esa shu skriptni har
 * ombor/kassa deploy'ida majburiy qiladi, ya'ni qo'riqchi «bo'ri keldi» bo'lib
 * qolardi. Endi model manbaga qaytarildi:
 *   reachable      = kaskadda BOR (o'rni muhim emas), BRAK emas
 *   outside_cascade= `__posPriority` yo'q ⇒ POS hech qachon yeta olmaydi
 *   brak           = `__brakStore` ⇒ ATAYLAB yopiq, xavf emas
 * `needs_approval` bosqichi BEKOR QILINDI (tasdiq oqimi endi umuman yo'q).
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
/**
 * G4 «Kassa oldidagi ombor» (07) — E5/(b). Yetuvchanlikka TA'SIR QILMAYDI
 * (u kaskadda turishi bilan yetadi), lekin TAQSIMOT tartibini o'zgartiradi:
 * yolg'iz qoplasa BIRINCHI, bo'linishda ENG OXIRGI. Bayroq noto'g'ri omborga
 * qo'yilsa kassa oldidagi ombor buyurtmalar bilan bo'shab qoladi — shuning
 * uchun u reyestrda yozilib, drift sifatida tekshiriladi.
 */
export const POS_FRONT_STORE_KEY = '__posFrontStore';

// ---------------------------------------------------------------------------
// Hisobot shakli
// ---------------------------------------------------------------------------

export type ReachStatus =
  /**
   * POS shu ombordan AVTOMATIK ayiradi. G4-2a dan keyin bu kaskadning
   * HAMMA ombori (ilgari faqat birinchisi edi) — `resolveAllocStores`.
   */
  | 'reachable'
  /** Kaskadda umuman yo'q (`__posPriority` yo'q) ⇒ POS hech qachon yeta olmaydi. */
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
  /** G4 `__posFrontStore` — «kassa oldidagi ombor» (taqsimot tartibi). */
  isPosFront: boolean;
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
  /** G4 `__posFrontStore` (E5/b). Berilmasa tekshirilmaydi. */
  posFront?: boolean;
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

  // --- kaskad tartibi (apps/api `resolveAllocStores` bilan bir xil) ---
  // 🔴 BRAK ombori kaskaddan CHIQARILADI — `resolveAllocStores` da ham aynan
  // shunday (`!s.isBrak`). Busiz brak omboriga tasodifan prioritet qo'yilsa u
  // bu yerda kaskad BOSHI bo'lib ko'rinardi, apps/api esa uni manba deb
  // olmasdi — ikki model ikki xil haqiqat aytardi.
  const cascade = input.stores
    .map((s) => ({
      id: s.id,
      name: s.name,
      posPriority: readPosPriority(s.attributes),
      isBrak: readBoolFlag(s.attributes, BRAK_STORE_KEY),
    }))
    .filter(
      (s): s is { id: string; name: string; posPriority: number; isBrak: boolean } =>
        s.posPriority !== null && !s.isBrak,
    )
    .sort((a, b) => a.posPriority - b.posPriority || a.name.localeCompare(b.name))
    .map(({ id, name, posPriority }) => ({ id, name, posPriority }));
  const cascadeConfigured = cascade.length > 0;
  const cascadeIds = new Set(cascade.map((s) => s.id));

  // E5 — POS kaskadning HAMMA omboriga o'zi yetadi (G4-2a: tasdiq-to'sig'i
  // olib tashlandi). Kaskad sozlanmagan bo'lsa eski zaxira yo'l: smena ombori
  // (F6 `resolveAllocStores` ning `fallbackStoreId` shoxi).
  const sessionStoreIds = new Set(
    input.openSessions.filter((s) => s.sessions > 0).map((s) => s.storeId),
  );
  const reachableIds = cascadeConfigured ? cascadeIds : sessionStoreIds;

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
        : 'outside_cascade';
    return {
      id: s.id,
      name: s.name,
      archived: s.archived,
      posPriority: readPosPriority(s.attributes),
      isBrak,
      isUnassignedSource: readBoolFlag(s.attributes, UNASSIGNED_SOURCE_KEY),
      isPosFront: readBoolFlag(s.attributes, POS_FRONT_STORE_KEY),
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
    // E5/(b) — «Kassa oldidagi ombor» (07). Taqsimot tartibini belgilaydi:
    // bayroq yo'qolsa 07 buyurtmalarda BIRINCHI bo'lib bo'shab qoladi
    // (G4-2a hisobotidagi «Jonli sozlash» 1-bandi), noto'g'ri omborda
    // bo'lsa esa oddiy ombor kassa oldidagidek ishlaydi.
    if (expected.posFront !== undefined && actual.isPosFront !== expected.posFront) {
      drifts.push({
        code: 'kassa-oldidagi-ombor',
        severity: 'xato',
        message:
          `«${expected.name}» «Kassa oldidagi ombor» (__posFrontStore) belgisi: ` +
          `kutilgan ${expected.posFront}, jonlida ${actual.isPosFront}`,
      });
    }
  }

  // Reyestrda umuman ko'rsatilmagan, lekin jonlida YOQILGAN bayroq — bu
  // taqsimot tartibini jimgina o'zgartiradi, shuning uchun ko'rinishi shart.
  const declaredPosFront = new Set(
    registry.stores.filter((s) => s.posFront === true).map((s) => s.name),
  );
  for (const s of report.stores) {
    if (s.isPosFront && !declaredPosFront.has(s.name)) {
      drifts.push({
        code: 'kassa-oldidagi-ombor-reyestrda-yoq',
        severity: 'xato',
        message: `«${s.name}» jonlida «Kassa oldidagi ombor» deb belgilangan, reyestrda esa yoq (qoida 14: reyestrni yangilang yoki bayroqni oching)`,
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
    // E5 — shart YUMSHATILMADI, QAYTA TA'RIFLANDI. G4-2a gacha «kaskad boshi
    // bo'lmasa» xato edi; endi POS kaskadning hammasiga yetadi, ya'ni haqiqiy
    // xato — smena ombori kaskadda UMUMAN bo'lmasligi (yoki BRAK bo'lishi):
    // o'shanda o'sha ombordagi qoldiq hech qachon sotilmaydi va bu 06:46
    // hodisasining aynan shakli.
    drifts.push({
      code: 'pos-ombori-yetib-bolmaydi',
      severity: 'xato',
      message:
        `POS smena ombori «${posStore.name}» POS kaskadida YOQ ` +
        `(reach=${posStore.reach}) — undagi qoldiq sotilmaydi (06:46 hodisasining shakli)`,
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
        message: `«${u.storeName}» da ${u.qty} dona qoldiq bor, lekin POS unga yeta olmaydi (kaskadda umuman yoq — omborga \`__posPriority\` qo'ying yoki qoldiqni ko'chiring)`,
      });
    }
  }

  return drifts;
}

/** 0 = holat reyestrga mos; 2 = drift bor (deploy qo'riqchisi shu kodni o'qiydi). */
export function exitCodeFor(drifts: readonly Drift[]): 0 | 2 {
  return drifts.some((d) => d.severity === 'xato') ? 2 : 0;
}
