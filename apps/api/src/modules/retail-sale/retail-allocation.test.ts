import { describe, expect, it } from 'vitest';
import {
  type AllocCell,
  type AllocStore,
  type AllocStoreAvailable,
  type AllocationInput,
  allocateForSale,
  buildShortfallMessage,
  resolveAllocStores,
  spreadAllocationsToPositions,
} from './retail-allocation.js';

/**
 * G4 — ko'p omborli avto-taqsimot yadrosining qulf-testlari.
 *
 * Kanonik manba: G-reja 1-bo'limi, Q1-v2 jadvali (egasi, 2026-08-24).
 * Uch qoida shu yerda raqam bilan qulflanadi, ustiga E1 (yacheykasiz qoldiq)
 * va E4 (BRAK ombori) chegaralari.
 */

const S07 = 'store-07';
const S01 = 'store-01';
const S02 = 'store-02';
const P = 'p1';

function store(id: string, over: Partial<AllocStore> = {}): AllocStore {
  return {
    id,
    name: id,
    posPriority: 2,
    isPosFront: false,
    isBrak: false,
    ...over,
  };
}

const front = store(S07, { name: 'Ombor 07', posPriority: 1, isPosFront: true });
const w01 = store(S01, { name: 'Ombor 01', posPriority: 2 });
const w02 = store(S02, { name: 'Ombor 02', posPriority: 3 });

function cell(storeId: string, cellName: string, qty: string): AllocCell {
  return { storeId, cellId: `c-${cellName}`, cellName, qty };
}

function avail(...rows: Array<[string, string]>): AllocStoreAvailable[] {
  return rows.map(([storeId, available]) => ({ storeId, available }));
}

function input(over: Partial<AllocationInput> & { requested?: string } = {}): AllocationInput {
  return {
    requests: over.requests ?? [{ assortmentId: P, requested: over.requested ?? '100' }],
    stores: over.stores ?? [front, w01, w02],
    cellsByProduct: over.cellsByProduct ?? new Map(),
    availableByProduct: over.availableByProduct ?? new Map(),
    fallbackStoreId: over.fallbackStoreId ?? null,
  };
}

describe('1-holat — 07 yolg‘iz qoplasa, o‘shandan (yig‘ish kerak emas)', () => {
  it('07 dagi yacheyka butun miqdorni qoplaydi', () => {
    const r = allocateForSale(
      input({
        cellsByProduct: new Map([
          [P, [cell(S07, '07-01-01-01', '150'), cell(S01, '01-01-01-01', '900')]],
        ]),
        availableByProduct: new Map([[P, avail([S07, '150'], [S01, '900'])]]),
      }),
    );
    expect(r.allocations).toEqual([
      {
        assortmentId: P,
        storeId: S07,
        storeName: 'Ombor 07',
        cellId: 'c-07-01-01-01',
        cellName: '07-01-01-01',
        qty: '100',
      },
    ]);
    expect(r.rules[0]?.rule).toBe('front');
  });

  // 🔷 Egasi (2026-08-25): 07 da bitta tovar FAQAT BITTA yacheykada bo'ladi.
  // Quyidagi ikki test shu qoida BUZILGAN ma'lumot uchun — kassa to'xtamasligi
  // va buzilish KO'RINISHI kerak.
  it('07 da bir nechta qoplaydigan yacheyka bo‘lsa ENG KICHIGI', () => {
    const r = allocateForSale(
      input({
        cellsByProduct: new Map([
          [P, [cell(S07, 'katta', '900'), cell(S07, 'kichik', '120'), cell(S07, 'o‘rta', '400')]],
        ]),
        availableByProduct: new Map([[P, avail([S07, '1420'])]]),
      }),
    );
    expect(r.allocations[0]?.cellName).toBe('kichik');
  });

  it('🔷 invariant buzilsa OGOHLANTIRISH chiqadi, lekin kassa TO‘XTAMAYDI', () => {
    const r = allocateForSale(
      input({
        cellsByProduct: new Map([[P, [cell(S07, '07-a', '120'), cell(S07, '07-b', '90')]]]),
        availableByProduct: new Map([[P, avail([S07, '210'])]]),
      }),
    );
    expect(r.warnings).toEqual([
      { code: 'front-multi-cell', assortmentId: P, storeId: S07, cells: 2 },
    ]);
    // Sotuv baribir o'tadi (jimgina emas, lekin to'xtamaydi ham).
    expect(r.allocations).toHaveLength(1);
  });

  it('to‘g‘ri ma’lumotda ogohlantirish YO‘Q', () => {
    const r = allocateForSale(
      input({
        cellsByProduct: new Map([[P, [cell(S07, '07-a', '150'), cell(S01, '01-a', '900')]]]),
        availableByProduct: new Map([[P, avail([S07, '150'], [S01, '900'])]]),
      }),
    );
    expect(r.warnings).toEqual([]);
  });

  it('07 ning yacheykasi qoplamasa-yu yacheykasiz qoldig‘i qoplasa — o‘sha', () => {
    // E1: jonlida qoldiqning ~94 % i yacheykasiz.
    const r = allocateForSale(
      input({
        cellsByProduct: new Map([[P, [cell(S07, '07-01-01-01', '30')]]]),
        availableByProduct: new Map([[P, avail([S07, '500'])]]),
      }),
    );
    expect(r.allocations[0]?.cellId).toBeNull();
    expect(r.allocations[0]?.qty).toBe('100');
    expect(r.rules[0]?.rule).toBe('front');
  });

  it('teng miqdorda REAL yacheyka yacheykasizdan afzal', () => {
    const r = allocateForSale(
      input({
        cellsByProduct: new Map([[P, [cell(S07, '07-01-01-01', '100')]]]),
        // 200 jami ⇒ yacheykada 100, yacheykasiz ham 100
        availableByProduct: new Map([[P, avail([S07, '200'])]]),
      }),
    );
    expect(r.allocations[0]?.cellName).toBe('07-01-01-01');
  });
});

