import { useQuery } from '@tanstack/react-query';
import { api } from './api-client';

/**
 * Sale-price resolution shared across every product/variant/service/document
 * screen. The model (matching moysklad) keys each stored price by the real
 * PriceType id. Some legacy rows still use the string sentinels below; this
 * layer reads BOTH so the app stays correct during + after the id migration.
 */

/** Legacy sentinel for the retail (account-default) tier — pre-id storage. */
export const RETAIL_SENTINEL = 'default';
/** Legacy sentinel for the second (wholesale) tier — pre-id storage. */
export const WHOLESALE_SENTINEL = 'wholesale';

export interface SalePriceEntry {
  priceTypeId: string;
  value: string;
  currencyCode?: string;
}

type SalePricesLike = ReadonlyArray<{ priceTypeId?: string; value?: string }> | null | undefined;

/**
 * Resolve the DEFAULT (retail) sale price value (minor-unit string) for a
 * product/variant/service. Matches, in order: the real default PriceType id
 * (when known) → the legacy 'default' sentinel → the first listed price.
 * Returns null when there is no price.
 */
export function resolveDefaultSalePrice(
  salePrices: SalePricesLike,
  defaultPriceTypeId?: string | null,
): string | null {
  const list = salePrices ?? [];
  if (list.length === 0) return null;
  const byId = defaultPriceTypeId
    ? list.find((p) => p.priceTypeId === defaultPriceTypeId)
    : undefined;
  const chosen = byId ?? list.find((p) => p.priceTypeId === RETAIL_SENTINEL) ?? list[0];
  return chosen?.value ?? null;
}

/**
 * As {@link resolveDefaultSalePrice} but yields '0' instead of null — the
 * convention used when prefilling a document position price.
 */
export function resolveDefaultSalePriceOrZero(
  salePrices: SalePricesLike,
  defaultPriceTypeId?: string | null,
): string {
  return resolveDefaultSalePrice(salePrices, defaultPriceTypeId) ?? '0';
}

interface PriceTypeLite {
  id: string;
  name: string;
  isDefault: boolean;
  position: number;
  currency: string;
  archived: boolean;
}

/**
 * Account price types (cached) plus the resolved default + wholesale ids that
 * WRITE paths stamp onto salePrices. `wholesaleId` is the first non-default
 * type by position (the «Оптовая» tier), or null when the account has only one.
 */
export function usePriceTypeIds(): {
  priceTypes: PriceTypeLite[];
  defaultId: string | null;
  wholesaleId: string | null;
} {
  const { data } = useQuery<{ items: PriceTypeLite[] }>({
    queryKey: ['price-types', 'ids'],
    queryFn: () => api.get<{ items: PriceTypeLite[] }>('/price-types?limit=50'),
    staleTime: 60_000,
  });
  const priceTypes = [...(data?.items ?? [])]
    .filter((t) => !t.archived)
    .sort((a, b) => a.position - b.position);
  const defaultId = priceTypes.find((t) => t.isDefault)?.id ?? priceTypes[0]?.id ?? null;
  const wholesaleId = priceTypes.find((t) => t.id !== defaultId)?.id ?? null;
  return { priceTypes, defaultId, wholesaleId };
}
