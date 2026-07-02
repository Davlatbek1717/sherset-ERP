'use client';

import { COUNTRIES } from '@/lib/countries';
import { Combobox, type ComboboxItem, Icons, Input, Textarea } from '@moysklad/ui';
import { useTranslations } from 'next-intl';
import { type ReactNode, useMemo, useState } from 'react';

/**
 * Structured address used by the «Фактический адрес» / «Юридический адрес» rows on
 * the counterparty form. Shape mirrors the BE AddressFullSchema; field set + order
 * is LIVE-grounded against the counterparty edit DOM (docs/moysklad-reference/
 * counterparties/detail/edit-default.html — both address blocks expose, in order:
 * Индекс · Страна · Город · Улица · Дом · Квартира/Офис · Другое · Комментарий к
 * адресу). `region` is preserved (not shown in the counterparty block) so addresses
 * written elsewhere round-trip unchanged.
 */
export interface AddressFull {
  postalCode?: string;
  country?: string;
  city?: string;
  street?: string;
  house?: string;
  apartment?: string;
  /** «Другое» — structured "other" address line. */
  addInfo?: string;
  /** «Комментарий к адресу» — free comment shown below «Другое». */
  comment?: string;
  /** Not rendered for counterparties; kept so foreign writers round-trip. */
  region?: string;
  [key: string]: unknown;
}

/** Single-line address composed from the structured parts, moysklad field order. */
export function composeAddress(v: AddressFull): string {
  return [v.postalCode, v.country, v.city, v.street, v.house, v.apartment, v.addInfo]
    .map((s) => (typeof s === 'string' ? s.trim() : ''))
    .filter(Boolean)
    .join(', ');
}

/** True when any structured address field carries a non-empty value. */
export function hasAddress(v: AddressFull): boolean {
  return Object.values(v).some((s) => typeof s === 'string' && s.trim() !== '');
}

export interface CounterpartyAddressGroupProps {
  /** The field label shown in the left gutter («Фактический адрес» / «Юридический адрес»). */
  label: ReactNode;
  value: AddressFull;
  onChange(next: AddressFull): void;
  /** The denormalised single-line address (kept for the list «Адрес» column/filter). */
  text: string;
  onTextChange(next: string): void;
  /** Unique prefix for input ids / data-test-ids (e.g. "actual", "legal"). */
  idPrefix: string;
  disabled?: boolean;
  defaultOpen?: boolean;
}

/** A label-LEFT row INSIDE the expanded helper. Unlike the page's narrow
 *  CounterpartyFieldRow (240px control), this spans the card width so «Город»/«Улица»
 *  etc. are wide — matching moysklad; pass `narrow` for the short fields. */
function AddrRow({
  label,
  narrow,
  children,
}: {
  label: ReactNode;
  narrow?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] items-start gap-3">
      <div className="pt-1.5 text-[var(--ms-text-muted)] text-sm">{label}</div>
      <div className="min-w-0">{narrow ? <div className="w-24">{children}</div> : children}</div>
    </div>
  );
}

/**
 * moysklad's collapsed «Фактический/Юридический адрес» row: an editable multi-line textarea
 * + a ▼ that reveals the structured helper (Индекс…Другое + Комментарий). Typing in a
 * structured field recomposes the textarea; the textarea can also be typed directly. «Страна»
 * is a searchable country combo with a ➕ to type a country not in the list (moysklad parity).
 */