describe('2-holat — yolg‘iz qoplaydigan ENG KICHIK manba (bitta yurish)', () => {
  it('07 yetmasa, boshqa omborlardagi eng kichik qoplaydigan yacheyka', () => {
    const r = allocateForSale(
      input({
        cellsByProduct: new Map([
          [
            P,
            [
              cell(S07, '07-01-01-01', '40'), // qoplamaydi
              cell(S01, '01-01-01-01', '800'), // qoplaydi, katta
              cell(S02, '02-01-01-01', '110'), // qoplaydi, ENG KICHIK
            ],
          ],
        ]),
        availableByProduct: new Map([[P, avail([S07, '40'], [S01, '800'], [S02, '110'])]]),
      }),
    );
    expect(r.allocations).toHaveLength(1);
    expect(r.allocations[0]?.cellName).toBe('02-01-01-01');
    expect(r.allocations[0]?.qty).toBe('100');
    expect(r.rules[0]?.rule).toBe('single');
  });

  it('bitta yacheyka yetmasa-yu ombor yacheykasiz qoldig‘i yetsa — u ham nomzod', () => {
    const r = allocateForSale(
      input({
        cellsByProduct: new Map([[P, [cell(S01, '01-01-01-01', '30')]]]),
        availableByProduct: new Map([[P, avail([S07, '10'], [S01, '400'])]]),
      }),
    );
    expect(r.allocations).toHaveLength(1);
    expect(r.allocations[0]?.storeId).toBe(S01);
    expect(r.allocations[0]?.cellId).toBeNull();
    expect(r.rules[0]?.rule).toBe('single');
  });

  it('🔴 REAL yacheyka kattaroq bo‘lsa ham yacheykasizdan afzal', () => {
    // Yacheykada 400 (qoplaydi), yacheykasiz 150 (u ham qoplaydi va KICHIKROQ).
    // «Eng kichigi» qoidasining maqsadi — YACHEYKANI bo'shatish; yacheykasiz
    // qoldiqni «bo'shatish» javonda joy ochmaydi va omborchiga manzil bermaydi.
    const r = allocateForSale(
      input({
        stores: [w01],
        cellsByProduct: new Map([[P, [cell(S01, '01-a', '400')]]]),
        availableByProduct: new Map([[P, avail([S01, '550'])]]),
      }),
    );
    expect(r.allocations).toHaveLength(1);
    expect(r.allocations[0]?.cellName).toBe('01-a');
    expect(r.allocations[0]?.qty).toBe('100');
  });

  it('invariant buzilgan holatda ham kassa to‘xtamaydi — boshqa ombordan olinadi', () => {
    // 🔷 TO'G'RI ma'lumotda bu holat YUZ BERMAYDI (07 da bitta tovar bitta
    // yacheykada — egasi, 2026-08-25). Test buzilgan ma'lumot uchun: 07 da
    // 60+60=120 bor, lekin yolg'iz qoplaydigani yo'q ⇒ sotuv boshqa ombordan
    // o'tadi (to'xtamaydi), ustiga `front-multi-cell` ogohlantirishi chiqadi.
    const r = allocateForSale(
      input({
        cellsByProduct: new Map([
          [P, [cell(S07, '07-a', '60'), cell(S07, '07-b', '60'), cell(S01, '01-a', '130')]],
        ]),
        availableByProduct: new Map([[P, avail([S07, '120'], [S01, '130'])]]),
      }),
    );
    expect(r.allocations).toHaveLength(1);
    expect(r.allocations[0]?.storeId).toBe(S01);
    expect(r.warnings[0]?.code).toBe('front-multi-cell');
  });
});

