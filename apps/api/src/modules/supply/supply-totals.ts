import { computePositionTotal } from '@moysklad/money';

/**
 * «Приёмка» hujjat-jamilari — YAGONA manba.
 *
 * Faza 14 (`PP-04`): ilgari bu mantiq `SupplyService`ning private metodi edi,
 * shuning uchun qabul-tasdiqlash oqimi (omborchi sonni tuzatgan payt) uni
 * chaqira olmasdi va hujjat summalari eski sonda qotib qolardi. Endi toza
 * funksiya — `SupplyService` ham, `SupplyApprovalService` ham SHU YERDAN oladi.
 */

export interface ComputedTotals {
  sumMinor: bigint;
  vatSumMinor: bigint;
  costSumMinor: bigint;
}

export interface SupplyTotalsPosition {
  quantity: unknown;
  priceMinor: bigint;
  discount: unknown;
  vat: number | null;
  vatEnabled: boolean;
}

export function computeSupplyTotals(
  positions: readonly SupplyTotalsPosition[],
  docVatEnabled: boolean,
  vatIncluded: boolean,
): ComputedTotals {
  let sumMinor = 0n;
  let vatSumMinor = 0n;
  let costSumMinor = 0n;

  for (const p of positions) {
    // Single-round per-line totals; baseMinor is the post-discount pre-VAT
    // amount (= cost basis, VAT-exclusive) that costSumMinor tracks.
    const { totalMinor, vatAmountMinor, baseMinor } = computePositionTotal(
      {
        quantity: String(p.quantity),
        priceMinor: String(p.priceMinor),
        discount: String(p.discount ?? '0'),
        vat: p.vat ?? null,
      },
      docVatEnabled && p.vatEnabled,
      vatIncluded,
    );
    sumMinor += totalMinor;
    vatSumMinor += vatAmountMinor;
    costSumMinor += baseMinor;
  }
  return { sumMinor, vatSumMinor, costSumMinor };
}
