import { describe, expect, it } from 'vitest';
import {
  computeRefundSettlementCaps,
  validateRefundSettlement,
} from './retail-refund-validation.js';
import { TENDER, computeTenders, legacyTotals } from './retail-tenders.js';

/**
 * A2 — AVANS TENDERINING SOF QOIDALARI (DB yo'q, Nest yo'q).
 *
 * Ikki qatlam bu yerda qulflanadi:
 *   1. `computeTenders` — avans qoplama sifatida sanaladi, LEKIN qaytim
 *      bermaydi (invariant 5 ning tender tomondagi shakli);
 *   2. `computeRefundSettlementCaps` — avans ulushi SO'M pul ulushidan
 *      chiqariladi, aks holda avansdan to'langan chek naqd qaytarilib
 *      yashiqdan hech qachon kirmagan pul chiqib ketardi (R1 sinfi).
 */

const base = {
  cashMinor: 0n,
  cardMinor: 0n,
  terminalMinor: 0n,
  debtMinor: 0n,
  totalMinor: 100_000n,
};

describe('computeTenders — PREPAY qoplama sifatida sanaladi', () => {
  it('to`liq avansdan: chek yopiladi, qaytim yo`q, PREPAY qatori chiqadi', () => {
    const r = computeTenders({ ...base, prepayMinor: 100_000n });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.changeMinor).toBe(0n);
    expect(r.prepayMinor).toBe(100_000n);
    // 🔴 `paidMinor` — YASHIQQA/BANKKA kelgan pul. Avans u yerga bugun
    // kirmagan, shuning uchun bu songa QO'SHILMAYDI.
    expect(r.paidMinor).toBe(0n);
    expect(r.lines).toEqual([{ method: TENDER.prepay, amountMinor: 100_000n }]);
  });

  it('aralash: naqd 60k + avans 40k → ikkala qator, qaytim 0', () => {
    const r = computeTenders({ ...base, cashMinor: 60_000n, prepayMinor: 40_000n });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.changeMinor).toBe(0n);
    expect(r.lines.map((l) => l.method)).toEqual([TENDER.cashUzs, TENDER.prepay]);
  });

  it('avans + qarz: arifmetika ANIQ bo`lishi shart (to`lov + qarz = jami)', () => {
    const r = computeTenders({ ...base, prepayMinor: 40_000n, debtMinor: 60_000n });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Chek TARTIBI: avans qarzdan OLDIN (kassir odatlangan ketma-ketlik).
    expect(r.lines.map((l) => l.method)).toEqual([TENDER.prepay, TENDER.debt]);
  });

  it('avans + qarz jamidan KAM → insufficient', () => {
    const r = computeTenders({ ...base, prepayMinor: 30_000n, debtMinor: 60_000n });
    expect(r).toMatchObject({ ok: false, reason: 'insufficient' });
  });

  it('🔴 QAYTIM YO`Q — chek qoldig`idan ortiq avans rad etiladi', () => {
    const r = computeTenders({ ...base, prepayMinor: 120_000n });
    expect(r).toMatchObject({
      ok: false,
      reason: 'prepay-overpaid',
      prepayMinor: 120_000n,
      allowedMinor: 100_000n,
    });
  });

  it('🔴 naqd ARALASHGAN holatda ham avans qaytim bermaydi', () => {
    // Bu — qoidaning eng muhim holati. `changeMinor > cashLike` tekshiruvi
    // buni O'TKAZIB YUBORARDI (qaytim 20k ≤ naqd 50k), ya'ni mijozning
    // avansi yashiqdan NAQD bo'lib, hujjatsiz chiqib ketardi.
    const r = computeTenders({ ...base, cashMinor: 50_000n, prepayMinor: 70_000n });
    expect(r).toMatchObject({
      ok: false,
      reason: 'prepay-overpaid',
      allowedMinor: 50_000n,
    });
  });

  it('avans qarz bilan birga bo`lganda ruxsat etilgan ulush qarzni HISOBGA OLADI', () => {
    // jami 100k, qarz 60k ⇒ avansga 40k joy qoladi.
    const r = computeTenders({ ...base, prepayMinor: 50_000n, debtMinor: 60_000n });
    expect(r).toMatchObject({ ok: false, reason: 'prepay-overpaid', allowedMinor: 40_000n });
  });

  it('qoida TARTIBDAN MUSTAQIL: naqd oldin yoki keyin kiritilishi natijani o`zgartirmaydi', () => {
    const a = computeTenders({ ...base, cashMinor: 60_000n, prepayMinor: 40_000n });
    const b = computeTenders({ ...base, prepayMinor: 40_000n, cashMinor: 60_000n });
    expect(a).toEqual(b);
  });

  it('manfiy avans → negative-input', () => {
    expect(computeTenders({ ...base, prepayMinor: -1n })).toMatchObject({
      ok: false,
      reason: 'negative-input',
    });
  });

  it('avanssiz chaqiruv (maydon uzatilmagan) — mavjud xulq bir bayt ham o`zgarmaydi', () => {
    const r = computeTenders({ ...base, cashMinor: 150_000n });
    expect(r).toMatchObject({ ok: true, changeMinor: 50_000n, prepayMinor: 0n });
  });

  it('🔴 legacyTotals PREPAY ni SANAMAYDI — smena kutilgan naqdi o`smaydi', () => {
    const { lines } = computeTenders({
      ...base,
      cashMinor: 60_000n,
      prepayMinor: 40_000n,
    }) as { lines: Parameters<typeof legacyTotals>[0] };
    expect(legacyTotals(lines)).toEqual({ cashAmountMinor: 60_000n, cardAmountMinor: 0n });
  });
});

