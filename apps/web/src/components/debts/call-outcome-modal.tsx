'use client';

/**
 * «QO'NG'IROQ QILINDI» modali (2026-07-12 talab) — qarzdor kartochkasidagi
 * 4 natija tugmasi:
 *   ✅ To'ladi · 🟡 Bir qismini to'ladi · 🔴 To'lamadi · 🔁 Qayta qo'ng'iroq
 *
 * Natija tanlanadi → ixtiyoriy izoh → «Qayta qo'ng'iroq»da keyingi sana
 * MAJBURIY (server ham tekshiradi). Saqlangach qarzdor «Qo'ng'iroq
 * qilinganlar» bo'limiga tushadi, tarixga esa kind='call' yozuv qo'shiladi.
 *
 * Qarzdorlar ro'yxati, Bugungi qo'ng'iroqlar va detal sahifasi — uchchalasi
 * shu bitta komponentni ishlatadi (bir xil xulq).
 */

import { type CallOutcome, debtApi } from '@/lib/debt-api';
import { Button, Input, Modal, MoneyInput, Textarea } from '@moysklad/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

const OUTCOMES: Array<{ value: CallOutcome; tone: string }> = [
  { value: 'paid_full', tone: 'bg-[var(--ms-success-100)] border-[var(--ms-success-300)]' },
  { value: 'paid_partial', tone: 'bg-[var(--ms-warning-100)] border-[var(--ms-warning-300)]' },
  { value: 'not_paid', tone: 'bg-[var(--ms-destructive-100)] border-[var(--ms-destructive-300)]' },
  { value: 'callback', tone: 'bg-[var(--ms-bg-muted)] border-[var(--ms-border-strong)]' },
];

export function outcomeLabelKey(o: CallOutcome): string {
  return `outcome_${o}`;
}

export function CallOutcomeModal({
  debtId,
  debtorName,
  open,
  onClose,
}: {
  debtId: string;
  debtorName: string;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('pages.debts');
  const qc = useQueryClient();

  const [outcome, setOutcome] = useState<CallOutcome | null>(null);
  const [text, setText] = useState('');
  const [nextAt, setNextAt] = useState('');
  // «Qisman to'ladi» summasi (tiyin) — 2026-07-12 talab.
  const [amountMinor, setAmountMinor] = useState('0');
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      debtApi.markCall(debtId, {
        outcome: outcome as CallOutcome,
        text: text.trim() || undefined,
        nextContactAt: nextAt ? new Date(nextAt).toISOString() : null,
        amountMinor: outcome === 'paid_partial' && amountMinor !== '0' ? amountMinor : undefined,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['debts'] });
      reset();
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  function reset() {
    setOutcome(null);
    setText('');
    setNextAt('');
    setAmountMinor('0');
    setError(null);
  }

  // Majburiylik qoidalari (2026-07-12):
  //   callback     → keyingi sana shart
  //   paid_partial → SUMMA + keyingi sana shart (qoldiq bor — kuzatuv davom etadi)
  //   paid_full    → sana kerak emas (qarz butunlay yopiladi)
  const needsDate = outcome === 'callback' || outcome === 'paid_partial';
  const valid =
    outcome !== null &&
    (!needsDate || nextAt !== '') &&
    (outcome !== 'paid_partial' || (amountMinor !== '' && amountMinor !== '0'));

  return (
    <Modal
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onClose();
        }
      }}
      title={`${t('call_modal_title')} — ${debtorName}`}
      footer={
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            {t('cancel')}
          </Button>
          <Button
            onClick={() => save.mutate()}
            disabled={!valid || save.isPending}
            data-test-id="call-save"
          >
            {t('call_save')}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        {/* 4 natija tugmasi */}
        <div className="grid grid-cols-2 gap-2">
          {OUTCOMES.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setOutcome(o.value)}
              className={[
                'rounded-[var(--ms-radius-default)] border-2 px-3 py-2.5 font-medium text-sm transition-all',
                o.tone,
                outcome === o.value
                  ? 'ring-2 ring-[var(--ms-primary-500)] ring-offset-1'
                  : 'opacity-80 hover:opacity-100',
              ].join(' ')}
              data-test-id={`call-outcome-${o.value}`}
            >
              {t(outcomeLabelKey(o.value) as 'outcome_paid_full')}
            </button>
          ))}
        </div>

        {/* «Qisman to'ladi» — SUMMA majburiy (2026-07-12) */}
        {outcome === 'paid_partial' && (
          <div>
            <div className="mb-1 text-[var(--ms-text-muted)] text-xs">
              {t('call_amount_label')}
              <span className="ml-1 text-[var(--ms-destructive-500)]">*</span>
            </div>
            <MoneyInput
              valueMinor={amountMinor}
              onChangeMinor={setAmountMinor}
              data-test-id="call-amount"
            />
          </div>
        )}

        {/* «To'ladi» — qarz butunlay yopilishi haqida ogohlantirish */}
        {outcome === 'paid_full' && (
          <div className="rounded-[var(--ms-radius-default)] bg-[var(--ms-success-50)] px-3 py-2 text-[var(--ms-success-700)] text-xs">
            {t('call_paid_full_hint')}
          </div>
        )}

        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('call_comment_placeholder')}
          rows={2}
        />

        {/* paid_full'da keyingi sana kerak emas — qarz yopiladi */}
        {outcome !== 'paid_full' && (
          <div>
            <div className="mb-1 text-[var(--ms-text-muted)] text-xs">
              {t('field_next_contact')}
              {needsDate && <span className="ml-1 text-[var(--ms-destructive-500)]">*</span>}
            </div>
            <Input
              type="datetime-local"
              value={nextAt}
              onChange={(e) => setNextAt(e.target.value)}
              data-test-id="call-next-at"
            />
          </div>
        )}

        {error && <div className="text-[var(--ms-destructive-600)] text-sm">{error}</div>}
      </div>
    </Modal>
  );
}
