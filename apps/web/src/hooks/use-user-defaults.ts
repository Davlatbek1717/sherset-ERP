import { api } from '@/lib/api-client';
import { useQuery } from '@tanstack/react-query';

/**
 * The current user's «Значения по умолчанию» (GET /user-settings) with the
 * reference NAMES resolved server-side. A new document pre-fills from these
 * (moysklad applies the user defaults to EVERY new document, not just one
 * form). Shared so every doc /new page applies them the same way.
 */
export interface UserDefaultRef {
  id: string;
  name: string;
}
export interface UserDefaults {
  defaultCompany: UserDefaultRef | null;
  defaultStore: UserDefaultRef | null;
  defaultProject: UserDefaultRef | null;
  defaultCustomer: UserDefaultRef | null;
  defaultSupplier: UserDefaultRef | null;
  /**
   * «Основной склад» — the ACCOUNT's main warehouse (earliest-created active
   * one), resolved server-side. Not a user choice: it is the deterministic
   * fallback for a user who has not set `defaultStore`. See `defaultDocStore`.
   */
  mainStore: UserDefaultRef | null;
}

/**
 * The warehouse a NEW document should pre-select.
 *
 * Order: the user's own «Склад по умолчанию» → the account's main store → the
 * first store in the list.
 *
 * 🔴 Why the middle step exists (2026-08-19, jonli prod bug): the list is sorted
 * by NAME, so `stores[0]` picked whichever warehouse happened to sort first in
 * the alphabet. On prod that was an empty leftover («Ombor 1») while all 5063
 * stock rows lived in «Ombor 2» — so every new document showed «На складе: 0»
 * and two real receipts (27,7 mln so'm) were posted into the wrong warehouse
 * before anyone noticed. An alphabetical accident must never choose a warehouse.
 */
export function defaultDocStore(
  us: UserDefaults | undefined,
  stores: UserDefaultRef[] | undefined,
): UserDefaultRef | undefined {
  return us?.defaultStore ?? us?.mainStore ?? stores?.[0];
}

export function useUserDefaults() {
  return useQuery<UserDefaults>({
    queryKey: ['user-settings'],
    queryFn: () => api.get<UserDefaults>('/user-settings'),
  });
}
