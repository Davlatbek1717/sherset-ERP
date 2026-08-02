import { describe, expect, it } from 'vitest';
import {
  averageCheckMinor,
  grossProfitMinor,
  marginPercentText,
  markupPercentText,
  percent,
  percentText,
  returnRatePercentText,
} from './metrics.js';

/**
 * Analitika TZ §4 — yagona formulalar qatlami.
 *
 * Bu testlar avvalo YO'QOTILGAN xatolarni qulflaydi: Float orqali bo'lish
 * (2^53 dan katta yig'indi) va har hisobotda boshqacha yaxlitlash.
 */

describe('percent — aniq BigInt bo`linish', () => {
  it('oddiy nisbatni ikki xona bilan beradi', () => {
    expect(percent(1_300n, 26_100n)).toBe(4.98);
    expect(percent(760_000n, 2_480_000n)).toBe(30.65);
  });

  it('YAXLITLAYDI, kesmaydi', () => {
    // 2/3 = 66.666…% — kesilsa 66.66, yaxlitlansa 66.67.
    expect(percent(2n, 3n)).toBe(66.67);
  });

  it('manfiy qiymatda noldan UZOQQA yaxlitlaydi', () => {
    expect(percent(-2n, 3n)).toBe(-66.67);
  });

  it('maxraj nol bo`lsa null — «0%» EMAS', () => {
    // «O'lchab bo'lmadi» bilan «o'lchandi va nol chiqdi» boshqa-boshqa gap.
    expect(percent(100n, 0n)).toBeNull();
    expect(percent(0n, 0n)).toBeNull();
  });

  it('2^53 dan KATTA yig`indida ham aniq (Float bu yerda sinardi)', () => {
    // Eski `Number(a)/Number(b)` shakli: har ikkala son ham 2^53 dan katta,
    // Float ularni yaxlitlab yuboradi va nisbat siljiydi. Bu yerda esa
    // butun bo'linish BigInt'da ketadi.
    const denom = 9_007_199_254_740_993n * 1000n; // 2^53+1 dan ancha katta
    const numer = denom / 4n;
    expect(percent(numer, denom)).toBe(25);
  });

  it('maxraj manfiy bo`lsa ishorani to`g`ri saqlaydi', () => {
    expect(percent(10n, -20n)).toBe(-50);
  });
});

describe('percentText — hisobot DTO shartnomasi', () => {
  it('ikki xonali satr qaytaradi', () => {
    expect(percentText(1n, 3n)).toBe('33.33');
  });

  it('maxraj nol bo`lsa BO`SH satr (jadval katagi bo`sh qoladi)', () => {
    // '0.00' bo'lsa o'lchanmagan joyda o'lchangan nol da'vo qilingan bo'lardi.
    expect(percentText(5n, 0n)).toBe('');
  });
});

describe('foyda va marja', () => {
  it('yalpi foyda = tushum − tan narx', () => {
    expect(grossProfitMinor(100_000n, 60_000n)).toBe(40_000n);
    expect(grossProfitMinor(60_000n, 100_000n)).toBe(-40_000n); // zarar — haqiqiy natija
  });

  it('marja TUSHUMGA, ustama TAN NARXGA bo`linadi (ikkalasi ham «marja» deyiladi)', () => {
    const revenue = 100_000n;
    const cost = 80_000n;
    const profit = grossProfitMinor(revenue, cost);
    expect(marginPercentText(profit, revenue)).toBe('20.00');
    expect(markupPercentText(profit, cost)).toBe('25.00');
  });

  it('zarar manfiy marja bo`lib chiqadi', () => {
    expect(marginPercentText(-800n, 24_000n)).toBe('-3.33');
  });
});

describe('averageCheckMinor', () => {
  it('tushumni hujjat soniga bo`ladi va yaxlitlaydi', () => {
    expect(averageCheckMinor(100_000n, 3)).toBe(33_333n);
    expect(averageCheckMinor(100_001n, 3)).toBe(33_334n);
  });

  it('hujjat bo`lmasa nol (bo`linish yo`q)', () => {
    expect(averageCheckMinor(100_000n, 0)).toBe(0n);
    expect(averageCheckMinor(100_000n, -1)).toBe(0n);
  });

  it('manfiy tushumda ham noldan uzoqqa yaxlitlaydi', () => {
    expect(averageCheckMinor(-100_001n, 3)).toBe(-33_334n);
  });
});

describe('returnRatePercentText', () => {
  it('qaytarish ÷ tushum', () => {
    expect(returnRatePercentText(5_000n, 100_000n)).toBe('5.00');
  });

  it('tushum nol bo`lsa nisbat yo`q', () => {
    expect(returnRatePercentText(5_000n, 0n)).toBe('');
  });
});
