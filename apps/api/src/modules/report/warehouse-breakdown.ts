import { Prisma } from '@moysklad/db';

/**
 * F1 (2026-08-23 ombor-restrukturizatsiya rejasi) — yacheyka kodi PREFIKSIDAN
 * hisoblangan «ombor kesimi». Ma'lumot KO'CHIRILMAYDI: tizimda hali bitta
 * Store, lekin yacheyka kodi `NN-SS-QQ-OO` (ombor-stelaj-qavat-o'rin) bo'lgani
 * uchun birinchi segment fizik omborni ishonchli belgilaydi (reja 1-bo'lim:
 * zonalar chalkash, yagona ishonchli manba — yacheyka kodi prefiksi).
 *
 * Bu modul SOF hisob: SQL/Prisma yo'q, shuning uchun invariantlar unit-test
 * bilan qulflanadi. F5 (jonli split) dan keyin prefiks-hisob haqiqiy Store
 * kesimiga o'tadi — o'shanda bu modul soddalashadi/yo'qoladi.
 */

const DECIMAL_ZERO = new Prisma.Decimal(0);

/**
 * Yacheyka kodidan ombor prefiksini oladi: `01-02-03-04` → `01`.
 * Standart bo'lmagan nom (raqam-defis bilan boshlanmasa) → null —
 * bunday yacheykalar «prefikssiz» guruhga tushadi, YO'QOLMAYDI.
 */
export function warehousePrefixOf(cellName: string): string | null {
  const m = /^(\d+)-/.exec(cellName.trim());
  return m?.[1] ?? null;
}

/** Prefikslar tartibi: raqam bo'yicha o'sish, null (prefikssiz) oxirida. */
export function comparePrefix(a: string | null, b: string | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const na = Number(a);
  const nb = Number(b);
  if (na !== nb) return na - nb;
  return a.localeCompare(b);
}

// -------------------------------------------------------------------
// Hisobot: groupBy=warehouse
// -------------------------------------------------------------------

export interface WarehouseRow {
  /** `01`, `02`, … yoki null — prefikssiz (nostandart nomli) yacheykalar. */
  prefix: string | null;
  /** Shu prefiksli yacheykalarda qoldig'i bor turli (kind,id) soni. */
  skuCount: number;
  qty: string;
}

export interface WarehouseSummary {
  rows: WarehouseRow[];
  /** Hech bir yacheykaga biriktirilmagan qoldiq (Σstocks − Σyacheykalar). */
  unassigned: { skuCount: number; qty: string };
  /** JAMI — filtr ostidagi Σ stocks.qty (ombor jami, DB'dagi haqiqiy son). */
  totalQty: string;
  totalSku: number;
}

/**
 * SQL agregatlaridan yakuniy ko'rinishni yig'adi.
 * INVARIANT: Σ(rows.qty) + unassigned.qty == totalQty — chunki unassigned
 * SQL'da aynan (Σstocks − Σyacheykalar) deb hisoblanadi; test qulflaydi.
 */
export function buildWarehouseSummary(
  prefixRows: Array<{ prefix: string | null; skuCount: number; qty: string }>,
  agg: { totalQty: string; totalSku: number; unassignedQty: string; unassignedSku: number },
  opts?: { hideEmpty?: boolean },
): WarehouseSummary {
  // Bir xil prefiks (masalan SQL null + JS-normalizatsiya) birlashtiriladi.
  const merged = new Map<string | null, { skuCount: number; qty: Prisma.Decimal }>();
  for (const r of prefixRows) {
    const key = r.prefix;
    const cur = merged.get(key) ?? { skuCount: 0, qty: DECIMAL_ZERO };
    // NB: null-guruh birlashganda skuCount taxminan yig'iladi (bir SKU ikki
    // nostandart yacheykada bo'lsa ikki hisoblanishi mumkin) — SQL DISTINCT
    // guruh ichida aniq, guruhlararo emas. Prefiksli guruhlar SQL'dan bir
    // qatordan keladi, ular aniq.
    merged.set(key, { skuCount: cur.skuCount + r.skuCount, qty: cur.qty.plus(r.qty) });
  }
  let rows: WarehouseRow[] = [...merged.entries()]
    .map(([prefix, v]) => ({ prefix, skuCount: v.skuCount, qty: v.qty.toString() }))
    .sort((a, b) => comparePrefix(a.prefix, b.prefix));
  if (opts?.hideEmpty) {
    rows = rows.filter((r) => !new Prisma.Decimal(r.qty).isZero());
  }
  return {
    rows,
    unassigned: { skuCount: agg.unassignedSku, qty: agg.unassignedQty },
    totalQty: agg.totalQty,
    totalSku: agg.totalSku,
  };
}