describe('3-holat — bo‘linish: boshqa omborlar avval, 07 ENG OXIRIDA', () => {
  it('07 oxirgi bo‘lib kamayadi', () => {
    const r = allocateForSale(
      input({
        requested: '200',
        cellsByProduct: new Map([
          [P, [cell(S07, '07-a', '80'), cell(S01, '01-a', '70'), cell(S02, '02-a', '60')]],
        ]),
        availableByProduct: new Map([[P, avail([S07, '80'], [S01, '70'], [S02, '60'])]]),
      }),
    );
    expect(r.rules[0]?.rule).toBe('split');
    expect(r.allocations.map((a) => [a.storeId, a.qty])).toEqual([
      [S01, '70'], // prioritet 2
      [S02, '60'], // prioritet 3
      [S07, '70'], // 07 — OXIRIDA, faqat qolgani
    ]);
  });

  it('ombor ichida KATTADAN kichikka (yurish soni kamaysin)', () => {
    const r = allocateForSale(
      input({
        requested: '100',
        stores: [w01],
        cellsByProduct: new Map([
          [P, [cell(S01, 'kichik', '20'), cell(S01, 'katta', '70'), cell(S01, 'o‘rta', '30')]],
        ]),
        availableByProduct: new Map([[P, avail([S01, '120'])]]),
      }),
    );
    expect(r.allocations.map((a) => [a.cellName, a.qty])).toEqual([
      ['katta', '70'],
      ['o‘rta', '30'],
    ]);
  });

  it('yacheykasiz qoldiq ombor ichida OXIRGI chora', () => {
    // Hech bir manba YOLG'IZ qoplamaydi (60 va 50) ⇒ 3-holat.
    const r = allocateForSale(
      input({
        requested: '100',
        stores: [w01],
        cellsByProduct: new Map([[P, [cell(S01, '01-a', '60')]]]),
        availableByProduct: new Map([[P, avail([S01, '110'])]]),
      }),
    );
    expect(r.rules[0]?.rule).toBe('split');
    expect(r.allocations.map((a) => [a.cellName, a.qty])).toEqual([
      ['01-a', '60'],
      [null, '40'],
    ]);
  });

  it('hammasi yetmasa — shortfall', () => {
    const r = allocateForSale(
      input({
        requested: '500',
        cellsByProduct: new Map([[P, [cell(S01, '01-a', '60')]]]),
        availableByProduct: new Map([[P, avail([S01, '60'])]]),
      }),
    );
    // K3 (7.1) — `reason` maydoni qo'shildi: xabar matni shunga qarab
    // tanlanadi. Bo'linmaydigan tovarda u har doim `insufficient`.
    expect(r.shortfalls).toEqual([
      { assortmentId: P, requested: '500', missing: '440', reason: 'insufficient' },
    ]);
    expect(r.allocations).toHaveLength(1);
  });

  it('hech qayerda yo‘q — reja bo‘sh, butun miqdor yetishmaydi', () => {
    const r = allocateForSale(input({ requested: '10' }));
    expect(r.allocations).toHaveLength(0);
    expect(r.shortfalls[0]?.missing).toBe('10');
    expect(r.rules[0]?.rule).toBe('none');
  });
});

