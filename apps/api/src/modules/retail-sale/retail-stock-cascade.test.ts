import { describe, expect, it } from 'vitest';
import {
  allocateAcrossStores,
  orderCascadeStores,
  readPosPriority,
} from './retail-stock-cascade.js';

/**
 * F6 — kassa kaskad dvigateli (sof): prioritet o'qish, tartib, taqsimot.
 * Q1: 07 birinchi; qisman yetishmasa pozitsiya bir nechta omborga BO'LINADI;
 * kaskad tugagach qolgan qism `shortfalls` (G4 darvozasi uchun haqiqiy defitsit).
 */

const S07 = { id: 's07', name: 'Ombor 07', allowNegativeStock: false };
const S02 = { id: 's02', name: 'Ombor 02', allowNegativeStock: false };
const S01 = { id: 's01', name: 'Ombor 01', allowNegativeStock: false };

describe('readPosPriority — faqat musbat butun son ma’noli', () => {
  it('musbat butun son qaytadi', () => {
    expect(readPosPriority({ __posPriority: 1 })).toBe(1);
    expect(readPosPriority({ __posPriority: 42 })).toBe(42);
  });

  it('yo‘q/null/satr/kasr/0/manfiy/massiv — null (kaskadda emas)', () => {
    expect(readPosPriority(undefined)).toBeNull();
    expect(readPosPriority(null)).toBeNull();
    expect(readPosPriority({})).toBeNull();
    expect(readPosPriority({ __posPriority: null })).toBeNull();
    expect(readPosPriority({ __posPriority: '1' })).toBeNull();
    expect(readPosPriority({ __posPriority: 1.5 })).toBeNull();
    expect(readPosPriority({ __posPriority: 0 })).toBeNull();
    expect(readPosPriority({ __posPriority: -3 })).toBeNull();
    expect(readPosPriority([1])).toBeNull();
  });
});

describe('orderCascadeStores — prioritet tartibi', () => {
  it('kichik raqam birinchi; prioritetsizlar kaskadga KIRMAYDI', () => {
    const out = orderCascadeStores([
      { ...S02, attributes: { __posPriority: 2 } },
      { ...S01, attributes: {} },
      { ...S07, attributes: { __posPriority: 1 } },
    ]);
    expect(out.map((s) => s.id)).toEqual(['s07', 's02']);
    expect(out[0]?.posPriority).toBe(1);
  });

  it('hech kimda prioritet yo‘q — bo‘sh (kaskad sozlanmagan)', () => {
    expect(orderCascadeStores([{ ...S01, attributes: {} }])).toEqual([]);
  });

  it('teng prioritet — nom bo‘yicha barqaror tartib', () => {
    const out = orderCascadeStores([
      { ...S02, attributes: { __posPriority: 1 } },
      { ...S01, attributes: { __posPriority: 1 } },
    ]);
    expect(out.map((s) => s.id)).toEqual(['s01', 's02']);
  });
});

function avail(entries: Array<[string, Array<[string, string]>]>) {
  return new Map(entries.map(([sid, rows]) => [sid, new Map(rows)]));
}

