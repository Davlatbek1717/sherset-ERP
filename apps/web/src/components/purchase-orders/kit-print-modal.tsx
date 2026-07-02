'use client';

import { Button, Checkbox, Modal } from '@moysklad/ui';
import { useEffect, useState } from 'react';

export interface KitPrintForm {
  /** null = the standard built-in «Заказ поставщику» form (no custom template). */
  id: string | null;
  name: string;
}

export interface KitPrintModalLabels {
  title: string;
  /** primary action — «Распечатать». */
  confirm: string;
  /** secondary action — «Отменить». */
  cancel: string;
}

export interface KitPrintModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  forms: KitPrintForm[];
  selectedCount: number;
  labels: KitPrintModalLabels;
  /** Called with the ticked form ids (null = standard form) on «Распечатать». */
  onConfirm: (templateIds: Array<string | null>) => void;
}

const STANDARD_KEY = '__standard__';
const keyOf = (f: KitPrintForm): string => f.id ?? STANDARD_KEY;

/**
 * moysklad «Печать ▸ Комплект…» dialog — choose which print forms to bundle
 * into ONE combined PDF for the selected documents. Live-grounded 2026-06-18
 * (online.moysklad.uz #purchaseorder): a checkbox per available form,
 * «Распечатать» (enabled once ≥1 form is ticked) + «Отменить». The first
 * (standard) form is pre-ticked, matching the moysklad default.
 *
 * Presentational by design — the page owns the form list, the locale-resolved
 * labels and the actual download call. This mirrors {@link MassEditModal},
 * whose i18n also lives at the call site (the message files are currently
 * owned by a parallel session, so labels are passed in, not read via t()).
 */
export function KitPrintModal({
  open,
  onOpenChange,
  forms,
  selectedCount,
  labels,
  onConfirm,
}: KitPrintModalProps) {
  const [checked, setChecked] = useState<Set<string>>(new Set());

  // Reset on each open: pre-tick the first (standard) form like moysklad, so a
  // stale tick from a previous open never silently prints the wrong set.
  useEffect(() => {
    if (open) {
      const first = forms[0];
      setChecked(new Set(first ? [keyOf(first)] : []));
    }
  }, [open, forms]);

  const toggle = (f: KitPrintForm) => {
    setChecked((prev) => {
      const next = new Set(prev);
      const k = keyOf(f);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const pickedIds = forms.filter((f) => checked.has(keyOf(f))).map((f) => f.id);
  const canPrint = pickedIds.length > 0 && selectedCount > 0;

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={labels.title}
      widthClass="w-[420px]"
      testId="kit-print-modal"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {labels.cancel}
          </Button>
          <Button
            variant="primary"
            disabled={!canPrint}
            data-test-id="kit-print-confirm"
            onClick={() => {
              onConfirm(pickedIds);
              onOpenChange(false);
            }}
          >
            {labels.confirm}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-2.5 px-4 py-3">
        {forms.map((f) => {
          const k = keyOf(f);
          return (
            <label
              key={k}
              className="flex cursor-pointer items-center gap-2 text-[var(--ms-text-primary)] text-sm"
            >
              <Checkbox checked={checked.has(k)} onCheckedChange={() => toggle(f)} />
              <span className="truncate">{f.name}</span>
            </label>
          );
        })}
      </div>
    </Modal>
  );
}
