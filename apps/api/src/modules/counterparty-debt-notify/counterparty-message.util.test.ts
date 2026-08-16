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

describe('chek mazmuni — do`kon nomi, tovarlar, to`lov taqsimoti, havola', () => {
  const sale = {
    ...base,
    source: 'retailsale' as const,
    deltaMinor: 100_000_00n, // qarzga yozilgan qism
    newBalanceMinor: 690_899_400n,
    docNumber: 'CHK-2026-00042',
    docMoment: new Date('2026-08-16T06:02:00Z'),
    orgName: "SHERSET ELEKTRO TOVAR DO'KONI",
  };

  it('do`kon nomi eng tepada, mijoz nomidan oldin', () => {
    const t = buildCounterpartyMessage(sale) as string;
    expect(t.split('\n')[0]).toBe("SHERSET ELEKTRO TOVAR DO'KONI");
    expect(t.split('\n')[1]).toBe('Hurmatli Akme,');
  });

  it('tovarlardan 3 tasi chiqadi, qolgani «va yana N tur»', () => {
    const t = buildCounterpartyMessage({
      ...sale,
      items: [
        { name: 'Kabel VVG 3x2.5', quantity: '100', uom: 'm' },
        { name: 'Avtomat IEK 25A', quantity: '4', uom: 'dona' },
        { name: 'Rozetka Schneider', quantity: '10', uom: 'dona' },
        { name: 'Vilka', quantity: '2', uom: 'dona' },
        { name: 'Lenta', quantity: '5', uom: null },
      ],
    }) as string;
    expect(t).toContain('• Kabel VVG 3x2.5 — 100 m');
    expect(t).toContain('• Avtomat IEK 25A — 4 dona');
    expect(t).toContain('• Rozetka Schneider — 10 dona');
    expect(t).not.toContain('Vilka');
    expect(t).toContain('• va yana 2 tur');
  });

  it('uchtadan kam tovar bo`lsa «va yana» qatori chiqmaydi', () => {
    const t = buildCounterpartyMessage({
      ...sale,
      items: [{ name: 'Kabel', quantity: '1', uom: 'm' }],
    }) as string;
    expect(t).toContain('• Kabel — 1 m');
    expect(t).not.toContain('va yana');
  });

  it("to'lov taqsimoti: naqd va qarzga yozilgan qism alohida qator", () => {
    const t = buildCounterpartyMessage({
      ...sale,
      paidMinor: 70_000_00n,
      debtMinor: 100_000_00n,
    }) as string;
    expect(t).toContain("💵 To'landi: 70 000 so'm");
    expect(t).toContain("📝 Qarzga yozildi: 100 000 so'm");
  });

  it("to'liq to'langan chekda «Qarzga yozildi» qatori chiqmaydi", () => {
    const t = buildCounterpartyMessage({
      ...sale,
      paidMinor: 170_000_00n,
      debtMinor: 0n,
    }) as string;
    expect(t).toContain("💵 To'landi: 170 000 so'm");
    expect(t).not.toContain('Qarzga yozildi');
  });

  it('chek havolasi oxirgi qator bo`lib chiqadi', () => {
    const t = buildCounterpartyMessage({
      ...sale,
      receiptUrl: 'https://erp.sherset.uz/p/abc123',
    }) as string;
    expect(t.split('\n').at(-1)).toBe('🧾 Chek: https://erp.sherset.uz/p/abc123');
  });

  it('yangi maydonlarning HECH BIRI yo`q bo`lsa — eski qisqa matn chiqadi', () => {
    const t = buildCounterpartyMessage({ ...base, source: 'retailsale' }) as string;
    expect(t).not.toContain('🧾');
    expect(t).not.toContain('•');
    expect(t).not.toContain("💵 To'landi");
    expect(t.split('\n')[0]).toBe('Hurmatli Akme,');
  });

  it('MINUS balans mijozga hech qachon ko`rsatilmaydi', () => {
    const t = buildCounterpartyMessage({
      ...sale,
      newBalanceMinor: -690_899_400n,
    }) as string;
    expect(t).not.toContain('-6 908 994');
    expect(t).toContain('💰 Sizga qarzimiz: 6 908 994 so`m'.replace(/`/g, "'"));
  });
});

describe("mavjud matnlar o'zgarmadi (regressiya qulfi)", () => {
  it('invoiceOut aynan eski satr', () => {
    expect(buildCounterpartyMessage({ ...base, source: 'invoiceOut' })).toBe(
      "Hurmatli Akme,\n📄 Sotuv\n🛒 Qarzga qo'shildi: +10 000 so'm\n━━━━━━━━━━━━\n💰 Jami qarzingiz: 50 000 so'm",
    );
  });
});