describe('allocateAcrossStores — taqsimot', () => {
  it('birinchi omborda yetarli — faqat undan', () => {
    const plan = allocateAcrossStores(
      [{ assortmentId: 'A', requested: '5' }],
      avail([
        ['s07', [['A', '10']]],
        ['s02', [['A', '100']]],
      ]),
      ['s07', 's02'],
    );
    expect(plan.allocations).toEqual([{ storeId: 's07', assortmentId: 'A', qty: '5' }]);
    expect(plan.shortfalls).toEqual([]);
  });

  it('qisman yetishmasa pozitsiya ikki omborga BO‘LINADI (07 → keyingisi)', () => {
    const plan = allocateAcrossStores(
      [{ assortmentId: 'A', requested: '5' }],
      avail([
        ['s07', [['A', '2']]],
        ['s02', [['A', '100']]],
      ]),
      ['s07', 's02'],
    );
    expect(plan.allocations).toEqual([
      { storeId: 's07', assortmentId: 'A', qty: '2' },
      { storeId: 's02', assortmentId: 'A', qty: '3' },
    ]);
    expect(plan.shortfalls).toEqual([]);
  });

  it('butun kaskadda ham yetmasa — shortfall (haqiqiy defitsit)', () => {
    const plan = allocateAcrossStores(
      [{ assortmentId: 'A', requested: '5' }],
      avail([
        ['s07', [['A', '1']]],
        ['s02', [['A', '1']]],
      ]),
      ['s07', 's02'],
    );
    expect(plan.allocations).toEqual([
      { storeId: 's07', assortmentId: 'A', qty: '1' },
      { storeId: 's02', assortmentId: 'A', qty: '1' },
    ]);
    expect(plan.shortfalls).toEqual([{ assortmentId: 'A', requested: '5', missing: '3' }]);
  });

  it('bir tovar IKKI qatorda — jamlab taqsimlanadi (60+60 > 100 tuzoq yopiq)', () => {
    const plan = allocateAcrossStores(
      [
        { assortmentId: 'A', requested: '60' },
        { assortmentId: 'A', requested: '60' },
      ],
      avail([['s07', [['A', '100']]]]),
      ['s07'],
    );
    expect(plan.allocations).toEqual([{ storeId: 's07', assortmentId: 'A', qty: '100' }]);
    expect(plan.shortfalls).toEqual([{ assortmentId: 'A', requested: '120', missing: '20' }]);
  });

  it('manfiy «доступно» ombordan 0 olinadi (manfiy qoldiqni sotmaydi)', () => {
    const plan = allocateAcrossStores(
      [{ assortmentId: 'A', requested: '3' }],
      avail([
        ['s07', [['A', '-4']]],
        ['s02', [['A', '3']]],
      ]),
      ['s07', 's02'],
    );
    expect(plan.allocations).toEqual([{ storeId: 's02', assortmentId: 'A', qty: '3' }]);
  });

  it('kasr miqdorlar aniq (micro-birlik, float suzmaydi)', () => {
    const plan = allocateAcrossStores(
      [{ assortmentId: 'A', requested: '0.3' }],
      avail([
        ['s07', [['A', '0.1']]],
        ['s02', [['A', '0.2']]],
      ]),
      ['s07', 's02'],
    );
    expect(plan.allocations).toEqual([
      { storeId: 's07', assortmentId: 'A', qty: '0.1' },
      { storeId: 's02', assortmentId: 'A', qty: '0.2' },
    ]);
    expect(plan.shortfalls).toEqual([]);
  });

  /**
   * M1 (2026-08-30) — JONLI KASKADNING AYNAN SHAKLI: kaskad boshida YETTITA
   * bo'sh ombor turadi, butun qoldiq esa ENG OXIRIDAGI hovuzda.
   *
   * M1.2 dan oldin hovuz kaskad BOSHI edi; egasi uni oxiriga ko'chirishni
   * so'radi. Reja 4-bo'limidagi besh o'lchov «xulq o'zgarmaydi» degan edi va
   * 2026-08-30 dagi jonli smoke buni tasdiqladi (ajratma «Taqsimlanmagan» dan
   * olindi). Shu qulf o'sha xulqni kodda ushlab turadi: bo'sh ombor kaskad
   * boshida tursa ham reja QOLDIQ BOR omborga tushadi va shortfall tug'ilmaydi.
   */
  it('M1 — kaskad boshidagi 7 ta BO‘SH ombor rejani o‘zgartirmaydi', () => {
    const bosqlar = ['s07', 's01', 's02', 's03', 's04', 's05', 's06'];
    const plan = allocateAcrossStores(
      [{ assortmentId: 'A', requested: '3' }],
      // Bo'sh omborlarda tovar qatori UMUMAN yo'q (jonlidagi holat).
      avail([['pool', [['A', '105113']]]]),
      [...bosqlar, 'pool'],
    );
    expect(plan.allocations).toEqual([{ storeId: 'pool', assortmentId: 'A', qty: '3' }]);
    expect(plan.shortfalls).toEqual([]);
  });

  it('ma’lumoti yo‘q ombor = 0 deb o‘qiladi; nol so‘rov rejaga kirmaydi', () => {
    const plan = allocateAcrossStores(
      [
        { assortmentId: 'A', requested: '2' },
        { assortmentId: 'B', requested: '0' },
      ],
      avail([['s02', [['A', '2']]]]),
      ['s07', 's02'],
    );
    expect(plan.allocations).toEqual([{ storeId: 's02', assortmentId: 'A', qty: '2' }]);
    expect(plan.shortfalls).toEqual([]);
  });
});
