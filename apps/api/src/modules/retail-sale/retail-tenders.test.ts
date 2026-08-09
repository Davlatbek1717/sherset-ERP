import { describe, expect, it } from 'vitest';
import {
  TENDER,
  computeTenders,
  legacyTotals,
  lineBaseMinor,
  lineCurrency,
} from './retail-tenders.js';

/**
 * Kassa TZ §6 — aralash to'lov.
 *
 * Birinchi test aynan PRODDAGI buzuqlikni qulflaydi: terminal orqali to'langan
 * chek serverga «0 to'landi» bo'lib yetardi va 400 olardi. Kassir terminal
 * bilan to'lagan mijozning chekini rasmiylashtira olmasdi.
 */

const TOTAL = 100_000n;
const base = {
  cashMinor: 0n,
  cardMinor: 0n,
  terminalMinor: 0n,
  debtMinor: 0n,
  totalMinor: TOTAL,
};

describe('computeTenders — to`rt tur', () => {
  it('TERMINAL bilan to`liq to`lov QABUL QILINADI (prodda 400 berardi)', () => {
    const r = computeTenders({ ...base, terminalMinor: TOTAL });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.paidMinor).toBe(TOTAL);
    expect(r.changeMinor).toBe(0n);
    expect(r.lines).toEqual([{ method: TENDER.terminal, amountMinor: TOTAL }]);
  });

  it('aralash: naqd + karta + terminal', () => {
    const r = computeTenders({
      ...base,
      cashMinor: 50_000n,
      cardMinor: 30_000n,
      terminalMinor: 20_000n,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.paidMinor).toBe(TOTAL);
    expect(r.lines.map((l) => l.method)).toEqual([TENDER.cashUzs, TENDER.card, TENDER.terminal]);
  });

  it('nol summali turlar qator YARATMAYDI', () => {
    const r = computeTenders({ ...base, cashMinor: TOTAL });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lines).toHaveLength(1);
  });

  it('kam to`lov rad etiladi', () => {
    const r = computeTenders({ ...base, cashMinor: 99_999n });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('insufficient');
  });

  it('manfiy summa rad etiladi (Zod yuqorida tekshiradi — bu himoya qatlami)', () => {
    const r = computeTenders({ ...base, cashMinor: -1n });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('negative-input');
  });
});

describe('computeTenders — qaytim faqat naqddan (TZ §6.2)', () => {
  it('naqd ortiqcha berilsa qaytim hisoblanadi', () => {
    const r = computeTenders({ ...base, cashMinor: 120_000n });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.changeMinor).toBe(20_000n);
  });

  it('KARTA ortiqcha o`tkazilsa BLOKLANADI', () => {
    // Aks holda kassa mijozga bank pulidan naqd qaytim berib, o'z kassasidan
    // pul yo'qotardi. Bu — pul yo'qotish yo'li, «qulaylik» emas.
    const r = computeTenders({ ...base, cardMinor: 120_000n });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('change-exceeds-cash');
  });

  it('qaytim naqddan KO`P bo`lsa bloklanadi (aralashda ham)', () => {
    // naqd 10 000 + terminal 120 000 = 130 000; qaytim 30 000 > naqd 10 000.
    const r = computeTenders({ ...base, cashMinor: 10_000n, terminalMinor: 120_000n });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('change-exceeds-cash');
  });

  it('qaytim naqdga TENG bo`lsa o`tadi (chegara holati)', () => {
    const r = computeTenders({ ...base, cashMinor: 20_000n, terminalMinor: 100_000n });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.changeMinor).toBe(20_000n);
  });
});

describe('computeTenders — qarz (TZ §7.1)', () => {
  it('to`liq qarzga sotuv: pul 0, qarz jamiga teng', () => {
    const r = computeTenders({ ...base, debtMinor: TOTAL });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.paidMinor).toBe(0n);
    expect(r.changeMinor).toBe(0n);
    expect(r.lines).toEqual([{ method: TENDER.debt, amountMinor: TOTAL }]);
  });

  it('qisman qarz: naqd + qarz = jami', () => {
    const r = computeTenders({ ...base, cashMinor: 40_000n, debtMinor: 60_000n });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.paidMinor).toBe(40_000n);
    expect(r.lines.map((l) => l.method)).toEqual([TENDER.cashUzs, TENDER.debt]);
  });

  it('qarzli chekda ARIFMETIKA aniq bo`lishi shart — kam bo`lsa rad', () => {
    const r = computeTenders({ ...base, cashMinor: 30_000n, debtMinor: 60_000n });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('insufficient');
  });

  it('qarzli chekda ORTIQCHA ham rad etiladi', () => {
    // «Ko'proq to'lab, qolganini qarzga yozish» ma'nosiz: qarz summasi bilan
    // haqiqiy qoldiq mos kelmay qolardi va mijoz balansiga noto'g'ri raqam
    // tushardi.
    const r = computeTenders({ ...base, cashMinor: 60_000n, debtMinor: 60_000n });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('debt-overpaid');
  });

  it('qarzli chekda qaytim BO`LMAYDI', () => {
    const r = computeTenders({ ...base, cashMinor: 40_000n, debtMinor: 60_000n });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.changeMinor).toBe(0n);
  });
});

