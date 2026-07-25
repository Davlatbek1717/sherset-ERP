import { describe, expect, it } from 'vitest';
import { type DebtMessageContext, buildDebtMessage } from './debt-notify.util.js';

// Amounts are tiyin (×100): 1_000_000n = 10 000 so'm, 5_000_000n = 50 000 so'm.
const base: DebtMessageContext = {
  name: 'Akme',
  currency: 'UZS',
  deltaMinor: 1_000_000n,
  newBalanceMinor: 5_000_000n,
  source: 'invoiceIn',
};

describe('buildDebtMessage — owner report (title + delta + total)', () => {
  it('invoiceIn → 📥 Kirim; total says the counterparty owes us', () => {
    const t = buildDebtMessage({ ...base, source: 'invoiceIn' });
    expect(t).toBe(
      "📄 *Kirim (xarid)*\n👤 «Akme»\n📥 Qarzga tovar olindi: *10 000 so'm*\n💰 Jami: «Akme» bizga 50 000 so'm qarzdor",
    );
  });

  it('invoiceOut → 📤 Sotuv title + amount + who', () => {
    const t = buildDebtMessage({ ...base, source: 'invoiceOut' });
    expect(t).toContain('📄 *Sotuv*');
    expect(t).toContain('👤 «Akme»');
    expect(t).toContain('📤 Qarzga sotildi:');
  });

  it("paymentOut → 💸 Biz to'ladik + 'biz qarzdormiz' when balance negative", () => {
    const t = buildDebtMessage({
      ...base,
      source: 'paymentOut',
      deltaMinor: 2_000_000n,
      newBalanceMinor: -3_000_000n,
    });
    expect(t).toBe(
      "📄 *To'lov (chiqim)*\n👤 «Akme»\n💸 Biz to'ladik: *20 000 so'm*\n💰 Jami: biz «Akme»ga 30 000 so'm qarzdormiz",
    );
  });

  it("paymentIn → 💵 Kontragent to'ladi", () => {
    const t = buildDebtMessage({ ...base, source: 'paymentIn', newBalanceMinor: 1_000_000n });
    expect(t).toContain("💵 Kontragent to'ladi:");
    expect(t).toContain("«Akme» bizga 10 000 so'm qarzdor");
  });

  it('cashIn / cashOut share the payment headers', () => {
    expect(buildDebtMessage({ ...base, source: 'cashIn' })).toContain("💵 Kontragent to'ladi:");
    expect(buildDebtMessage({ ...base, source: 'cashOut' })).toContain("💸 Biz to'ladik:");
  });

  it('newBalance 0 → settled total line', () => {
    const t = buildDebtMessage({ ...base, source: 'paymentIn', newBalanceMinor: 0n });
    expect(t).toContain('💰 Jami: hisob teng');
  });

  it('docNumber + docMoment → header carries date and number', () => {
    const t = buildDebtMessage({
      ...base,
      source: 'invoiceOut',
      docNumber: 'СЧ-2026-00123',
      docMoment: new Date('2026-07-25T10:00:00Z'),
    });
    expect(t).toContain('📄 *Sotuv* — 25.07.2026 · №СЧ-2026-00123');
  });

  it('missing docNumber/docMoment → header omits those parts (no dangling separators)', () => {
    const t = buildDebtMessage({ ...base, source: 'invoiceOut' });
    expect(t?.split('\n')[0]).toBe('📄 *Sotuv*');
  });

  it('overThreshold → appends ⚠️ warning', () => {
    const t = buildDebtMessage({ ...base, source: 'invoiceIn', overThreshold: true });
    expect(t).toContain('⚠️ Diqqat');
  });

  it('unknown source → null (no alert on reversals/adjustments)', () => {
    expect(buildDebtMessage({ ...base, source: 'adjustment' as never })).toBeNull();
  });

  it('negative delta rendered as absolute', () => {
    const t = buildDebtMessage({ ...base, source: 'invoiceIn', deltaMinor: -1_000_000n });
    expect(t).toContain("10 000 so'm");
    expect(t).not.toContain('-10 000');
  });

  it('non-UZS currency uses ISO code', () => {
    const t = buildDebtMessage({ ...base, source: 'invoiceOut', currency: 'USD' });
    expect(t).toContain('10 000 USD');
  });
});
