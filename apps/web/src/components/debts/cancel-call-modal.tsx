'use client';

/**
 * QO'NG'IROQ NATIJASINI BEKOR QILISH MODALI — 2026-07-16 talab.
 *
 * Operator xato natija qo'ygan bo'lsa («to'ladi / qisman / to'lamadi / qayta
 * qo'ng'iroq»), muloqot tarixidagi o'sha yozuvdan amalni qaytaradi.
 * Printsiplar (to'lov stornosi bilan bir intizom, server bilan bir xil):
 *   • yozuv O'CHMAYDI — «bekor qilingan» belgilanadi, tarixda qoladi;
 *   • SABAB majburiy — tugma sababsiz bosilmaydi;
 *   • natija TO'LOV YARATGAN bo'lsa (to'ladi/qisman) — to'lov ham birga
 *     storno bo'ladi, bu OLDINDAN ogohlantiriladi («qaytardim, pul-chi?»
 *     degan savol qolmasin);
 *   • server faqat yozuvni KIRITGAN xodim yoki RAHBARga ruxsat beradi.
 */

import { type CallOutcome, type DebtNoteRow, debtApi, todayAt9InputValue } from '@/lib/debt-api';
import { Button, Input, Modal, Textarea } from '@moysklad/ui';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

export function CancelCallModal({
  debtId,
  note,
  open,
  onClose,
  onCanceled,
}: {
  debtId: string;
  note: DebtNoteRow | null;
  open: boolean;
  onClose: () => void;
  /** Muvaffaqiyatdan keyin ro'yxatlarni yangilash (invalidateQueries). */
  onCanceled: () => void;
}) {
  const t = useTranslations('pages.debts');
  const [reason, setReason] = useState('');
  const [nextContact, setNextContact] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Har ochilishda toza forma — oldingi sabab yangi yozuvga o'tib qolmasin.
  useEffect(() => {
    if (open) {
      setReason('');
      setNextContact(todayAt9InputValue());
      setError(null);
    }
  }, [open]);

  const cancel = useMutation({
    mutationFn: () =>
      debtApi.cancelCallNote(debtId, note?.id ?? '', {
        reason: reason.trim(),
        nextContactAt: nextContact ? new Date(nextContact).toISOString() : null,
      }),
    onSuccess: () => {
      onCanceled();
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  const outcomeLabel = (o: CallOutcome): string =>
    o === 'paid_full'
      ? t('outcome_paid_full')
      : o === 'paid_partial'
        ? t('outcome_paid_partial')
        : o === 'not_paid'
          ? t('outcome_not_paid')
          : t('outcome_callback');

  const when = note
    ? new Date(note.createdAt).toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  // To'lov yaratgan natija — pul ham qaytishini alohida ogohlantiramiz.
  const hasPayment = note?.paymentId != null;

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={t('cancel_call_title')}
      testId="cancel-call-modal"
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button variant="secondary" onClick={onClose} data-test-id="cancel-call-close">
            {t('cancel')}
          </Button>
          <Button
            variant="destructive"
            loading={cancel.isPending}
            disabled={reason.trim().length === 0}
            onClick={() => cancel.mutate()}
            data-test-id="cancel-call-confirm"
          >
            {t('cancel_call_confirm')}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        {/* Qaysi yozuv bekor qilinayotgani — adashib boshqasini bekor qilmaslik uchun */}
        {note && (
          <div
            className="rounded-[var(--ms-radius-sm)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-muted)] px-3 py-2 text-sm"
            data-test-id="cancel-call-info"
          >
            {note.outcome && <div className="font-semibold">{outcomeLabel(note.outcome)}</div>}
            <div className="text-[var(--ms-text-secondary)] text-xs">
              {when}
              {note.authorName ? ` · ${note.authorName}` : ''}
            </div>
            <div className="mt-0.5 text-[var(--ms-text-secondary)] text-xs">{note.text}</div>
          </div>
        )}

        {/* Nima bo'lishini OLDINDAN aytamiz — pul qaytishi kutilmagan bo'lmasin */}
        <div className="rounded-[var(--ms-radius-sm)] border border-[var(--ms-warning-300)] bg-[var(--ms-warning-100)] px-3 py-2 text-[var(--ms-text-secondary)] text-xs">
          {hasPayment ? t('cancel_call_warning_payment') : t('cancel_call_warning')}
        </div>

        <div>
          <div className="mb-1 text-[var(--ms-text-secondary)] text-xs">
            {t('cancel_call_reason')} <span className="text-[var(--ms-text-destructive)]">*</span>
          </div>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('cancel_call_reason_placeholder')}
            rows={3}
            data-test-id="cancel-call-reason"
          />
        </div>

        <div>
          <div className="mb-1 text-[var(--ms-text-secondary)] text-xs">
            {t('field_next_contact')}
          </div>
          <Input
            type="datetime-local"
            value={nextContact}
            onChange={(e) => setNextContact(e.target.value)}
            data-test-id="cancel-call-next-contact"
          />
        </div>

        {error && (
          <div
            className="text-[var(--ms-text-destructive)] text-sm"
            data-test-id="cancel-call-error"
          >
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
