import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { computeHoldAfterShipment, remainingToShip } from './customer-order.service.js';

/**
 * Faza 34 / SALES-10 — the CustomerOrder shipment/reserve cascade in exact
 * Decimal(20,6), not float.
 *
 * Before: `Number(pos.shippedQty) + sign * shipQty`,
 * `Math.max(0, Number(pos.quantity) - shippedAfter)`, `Number(pos.reservedQty)`,
 * `Number(d.qtyDelta) * sign` — all feeding Decimal(20,6) columns
 * (`reservedQty`, `shippedQty`) and a `want > remaining` cap check that raises
 * a 400 on a fully-shipped order.
 */
describe('remainingToShip (SALES-10)', () => {
  it('is exact where float subtraction is not', () => {
    expect(String(0.3 - 0.1)).toBe('0.19999999999999998');
    expect(remainingToShip('0.300000', '0.100000')).toBe('0.2');
  });

  it('does not invent a residue on a FULLY shipped line', () => {
    // Three 0.1 shipments against a 0.3 line. Float leaves 5.5e-17 behind,
    // so «Отгрузить» offers a phantom line and the order never auto-flips
    // to fully_shipped.
    const floatRemaining = 0.3 - (0.1 + 0.1 + 0.1);
    expect(floatRemaining).not.toBe(0);
    expect(remainingToShip('0.3', '0.3')).toBe('0');
  });

  it('never goes negative (over-shipped line)', () => {
    expect(remainingToShip('5', '7')).toBe('0');
  });

  it('rejects only a genuine over-ship, not a float artefact', () => {
    // want === remaining must NOT raise; the float path compared
    // 0.2 > 0.19999999999999998 and threw a 400 on a legitimate shipment.
    expect(remainingToShip('0.3', '0.1')).toBe('0.2');
  });
});

describe('computeHoldAfterShipment (SALES-10)', () => {
  it('releases the hold exactly on ship', () => {
    const { desired, delta } = computeHoldAfterShipment({
      quantity: '1',
      shippedQty: '0',
      reservedQty: '0.300000',
      shipQty: '0.100000',
      direction: 'ship',
      orderApplicable: true,
    });
    expect(desired).toBe('0.2'); // float: 0.19999999999999998
    expect(delta).toBe('-0.1');
  });

  it('re-holds the unshipped remainder on revert of a posted order', () => {
    const { desired, delta } = computeHoldAfterShipment({
      quantity: '10',
      shippedQty: '4',
      reservedQty: '2',
      shipQty: '4',
      direction: 'revert',
      orderApplicable: true,
    });
    // shippedAfter 0 ⇒ remaining 10; hold + ship = 6, capped by remaining.
    expect(desired).toBe('6');
    expect(delta).toBe('4');
  });

  it('an unposted order only shrinks its hold to the remainder on revert', () => {
    const { desired, delta } = computeHoldAfterShipment({
      quantity: '10',
      shippedQty: '9',
      reservedQty: '5',
      shipQty: '1',
      direction: 'revert',
      orderApplicable: false,
    });
    // shippedAfter 8 ⇒ remaining 2; min(currentHold 5, 2).
    expect(desired).toBe('2');
    expect(delta).toBe('-3');
  });

  it('never releases below zero', () => {
    const { desired, delta } = computeHoldAfterShipment({
      quantity: '5',
      shippedQty: '0',
      reservedQty: '1',
      shipQty: '3',
      direction: 'ship',
      orderApplicable: true,
    });
    expect(desired).toBe('0');
    expect(delta).toBe('-1');
  });

  it('caps the re-hold at the remaining quantity', () => {
    const { desired } = computeHoldAfterShipment({
      quantity: '5',
      shippedQty: '5',
      reservedQty: '0',
      shipQty: '1',
      direction: 'revert',
      orderApplicable: true,
    });
    // shippedAfter 4 ⇒ remaining 1; hold + ship = 1 ⇒ 1.
    expect(desired).toBe('1');
  });
});

describe('SALES-10 source-scan — no float left in the cascade', () => {
  const src = readFileSync(
    fileURLToPath(new URL('./customer-order.service.ts', import.meta.url)),
    'utf8',
  );
  const demandSrc = readFileSync(
    fileURLToPath(new URL('../demand/demand.service.ts', import.meta.url)),
    'utf8',
  );

  it('customer-order no longer floats shippedQty / reservedQty', () => {
    expect(src).not.toMatch(/Number\(pos\.shippedQty\)/);
    expect(src).not.toMatch(/Number\(pos\.reservedQty\)/);
    expect(src).not.toMatch(/Number\(p\.reservedQty\)/);
    expect(src).not.toMatch(/Number\(d\.qtyDelta\)/);
    expect(src).not.toMatch(/Number\(ex\.shippedQty\)/);
  });

  it('demand no longer floats the createFromCustomerOrder cap', () => {
    expect(demandSrc).not.toMatch(/Number\(String\(cop\.quantity\)\)/);
    expect(demandSrc).toMatch(/remainingToShip/);
  });
});
