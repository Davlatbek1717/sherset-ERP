import { describe, expect, it } from 'vitest';
import { TENDER, computeTenders, legacyTotals } from './retail-tenders.js';

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
});
