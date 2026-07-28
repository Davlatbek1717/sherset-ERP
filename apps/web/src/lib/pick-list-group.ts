/**
 * Pick-list print grouping (owner spec 2026-07-27):
 * - the cell code is `WW-PP-RR-CC` — the FIRST segment is the warehouse number
 *   («01» = birinchi ombor);
 * - the print shows ONE SEPARATE TABLE PER WAREHOUSE, headed by its number
 *   («01», «02», …), warehouses in ascending order;
 * - inside a warehouse, rows are ordered by shelf/cell — segment-wise numeric
 *   compare of the full cell code (01-02-x before 01-10-x, i.e. NOT string sort);
 * - positions whose product has no bound cell go into a trailing group
 *   (warehouse = null) sorted by product name.
 */
export interface PickPosition {
  name: string;
  qty: number;
  code: string | null;
  barcode: string | null;
  cell: string | null;
}

export interface PickGroup {
  /** «01», «02», … or null for the cell-less trailing group. */
  warehouse: string | null;
  positions: PickPosition[];
}

/** Segment-wise compare: numeric when both segments are numeric, else string. */
export function compareCellCodes(a: string, b: string): number {
  const as = a.split('-');
  const bs = b.split('-');
  const len = Math.max(as.length, bs.length);
  for (let i = 0; i < len; i++) {
    const x = as[i] ?? '';
    const y = bs[i] ?? '';
    if (x === y) continue;
    const nx = Number(x);
    const ny = Number(y);
    if (Number.isFinite(nx) && Number.isFinite(ny) && x !== '' && y !== '') {
      if (nx !== ny) return nx - ny;
      continue;
    }
    return x.localeCompare(y, 'ru');
  }
  return 0;
}

export function warehouseOfCell(cell: string | null): string | null {
  if (!cell) return null;
  const first = cell.split('-')[0]?.trim();
  return first ? first : null;
}

export function groupByWarehouse<T extends { name: string; cell: string | null }>(
  positions: T[],
): Array<{ warehouse: string | null; positions: T[] }> {
  const byWarehouse = new Map<string, T[]>();
  const noCell: T[] = [];
  for (const p of positions) {
    const w = warehouseOfCell(p.cell);
    if (!w) {
      noCell.push(p);
      continue;
    }
    const list = byWarehouse.get(w) ?? [];
    list.push(p);
    byWarehouse.set(w, list);
  }
  const groups: Array<{ warehouse: string | null; positions: T[] }> = [...byWarehouse.entries()]
    .sort(([a], [b]) => compareCellCodes(a, b))
    .map(([warehouse, list]) => ({
      warehouse,
      positions: [...list].sort(
        (a, b) =>
          compareCellCodes(a.cell ?? '', b.cell ?? '') || a.name.localeCompare(b.name, 'ru'),
      ),
    }));
  if (noCell.length) {
    groups.push({
      warehouse: null,
      positions: [...noCell].sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    });
  }
  return groups;
}
