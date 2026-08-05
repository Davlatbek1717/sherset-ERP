/**
 * MoySklad buyurtma pozitsiyasi → MAHALLIY tovar → yacheyka.
 *
 * NEGA ALOHIDA, SOF MODUL: MoySklad'dan kelgan pozitsiyada bizning
 * `productId` YO'Q — faqat nom, kod va shtrix-kod bor. Ya'ni yacheykani
 * topish uchun **taxmin** qilish kerak, va taxminning qoidasi omborchini
 * qaysi javonga yuborishini belgilaydi. Bu qoida servis ichida yashasa,
 * uni sinash uchun butun DB ko'tarish kerak bo'lardi.
 *
 * ⚠️ **ENG MUHIM QAROR: noto'g'ri yacheyka — yacheyka yo'qligidan YOMON.**
 * Omborchi «01-02-03» deb yozilgan chekni olib, o'sha javonga boradi va
 * tovarni topmaydi — vaqt ketadi, ishonch ketadi. Yacheyka bo'sh bo'lsa u
 * hech bo'lmasa qidiradi yoki so'raydi. Shu sababli:
 *   • NOM bo'yicha moslashtirish YO'Q — ikki xil tovar bir xil nomda
 *     bo'lishi mumkin («Kabel 2.5» — o'nlab ishlab chiqaruvchi);
 *   • bitta kod bir necha tovarga tushsa va yacheykalari FARQ qilsa →
 *     `null` + `ambiguous` belgisi (taxmin qilinmaydi);
 *   • kod bo'yicha topilmasa shtrix-kodga o'tiladi (aniqroq identifikator).
 */

/** MoySklad pozitsiyasidan kerakli minimal. */
export interface MsPositionLike {
  name: string;
  qty: number;
  code: string | null;
  barcode: string | null;
  uom?: string | null;
}

/** Mahalliy tovar — yacheyka bilan. */
export interface LocalProductLike {
  id: string;
  code: string | null;
  barcodes: ReadonlyArray<string>;
  /** `__yacheyka` atributidan olingan uy-yacheykasi; biriktirilmagan bo'lsa null. */
  cell: string | null;
}

/** Yacheyka qanday topildi — chekda ham, nosozlikni tekshirishda ham kerak. */
export const CELL_MATCH = {
  /** Kod bo'yicha aniq moslik. */
  code: 'code',
  /** Shtrix-kod bo'yicha moslik. */
  barcode: 'barcode',
  /** Mahalliy tovar topildi, lekin yacheyka biriktirilmagan. */
  noCell: 'no-cell',
  /** Mahalliy tovar topilmadi. */
  noProduct: 'no-product',
  /** Bir necha tovarga tushdi va yacheykalari farq qiladi — taxmin qilinmadi. */
  ambiguous: 'ambiguous',
} as const;

export type CellMatch = (typeof CELL_MATCH)[keyof typeof CELL_MATCH];

export interface ResolvedPickPosition {
  name: string;
  qty: number;
  code: string | null;
  barcode: string | null;
  uom: string | null;
  cell: string | null;
  /** Qanday topilgani — omborchiga «nega yacheyka yo'q» ni tushuntiradi. */
  match: CellMatch;
}

/** Bo'sh/probelli kodni yo'q deb hisoblaymiz (MoySklad'da bo'sh satr keladi). */
function key(v: string | null | undefined): string | null {
  const s = (v ?? '').trim();
  return s.length > 0 ? s : null;
}

/**
 * Indeks: kod/shtrix-kod → tovar(lar). Bir kalitga bir necha tovar tushishi
 * MUMKIN (real ma'lumotda uchraydi) — shuning uchun ro'yxat saqlanadi va
 * noaniqlik keyin hal qilinadi, jimgina birinchisi olinmaydi.
 */
function buildIndex(products: ReadonlyArray<LocalProductLike>) {
  const byCode = new Map<string, LocalProductLike[]>();
  const byBarcode = new Map<string, LocalProductLike[]>();
  const push = (m: Map<string, LocalProductLike[]>, k: string, p: LocalProductLike) => {
    const arr = m.get(k);
    if (arr) arr.push(p);
    else m.set(k, [p]);
  };
  for (const p of products) {
    const c = key(p.code);
    if (c) push(byCode, c, p);
    for (const b of p.barcodes) {
      const bk = key(b);
      if (bk) push(byBarcode, bk, p);
    }
  }
  return { byCode, byBarcode };
}

