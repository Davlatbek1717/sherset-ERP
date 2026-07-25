import { describe, expect, it } from 'vitest';
import {
  type CounterpartyMessageContext,
  buildCounterpartyMessage,
  buildCounterpartyOwesUsText,
  buildCounterpartyPaymentText,
  buildWeOweCounterpartyText,
} from './counterparty-message.util.js';

const base: CounterpartyMessageContext = {
  name: 'Akme',
  currency: 'UZS',
  deltaMinor: 1_000_000n, // 10 000 so'm
  newBalanceMinor: 5_000_000n, // 50 000 so'm
  source: 'invoiceOut',
};

describe('counterparty-message.util', () => {
  it('buildCounterpartyOwesUsText: they owe us → "Sherset\'ga … qarzingiz bor"', () => {
    const text = buildCounterpartyOwesUsText(base);
    expect(text).toBe("Hurmatli Akme, Sherset'ga 50 000 so'm qarzingiz bor.");
  });

  it('buildWeOweCounterpartyText: we owe them → "Sherset sizga … qarzdor"', () => {
    const text = buildWeOweCounterpartyText({ ...base, newBalanceMinor: -3_000_000n });
    expect(text).toBe("Hurmatli Akme, Sherset sizga 30 000 so'm qarzdor — tez orada to'lanadi.");
  });

  it('buildCounterpartyPaymentText: acknowledges payment + remaining debt', () => {
    const text = buildCounterpartyPaymentText({
      ...base,
      source: 'paymentIn',
      deltaMinor: -2_000_000n, // sign stripped to abs
      newBalanceMinor: 3_000_000n,
    });
    expect(text).toBe(
      "Hurmatli Akme, to'lovingiz qabul qilindi: 20 000 so'm. Qolgan qarz: 30 000 so'm.",
    );
  });

  it('buildCounterpartyMessage: paymentIn → payment receipt (even at zero balance)', () => {
    const text = buildCounterpartyMessage({
      ...base,
      source: 'paymentIn',
      deltaMinor: -5_000_000n,
      newBalanceMinor: 0n,
    });
    expect(text).toContain("to'lovingiz qabul qilindi");
    expect(text).toContain("Qolgan qarz: 0 so'm");
  });

  it('buildCounterpartyMessage: cashIn routes to the payment receipt too', () => {
    expect(buildCounterpartyMessage({ ...base, source: 'cashIn' })).toContain(
      "to'lovingiz qabul qilindi",
    );
  });

  it('buildCounterpartyMessage: positive balance (non-payment) → they-owe-us', () => {
    expect(buildCounterpartyMessage({ ...base, source: 'invoiceOut' })).toContain('qarzingiz bor');
  });

  it('buildCounterpartyMessage: negative balance (non-payment) → we-owe-them', () => {
    expect(
      buildCounterpartyMessage({ ...base, source: 'paymentOut', newBalanceMinor: -1_000_000n }),
    ).toContain('Sherset sizga');
  });

  it('buildCounterpartyMessage: non-payment change landing on zero → null', () => {
    expect(
      buildCounterpartyMessage({ ...base, source: 'invoiceOut', newBalanceMinor: 0n }),
    ).toBeNull();
  });

  it('non-UZS currency renders the ISO code instead of "so\'m"', () => {
    const text = buildCounterpartyOwesUsText({
      ...base,
      currency: 'USD',
      newBalanceMinor: 100_00n,
    });
    expect(text).toContain('100 USD');
    expect(text).not.toContain("so'm");
  });
});