describe('E4 — BRAK ombori manba EMAS', () => {
  it('brak yacheykasi qoplasa ham olinmaydi', () => {
    const brak = store('store-brak', { name: 'BRAK', posPriority: 5, isBrak: true });
    const r = allocateForSale(
      input({
        stores: [front, w01, brak],
        cellsByProduct: new Map([
          [P, [cell('store-brak', 'brak-a', '900'), cell(S01, '01-a', '150')]],
        ]),
        availableByProduct: new Map([[P, avail(['store-brak', '900'], [S01, '150'])]]),
      }),
    );
    expect(r.allocations.every((a) => a.storeId !== 'store-brak')).toBe(true);
    expect(r.allocations[0]?.storeId).toBe(S01);
  });

  it('faqat brakda bor bo‘lsa — sotib bo‘lmaydi (shortfall)', () => {
    const brak = store('store-brak', { name: 'BRAK', posPriority: 5, isBrak: true });
    const r = allocateForSale(
      input({
        stores: [brak],
        cellsByProduct: new Map([[P, [cell('store-brak', 'brak-a', '900')]]]),
        availableByProduct: new Map([[P, avail(['store-brak', '900'])]]),
      }),
    );
    expect(r.allocations).toHaveLength(0);
    expect(r.shortfalls[0]?.missing).toBe('100');
  });
});

describe('kaskad chegaralari', () => {
  it('prioriteti yo‘q ombor qatnashmaydi (POS unga yeta olmaydi)', () => {
    const orphan = store('store-x', { name: 'Chetdagi', posPriority: null });
    const r = allocateForSale(
      input({
        stores: [w01, orphan],
        cellsByProduct: new Map([[P, [cell('store-x', 'x-a', '900')]]]),
        availableByProduct: new Map([[P, avail(['store-x', '900'])]]),
      }),
    );
    expect(r.allocations).toHaveLength(0);
  });

  it('kaskad sozlanmagan bo‘lsa smena ombori (F6 zaxira yo‘li)', () => {
    const bare = store(S01, { name: 'Taqsimlanmagan', posPriority: null });
    const r = allocateForSale(
      input({
        stores: [bare],
        fallbackStoreId: S01,
        cellsByProduct: new Map([[P, [cell(S01, '01-a', '500')]]]),
        availableByProduct: new Map([[P, avail([S01, '500'])]]),
      }),
    );
    expect(r.allocations[0]?.storeId).toBe(S01);
    expect(r.rules[0]?.rule).toBe('single');
  });

  it('resolveAllocStores: prioritet ↑, tenglikda nom', () => {
    const a = store('a', { name: 'Bbb', posPriority: 1 });
    const b = store('b', { name: 'Aaa', posPriority: 1 });
    const c = store('c', { name: 'Ccc', posPriority: 2 });
    expect(resolveAllocStores([c, a, b]).map((s) => s.name)).toEqual(['Aaa', 'Bbb', 'Ccc']);
  });
});

