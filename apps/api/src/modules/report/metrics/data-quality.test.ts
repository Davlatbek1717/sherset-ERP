import { describe, expect, it } from 'vitest';
import {
  DATA_QUALITY,
  aggregateQuality,
  countSamples,
  metricQuality,
  overallQuality,
  sharePercent,
} from './data-quality.js';

/**
 * MK09 — ma'lumot sifati bayrog'i (menejer KPI TZ §2.4, §0.2).
 *
 * 🔴 SHARTNOMA: **NULL ≠ 0**. «O'lchanmagan» va «o'lchandi va nol» ikki boshqa
 * javob. Ularni aralashtirish aynan `profitability.service.ts` dagi
 * `0::bigint AS cost` hodisasini beradi — har kassa cheki 100% marja bo'lib
 * ko'rinardi (analitika TZ X1). Shu sababdan bu yerdagi testlar bayroqni
 * emas, ARALASHTIRMASLIKNI qulflaydi.
 */

describe('MK09 — bitta ko`rsatkich bayrog`i (NULL ≠ 0)', () => {
  it('NULL qiymat «yig`ilmagan», 0 esa «to`liq» — ikkalasi bir xil emas', () => {
    expect(metricQuality(null, false)).toBe(DATA_QUALITY.uncollected);
    expect(metricQuality(0n, true)).toBe(DATA_QUALITY.complete);
    // Aynan shu ikki javob teng bo'lib qolsa, panel yolg'on gapiradi.
    expect(metricQuality(null, false)).not.toBe(metricQuality(0n, true));
  });

  it('NULL qiymat `complete: true` bo`lsa ham «yig`ilmagan» qoladi', () => {
    // Manba «to'liq» deb bayroq qo'ygan-u, qiymat yo'q — qiymatning yo'qligi
    // ustun turadi, aks holda bo'sh katak «to'liq o'lchandi» bo'lib ko'rinardi.
    expect(metricQuality(null, true)).toBe(DATA_QUALITY.uncollected);
  });

  it('o`lchandi, lekin manba chala → «qisman»', () => {
    expect(metricQuality(12_000n, false)).toBe(DATA_QUALITY.partial);
  });

  it('manfiy qiymat ham to`liq o`lchov (kassa farqi manfiy bo`ladi)', () => {
    expect(metricQuality(-5_000n, true)).toBe(DATA_QUALITY.complete);
  });
});

describe('MK09 — ko`p qatorli yig`indi bayrog`i', () => {
  it('hammasi o`lchangan va to`liq → «to`liq»', () => {
    expect(aggregateQuality({ total: 10, measured: 10, partial: 0 })).toBe(DATA_QUALITY.complete);
  });

  it('bironta chala manba bo`lsa → «qisman»', () => {
    expect(aggregateQuality({ total: 10, measured: 10, partial: 1 })).toBe(DATA_QUALITY.partial);
  });

  it('hech narsa o`lchanmagan → «yig`ilmagan» (qatorlar bor bo`lsa ham)', () => {
    // 10 ta qator ochilgan, hammasi NULL. Bu «qisman» EMAS: qisman deyish
    // «bir qismi o'lchandi» degan yolg'on ma'no berardi.
    expect(aggregateQuality({ total: 10, measured: 0, partial: 0 })).toBe(DATA_QUALITY.uncollected);
  });

  it('umuman qator yo`q → «yig`ilmagan»', () => {
    expect(aggregateQuality({ total: 0, measured: 0, partial: 0 })).toBe(DATA_QUALITY.uncollected);
  });

  it('faoliyati yo`q xodimlarning NULL qatori bayroqni tushirmaydi', () => {
    // Buxgalterda kassa ko'rsatkichi bo'lmaydi — bu kamchilik emas.
    // O'lchangan 3 qator to'liq bo'lsa, bayroq «to'liq».
    expect(aggregateQuality({ total: 10, measured: 3, partial: 0 })).toBe(DATA_QUALITY.complete);
  });
});

describe('MK09 — qatorlardan sanoq (countSamples)', () => {
  it('NULL tan narxli qator O`LCHANMAGAN deb sanaladi, 0 deb emas', () => {
    const s = countSamples([
      { value: null, complete: false },
      { value: 0n, complete: true },
      { value: 500n, complete: true },
    ]);
    expect(s).toEqual({ total: 3, measured: 2, partial: 0 });
  });

  it('o`lchangan-u chala qator `partial` da sanaladi', () => {
    const s = countSamples([
      { value: 100n, complete: false },
      { value: 100n, complete: true },
      { value: null, complete: false },
    ]);
    expect(s).toEqual({ total: 3, measured: 2, partial: 1 });
    expect(aggregateQuality(s)).toBe(DATA_QUALITY.partial);
  });
});

describe('MK09 — ulush foizi: mahraj yo`q ⇒ NULL, 0% EMAS', () => {
  it('mahraj nol bo`lsa null qaytadi', () => {
    // 0% deb ko'rsatish «tekshirildi, muammo yo'q» degan yolg'on xotirjamlik
    // berardi — aslida o'lchov umuman bo'lmagan.
    expect(sharePercent(0, 0)).toBeNull();
    expect(sharePercent(5, 0)).toBeNull();
  });

  it('haqiqiy nol ulush 0 bo`lib qaytadi (null emas)', () => {
    expect(sharePercent(0, 40)).toBe(0);
  });

  it('ikki kasrgacha — hisobot qatlami bilan bir xil yaxlitlash', () => {
    expect(sharePercent(1, 3)).toBe(33.33);
    expect(sharePercent(7, 40)).toBe(17.5);
    expect(sharePercent(40, 40)).toBe(100);
  });
});

describe('MK09 — panelning umumiy bayrog`i', () => {
  it('hammasi to`liq → «to`liq»', () => {
    expect(overallQuality([DATA_QUALITY.complete, DATA_QUALITY.complete])).toBe(
      DATA_QUALITY.complete,
    );
  });

  it('bironta qisman → «qisman»', () => {
    expect(overallQuality([DATA_QUALITY.complete, DATA_QUALITY.partial])).toBe(
      DATA_QUALITY.partial,
    );
  });

  it('to`liq va yig`ilmagan aralashsa → «qisman» (to`liq DEB ATALMAYDI)', () => {
    expect(overallQuality([DATA_QUALITY.complete, DATA_QUALITY.uncollected])).toBe(
      DATA_QUALITY.partial,
    );
  });

  it('hammasi yig`ilmagan → «yig`ilmagan»', () => {
    expect(overallQuality([DATA_QUALITY.uncollected, DATA_QUALITY.uncollected])).toBe(
      DATA_QUALITY.uncollected,
    );
  });

  it('bo`sh ro`yxat → «yig`ilmagan» (bo`shlik «to`liq» degani emas)', () => {
    expect(overallQuality([])).toBe(DATA_QUALITY.uncollected);
  });
});
