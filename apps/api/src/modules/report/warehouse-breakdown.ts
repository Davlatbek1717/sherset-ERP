import { Prisma } from '@moysklad/db';

/**
 * «Ombor kesimi» hisobining sof qismi (2026-08-23 ombor-restrukturizatsiya).
 *
 * F1'da kesim yacheyka kodi PREFIKSIDAN hisoblanardi (bitta Store davri);
 * F5 jonli split'idan keyin har fizik ombor alohida Store bo'ldi va F7'da
 * hisob HAQIQIY Store kesimiga o'tkazildi: qator = Store (jami / yacheykalarda /
 * biriktirilmagan). Prefiks-yordamchilar (`warehousePrefixOf`, `comparePrefix`)
 * tovar kartasi yacheyka-guruhlash uchun qoladi.
 *
 * Bu modul SOF hisob: SQL/Prisma yo'q, invariantlar unit-test bilan qulflanadi.
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
// Hisobot: groupBy=warehouse — F7'dan boshlab HAQIQIY Store kesimi
// (F5 split'idan keyin prefiks == Store bo'ldi; prefiks-hisob soddalashdi)
// -------------------------------------------------------------------

export interface WarehouseRow {
  storeId: string;
  storeName: string;
  /** Shu omborda qoldig'i bor turli (kind,id) soni. */
  skuCount: number;
  /** Ombor jami (Σ stocks.qty). */
  qty: string;
  /** Yacheykalarga biriktirilgani (Σ stock_by_cell shu omborda). */
  assignedQty: string;
  /** qty − assignedQty; yacheyka jami ombordan oshsa manfiy — halol. */
  unassignedQty: string;
}

export interface WarehouseSummary {
  rows: WarehouseRow[];
  /** JAMI — filtr ostidagi Σ stocks.qty (DB'dagi haqiqiy son). */
  totalQty: string;
  totalSku: number;
  /** JAMI yacheykalarda / biriktirilmagan (Σ bo'yicha). */
  totalAssignedQty: string;
  totalUnassignedQty: string;
}

/**
 * SQL store-agregatlaridan yakuniy ko'rinishni yig'adi.
 * INVARIANT: Σ(rows.qty) == totalQty — ikkala son BIR filtrli `stocks`
 * yig'indisi (guruhli/guruhsiz); unassigned har qatorda qty − assigned.
 * totalSku esa omborlararo DISTINCT — qatorlar yig'indisi EMAS (bir SKU bir
 * nechta omborda bo'lsa bir marta sanaladi).
 */
export function buildWarehouseSummary(
  storeRows: Array<{
    storeId: string;
    storeName: string;
    skuCount: number;
    qty: string;
    assignedQty: string;
  }>,
  agg: { totalQty: string; totalSku: number; unassignedQty: string },
  opts?: { hideEmpty?: boolean },
): WarehouseSummary {
  let rows: WarehouseRow[] = storeRows
    .map((r) => ({
      storeId: r.storeId,
      storeName: r.storeName,
      skuCount: r.skuCount,
      qty: r.qty,
      assignedQty: r.assignedQty,
      unassignedQty: new Prisma.Decimal(r.qty).minus(r.assignedQty).toString(),
    }))
    .sort((a, b) => a.storeName.localeCompare(b.storeName));
  if (opts?.hideEmpty) {
    rows = rows.filter(
      (r) => !new Prisma.Decimal(r.qty).isZero() || !new Prisma.Decimal(r.assignedQty).isZero(),
    );
  }
  return {
    rows,
    totalQty: agg.totalQty,
    totalSku: agg.totalSku,
    totalAssignedQty: new Prisma.Decimal(agg.totalQty).minus(agg.unassignedQty).toString(),
    totalUnassignedQty: agg.unassignedQty,
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
