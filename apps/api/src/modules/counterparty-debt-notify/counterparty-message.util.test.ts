import { describe, expect, it } from 'vitest';
import {
  type CounterpartyMessageContext,
  buildCounterpartyMessage,
} from './counterparty-message.util.js';

const base: CounterpartyMessageContext = {
  name: 'Akme',
  currency: 'UZS',
  deltaMinor: 1_000_000n, // 10 000 so'm
  newBalanceMinor: 5_000_000n, // 50 000 so'm
  source: 'invoiceOut',
};

describe('buildCounterpartyMessage — counterparty report (delta + total)', () => {
  it('invoiceOut → sale report; total says they owe us', () => {
    const t = buildCounterpartyMessage({ ...base, source: 'invoiceOut' });
    expect(t).toBe(
      "Hurmatli Akme,\n📄 Sotuv\n🛒 Qarzga qo'shildi: +10 000 so'm\n━━━━━━━━━━━━\n💰 Jami qarzingiz: 50 000 so'm",
    );
  });

  it('paymentIn → payment receipt + remaining debt (delta abs-valued)', () => {
    const t = buildCounterpartyMessage({
      ...base,
      source: 'paymentIn',
      deltaMinor: -2_000_000n,
      newBalanceMinor: 3_000_000n,
    });
    expect(t).toContain("✅ To'lovingiz qabul qilindi: 20 000 so'm");
    expect(t).toContain("💰 Qolgan qarzingiz: 30 000 so'm");
  });

  it('paymentIn acknowledged even at zero balance', () => {
    const t = buildCounterpartyMessage({
      ...base,
      source: 'paymentIn',
      deltaMinor: -5_000_000n,
      newBalanceMinor: 0n,
    });
    expect(t).toContain("To'lovingiz qabul qilindi");
    expect(t).toContain('Hisob teng');
  });

  it('cashIn routes to the payment report too', () => {
    expect(buildCounterpartyMessage({ ...base, source: 'cashIn' })).toContain(
      "To'lovingiz qabul qilindi",
    );
  });

  it('positive balance (non-payment) → they-owe-us total', () => {
    expect(buildCounterpartyMessage({ ...base, source: 'invoiceOut' })).toContain(
      '💰 Jami qarzingiz:',
    );
  });

  it('negative balance (non-payment) → we-owe-them total', () => {
    expect(
      buildCounterpartyMessage({ ...base, source: 'paymentOut', newBalanceMinor: -1_000_000n }),
    ).toContain("💰 Sizga qarzimiz: 10 000 so'm — tez orada to'lanadi");
  });

  it('non-payment change landing on zero → null', () => {
    expect(
      buildCounterpartyMessage({ ...base, source: 'invoiceOut', newBalanceMinor: 0n }),
    ).toBeNull();
  });

  it('docNumber + docMoment → header carries date and number', () => {
    const t = buildCounterpartyMessage({
      ...base,
      source: 'invoiceOut',
      docNumber: 'СЧ-2026-00123',
      docMoment: new Date('2026-07-25T10:00:00Z'),
    });
    expect(t).toContain('📄 Sotuv — 25.07.2026, №СЧ-2026-00123');
  });

  it('unknown source → null', () => {
    expect(buildCounterpartyMessage({ ...base, source: 'adjustment' as never })).toBeNull();
  });

  it('non-UZS currency renders the ISO code instead of "so\'m"', () => {
    const t = buildCounterpartyMessage({
      ...base,
      source: 'invoiceOut',
      currency: 'USD',
      newBalanceMinor: 100_00n,
    });
    expect(t).toContain('100 USD');
    expect(t).not.toContain("so'm");
  });
});

describe('kassa oqimi — yangi manba turlari', () => {
  it('retailsale, delta>0 → kassada qarzga savdo', () => {
    const t = buildCounterpartyMessage({
      ...base,
      source: 'retailsale',
      deltaMinor: 1_000_000n,
      newBalanceMinor: 5_000_000n,
    });
    expect(t).toContain('📄 Kassa savdosi');
    expect(t).toContain("🛒 Qarzga qo'shildi: +10 000 so'm");
    expect(t).toContain("💰 Jami qarzingiz: 50 000 so'm");
  });

  it("debtpayment, delta<0 → qarz to'lovi, qoldiq ko'rsatiladi", () => {
    const t = buildCounterpartyMessage({
      ...base,
      source: 'debtpayment',
      deltaMinor: -2_000_000n,
      newBalanceMinor: 3_000_000n,
    });
    expect(t).toContain("📄 Qarz to'lovi");
    expect(t).toContain("✅ To'lovingiz qabul qilindi: 20 000 so'm");
    expect(t).toContain("💰 Qolgan qarzingiz: 30 000 so'm");
  });

  it('debtpayment qarzni NOLGA tushirsa ham xabar beriladi', () => {
    const t = buildCounterpartyMessage({
      ...base,
      source: 'debtpayment',
      deltaMinor: -5_000_000n,
      newBalanceMinor: 0n,
    });
    expect(t).not.toBeNull();
    expect(t).toContain("💰 Hisob teng — qarzingiz yo'q");
  });

  it("debt, delta>0 → qo'lda ochilgan qarz", () => {
    const t = buildCounterpartyMessage({
      ...base,
      source: 'debt',
      deltaMinor: 1_000_000n,
      newBalanceMinor: 1_000_000n,
    });
    expect(t).toContain('📄 Qarz');
    expect(t).toContain("🛒 Qarzga qo'shildi: +10 000 so'm");
  });

  it('TUZATISH: retailsale, delta<0 → qaytarish, qarz kamayadi', () => {
    const t = buildCounterpartyMessage({
      ...base,
      source: 'retailsale',
      deltaMinor: -1_000_000n,
      newBalanceMinor: 4_000_000n,
    });
    expect(t).toContain('📄 Qaytarish');
    expect(t).toContain("↩️ Qarzingizdan ayirildi: 10 000 so'm");
    expect(t).toContain("💰 Qolgan qarzingiz: 40 000 so'm");
  });

  it('TUZATISH nolga tushsa ham xabar beriladi (jim qolmaydi)', () => {
    const t = buildCounterpartyMessage({
      ...base,
      source: 'debt',
      deltaMinor: -5_000_000n,
      newBalanceMinor: 0n,
    });
    expect(t).not.toBeNull();
    expect(t).toContain("💰 Hisob teng — qarzingiz yo'q");
  });
});

describe("mavjud matnlar o'zgarmadi (regressiya qulfi)", () => {
  it('invoiceOut aynan eski satr', () => {
    expect(buildCounterpartyMessage({ ...base, source: 'invoiceOut' })).toBe(
      "Hurmatli Akme,\n📄 Sotuv\n🛒 Qarzga qo'shildi: +10 000 so'm\n━━━━━━━━━━━━\n💰 Jami qarzingiz: 50 000 so'm",
    );
  });
});
