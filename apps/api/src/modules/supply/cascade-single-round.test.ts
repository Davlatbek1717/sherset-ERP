import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Class-lock for the receivedSum / shippedSum cascade single-round unification
 * (2026-06-13, follow-up to `b1eae7be`).
 *
 * `b1eae7be` routed the 8 doc header `computeTotals` through the shared
 * `computePositionTotal` (single round-half-up), but LEFT the two cascade
 * aggregates — PurchaseOrder.receivedSumMinor (fed by Supply / PurchaseReturn)
 * and CustomerOrder.shippedSumMinor (fed by Demand / SalesReturn) — on the
 * legacy double-round idiom
 *
 *   const lineGrossMinor = scaleMinorByQty(price, qty);          // round 1
 *   const afterDiscount  = (lineGrossMinor * round((100-disc)*100)) / 10000n; // round 2
 *   valueMinor = afterDiscount + (afterDiscount * vat) / 100n;   // round 3
 *
 * so the displayed received/shipped total could drift ±1 tiyin from the header
 * sumMinor on discounted/VAT lines — a fully-received PO could show
 * receivedSum ≠ sumMinor. (Completion STATE is qty-based, so this was a display
 * inconsistency, not a state bug.) All five cascade producers now compute the
 * line value via the SAME `computePositionTotal`, so a fully-received PO /
 * fully-shipped CO has receivedSum / shippedSum exactly equal to sumMinor.
 *
 * The per-unit FIFO COST basis (supply.service.ts `priceAfterDiscOf`, operand
 * `p.priceMinor * round(...)`) is a SEPARATE concern (inventory valuation) and
 * is deliberately untouched — hence the marker below is the cascade-only
 * `lineGrossMinor`/`shippedGrossMinor` operands, not every `Math.round((100-`.
 *
 * Non-vacuous: before the fix every file below contained
 * `lineGrossMinor`/`shippedGrossMinor` and did not call computePositionTotal in
 * these cascade regions, so each assertion would have failed.
 */

const D = join(__dirname, '..');
const read = (rel: string) =>
  readFileSync(join(D, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

const CASCADE_FILES = [
  'customer-order/customer-order.service.ts',
  'supply/supply.service.ts',
  'purchase-return/purchase-return.service.ts',
] as const;

describe('receivedSum/shippedSum cascades are single-rounded via computePositionTotal', () => {
  it('no cascade still builds the line via the double-round lineGross/shippedGross idiom', () => {
    const offenders = CASCADE_FILES.filter((f) =>
      /(lineGrossMinor|shippedGrossMinor)/.test(read(f)),
    );
    expect(offenders).toEqual([]);
  });

  it('CustomerOrder.applyShipment accumulates the shipped portion via computePositionTotal', () => {
    const co = read('customer-order/customer-order.service.ts');
    // computePositionTotal called on the SHIPPED qty, summed into shippedSumMinor.
    expect(co).toMatch(/quantity:\s*String\(p\.shippedQty\)/);
    expect(co).toMatch(/shippedSumMinor\s*\+=\s*totalMinor/);
  });

  it('Supply post/unpost/cancel build the PO receivedSum delta via computePositionTotal', () => {
    const sup = read('supply/supply.service.ts');
    // Three cascade producers, each returning valueMinor = totalMinor.
    const calls = sup.match(/valueMinor:\s*totalMinor/g) ?? [];
    expect(calls.length).toBe(3);
    expect(sup).toMatch(/computePositionTotal\(/);
  });

  it('PurchaseReturn builds its PO receivedSum revert via computePositionTotal', () => {
    const pr = read('purchase-return/purchase-return.service.ts');
    expect(pr).toMatch(/valueMinor:\s*totalMinor/);
    expect(pr).toMatch(/computePositionTotal\(/);
  });
});
