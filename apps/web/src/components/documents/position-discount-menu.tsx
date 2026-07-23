'use client';

/**
 * «Скидка» bulk discount/markup — moysklad parity. The position table's «Скидка»
 * header is a link that opens a «Скидка/наценка» modal: pick «Скидка» or
 * «Наценка», enter a %, and it's applied to the selected positions (or all
 * positions when none are selected).
 *
 * Discount → sets each line's `discount` field (the backend caps it at 0..100).
 * Markup (наценка) → raises the unit price by the % instead, because a markup
 * can't be a negative discount in our model (the API rejects discount < 0).
 */

import { Button, Modal } from '@moysklad/ui';
import { useState } from 'react';

export interface PositionDiscountMenuLabels {
  /** Column header text — «Скидка». */
  label: string;
  /** Modal title — «Скидка/наценка». */
  title: string;
  /** «Выбрано N позиций» (N interpolated by the caller). */
  selectedText: string;
  /** «Скидка» radio. */
  discountLabel: string;
  /** «Наценка» radio. */
  markupLabel: string;
  /** Apply button when «Скидка» is chosen — «Установить скидку». */
  applyDiscountLabel: string;
  /** Apply button when «Наценка» is chosen — «Установить наценку». */
  applyMarkupLabel: string;
  /** «Отменить». */
  cancelLabel: string;
}

export function PositionDiscountMenu({
  label,
  title,
  selectedText,
  discountLabel,
  markupLabel,
  applyDiscountLabel,
  applyMarkupLabel,
  cancelLabel,
  onApply,
}: PositionDiscountMenuLabels & {
  /** Applies the chosen percent. `mode` selects discount vs price-markup. */
  onApply: (mode: 'discount' | 'markup', percent: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'discount' | 'markup'>('discount');
  const [percent, setPercent] = useState('');

  const apply = () => {
    const v = Number(percent.replace(',', '.'));
    if (!Number.isFinite(v) || v < 0) return;
    onApply(mode, v);
    setOpen(false);
    setPercent('');
    setMode('discount');
  };

  const row = (value: 'discount' | 'markup', text: string) => (
    <label className="flex items-center gap-2 text-[12px] text-[var(--ms-text-primary)]">
      <input
        type="radio"
        name="discount-markup-mode"
        checked={mode === value}
        onChange={() => setMode(value)}
        className="h-3.5 w-3.5"
        data-test-id={`position-discount-mode-${value}`}
      />
      <span className="w-28">{text}</span>
      <input
        type="text"
        inputMode="decimal"
        value={mode === value ? percent : ''}
        onChange={(e) => {
          setMode(value);
          setPercent(e.target.value);
        }}
        className="h-7 w-20 rounded-[var(--ms-radius-sm)] border border-[var(--ms-border-default)] px-1.5 text-right text-[12px] tabular-nums focus:border-[var(--ms-text-brand)] focus:outline-none"
        data-test-id={`position-discount-input-${value}`}
      />
      <span className="text-[var(--ms-text-muted)]">%</span>
    </label>
  );

  return (
    <>
      {/* Owner 2026-07-23: a real BUTTON, not a link — the header text read as
          plain text and nobody knew it was clickable. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-[22px] items-center rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] px-2 font-normal text-[12px] text-[var(--ms-text-primary)] hover:bg-[var(--ms-bg-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--ms-text-brand)]"
        data-test-id="position-discount-menu"
      >
        {label}
      </button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title={title}
        widthClass="w-[400px]"
        testId="position-discount-modal"
        footer={
          <>
            <Button
              type="button"
              variant="success"
              size="sm"
              onClick={apply}
              data-test-id="position-discount-apply"
            >
              {mode === 'discount' ? applyDiscountLabel : applyMarkupLabel}
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
              {cancelLabel}
            </Button>
          </>
        }
      >
        <div className="space-y-3 py-1">
          <p className="text-[12px] text-[var(--ms-text-muted)]">{selectedText}</p>
          {row('discount', discountLabel)}
          {row('markup', markupLabel)}
        </div>
      </Modal>
    </>
  );
}
