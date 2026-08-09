import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compareDecimals, subtractDecimals } from '../shared/decimal.js';

/**
 * Faza Q17 — the return documents were the third copy of two bug-classes
 * Faza 34 closed elsewhere.
 *
 * 1. `STK-12` (available = on-hand − reserved through float). Faza 34 fixed
 *    `customer-order` and `internal-order` and introduced `availableOf()`, but
 *    `sales-return.service.ts` kept `String(Number(onHand) - Number(reserved))`
 *    — which ships `"2.8000000000000003"` to the client.
 *
 * 2. `SALES-10` (remaining-to-return through float). `createFromDemand` /
 *    `createFromSupply` compute `remaining = Number(qty) − alreadyReturned`
 *    and then use `String(remaining)` as the pre-filled quantity. On a fully
 *    returned line the float residue is not 0 but ~5.5e-17, so `String()`
 *    yields `"5.5e-17"` — an EXPONENT literal that is not a valid Decimal —
 *    and a phantom position is created for a line with nothing left.
 */

const SR = readFileSync(join(__dirname, 'sales-return.service.ts'), 'utf8');
const PR = readFileSync(
  join(__dirname, '..', 'purchase-return', 'purchase-return.service.ts'),
  'utf8',
);

describe('returns qty precision (Faza Q17)', () => {
  it('available = on-hand − reserved is exact, not a float artifact', () => {
    // Evidence: the float path invents digits.
    expect(String(3 - 0.2)).toBe('2.8');
    expect(String(3.1 - 0.3)).toBe('2.8000000000000003');
    // The decimal path does not.
    expect(subtractDecimals('3.1', '0.3')).toBe('2.8');
  });

  it('a fully returned line has EXACTLY nothing left (no exponent phantom)', () => {
    const shipped = '0.3';
    const returned = ['0.1', '0.1', '0.1'];

    // Evidence: float leaves a residue that stringifies to an exponent.
    const floatRemaining = returned.reduce((a, q) => a - Number(q), Number(shipped));
    expect(floatRemaining).not.toBe(0);
    expect(String(floatRemaining)).toMatch(/e-/);

    // Exact path: nothing left, and the string is a valid Decimal literal.
    const remaining = returned.reduce((a, q) => subtractDecimals(a, q), shipped);
    expect(remaining).toBe('0');
    expect(compareDecimals(remaining, '0')).toBe(0);
    expect(remaining).not.toMatch(/e-/);
  });

  it('sales-return.service.ts computes availability with the decimal primitives', () => {
    expect(SR).not.toMatch(/String\(Number\(onHand\) - Number\(reserved\)\)/);
    expect(SR).toMatch(/from '\.\.\/shared\/decimal\.js'/);
  });

  it('sales-return createFromDemand has no float remaining/epsilon guard', () => {
    expect(SR).not.toMatch(/Number\(String\(dp\.quantity\)\) - alreadyReturned/);
    expect(SR).not.toMatch(/remaining \+ 1e-7/);
  });

  it('purchase-return createFromSupply has no float remaining/epsilon guard', () => {
    expect(PR).not.toMatch(/Number\(String\(sp\.quantity\)\) - alreadyReturned/);
    expect(PR).not.toMatch(/remaining \+ 1e-7/);
    expect(PR).toMatch(/from '\.\.\/shared\/decimal\.js'/);
  });
});
