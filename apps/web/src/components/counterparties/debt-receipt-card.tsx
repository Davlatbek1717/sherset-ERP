'use client';

/**
 * «Hisob-kitob cheki» — mijozga Telegram orqali BUTUN hisobini yuborish
 * (egasi, 2026-08-16: «mijozlar bo'limidan qarzdorligi bo'yicha chek yuborish…
 * u mijoz bilan bo'lgan barcha cheklar borishi kerak»).
 *
 * 🔴 IKKI QADAM, ATAYLAB: tugma darhol YUBORMAYDI — avval AYNAN ketadigan matn
 * ko'rsatiladi. Xabar egasining SHAXSIY Telegram raqamidan mijozga ketadi va
 * ortga qaytarib bo'lmaydi; «tasodifan bosildi» degan holat bo'lmasligi kerak.
 * Ko'rib chiqish serverdan keladi (mijoz ko'radigan matnning O'ZI), ya'ni bu
 * yerda ikkinchi format nusxasi YO'Q — u eskirib, oynadagi matn haqiqatdan
 * ajralib qolardi.
 */

import { CounterpartyFormCard } from '@/components/counterparty-form-layout';
import { api } from '@/lib/api-client';
import { Button, Modal, useToast } from '@moysklad/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface DebtReceiptPreview {
  counterpartyName: string;
  phone: string | null;
  messages: string[];
  docCount: number;
  finalBalanceMinor: string;
  canSend: boolean;
  reason: string | null;
}

export function DebtReceiptCard({ counterpartyId }: { counterpartyId: string }) {
  const t = useTranslations('pages.counterparties');
  const tCommon = useTranslations('common');
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  // `enabled: open` — karta ochilishida so'rov yuborilmaydi: hisob yig'ish
  // butun tarixni o'qiydi, har karta ochilishida bu behuda yuk bo'lardi.
  const preview = useQuery<DebtReceiptPreview>({
    queryKey: ['debt-receipt-preview', counterpartyId],
    queryFn: () => api.get(`/counterparty-debt-receipts/${counterpartyId}/preview`),
    enabled: open,
    staleTime: 0,
  });

  const sendMut = useMutation({
    mutationFn: () =>
      api.post<{ queued: number }>(`/counterparty-debt-receipts/${counterpartyId}/send`, {}),
    onSuccess: (r: { queued?: number }) => {
      setOpen(false);
      toast.success(t('debt_receipt_queued', { n: r?.queued ?? 1 }));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const data = preview.data;

  return (
    <CounterpartyFormCard title={t('debt_receipt_title')}>
      <p className="text-[var(--ms-text-muted)] text-sm">{t('debt_receipt_hint')}</p>
      <Button
        variant="secondary"
        className="mt-3"
        onClick={() => setOpen(true)}
        data-test-id="debt-receipt-open"
      >
        {t('debt_receipt_btn')}
      </Button>

      <Modal
        open={open}
        onOpenChange={(v) => (v ? undefined : setOpen(false))}
        title={t('debt_receipt_title')}
        widthClass="w-[560px]"
        testId="debt-receipt-modal"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {tCommon('cancel')}
            </Button>
            <Button
              onClick={() => sendMut.mutate()}
              disabled={!data?.canSend || sendMut.isPending || preview.isLoading}
              data-test-id="debt-receipt-send"
            >
              {t('debt_receipt_send')}
            </Button>
          </div>
        }
      >
        {preview.isLoading && (
          <div className="text-[var(--ms-text-muted)] text-sm">{tCommon('loading')}</div>
        )}
        {preview.error && (
          <div className="text-[var(--ms-text-destructive)] text-sm">
            {(preview.error as Error).message}
          </div>
        )}
        {data && (
          <div className="flex flex-col gap-3">
            <div className="text-[var(--ms-text-secondary)] text-sm">
              {t('debt_receipt_to', {
                name: data.counterpartyName,
                phone: data.phone ?? '—',
              })}
            </div>

            {/* Yuborib bo'lmasa SABAB ko'rinadi — «tugma ishlamadi» eng qimmat
                shikoyat (prodda o'lchangan: raqam ulanmagan / telefon yo'q). */}
            {!data.canSend && data.reason && (
              <div
                className="rounded-[var(--ms-radius-sm)] bg-[var(--ms-warning-50,#fffbeb)] px-3 py-2 text-[var(--ms-text-warning,#b45309)] text-sm"
                data-test-id="debt-receipt-reason"
              >
                {data.reason}
              </div>
            )}

            {/* Mijoz KO'RADIGAN matnning o'zi — serverdan kelgan holicha. */}
            {data.messages.map((m, i) => (
              <pre
                // biome-ignore lint/suspicious/noArrayIndexKey: matn bo'laklari tartibli va o'zgarmaydi
                key={i}
                className="max-h-[320px] overflow-auto whitespace-pre-wrap rounded-[var(--ms-radius-sm)] bg-[var(--ms-bg-muted)] p-3 text-[13px] leading-relaxed"
                data-test-id="debt-receipt-text"
              >
                {m}
              </pre>
            ))}
            {data.messages.length > 1 && (
              <div className="text-[var(--ms-text-muted)] text-xs">
                {t('debt_receipt_parts', { n: data.messages.length })}
              </div>
            )}
          </div>
        )}
      </Modal>
    </CounterpartyFormCard>
  );
}
