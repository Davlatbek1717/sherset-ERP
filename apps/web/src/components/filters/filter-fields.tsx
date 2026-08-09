'use client';

/**
 * Shared inline-filter primitives — the single copy of the three controls that
 * every moysklad list page's Фильтр panel needs.
 *
 * Before this module each page carried its own private copy: `YesNoSelect` was
 * duplicated **byte-identically 24 times** (cash-in, cash-out, customer-orders,
 * demands, supplies, …) and `MultiRefField` + `refFetcher` 3 times each
 * (demands, invoices-out, supplies). Nothing kept them in step: a fix to the
 * option order, the tri-state contract or the reference-search limit had to be
 * applied 24 times or it silently diverged.
 *
 * NOTE both components MUST stay module-level (they are exported from a module,
 * so they are): an inline component is a NEW type on every render, React
 * remounts it, and the reference dropdown closes on every keystroke.
 */

import { api } from '@/lib/api-client';
import { MultiCombobox, NativeSelect } from '@moysklad/ui';
import { useTranslations } from 'next-intl';

/** A picked reference — the id the API filters by plus its display label. */
export type RefMulti = { id: string; label: string };

/** A row in the reference dropdown. */
export type ComboItem = { value: string; label: string; sublabel?: string };

/**
 * Tri-state «Да / Нет / (не важно)» filter select — moysklad renders these as a
 * plain select whose FIRST option is blank, meaning "don't filter on this".
 *
 * The tri-state is the whole point: `undefined` drops the query param entirely
 * while `'false'` actively filters for the negative, so the blank option must
 * emit `undefined` and never `'false'`.
 */
export function YesNoSelect({
  value,
  onChange,
  testId,
}: {
  value: 'true' | 'false' | undefined;
  onChange: (v: 'true' | 'false' | undefined) => void;
  testId?: string;
}) {
  const tCommon = useTranslations('common');
  return (
    <NativeSelect
      value={value ?? ''}
      onChange={(e) => {
        const v = e.target.value;
        onChange(v === '' ? undefined : (v as 'true' | 'false'));
      }}
      data-test-id={testId}
    >
      <option value="" />
      <option value="false">{tCommon('no')}</option>
      <option value="true">{tCommon('yes')}</option>
    </NativeSelect>
  );
}

/**
 * Multi-select inline reference filter field — moysklad checkbox-dropdown
 * (click opens an in-place dropdown with a search box + checkboxes, pick
 * several). Wraps MultiCombobox + the id↔label merge so each field is a
 * one-liner.
 *
 * The merge keeps a label for every picked id: reuse the already-known label,
 * else the label of the row just toggled on, else fall back to the raw id (a
 * pick restored from the URL before its reference has been searched).
 */
export function MultiRefField({
  value,
  onChange,
  onSearch,
  testId,
}: {
  value: RefMulti[];
  onChange: (next: RefMulti[]) => void;
  onSearch: (q: string) => Promise<ComboItem[]>;
  testId: string;
}) {
  return (
    <MultiCombobox
      value={value.map((x) => x.id)}
      items={value.map((x) => ({ value: x.id, label: x.label }))}
      onSearch={onSearch}
      onChange={(nextIds, toggled) => {
        onChange(
          nextIds.map((id) => {
            const ex = value.find((p) => p.id === id);
            if (ex) return ex;
            if (toggled?.value === id) return { id, label: String(toggled.label) };
            return { id, label: id };
          }),
        );
      }}
      placeholder=""
      testId={testId}
    />
  );
}

/**
 * Curried search fetcher for the `{id,name}`-list reference endpoints behind
 * the pickers (`/counterparties`, `/stores`, `/employees`, …).
 *
 * Call it ONCE at module level per endpoint (`const fetchStores =
 * refFetcher('/stores')`) so the resulting function has a stable identity —
 * a fresh closure per render would remount MultiCombobox.
 */
export const refFetcher =
  (path: string) =>
  async (q: string): Promise<ComboItem[]> => {
    const r = await api.get<{ items: { id: string; name: string }[] }>(
      `${path}?search=${encodeURIComponent(q)}&limit=20`,
    );
    return r.items.map((x) => ({ value: x.id, label: x.name }));
  };
