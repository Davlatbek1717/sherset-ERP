'use client';

/**
 * TO'LOVNI QAYTARISH (storno) MODALI — 2026-07-16 talab.
 *
 * Kassir/operator xato summa kiritgan bo'lsa, to'lovni shu yerdan qaytaradi.
 * Printsiplar (server bilan bir xil):
 *   • to'lov O'CHMAYDI — «qaytarilgan» belgilanadi, tarixda qoladi;
 *   • SABAB majburiy — tugma sababsiz bosilmaydi;
 *   • qarz to'liq yopiq bo'lib QAYTA OCHILSA — keyingi qo'ng'iroq sanasi
 *     so'raladi (ixtiyoriy, lekin default bugun 09:00 taklif qilinadi),
 *     mijoz qo'ng'iroq jadvalidan tushib qolmasin;
 *   • server faqat to'lovni KIRITGAN xodim yoki RAHBARga ruxsat beradi —
 *     xatolik xabari shundoq ko'rsatiladi.
 */

import { debtApi, todayAt9InputValue } from '@/lib/debt-api';
import { Button, Input, Modal, Textarea, formatMoney } from '@moysklad/ui';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

/** Modalga kerak bo'lgan minimal to'lov ma'lumoti (detail va lenta qatorlariga mos). */
export interface ReversablePayment {
  id: string;
  amountMinor: string;
  createdAt: string;
  receivedByName: string | null;
  sourceName: string | null;
}

export function ReversePaymentModal({
  debtId,
  payment,
  open,
  onClose,
  onReversed,
}: {
  debtId: string;
  payment: ReversablePayment | null;
  open: boolean;
  onClose: () => void;
  /** Muvaffaqiyatdan keyin ro'yxatlarni yangilash (invalidateQueries). */
  onReversed: () => void;
}) {
  const t = useTranslations('pages.debts');
  const [reason, setReason] = useState('');
  const [nextContact, setNextContact] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Har ochilishda toza forma — oldingi storno sababi yangi to'lovga o'tib qolmasin.
  useEffect(() => {
    if (open) {
      setReason('');
      setNextContact(todayAt9InputValue());
      setError(null);
    }
  }, [open]);

  const reverse = useMutation({
    mutationFn: () =>
      debtApi.reversePayment(debtId, payment?.id ?? '', {
        reason: reason.trim(),
        nextContactAt: nextContact ? new Date(nextContact).toISOString() : null,
      }),
    onSuccess: () => {
      onReversed();
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  const when = payment
    ? new Date(payment.createdAt).toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={t('reverse_title')}
      testId="reverse-payment-modal"
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button variant="secondary" onClick={onClose} data-test-id="reverse-cancel">
            {t('cancel')}
          </Button>
          <Button
            variant="destructive"
            loading={reverse.isPending}
            disabled={reason.trim().length === 0}
            onClick={() => reverse.mutate()}
            data-test-id="reverse-confirm"
          >
            {t('reverse_confirm')}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        {/* Qaysi to'lov qaytarilayotgani — adashib boshqasini bekor qilmaslik uchun */}
        {payment && (
          <div
            className="rounded-[var(--ms-radius-sm)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-muted)] px-3 py-2 text-sm"
            data-test-id="reverse-payment-info"
          >
            <div className="font-semibold tabular-nums">{formatMoney(payment.amountMinor)}</div>
            <div className="text-[var(--ms-text-secondary)] text-xs">
              {when}
              {payment.sourceName ? ` · ${payment.sourceName}` : ''}
              {payment.receivedByName ? ` · ${payment.receivedByName}` : ''}
            </div>
          </div>
        )}

        {/* Nima bo'lishini OLDINDAN aytamiz — «qaytardim, endi nima?» degan savol qolmasin */}
        <div className="rounded-[var(--ms-radius-sm)] border border-[var(--ms-warning-300)] bg-[var(--ms-warning-100)] px-3 py-2 text-[var(--ms-text-secondary)] text-xs">
          {t('reverse_warning')}
        </div>

        <div>
          <div className="mb-1 text-[var(--ms-text-secondary)] text-xs">
            {t('reverse_reason')} <span className="text-[var(--ms-text-destructive)]">*</span>
          </div>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('reverse_reason_placeholder')}
            rows={3}
            data-test-id="reverse-reason"
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
            data-test-id="reverse-next-contact"
          />
        </div>

        {error && (
          <div className="text-[var(--ms-text-destructive)] text-sm" data-test-id="reverse-error">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
