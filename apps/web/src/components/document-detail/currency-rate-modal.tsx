'use client';

/**
 * moysklad «Курс валюты документа» — the rate editor that opens from the «✎» next
 * to the «1 {cur} = N UZS» helper on every foreign-currency document. Two choices,
 * exactly like moysklad:
 *   ○ 1 {cur} = {reference} UZS   — «Текущий курс валюты из справочника» (use the
 *                                    live reference rate; clears any per-doc override)
 *   ● 1 {cur} = [____] UZS        — a manual per-document rate
 * «Изменить курс» applies; «Отменить» closes untouched. The caller stores the
 * choice as a rate-override (null ⇒ use the reference). Shared across CO/PO/money docs.
 */

import { Button, Input, Modal, RadioGroup } from '@moysklad/ui';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

/** ru-RU thin-space thousands, up to 4 dp — matches moysklad's «12 200» / «12 200,5». */
function fmtRate(v: string): string {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString('ru-RU', { maximumFractionDigits: 4 }) : v;
}

export function CurrencyRateModal({
  open,
  onOpenChange,
  currency,
  referenceRate,
  currentOverride,
  onApply,
  disabled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Document currency code, e.g. "USD". */
  currency: string;
  /** Reference (справочник) rate for 1 {currency} in base units. */
  referenceRate: string;
  /** Current per-document override (null ⇒ using the reference rate). */
  currentOverride: string | null;
  /** Apply the choice: null ⇒ use reference, string ⇒ manual rate. */
  onApply: (override: string | null) => void;
  disabled?: boolean;
}) {
  const t = useTranslations('currency_rate');
  const [mode, setMode] = useState<'reference' | 'custom'>(
    currentOverride ? 'custom' : 'reference',
  );
  const [customValue, setCustomValue] = useState(currentOverride ?? referenceRate);

  // Re-seed from the live props each time the modal opens.
  useEffect(() => {
    if (open) {
      setMode(currentOverride ? 'custom' : 'reference');
      setCustomValue(currentOverride ?? referenceRate);
    }
  }, [open, currentOverride, referenceRate]);

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={t('title')}>
      <div className="flex flex-col gap-4 p-4 text-sm">
        <RadioGroup
          value={mode}
          onChange={setMode}
          className="gap-4"
          options={[
            {
              value: 'reference' as const,
              label: (
                <span className="tabular-nums">
                  1 {currency} = {fmtRate(referenceRate)} UZS
                </span>
              ),
              description: t('from_reference'),
              testId: 'rate-mode-reference',
            },
            {
              value: 'custom' as const,
              // The rate field lives INSIDE the option label, so clicking it
              // selects «custom» through the label's htmlFor — the same
              // behaviour the hand-rolled <label><input type="radio"> had.
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <span>1 {currency} =</span>
                  <Input
                    value={customValue}
                    onChange={(e) => {
                      setCustomValue(e.target.value);
                      setMode('custom');
                    }}
                    inputMode="decimal"
                    className="w-28 text-right tabular-nums"
                    data-test-id="rate-custom-input"
                  />
                  <span>UZS</span>
                </span>
              ),
              testId: 'rate-mode-custom',
            },
          ]}
        />

        <div className="flex justify-start gap-2 pt-1">
          <Button
            variant="success"
            size="sm"
            disabled={disabled}
            onClick={() => {
              onApply(mode === 'reference' ? null : customValue.trim() || referenceRate);
              onOpenChange(false);
            }}
            data-test-id="rate-apply"
          >
            {t('apply')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onOpenChange(false)}
            data-test-id="rate-cancel"
          >
            {t('cancel')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
