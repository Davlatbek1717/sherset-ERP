import { describe, expect, it } from 'vitest';
import { DAILY_KPI_STATE, DAILY_KPI_STATES } from '../../manager/kpi/daily-kpi-fsm.js';
import {
  type PayrollDayInput,
  payrollHasUnacceptedDays,
  sumAcceptedSales,
} from './payroll-acceptance.util.js';

/**
 * Qabul → oylik ko'prigi (TZ §4, M-Q8 bloklash) — sof qoidalar testi.
 *
 * Bu yerda qulflanadigan narsalar PULGA tegadi:
 *   1. qabul QILINMAGAN kun oylikka umuman kirmaydi;
 *   2. menejer tuzatmasi g'olib (M-Q3 — qabul darhol pulga ta'sir qiladi);
 *   3. bloklangan summa YASHIRILMAYDI (nega oylik kam — javobi bo'lsin);
 *   4. holat ro'yxati FSM'dan keladi, bu yerda takrorlanmaydi.
 */

const day = (over: Partial<PayrollDayInput> = {}): PayrollDayInput => ({
  state: DAILY_KPI_STATE.accepted,
  autoSalesMinor: 100_000n,
  adjustSalesMinor: null,
  ...over,
});

describe('M-Q8 bloklash — faqat qabul qilingan kun oylikka kiradi', () => {
  it('qabul qilingan va majburiy yopilgan kunlar kiradi', () => {
    const r = sumAcceptedSales([
      day({ state: DAILY_KPI_STATE.accepted, autoSalesMinor: 300_000n }),
      day({ state: DAILY_KPI_STATE.forceAccepted, autoSalesMinor: 200_000n }),
    ]);
    // `force_accepted` ham to'lanadi: egasi yopgan, xodim oyliksiz qolmaydi.
    expect(r.totalSalesMinor).toBe(500_000n);
    expect(r.acceptedDays).toBe(2);
    expect(r.pendingDays).toBe(0);
  });

  it('qabul kutayotgan kun oylikka KIRMAYDI', () => {
    const r = sumAcceptedSales([
      day({ state: DAILY_KPI_STATE.accepted, autoSalesMinor: 300_000n }),
      day({ state: DAILY_KPI_STATE.pending, autoSalesMinor: 900_000n }),
    ]);
    expect(r.totalSalesMinor).toBe(300_000n);
    expect(r.blockedSalesMinor).toBe(900_000n);
    expect(r.pendingDays).toBe(1);
  });

  it.each([
    DAILY_KPI_STATE.computed,
    DAILY_KPI_STATE.pending,
    DAILY_KPI_STATE.rejected,
    DAILY_KPI_STATE.stale,
    DAILY_KPI_STATE.escalated,
  ])('%s holati bloklanadi', (state) => {
    const r = sumAcceptedSales([day({ state, autoSalesMinor: 50_000n })]);
    expect(r.totalSalesMinor).toBe(0n);
    expect(r.blockedSalesMinor).toBe(50_000n);
  });

  it('ESKIRGAN kun ham bloklanadi — u qayta ko`rikda', () => {
    // Qabul qilingan edi, keyin manba hujjat o'zgardi. Eski raqamni to'lashda
    // davom etish «hisobot tarixni qayta yozmasin» qoidasiga zid bo'lardi:
    // kun qayta ko'rilib, tuzatuvchi qator bilan yopiladi (§3.4).
    const r = sumAcceptedSales([day({ state: DAILY_KPI_STATE.stale })]);
    expect(r.acceptedDays).toBe(0);
    expect(r.pendingDays).toBe(1);
  });

  it('FSM dagi HAR holat qamralgan (yangi holat qo`shilsa test yiqiladi)', () => {
    // Ro'yxat FSM'dan olinadi — bu yerda qo'lda takrorlanmaydi.
    for (const state of DAILY_KPI_STATES) {
      const r = sumAcceptedSales([day({ state, autoSalesMinor: 10n })]);
      expect(r.acceptedDays + r.pendingDays, state).toBe(1);
      expect(r.totalSalesMinor + r.blockedSalesMinor, state).toBe(10n);
    }
  });
});

describe('menejer tuzatmasi (M-Q3 — qabul darhol pulga ta`sir qiladi)', () => {
  it('tuzatma avtomat qiymatdan USTUN', () => {
    const r = sumAcceptedSales([day({ autoSalesMinor: 100_000n, adjustSalesMinor: 250_000n })]);
    expect(r.totalSalesMinor).toBe(250_000n);
  });

  it('tuzatma NOLga tushirishi mumkin (0 ≠ tuzatilmagan)', () => {
    const r = sumAcceptedSales([day({ autoSalesMinor: 100_000n, adjustSalesMinor: 0n })]);
    expect(r.totalSalesMinor).toBe(0n);
    expect(r.acceptedDays).toBe(1);
  });

  it('bloklangan kunda ham tuzatma hisobga olinadi (bloklangan summa to`g`ri)', () => {
    const r = sumAcceptedSales([
      day({ state: DAILY_KPI_STATE.pending, autoSalesMinor: 1n, adjustSalesMinor: 777n }),
    ]);
    expect(r.blockedSalesMinor).toBe(777n);
  });
});

describe('NULL ≠ 0', () => {
  it('o`lchanmagan sotuv yig`indiga hech narsa qo`shmaydi', () => {
    const r = sumAcceptedSales([day({ autoSalesMinor: 200_000n }), day({ autoSalesMinor: null })]);
    expect(r.totalSalesMinor).toBe(200_000n);
  });

  it('lekin o`lchanmagan kun ham QABUL QILINGAN kun sifatida sanaladi', () => {
    // U ko'rilgan va yopilgan kun — «sotuv bo'lmagan» ham natija.
    const r = sumAcceptedSales([day({ autoSalesMinor: null })]);
    expect(r.acceptedDays).toBe(1);
    expect(r.pendingDays).toBe(0);
  });
});

describe('katta summalar — BigInt aniqligi', () => {
  it('2^53 dan katta yig`indi yaxlitlanmaydi', () => {
    const big = 9_007_199_254_740_993n; // Number.MAX_SAFE_INTEGER + 2
    const r = sumAcceptedSales([day({ autoSalesMinor: big }), day({ autoSalesMinor: 1n })]);
    expect(r.totalSalesMinor).toBe(big + 1n);
  });
});

describe('payrollHasUnacceptedDays', () => {
  it('bitta ham qabul qilinmagan kun bo`lsa ogohlantiradi', () => {
    expect(payrollHasUnacceptedDays(sumAcceptedSales([day({ state: 'pending' })]))).toBe(true);
  });

  it('hammasi qabul qilingan bo`lsa toza', () => {
    expect(payrollHasUnacceptedDays(sumAcceptedSales([day()]))).toBe(false);
  });

  it('kun umuman bo`lmasa ogohlantirmaydi (bo`sh oy)', () => {
    expect(payrollHasUnacceptedDays(sumAcceptedSales([]))).toBe(false);
  });
});
