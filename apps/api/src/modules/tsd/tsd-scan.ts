/**
 * TSD skan-qidiruvining SOF yadrosi (Prisma yo'q, Nest yo'q) — G-reja G5.
 *
 * 🔴 NEGA UMUMAN ALOHIDA SIRT BOR (`/products` o'rniga):
 * `GET /products` to'liq tovar qatorini qaytaradi — `buyPrice`, `minPrice`,
 * `salePrices` ham. Egasining qoidasi esa aniq: «Ombor xodimlari narx
 * ko'rmaydi; kirim narxi faqat katta omborchiga». Ya'ni marshrutni TSD
 * allowlist'iga qo'shishning o'zi kirim narxini terminalga ochib yuborardi
 * (ekranda ko'rsatmaslik — himoya emas, `curl` bor). Shuning uchun TSD
 * skaneri O'Z endpointiga ega va ustunlar bu yerda OQ RO'YXAT bilan
 * sanab chiqilgan.
 */

/**
 * Tovar javobiga chiqadigan maydonlar — NARXSIZ oq ro'yxat.
 *
 * Prisma `select` sifatida ishlatiladi (qora ro'yxat EMAS): kelajakda
 * `Product` ga yangi narx ustuni qo'shilsa u bu yerga O'Z-O'ZIDAN kirmaydi.
 * Test shu obyektni narx-nomli kalitlar yo'qligiga qulflaydi.
 */
export const TSD_PRODUCT_SELECT = {
  id: true,
  name: true,
  code: true,
  article: true,
  barcodes: true,
  uom: true,
  archived: true,
  attributes: true,
} as const;

/** Skan kodining turi. */
export type ScanCodeKind = 'piece' | 'cell' | 'product';

/**
 * K-reja (`2026-08-25-bolinadigan-tovar-bolak-hisobi.md`, 7.3) — bo'lak
 * yorliqlari `BLK-` makonida va **mutlaqo unikal**, tovar shtrixlari esa
 * ataylab unikal EMAS (multi-hit). Ikkalasi bir qidiruvga tushsa omborchi
 * bo'lakni skanerlaganda tovar tanlovi ochilib, kesim oqimi buzilardi.
 *
 * K-reja hali qurilmagan (K1…K6 boshlanmagan), shuning uchun bu yerda
 * bo'lak kodi TANILADI, lekin `supported: false` bilan qaytadi — terminal
 * «bu bo'lak kodi, hali qo'llab-quvvatlanmaydi» deb aytadi va JIMGINA
 * noto'g'ri tovarni ochmaydi.
 */
export const PIECE_CODE_PREFIX = 'BLK-';

/**
 * Skaner yuborgan qiymatni tozalaydi.
 *
 * Web `/scan` sahifasidagi `normalizeScanInput` bilan bir xil vazifa:
 * eski QR yorliqlar `.../scan?c=<kod>` ko'rinishida keladi.
 */
export function normalizeScanCode(raw: string): string {
  const s = raw.trim();
  if (!s.includes('/scan?') && !s.startsWith('scan?')) return s;
  const query = s.slice(s.indexOf('?') + 1);
  for (const pair of query.split('&')) {
    const [k, v = ''] = pair.split('=');
    if (k === 'c') {
      try {
        return decodeURIComponent(v);
      } catch {
        return v;
      }
    }
  }
  return s;
}

/** `NN-NN-NN-NN` yoki 8 raqamli yacheyka kodi (label CODE128C tiresiz bosadi). */
const CELL_CODE_RE = /^(\d{1,2}(-\d{1,2}){3}|\d{8})$/;

/**
 * Kod nimani bildiradi. Tartib MUHIM: bo'lak prefiksi birinchi tekshiriladi,
 * chunki u boshqa hech nimaga o'xshamasligi kerak (K-reja 7.3).
 */
export function classifyScanCode(code: string): ScanCodeKind {
  if (code.toUpperCase().startsWith(PIECE_CODE_PREFIX)) return 'piece';
  if (CELL_CODE_RE.test(code)) return 'cell';
  return 'product';
}

export interface ProductHitLike {
  id: string;
  code: string | null;
  barcodes: string[] | null;
}

/**
 * Multi-hit tanlovi — G-rejaning majburiy qoidasi («shtrixlar ataylab UNIKAL
 * EMAS»). Aynan mos kelgan shtrix/kod bo'lsa faqat o'shalar qoladi, aks holda
 * qidiruv natijasi to'liq qaytadi va TANLOVNI ODAM qiladi.
 *
 * Web `/scan` sahifasidagi mantiq bilan bir xil: skanerlangan token hech
 * qachon prefiks emas, shuning uchun aniq moslik ustun.
 */
export function pickExactHits<T extends ProductHitLike>(items: readonly T[], code: string): T[] {
  const exact = items.filter((p) => p.barcodes?.includes(code) || p.code === code);
  return exact.length > 0 ? exact : [...items];
}
