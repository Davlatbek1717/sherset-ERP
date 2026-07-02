export type VarianceStatus = 'green' | 'yellow' | 'red';

export interface VarianceStatusInput {
  /** System ("REGOS") stock at count time. */
  expectedQty: number;
  /** Signed difference: kopQty - kamQty (surplus positive, shortage negative). */
  netQty: number;
  /** Variance percentage at/below which a count is auto-accepted (green). */
  greenMaxPct: number;
  /** Variance percentage at/below which a count needs review (yellow); above is red. */
  yellowMaxPct: number;
}

/**
 * Classify a count's variance as green (auto-accept), yellow (needs review),
 * or red (must recount). Variance is measured as the absolute difference as a
 * percentage of the expected (system) quantity.
 *
 * Edge case: when expectedQty is 0 a percentage is undefined — any non-zero
 * count is treated as red (a surplus that the system has no record of is the
 * most suspicious case), while a zero count is green (nothing to reconcile).
 */
export function computeVarianceStatus({
  expectedQty,
  netQty,
  greenMaxPct,
  yellowMaxPct,
}: VarianceStatusInput): VarianceStatus {
  const diff = Math.abs(netQty);
  if (diff === 0) return 'green';
  if (expectedQty === 0) return 'red';

  const pct = (diff / Math.abs(expectedQty)) * 100;
  if (pct <= greenMaxPct) return 'green';
  if (pct <= yellowMaxPct) return 'yellow';
  return 'red';
}
