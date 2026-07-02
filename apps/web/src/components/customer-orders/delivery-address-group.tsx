'use client';

/**
 * Адрес доставки expandable group — moysklad parity.
 *
 * Source: docs/moysklad-reference/visual-captures/03-module/
 *   customerorder/screenshots/d-default.dom.html — fields visible
 *   in the captured form: Город / Улица / Дом / Кв. или офис /
 *   Индекс / Страна / Другое.
 *
 * Storage: serialised into the customer_orders.shipment_address_full
 * JSON column. The denormalised single-line `shipmentAddress` is
 * recomputed from the components on save (server-side TODO).
 */

import { FormField, Input, Textarea } from '@moysklad/ui';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export interface DeliveryAddressFull {
  country?: string;
  index?: string;
  city?: string;
  street?: string;
  building?: string;
  apartment?: string;
  other?: string;
}

export interface DeliveryAddressGroupProps {
  value: DeliveryAddressFull;
  onChange(next: DeliveryAddressFull): void;
  /**
   * Free-form textarea text — moysklad's main «Адрес доставки» input (live
   * customerorder/edit?new: a 280×61 textarea you type into directly, with a
   * ▼ that reveals the structured helper). When `onTextChange` is supplied the
   * collapsed view becomes that editable textarea (instead of a summary
   * button); filling a structured field recomposes the textarea.
   */
  text?: string;
  onTextChange?(next: string): void;
  disabled?: boolean;
  /** Default open/closed; the group stays open by default in moysklad. */
  defaultOpen?: boolean;
}

/** Single-line address composed from the structured parts, moysklad order. */
function composeFull(v: DeliveryAddressFull): string {
  return [v.index, v.country, v.city, v.street, v.building, v.apartment, v.other]
    .map((s) => (s ?? '').trim())
    .filter(Boolean)
    .join(', ');
}

export function DeliveryAddressGroup({
  value,
  onChange,
  text,
  onTextChange,
  disabled,
  defaultOpen = false,
}: DeliveryAddressGroupProps) {
  const t = useTranslations('detail_address');
  const [open, setOpen] = useState(defaultOpen);

  const handleField =
    (field: keyof DeliveryAddressFull) => (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = { ...value, [field]: e.target.value };
      onChange(next);
      // Keep the free-form textarea in sync with the structured helper.
      onTextChange?.(composeFull(next));
    };

  // Compose a single-line preview for the collapsed state.
  const summary = [value.city, value.street, value.building, value.apartment]
    .filter(Boolean)
    .join(', ');

  return (
    <div data-test-id="delivery-address-group">
      {onTextChange ? (
        // moysklad collapsed view: an editable multi-line textarea + ▼ that
        // expands the structured helper.
        <div className="flex items-start gap-1">
          <Textarea
            rows={3}
            value={text ?? ''}
            onChange={(e) => onTextChange(e.target.value)}
            // moysklad parity: the «Адрес доставки» textarea shows NO placeholder
            // (the left label names it) — user 2026-06-20 «hech qanday placeholderlar yo'q».
            disabled={disabled}
            className="min-h-[58px] flex-1 text-[12px]"
            data-test-id="delivery-address-text"
          />
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            disabled={disabled}
            aria-expanded={open}
            className="flex h-[var(--ms-control-h)] w-6 shrink-0 items-center justify-center rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-muted)] disabled:cursor-not-allowed disabled:opacity-50"
            data-test-id="delivery-address-toggle"
          >
            {open ? '▲' : '▼'}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] px-3 py-2 text-left text-sm hover:bg-[var(--ms-bg-muted)] disabled:cursor-not-allowed disabled:opacity-50"
          disabled={disabled}
          aria-expanded={open}
          data-test-id="delivery-address-toggle"
        >
          <span className="truncate text-[var(--ms-text-primary)]">
            {summary || <span className="text-[var(--ms-text-muted)]">{t('placeholder')}</span>}
          </span>
          <span className="ml-2 text-[var(--ms-text-muted)]">{open ? '▲' : '▼'}</span>
        </button>
      )}
      {open && (
        <div
          className="mt-2 grid grid-cols-1 gap-2 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-muted)] p-3 sm:grid-cols-2"
          data-test-id="delivery-address-fields"
        >
          <FormField id="city" label={t('city')}>
            <Input
              value={value.city ?? ''}
              onChange={handleField('city')}
              disabled={disabled}
              data-test-id="delivery-city"
            />
          </FormField>
          <FormField id="street" label={t('street')}>
            <Input
              value={value.street ?? ''}
              onChange={handleField('street')}
              disabled={disabled}
              data-test-id="delivery-street"
            />
          </FormField>
          <FormField id="building" label={t('building')}>
            <Input
              value={value.building ?? ''}
              onChange={handleField('building')}
              disabled={disabled}
              data-test-id="delivery-building"
            />
          </FormField>
          <FormField id="apartment" label={t('apartment')}>
            <Input
              value={value.apartment ?? ''}
              onChange={handleField('apartment')}
              disabled={disabled}
              data-test-id="delivery-apartment"
            />
          </FormField>
          <FormField id="index" label={t('index')}>
            <Input
              value={value.index ?? ''}
              onChange={handleField('index')}
              disabled={disabled}
              data-test-id="delivery-index"
            />
          </FormField>
          <FormField id="country" label={t('country')}>
            <Input
              value={value.country ?? ''}
              onChange={handleField('country')}
              disabled={disabled}
              data-test-id="delivery-country"
            />
          </FormField>
          <div className="sm:col-span-2">
            <FormField id="other" label={t('other')}>
              <Input
                value={value.other ?? ''}
                onChange={handleField('other')}
                disabled={disabled}
                data-test-id="delivery-other"
              />
            </FormField>
          </div>
        </div>
      )}
    </div>
  );
}
