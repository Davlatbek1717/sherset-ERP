import type { PickerItem } from '@moysklad/ui';

/**
 * Pins the account's default customer («Значения по умолчанию» → Покупатель) to
 * the top of a Контрагент picker list.
 *
 * Sales flows open the counterparty picker most often to (re)select the shop's
 * main walk-in buyer — for Sherset that is «Покупатель», the account's configured
 * default customer, which takes the bulk of the sales. Surfacing it as row 1
 * (with a muted «по умолчанию» tag) saves a search+scroll on every order instead
 * of relying on it happening to land in the first page of the name-sorted list.
 *
 * The pin is applied when the query is empty (dropdown just opened) or when the
 * default customer's name still matches what the user is typing — so searching
 * for a DIFFERENT counterparty never force-injects the pinned row. The pinned id
 * is de-duplicated out of the fetched rows so it never appears twice.
 */
export function pinDefaultCustomer(
  items: PickerItem[],
  pinned: { id: string; name: string } | null | undefined,
  search: string,
  pinnedTag: string,
): PickerItem[] {
  if (!pinned) return items;
  const q = search.trim().toLowerCase();
  if (q !== '' && !pinned.name.toLowerCase().includes(q)) return items;
  const rest = items.filter((it) => it.id !== pinned.id);
  return [{ id: pinned.id, primary: pinned.name, meta: `★ ${pinnedTag}` }, ...rest];
}
