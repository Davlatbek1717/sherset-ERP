'use client';

import { api } from '@/lib/api-client';
import { Badge, Button, Input, NativeSelect, formatDate, formatMoney } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

type AcceptanceState =
  | 'open'
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'escalated'
  | 'force_accepted'
  | 'stale';

interface QueueRow {
  id: string;
  name: string;
  acceptanceState: AcceptanceState;
  acceptanceChangedAt: string | null;
  openedAt: string;
  closedAt: string | null;
  expectedCashMinor: string | null;
  closingCashMinor: string | null;
  discrepancyMinor: string | null;
  salesCount: number;
  salesSumMinor: string;
  cashier: { id: string; name: string } | null;
  cashDesk: { id: string; name: string; currency: string } | null;
  store: { id: string; name: string } | null;
  awaitsCashier: boolean;
}

interface QueueResponse {
  count: number;
  rows: QueueRow[];
}

/** Rad etish sabablari — BE'dagi yopiq ro'yxat (`SHIFT_REASON_CODES.reject`). */
const REJECT_REASONS = [
  'variance_unexplained',
  'zreport_mismatch',
  'cash_shortage',
  'document_missing',
  'discipline',
  'other',
] as const;

/**
 * SMENA YAKUNINI QABUL QILISH — menejer ekrani (MK08 / 4M TZ §6).
 *
 * Savolga javob beradi: «yopilgan smenalardan qaysi birini hali hech kim
 * ko'rmagan». Tartib — eng uzoq kutgani birinchi.
 *
 * ⚠️ Bu ekranda summalar TAHRIRLANMAYDI (kassa farqlari ekranidagi bilan bir
 * qoida): qabul = dalilni ko'rdim degani. Raqam noto'g'ri bo'lsa yo'l bitta —
 * rad etish → kassir tushuntiradi → qayta ko'rik.
 */
