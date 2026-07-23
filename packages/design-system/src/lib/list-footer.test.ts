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

  it('mixed set + base values → shows the BASE-UZS converted sum, NOT «—» (moysklad parity)', () => {
    // LIVE-GROUND 2026-06-28 #invoicein: 1 150,80 USD @ rate 12 300 = 14 154 840,00
    // + 327 000,00 сум = footer 14 481 840,00 (base tiyin = 1 448 184 000).
    const row = footerMoneyCells(
      { currencies: ['UZS', 'USD'] },
      { sum: '0', paid: '0', received: '0' },
      { baseValuesMinor: { sum: '1448184000', paid: '0', received: '135700000' } },
    );
    expect(row.sum).toBe(formatMoney('1448184000', 'UZS', { displayAs: 'none' }));
    expect(row.received).toBe(formatMoney('135700000', 'UZS', { displayAs: 'none' }));
    expect(row.sum).not.toBe('—');
    // the grounded headline number renders intact (separator = any non-digit,
    // formatMoney uses a non-breaking/narrow space for thousands grouping)
    expect(row.sum).toMatch(/14\D?481\D?840/);
  });

  it('respects an explicit baseCurrency for the converted total', () => {
    const row = footerMoneyCells(
      { currencies: ['USD', 'EUR'] },
      { sum: '0' },
      { baseValuesMinor: { sum: '1000000' }, baseCurrency: 'USD' },
    );
    expect(row.sum).toBe(formatMoney('1000000', 'USD', { displayAs: 'none' }));
  });

  it('mixed set WITHOUT base values still shows «—» (backward-compatible guard)', () => {
    const row = footerMoneyCells({ currencies: ['UZS', 'USD'] }, { sum: '5', paid: '5' });
    expect(Object.values(row)).toEqual(['—', '—']);
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
