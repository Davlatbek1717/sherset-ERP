import { describe, expect, it } from 'vitest';
import { debtPayable, planAdoption } from './pos-customer-debt.js';

/**
 * P1 — «bitta daftar» qoidasining SOF yadrosi.
 *
 * TUZATISHDAN OLDINGI holat (nega bu testlar kerak): POS «Qarz to'lash»
 * FAQAT `Debt` reyestridan to'lardi, kassada berilgan qarz esa faqat
 * `CounterpartyBalance`ga tushardi. Prodda reyestr 0 qator, balansda esa
 * 15+ kontragentda katta qoldiq — ya'ni mijoz pul olib kelsa qabul
 * qilishning YO'LI yo'q edi (o'lchov: `ops-debt-audit.ts`, 2026-08-11).
 *
 * Bu ikki funksiya shu yoriqning qaroridir:
 *   `debtPayable`  — kassir ekranda ko'radigan «to'lanadigan qarz»;
 *   `planAdoption` — kelgan summa reyestrdan tashqaridagi qancha qismni
 *                    reyestrga OLIB KIRISHI kerakligi (adopsiya).
 *
 * NON-VACUOUS: bu fayl butunlay yangi shartnoma — funksiyalar mavjud
 * emas, ya'ni implementatsiyasiz TypeScript darajasida ham yiqiladi.
 */

describe('debtPayable — POS qabul qila oladigan qarz', () => {
  it("balans reyestrdan katta bo'lsa — to'lanadigan qarz BALANSdan olinadi", () => {
    // Prod holati: reyestr bo'sh, balansda 12 116 800 so'm.
    expect(debtPayable(1_211_680_000n, 0n)).toEqual({
      payableMinor: 1_211_680_000n,
      adoptableMinor: 1_211_680_000n,
    });
  });

  it("balans qatori YO'Q (null = o'lchanmagan) — faqat reyestr to'lanadi", () => {
    // 🔴 null ≠ 0: balansni «0» deb o'qish reyestrdagi qarzni ham
    // to'lanmaydigan qilib qo'yardi.
    expect(debtPayable(null, 500_000n)).toEqual({
      payableMinor: 500_000n,
      adoptableMinor: 0n,
    });
  });

  it("balans reyestrdan KICHIK — reyestr saqlanadi, adopsiya yo'q", () => {
    // Teskari nomuvofiqlik (`registryExceedsBalance`): mavjud xulq buzilmasin.
    expect(debtPayable(300_000n, 500_000n)).toEqual({
      payableMinor: 500_000n,
      adoptableMinor: 0n,
    });
  });

  it('balans MANFIY (biz mijozga qarzdormiz) — reyestrdan boshqa hech nima', () => {
    expect(debtPayable(-183_250_000n, 0n)).toEqual({
      payableMinor: 0n,
      adoptableMinor: 0n,
    });
  });

  it("balans reyestrga TENG — ikki daftar mos, adopsiya yo'q", () => {
    expect(debtPayable(500_000n, 500_000n)).toEqual({
      payableMinor: 500_000n,
      adoptableMinor: 0n,
    });
  });
});

describe('planAdoption — kelgan summa qanday taqsimlanadi', () => {
  const plan = (
    amountMinor: bigint,
    registryOutstandingMinor: bigint,
    balanceMinor: bigint | null,
  ) => planAdoption({ amountMinor, registryOutstandingMinor, balanceMinor });

  it("reyestr yetarli — adopsiya QILINMAYDI (mavjud FIFO yo'li o'zgarmaydi)", () => {
    expect(plan(300_000n, 500_000n, 900_000n)).toEqual({ adoptMinor: 0n, overpayMinor: 0n });
  });

  it("reyestr bo'sh, balansda qarz bor — hammasi adopsiya qilinadi", () => {
    expect(plan(100_000n, 0n, 1_211_680_000n)).toEqual({
      adoptMinor: 100_000n,
      overpayMinor: 0n,
    });
  });

  it('aralash: avval reyestr, qolgani balansdan (FIFO tartibi saqlanadi)', () => {
    expect(plan(800_000n, 500_000n, 1_000_000n)).toEqual({
      adoptMinor: 300_000n,
      overpayMinor: 0n,
    });
  });

  it('balansdan ham oshsa — ortiqcha QOLADI (chaqiruvchi 400 beradi)', () => {
    // Ortiqcha to'lov jimgina avansga aylanmaydi (kassa TZ §6.2 — qaytim
    // naqddan, qaror kassirniki).
    expect(plan(1_200_000n, 500_000n, 1_000_000n)).toEqual({
      adoptMinor: 500_000n,
      overpayMinor: 200_000n,
    });
  });

  it("balans o'lchanmagan (null) — reyestrdan ortig'i to'liq ortiqcha", () => {
    expect(plan(800_000n, 500_000n, null)).toEqual({ adoptMinor: 0n, overpayMinor: 300_000n });
  });

  it("balans manfiy — reyestrdan ortig'i ortiqcha (manfiydan qarz olinmaydi)", () => {
    expect(plan(800_000n, 500_000n, -400_000n)).toEqual({
      adoptMinor: 0n,
      overpayMinor: 300_000n,
    });
  });

  it("aynan qoldiqqa teng to'lov — chegarada ortiqcha YO'Q", () => {
    expect(plan(1_000_000n, 500_000n, 1_000_000n)).toEqual({
      adoptMinor: 500_000n,
      overpayMinor: 0n,
    });
  });
});
