import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeLineCost, formatDecimalScaled, parseDecimalScaled } from '../shared/decimal.js';

/**
 * Faza Q17 (Faza 34 DEFER-4) — analitika report aggregates were the last
 * `Number(s.qty)` holdouts in the stock/quantity layer.
 *
 * Faza 34 moved every *writing* path onto exact decimal arithmetic but left
 * the report aggregates alone as "out of scope". They are not harmless: the
 * partner analysis screen sums thousands of Decimal(20,6) rows through
 * `number` (`cur.qty += Number(r.quantity)`) and, worse, prices each of them
 * with `BigInt(Math.round(q * Number(r.priceMinor)))` — float money.
 *
 * These tests pin the arithmetic the services must use. They deliberately
 * measure the float error FIRST (Faza 34 style) so the assertion below is not
 * a tautology.
 */

/** Source without comments — a doc-comment mentioning the old form is not code. */
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const ANALYSIS = stripComments(readFileSync(join(__dirname, 'analysis.service.ts'), 'utf8'));
const COUNT = stripComments(readFileSync(join(__dirname, 'count.service.ts'), 'utf8'));

describe('analitika qty aggregates — exact, not float (Faza Q17)', () => {
  it('summing fractional quantities drifts through number but not through micro-bigint', () => {
    const rows = ['0.1', '0.1', '0.1'];

    // Evidence: the float path does NOT land on 0.3.
    const floatSum = rows.reduce((a, q) => a + Number(q), 0);
    expect(floatSum).not.toBe(0.3);
    expect(String(floatSum)).toBe('0.30000000000000004');

    // The micro-bigint path is exact.
    const microSum = rows.reduce((a, q) => a + parseDecimalScaled(q), 0n);
    expect(microSum).toBe(300_000n);
    expect(formatDecimalScaled(microSum)).toBe('0.3');
    expect(Number(formatDecimalScaled(microSum))).toBe(0.3);
  });

  it('line value is exact tiyin, not round(qty × Number(priceMinor))', () => {
    // 1.005 units at 100 tiyin/unit. The exact product is 100.5 tiyin, which
    // half-up rounds to 101. Float multiplies to 100.49999999999999 and lands
    // on the WRONG side of the boundary — the report undercharges by a tiyin.
    expect(1.005 * 100).toBe(100.49999999999999);
    expect(Math.round(1.005 * 100)).toBe(100);
    expect(computeLineCost('1.005', 100n)).toBe(101n);
  });

  it('quantities beyond 2^53 micro-units survive the aggregate', () => {
    const huge = '9999999999.999999';
    expect(String(Number(huge))).not.toBe(huge); // float cannot hold it
    expect(formatDecimalScaled(parseDecimalScaled(huge))).toBe(huge);
  });

  it('analysis.service.ts no longer builds aggregates through Number()', () => {
    expect(ANALYSIS).not.toMatch(/Number\(s\.qty\)/);
    expect(ANALYSIS).not.toMatch(/Number\(r\.quantity\)/);
    expect(ANALYSIS).not.toMatch(/BigInt\(Math\.round\(q \* Number\(/);
    expect(ANALYSIS).toMatch(/from '\.\.\/shared\/decimal\.js'/);
  });

  it('count.service.ts no longer reads stock qty through Number()', () => {
    expect(COUNT).not.toMatch(/Number\(s\.qty\)/);
    expect(COUNT).not.toMatch(/Number\(stock\.qty\)/);
    expect(COUNT).toMatch(/from '\.\.\/shared\/decimal\.js'/);
  });
});
