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
