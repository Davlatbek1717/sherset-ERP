import { describe, expect, it } from 'vitest';
import { type RawDoc, computeStatement } from './statement-compute.util.js';

const d = (
  iso: string,
  docType: RawDoc['docType'],
  sumMinor: bigint,
  items: RawDoc['items'] = [],
): RawDoc => ({ moment: new Date(iso), docType, docNumber: 'X', sumMinor, items });

describe('computeStatement', () => {
  it('empty → all zeros', () => {
    const r = computeStatement([]);
    expect(r.lines).toEqual([]);
    expect(r.finalBalanceMinor).toBe(0n);
    expect(r.turnoverMinor).toBe(0n);
  });

  it('single sale → they owe us (debit, positive balance)', () => {
    const r = computeStatement([d('2026-07-01', 'invoiceOut', 100n)]);
    expect(r.lines[0]?.debitMinor).toBe(100n);
    expect(r.lines[0]?.creditMinor).toBe(0n);
    expect(r.lines[0]?.runningBalanceMinor).toBe(100n);
    expect(r.finalBalanceMinor).toBe(100n);
  });

  it('sale then partial payment → remaining debt', () => {
    const r = computeStatement([
      d('2026-07-01', 'invoiceOut', 100n),
      d('2026-07-02', 'cashIn', 60n),
    ]);
    expect(r.lines[1]?.runningBalanceMinor).toBe(40n);
    expect(r.finalBalanceMinor).toBe(40n); // they owe us 40
    expect(r.totalDebitMinor).toBe(100n);
    expect(r.totalCreditMinor).toBe(60n);
    expect(r.turnoverMinor).toBe(160n);
  });

  it('purchase → we owe them (credit, negative balance)', () => {
    const r = computeStatement([d('2026-07-01', 'invoiceIn', 50n)]);
    expect(r.lines[0]?.side).toBe('credit');
    expect(r.finalBalanceMinor).toBe(-50n); // we owe them 50
  });

  it('sorts by moment regardless of input order', () => {
    const r = computeStatement([
      d('2026-07-03', 'cashIn', 30n),
      d('2026-07-01', 'invoiceOut', 100n),
      d('2026-07-02', 'invoiceOut', 20n),
    ]);
    expect(r.lines.map((l) => l.docType)).toEqual(['invoiceOut', 'invoiceOut', 'cashIn']);
    expect(r.lines.map((l) => l.runningBalanceMinor)).toEqual([100n, 120n, 90n]);
    expect(r.finalBalanceMinor).toBe(90n);
  });

  it('mixed full cycle settles to zero', () => {
    const r = computeStatement([
      d('2026-07-01', 'invoiceOut', 100n),
      d('2026-07-02', 'invoiceIn', 40n),
      d('2026-07-03', 'cashIn', 100n),
      d('2026-07-04', 'cashOut', 40n),
    ]);
    // 100 (debit) - 40 (credit) - 100 (credit) + 40 (debit) = 0
    expect(r.finalBalanceMinor).toBe(0n);
    expect(r.turnoverMinor).toBe(280n);
  });

  it('cashOut/paymentOut count as debit; negative sums are abs-valued', () => {
    const r = computeStatement([d('2026-07-01', 'paymentOut', -25n)]);
    expect(r.lines[0]?.side).toBe('debit');
    expect(r.lines[0]?.debitMinor).toBe(25n);
    expect(r.finalBalanceMinor).toBe(25n);
  });
});

/**
 * 2026-07-28 — akt-sverkaga QO'SHILGAN 5 tur. Ular `applyDelta` ni chaqiradi,
 * ya'ni materiallashgan saldoni harakatlantiradi, lekin aktda yo'q edi: akt
 * yakuniy qoldig'i haqiqiy saldodan farq qilib, mijozga noto'g'ri «qarzingiz»
 * raqami ketardi. Ishoralar `recompute-counterparty-balances.ts` bilan bir xil.
 */
describe('computeStatement — balansni harakatlantiruvchi qolgan hujjatlar', () => {
  it("avans olindi → KREDIT (biz ularga qarzdor bo'lamiz)", () => {
    const r = computeStatement([d('2026-07-01', 'prepayment', 500n)]);
    expect(r.lines[0].side).toBe('credit');
    expect(r.finalBalanceMinor).toBe(-500n);
  });

  it('avans qaytarildi → DEBET (qarzimiz kamayadi)', () => {
    const r = computeStatement([d('2026-07-01', 'prepaymentReturn', 500n)]);
    expect(r.lines[0].side).toBe('debit');
    expect(r.finalBalanceMinor).toBe(500n);
  });

  it('korrektirovka INCREASE → DEBET, DECREASE → KREDIT', () => {
    const inc = computeStatement([d('2026-07-01', 'adjustmentIncrease', 300n)]);
    const dec = computeStatement([d('2026-07-01', 'adjustmentDecrease', 300n)]);
    expect(inc.finalBalanceMinor).toBe(300n);
    expect(dec.finalBalanceMinor).toBe(-300n);
  });

  it("qarz kartochkasi to'lovi → KREDIT (mijoz pul berdi)", () => {
    const r = computeStatement([d('2026-07-01', 'debtPayment', 250n)]);
    expect(r.lines[0].side).toBe('credit');
    expect(r.finalBalanceMinor).toBe(-250n);
  });

  it('qabul (supply) → KREDIT — yetkazib beruvchiga qarzimiz oshadi', () => {
    const r = computeStatement([d('2026-07-01', 'supply', 4_500_000n)]);
    expect(r.lines[0].side).toBe('credit');
    expect(r.finalBalanceMinor).toBe(-4_500_000n);
  });

  it("to'liq aralash tsikl — barcha 12 tur birga nolga keladi", () => {
    const r = computeStatement([
      d('2026-07-01', 'invoiceOut', 1000n), // +1000
      d('2026-07-02', 'invoiceIn', 200n), //  -200
      d('2026-07-03', 'supply', 300n), //     -300
      d('2026-07-04', 'cashOut', 100n), //    +100
      d('2026-07-05', 'cashIn', 150n), //     -150
      d('2026-07-06', 'paymentOut', 250n), // +250
      d('2026-07-07', 'paymentIn', 400n), //  -400
      d('2026-07-08', 'prepayment', 500n), // -500
      d('2026-07-09', 'prepaymentReturn', 500n), // +500
      d('2026-07-10', 'adjustmentIncrease', 200n), // +200
      d('2026-07-11', 'adjustmentDecrease', 300n), // -300
      d('2026-07-12', 'debtPayment', 700n), // -700
    ]);
    // +1000 -200 -300 +100 -150 +250 -400 -500 +500 +200 -300 -700 = -500
    expect(r.finalBalanceMinor).toBe(-500n);
    expect(r.lines).toHaveLength(12);
  });
});
