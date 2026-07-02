/**
 * list-footer.ts money-correctness tests — the pinned «Итого» footer must
 * NEVER sum unlike currencies and must compute derived totals (Не оплачено)
 * in BigInt so a large filtered set cannot drift. These are the invariants
 * the live grid relies on; guarded here as pure logic (no DB, no jsdom).
 */
import { describe, expect, it } from 'vitest';
import { formatMoney } from './format';
import { footerMoneyCells, subtractMinor } from './list-footer';

const COLS = {
  sum: '6346301023',
  invoicedSum: '0',
  payedSum: '2864958910',
  shippedSum: '4596025823',
} as const;

describe('footerMoneyCells', () => {
  it('shows «…» in EVERY cell while totals have not loaded (null / undefined)', () => {
    for (const totals of [null, undefined]) {
      const row = footerMoneyCells(totals, COLS);
      expect(Object.values(row)).toEqual(['…', '…', '…', '…']);
    }
  });

  it('shows «—» in EVERY cell when the filtered set mixes ≥2 currencies (never sums USD+UZS)', () => {
    const row = footerMoneyCells({ currencies: ['UZS', 'USD'] }, COLS);
    expect(Object.values(row)).toEqual(['—', '—', '—', '—']);
    // three currencies → still guarded
    expect(Object.values(footerMoneyCells({ currencies: ['UZS', 'USD', 'EUR'] }, COLS))).toEqual([
      '—',
      '—',
      '—',
      '—',
    ]);
  });

  it('formats each cell in the single shared currency, with no trailing symbol', () => {
    const row = footerMoneyCells({ currencies: ['UZS'] }, COLS);
    // wiring: each key formatted via formatMoney in the resolved currency
    expect(row.sum).toBe(formatMoney(COLS.sum, 'UZS', { displayAs: 'none' }));
    expect(row.payedSum).toBe(formatMoney(COLS.payedSum, 'UZS', { displayAs: 'none' }));
    expect(row.invoicedSum).toBe(formatMoney('0', 'UZS', { displayAs: 'none' }));
    // no currency code / symbol leaks into the cell
    expect(row.sum).not.toMatch(/UZS|сум|so'm|\$/i);
  });

  it('uses the document currency (not a hardcoded base) when the set is all-USD', () => {
    const row = footerMoneyCells({ currencies: ['USD'] }, { sum: '1270000000000' });
    expect(row.sum).toBe(formatMoney('1270000000000', 'USD', { displayAs: 'none' }));
  });

  it('falls back to UZS when currencies is empty or absent (empty result set)', () => {
    expect(footerMoneyCells({ currencies: [] }, { sum: '0' }).sum).toBe(
      formatMoney('0', 'UZS', { displayAs: 'none' }),
    );
    expect(footerMoneyCells({}, { sum: '500' }).sum).toBe(
      formatMoney('500', 'UZS', { displayAs: 'none' }),
    );
  });

  it('only emits the keys it was given (column set drives the footer)', () => {
    const row = footerMoneyCells({ currencies: ['UZS'] }, { balance: '600000' });
    expect(Object.keys(row)).toEqual(['balance']);
  });
});

describe('subtractMinor', () => {
  it('computes Не оплачено = Σsum − Σpayed exactly in BigInt', () => {
    expect(subtractMinor('6346301023', '2864958910')).toBe('3481342113');
  });

  it('does not drift on amounts beyond Number.MAX_SAFE_INTEGER', () => {
    // 90 071 992 547 409 920 minor units > 2^53 — float subtraction would lose
    // the last digits; BigInt keeps them.
    expect(subtractMinor('90071992547409920', '1')).toBe('90071992547409919');
  });

  it('returns a negative string when payed exceeds sum (overpaid)', () => {
    expect(subtractMinor('100', '250')).toBe('-150');
  });
});
