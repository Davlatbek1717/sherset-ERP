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

/** An original receipt line with the money the customer was actually charged. */
export interface OriginalPricedLine extends OriginalLine {
  /** Unit price before discount (tiyin) — informational, carried onto the mirror row. */
  priceMinor: bigint;
  /** Percent, Decimal string — informational, carried onto the mirror row. */
  discount: string;
  /** Line total AFTER discount (tiyin) — this is the money that moves. */
  sumMinor: bigint;
}

export interface PricedRefundRow {
  productId: string;
  /** Decimal(20,6) string, as requested. */
  quantity: string;
  priceMinor: bigint;
  discount: string;
  /** Refund value of this line (tiyin), derived from the ORIGINAL sum. */
  lineMinor: bigint;
}

export interface PricedRefund {
  rows: PricedRefundRow[];
  totalMinor: bigint;
}

/**
 * Price a refund **from the original receipt** — never from client input.
 *
 * SALES-01: refund() used to run the client's `priceMinor` through
 * `computePositions()` and then cap the payout against that same number, so
 * the cap was self-referential — a caller with `retailsale:approve` could
 * refund a 10 000 so'm item for 10 000 000 and MoneyService would hand the
 * cash over. The client no longer has any say in the money: each refunded
 * line is worth its share of what the customer actually paid.
 *
 * Per product, the original lines are aggregated (a receipt may list the same
 * product several times, possibly at different prices — mirroring
 * `validateRefundPositions`, which caps quantity per product, not per line):
 *
 *   lineMinor = ⌊ Σ(original sumMinor) × refundQty / Σ(original qty) ⌋
 *
 * Floor division is deliberate: summed over any set of refund lines whose
 * quantities stay within the sold quantity (which `validateRefundPositions`
 * guarantees), the result can only be ≤ the original sum — never above it.
 * The customer may lose up to one tiyin per line on a split partial refund;
 * paying out more than the receipt is the failure mode that matters.
 *
 * `priceMinor`/`discount` are copied from the product's first original line
 * for display/provenance only — they are not what the payout is computed from.
 */
export function priceRefundFromOriginal(
  original: OriginalPricedLine[],
  requested: RequestedRefundLine[],
): PricedRefund {
  const byProduct = new Map<
    string,
    { qtyMicro: bigint; sumMinor: bigint; priceMinor: bigint; discount: string }
  >();
  for (const o of original) {
    if (o.productId == null) continue;
    const agg = byProduct.get(o.productId);
    if (agg) {
      agg.qtyMicro += toMicro(o.quantity);
      agg.sumMinor += o.sumMinor;
    } else {
      byProduct.set(o.productId, {
        qtyMicro: toMicro(o.quantity),
        sumMinor: o.sumMinor,
        priceMinor: o.priceMinor,
        discount: o.discount,
      });
    }
  }

  let totalMinor = 0n;
  const rows = requested.map((r) => {
    const agg = byProduct.get(r.productId);
    // Unknown product / zero-qty original: worth nothing. `validateRefundPositions`
    // rejects the first case before we get here; pricing it at 0 means a future
    // caller that reorders the guards still cannot mint cash.
    const lineMinor =
      agg && agg.qtyMicro > 0n ? (agg.sumMinor * toMicro(r.quantity)) / agg.qtyMicro : 0n;
    totalMinor += lineMinor;
    return {
      productId: r.productId,
      quantity: r.quantity,
      priceMinor: agg?.priceMinor ?? 0n,
      discount: agg?.discount ?? '0',
      lineMinor,
    };
  });

  return { rows, totalMinor };
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
