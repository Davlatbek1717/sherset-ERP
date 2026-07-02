/**
 * Pure money math for RetailSale line items.
 *
 * Extracted from RetailSaleService so the BigInt-precision invariants
 * are unit-testable without mocking Prisma. Mirrors the canonical pattern
 * in DemandService.computeTotals (apps/api/src/modules/demand/demand.service.ts:671).
 *
 * Precision contract:
 * - priceMinor stays in BigInt throughout — never round-tripped through Number,
 *   which would silently lose precision above 2^53 (≈9 quadrillion tiyin).
 * - price × qty goes through the shared `scaleMinorByQty` primitive, which keeps
 *   quantity at the full 6 decimals (matching the schema + stock ledger) and
 *   rounds half-up to the nearest tiyin — no 3-dp truncation, no Float drift.
 * - discount is lifted to integer fixed-point (×100) so we don't drift on
 *   Float fractions like 0.1 + 0.2 != 0.3.
 */

import { computePositionTotal } from '@moysklad/money';

export interface PositionInput {
  productId: string;
  quantity: string;
  priceMinor: string;
  discount: string;
}

export interface ComputedPosition {
  productId: string;
  quantity: string;
  priceMinor: bigint;
  discount: string;
  lineMinor: bigint;
}

export interface ComputedPositions {
  rows: ComputedPosition[];
  totalMinor: bigint;
}

export function computePositions(inputs: PositionInput[]): ComputedPositions {
  let totalMinor = 0n;
  const rows = inputs.map((p) => {
    // Single-round per-line total via the shared primitive (no VAT at this layer).
    const lineMinor = computePositionTotal(
      {
        quantity: String(p.quantity),
        priceMinor: String(p.priceMinor),
        discount: String(p.discount ?? '0'),
        vat: null,
      },
      false,
      false,
    ).totalMinor;
    totalMinor += lineMinor;
    return {
      productId: p.productId,
      quantity: p.quantity,
      priceMinor: BigInt(p.priceMinor),
      discount: p.discount ?? '0',
      lineMinor,
    };
  });
  return { rows, totalMinor };
}
