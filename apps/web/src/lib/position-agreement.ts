/**
 * «Kelishuv» (negotiated total) distribution — owner feature 2026-07-17.
 *
 * The cashier enters an extra amount (add or subtract) on top of the document
 * total; the delta is spread across the position rows PROPORTIONALLY to each
 * row's line total, by adjusting the row's unit price (`priceMinor`). No
 * schema change — receipts/prints/reports stay correct automatically.
 *
 * Precision: unit prices are integer tiyin and a row's gross moves in steps of
 * `qty × (1 − disc/100) × (1 + vat/100 if VAT-on-top)` per tiyin of price, so
 * an arbitrary target may be unreachable exactly on SOME rows (a qty-100 000
 * line moves in 100 000-tiyin steps). After the proportional pass the residual
 * is therefore absorbed iteratively starting from the FINEST-step row (review
 * 2026-07-17: pinning it to the largest row silently missed the target by soms
 * whenever the largest row was coarse) — a qty-1 row can represent any tiyin,
 * so documents with at least one such row land on the target exactly.
 * Prices clamp at 0; a subtract larger than the document total is clamped to
 * the total (the modal additionally blocks it with a red warning).
 */

import { computePositionTotal } from '@moysklad/money';

export interface AgreementRow {
  id: string;
  quantity: string;
  priceMinor: string;
  discount: string;
  vat: string;
  vatEnabled: boolean;
}

/** ru-locale decimal commas are live grid state («1,5» qty) — normalize like the
 *  grid's own parsers so such rows still participate in the spread. */
function normQty(quantity: string): string {
  return (quantity || '0').replace(/\s/g, '').replace(',', '.');
}

function rowGross(row: AgreementRow, vatIncluded: boolean): bigint {
  try {
    const { totalMinor } = computePositionTotal(
      {
        quantity: normQty(row.quantity),
        priceMinor: row.priceMinor || '0',
        discount: row.discount || '0',
        vat: row.vatEnabled && row.vat ? Number(row.vat) : null,
      },
      row.vatEnabled,
      vatIncluded,
    );
    return totalMinor;
  } catch {
    return 0n;
  }
}

/** Per-tiyin-of-price gross factor: qty × (1 − disc/100) × (1 + vat/100 when
 *  VAT rides on top). 0 when the row can't carry price changes — qty 0, or a
 *  micro-qty below the money package's 6-dp resolution (its gross would never
 *  actually move, so it must not be treated as a carrier). */
function rowFactor(row: AgreementRow, vatIncluded: boolean): number {
  const qty = Number(normQty(row.quantity));
  if (!Number.isFinite(qty) || qty < 1e-6) return 0;
  const disc = Number(row.discount);
  const discFactor = Number.isFinite(disc) ? Math.min(Math.max(1 - disc / 100, 0), 1) : 1;
  const vat = row.vatEnabled ? Number(row.vat) : 0;
  const vatFactor = !vatIncluded && Number.isFinite(vat) && vat > 0 ? 1 + vat / 100 : 1;
  return qty * discFactor * vatFactor;
}

/** Live document gross over the same math the spread uses — pages feed this to
 *  the Kelishuv modal so its «Итого» baseline matches the on-screen positions
 *  (the saved doc's sumMinor is stale the moment a line is edited). */
export function sumAgreementGross(rows: readonly AgreementRow[], vatIncluded: boolean): bigint {
  let sum = 0n;
  for (const r of rows) sum += rowGross(r, vatIncluded);
  return sum;
}

/**
 * Distribute `deltaMinor` (signed bigint, tiyin) across `rows` proportionally
 * to line totals. Returns id → new priceMinor for every row whose price
 * changes. Rows with qty 0 are skipped; zero-total documents split equally;
 * a subtract beyond the document total is clamped to the total.
 */
export function distributeAgreementDelta(
  rows: readonly AgreementRow[],
  deltaMinor: bigint,
  vatIncluded: boolean,
): Map<string, string> {
  const result = new Map<string, string>();
  if (deltaMinor === 0n) return result;
  const carriers = rows.filter((r) => rowFactor(r, vatIncluded) > 0);
  if (carriers.length === 0) return result;

  const grosses = new Map<string, bigint>(carriers.map((r) => [r.id, rowGross(r, vatIncluded)]));
  let totalGross = 0n;
  for (const g of grosses.values()) totalGross += g;

  // Defense in depth: the most the document can give back is its own total
  // (prices clamp at 0). The modal blocks this case with a red warning; if a
  // caller bypasses that, clamp instead of silently zeroing every price.
  let delta = deltaMinor;
  if (delta < 0n && -delta > totalGross) delta = -totalGross;

  // Weight = line gross; an all-zero document falls back to an equal split.
  const weightOf = (r: AgreementRow): bigint => (totalGross > 0n ? (grosses.get(r.id) ?? 0n) : 1n);
  const totalWeight = totalGross > 0n ? totalGross : BigInt(carriers.length);

  const newPrices = new Map<string, bigint>();
  for (const r of carriers) {
    const share = (delta * weightOf(r)) / totalWeight; // truncating bigint div
    const priceDelta = BigInt(Math.round(Number(share) / rowFactor(r, vatIncluded)));
    const oldPrice = BigInt(r.priceMinor || '0');
    const next = oldPrice + priceDelta;
    newPrices.set(r.id, next < 0n ? 0n : next);
  }

  // Residual absorption: recompute the achieved delta exactly, then hand the
  // remainder to carriers starting from the FINEST price-step (smallest
  // factor) — those can represent the smallest gross moves, so a qty-1 row
  // absorbs any tiyin remainder exactly. Iterates because a clamped-at-0 row
  // may leave part of the remainder for the next carrier.
  const achievedDelta = (): bigint => {
    let achieved = 0n;
    for (const r of carriers) {
      const adjusted: AgreementRow = { ...r, priceMinor: (newPrices.get(r.id) ?? 0n).toString() };
      achieved += rowGross(adjusted, vatIncluded) - (grosses.get(r.id) ?? 0n);
    }
    return achieved;
  };
  const byFinestStep = [...carriers].sort(
    (a, b) => rowFactor(a, vatIncluded) - rowFactor(b, vatIncluded),
  );
  let remaining = delta - achievedDelta();
  for (const r of byFinestStep) {
    if (remaining === 0n) break;
    const f = rowFactor(r, vatIncluded);
    const bump = BigInt(Math.round(Number(remaining) / f));
    if (bump === 0n) continue; // remainder below this row's step — try the next
    const cur = newPrices.get(r.id) ?? 0n;
    let next = cur + bump;
    if (next < 0n) next = 0n;
    if (next === cur) continue;
    newPrices.set(r.id, next);
    remaining = delta - achievedDelta();
  }

  for (const r of carriers) {
    const next = (newPrices.get(r.id) ?? 0n).toString();
    if (next !== (r.priceMinor || '0')) result.set(r.id, next);
  }
  return result;
}
