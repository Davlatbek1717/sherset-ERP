import { describe, expect, it } from 'vitest';
import {
  type DebtMessageContext,
  buildDebtIncreasedText,
  buildDebtMessage,
  buildPaymentInText,
  buildPaymentOutText,
} from './debt-notify.util.js';

const base: DebtMessageContext = {
  name: 'Akme',
  currency: 'UZS',
  deltaMinor: 1_000_000n, // 10 000 so'm
  newBalanceMinor: 5_000_000n, // 50 000 so'm
  source: 'invoiceIn',
};

describe('debt-notify.util', () => {
  it('buildDebtIncreasedText: 🔴 + abs delta + source label + total', () => {
    const text = buildDebtIncreasedText({ ...base, source: 'invoiceIn' });
    expect(text).toBe("🔴 *Qarz oshdi* — Akmega +10 000 so'm (kirim). Umumiy qarz: 50 000 so'm");
  });

  it('buildDebtIncreasedText: invoiceOut → "sotuv" label', () => {
    const text = buildDebtIncreasedText({ ...base, source: 'invoiceOut' });
    expect(text).toContain('(sotuv)');
  });

  it('buildPaymentOutText: 🟢 we paid the counterparty', () => {
    const text = buildPaymentOutText({
      ...base,
      source: 'paymentOut',
      deltaMinor: 2_000_000n,
      newBalanceMinor: 3_000_000n,
    });
    expect(text).toBe("🟢 *To'lov* — Akmega 20 000 so'm to'ladingiz. Qolgan: 30 000 so'm");
  });

  it('buildPaymentInText: 🔵 counterparty paid us', () => {
    const text = buildPaymentInText({
      ...base,
      source: 'paymentIn',
      deltaMinor: -2_000_000n, // sign is stripped to abs in the message
      newBalanceMinor: 1_000_000n,
    });
    expect(text).toBe("🔵 *Kontragent to'ladi* — Akme 20 000 so'm. Qolgan: 10 000 so'm");
  });

  it('abs() applied: negative delta rendered without a leading minus', () => {
    const text = buildDebtIncreasedText({ ...base, deltaMinor: -1_000_000n });
    expect(text).toContain("+10 000 so'm");
    expect(text).not.toContain('+-');
  });

  it('non-UZS currency: renders the ISO code instead of "so\'m"', () => {
    const text = buildPaymentInText({
      ...base,
      source: 'paymentIn',
      currency: 'USD',
      deltaMinor: -100_00n,
      newBalanceMinor: 0n,
    });
    expect(text).toContain('100 USD');
    expect(text).not.toContain("so'm");
  });

  it('overThreshold: appends the ⚠️ warning line', () => {
    const text = buildDebtIncreasedText({ ...base, overThreshold: true });
    expect(text).toContain('⚠️ Diqqat');
    expect(text.split('\n')).toHaveLength(2);
  });

  it('escapes Markdown-significant characters in the name', () => {
    const text = buildDebtIncreasedText({ ...base, name: 'A_B*C' });
    expect(text).toContain('A\\_B\\*C');
  });

  it('buildDebtMessage: routes each source to its builder', () => {
    expect(buildDebtMessage({ ...base, source: 'invoiceIn' })).toContain('Qarz oshdi');
    expect(buildDebtMessage({ ...base, source: 'invoiceOut' })).toContain('Qarz oshdi');
    expect(buildDebtMessage({ ...base, source: 'paymentOut' })).toContain("To'lov");
    expect(buildDebtMessage({ ...base, source: 'cashOut' })).toContain("To'lov");
    expect(buildDebtMessage({ ...base, source: 'paymentIn' })).toContain('Kontragent');
    expect(buildDebtMessage({ ...base, source: 'cashIn' })).toContain('Kontragent');
  });

  it('buildDebtMessage: unknown source → null (no owner alert)', () => {
    expect(buildDebtMessage({ ...base, source: 'weird' as never })).toBeNull();
  });
});