describe('rezerv va tom (ombor «доступно»)', () => {
  it('ombor «доступно» yacheykalar yig‘indisidan kichik bo‘lsa — kesiladi', () => {
    // Yacheykalarda 100+50=150, lekin 120 si band ⇒ «доступно» 30.
    const r = allocateForSale(
      input({
        requested: '30',
        stores: [w01],
        cellsByProduct: new Map([[P, [cell(S01, 'katta', '100'), cell(S01, 'kichik', '50')]]]),
        availableByProduct: new Map([[P, avail([S01, '30'])]]),
      }),
    );
    // Tom kattadan to'ldiriladi ⇒ 30 «katta» yacheykadan.
    expect(r.allocations).toEqual([
      {
        assortmentId: P,
        storeId: S01,
        storeName: 'Ombor 01',
        cellId: 'c-katta',
        cellName: 'katta',
        qty: '30',
      },
    ]);
  });

  it('«доступно» 0 bo‘lgan ombor umuman qatnashmaydi', () => {
    const r = allocateForSale(
      input({
        stores: [w01, w02],
        cellsByProduct: new Map([[P, [cell(S01, '01-a', '900'), cell(S02, '02-a', '150')]]]),
        availableByProduct: new Map([[P, avail([S01, '0'], [S02, '150'])]]),
      }),
    );
    expect(r.allocations[0]?.storeId).toBe(S02);
  });
});

describe('so‘rov chegaralari', () => {
  it('bir tovar bir necha qatorda kelsa JAMLANADI', () => {
    const r = allocateForSale(
      input({
        requests: [
          { assortmentId: P, requested: '60' },
          { assortmentId: P, requested: '60' },
        ],
        stores: [w01],
        cellsByProduct: new Map([[P, [cell(S01, 'a', '130')]]]),
        availableByProduct: new Map([[P, avail([S01, '130'])]]),
      }),
    );
    expect(r.allocations).toHaveLength(1);
    expect(r.allocations[0]?.qty).toBe('120');
  });

  it('nol/manfiy so‘rov e’tiborsiz qoladi', () => {
    const r = allocateForSale(input({ requests: [{ assortmentId: P, requested: '0' }] }));
    expect(r.allocations).toHaveLength(0);
    expect(r.shortfalls).toHaveLength(0);
  });

  it('Decimal kasrlari float‘siz', () => {
    const r = allocateForSale(
      input({
        requested: '0.3',
        stores: [w01],
        cellsByProduct: new Map([[P, [cell(S01, 'a', '0.1'), cell(S01, 'b', '0.1')]]]),
        availableByProduct: new Map([[P, avail([S01, '0.25'])]]),
      }),
    );
    // 0.25 «доступно» ⇒ 0.1 + 0.1 + 0.05 (yacheykasiz) = 0.25, yetmagani 0.05
    expect(r.shortfalls[0]?.missing).toBe('0.05');
  });
});

describe('pozitsiyalarga yoyish', () => {
  const A = (storeId: string, cellId: string | null, qty: string) => ({
    assortmentId: P,
    storeId,
    storeName: storeId,
    cellId,
    cellName: cellId,
    qty,
  });

  it('bitta pozitsiya, bitta manba', () => {
    const r = spreadAllocationsToPositions(
      [A(S01, 'c1', '100')],
      [{ id: 'pos1', assortmentId: P, quantity: '100' }],
    );
    expect(r).toEqual([
      { positionId: 'pos1', assortmentId: P, storeId: S01, cellId: 'c1', qty: '100' },
    ]);
  });

  it('bitta pozitsiya, bo‘lingan manba — ikki qator', () => {
    const r = spreadAllocationsToPositions(
      [A(S01, 'c1', '60'), A(S02, null, '40')],
      [{ id: 'pos1', assortmentId: P, quantity: '100' }],
    );
    expect(r.map((x) => [x.storeId, x.cellId, x.qty])).toEqual([
      [S01, 'c1', '60'],
      [S02, null, '40'],
    ]);
  });

  it('bir tovar IKKI pozitsiyada — ajratma tartib bilan yoyiladi', () => {
    // Taqsimot tovar kesimida 120 ta bergan; pozitsiyalar 50 va 70.
    const r = spreadAllocationsToPositions(
      [A(S01, 'c1', '80'), A(S02, 'c2', '40')],
      [
        { id: 'pos1', assortmentId: P, quantity: '50' },
        { id: 'pos2', assortmentId: P, quantity: '70' },
      ],
    );
    expect(r.map((x) => [x.positionId, x.cellId, x.qty])).toEqual([
      ['pos1', 'c1', '50'],
      ['pos2', 'c1', '30'],
      ['pos2', 'c2', '40'],
    ]);
  });

  it('ajratma yetmasa qolgan pozitsiya qatorsiz qoladi (shortfall alohida)', () => {
    const r = spreadAllocationsToPositions(
      [A(S01, 'c1', '30')],
      [{ id: 'pos1', assortmentId: P, quantity: '100' }],
    );
    expect(r).toHaveLength(1);
    expect(r[0]?.qty).toBe('30');
  });

  it('boshqa tovarning pozitsiyasiga tegmaydi', () => {
    const r = spreadAllocationsToPositions(
      [A(S01, 'c1', '100')],
      [
        { id: 'pos1', assortmentId: 'p2', quantity: '10' },
        { id: 'pos2', assortmentId: P, quantity: '100' },
      ],
    );
    expect(r).toHaveLength(1);
    expect(r[0]?.positionId).toBe('pos2');
  });

  it('Decimal kasrlari saqlanadi', () => {
    const r = spreadAllocationsToPositions(
      [A(S01, 'c1', '0.3')],
      [
        { id: 'pos1', assortmentId: P, quantity: '0.1' },
        { id: 'pos2', assortmentId: P, quantity: '0.2' },
      ],
    );
    expect(r.map((x) => x.qty)).toEqual(['0.1', '0.2']);
  });
});

