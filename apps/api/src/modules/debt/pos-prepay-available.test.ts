import { describe, expect, it } from 'vitest';
import { debtPayable, prepayAvailable } from './pos-customer-debt.js';

/**
 * A2 — `prepayAvailable` sof qoidasi (`debtPayable` ning KO'ZGUSI).
 *
 * Kassir ekranidagi «Avansdan» tugmasi va serverning cap tekshiruvi AYNAN
 * shu funksiyadan yuradi. Ikkinchi formula (ekranda `-balanceMinor`) yozilsa
 * bir kun server bilan ayrilardi — POS bo'ylab takrorlangan bug klassi.
 */
describe('prepayAvailable — manfiy balans = mijozning bizdagi puli', () => {
  it('manfiy balans → avans AYNAN uning moduli', () => {
    expect(prepayAvailable(-1_000_000n)).toBe(1_000_000n);
  });

  it('musbat balans (mijoz qarzdor) → avans 0', () => {
    expect(prepayAvailable(500_000n)).toBe(0n);
  });

  it('nol balans → avans 0', () => {
    expect(prepayAvailable(0n)).toBe(0n);
  });

  it('🔴 `null` (O`LCHANMAGAN) → 0, ya`ni yo`q pulni sarflatmaymiz', () => {
    // `debtPayable` da `null` ALOHIDA shox (reyestr qarzini to'lanmaydigan
    // qilib qo'ymaslik uchun). Avansda esa ehtiyotkor tomon 0 — o'lchanmagan
    // balansdan avans sarflash mijozga yo'q pulni ishlatib berardi.
    expect(prepayAvailable(null)).toBe(0n);
  });

  it('🔴 `debtPayable` bilan BIR VAQTDA ikkalasi ham noldan katta bo`lolmaydi', () => {
    // Bitta ustunning ikki tomoni — kassir ekranida ham faqat bittasi
    // ko'rsatiladi (A3 ning `customerStanding` i shu haqiqat ustiga quriladi).
    for (const b of [-1_000_000n, -1n, 0n, 1n, 500_000n]) {
      const payable = debtPayable(b, 0n).payableMinor;
      const prepay = prepayAvailable(b);
      expect(payable > 0n && prepay > 0n).toBe(false);
    }
  });

  it('reyestrda ochiq qarz bo`lsa ham manfiy balansda avans ko`rinadi', () => {
    // Bu — nomuvofiq holat (reyestr > 0, balans < 0). `debtPayable` reyestrni
    // qaytaradi, `prepayAvailable` esa balansni: ikkalasi O'Z daftariga
    // sodiq qoladi va hech biri ikkinchisini jimgina bosmaydi.
    expect(debtPayable(-300_000n, 100_000n).payableMinor).toBe(100_000n);
    expect(prepayAvailable(-300_000n)).toBe(300_000n);
  });
});
