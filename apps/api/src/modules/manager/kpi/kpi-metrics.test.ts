import { describe, expect, it } from 'vitest';
import {
  KPI_METRICS,
  dayIsComplete,
  deviationPercent,
  measured,
  metricDef,
  perHourValue,
  unmeasured,
} from './kpi-metrics.js';

/**
 * Ko'rsatkich katalogi va normalizatsiya qoidalari.
 *
 * Testlarning ko'pi ARIFMETIKA emas, SHARTNOMA haqida: «o'lchanmagan» ni nolga
 * aylantirmaslik, ishlamagan odamni soatiga bo'lmaslik, yo'nalishni taxmin
 * qilmaslik. Arifmetikaning o'zi bir qator — buziladigan joyi shartnoma.
 */

describe('katalog', () => {
  it('kalitlar takrorlanmaydi', () => {
    const keys = KPI_METRICS.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('har ko`rsatkichda yo`nalish aniq belgilangan', () => {
    // Ekran rangni va reyting tartibini shundan oladi — «taxmin qilaman»
    // degan holat bo'lmasligi kerak.
    for (const m of KPI_METRICS) {
      expect(['higher_better', 'lower_better', 'neutral']).toContain(m.direction);
    }
  });

  it('kam-yaxshi ko`rsatkichlar to`g`ri belgilangan', () => {
    for (const key of [
      'till_variance_abs',
      'discount_given',
      'below_cost_count',
      'below_cost_loss',
      'cancel_count',
      'refund_count',
      'credit_given',
      'late_minutes',
      'tasks_overdue',
    ]) {
      expect(metricDef(key)?.direction, key).toBe('lower_better');
    }
  });

  it('soatga normallashtiriladiganlar — faqat oqim ko`rsatkichlari', () => {
    // Kassa farqi yoki kechikishni soatga bo'lish ma'nosiz: ular smena
    // yakunidagi yoki kun boshidagi bir martalik hodisa.
    expect(metricDef('cash_revenue')?.perHour).toBe(true);
    expect(metricDef('picked_lines')?.perHour).toBe(true);
    expect(metricDef('till_variance_abs')?.perHour).toBe(false);
    expect(metricDef('late_minutes')?.perHour).toBe(false);
  });

  it('noma`lum kalit undefined qaytaradi (jim 0 emas)', () => {
    expect(metricDef('yoq_bunday_kalit')).toBeUndefined();
  });
});

describe('o`lchanmagan ≠ nol', () => {
  it('unmeasured null qiymat va chala bayroq beradi', () => {
    const v = unmeasured('gross_profit');
    expect(v.value).toBeNull();
    expect(v.complete).toBe(false);
  });

  it('haqiqiy nol o`lchov sifatida saqlanadi', () => {
    // «Bugun hech narsa sotmadi» — bu O'LCHANGAN nol, kamchilik emas.
    const v = measured('cash_revenue', 0n);
    expect(v.value).toBe(0n);
    expect(v.complete).toBe(true);
  });
});

describe('dayIsComplete', () => {
  it('hamma ko`rsatkich to`liq bo`lsa — kun to`liq', () => {
    expect(dayIsComplete([measured('a', 1n), measured('b', 2n)])).toBe(true);
  });

  it('bitta chala ko`rsatkich kunni chala qiladi', () => {
    expect(dayIsComplete([measured('a', 1n), measured('b', 2n, false)])).toBe(false);
  });
});

describe('perHourValue — adolat normalizatsiyasi', () => {
  it('soatiga qiymatni beradi', () => {
    // 600 000 tiyin, 240 daqiqa (4 soat) → 150 000 tiyin/soat
    expect(perHourValue(600_000n, 240)).toBe(150_000n);
  });

  it('yaxlitlaydi, kesmaydi', () => {
    // 100 × 60 / 7 = 857.14… → 857
    expect(perHourValue(100n, 7)).toBe(857n);
  });

  it('ishlangan vaqt YO`Q bo`lsa null — 0 EMAS', () => {
    // 0 deb ko'rsatilsa, ishlamagan odam eng yomon xodimga aylanib qolardi.
    expect(perHourValue(500n, 0)).toBeNull();
    expect(perHourValue(500n, null)).toBeNull();
  });

  it('qiymatning o`zi o`lchanmagan bo`lsa null', () => {
    expect(perHourValue(null, 480)).toBeNull();
  });

  it('manfiy qiymatda ishorani saqlaydi', () => {
    expect(perHourValue(-600_000n, 240)).toBe(-150_000n);
  });
});

describe('deviationPercent — «nima o`zgardi»', () => {
  it('o`rtachadan og`ishni foizda beradi', () => {
    // 1 200 000 vs o'rtacha 2 000 000 → −40%
    expect(deviationPercent(1_200_000n, 2_000_000n)).toBe(-40);
  });

  it('o`sishni musbat ko`rsatadi', () => {
    expect(deviationPercent(2_500_000n, 2_000_000n)).toBe(25);
  });

  it('bir xona bilan yaxlitlaydi', () => {
    // 2/3 → +(-33.33)% ; 1 dan 3 ga: (3−1)/1 = +200%
    expect(deviationPercent(2n, 3n)).toBe(-33.3);
  });

  it('o`rtacha nol yoki noma`lum bo`lsa null (bo`lish yo`q)', () => {
    expect(deviationPercent(100n, 0n)).toBeNull();
    expect(deviationPercent(100n, null)).toBeNull();
    expect(deviationPercent(null, 100n)).toBeNull();
  });

  it('2^53 dan katta summada ham aniq', () => {
    const big = 9_007_199_254_740_993n;
    expect(deviationPercent(big * 2n, big)).toBe(100);
  });
});
