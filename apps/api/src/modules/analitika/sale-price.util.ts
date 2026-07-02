/**
 * Pick a product's sale price (minor units) from its `salePrices` JSON.
 * Prefers the account's default price type; falls back to the first listed
 * price; 0 when the product has no prices. Pure — no DB access.
 *
 * salePrices shape (moysklad): `[{ priceTypeId, value }]` where value is a
 * minor-unit string (tiyin).
 */
export type SalePricesJson = Array<{ priceTypeId?: string; value?: string }> | null | undefined;

export function pickSalePriceMinor(
  salePrices: SalePricesJson,
  defaultPriceTypeId?: string | null,
): bigint {
  const prices = salePrices ?? [];
  const chosen =
    (defaultPriceTypeId ? prices.find((p) => p.priceTypeId === defaultPriceTypeId) : undefined) ??
    prices[0];
  try {
    return BigInt(chosen?.value ?? '0');
  } catch {
    return 0n;
  }
}
