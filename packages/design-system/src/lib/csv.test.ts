import { describe, expect, it } from 'vitest';
import { buildCsv, csvTimestamp, csvToImportRows, detectDelimiter, parseCsv } from './csv.ts';

interface Row {
  name: string;
  amount: string;
}

const cols = [
  { header: 'Name', cellText: (r: Row) => r.name },
  { header: 'Amount', cellText: (r: Row) => r.amount },
];

describe('buildCsv', () => {
  it('produces a header + body joined by CRLF', () => {
    const csv = buildCsv(cols, [
      { name: 'Alice', amount: '100' },
      { name: 'Bob', amount: '200' },
    ]);
    expect(csv).toBe('Name,Amount\r\nAlice,100\r\nBob,200');
  });

  it('escapes fields containing commas', () => {
    const csv = buildCsv(cols, [{ name: 'Smith, John', amount: '100' }]);
    expect(csv).toBe('Name,Amount\r\n"Smith, John",100');
  });

  it('doubles embedded quotes and wraps in quotes', () => {
    const csv = buildCsv(cols, [{ name: 'Say "hi"', amount: '1' }]);
    expect(csv).toBe('Name,Amount\r\n"Say ""hi""",1');
  });

  it('wraps fields containing newlines', () => {
    const csv = buildCsv(cols, [{ name: 'line1\nline2', amount: '1' }]);
    expect(csv).toContain('"line1\nline2"');
  });

  it('handles empty row list (header only)', () => {
    const csv = buildCsv(cols, []);
    expect(csv).toBe('Name,Amount\r\n');
  });
});

describe('detectDelimiter', () => {
  it('defaults to comma', () => {
    expect(detectDelimiter('a,b,c\n1,2,3')).toBe(',');
  });
  it('detects semicolon (RU/UZ Excel)', () => {
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';');
  });
  it('detects tab', () => {
    expect(detectDelimiter('a\tb\tc')).toBe('\t');
  });
  it('ignores delimiters inside quotes when voting', () => {
    expect(detectDelimiter('"a;b;c;d";x')).toBe(';');
  });
});

describe('parseCsv', () => {
  it('parses a simple grid', () => {
    expect(parseCsv('code,qty,price\nA1,2,1000\nB2,3,500')).toEqual([
      ['code', 'qty', 'price'],
      ['A1', '2', '1000'],
      ['B2', '3', '500'],
    ]);
  });

  it('strips a UTF-8 BOM', () => {
    expect(parseCsv('﻿code,qty\nA1,2')).toEqual([
      ['code', 'qty'],
      ['A1', '2'],
    ]);
  });

  it('handles CRLF and a trailing newline', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('keeps delimiters and newlines inside quoted fields', () => {
    expect(parseCsv('name,note\n"Smith, J","line1\nline2"')).toEqual([
      ['name', 'note'],
      ['Smith, J', 'line1\nline2'],
    ]);
  });

  it('unescapes doubled quotes', () => {
    expect(parseCsv('a\n"Say ""hi"""')).toEqual([['a'], ['Say "hi"']]);
  });

  it('parses semicolon-delimited data', () => {
    expect(parseCsv('code;qty\nA1;2')).toEqual([
      ['code', 'qty'],
      ['A1', '2'],
    ]);
  });

  it('drops fully-blank lines and trims cells', () => {
    expect(parseCsv('a, b \n\n 1 ,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('returns [] for empty input', () => {
    expect(parseCsv('')).toEqual([]);
    expect(parseCsv('\n\n')).toEqual([]);
  });
});

describe('csvToImportRows', () => {
  it('maps en header columns (code/quantity/price)', () => {
    const { items, error } = csvToImportRows([
      ['code', 'quantity', 'price'],
      ['A1', '2', '12000'],
      ['B2', '3', ''],
    ]);
    expect(error).toBeUndefined();
    expect(items).toEqual([
      { key: 'A1', quantity: '2', price: '12000' },
      { key: 'B2', quantity: '3', price: undefined },
    ]);
  });

  it('recognises ru/uz header aliases', () => {
    const { items } = csvToImportRows([
      ['Наименование', 'Количество', 'Цена'],
      ['Tovar X', '5', '1000'],
    ]);
    expect(items).toEqual([{ key: 'Tovar X', quantity: '5', price: '1000' }]);
  });

  it('falls back to positional columns when no header is recognised', () => {
    const { items } = csvToImportRows([
      ['A1', '2', '500'],
      ['B2', '1', '700'],
    ]);
    expect(items).toEqual([
      { key: 'A1', quantity: '2', price: '500' },
      { key: 'B2', quantity: '1', price: '700' },
    ]);
  });

  it('defaults quantity to 1 and skips empty-key rows', () => {
    const { items } = csvToImportRows([
      ['code', 'quantity'],
      ['A1', ''],
      ['', '5'],
    ]);
    expect(items).toEqual([{ key: 'A1', quantity: '1', price: undefined }]);
  });

  it('returns an error for empty input', () => {
    expect(csvToImportRows([]).error).toBeTruthy();
  });

  it('returns an error when no usable row exists', () => {
    expect(
      csvToImportRows([
        ['code', 'qty'],
        ['', ''],
      ]).error,
    ).toBeTruthy();
  });
});

describe('csvTimestamp', () => {
  it('returns a YYYY-MM-DD_HH-mm string', () => {
    const ts = csvTimestamp();
    expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}$/);
  });

  it('has no illegal Windows filename characters', () => {
    const ts = csvTimestamp();
    expect(ts).not.toMatch(/[:*?"<>|/\\]/);
  });
});
