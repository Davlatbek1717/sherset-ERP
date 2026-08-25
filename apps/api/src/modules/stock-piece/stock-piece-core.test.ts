import { describe, expect, it } from 'vitest';
import { PIECE_CODE_PREFIX } from '../tsd/tsd-scan.js';
import {
  MIN_USEFUL_LENGTH,
  PIECE_LABEL_PREFIX,
  type ReconInput,
  buildPieceReconciliation,
  formatPieceLabel,
  isPieceLabel,
  isScrapLength,
  validatePiece,
} from './stock-piece-core.js';

/**
 * K1 — bo'lak reyestri yadrosi.
 *
 * Uch narsani qulflaydi:
 *   1. YORLIQ MAKONI (K-reja 7.3) — `BLK-` va tovar shtrixlari aralashmasin;
 *   2. GUARD — modelning qat'iy qoidalari (`whole` ⟹ yorliqsiz va h.k.);
 *   3. SVERKA — reyestr ↔ qoldiq, IKKI QATLAM (yacheykali + yacheykasiz).
 */

// ---------------------------------------------------------------------------
// 1. Yorliq makoni
// ---------------------------------------------------------------------------

describe('yorliq makoni (K-reja 7.3)', () => {
  it('prefiksning YAGONA uyi yadro — tsd-scan shundan oladi', () => {
    expect(PIECE_CODE_PREFIX).toBe(PIECE_LABEL_PREFIX);
    expect(PIECE_LABEL_PREFIX).toBe('BLK-');
  });

  it('bo`lak yorlig`i tanildi', () => {
    expect(isPieceLabel('BLK-000041')).toBe(true);
    expect(isPieceLabel('  blk-000041  ')).toBe(true);
    expect(isPieceLabel('BLK-1234567')).toBe(true);
  });

  it('TOVAR shtrixi bo`lak yorlig`i deb TANILMAYDI (aks holda multi-hit ochilardi)', () => {
    expect(isPieceLabel('4780001234567')).toBe(false);
    expect(isPieceLabel('K-15')).toBe(false);
    expect(isPieceLabel('02-03-01-04')).toBe(false); // yacheyka kodi
    expect(isPieceLabel('BLK-')).toBe(false);
    expect(isPieceLabel('BLK-12345')).toBe(false); // 6 raqamdan kam
    expect(isPieceLabel('BLK-00004A')).toBe(false);
  });

  it('ketma-ket raqamdan yorliq quriladi', () => {
    expect(formatPieceLabel(41)).toBe('BLK-000041');
    expect(formatPieceLabel(1)).toBe('BLK-000001');
    expect(formatPieceLabel(1234567)).toBe('BLK-1234567');
    expect(isPieceLabel(formatPieceLabel(7))).toBe(true);
    expect(() => formatPieceLabel(0)).toThrow();
    expect(() => formatPieceLabel(1.5)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// 2. Guard
// ---------------------------------------------------------------------------

const piece = (over: Partial<Parameters<typeof validatePiece>[0]> = {}) =>
  validatePiece({ length: '180', whole: false, label: 'BLK-000041', status: 'active', ...over });

describe('guard — modelning qat`iy qoidalari', () => {
  it('to`g`ri bo`lak — buzilish yo`q', () => {
    expect(piece()).toEqual([]);
  });

  it('to`g`ri BUTUN rulon (yorliqsiz) — buzilish yo`q', () => {
    expect(piece({ whole: true, label: null })).toEqual([]);
  });

  it('K-Q3 — butun rulonda yorliq BO`LMAYDI', () => {
    expect(piece({ whole: true, label: 'BLK-000041' })).toContain('whole-with-label');
  });

  it('bo`lak yorliqsiz bo`lmaydi (skanerlab topib bo`lmaydi)', () => {
    expect(piece({ label: null })).toContain('piece-without-label');
    expect(piece({ label: '   ' })).toContain('piece-without-label');
  });

  it('yorliq `BLK-` makonidan tashqarida bo`lmaydi', () => {
    expect(piece({ label: '4780001234567' })).toContain('label-outside-piece-space');
  });

  it('manfiy uzunlik rad etiladi', () => {
    expect(piece({ length: '-1' })).toContain('length-negative');
  });

  it('FAOL bo`lakning uzunligi nol bo`lmaydi, `consumed` da esa RUXSAT', () => {
    expect(piece({ length: '0' })).toContain('active-length-not-positive');
    expect(piece({ length: '0', status: 'consumed' })).toEqual([]);
  });

  it('notanish holat rad etiladi (sverkadan jimgina tushib qolardi)', () => {
    expect(piece({ status: 'archived' })).toContain('unknown-status');
  });

  it('bir nechta buzilish birga qaytadi', () => {
    expect(piece({ whole: true, label: '123', length: '-5', status: 'x' }).sort()).toEqual(
      ['label-outside-piece-space', 'length-negative', 'unknown-status', 'whole-with-label'].sort(),
    );
  });

  it('chiqindi chegarasi — 1 m (K-Q6)', () => {
    expect(MIN_USEFUL_LENGTH).toBe('1');
    expect(isScrapLength('0.9')).toBe(true);
    expect(isScrapLength('1')).toBe(false);
    expect(isScrapLength('1.000001')).toBe(false);
    expect(isScrapLength('0')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. Sverka
// ---------------------------------------------------------------------------

const CABLE = {
  id: 'cable',
  name: 'UzKabel VVG 2x2.5',
  code: 'VVG-25',
  uom: 'm',
  pieceTracked: true,
};
const STORES = [{ id: 's1', name: 'Ombor 02' }];
const CELLS = [
  { id: 'c1', name: '02-03-01-04' },
  { id: 'c2', name: '02-03-01-05' },
];

function input(over: Partial<ReconInput> = {}): ReconInput {
  return {
    products: [CABLE],
    stores: STORES,
    cells: CELLS,
    pieces: [],
    cellStock: [],
    storeStock: [],
    ...over,
  };
}

const whole = (len: string, cellId: string | null = 'c1') => ({
  storeId: 's1',
  cellId,
  assortmentKind: 'product',
  assortmentId: 'cable',
  length: len,
  whole: true,
  label: null,
  status: 'active',
});

const cut = (len: string, label: string, cellId: string | null = 'c1') => ({
  storeId: 's1',
  cellId,
  assortmentKind: 'product',
  assortmentId: 'cable',
  length: len,
  whole: false,
  label,
  status: 'active',
});

describe('sverka — asosiy holat', () => {
  it('bayroq hech qayerda yoqilmagan ⇒ hisobot BO`SH (K1 dagi kutilgan natija)', () => {
    const out = buildPieceReconciliation(
      input({
        products: [{ ...CABLE, pieceTracked: false }],
        storeStock: [
          { storeId: 's1', assortmentKind: 'product', assortmentId: 'cable', qty: '1220' },
        ],
      }),
    );
    expect(out.rows).toEqual([]);
    expect(out.totals.trackedProducts).toBe(0);
    expect(out.totals.diffBuckets).toBe(0);
    expect(out.warnings).toEqual([]);
  });

  it('egasining misoli — 250·3 + 200 + 150 + 70 + 50 = 1220 ⇒ FARQ YO`Q', () => {
    const out = buildPieceReconciliation(
      input({
        pieces: [
          whole('250'),
          whole('250'),
          whole('250'),
          cut('200', 'BLK-000038'),
          cut('150', 'BLK-000039'),
          cut('70', 'BLK-000040'),
          cut('50', 'BLK-000041'),
        ],
        cellStock: [
          {
            storeId: 's1',
            cellId: 'c1',
            assortmentKind: 'product',
            assortmentId: 'cable',
            qty: '1220',
          },
        ],
        storeStock: [
          { storeId: 's1', assortmentKind: 'product', assortmentId: 'cable', qty: '1220' },
        ],
      }),
    );
    expect(out.totals.diffBuckets).toBe(0);
    expect(out.totals.registryQty).toBe('1220');
    expect(out.totals.stockQty).toBe('1220');
    expect(out.totals.diffQty).toBe('0');
    expect(out.totals.activePieces).toBe(7);
    const row = out.rows.find((r) => r.cellId === 'c1');
    expect(row?.status).toBe('ok');
    expect(row?.pieceCount).toBe(7);
    expect(row?.wholeCount).toBe(3);
    expect(row?.cellName).toBe('02-03-01-04');
    expect(row?.productName).toBe('UzKabel VVG 2x2.5');
  });

  it('reyestrda kam ⇒ `missing`, ko`p ⇒ `excess`', () => {
    const out = buildPieceReconciliation(
      input({
        pieces: [whole('250'), cut('70', 'BLK-000040', 'c2')],
        cellStock: [
          {
            storeId: 's1',
            cellId: 'c1',
            assortmentKind: 'product',
            assortmentId: 'cable',
            qty: '300',
          },
          {
            storeId: 's1',
            cellId: 'c2',
            assortmentKind: 'product',
            assortmentId: 'cable',
            qty: '50',
          },
        ],
        storeStock: [
          { storeId: 's1', assortmentKind: 'product', assortmentId: 'cable', qty: '350' },
        ],
      }),
    );
    const c1 = out.rows.find((r) => r.cellId === 'c1');
    const c2 = out.rows.find((r) => r.cellId === 'c2');
    expect(c1?.status).toBe('missing');
    expect(c1?.diffQty).toBe('-50');
    expect(c2?.status).toBe('excess');
    expect(c2?.diffQty).toBe('20');
    expect(out.totals.diffBuckets).toBe(2);
    expect(out.totals.diffQty).toBe('-30');
  });

  it('`consumed` bo`laklar SANALMAYDI (mijozga ketgan / hisobdan chiqarilgan)', () => {
    const out = buildPieceReconciliation(
      input({
        pieces: [whole('250'), { ...cut('180', 'BLK-000042'), status: 'consumed' }],
        cellStock: [
          {
            storeId: 's1',
            cellId: 'c1',
            assortmentKind: 'product',
            assortmentId: 'cable',
            qty: '250',
          },
        ],
        storeStock: [
          { storeId: 's1', assortmentKind: 'product', assortmentId: 'cable', qty: '250' },
        ],
      }),
    );
    expect(out.totals.diffBuckets).toBe(0);
    expect(out.totals.activePieces).toBe(1);
  });
});

describe('sverka — IKKI QATLAM (E1: qoldiqning ~94 % i yacheykasiz)', () => {
  it('yacheykasiz qoldiq = ombor jamisi − yacheykalardagi, va u ham sverkaga kiradi', () => {
    const out = buildPieceReconciliation(
      input({
        pieces: [whole('250'), whole('400', null)],
        cellStock: [
          {
            storeId: 's1',
            cellId: 'c1',
            assortmentKind: 'product',
            assortmentId: 'cable',
            qty: '250',
          },
        ],
        storeStock: [
          { storeId: 's1', assortmentKind: 'product', assortmentId: 'cable', qty: '650' },
        ],
      }),
    );
    const uncelled = out.rows.find((r) => r.cellId === null);
    expect(uncelled?.stockQty).toBe('400');
    expect(uncelled?.registryQty).toBe('400');
    expect(uncelled?.status).toBe('ok');
    expect(uncelled?.cellName).toBeNull();
    expect(out.totals.diffBuckets).toBe(0);
  });

  it('🔴 yacheykasiz qoldiq reyestrda YO`Q bo`lsa farq KO`RINADI (jim qolmaydi)', () => {
    const out = buildPieceReconciliation(
      input({
        pieces: [whole('250')],
        cellStock: [
          {
            storeId: 's1',
            cellId: 'c1',
            assortmentKind: 'product',
            assortmentId: 'cable',
            qty: '250',
          },
        ],
        storeStock: [
          { storeId: 's1', assortmentKind: 'product', assortmentId: 'cable', qty: '650' },
        ],
      }),
    );
    const uncelled = out.rows.find((r) => r.cellId === null);
    expect(uncelled?.status).toBe('missing');
    expect(uncelled?.diffQty).toBe('-400');
    expect(out.totals.diffBuckets).toBe(1);
  });

  it('yacheykali + yacheykasiz yig`indisi ombor jamisiga TENG (qatlamlar to`liq)', () => {
    const out = buildPieceReconciliation(
      input({
        cellStock: [
          {
            storeId: 's1',
            cellId: 'c1',
            assortmentKind: 'product',
            assortmentId: 'cable',
            qty: '250',
          },
          {
            storeId: 's1',
            cellId: 'c2',
            assortmentKind: 'product',
            assortmentId: 'cable',
            qty: '120.5',
          },
        ],
        storeStock: [
          { storeId: 's1', assortmentKind: 'product', assortmentId: 'cable', qty: '1220' },
        ],
      }),
    );
    expect(out.totals.stockQty).toBe('1220');
  });

  it('kasr uzunliklar aynan qo`shiladi (float yo`q)', () => {
    const out = buildPieceReconciliation(
      input({
        pieces: [cut('0.1', 'BLK-000001'), cut('0.2', 'BLK-000002')],
        cellStock: [
          {
            storeId: 's1',
            cellId: 'c1',
            assortmentKind: 'product',
            assortmentId: 'cable',
            qty: '0.3',
          },
        ],
        storeStock: [
          { storeId: 's1', assortmentKind: 'product', assortmentId: 'cable', qty: '0.3' },
        ],
      }),
    );
    expect(out.rows[0]?.registryQty).toBe('0.3');
    expect(out.rows[0]?.status).toBe('ok');
  });
});

describe('sverka — ogohlantirishlar (IS-5: jim qolgan nosozlik bo`lmasin)', () => {
  it('bayroq O`CHIQ, reyestrda esa bo`lak bor ⇒ `pieces-without-flag`', () => {
    const out = buildPieceReconciliation(
      input({
        products: [{ ...CABLE, pieceTracked: false }],
        pieces: [whole('250'), whole('250')],
      }),
    );
    const w = out.warnings.find((x) => x.code === 'pieces-without-flag');
    expect(w?.count).toBe(2);
    expect(w?.productName).toBe('UzKabel VVG 2x2.5');
    // Qatorlarga TUSHMAYDI — sverka mezoni bayroq (reja: «faqat pieceTracked»).
    expect(out.rows).toEqual([]);
  });

  it('model qoidasini buzgan qator ⇒ `invalid-piece`, lekin hisobot ISHLAYVERADI', () => {
    const out = buildPieceReconciliation(
      input({
        pieces: [{ ...whole('250'), label: 'BLK-000099' }],
        cellStock: [
          {
            storeId: 's1',
            cellId: 'c1',
            assortmentKind: 'product',
            assortmentId: 'cable',
            qty: '250',
          },
        ],
        storeStock: [
          { storeId: 's1', assortmentKind: 'product', assortmentId: 'cable', qty: '250' },
        ],
      }),
    );
    const w = out.warnings.find((x) => x.code === 'invalid-piece');
    expect(w?.violations).toEqual(['whole-with-label']);
    // Buzilgan qator baribir SANALADI — kassa ham, sverka ham to'xtamaydi.
    expect(out.totals.diffBuckets).toBe(0);
    expect(out.rows[0]?.status).toBe('ok');
  });

  it('toza ma`lumotda ogohlantirish BO`SH', () => {
    const out = buildPieceReconciliation(
      input({
        pieces: [whole('250'), cut('70', 'BLK-000040')],
        cellStock: [
          {
            storeId: 's1',
            cellId: 'c1',
            assortmentKind: 'product',
            assortmentId: 'cable',
            qty: '320',
          },
        ],
        storeStock: [
          { storeId: 's1', assortmentKind: 'product', assortmentId: 'cable', qty: '320' },
        ],
      }),
    );
    expect(out.warnings).toEqual([]);
  });
});

describe('sverka — chiqish shakli', () => {
  it('farqlar birinchi turadi (kattaligi bo`yicha)', () => {
    const out = buildPieceReconciliation(
      input({
        pieces: [whole('250')],
        cellStock: [
          {
            storeId: 's1',
            cellId: 'c1',
            assortmentKind: 'product',
            assortmentId: 'cable',
            qty: '250',
          },
          {
            storeId: 's1',
            cellId: 'c2',
            assortmentKind: 'product',
            assortmentId: 'cable',
            qty: '900',
          },
        ],
        storeStock: [
          { storeId: 's1', assortmentKind: 'product', assortmentId: 'cable', qty: '1150' },
        ],
      }),
    );
    expect(out.rows[0]?.cellId).toBe('c2');
    expect(out.rows[0]?.status).toBe('missing');
  });

  it('`onlyDiff` faqat farqlarni qoldiradi, jamilar esa TO`LIQ qoladi', () => {
    const out = buildPieceReconciliation(
      input({
        onlyDiff: true,
        pieces: [whole('250')],
        cellStock: [
          {
            storeId: 's1',
            cellId: 'c1',
            assortmentKind: 'product',
            assortmentId: 'cable',
            qty: '250',
          },
          {
            storeId: 's1',
            cellId: 'c2',
            assortmentKind: 'product',
            assortmentId: 'cable',
            qty: '900',
          },
        ],
        storeStock: [
          { storeId: 's1', assortmentKind: 'product', assortmentId: 'cable', qty: '1150' },
        ],
      }),
    );
    expect(out.rows).toHaveLength(1);
    expect(out.totals.buckets).toBe(2);
  });

  it('chegara JIM kesmaydi — kesilgani `truncated` da ko`rinadi', () => {
    const out = buildPieceReconciliation(
      input({
        limit: 1,
        cellStock: [
          {
            storeId: 's1',
            cellId: 'c1',
            assortmentKind: 'product',
            assortmentId: 'cable',
            qty: '250',
          },
          {
            storeId: 's1',
            cellId: 'c2',
            assortmentKind: 'product',
            assortmentId: 'cable',
            qty: '900',
          },
        ],
        storeStock: [
          { storeId: 's1', assortmentKind: 'product', assortmentId: 'cable', qty: '1150' },
        ],
      }),
    );
    expect(out.rows).toHaveLength(1);
    expect(out.truncated).toBe(1);
  });

  it('ikkala tomoni ham nol bo`g`in shovqin qilmaydi', () => {
    const out = buildPieceReconciliation(
      input({
        cellStock: [
          {
            storeId: 's1',
            cellId: 'c1',
            assortmentKind: 'product',
            assortmentId: 'cable',
            qty: '0',
          },
        ],
        storeStock: [{ storeId: 's1', assortmentKind: 'product', assortmentId: 'cable', qty: '0' }],
      }),
    );
    expect(out.rows).toEqual([]);
    expect(out.totals.buckets).toBe(0);
  });

  it('nomi topilmagan ombor/yacheyka id bilan ko`rsatiladi (jim bo`sh emas)', () => {
    const out = buildPieceReconciliation(
      input({
        stores: [],
        cells: [],
        cellStock: [
          {
            storeId: 's1',
            cellId: 'c1',
            assortmentKind: 'product',
            assortmentId: 'cable',
            qty: '10',
          },
        ],
        storeStock: [
          { storeId: 's1', assortmentKind: 'product', assortmentId: 'cable', qty: '10' },
        ],
      }),
    );
    expect(out.rows[0]?.storeName).toBe('s1');
    expect(out.rows[0]?.cellName).toBe('c1');
  });
});
