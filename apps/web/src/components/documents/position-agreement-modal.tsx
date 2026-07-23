'use client';

/**
 * «Kelishuv» (negotiated total) — owner feature 2026-07-17, sales documents.
 *
 * A button in the position-table footer bar. The modal shows the document
 * total, an amount field (auto-focused), and two labelled checkboxes at the
 * end of the row: «Qo'shish» (add) / «Ayirish» (subtract). Neither is ticked
 * by default; saving without a choice paints BOTH checkboxes red and does not
 * save (owner spec). Enter in the amount field moves to Save and saves.
 * A subtract larger than the document total paints the AMOUNT red and blocks
 * (review 2026-07-17: it used to silently zero every line's price).
 *
 * The page applies the signed delta to its positions via
 * `distributeAgreementDelta` (proportional spread — see lib/position-agreement).
 */

import { Button, Checkbox, Modal, MoneyInput, cn, formatMoney } from '@moysklad/ui';
import { useEffect, useRef, useState } from 'react';

export interface PositionAgreementLabels {
  /** Trigger button + modal title — «Договорная цена» / «Kelishuv». */
  button: string;
  /** «Итого» — the current document total line. */
  total: string;
  /** «Сумма» — the extra amount input. */
  amount: string;
  /** «Прибавить» — add checkbox. */
  add: string;
  /** «Отнять» — subtract checkbox. */
  subtract: string;
  /** «Сохранить». */
  save: string;
  /** «Отменить». */
  cancel: string;
}

export function PositionAgreementButton({
  totalMinor,
  currency,
  labels,
  onApply,
  disabled,
}: {
  /** Current LIVE document total (minor units) shown in the modal. */
  totalMinor: bigint;
  currency: string;
  labels: PositionAgreementLabels;
  /** Signed delta in minor units: add ⇒ +amount, subtract ⇒ −amount. */
  onApply: (deltaMinor: bigint) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [amountMinor, setAmountMinor] = useState('');
  const [mode, setMode] = useState<'add' | 'subtract' | null>(null);
  // Owner spec: saving with no checkbox ticked paints BOTH red (and blocks).
  const [warn, setWarn] = useState(false);
  // Review 2026-07-17: subtracting more than the document total paints the
  // amount red and blocks (it would otherwise zero every line's price).
  const [warnAmount, setWarnAmount] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    setAmountMinor('');
    setMode(null);
    setWarn(false);
    setWarnAmount(false);
    // rAF beats Radix Dialog's own open-autofocus (same trick as the pick modal).
    const id = requestAnimationFrame(() => amountRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  const toggleMode = (value: 'add' | 'subtract') => {
    setMode((m) => (m === value ? null : value));
    setWarn(false);
    setWarnAmount(false);
  };

  const save = () => {
    if (!mode) {
      setWarn(true);
      return;
    }
    // MoneyInput emits a plain integer minor string; anything else (e.g. an
    // astronomically large value serialized as «1e+21») must not reach BigInt.
    const amount = /^\d+$/.test(amountMinor) ? BigInt(amountMinor) : 0n;
    if (mode === 'subtract' && amount > totalMinor) {
      setWarnAmount(true);
      return;
    }
    if (amount > 0n) onApply(mode === 'subtract' ? -amount : amount);
    setOpen(false);
  };

  const checkboxRow = (value: 'add' | 'subtract', text: string) => (
    <label
      className={cn(
        'flex cursor-pointer items-center gap-1.5 text-[12px]',
        warn &&
          'rounded-[var(--ms-radius-sm)] text-[var(--ms-action-destructive)] ring-1 ring-[var(--ms-action-destructive)] ring-offset-2',
      )}
    >
      <Checkbox
        checked={mode === value}
        onCheckedChange={() => toggleMode(value)}
        data-test-id={`position-agreement-${value}`}
      />
      {text}
    </label>
  );

  return (
    <>
      {/* Owner 2026-07-23: BLUE button at the table's outer top-right —
          same look in every section. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="inline-flex h-[28px] items-center rounded-[var(--ms-radius-default)] bg-[var(--ms-text-brand)] px-3 font-medium text-[13px] text-white hover:bg-[var(--ms-text-brand-hover,#144e8c)] disabled:cursor-not-allowed disabled:opacity-50"
        data-test-id="position-agreement-button"
      >
        {labels.button}
      </button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title={labels.button}
        widthClass="w-[400px]"
        testId="position-agreement-modal"
        footer={
          <>
            <Button
              ref={saveRef}
              type="button"
              variant="success"
              size="sm"
              onClick={save}
              data-test-id="position-agreement-save"
            >
              {labels.save}
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
              {labels.cancel}
            </Button>
          </>
        }
      >
        <div className="space-y-3 px-4 py-3 text-sm">
          {/* Current document total (read-only). */}
          <div className="flex items-center justify-between">
            <span className="text-[var(--ms-text-muted)]">{labels.total}</span>
            <span className="tabular-nums" data-test-id="position-agreement-total">
              {formatMoney(totalMinor.toString(), currency, { displayAs: 'none' })}
            </span>
          </div>
          {/* Amount + the add/subtract checkboxes at the end of the row. */}
          <div className="flex items-center justify-between gap-3">
            <span className="shrink-0 text-[var(--ms-text-muted)]">{labels.amount}</span>
            <MoneyInput
              ref={amountRef}
              valueMinor={amountMinor}
              onChangeMinor={(v) => {
                setAmountMinor(v);
                setWarnAmount(false);
              }}
              allowEmpty
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  saveRef.current?.focus();
                  save();
                }
              }}
              className={cn(
                'h-8 w-32 text-right',
                warnAmount &&
                  'border-[var(--ms-action-destructive)] ring-1 ring-[var(--ms-action-destructive)]',
              )}
              data-test-id="position-agreement-amount"
            />
            <div className="flex shrink-0 items-center gap-3">
              {checkboxRow('add', labels.add)}
              {checkboxRow('subtract', labels.subtract)}
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}
