import { describe, expect, it } from 'vitest';
import { type OfferPiece, buildPieceComposition, planPieceOffer } from './piece-offer-core.js';

/**
 * K3 — kassir ko'rinishi yadrosining qulf-testlari.
 *
 * Kanonik manba: K-reja 1, 3 va 4-bo'limlari (egasi, 2026-08-25). Egasining
 * misoli ayni shu yerda raqam bilan qulflanadi:
 *
 *   Jismonan omborda: 250 + 250 + 250 + 200 + 150 + 70 + 50
 *   Tizimda (bugungi holat): 1220 m — «kassir 4 ta rulon bor deydi»
 *   Kerak: `3 × 250 · 200 · 150 · 70 · 50`, eng uzun uzluksiz 250.
 */

const STORE = 'store-1';

function piece(id: string, length: string, over: Partial<OfferPiece> = {}): OfferPiece {
  return {
    id,
    storeId: STORE,
    cellId: null,
    cellName: null,
    length,
    whole: false,
    label: `BLK-${id.padStart(6, '0')}`,
    status: 'active',
    ...over,
  };
}

/** Egasining kabeli: 3 butun rulon + 4 bo'lak (K-reja 1-bo'lim). */
const CABLE: OfferPiece[] = [
  piece('1', '250', { whole: true, label: null }),
  piece('2', '250', { whole: true, label: null }),
  piece('3', '250', { whole: true, label: null }),
  piece('4', '200'),
  piece('5', '150'),
  piece('6', '70'),
  piece('7', '50'),
];

describe('tarkib — butun rulonlar guruhlanadi, bo`laklar individ', () => {
  it('egasining misoli: 3 x 250 + 200 · 150 · 70 · 50 = 1220', () => {
    const c = buildPieceComposition(CABLE);
    expect(c.wholeGroups).toEqual([{ length: '250', count: 3 }]);
    expect(c.pieces.map((p) => p.length)).toEqual(['200', '150', '70', '50']);
    expect(c.registryQty).toBe('1220');
    expect(c.activePieces).toBe(7);
    expect(c.wholeCount).toBe(3);
  });

  it('eng uzun UZLUKSIZ — butun rulon ham sanaladi', () => {
    expect(buildPieceComposition(CABLE).longest).toBe('250');
  });

  it('butun rulonlar UZUNLIGI bo`yicha guruhlanadi (250 va 100 alohida)', () => {
    const c = buildPieceComposition([
      piece('1', '250', { whole: true, label: null }),
      piece('2', '100', { whole: true, label: null }),
      piece('3', '250', { whole: true, label: null }),
    ]);
    expect(c.wholeGroups).toEqual([
      { length: '250', count: 2 },
      { length: '100', count: 1 },
    ]);
  });

  it('`consumed` bo`laklar SANALMAYDI — ular qoldiqda ham yo`q', () => {
    const c = buildPieceComposition([piece('1', '100'), piece('2', '80', { status: 'consumed' })]);
    expect(c.registryQty).toBe('100');
    expect(c.activePieces).toBe(1);
    expect(c.pieces).toHaveLength(1);
  });

  it('bo`sh reyestr — nol, `longest` = null (ekran jim turadi)', () => {
    const c = buildPieceComposition([]);
    expect(c.registryQty).toBe('0');
    expect(c.longest).toBeNull();
    expect(c.activePieces).toBe(0);
  });

  it('kasr uzunlik saqlanadi (Decimal(20,6), float YO`Q)', () => {
    const c = buildPieceComposition([piece('1', '12.5'), piece('2', '0.25')]);
    expect(c.registryQty).toBe('12.75');
    expect(c.longest).toBe('12.5');
  });

  it('bo`laklar va guruhlar KATTADAN kichikka', () => {
    const c = buildPieceComposition([piece('1', '50'), piece('2', '200'), piece('3', '70')]);
    expect(c.pieces.map((p) => p.length)).toEqual(['200', '70', '50']);
  });

  it('yacheyka nomi bo`lak qatorida ko`rinadi (omborchi manzilni bilsin)', () => {
    const c = buildPieceComposition([piece('1', '200', { cellId: 'c1', cellName: '02-01-03-04' })]);
    expect(c.pieces[0]?.cellName).toBe('02-01-03-04');
    expect(c.pieces[0]?.label).toBe('BLK-000001');
  });
});

