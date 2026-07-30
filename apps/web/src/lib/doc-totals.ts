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

/** A position as far as «Вес»/«Объём» aggregation is concerned. */
export interface MeasureRow {
  quantity: string;
  /** Per-unit weight in grams (from the product). */
  weightG?: number | null;
  /** Per-unit volume in millilitres (from the product). */
  volumeML?: number | null;
}

/**
 * «Вес» / «Объём» document totals — moysklad shows both under Итого.
 *
 * Deliberately mirrors `lineMeasure` in the design-system PositionTable: the
 * per-unit measure is multiplied by Кол-во and kept in its RAW unit (g / ml),
 * NOT converted to kg / m³ — so the totals row is the literal sum of the
 * per-line column above it. Converting here would make the footer disagree
 * with every line.
 *
 * Returns `null` (→ the row is hidden) when no position carries the measure,
 * so a document of weightless services shows no «Вес», exactly like moysklad.
 * Rounded to 3 dp to absorb float drift from fractional quantities.
 */
export function docMeasureTotals(rows: readonly MeasureRow[]): {
  weight: number | null;
  volume: number | null;
} {
  let weight = 0;
  let volume = 0;
  let hasWeight = false;
  let hasVolume = false;

  for (const r of rows) {
    const qty = Number(r.quantity);
    if (!Number.isFinite(qty) || qty <= 0) continue;

    const w = Number(r.weightG);
    if (Number.isFinite(w) && w > 0) {
      weight += w * qty;
      hasWeight = true;
    }
    const v = Number(r.volumeML);
    if (Number.isFinite(v) && v > 0) {
      volume += v * qty;
      hasVolume = true;
    }
  }

  const round3 = (n: number) => Math.round(n * 1000) / 1000;
  return {
    weight: hasWeight ? round3(weight) : null,
    volume: hasVolume ? round3(volume) : null,
  };
}