describe('zaxira yo‘l (kaskad sozlanmagan)', () => {
  it('ombor ro‘yxatda bo‘lmasa ham SINTETIK yozuv qaytaradi', () => {
    // F6 kafolati: kaskadsiz o'rnatmada kassa AVVALGIDEK smena omboridan
    // sotadi. Bo'sh ro'yxat qaytarish har sotuvni 400 ga aylantirardi.
    const r = resolveAllocStores([], 'smena-ombori');
    expect(r).toEqual([
      { id: 'smena-ombori', name: '', posPriority: 1, isPosFront: false, isBrak: false },
    ]);
  });

  it('fallback berilmasa bo‘sh', () => {
    expect(resolveAllocStores([], null)).toEqual([]);
  });

  it('BRAK ombori zaxira yo‘lda ham manba bo‘lmaydi', () => {
    const brak = { id: 'b', name: 'BRAK', posPriority: null, isPosFront: false, isBrak: true };
    expect(resolveAllocStores([brak], 'b')).toEqual([]);
  });

  it('sintetik ombor bilan sotuv o‘tadi', () => {
    const r = allocateForSale({
      requests: [{ assortmentId: P, requested: '5' }],
      stores: [],
      cellsByProduct: new Map(),
      availableByProduct: new Map([[P, [{ storeId: 'smena', available: '10' }]]]),
      fallbackStoreId: 'smena',
    });
    expect(r.allocations).toEqual([
      { assortmentId: P, storeId: 'smena', storeName: '', cellId: null, cellName: null, qty: '5' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// K3 (K-reja 7.1) — bo'linadigan tovar istisnosi
// ---------------------------------------------------------------------------

describe('🔴 K3/7.1 — `pieceTracked` tovarda BO`LINISH yo`q', () => {
  const cells = new Map([[P, [cell(S01, '01-a', '100'), cell(S02, '02-a', '80')]]]);
  const availTwo = new Map([[P, avail([S01, '100'], [S02, '80'])]]);

  it('bayroq O`CHIQ: 180 ikki yacheykadan BO`LINADI (eski xulq, o`zgarmagan)', () => {
    const r = allocateForSale(
      input({ requested: '180', cellsByProduct: cells, availableByProduct: availTwo }),
    );
    expect(r.rules[0]?.rule).toBe('split');
    expect(r.allocations).toHaveLength(2);
    expect(r.shortfalls).toHaveLength(0);
  });

  it('bayroq YOQILGAN: bo`linmaydi — `no-single-source` qaytadi', () => {
    // Mijozga UZLUKSIZ 180 m kerak; «100 + 80» yaroqsiz. Qaror kassirga
    // qaytadi (K-Q5), tizim o'zi bo'lmaydi.
    const r = allocateForSale({
      ...input({ requested: '180', cellsByProduct: cells, availableByProduct: availTwo }),
      pieceTracked: new Set([P]),
    });
    expect(r.allocations).toHaveLength(0);
    expect(r.rules[0]?.rule).toBe('none');
    expect(r.shortfalls).toEqual([
      {
        assortmentId: P,
        requested: '180',
        missing: '180',
        reason: 'no-single-source',
        largestSingle: '100',
      },
    ]);
  });

  it('bayroq YOQILGAN, lekin BITTA manba qoplaydi: sotuv AVVALGIDEK o`tadi', () => {
    // Eng ko'p uchraydigan holat — kassa to'xtamaydi.
    const r = allocateForSale({
      ...input({
        requested: '80',
        cellsByProduct: cells,
        availableByProduct: availTwo,
      }),
      pieceTracked: new Set([P]),
    });
    expect(r.shortfalls).toHaveLength(0);
    expect(r.allocations).toHaveLength(1);
    expect(r.allocations[0]?.qty).toBe('80');
    expect(r.rules[0]?.rule).toBe('single');
  });

  it('bayroq YOQILGAN, 07 yolg`iz qoplaydi: 1-holat o`zgarmaydi', () => {
    const r = allocateForSale({
      ...input({
        requested: '100',
        cellsByProduct: new Map([[P, [cell(S07, '07-a', '150')]]]),
        availableByProduct: new Map([[P, avail([S07, '150'])]]),
      }),
      pieceTracked: new Set([P]),
    });
    expect(r.rules[0]?.rule).toBe('front');
    expect(r.allocations).toHaveLength(1);
  });

  it('bayroq YOQILGAN va jami ham yetmaydi: sabab `insufficient`', () => {
    // «Yolg'iz manba yo'q» emas, HAQIQIY defitsit — kassir mijozga «bunchasi
    // yo'q» deydi, bo'lish taklifi ma'nosiz.
    const r = allocateForSale({
      ...input({
        requested: '500',
        cellsByProduct: cells,
        availableByProduct: availTwo,
      }),
      pieceTracked: new Set([P]),
    });
    expect(r.shortfalls[0]?.reason).toBe('insufficient');
    expect(r.shortfalls[0]?.missing).toBe('320');
    expect(r.allocations).toHaveLength(0);
  });

  it('bayroq boshqa tovarda: shu tovar avvalgidek bo`linadi', () => {
    const r = allocateForSale({
      ...input({ requested: '180', cellsByProduct: cells, availableByProduct: availTwo }),
      pieceTracked: new Set(['boshqa-tovar']),
    });
    expect(r.rules[0]?.rule).toBe('split');
    expect(r.allocations).toHaveLength(2);
  });
});

describe('xabar matni — sabab bo`yicha', () => {
  it('defitsitda xabar AVVALGIDEK (bayroqsiz akkauntda bir harf ham o`zgarmaydi)', () => {
    const msg = buildShortfallMessage([
      { assortmentId: P, requested: '10', missing: '4', reason: 'insufficient' },
    ]);
    expect(msg).toBe(
      "Tizimdagi hech bir omborda yetarli miqdor yo'q. Yetishmagan tovar(lar): p1 — 4 ta",
    );
  });

  it('bo`linadigan tovarda xabar «yetmaydi» DEMAYDI — bo`lishni taklif qiladi', () => {
    const msg = buildShortfallMessage([
      {
        assortmentId: P,
        requested: '180',
        missing: '180',
        reason: 'no-single-source',
        largestSingle: '100',
      },
    ]);
    expect(msg).not.toContain("yetarli miqdor yo'q");
    expect(msg).toContain('uzluksiz');
    expect(msg).toContain('eng kattasi 100');
  });

  it('ikkala sabab birga kelsa ikkalasi ham xabarda', () => {
    const msg = buildShortfallMessage([
      { assortmentId: 'p2', requested: '10', missing: '4', reason: 'insufficient' },
      {
        assortmentId: P,
        requested: '180',
        missing: '180',
        reason: 'no-single-source',
        largestSingle: '100',
      },
    ]);
    expect(msg).toContain('p2 — 4 ta');
    expect(msg).toContain('p1 — 180');
  });
});
