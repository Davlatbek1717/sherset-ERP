'use client';

/**
 * HR Review — Tekshiruvchi navbati. pending_review status'idagi xodim
 * javoblari ko'rinadi. Tekshiruvchi yoki admin tasdiqlaydi/rad etadi.
 * Anti-self-approval + race-loss xatosi server tomonida bloklanadi.
 */

import { type HrTaskLogRow, hrTaskReviewApi } from '@/lib/hr-api';
import { Avatar, Button, EmptyState, Skeleton } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { formatInTimeZone } from 'date-fns-tz';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { type ReviewDecision, ReviewModal } from './_components/review-modal';

const TZ = 'Asia/Tashkent';

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return formatInTimeZone(new Date(iso), TZ, 'yyyy-MM-dd HH:mm');
}

export default function HrReviewPage() {
  const t = useTranslations('pages.hrReview');
  const tTasks = useTranslations('pages.hrTasks');

  const pendingQuery = useQuery<{ rows: HrTaskLogRow[]; total: number }>({
    queryKey: ['hr-review-pending'],
    queryFn: () => hrTaskReviewApi.listPending({ limit: 100 }),
  });

  const [reviewing, setReviewing] = useState<ReviewDecision | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-semibold text-2xl text-[var(--ms-text-strong)]">{t('title')}</h1>
          <p className="text-[var(--ms-text-muted)] text-sm">{t('subtitle')}</p>
        </div>
        {typeof pendingQuery.data?.total === 'number' && (
          <span className="rounded-[var(--ms-radius-default)] bg-[var(--ms-bg-app)] px-3 py-1 text-[var(--ms-text-muted)] text-sm">
            {pendingQuery.data.total}
          </span>
        )}
      </div>

      {pendingQuery.isLoading ? (
        <Skeleton className="h-40" />
      ) : pendingQuery.data && pendingQuery.data.rows.length > 0 ? (
        <table className="w-full border-collapse text-sm" data-test-id="hr-review-table">
          <thead className="bg-[var(--ms-bg-app)] text-[var(--ms-text-muted)] text-xs uppercase">
            <tr>
              <th className="px-3 py-2 text-left">{t('col_sent_at')}</th>
              <th className="px-3 py-2 text-left">{t('col_template')}</th>
              <th className="px-3 py-2 text-left">{t('col_employee')}</th>
              <th className="px-3 py-2 text-left">{t('col_response')}</th>
              <th className="px-3 py-2 text-right">{t('col_actions')}</th>
            </tr>
          </thead>
          <tbody>
            {pendingQuery.data.rows.map((log) => (
              <tr
                key={log.id}
                className="border-[var(--ms-border-default)] border-t hover:bg-[var(--ms-bg-app)]"
                data-test-id={`hr-review-row-${log.id}`}
              >
                <td className="px-3 py-2 font-mono text-[var(--ms-text-muted)] text-xs">
                  {fmtDateTime(log.sentAt)}
                </td>
                <td className="px-3 py-2 font-medium text-[var(--ms-text-strong)]">
                  {log.template?.title ?? '—'}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Avatar name={log.employee?.name ?? '?'} size="sm" />
                    <span>{log.employee?.name ?? '—'}</span>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div className="line-clamp-2 text-[var(--ms-text-primary)]">
                    {log.responseText ?? tTasks(`status_${log.status}`)}
                  </div>
                  <div className="text-[var(--ms-text-muted)] text-xs">
                    {fmtDateTime(log.answeredAt)}
                  </div>
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      onClick={() => setReviewing({ log, decision: 'approve' })}
                      data-test-id={`hr-review-approve-${log.id}`}
                    >
                      {t('approve')}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setReviewing({ log, decision: 'reject' })}
                      data-test-id={`hr-review-reject-${log.id}`}
                    >
                      {t('reject')}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <EmptyState title={t('empty')} description={t('empty_hint')} />
      )}

      <ReviewModal review={reviewing} onClose={() => setReviewing(null)} />
    </div>
  );
}