// -------------------------------------------------------------------
// Tovar kartasi: yacheykalar kesimi
// -------------------------------------------------------------------

export interface ProductCellRow {
  cellId: string;
  name: string;
  qty: string;
}

export interface ProductCellGroup {
  prefix: string | null;
  qty: string;
  cells: ProductCellRow[];
}

export interface ProductStoreBreakdown {
  storeId: string;
  storeName: string | null;
  /** Stock.qty — ombor jami (hujjat-hosilaviy haqiqat). */
  totalQty: string;
  /** Σ yacheykalardagi qoldiq. */
  assignedQty: string;
  /** totalQty − assignedQty; yacheyka jami ombordan oshsa manfiy — halol. */
  unassignedQty: string;
  groups: ProductCellGroup[];
}

/**
 * Bitta tovarning ombor×yacheyka kesimi. Kirish — ikki xom ro'yxat
 * (stocks + stock_by_cell JOIN cells), chiqish — ombor qatorlari ostidagi
 * prefiks-guruhlangan yacheykalar + «biriktirilmagan» qoldiq.
 */
export function buildProductCellBreakdown(
  stocks: Array<{ storeId: string; storeName: string | null; qty: string }>,
  cells: Array<{ storeId: string; cellId: string; cellName: string; qty: string }>,
): ProductStoreBreakdown[] {
  const byStore = new Map<
    string,
    { storeName: string | null; total: Prisma.Decimal; cells: typeof cells }
  >();
  for (const s of stocks) {
    byStore.set(s.storeId, {
      storeName: s.storeName,
      total: new Prisma.Decimal(s.qty),
      cells: [],
    });
  }
  for (const c of cells) {
    // Stock qatori yo'q, lekin yacheykada qoldiq bor ombor ham ko'rinsin —
    // bunday nomuvofiqlik yashirilmaydi (unassigned manfiy chiqadi).
    const entry = byStore.get(c.storeId) ?? {
      storeName: null,
      total: DECIMAL_ZERO,
      cells: [],
    };
    entry.cells.push(c);
    byStore.set(c.storeId, entry);
  }

  const out: ProductStoreBreakdown[] = [];
  for (const [storeId, entry] of byStore) {
    const groups = new Map<string | null, { qty: Prisma.Decimal; cells: ProductCellRow[] }>();
    let assigned = DECIMAL_ZERO;
    for (const c of entry.cells) {
      const prefix = warehousePrefixOf(c.cellName);
      const g = groups.get(prefix) ?? { qty: DECIMAL_ZERO, cells: [] };
      g.qty = g.qty.plus(c.qty);
      g.cells.push({ cellId: c.cellId, name: c.cellName, qty: c.qty });
      groups.set(prefix, g);
      assigned = assigned.plus(c.qty);
    }
    out.push({
      storeId,
      storeName: entry.storeName,
      totalQty: entry.total.toString(),
      assignedQty: assigned.toString(),
      unassignedQty: entry.total.minus(assigned).toString(),
      groups: [...groups.entries()]
        .map(([prefix, g]) => ({
          prefix,
          qty: g.qty.toString(),
          cells: g.cells.sort((a, b) => a.name.localeCompare(b.name)),
        }))
        .sort((a, b) => comparePrefix(a.prefix, b.prefix)),
    });
  }
  return out.sort((a, b) => (a.storeName ?? '').localeCompare(b.storeName ?? ''));
}
