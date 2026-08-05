import { describe, expect, it } from 'vitest';
import {
  CELL_MATCH,
  type LocalProductLike,
  pickCoverage,
  resolvePickCells,
} from './pick-cell-resolve.js';

const P = (over: Partial<LocalProductLike> & { id: string }): LocalProductLike => ({
  code: null,
  barcodes: [],
  cell: null,
  ...over,
});

describe('resolvePickCells — kod bo`yicha', () => {
  it('kod aniq mos kelsa yacheyka topiladi', () => {
    const r = resolvePickCells(
      [{ name: 'Kabel 2.5', qty: 3, code: 'K-25', barcode: null }],
      [P({ id: 'p1', code: 'K-25', cell: '01-02-03-04' })],
    );
    expect(r[0]?.cell).toBe('01-02-03-04');
    expect(r[0]?.match).toBe(CELL_MATCH.code);
  });

  it('kod atrofidagi probel ahamiyatsiz', () => {
    const r = resolvePickCells(
      [{ name: 'X', qty: 1, code: ' K-25 ', barcode: null }],
      [P({ id: 'p1', code: 'K-25', cell: '02-01-01-01' })],
    );
    expect(r[0]?.cell).toBe('02-01-01-01');
  });

  it('bo`sh kod — kod bo`yicha qidirilmaydi', () => {
    // MoySklad'da bo'sh satr keladi; uni kalit sifatida ishlatish
    // kodsiz tovarlarni bir-biriga bog'lab qo'yardi.
    const r = resolvePickCells(
      [{ name: 'X', qty: 1, code: '  ', barcode: null }],
      [P({ id: 'p1', code: '', cell: '01-01-01-01' })],
    );
    expect(r[0]?.match).toBe(CELL_MATCH.noProduct);
    expect(r[0]?.cell).toBeNull();
  });
});

describe('resolvePickCells — shtrix-kod zaxira yo`l', () => {
  it('kod topilmasa shtrix-kod bo`yicha topiladi', () => {
    const r = resolvePickCells(
      [{ name: 'X', qty: 1, code: 'YO-Q', barcode: '4780001112223' }],
      [P({ id: 'p1', barcodes: ['4780001112223'], cell: '03-04-05-06' })],
    );
    expect(r[0]?.cell).toBe('03-04-05-06');
    expect(r[0]?.match).toBe(CELL_MATCH.barcode);
  });

  it('kod USTUN — ikkalasi ham bo`lsa kod g`olib', () => {
    const r = resolvePickCells(
      [{ name: 'X', qty: 1, code: 'C1', barcode: 'B1' }],
      [
        P({ id: 'byCode', code: 'C1', cell: '01-01-01-01' }),
        P({ id: 'byBarcode', barcodes: ['B1'], cell: '09-09-09-09' }),
      ],
    );
    expect(r[0]?.cell).toBe('01-01-01-01');
    expect(r[0]?.match).toBe(CELL_MATCH.code);
  });

  it('tovarning bir necha shtrix-kodi ishlaydi', () => {
    const r = resolvePickCells(
      [{ name: 'X', qty: 1, code: null, barcode: 'B2' }],
      [P({ id: 'p1', barcodes: ['B1', 'B2', 'B3'], cell: '05-05-05-05' })],
    );
    expect(r[0]?.cell).toBe('05-05-05-05');
  });
});

