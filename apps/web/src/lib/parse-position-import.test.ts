import { describe, expect, it } from 'vitest';
import { parsePositionImport } from './parse-position-import.js';

describe('parsePositionImport', () => {
  it('parses comma CSV with a header line', () => {
    const r = parsePositionImport('Kod,Miqdor\nA100,5\nB200,3');
    expect(r.rows).toEqual([
      { identifier: 'A100', quantity: 5 },
      { identifier: 'B200', quantity: 3 },
    ]);
    expect(r.skipped).toBe(0);
  });

  it('accepts semicolon and tab delimiters (per line)', () => {
    const r = parsePositionImport('A100;5\nB200\t3');
    expect(r.rows).toEqual([
      { identifier: 'A100', quantity: 5 },
      { identifier: 'B200', quantity: 3 },
    ]);
  });

  it('accepts a decimal comma quantity', () => {
    const r = parsePositionImport('A100;2,5');
    expect(r.rows).toEqual([{ identifier: 'A100', quantity: 2.5 }]);
  });

  it('skips (and counts) malformed data lines, not the header', () => {
    const r = parsePositionImport('Kod,Miqdor\nA100,5\nBROKEN\nB200,0\nC300,2');
    expect(r.rows).toEqual([
      { identifier: 'A100', quantity: 5 },
      { identifier: 'C300', quantity: 2 },
    ]);
    expect(r.skipped).toBe(2); // 'BROKEN' (no qty) + 'B200,0' (qty ≤ 0)
  });

  it('handles CRLF and blank lines', () => {
    const r = parsePositionImport('A100,5\r\n\r\nB200,3\r\n');
    expect(r.rows).toHaveLength(2);
    expect(r.skipped).toBe(0);
  });

  it('never throws on empty / whitespace input', () => {
    expect(parsePositionImport('')).toEqual({ rows: [], skipped: 0 });
    expect(parsePositionImport('   \n  \n')).toEqual({ rows: [], skipped: 0 });
  });

  it('negative and zero quantities are rejected', () => {
    const r = parsePositionImport('A100,-3\nB200,0\nC300,4');
    expect(r.rows).toEqual([{ identifier: 'C300', quantity: 4 }]);
    // first line malformed ⇒ treated as header (silent); B200 counted.
    expect(r.skipped).toBe(1);
  });

  it('identifier with spaces (product name) is preserved', () => {
    const r = parsePositionImport('Avtomatik klapan 1/2;10');
    expect(r.rows).toEqual([{ identifier: 'Avtomatik klapan 1/2', quantity: 10 }]);
  });
});