export default function SmenaQabuliPage() {
  const t = useTranslations('pages.shiftAcceptance');
  const qc = useQueryClient();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reasonById, setReasonById] = useState<Record<string, string>>({});
  const [commentById, setCommentById] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery<QueueResponse>({
    queryKey: ['shift-acceptance-queue'],
    queryFn: () => api.get<QueueResponse>('/cashier-sessions/acceptance/queue'),
  });

  const transition = useMutation({
    mutationFn: (v: { id: string; action: string; reasonCode?: string; comment?: string }) =>
      api.post(`/cashier-sessions/acceptance/${v.id}/transition`, {
        action: v.action,
        ...(v.reasonCode ? { reasonCode: v.reasonCode } : {}),
        ...(v.comment ? { comment: v.comment } : {}),
      }),
    onSuccess: () => {
      setRejectingId(null);
      qc.invalidateQueries({ queryKey: ['shift-acceptance-queue'] });
      // Javobgarlik taxtasi shu ro'yxatdan oziqlanadi — u ham yangilansin,
      // aks holda menejer qabul qilgan smena u yerda osilib turardi.
      qc.invalidateQueries({ queryKey: ['accountability'] });
    },
  });

  const rows = data?.rows ?? [];

  return (
    <div className="p-4" data-test-id="shift-acceptance-page">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-semibold text-[var(--ms-text-primary)] text-lg">
          {t('title')}
          {rows.length > 0 && (
            <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-700 text-xs">
              {rows.length}
            </span>
          )}
        </h1>
      </div>

      <p className="mb-3 text-[var(--ms-text-muted)] text-xs">{t('hint')}</p>

      {isLoading && <p className="text-[var(--ms-text-muted)] text-sm">{t('loading')}</p>}

      {!isLoading && rows.length === 0 && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-8 text-center">
          <p className="font-medium text-emerald-800 text-sm">{t('empty_title')}</p>
          <p className="mt-1 text-emerald-700 text-xs">{t('empty_hint')}</p>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {rows.map((s) => {
          const currency = s.cashDesk?.currency ?? 'UZS';
          const discrepancy = s.discrepancyMinor ? BigInt(s.discrepancyMinor) : null;
          const shortage = discrepancy != null && discrepancy < 0n;
          return (
            <div
              key={s.id}
              data-test-id={`shift-acceptance-${s.id}`}
              className={`rounded-xl border p-4 ${
                shortage ? 'border-red-200 bg-red-50/40' : 'border-[var(--ms-border)]'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge tone={s.awaitsCashier ? 'warning' : 'neutral'}>
                      {t(`state_${s.acceptanceState}`)}
                    </Badge>
                    <span className="font-medium text-[var(--ms-text-primary)] text-sm">
                      {s.cashier?.name ?? '—'}
                    </span>
                    {s.cashDesk && (
                      <span className="text-[var(--ms-text-muted)] text-xs">{s.cashDesk.name}</span>
                    )}
                  </div>

                  <div className="mt-1 text-[var(--ms-text-muted)] text-xs">
                    {s.closedAt ? formatDate(s.closedAt) : formatDate(s.openedAt)}
                    {s.store && ` · ${s.store.name}`}
                    {` · ${t('sales_count')}: ${s.salesCount}`}
                  </div>

                  {/* Faqat O'QISH: bu ekran raqamni tahrirlamaydi. */}
                  <div className="mt-1 text-[var(--ms-text-muted)] text-xs">
                    {t('expected')}:{' '}
                    {s.expectedCashMinor ? formatMoney(BigInt(s.expectedCashMinor), currency) : '—'}{' '}
                    · {t('counted')}:{' '}
                    {s.closingCashMinor ? formatMoney(BigInt(s.closingCashMinor), currency) : '—'}
                    {discrepancy != null && discrepancy !== 0n && (
                      <span
                        className={`ml-2 font-semibold ${
                          shortage ? 'text-red-700' : 'text-amber-700'
                        }`}
                      >
                        {t(shortage ? 'shortage' : 'surplus')}: {formatMoney(discrepancy, currency)}
                      </span>
                    )}
                  </div>

                  {s.awaitsCashier && (
                    <p className="mt-2 text-amber-700 text-xs">{t('awaits_cashier')}</p>
                  )}
                </div>

                <a
                  href={`/retail/sessions/${s.id}`}
                  className="whitespace-nowrap text-[var(--ms-brand)] text-xs hover:underline"
                >
                  {t('open_z_report')} →
                </a>
              </div>

              {/* Qabul / rad etish — smena kassir javobini kutmayotgan bo'lsa. */}
              {!s.awaitsCashier && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    disabled={transition.isPending}
                    onClick={() => transition.mutate({ id: s.id, action: 'accept' })}
                    data-test-id={`shift-accept-${s.id}`}
                  >
                    {t('accept')}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={transition.isPending}
                    onClick={() => setRejectingId(rejectingId === s.id ? null : s.id)}
                    data-test-id={`shift-reject-open-${s.id}`}
                  >
                    {t('reject')}
                  </Button>
                </div>
              )}

              {rejectingId === s.id && (
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-[var(--ms-text-muted)] text-xs">{t('reason')}</span>
                    <NativeSelect
                      value={reasonById[s.id] ?? ''}
                      onChange={(e) => setReasonById((p) => ({ ...p, [s.id]: e.target.value }))}
                      data-test-id={`shift-reject-reason-${s.id}`}
                      className="w-56"
                      aria-label={t('reason')}
                    >
                      <option value="">{t('reason_placeholder')}</option>
                      {REJECT_REASONS.map((r) => (
                        <option key={r} value={r}>
                          {t(`reason_${r}`)}
                        </option>
                      ))}
                    </NativeSelect>
                  </label>
                  <div className="min-w-[240px] flex-1">
                    <Input
                      value={commentById[s.id] ?? ''}
                      onChange={(e) => setCommentById((p) => ({ ...p, [s.id]: e.target.value }))}
                      placeholder={t('comment_placeholder')}
                      data-test-id={`shift-reject-comment-${s.id}`}
                    />
                  </div>
                  <Button
                    size="sm"
                    // `other` sababida izoh MAJBURIY — BE ham shu qoidani
                    // tekshiradi, bu yerda faqat tugmani o'chirib qo'yamiz.
                    disabled={
                      transition.isPending ||
                      !reasonById[s.id] ||
                      (reasonById[s.id] === 'other' && !commentById[s.id]?.trim())
                    }
                    onClick={() =>
                      transition.mutate({
                        id: s.id,
                        action: 'reject',
                        reasonCode: reasonById[s.id],
                        comment: commentById[s.id]?.trim() || undefined,
                      })
                    }
                    data-test-id={`shift-reject-submit-${s.id}`}
                  >
                    {t('reject_submit')}
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