describe('resolvePickCells — NOTO`G`RI yacheykadan ko`ra YO`Q yacheyka', () => {
  it('nom bo`yicha MOSLASHTIRILMAYDI', () => {
    // «Kabel 2.5» o'nlab ishlab chiqaruvchida bor — nom bo'yicha bog'lash
    // omborchini boshqa javonga yuborardi.
    const r = resolvePickCells(
      [{ name: 'Kabel 2.5', qty: 1, code: null, barcode: null }],
      [P({ id: 'p1', code: 'X', cell: '01-01-01-01' })],
    );
    expect(r[0]?.cell).toBeNull();
    expect(r[0]?.match).toBe(CELL_MATCH.noProduct);
  });

  it('bir kod IKKI xil yacheykaga tushsa — javob YO`Q (ambiguous)', () => {
    const r = resolvePickCells(
      [{ name: 'X', qty: 1, code: 'DUP', barcode: null }],
      [
        P({ id: 'a', code: 'DUP', cell: '01-01-01-01' }),
        P({ id: 'b', code: 'DUP', cell: '07-07-07-07' }),
      ],
    );
    expect(r[0]?.cell).toBeNull();
    expect(r[0]?.match).toBe(CELL_MATCH.ambiguous);
  });

  it('bir kod, ikki tovar, BIR XIL yacheyka — javob bor', () => {
    // Nusxa kartochka bo'lishi mumkin; ikkisi ham bir javonda bo'lsa
    // omborchi uchun javob aniq.
    const r = resolvePickCells(
      [{ name: 'X', qty: 1, code: 'DUP', barcode: null }],
      [
        P({ id: 'a', code: 'DUP', cell: '01-01-01-01' }),
        P({ id: 'b', code: 'DUP', cell: '01-01-01-01' }),
      ],
    );
    expect(r[0]?.cell).toBe('01-01-01-01');
    expect(r[0]?.match).toBe(CELL_MATCH.code);
  });

  it('ikki nomzod: biri biriktirilgan, biri yo`q — biriktirilgani olinadi', () => {
    const r = resolvePickCells(
      [{ name: 'X', qty: 1, code: 'DUP', barcode: null }],
      [P({ id: 'a', code: 'DUP', cell: null }), P({ id: 'b', code: 'DUP', cell: '02-02-02-02' })],
    );
    expect(r[0]?.cell).toBe('02-02-02-02');
  });

  it('tovar topildi-yu yacheyka biriktirilmagan — no-cell (no-product EMAS)', () => {
    // Farq muhim: omborchiga «tovar bizda bor, faqat javoni belgilanmagan»
    // deyish bilan «bunday tovar yo'q» deyish boshqa-boshqa ish.
    const r = resolvePickCells(
      [{ name: 'X', qty: 1, code: 'C1', barcode: null }],
      [P({ id: 'p1', code: 'C1', cell: null })],
    );
    expect(r[0]?.match).toBe(CELL_MATCH.noCell);
    expect(r[0]?.cell).toBeNull();
  });
});

describe('resolvePickCells — pozitsiya maydonlari saqlanadi', () => {
  it('nom, miqdor, o`lchov birligi o`zgarmaydi', () => {
    const r = resolvePickCells(
      [{ name: 'Kabel', qty: 2.5, code: 'C', barcode: 'B', uom: 'm' }],
      [P({ id: 'p1', code: 'C', cell: '01-01-01-01' })],
    );
    expect(r[0]).toMatchObject({ name: 'Kabel', qty: 2.5, uom: 'm', code: 'C', barcode: 'B' });
  });

  it('pozitsiyalar tartibi va soni o`zgarmaydi', () => {
    const r = resolvePickCells(
      [
        { name: 'A', qty: 1, code: 'a', barcode: null },
        { name: 'B', qty: 1, code: null, barcode: null },
        { name: 'C', qty: 1, code: 'c', barcode: null },
      ],
      [P({ id: 'p1', code: 'c', cell: '01-01-01-01' })],
    );
    expect(r.map((x) => x.name)).toEqual(['A', 'B', 'C']);
  });

  it('bo`sh buyurtma bo`sh natija beradi', () => {
    expect(resolvePickCells([], [P({ id: 'p1' })])).toEqual([]);
  });
});

describe('pickCoverage — omborchiga xulosa', () => {
  const products = [
    P({ id: 'a', code: 'A', cell: '01-01-01-01' }),
    P({ id: 'b', code: 'B', cell: null }),
    P({ id: 'd1', code: 'D', cell: '01-01-01-01' }),
    P({ id: 'd2', code: 'D', cell: '02-02-02-02' }),
  ];

  it('topilgan/topilmagan sanoq to`g`ri', () => {
    const r = resolvePickCells(
      [
        { name: '1', qty: 1, code: 'A', barcode: null },
        { name: '2', qty: 1, code: 'B', barcode: null },
        { name: '3', qty: 1, code: 'YOQ', barcode: null },
      ],
      products,
    );
    const c = pickCoverage(r);
    expect(c).toEqual({ total: 3, withCell: 1, withoutCell: 2, ambiguous: 0 });
  });

  it('noaniqlik ALOHIDA sanaladi (ma`lumot xatosi ≠ biriktirilmagan)', () => {
    const r = resolvePickCells([{ name: '1', qty: 1, code: 'D', barcode: null }], products);
    const c = pickCoverage(r);
    expect(c.ambiguous).toBe(1);
    expect(c.withoutCell).toBe(1);
  });

  it('hammasi topilganda withoutCell = 0', () => {
    const r = resolvePickCells([{ name: '1', qty: 1, code: 'A', barcode: null }], products);
    expect(pickCoverage(r)).toEqual({ total: 1, withCell: 1, withoutCell: 0, ambiguous: 0 });
  });

  it('bo`sh ro`yxatda hammasi nol', () => {
    expect(pickCoverage([])).toEqual({ total: 0, withCell: 0, withoutCell: 0, ambiguous: 0 });
  });
});