describe('taklif — 1-holat: uzluksiz bo`lak BOR', () => {
  it('180 m so`raldi: 200 m lik bo`lak yolg`iz qoplaydi', () => {
    const o = planPieceOffer({ pieces: CABLE, requested: '180' });
    expect(o.verdict).toBe('single');
    expect(o.single?.length).toBe('200');
    expect(o.suggestion).toEqual([]);
    expect(o.longest).toBe('250');
  });

  it('yetadiganlar orasidan ENG KICHIGI tavsiya qilinadi (Q1-v2 falsafasi)', () => {
    const o = planPieceOffer({ pieces: CABLE, requested: '60' });
    // 70 · 150 · 200 · 250 hammasi yetadi — eng kichigi 70.
    expect(o.single?.length).toBe('70');
  });

  it('AYNAN yetadigan bo`lak ham qoplaydi (chegara: 200 = 200)', () => {
    const o = planPieceOffer({ pieces: CABLE, requested: '200' });
    expect(o.verdict).toBe('single');
    expect(o.single?.length).toBe('200');
  });

  it('teng uzunlikda KESILGAN bo`lak butun rulondan afzal (yangi qoldiq tug`ilmasin)', () => {
    const o = planPieceOffer({
      pieces: [piece('w', '250', { whole: true, label: null }), piece('p', '250')],
      requested: '100',
    });
    expect(o.single?.id).toBe('p');
    expect(o.single?.whole).toBe(false);
  });

  it('butun rulondan boshqa ilojisi bo`lmasa — o`sha tavsiya qilinadi', () => {
    const o = planPieceOffer({
      pieces: [piece('w', '250', { whole: true, label: null }), piece('p', '50')],
      requested: '100',
    });
    expect(o.single?.id).toBe('w');
    expect(o.single?.whole).toBe(true);
  });
});

describe('taklif — 2-holat: uzluksiz YO`Q, kassir mijoz bilan kelishadi', () => {
  it('180 m so`raldi, eng uzuni 150: taklif «150 + 30» (K-Q5)', () => {
    const pieces = [piece('1', '150'), piece('2', '70'), piece('3', '50')];
    const o = planPieceOffer({ pieces, requested: '180' });
    expect(o.verdict).toBe('needs-split');
    expect(o.suggestion).toEqual(['150', '30']);
    expect(o.longest).toBe('150');
    expect(o.missing).toBe('0');
  });

  it('taklif KATTADAN kichikka — mijoz iloji boricha kam bo`lak olsin', () => {
    const pieces = [piece('1', '100'), piece('2', '80'), piece('3', '60')];
    const o = planPieceOffer({ pieces, requested: '230' });
    expect(o.suggestion).toEqual(['100', '80', '50']);
  });

  it('kasr miqdorda ham to`g`ri bo`linadi', () => {
    const pieces = [piece('1', '12.5'), piece('2', '5')];
    const o = planPieceOffer({ pieces, requested: '15.25' });
    expect(o.verdict).toBe('needs-split');
    expect(o.suggestion).toEqual(['12.5', '2.75']);
  });

  it('jami AYNAN yetganda ham bo`linish taklifi (chegara)', () => {
    const pieces = [piece('1', '100'), piece('2', '80')];
    const o = planPieceOffer({ pieces, requested: '180' });
    expect(o.verdict).toBe('needs-split');
    expect(o.suggestion).toEqual(['100', '80']);
  });
});

describe('taklif — 3-holat: jami ham yetmaydi', () => {
  it('300 so`raldi, reyestrda 220: `not-enough` + yetmagani', () => {
    const pieces = [piece('1', '150'), piece('2', '70')];
    const o = planPieceOffer({ pieces, requested: '300' });
    expect(o.verdict).toBe('not-enough');
    expect(o.missing).toBe('80');
    expect(o.registryQty).toBe('220');
    expect(o.suggestion).toEqual([]);
  });
});

describe('🔴 reyestr bo`sh — SUKUT (kassa hech qachon to`xtamaydi)', () => {
  it('bo`lak yo`q: `no-registry`, ogohlantirish YO`Q', () => {
    const o = planPieceOffer({ pieces: [], requested: '180' });
    expect(o.verdict).toBe('no-registry');
    expect(o.single).toBeNull();
    expect(o.suggestion).toEqual([]);
    expect(o.missing).toBe('0');
  });

  it('faqat `consumed` qatorlar ham bo`sh reyestr bilan barobar', () => {
    const o = planPieceOffer({
      pieces: [piece('1', '250', { status: 'consumed' })],
      requested: '10',
    });
    expect(o.verdict).toBe('no-registry');
  });

  it('miqdor hali kiritilmagan (0): tarkib bor, hukm yo`q', () => {
    const o = planPieceOffer({ pieces: CABLE, requested: '0' });
    expect(o.verdict).toBe('no-registry');
    expect(o.longest).toBe('250');
    expect(o.registryQty).toBe('1220');
  });
});
