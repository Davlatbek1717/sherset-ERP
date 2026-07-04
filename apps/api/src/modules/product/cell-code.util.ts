/**
 * Yacheyka (bin) kod utillari — «NN-NN-NN-NN» (sklad-polka-qavat-yacheyka).
 *
 * Label generatori (/stores/cell-labels) barcode'ni CODE128C bilan TIRESIZ
 * 8 raqam qilib bosadi — skaner «02170215» yuboradi. UI/print esa tireli
 * ko'rinishni ishlatadi. Ikkala shaklni ham (va unpadded «2-17-2-15»ni)
 * bitta manzilga parse qilamiz. Mos kelmasa null (BadRequest ga aylanadi).
 */

export interface CellAddress {
  sklad: number;
  polka: number;
  qavat: number;
  yacheyka: number;
}

export function parseCellCode(raw: string): CellAddress | null {
  const t = raw.trim();
  let segs: number[] | null = null;
  if (/^\d{1,2}(-\d{1,2}){3}$/.test(t)) {
    segs = t.split('-').map(Number);
  } else if (/^\d{8}$/.test(t)) {
    segs = [t.slice(0, 2), t.slice(2, 4), t.slice(4, 6), t.slice(6, 8)].map(Number);
  }
  if (!segs || segs.length !== 4) return null;
  const [sklad = 0, polka = 0, qavat = 0, yacheyka = 0] = segs;
  return { sklad, polka, qavat, yacheyka };
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Kanonik tireli ko'rinish — label/print bilan bir xil («02-17-02-15»). */
export function formatCellCode(a: CellAddress): string {
  return [a.sklad, a.polka, a.qavat, a.yacheyka].map(pad2).join('-');
}

/**
 * Nullable segment ustuni uchun Prisma sharti: kodda 0 = «belgilanmagan»
 * (formatBinLocation NULL'ni 00 deb bosadi), shuning uchun 0 ham NULL'ga
 * ham 0 qiymatga mos keladi.
 */
export function segmentWhere(field: string, value: number): Record<string, unknown> {
  return value === 0 ? { OR: [{ [field]: null }, { [field]: 0 }] } : { [field]: value };
}