export function CounterpartyAddressGroup({
  label,
  value,
  onChange,
  text,
  onTextChange,
  idPrefix,
  disabled,
  defaultOpen = false,
}: CounterpartyAddressGroupProps) {
  const t = useTranslations('pages.counterparty_new');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(defaultOpen);
  // «Страна» ➕ — moysklad lets you add a country not in the reference. Our address country
  // is free text, so the ➕ flips the picker into a free-text input for a custom name.
  const [countryFree, setCountryFree] = useState(false);

  const countryItems = useMemo<ComboboxItem[]>(
    () => COUNTRIES.map((c) => ({ value: c.name, label: c.name })),
    [],
  );

  const setField = (field: keyof AddressFull, next: string) => {
    const updated = { ...value, [field]: next };
    onChange(updated);
    // Keep the denormalised single line in sync, except for the free comment (not part
    // of the composed line beyond addInfo).
    if (field !== 'comment') onTextChange(composeAddress(updated));
  };

  return (
    <div className="space-y-2" data-test-id={`${idPrefix}-address-group`}>
      {/* collapsed line — label + multi-line textarea + ▼ toggle (full card width) */}
      <div className="grid grid-cols-[120px_minmax(0,1fr)] items-start gap-3">
        <div className="pt-1.5 text-[var(--ms-text-muted)] text-sm">{label}</div>
        <div className="flex items-start gap-1">
          <Textarea
            id={`${idPrefix}-address`}
            rows={2}
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            disabled={disabled}
            className="min-h-[44px] flex-1"
            data-test-id={`field-${idPrefix}Address`}
          />
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            disabled={disabled}
            aria-expanded={open}
            className="flex h-[var(--ms-control-h)] w-7 shrink-0 items-center justify-center rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-muted)] disabled:cursor-not-allowed disabled:opacity-50"
            data-test-id={`${idPrefix}-address-toggle`}
          >
            {open ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {open && (
        <div
          className="space-y-2 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-muted)] p-3"
          data-test-id={`${idPrefix}-address-fields`}
        >
          <AddrRow label={t('addr_index')} narrow>
            <Input
              value={value.postalCode ?? ''}
              onChange={(e) => setField('postalCode', e.target.value)}
              disabled={disabled}
              data-test-id={`${idPrefix}-addr-index`}
            />
          </AddrRow>
          <AddrRow label={t('addr_country')}>
            <div className="flex items-center gap-2">
              {countryFree ? (
                <Input
                  value={value.country ?? ''}
                  onChange={(e) => setField('country', e.target.value)}
                  disabled={disabled}
                  className="flex-1"
                  data-test-id={`${idPrefix}-addr-country-free`}
                />
              ) : (
                <div className="min-w-0 flex-1">
                  <Combobox
                    id={`${idPrefix}-addr-country`}
                    testId={`${idPrefix}-addr-country`}
                    items={countryItems}
                    value={value.country || undefined}
                    onChange={(next) => setField('country', next ?? '')}
                    placeholder=""
                    searchPlaceholder={tCommon('search')}
                    emptyText={tCommon('no_results')}
                    ariaLabel={t('addr_country')}
                    disabled={disabled}
                  />
                </div>
              )}
              <button
                type="button"
                onClick={() => setCountryFree((v) => !v)}
                disabled={disabled}
                aria-label={tCommon('add')}
                className="shrink-0 text-[var(--ms-text-link)] hover:opacity-80 disabled:opacity-50"
                data-test-id={`${idPrefix}-addr-country-add`}
              >
                <Icons.create className="h-4 w-4" />
              </button>
            </div>
          </AddrRow>
          <AddrRow label={t('addr_city')}>
            <Input
              value={value.city ?? ''}
              onChange={(e) => setField('city', e.target.value)}
              disabled={disabled}
              data-test-id={`${idPrefix}-addr-city`}
            />
          </AddrRow>
          <AddrRow label={t('addr_street')}>
            <Input
              value={value.street ?? ''}
              onChange={(e) => setField('street', e.target.value)}
              disabled={disabled}
              data-test-id={`${idPrefix}-addr-street`}
            />
          </AddrRow>
          <AddrRow label={t('addr_house')} narrow>
            <Input
              value={value.house ?? ''}
              onChange={(e) => setField('house', e.target.value)}
              disabled={disabled}
              data-test-id={`${idPrefix}-addr-house`}
            />
          </AddrRow>
          <AddrRow label={t('addr_apartment')} narrow>
            <Input
              value={value.apartment ?? ''}
              onChange={(e) => setField('apartment', e.target.value)}
              disabled={disabled}
              data-test-id={`${idPrefix}-addr-apartment`}
            />
          </AddrRow>
          <AddrRow label={t('addr_other')}>
            <Input
              value={value.addInfo ?? ''}
              onChange={(e) => setField('addInfo', e.target.value)}
              disabled={disabled}
              data-test-id={`${idPrefix}-addr-other`}
            />
          </AddrRow>
          <AddrRow label={t('address_comment_label')}>
            <Textarea
              value={value.comment ?? ''}
              onChange={(e) => setField('comment', e.target.value)}
              disabled={disabled}
              data-test-id={`${idPrefix}-addr-comment`}
            />
          </AddrRow>
        </div>
      )}
    </div>
  );
}
