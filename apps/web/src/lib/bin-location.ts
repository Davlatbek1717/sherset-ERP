/**
 * Sherset warehouse home location — 4 numeric bin segments composed into the
 * «NN-NN-NN-NN» code (sklad-polka-qavat-yacheyka). Shared by the product form
 * preview, the products list column, and (later) the price-tag/QR label.
 */
export interface BinLocation {
  locSklad?: number | null;
  locPolka?: number | null;
  locQavat?: number | null;
  locYacheyka?: number | null;
}

const pad2 = (n?: number | null): string => String(n ?? 0).padStart(2, '0');

/**
 * Compose the location code. Returns '' when ALL segments are unset (so the UI
 * can show «—»); a partially-filled location still renders, with unset segments
 * shown as «00» (e.g. only polka=2 → «00-02-00-00»).
 */
export function formatBinLocation(loc: BinLocation | null | undefined): string {
  if (!loc) return '';
  const { locSklad, locPolka, locQavat, locYacheyka } = loc;
  if (locSklad == null && locPolka == null && locQavat == null && locYacheyka == null) {
    return '';
  }
  return [locSklad, locPolka, locQavat, locYacheyka].map(pad2).join('-');
}

/**
 * Yacheyka-kod kiritmasini kanonik «NN-NN-NN-NN» ko'rinishga keltiradi.
 * Qabul qilinadigan shakllar: skaner yuboradigan tiresiz 8 raqam
 * (label CODE128C shu formatda bosiladi), tireli padded/unpadded kod.
 * Mos kelmasa null. API'dagi parseCellCode bilan bir xil qoidalar.
 */
export function normalizeCellCode(raw: string): string | null {
  const t = raw.trim();
  let segs: number[] | null = null;
  if (/^\d{1,2}(-\d{1,2}){3}$/.test(t)) {
    segs = t.split('-').map(Number);
  } else if (/^\d{8}$/.test(t)) {
    segs = [t.slice(0, 2), t.slice(2, 4), t.slice(4, 6), t.slice(6, 8)].map(Number);
  }
  if (!segs || segs.length !== 4) return null;
  return segs.map(pad2).join('-');
}
