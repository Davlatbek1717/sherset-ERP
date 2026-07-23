import { describe, expect, it } from 'vitest';
import { CODE128_PATTERNS, code128Values, code128Widths } from './code128';

/**
 * Vendoring guard for the hand-transcribed Code 128 symbol table (a single
 * wrong digit = an unscannable label, invisible to tsc/lint). Locks the
 * symbology's structural invariants + the published checksum vector.
 */
describe('code128 vendored table + encoder', () => {
  it('table passes the Code 128 structural invariants (107 unique, 11/13 modules, even bar modules)', () => {
    expect(CODE128_PATTERNS).toHaveLength(107);
    expect(new Set(CODE128_PATTERNS).size).toBe(107);
    CODE128_PATTERNS.forEach((p, v) => {
      const d = [...p].map(Number);
      expect(d.length, `value ${v} width count`).toBe(v === 106 ? 7 : 6);
      const sum = d.reduce((a, b) => a + b, 0);
      expect(sum, `value ${v} modules`).toBe(v === 106 ? 13 : 11);
      const bars = d.filter((_, i) => i % 2 === 0).reduce((a, b) => a + b, 0);
      expect(bars % 2, `value ${v} bar parity`).toBe(0);
      expect(Math.max(...d), `value ${v} max width`).toBeLessThanOrEqual(4);
    });
  });

  it('reproduces the published worked example: Code B "Wikipedia" → check symbol 88', () => {
    const values = code128Values('Wikipedia');
    expect(values).not.toBeNull();
    expect(values?.[0]).toBe(104); // Start B
    expect(values?.[values.length - 2]).toBe(88); // published check symbol
    expect(values?.[values.length - 1]).toBe(106); // Stop
  });

  it('uses compact Code C for even-length digit strings (generated cell barcodes)', () => {
    const values = code128Values('01020304');
    expect(values?.slice(0, 5)).toEqual([105, 1, 2, 3, 4]);
  });

  it('encodes «01-02-03-04» in Code B and round-trips through an independent decoder', () => {
    const text = '01-02-03-04';
    const widths = code128Widths(text);
    expect(widths).not.toBeNull();
    if (!widths) return;
    // independent decode: regroup widths 6-at-a-time → look up symbol values
    const byPattern = new Map(CODE128_PATTERNS.map((p, v) => [p, v]));
    const symbols: number[] = [];
    for (let i = 0; i + 6 <= widths.length; i += 6) {
      const chunk =
        widths.length - i === 7 ? widths.slice(i, i + 7) : widths.slice(i, i + 6);
      const v = byPattern.get(chunk.join(''));
      expect(v, `symbol at width offset ${i}`).toBeDefined();
      symbols.push(v as number);
      if (chunk.length === 7) break;
    }
    expect(symbols[0]).toBe(104);
    expect(symbols[symbols.length - 1]).toBe(106);
    const decoded = symbols
      .slice(1, -2)
      .map((v) => String.fromCharCode(v + 32))
      .join('');
    expect(decoded).toBe(text);
    // checksum verifies
    let sum = symbols[0] as number;
    symbols.slice(1, -2).forEach((v, i) => {
      sum += (i + 1) * v;
    });
    expect(sum % 103).toBe(symbols[symbols.length - 2]);
  });

  it('rejects non-printable input instead of silently mis-encoding', () => {
    expect(code128Values('')).toBeNull();
    expect(code128Values('ячейка')).toBeNull(); // Cyrillic outside Code B range
  });
});
