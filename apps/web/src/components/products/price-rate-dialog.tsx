'use client';

/**
 * «Курс валюты документа» — the per-price currency-rate dialog opened by the ✏
 * next to a product price row (moysklad parity, live-grounded 2026-06-20:
 * docs/audits/products-new-grounding-2026-06-20/price-pencil-kurs-valyuty.png).
 *
 * moysklad layout:
 *   Курс валюты документа                              [×]
 *   ○ 1 = {refRate} {BASE}   — Текущий курс валюты из справочника
 *   ● 1 = [ input ] {BASE}
 *   [Изменить курс]  [Отменить]
 *
 * Labels are moysklad's own Russian terms, which per project policy stay as-is in
 * both locales (they are not user-authored copy) — so they live here as literals
 * rather than i18n keys. The reference rate is REAL data from /currencies; the
 * custom rate is a per-row override held by the parent. moysklad's product data
 * model stores only {value, currency} per price (no per-price rate), so this
 * dialog is the document/preview rate — it is NOT persisted onto the product.
 */

import { Button } from '@moysklad/ui';
import { useEffect } from 'react';

export interface PriceRateDialogProps {
  open: boolean;
  onClose(): void;
  /** ISO code of the price's currency (e.g. "USD"). */
  currencyCode: string;
  /** Account base-currency ISO code (e.g. "UZS"). */
  baseCode: string;
  /** Reference rate (decimal string): 1 currencyCode = referenceRate baseCode. */
  referenceRate: string;
  /** Current per-row override (decimal string) or null when using the reference. */
  customRate: string | null;
  /** Apply: null = use the reference rate; a string = a custom rate. */
  onApply(rate: string | null): void;
}

export function PriceRateDialog(props: PriceRateDialogProps) {
  const { open, onClose, currencyCode, baseCode, referenceRate, customRate, onApply } = props;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const useCustom = customRate != null;
  // Draft shown in the custom-rate input (defaults to the reference rate).
  const draft = customRate ?? referenceRate;

  return (
    <div
      className="fixed inset-0 z-[var(--ms-z-popover)] flex items-center justify-center bg-black/30"
      data-test-id="price-rate-dialog-backdrop"
    >
      <div
        className="w-[400px] max-w-[92vw] rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-5 shadow-[var(--ms-shadow-md)]"
        // biome-ignore lint/a11y/useSemanticElements: lightweight controlled modal; native <dialog> needs imperative showModal() incompatible with this controlled render-prop open state
        role="dialog"
        aria-modal="true"
        aria-label="Курс валюты документа"
        data-test-id="price-rate-dialog"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-[15px] text-[var(--ms-text-primary)]">
            Курс валюты документа
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="rounded p-1 text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-muted)]"
            data-test-id="price-rate-dialog-close"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3 text-sm">
          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="rate-mode"
              checked={!useCustom}
              onChange={() => onApply(null)}
              className="mt-1"
              data-test-id="price-rate-reference"
            />
            <span>
              <span className="text-[var(--ms-text-primary)]">
                1 = {referenceRate} {baseCode}
              </span>
              <span className="block text-[var(--ms-text-muted)] text-xs">
                Текущий курс валюты из справочника
              </span>
            </span>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="rate-mode"
              checked={useCustom}
              onChange={() => onApply(draft)}
              data-test-id="price-rate-custom-radio"
            />
            <span className="flex items-center gap-1.5 text-[var(--ms-text-primary)]">
              1 =
              <input
                type="text"
                inputMode="decimal"
                value={draft}
                disabled={!useCustom}
                onChange={(e) => onApply(e.target.value.replace(/[^\d.]/g, ''))}
                className="h-8 w-28 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] px-2 text-right tabular-nums disabled:bg-[var(--ms-bg-muted)]"
                data-test-id="price-rate-custom-input"
                aria-label={`Курс ${currencyCode}`}
              />
              {baseCode}
            </span>
          </label>
        </div>

        <div className="mt-5 flex items-center gap-2">
          <Button
            type="button"
            variant="success"
            size="sm"
            onClick={onClose}
            data-test-id="price-rate-apply"
          >
            Изменить курс
          </Button>
          <Button type="button" variant="tertiary" size="sm" onClick={onClose}>
            Отменить
          </Button>
        </div>
      </div>
    </div>
  );
}
