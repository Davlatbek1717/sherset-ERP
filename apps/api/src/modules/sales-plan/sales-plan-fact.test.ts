import { describe, expect, it } from 'vitest';
import type { DailyMetricRow } from './sales-plan-fact.js';
import { aggregateSalesFact, aggregateSalesFactByEmployee } from './sales-plan-fact.js';
import { SALES_PLAN_TYPE } from './sales-plan-types.js';

/**
 * MK37 — FAKT `employee_daily_kpi_metrics` DAN. Bu yerda ikkinchi formula
 * yozilmaydi: modul faqat mavjud kunlik qiymatlarni yig'adi.
 */

function row(p: Partial<DailyMetricRow> & { metricKey: string }): DailyMetricRow {
  return {
    employeeId: 'e1',
    autoValue: null,
    adjustValue: null,
    complete: true,
    ...p,
  };
}

describe('MK37 — oylik fakt (kunlik KPI qatorlaridan)', () => {
  it('bir ko`rsatkichning kunlari QO`SHILADI', () => {
    const fact = aggregateSalesFact(
      [
        row({ metricKey: 'sales_revenue', autoValue: 1_000_00n }),
        row({ metricKey: 'sales_revenue', autoValue: 2_500_00n }),
      ],
      SALES_PLAN_TYPE.revenue,
    );
    expect(fact.value).toBe(3_500_00n);
    expect(fact.complete).toBe(true);
    expect(fact.contributingKeys).toEqual(['sales_revenue']);
  });

  it('hujjat va kassa tushumi BIRGA qo`shiladi (ikki manba, bir savol)', () => {
    const fact = aggregateSalesFact(
      [
        row({ metricKey: 'sales_revenue', autoValue: 1_000_00n }),
        row({ metricKey: 'cash_revenue', autoValue: 400_00n }),
      ],
      SALES_PLAN_TYPE.revenue,
    );
    expect(fact.value).toBe(1_400_00n);
    expect(fact.contributingKeys.sort()).toEqual(['cash_revenue', 'sales_revenue']);
  });

  it('begona ko`rsatkich HISOBGA KIRMAYDI', () => {
    const fact = aggregateSalesFact(
      [
        row({ metricKey: 'sales_revenue', autoValue: 100n }),
        row({ metricKey: 'late_minutes', autoValue: 999n }),
        row({ metricKey: 'gross_profit', autoValue: 777n }),
      ],
      SALES_PLAN_TYPE.revenue,
    );
    expect(fact.value).toBe(100n);
  });

  it('🔴 menejer TUZATMASI avtomat qiymatni ALMASHTIRADI (qo`shilmaydi)', () => {
    // 4M.2: `adjustValue` — tuzatilgan haqiqat. Qo'shilsa kun ikki marta
    // sanalardi va oylik fakt jimgina shishib ketardi.
    const fact = aggregateSalesFact(
      [row({ metricKey: 'sales_revenue', autoValue: 100_00n, adjustValue: 80_00n })],
      SALES_PLAN_TYPE.revenue,
    );
    expect(fact.value).toBe(80_00n);
  });

  it('tuzatma 0 bo`lsa ham u qiymat (null bilan aralashmaydi)', () => {
    const fact = aggregateSalesFact(
      [row({ metricKey: 'sales_revenue', autoValue: 100_00n, adjustValue: 0n })],
      SALES_PLAN_TYPE.revenue,
    );
    expect(fact.value).toBe(0n);
  });

  it('🔴 hech narsa o`lchanmagan bo`lsa fakt NULL — 0 EMAS', () => {
    const fact = aggregateSalesFact(
      [row({ metricKey: 'sales_revenue', autoValue: null, complete: false })],
      SALES_PLAN_TYPE.revenue,
    );
    expect(fact.value).toBeNull();
    expect(fact.complete).toBe(false);
  });

  it('qator umuman yo`q bo`lsa ham fakt NULL', () => {
    expect(aggregateSalesFact([], SALES_PLAN_TYPE.revenue).value).toBeNull();
  });

  it('o`lchangan NOL — bu 0, null EMAS', () => {
    const fact = aggregateSalesFact(
      [row({ metricKey: 'sales_revenue', autoValue: 0n })],
      SALES_PLAN_TYPE.revenue,
    );
    expect(fact.value).toBe(0n);
    expect(fact.complete).toBe(true);
  });

  it('bitta kun chala bo`lsa butun oy CHALA deb belgilanadi', () => {
    const fact = aggregateSalesFact(
      [
        row({ metricKey: 'gross_profit', autoValue: 100n, complete: true }),
        row({ metricKey: 'gross_profit', autoValue: 50n, complete: false }),
      ],
      SALES_PLAN_TYPE.profit,
    );
    expect(fact.value).toBe(150n);
    expect(fact.complete).toBe(false);
  });

  it('o`lchanmagan qator faktni CHALA qiladi, lekin qolganini yo`qotmaydi', () => {
    const fact = aggregateSalesFact(
      [
        row({ metricKey: 'sales_revenue', autoValue: 100n }),
        row({ metricKey: 'sales_revenue', autoValue: null, complete: false }),
      ],
      SALES_PLAN_TYPE.revenue,
    );
    expect(fact.value).toBe(100n);
    expect(fact.complete).toBe(false);
  });

  it('🔴 manbasi YO`Q tur: fakt NULL va `source: none` (0% deb chizilmaydi)', () => {
    const fact = aggregateSalesFact(
      [row({ metricKey: 'sales_revenue', autoValue: 100n })],
      SALES_PLAN_TYPE.customerCount,
    );
    expect(fact.value).toBeNull();
    expect(fact.source).toBe('none');
    expect(fact.contributingKeys).toEqual([]);
  });

  it('xodimlar bo`yicha ajratiladi (bir xodim boshqasining faktini olmaydi)', () => {
    const byEmployee = aggregateSalesFactByEmployee(
      [
        row({ employeeId: 'a', metricKey: 'sales_revenue', autoValue: 10n }),
        row({ employeeId: 'b', metricKey: 'sales_revenue', autoValue: 20n }),
        row({ employeeId: 'b', metricKey: 'cash_revenue', autoValue: 5n }),
      ],
      [SALES_PLAN_TYPE.revenue],
    );
    expect(byEmployee.get('a')?.get(SALES_PLAN_TYPE.revenue)?.value).toBe(10n);
    expect(byEmployee.get('b')?.get(SALES_PLAN_TYPE.revenue)?.value).toBe(25n);
  });

  it('katta summada aniqlik yo`qolmaydi (BigInt, Number EMAS)', () => {
    // 2^53 tiyindan katta yillik agregat — `Number` bu yerda jimgina
    // yumaloqlardi.
    const big = 9_007_199_254_740_993n;
    const fact = aggregateSalesFact(
      [
        row({ metricKey: 'sales_revenue', autoValue: big }),
        row({ metricKey: 'sales_revenue', autoValue: 1n }),
      ],
      SALES_PLAN_TYPE.revenue,
    );
    expect(fact.value).toBe(big + 1n);
  });
});
