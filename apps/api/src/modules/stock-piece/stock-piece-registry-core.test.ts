import { describe, expect, it } from 'vitest';
import { buildPieceReconciliation } from './stock-piece-core.js';
import {
  MAX_CREATE_COUNT,
  buildRegistryView,
  issuePieceLabels,
  nextPieceSeq,
  parseLengthInput,
  parsePieceLabelSeq,
  planPieceCreation,
} from './stock-piece-registry-core.js';

/**
 * K2 yadrosining testlari.
 *
 * Eng muhim uch da'vo:
 *   1. omborchi kiritgan «250,5» bazaga TO'G'RI tushadi (vergul jim yiqilmaydi);
 *   2. yorliq raqami ketma-ket va `BLK-` makonida (7.3);
 *   3. **ekrandagi sverka va K1 hisobotidagi sverka BIR XIL SON beradi** —
 *      aks holda omborchi qaysi biriga ishonishini bilmasdi.
 */

// ---------------------------------------------------------------------------
// 1. Uzunlik kiritish
// ---------------------------------------------------------------------------

describe('parseLengthInput', () => {
  it('oddiy son', () => {
    expect(parseLengthInput('250')).toEqual({ value: '250' });
  });

  it('🔴 VERGUL nuqtaga o`giriladi (uz/ru klaviaturasi)', () => {
    expect(parseLengthInput('250,5')).toEqual({ value: '250.5' });
  });

  it('bo`shliqlar tashlanadi', () => {
    expect(parseLengthInput(' 1 250,25 ')).toEqual({ value: '1250.25' });
  });

  it('ortiqcha nollar normallashadi', () => {
    expect(parseLengthInput('0250,500000')).toEqual({ value: '250.5' });
    expect(parseLengthInput('0,000000')).toEqual({ value: '0' });
  });

  it('olti xonagacha kasr ruxsat, ettinchisi RAD', () => {
    expect(parseLengthInput('1.123456')).toEqual({ value: '1.123456' });
    expect(parseLengthInput('1.1234567')).toEqual({ error: 'too-many-decimals' });
  });

  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['-5', 'negative'],
    ['abc', 'not-a-number'],
    ['12,5,5', 'not-a-number'],
    ['1e5', 'not-a-number'],
  ])('«%s» → %s', (raw, error) => {
    expect(parseLengthInput(raw)).toEqual({ error });
  });

  it('Decimal(20,6) butun qismidan oshsa RAD', () => {
    expect(parseLengthInput('1'.repeat(14))).toEqual({ value: '1'.repeat(14) });
    expect(parseLengthInput('1'.repeat(15))).toEqual({ error: 'too-large' });
  });
});

// ---------------------------------------------------------------------------
// 2. Yorliq ketma-ketligi
// ---------------------------------------------------------------------------