describe('computeTenders — aniqlik', () => {
  it('2^53 dan katta summalarda ham aniq (Float bu yerda sinardi)', () => {
    const big = 9_007_199_254_740_993n; // 2^53 + 1
    const r = computeTenders({
      cashMinor: big,
      cardMinor: big,
      terminalMinor: 0n,
      debtMinor: 0n,
      totalMinor: big * 2n,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.paidMinor).toBe(big * 2n);
    expect(r.changeMinor).toBe(0n);
  });
});

/**
 * MK31 — `CASH_USD` (kassa TZ §6.2).
 *
 * Kurs KANONIK ×10^8 masshtabda (DB-01, Faza 16) va chekka MUZLATILADI.
 * $10,00 = 1 000 sent; kurs 12 450,27 so'm = 1_245_027_000_000.
 * base = sent × kurs / 10^8 = 1 000 × 1_245_027_000_000 / 10^8 = 12 450 270 tiyin.
 */
const USD_RATE_E8 = 1_245_027_000_000n; // 12 450,27 so'm
const TEN_USD_CENTS = 1_000n;
const TEN_USD_IN_TIYIN = 12_450_270n;

describe('computeTenders — CASH_USD (TZ §6.2)', () => {
  it('dollar naqd to`liq to`lov: qator USD sentda, base so`mda', () => {
    const r = computeTenders({
      ...base,
      totalMinor: TEN_USD_IN_TIYIN,
      cashUsdMinor: TEN_USD_CENTS,
      usdRateE8: USD_RATE_E8,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // To'langan summa DOIM hisob valyutasida (so'm) — jami bilan shu solishtiriladi.
    expect(r.paidMinor).toBe(TEN_USD_IN_TIYIN);
    expect(r.changeMinor).toBe(0n);
    expect(r.lines).toEqual([
      {
        method: TENDER.cashUsd,
        // ASL summa sentda qoladi: kassadagi dollar sanog'i shu birlikda
        // yuritiladi (§8.4 — USD farqi so'mga o'girilmaydi).
        amountMinor: TEN_USD_CENTS,
        currency: 'USD',
        rateMinor: USD_RATE_E8,
        amountBaseMinor: TEN_USD_IN_TIYIN,
      },
    ]);
  });

  it('KURSSIZ dollar to`lov BLOKLANADI (jim 1:1 qabul qilish taqiqlanadi)', () => {
    // Kurs berilmasa sentni tiyin deb olish 12 450× xato bo'lardi va chek
    // «to'liq to'landi» bo'lib yopilardi.
    const r = computeTenders({ ...base, cashUsdMinor: TEN_USD_CENTS });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('usd-rate-missing');
  });

  it('kurs 0 yoki manfiy — ham BLOKLANADI', () => {
    for (const bad of [0n, -1n]) {
      const r = computeTenders({ ...base, cashUsdMinor: TEN_USD_CENTS, usdRateE8: bad });
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.reason).toBe('usd-rate-missing');
    }
  });

  it('dollar BERILMASA kurs ham talab qilinmaydi (regressiya yo`q)', () => {
    const r = computeTenders({ ...base, cashMinor: TOTAL, cashUsdMinor: 0n });
    expect(r.ok).toBe(true);
  });

  it('dollar naqddan QAYTIM so`mda beriladi', () => {
    // Mijoz $10 berdi, tovar 10 000 so'm — qaytim so'mda chiqadi. Dollar ham
    // NAQD: qaytimni bloklash kassani ishlatib bo'lmas holga keltirardi.
    const r = computeTenders({
      ...base,
      totalMinor: 10_000n,
      cashUsdMinor: TEN_USD_CENTS,
      usdRateE8: USD_RATE_E8,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.changeMinor).toBe(TEN_USD_IN_TIYIN - 10_000n);
  });

  it('qaytim NAQD (so`m + dollar) yig`indisidan oshsa bloklanadi', () => {
    // Terminal ortiqcha o'tkazilgan — qaytim baribir faqat naqddan.
    const r = computeTenders({
      ...base,
      totalMinor: 10_000n,
      terminalMinor: 100_000n,
      cashUsdMinor: 100n, // $1 = 12 450,27 tiyin
      usdRateE8: USD_RATE_E8,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('change-exceeds-cash');
  });

  it('manfiy dollar rad etiladi', () => {
    const r = computeTenders({ ...base, cashUsdMinor: -1n, usdRateE8: USD_RATE_E8 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('negative-input');
  });

  it('aralash: so`m naqd + dollar naqd + karta', () => {
    const r = computeTenders({
      ...base,
      totalMinor: TEN_USD_IN_TIYIN + 50_000n,
      cashMinor: 20_000n,
      cardMinor: 30_000n,
      cashUsdMinor: TEN_USD_CENTS,
      usdRateE8: USD_RATE_E8,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lines.map((l) => l.method)).toEqual([TENDER.cashUzs, TENDER.cashUsd, TENDER.card]);
    expect(r.paidMinor).toBe(TEN_USD_IN_TIYIN + 50_000n);
  });
});

describe('tender qatorining valyutasi — yagona o`quvchi', () => {
  it('so`m qatorida valyuta UZS, base = summaning o`zi', () => {
    // Eski qatorlar `currency`/`amountBaseMinor` YOZMAYDI (shakl o'zgarmadi).
    // Har chaqiruvchi `?? 'UZS'` ni qo'lda takrorlasa, biri jimgina eskirardi.
    const l = { method: TENDER.cashUzs, amountMinor: 500n };
    expect(lineCurrency(l)).toBe('UZS');
    expect(lineBaseMinor(l)).toBe(500n);
  });

  it('dollar qatorida valyuta USD, base — so`mdagi ekvivalent', () => {
    const l = {
      method: TENDER.cashUsd,
      amountMinor: TEN_USD_CENTS,
      currency: 'USD' as const,
      rateMinor: USD_RATE_E8,
      amountBaseMinor: TEN_USD_IN_TIYIN,
    };
    expect(lineCurrency(l)).toBe('USD');
    expect(lineBaseMinor(l)).toBe(TEN_USD_IN_TIYIN);
  });
});

describe('legacyTotals — orqaga moslik (TZ §6.3)', () => {
  it('terminal `card` yig`indisiga qo`shiladi (ikkalasi ham naqdsiz)', () => {
    const t = legacyTotals([
      { method: TENDER.cashUzs, amountMinor: 10n },
      { method: TENDER.card, amountMinor: 20n },
      { method: TENDER.terminal, amountMinor: 30n },
    ]);
    expect(t).toEqual({ cashAmountMinor: 10n, cardAmountMinor: 50n });
  });

  it('QARZ hech qaysi ustunga tushmaydi — u pul EMAS', () => {
    // Qarz `cardAmountMinor`ga qo'shilsa, eski hisobotlar olinmagan pulni
    // tushum deb ko'rsatardi.
    const t = legacyTotals([{ method: TENDER.debt, amountMinor: 100n }]);
    expect(t).toEqual({ cashAmountMinor: 0n, cardAmountMinor: 0n });
  });

  it('CASH_USD `cashAmountMinor` ga TUSHMAYDI — u ustun SO`M semantikasida', () => {
    // MK31: `cashAmountMinor` ni to'rtta jonli o'quvchi so'mdagi naqd deb
    // o'qiydi (smena kutilgan naqdi, POS pul xulosasi). Dollarning so'mdagi
    // ekvivalentini shu yerga qo'shsak, kutilgan naqd o'sha summacha oshib,
    // AYNAN shu faza tuzatayotgan soxta ortiqcha qaytib kelardi. Dollar
    // oqimi `RetailSalePayment` qatorlaridan o'qiladi.
    const t = legacyTotals([
      { method: TENDER.cashUzs, amountMinor: 10n },
      {
        method: TENDER.cashUsd,
        amountMinor: TEN_USD_CENTS,
        currency: 'USD',
        rateMinor: USD_RATE_E8,
        amountBaseMinor: TEN_USD_IN_TIYIN,
      },
    ]);
    expect(t).toEqual({ cashAmountMinor: 10n, cardAmountMinor: 0n });
  });
});
