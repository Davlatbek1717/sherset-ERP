import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compareDecimals } from '../shared/decimal.js';

/**
 * Faza Q4 (18c qoldig'i) — `SupplyPosition.remainingQty` is DEAD for COGS.
 *
 * Faza 18a retired the FIFO lot walk: nothing decrements `remainingQty` any
 * more (the only writer left is `reverseLegacyFifo`, which INCREMENTS it while
 * unwinding a pre-18a demand). Two things followed from that, both fixed here:
 *
 *  1. post() wrote the lot size through a FLOAT round-trip
 *     (`String(Number(String(p.quantity)))`) — the `STK-08` class. A
 *     Decimal(20,6) carries up to 20 significant digits; a double carries 17,
 *     so the stored lot size could silently differ from the received quantity.
 *  2. The unpost/cancel guard compared the two Decimals through `Number()`
 *     as well — a float compare deciding whether a document may be reversed.
 *
 * The guard itself is KEPT (see supply.service.ts): for lots received BEFORE
 * 18a the stored `remaining_qty` is still the real, decremented FIFO residue,
 * and it is the only signal that those goods were already shipped. It is now
 * an exact decimal comparison instead of a float one.
 */

const SERVICE = readFileSync(join(__dirname, 'supply.service.ts'), 'utf8');
const STRIPPED = SERVICE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('remainingQty is written exactly (STK-08 class)', () => {
  it('the float round-trip is measurably lossy on a Decimal(20,6)', () => {
    const quantity = '99999999999999.999999';
    expect(String(Number(quantity))).not.toBe(quantity);
  });

  it('post() stores the received quantity verbatim — no Number() round-trip', () => {
    expect(STRIPPED).not.toMatch(/remainingQty: String\(Number\(/);
    expect(STRIPPED).toMatch(/remainingQty: String\(p\.quantity\)/);
  });

  it('nothing in supply decrements the lot — the FIFO consumer is gone (18a)', () => {
    expect(STRIPPED).not.toMatch(/remainingQty: \{ decrement/);
    expect(STRIPPED).not.toMatch(/consumeFifo/);
  });
});

describe('the partial-consumption guard compares decimals, not floats', () => {
  it('unpost() and cancel() both guard through compareDecimals', () => {
    const sites =
      STRIPPED.match(/compareDecimals\(String\(p\.remainingQty\), String\(p\.quantity\)\) < 0/g) ??
      [];
    expect(sites.length).toBe(2);
    expect(STRIPPED).not.toMatch(/Number\(String\(p\.remainingQty\)\)/);
  });

  it('the comparison it replaces is exact where the float one is not', () => {
    // A pre-18a lot of 0.3 that FIFO drew 0.1 + 0.2 from: consumed in full, so
    // the guard MUST fire. 0.1 + 0.2 !== 0.3 in binary floating point.
    expect(0.1 + 0.2 - 0.3).not.toBe(0);
    expect(compareDecimals('0.3', '0.3')).toBe(0);
    expect(compareDecimals('0.299999', '0.3')).toBeLessThan(0);
    // and past 2^53 micro-units, where Number() collapses both sides to the
    // same double and the guard would wave a consumed lot through:
    expect(Number('99999999999999.999998')).toBe(Number('99999999999999.999999'));
    expect(compareDecimals('99999999999999.999998', '99999999999999.999999')).toBeLessThan(0);
  });
});
