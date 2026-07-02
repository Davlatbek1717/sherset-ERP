/**
 * Retail refund (POS-return) guard — pure, exact qty/money validation.
 *
 * RefundRetailSaleSchema documents «Positions to refund. Must be a
 * subset of original positions.» — but retail-sale.service.refund()
 * never enforced it (documented-but-unenforced invariant; §105 latent
 * bug, same class as the §100 close() reconciliation bug). A client
 * could refund a product never sold, or more units than were sold,
 * producing wrong stock inflow + over-refunded cash.
 *
 * This pure module enforces exactly the documented contract. Quantities
 * are Decimal(20,6) strings compared in integer micro-units (×1e6);
 * money is tiyin BigInt. No floating point on a monetary/qty decision.
 * Returns an error message (string) or null — the service maps a
 * non-null to BadRequestException (keeps this pure & adversarially
 * testable, the §74/§101 pattern).
 */

export interface OriginalLine {
  productId: string | null;
  /** Decimal(20,6) string. */
  quantity: string;
}
export interface RequestedRefundLine {
  productId: string;
  /** Decimal(20,6) string. */
  quantity: string;
}

const MICRO = 1_000_000n;

/** Decimal(20,6) string → integer micro-units. Total + exact. */
function toMicro(decimal: string): bigint {
  const neg = decimal.trim().startsWith('-');
  const body = neg ? decimal.trim().slice(1) : decimal.trim();
  const [int = '0', frac = ''] = body.split('.');
  const micro = BigInt(int || '0') * MICRO + BigInt(`${frac}000000`.slice(0, 6) || '0');
  return neg ? -micro : micro;
}

/**
 * Validate a refund request against the original posted sale's lines.
 * Returns null when valid, else a human-readable reason. Enforces:
 *  1. every refunded product was actually in the original sale;
 *  2. cumulative refunded qty per product ≤ originally sold qty
 *     (aggregated across original lines, so split lines are summed);
 *  3. refunded qty is strictly positive.
 */
export function validateRefundPositions(
  original: OriginalLine[],
  requested: RequestedRefundLine[],
): string | null {
  // Aggregate original sold qty per product (skip null-product/service).
  const soldByProduct = new Map<string, bigint>();
  for (const o of original) {
    if (o.productId == null) continue;
    soldByProduct.set(o.productId, (soldByProduct.get(o.productId) ?? 0n) + toMicro(o.quantity));
  }

  // Sum the request per product so multiple refund lines of the same
  // product cannot individually pass yet collectively over-refund.
  const wantByProduct = new Map<string, bigint>();
  for (const r of requested) {
    const q = toMicro(r.quantity);
    if (q <= 0n) {
      return `Refund quantity must be > 0 (product ${r.productId})`;
    }
    wantByProduct.set(r.productId, (wantByProduct.get(r.productId) ?? 0n) + q);
  }

  for (const [productId, want] of wantByProduct) {
    const sold = soldByProduct.get(productId);
    if (sold === undefined) {
      return `Product ${productId} was not in the original sale — cannot refund it`;
    }
    if (want > sold) {
      return `Refund qty for product ${productId} exceeds sold qty (${
        Number(want) / 1e6
      } > ${Number(sold) / 1e6})`;
    }
  }
  return null;
}

/**
 * Money guard: the cash+card paid back must not exceed the value of the
 * goods being refunded (you cannot hand back more money than the
 * refund is worth). All tiyin BigInt; refundSumMinor is computed from
 * the validated positions. Returns null when valid, else a reason.
 */
export function validateRefundAmount(
  refundSumMinor: bigint,
  cashReturnMinor: bigint,
  cardReturnMinor: bigint,
): string | null {
  if (cashReturnMinor < 0n || cardReturnMinor < 0n) {
    return 'Refund cash/card amounts must be non-negative';
  }
  if (cashReturnMinor + cardReturnMinor > refundSumMinor) {
    return `Refund payout ${(cashReturnMinor + cardReturnMinor).toString()} exceeds refunded value ${refundSumMinor.toString()}`;
  }
  return null;
}
