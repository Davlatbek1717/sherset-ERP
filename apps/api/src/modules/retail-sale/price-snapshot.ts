/**
 * Frozen price snapshot for POS receipt lines — kassa TZ §5.3.
 *
 * `post()` pins two numbers onto every position at the moment of sale:
 *   • costMinor      — `Product.buyPrice` (the owner's hand-kept cost)
 *   • basePriceMinor — the default («Розничная цена») tier from `salePrices`
 *
 * Why a separate pure module: the resolution rules (which salePrices entry is
 * "the retail one") are subtle enough to deserve their own tests, and the
 * freeze must stay byte-comparable with what the POS screen showed the cashier
 * — `apps/web/src/lib/sale-price.ts` resolves the same three-step ladder.
 *
 * NULL vs 0 — the central invariant:
 *   NULL = "this number was never collected" (no buyPrice on the card, product
 *   row missing, or a receipt posted before the freeze existed). 0 = "collected,
 *   and it really is zero". Reports MUST keep these apart: collapsing NULL to 0
 *   is precisely the bug that makes every POS receipt read as 100% margin.
 */

/** `Product.salePrices` JSON — `[{ priceTypeId, value }]`, value in minor units. */
export type SalePricesJson =
  | ReadonlyArray<{ priceTypeId?: string; value?: string }>
  | null
  | undefined;

/**
 * Legacy sentinel for the retail tier, from before prices were keyed by real
 * PriceType id. Still present in older rows, so the FE reads it and so must we
 * — otherwise the frozen base price would silently differ from the price the
 * cashier saw on screen. Mirrors `RETAIL_SENTINEL` in the web sale-price lib.
 */
export const RETAIL_SENTINEL = 'default';

export interface PriceSnapshotSource {
  /** `Product.buyPrice` — minor units, or null when the card has no cost. */
  buyPrice: bigint | null;
  salePrices: SalePricesJson;
}

export interface FrozenPrices {
  costMinor: bigint | null;
  basePriceMinor: bigint | null;
}

/** Every number unknown — the shape used for service-only / unresolved rows. */
export const EMPTY_SNAPSHOT: FrozenPrices = { costMinor: null, basePriceMinor: null };

/**
 * Resolve the default (retail) tier: real default PriceType id → the legacy
 * 'default' sentinel → the first listed price. Returns null (not 0) when the
 * product carries no price at all, or when the stored value isn't a valid
 * integer string.
 */
export function resolveBasePriceMinor(
  salePrices: SalePricesJson,
  defaultPriceTypeId?: string | null,
): bigint | null {
  const list = salePrices ?? [];
  if (list.length === 0) return null;
  const chosen =
    (defaultPriceTypeId ? list.find((p) => p.priceTypeId === defaultPriceTypeId) : undefined) ??
    list.find((p) => p.priceTypeId === RETAIL_SENTINEL) ??
    list[0];
  const raw = chosen?.value;
  if (raw == null || raw === '') return null;
  try {
    return BigInt(raw);
  } catch {
    // A malformed stored value must not fail the sale — the cashier is standing
    // at the till. Degrade to "not collected"; the report will flag it.
    return null;
  }
}

/** Snapshot one product's cost + base price. Pure — no DB, no clock. */
export function snapshotPrices(
  source: PriceSnapshotSource | null | undefined,
  defaultPriceTypeId?: string | null,
): FrozenPrices {
  if (!source) return EMPTY_SNAPSHOT;
  return {
    costMinor: source.buyPrice ?? null,
    basePriceMinor: resolveBasePriceMinor(source.salePrices, defaultPriceTypeId),
  };
}

/**
 * Snapshot a batch of products keyed by id — the shape `post()` needs to stamp
 * a whole receipt in one pass.
 */
export function snapshotPricesByProduct(
  products: ReadonlyArray<{ id: string } & PriceSnapshotSource>,
  defaultPriceTypeId?: string | null,
): Map<string, FrozenPrices> {
  return new Map(products.map((p) => [p.id, snapshotPrices(p, defaultPriceTypeId)]));
}

// Derived figures (profit, margin, markdown, price bands) deliberately live in
// `@moysklad/money` (`profit.ts`) — the cart and the reports must compute them
// from one source, and only the shared package is reachable from both.