// ───────────────────────── vozvrat cap'lari ─────────────────────────

const capBase = {
  originalSumMinor: 100_000n,
  originalDebtMinor: 0n,
  originalCashLikeMinor: null,
  priorRefundedSumMinor: 0n,
  priorMoneyReturnedMinor: 0n,
  priorCashReturnedMinor: 0n,
  priorDebtReturnedMinor: 0n,
  refundSumMinor: 100_000n,
};

describe('computeRefundSettlementCaps — avans ulushi PUL ulushidan chiqariladi', () => {
  it('🔴 100% avansdan to`langan chek: pul cap`i 0, avans cap`i to`liq', () => {
    const caps = computeRefundSettlementCaps({
      ...capBase,
      originalCashLikeMinor: 0n,
      originalPrepayMinor: 100_000n,
    });
    // Naqd/karta bilan bir tiyin ham qaytmaydi — yashiqqa bu chek orqali
    // pul kirmagan (R1 sinfi).
    expect(caps.moneyMaxMinor).toBe(0n);
    expect(caps.cashMaxMinor).toBe(0n);
    expect(caps.prepayMaxMinor).toBe(100_000n);
    expect(caps.debtMaxMinor).toBe(0n);
  });

  it('uch kanal (naqd 30k + avans 40k + qarz 30k) proporsional bo`linadi', () => {
    const caps = computeRefundSettlementCaps({
      ...capBase,
      originalDebtMinor: 30_000n,
      originalCashLikeMinor: 30_000n,
      originalPrepayMinor: 40_000n,
      refundSumMinor: 50_000n,
    });
    expect(caps.moneyMaxMinor).toBe(15_000n);
    expect(caps.prepayMaxMinor).toBe(20_000n);
    expect(caps.debtMaxMinor).toBe(15_000n);
    // Uchalasi qaytarilgan qiymatni AYNAN qoplaydi — bir tiyin osilib
    // qolmaydi (yaxlitlash qoldig'ini qarz yutadi).
    expect(caps.moneyMaxMinor + caps.prepayMaxMinor + caps.debtMaxMinor).toBe(50_000n);
  });

  it('yaxlitlash: uchta cap yig`indisi hech qachon qaytarilgan qiymatdan oshmaydi', () => {
    for (let r = 1n; r <= 100n; r++) {
      const caps = computeRefundSettlementCaps({
        ...capBase,
        originalSumMinor: 100n,
        originalDebtMinor: 33n,
        originalCashLikeMinor: 33n,
        originalPrepayMinor: 34n,
        refundSumMinor: r,
      });
      const sum = caps.moneyMaxMinor + caps.prepayMaxMinor + caps.debtMaxMinor;
      expect(sum).toBeLessThanOrEqual(r);
      expect(sum).toBeGreaterThanOrEqual(r - 2n);
    }
  });

  it('kümülativ: avvalgi qaytarishlar qaytargan avans ayiriladi', () => {
    const caps = computeRefundSettlementCaps({
      ...capBase,
      originalCashLikeMinor: 0n,
      originalPrepayMinor: 100_000n,
      priorRefundedSumMinor: 60_000n,
      priorPrepayReturnedMinor: 60_000n,
      refundSumMinor: 40_000n,
    });
    expect(caps.prepayMaxMinor).toBe(40_000n);
  });

  it('🔴 ORQAGA MOSLIK: avanssiz chekda cap`lar AVVALGIDEK qoladi', () => {
    const withField = computeRefundSettlementCaps({
      ...capBase,
      originalDebtMinor: 60_000n,
      originalCashLikeMinor: 40_000n,
      originalPrepayMinor: 0n,
      refundSumMinor: 50_000n,
    });
    const withoutField = computeRefundSettlementCaps({
      ...capBase,
      originalDebtMinor: 60_000n,
      originalCashLikeMinor: 40_000n,
      refundSumMinor: 50_000n,
    });
    expect(withField).toEqual(withoutField);
    expect(withoutField.prepayMaxMinor).toBe(0n);
  });

  it('buzuq ma`lumot (avans chek jamidan katta) manfiy pul ulushi yasamaydi', () => {
    const caps = computeRefundSettlementCaps({
      ...capBase,
      originalPrepayMinor: 500_000n,
    });
    expect(caps.moneyMaxMinor).toBe(0n);
    expect(caps.prepayMaxMinor).toBe(100_000n);
  });
});

describe('validateRefundSettlement — avans cap`i', () => {
  const caps = {
    moneyMaxMinor: 0n,
    cashMaxMinor: 0n,
    debtMaxMinor: 0n,
    usdMaxMinor: 0n,
    prepayMaxMinor: 40_000n,
  };

  it('cap ichida — ruxsat', () => {
    expect(validateRefundSettlement(caps, 0n, 0n, 0n, 0n, 40_000n)).toBeNull();
  });

  it('capdan ortiq — rad etiladi, xabar SON bilan', () => {
    const msg = validateRefundSettlement(caps, 0n, 0n, 0n, 0n, 41_000n);
    expect(msg).toMatch(/Avansga qaytarish/);
    expect(msg).toContain('400');
  });

  it('manfiy avans — rad etiladi', () => {
    expect(validateRefundSettlement(caps, 0n, 0n, 0n, 0n, -1n)).toMatch(/non-negative/);
  });

  it('uzatilmagan (eski chaqiruvchilar) — 0 deb qaraladi, hech narsa buzilmaydi', () => {
    expect(validateRefundSettlement(caps, 0n, 0n, 0n, 0n)).toBeNull();
  });
});