/**
 * Nomzodlardan yacheyka: hammasi BIR XIL yacheykani ko'rsatsagina qabul
 * qilinadi. Ikki javon aytilsa — javob yo'q.
 *
 * `null` yacheykali nomzodlar hisobga olinmaydi: kod bo'yicha ikki tovar
 * topilib, biri yacheykaga biriktirilgan bo'lsa, o'shanisi to'g'ri javob
 * (ikkinchisi shunchaki hali biriktirilmagan).
 */
function cellFromCandidates(candidates: ReadonlyArray<LocalProductLike>): {
  cell: string | null;
  ambiguous: boolean;
} {
  const cells = new Set<string>();
  for (const c of candidates) {
    const cell = key(c.cell);
    if (cell) cells.add(cell);
  }
  if (cells.size === 0) return { cell: null, ambiguous: false };
  if (cells.size > 1) return { cell: null, ambiguous: true };
  return { cell: [...cells][0] ?? null, ambiguous: false };
}

/**
 * Har pozitsiya uchun yacheykani aniqlaydi.
 *
 * Tartib: **kod → shtrix-kod**. Kod birinchi, chunki MoySklad'dagi kod
 * bizga import qilingan tovar kodi bilan bir xil manbadan keladi;
 * shtrix-kod esa ba'zi tovarlarda umuman yo'q.
 */
export function resolvePickCells(
  positions: ReadonlyArray<MsPositionLike>,
  products: ReadonlyArray<LocalProductLike>,
): ResolvedPickPosition[] {
  const { byCode, byBarcode } = buildIndex(products);

  return positions.map((pos) => {
    const base = {
      name: pos.name,
      qty: pos.qty,
      code: key(pos.code),
      barcode: key(pos.barcode),
      uom: pos.uom ?? null,
    };

    const tryKey = (
      k: string | null,
      index: Map<string, LocalProductLike[]>,
      match: CellMatch,
    ): ResolvedPickPosition | null => {
      if (!k) return null;
      const found = index.get(k);
      if (!found || found.length === 0) return null;
      const { cell, ambiguous } = cellFromCandidates(found);
      if (ambiguous) return { ...base, cell: null, match: CELL_MATCH.ambiguous };
      if (!cell) return { ...base, cell: null, match: CELL_MATCH.noCell };
      return { ...base, cell, match };
    };

    return (
      tryKey(base.code, byCode, CELL_MATCH.code) ??
      tryKey(base.barcode, byBarcode, CELL_MATCH.barcode) ?? {
        ...base,
        cell: null,
        match: CELL_MATCH.noProduct,
      }
    );
  });
}

/** Chek sarlavhasidagi qisqa xulosa — omborchi darhol ko'radi. */
export interface PickCoverage {
  total: number;
  withCell: number;
  /** Yacheykasi yo'qlar — omborchi ularni qidirishi kerak. */
  withoutCell: number;
  /** Noaniqlik tufayli aytilmaganlar (alohida: bu ma'lumot xatosi). */
  ambiguous: number;
}

/**
 * Qoplama xulosasi.
 *
 * `ambiguous` alohida sanaladi: «yacheyka biriktirilmagan» — omborchi ishi,
 * «bir necha javon ko'rsatildi» — ma'lumot xatosi va uni menejer tuzatadi.
 * Ikkalasini bitta raqamga qo'shish muammoning turini yashirardi.
 */
export function pickCoverage(positions: ReadonlyArray<ResolvedPickPosition>): PickCoverage {
  let withCell = 0;
  let ambiguous = 0;
  for (const p of positions) {
    if (p.cell) withCell += 1;
    else if (p.match === CELL_MATCH.ambiguous) ambiguous += 1;
  }
  return {
    total: positions.length,
    withCell,
    withoutCell: positions.length - withCell,
    ambiguous,
  };
}
