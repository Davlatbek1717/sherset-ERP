import { describe, expect, it } from 'vitest';
import { parseBankStatementCsv } from './csv-parser.js';

/**
 * Typed row accessor — under `noUncheckedIndexedAccess` `rows[i]` is
 * `T | undefined`. This fails with a clear message instead of a cryptic
 * `undefined.x`, and removes the need for non-null assertions in asserts.
 */
function row<T>(rows: T[], i: number): T {
  const r = rows[i];
  if (r === undefined) throw new Error(`expected a parsed row at index ${i}`);
  return r;
}

describe('parseBankStatementCsv', () => {
  it('parses a minimal valid statement', () => {
    const csv = [
      'date,amount,direction,counterparty_inn,counterparty_name,payment_purpose',
      '2026-04-24,1234567.89,in,123456789,"Alpha LLC",Оплата по счету №1',
      '24.04.2026,500000,out,987654321,Beta LLC,Оплата за товар',
    ].join('\n');
    const { rows } = parseBankStatementCsv(csv);
    expect(rows).toHaveLength(2);
    expect(row(rows, 0).direction).toBe('in');
    expect(row(rows, 0).amountMinor).toBe(123456789n);
    expect(row(rows, 0).counterpartyInn).toBe('123456789');
    expect(row(rows, 0).error).toBeNull();

    expect(row(rows, 1).direction).toBe('out');
    expect(row(rows, 1).amountMinor).toBe(50_000_000n);
  });

  it('strips BOM + accepts Russian headers', () => {
    const csv =
      '\uFEFFдата,сумма,направление,инн,наименование,назначение\n2026-04-24,100,приход,111,X,Test';
    const { rows } = parseBankStatementCsv(csv);
    expect(rows).toHaveLength(1);
    expect(row(rows, 0).direction).toBe('in');
    expect(row(rows, 0).counterpartyInn).toBe('111');
  });

  it('infers direction from negative amount sign when direction column absent', () => {
    const csv = ['date,amount,counterparty_name', '2026-04-24,-1000,X'].join('\n');
    const { rows } = parseBankStatementCsv(csv);
    expect(row(rows, 0).direction).toBe('out');
    expect(row(rows, 0).amountMinor).toBe(100_000n);
  });

  it('handles quoted fields containing commas', () => {
    const csv = [
      'date,amount,direction,payment_purpose',
      '2026-04-24,100,in,"Purpose, with comma"',
    ].join('\n');
    const { rows } = parseBankStatementCsv(csv);
    expect(row(rows, 0).paymentPurpose).toBe('Purpose, with comma');
  });

  it('records per-row errors without aborting the batch', () => {
    const csv = [
      'date,amount,direction',
      'garbage,100,in',
      '2026-04-24,not-a-number,in',
      '2026-04-24,100,in',
    ].join('\n');
    const { rows } = parseBankStatementCsv(csv);
    expect(rows).toHaveLength(3);
    expect(row(rows, 0).error).toMatch(/invalid date/);
    expect(row(rows, 1).error).toMatch(/invalid amount/);
    expect(row(rows, 2).error).toBeNull();
  });

  it('accepts semicolon delimiter (Russian locale default)', () => {
    const csv = ['date;amount;direction', '2026-04-24;100;in'].join('\n');
    const { rows } = parseBankStatementCsv(csv);
    expect(row(rows, 0).amountMinor).toBe(10000n);
    expect(row(rows, 0).direction).toBe('in');
  });

  it('parses dd.mm.yyyy date format', () => {
    const csv = ['date,amount,direction', '24.04.2026,100,in'].join('\n');
    const { rows } = parseBankStatementCsv(csv);
    expect(row(rows, 0).moment.getUTCFullYear()).toBe(2026);
    expect(row(rows, 0).moment.getUTCMonth()).toBe(3); // April
    expect(row(rows, 0).moment.getUTCDate()).toBe(24);
  });

  it('accepts comma as decimal separator + thousands spaces', () => {
    const csv = ['date,amount,direction', '"2026-04-24","1 234 567,89",in'].join('\n');
    const { rows } = parseBankStatementCsv(csv);
    expect(row(rows, 0).amountMinor).toBe(123456789n);
  });

  it('returns empty rows for empty content', () => {
    const { rows } = parseBankStatementCsv('');
    expect(rows).toHaveLength(0);
  });
});
