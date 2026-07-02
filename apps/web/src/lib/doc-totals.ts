/**
 * Document totals for the detail-page totals sidebar (Промежуточный итог / Итого).
 *
 * The backend's `computeTotals` (e.g. purchase-order.service.ts:1106-1135,
 * customer-order.service.ts:1004-1035 — identical across every document
 * service) stores `sumMinor` as the **GROSS** document total (net + VAT) in
 * BOTH `vatIncluded` modes, and `vatSumMinor` as the VAT portion:
 *   - vatIncluded=true  → price already includes VAT; sumMinor += price,
 *                         vatSumMinor += price·vat/(100+vat).
 *   - vatIncluded=false → price is net;               sumMinor += price + price·vat/100,
 *                         vatSumMinor += price·vat/100.
 * So in every case `sumMinor` is already net+VAT and `vatSumMinor` is the VAT.
 *
 * Therefore the pre-VAT subtotal is always `sum − vat` and the grand total is
 * always `sum`, INDEPENDENT of the vatIncluded flag.
 *
 * History: the per-page expression used to be
 *   subtotal = vatIncluded ? sum − vat : sum
 *   total    = vatIncluded ? sum       : sum + vat
 * which, in the schema-default `vatIncluded=false` case, showed the gross as
 * the subtotal and added VAT a SECOND time into the total (net + 2·VAT). This
 * helper is the single corrected source consumed by all 9 document detail
 * pages (was duplicated verbatim in each).
 */
export function docTotals(
  sumMinor: bigint,
  vatSumMinor: bigint,
): { subtotal: bigint; total: bigint } {
  return { subtotal: sumMinor - vatSumMinor, total: sumMinor };
}
