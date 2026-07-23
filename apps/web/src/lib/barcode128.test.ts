/**
 * Code 128 table + encoder integrity locks. The width table is data — a
 * single mistyped digit silently yields unscannable bars, so every
 * structural invariant of ISO/IEC 15417 is asserted here:
 *   - 107 symbols (0–102 data, 103–105 starts, 106 stop)
 *   - data/start symbols: 6 elements, 11 modules, 3 bars + 3 spaces
 *   - stop symbol: 7 elements, 13 modules
 *   - all patterns unique
 * plus end-to-end structure and the checksum rule for a real cell code.
 */
import { describe, expect, it } from 'vitest';
import { CODE128_PATTERNS, code128Modules, encodeCode128B } from './barcode128';

describe('CODE128_PATTERNS table integrity', () => {
  it('has exactly 107 symbols', () => {
    expect(CODE128_PATTERNS).toHaveLength(107);
  });

  it('symbols 0-105 are 6 elements summing to 11 modules', () => {
    for (let v = 0; v <= 105; v++) {
      const p = CODE128_PATTERNS[v] as string;
      expect(p, `symbol ${v}`).toMatch(/^[1-4]{6}$/);
      const sum = [...p].reduce((a, d) => a + Number(d), 0);
      expect(sum, `symbol ${v} width sum`).toBe(11);
    }
  });

  it('stop symbol is 7 elements summing to 13 modules', () => {
    const stop = CODE128_PATTERNS[106] as string;
    expect(stop).toMatch(/^[1-4]{7}$/);
    expect([...stop].reduce((a, d) => a + Number(d), 0)).toBe(13);
  });

  it('all patterns are unique', () => {
    expect(new Set(CODE128_PATTERNS).size).toBe(CODE128_PATTERNS.length);
  });

  it('every symbol has EVEN bar parity (ISO 15417 self-checking property)', () => {
    // Independent invariant: in every Code 128 symbol the BLACK modules
    // (elements 0, 2, 4…) sum to an even number. Catches transposition
    // typos that keep the total width at 11.
    for (let v = 0; v < CODE128_PATTERNS.length; v++) {
      const p = CODE128_PATTERNS[v] as string;
      let dark = 0;
      for (let i = 0; i < p.length; i += 2) dark += Number(p[i]);
      expect(dark % 2, `symbol ${v} bar parity`).toBe(0);
    }
  });
});

describe('encodeCode128B', () => {
  it('encodes the shop cell code «01-02-03-04» with the correct structure', () => {
    const value = '01-02-03-04';
    const widths = encodeCode128B(value);
    // start + 11 data + checksum → 6 elements each, stop → 7 elements.
    expect(widths).toHaveLength((1 + value.length + 1) * 6 + 7);
    // Total modules: 11 per symbol + 13 for stop.
    expect(code128Modules(widths)).toBe((1 + value.length + 1) * 11 + 13);
    // Odd count → starts AND ends with a bar (valid Code 128 framing).
    expect(widths.length % 2).toBe(1);
  });

  it('applies the mod-103 checksum over position-weighted values', () => {
    // Independent hand computation for «AB»: values A=33, B=34;
    // checksum = (104 + 33*1 + 34*2) % 103 = 205 % 103 = 102.
    const widths = encodeCode128B('AB');
    const symbols: string[] = [];
    let i = 0;
    while (i < widths.length - 7) {
      symbols.push(widths.slice(i, i + 6).join(''));
      i += 6;
    }
    expect(symbols[0]).toBe(CODE128_PATTERNS[104]); // Start B
    expect(symbols[1]).toBe(CODE128_PATTERNS[33]); // A
    expect(symbols[2]).toBe(CODE128_PATTERNS[34]); // B
    expect(symbols[3]).toBe(CODE128_PATTERNS[102]); // checksum
    expect(widths.slice(-7).join('')).toBe(CODE128_PATTERNS[106]); // Stop
  });

  it('rejects characters outside ASCII 32-126', () => {
    expect(() => encodeCode128B('Ценник')).toThrow(/unsupported/);
  });
});