describe('yorliq raqami', () => {
  it('yorliqdan raqam', () => {
    expect(parsePieceLabelSeq('BLK-000041')).toBe(41);
    expect(parsePieceLabelSeq('  blk-000041 ')).toBe(41);
    expect(parsePieceLabelSeq('BLK-1234567')).toBe(1234567);
  });

  it.each(['BLK-41', 'BLK-', '4600001234567', 'ABC-000041', 'BLK-000000'])(
    '«%s» yorliq raqami EMAS',
    (v) => {
      expect(parsePieceLabelSeq(v)).toBeNull();
    },
  );

  it('bo`sh reyestrda birinchi raqam 1', () => {
    expect(nextPieceSeq(null)).toBe(1);
    expect(nextPieceSeq(undefined)).toBe(1);
  });

  it('oxirgi yorliqdan keyingisi', () => {
    expect(nextPieceSeq('BLK-000041')).toBe(42);
  });

  it('buzilgan yorliq ketma-ketlikni to`xtatmaydi (1 dan boshlanadi, unikal indeks to`sadi)', () => {
    expect(nextPieceSeq('QQQ')).toBe(1);
  });

  it('ketma-ket yorliqlar', () => {
    expect(issuePieceLabels(41, 3)).toEqual(['BLK-000041', 'BLK-000042', 'BLK-000043']);
  });

  it('olti xonadan oshsa format buzilmaydi', () => {
    expect(issuePieceLabels(1000000, 1)).toEqual(['BLK-1000000']);
  });

  it('nolinchi son RAD', () => {
    expect(() => issuePieceLabels(1, 0)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// 3. Kiritish rejasi
// ---------------------------------------------------------------------------

describe('planPieceCreation', () => {
  it('🔴 butun rulon «250 × 3» — 3 ta YORLIQSIZ qator (K-Q3)', () => {
    const plan = planPieceCreation({ length: '250', whole: true, count: 3, startSeq: 7 });
    expect(plan.error).toBeUndefined();
    expect(plan.drafts).toHaveLength(3);
    expect(plan.drafts?.every((d) => d.whole && d.label === null)).toBe(true);
    expect(plan.drafts?.every((d) => d.length === '250' && d.status === 'active')).toBe(true);
  });

  it('bo`lak — har biriga ketma-ket yorliq', () => {
    const plan = planPieceCreation({ length: '70', whole: false, count: 2, startSeq: 7 });
    expect(plan.drafts?.map((d) => d.label)).toEqual(['BLK-000007', 'BLK-000008']);
    expect(plan.drafts?.every((d) => d.whole === false)).toBe(true);
  });

  it('🔴 1 m dan kalta — CHIQINDI, reyestrga kiritilmaydi (K-Q6)', () => {
    expect(planPieceCreation({ length: '0.4', whole: false, count: 1, startSeq: 1 }).error).toBe(
      'scrap-length',
    );
    // Chegaraning O'ZI (1 m) — hali foydali.
    expect(
      planPieceCreation({ length: '1', whole: false, count: 1, startSeq: 1 }).error,
    ).toBeUndefined();
  });

  it('nol uzunlik RAD', () => {
    expect(planPieceCreation({ length: '0', whole: true, count: 1, startSeq: 1 }).error).toBe(
      'length-not-positive',
    );
  });

  it.each([0, -1, MAX_CREATE_COUNT + 1, 1.5])('qator soni %s — RAD', (count) => {
    expect(planPieceCreation({ length: '250', whole: true, count, startSeq: 1 }).error).toBe(
      'count-out-of-range',
    );
  });

  it('chegaraning o`zi (MAX_CREATE_COUNT) ruxsat', () => {
    const plan = planPieceCreation({
      length: '250',
      whole: true,
      count: MAX_CREATE_COUNT,
      startSeq: 1,
    });
    expect(plan.drafts).toHaveLength(MAX_CREATE_COUNT);
  });
});

// ---------------------------------------------------------------------------
// 4. Ekran ko'rinishi
// ---------------------------------------------------------------------------

const piece = (
  over: Partial<Parameters<typeof buildRegistryView>[0]['pieces'][number]> = {},
): Parameters<typeof buildRegistryView>[0]['pieces'][number] => ({
  id: 'p1',
  cellId: null,
  length: '250',
  whole: true,
  label: null,
  status: 'active',
  sourcePieceId: null,
  updatedAt: '2026-08-25T00:00:00.000Z',
  ...over,
});

describe('buildRegistryView', () => {
  it('🔴 butun rulonlar GURUHLANADI, bo`laklar alohida qator (3-bo`lim)', () => {
    const view = buildRegistryView({
      pieces: [
        piece({ id: 'w1' }),
        piece({ id: 'w2' }),
        piece({ id: 'w3' }),
        piece({ id: 'b1', whole: false, label: 'BLK-000001', length: '200' }),
        piece({ id: 'b2', whole: false, label: 'BLK-000002', length: '70' }),
      ],
      cellStock: [],
      storeQty: '1020',
      cells: [],
    });

    const uncelled = view.cells.find((c) => c.cellId === null);
    expect(uncelled?.wholeGroups).toEqual([
      { length: '250', count: 3, pieceIds: ['w1', 'w2', 'w3'] },
    ]);
    expect(uncelled?.pieces.map((p) => p.label)).toEqual(['BLK-000001', 'BLK-000002']);
    expect(view.totals.registryQty).toBe('1020');
    expect(view.totals.diffQty).toBe('0');
    expect(view.totals.status).toBe('ok');
    expect(view.totals.wholeCount).toBe(3);
    expect(view.totals.activePieces).toBe(5);
    expect(view.totals.longest).toBe('250');
  });

  it('har xil uzunlikdagi butun rulonlar — alohida guruh, uzundan kaltaga', () => {
    const view = buildRegistryView({
      pieces: [piece({ id: 'a', length: '100' }), piece({ id: 'b', length: '250' })],
      cellStock: [],
      storeQty: '350',
      cells: [],
    });
    expect(view.cells[0]?.wholeGroups.map((g) => g.length)).toEqual(['250', '100']);
  });

  it('🔴 yacheykasiz bo`g`in = ombor jamisi − yacheykalar yig`indisi (E1 qatlami)', () => {
    const view = buildRegistryView({
      pieces: [
        piece({ id: 'c1', cellId: 'cell-1', length: '500' }),
        piece({ id: 'u1', length: '720' }),
      ],
      cellStock: [{ cellId: 'cell-1', qty: '500' }],
      storeQty: '1220',
      cells: [{ id: 'cell-1', name: '07-01-01-01' }],
    });

    const uncelled = view.cells.find((c) => c.cellId === null);
    expect(uncelled?.stockQty).toBe('720');
    expect(uncelled?.registryQty).toBe('720');
    expect(uncelled?.status).toBe('ok');

    const celled = view.cells.find((c) => c.cellId === 'cell-1');
    expect(celled?.cellName).toBe('07-01-01-01');
    expect(celled?.stockQty).toBe('500');
    expect(celled?.status).toBe('ok');
    expect(view.totals.status).toBe('ok');
  });

  it('reyestr kam bo`lsa `missing`, ortiq bo`lsa `excess`', () => {
    const low = buildRegistryView({ pieces: [], cellStock: [], storeQty: '100', cells: [] });
    expect(low.cells[0]?.status).toBe('missing');
    expect(low.cells[0]?.diffQty).toBe('-100');
    expect(low.totals.status).toBe('missing');

    const high = buildRegistryView({
      pieces: [piece({ length: '150' })],
      cellStock: [],
      storeQty: '100',
      cells: [],
    });
    expect(high.cells[0]?.status).toBe('excess');
    expect(high.cells[0]?.diffQty).toBe('50');
  });

  it('🔴 «tugadi» (consumed) qatorlar SANALMAYDI', () => {
    const view = buildRegistryView({
      pieces: [
        piece({ id: 'a', length: '250' }),
        piece({ id: 'b', length: '250', status: 'consumed' }),
      ],
      cellStock: [],
      storeQty: '250',
      cells: [],
    });
    expect(view.totals.registryQty).toBe('250');
    expect(view.totals.activePieces).toBe(1);
    expect(view.totals.status).toBe('ok');
  });

  it('qoldig`i bor, reyestri bo`sh yacheyka HAM ko`rinadi (to`ldirilishi kerak)', () => {
    const view = buildRegistryView({
      pieces: [],
      cellStock: [{ cellId: 'cell-1', qty: '300' }],
      storeQty: '300',
      cells: [{ id: 'cell-1', name: '07-01-01-01' }],
    });
    const celled = view.cells.find((c) => c.cellId === 'cell-1');
    expect(celled?.stockQty).toBe('300');
    expect(celled?.registryQty).toBe('0');
    expect(celled?.status).toBe('missing');
    // Yacheykasiz bo'g'in nol — shovqin bo'lib chiqmaydi.
    expect(view.cells.find((c) => c.cellId === null)).toBeUndefined();
  });

  it('qoidani buzgan va chiqindi qatorlar sanaladi (ogohlantirish uchun)', () => {
    const view = buildRegistryView({
      pieces: [
        // Butun rulonda yorliq — K-Q3 buzilgan.
        piece({ id: 'x', whole: true, label: 'BLK-000009' }),
        // Yorliqsiz bo'lak.
        piece({ id: 'y', whole: false, label: null, length: '10' }),
        // Chiqindi (1 m dan kalta), lekin FAOL.
        piece({ id: 'z', whole: false, label: 'BLK-000010', length: '0.4' }),
      ],
      cellStock: [],
      storeQty: '260.4',
      cells: [],
    });
    expect(view.invalidPieces).toBe(2);
    expect(view.scrapPieces).toBe(1);
    expect(view.cells[0]?.pieces.find((p) => p.id === 'y')?.violations).toContain(
      'piece-without-label',
    );
  });

  it('kasr uzunliklar tiyin-aniq qo`shiladi', () => {
    const view = buildRegistryView({
      pieces: [piece({ id: 'a', length: '0.100001' }), piece({ id: 'b', length: '0.200002' })],
      cellStock: [],
      storeQty: '0.300003',
      cells: [],
    });
    expect(view.totals.registryQty).toBe('0.300003');
    expect(view.totals.diffQty).toBe('0');
  });
});

// ---------------------------------------------------------------------------
// 5. Ekran va K1 hisoboti BIR XIL sonni beradi
// ---------------------------------------------------------------------------

describe('🔴 K2 ekrani va K1 sverka hisoboti bir xil sonni beradi', () => {
  const STORE = 'store-1';
  const PRODUCT = 'prod-1';
  const CELL = 'cell-1';

  const scenario = {
    cellStock: [
      {
        storeId: STORE,
        cellId: CELL,
        assortmentKind: 'product',
        assortmentId: PRODUCT,
        qty: '500',
      },
    ],
    storeStock: [{ storeId: STORE, assortmentKind: 'product', assortmentId: PRODUCT, qty: '1220' }],
    pieces: [
      { id: 'w1', cellId: CELL, length: '250', whole: true, label: null },
      { id: 'w2', cellId: CELL, length: '250', whole: true, label: null },
      { id: 'w3', cellId: null, length: '250', whole: true, label: null },
      { id: 'b1', cellId: null, length: '200', whole: false, label: 'BLK-000001' },
      { id: 'b2', cellId: null, length: '150', whole: false, label: 'BLK-000002' },
      { id: 'b3', cellId: null, length: '70', whole: false, label: 'BLK-000003' },
      { id: 'b4', cellId: null, length: '50', whole: false, label: 'BLK-000004' },
    ],
  };

  it('ikkala qatlamda ham «farq yo`q»', () => {
    const view = buildRegistryView({
      pieces: scenario.pieces.map((p) => ({
        ...p,
        status: 'active',
        sourcePieceId: null,
        updatedAt: '2026-08-25T00:00:00.000Z',
      })),
      cellStock: scenario.cellStock.map((c) => ({ cellId: c.cellId, qty: c.qty })),
      storeQty: '1220',
      cells: [{ id: CELL, name: '07-01-01-01' }],
    });

    const recon = buildPieceReconciliation({
      products: [
        { id: PRODUCT, name: 'UzKabel VVG 2x2.5', code: 'K-1', uom: 'м', pieceTracked: true },
      ],
      stores: [{ id: STORE, name: 'Ombor 07' }],
      cells: [{ id: CELL, name: '07-01-01-01' }],
      pieces: scenario.pieces.map((p) => ({
        storeId: STORE,
        cellId: p.cellId,
        assortmentKind: 'product',
        assortmentId: PRODUCT,
        length: p.length,
        whole: p.whole,
        label: p.label,
        status: 'active',
      })),
      cellStock: scenario.cellStock,
      storeStock: scenario.storeStock,
    });

    expect(view.totals.registryQty).toBe('1220');
    expect(view.totals.stockQty).toBe('1220');
    expect(view.totals.diffQty).toBe('0');
    expect(recon.totals.registryQty).toBe(view.totals.registryQty);
    expect(recon.totals.stockQty).toBe(view.totals.stockQty);
    expect(recon.totals.diffQty).toBe(view.totals.diffQty);
    expect(recon.totals.diffBuckets).toBe(0);

    // Bo'g'inma-bo'g'in ham mos: yacheykali 500/500, yacheykasiz 720/720.
    for (const row of recon.rows) {
      const group = view.cells.find((c) => c.cellId === row.cellId);
      expect(group, `bo'g'in ekranda yo'q: ${row.cellId ?? 'yacheykasiz'}`).toBeDefined();
      expect(group?.stockQty).toBe(row.stockQty);
      expect(group?.registryQty).toBe(row.registryQty);
      expect(group?.diffQty).toBe(row.diffQty);
    }
  });

  it('bitta bo`lak yopilsa IKKALASI ham AYNI farqni ko`rsatadi', () => {
    const active = scenario.pieces.filter((p) => p.id !== 'b1');

    const view = buildRegistryView({
      pieces: active.map((p) => ({
        ...p,
        status: 'active',
        sourcePieceId: null,
        updatedAt: '2026-08-25T00:00:00.000Z',
      })),
      cellStock: scenario.cellStock.map((c) => ({ cellId: c.cellId, qty: c.qty })),
      storeQty: '1220',
      cells: [{ id: CELL, name: '07-01-01-01' }],
    });

    const recon = buildPieceReconciliation({
      products: [{ id: PRODUCT, name: 'UzKabel', code: null, uom: 'м', pieceTracked: true }],
      stores: [{ id: STORE, name: 'Ombor 07' }],
      cells: [{ id: CELL, name: '07-01-01-01' }],
      pieces: active.map((p) => ({
        storeId: STORE,
        cellId: p.cellId,
        assortmentKind: 'product',
        assortmentId: PRODUCT,
        length: p.length,
        whole: p.whole,
        label: p.label,
        status: 'active',
      })),
      cellStock: scenario.cellStock,
      storeStock: scenario.storeStock,
    });

    expect(view.totals.diffQty).toBe('-200');
    expect(view.totals.status).toBe('missing');
    expect(recon.totals.diffQty).toBe(view.totals.diffQty);
  });
});
