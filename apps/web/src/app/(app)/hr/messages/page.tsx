'use client';

/**
 * HR Messages — Telegram outbox dashboard. Lists every HrTelegramOutbox row
 * (rendered notifications queued or already delivered by the MTProto worker)
 * with status filters, full-text search across messageText + toPhone, and
 * a per-counterparty chat-history slide-over.
 *
 * Admin can also re-queue 'failed' rows from the action column.
 */

import { type StateTone, hrMessageStatusTone } from '@/lib/domain-status-tone';
import {
  type HrMessageRow,
  type HrMessageStatus,
  type HrMessageStatusCounts,
  type HrMessagesListResult,
  hrMessagesApi,
} from '@/lib/hr-api';
import { Avatar, Badge, Button, EmptyState, Input, NativeSelect, Skeleton } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatInTimeZone } from 'date-fns-tz';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

const TZ = 'Asia/Tashkent';

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return formatInTimeZone(new Date(iso), TZ, 'yyyy-MM-dd HH:mm');
}

export default function HrMessagesPage() {
  const t = useTranslations('pages.hrMessages');
  const tCommon = useTranslations('common');
  const qc = useQueryClient();

  const [status, setStatus] = useState<'' | HrMessageStatus>('');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [chatFor, setChatFor] = useState<HrMessageRow | null>(null);

  const listQuery = useQuery<HrMessagesListResult>({
    queryKey: ['hr-messages', status, search, dateFrom, dateTo],
    queryFn: () =>
      hrMessagesApi.list({
        ...(status ? { status } : {}),
        ...(search ? { search } : {}),
        ...(dateFrom ? { dateFrom } : {}),
        ...(dateTo ? { dateTo } : {}),
        limit: 100,
      }),
  });

  const countsQuery = useQuery<HrMessageStatusCounts>({
    queryKey: ['hr-messages', 'status-counts'],
    queryFn: () => hrMessagesApi.statusCounts(),
    refetchInterval: 30_000, // dashboard-style polling
  });

  const chatQuery = useQuery<HrMessageRow[]>({
    queryKey: ['hr-messages', 'chat', chatFor?.counterpartyId ?? null],
    queryFn: () =>
      chatFor?.counterpartyId
        ? hrMessagesApi.chatHistory(chatFor.counterpartyId)
        : Promise.resolve([]),
    enabled: !!chatFor?.counterpartyId,
  });

  const requeueMut = useMutation({
    mutationFn: (id: string) => hrMessagesApi.requeue(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr-messages'] });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-semibold text-2xl text-[var(--ms-text-strong)]">{t('title')}</h1>
          <p className="text-[var(--ms-text-muted)] text-sm">{t('subtitle')}</p>
        </div>
        {countsQuery.data && (
          <div className="flex gap-2 text-xs">
            <StatusChip
              label={t('status_pending')}
              count={countsQuery.data.pending}
              tone={hrMessageStatusTone('pending')}
            />
            <StatusChip
              label={t('status_retry')}
              count={countsQuery.data.retry}
              tone={hrMessageStatusTone('retry')}
            />
            <StatusChip
              label={t('status_sent')}
              count={countsQuery.data.sent}
              tone={hrMessageStatusTone('sent')}
            />
            <StatusChip
              label={t('status_failed')}
              count={countsQuery.data.failed}
              tone={hrMessageStatusTone('failed')}
            />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="hr-msg-status" className="text-[var(--ms-text-muted)] text-xs">
            {t('filter_status')}
          </label>
          <NativeSelect
            id="hr-msg-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as '' | HrMessageStatus)}
            className="w-auto"
          >
            <option value="">{t('filter_all')}</option>
            <option value="pending">{t('status_pending')}</option>
            <option value="retry">{t('status_retry')}</option>
            <option value="sent">{t('status_sent')}</option>
            <option value="failed">{t('status_failed')}</option>
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="hr-msg-search" className="text-[var(--ms-text-muted)] text-xs">
            {t('filter_search')}
          </label>
          <Input
            id="hr-msg-search"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('filter_search_placeholder')}
            className="w-64"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="hr-msg-from" className="text-[var(--ms-text-muted)] text-xs">
            {t('filter_date_from')}
          </label>
          <Input
            id="hr-msg-from"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-auto"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="hr-msg-to" className="text-[var(--ms-text-muted)] text-xs">
            {t('filter_date_to')}
          </label>
          <Input
            id="hr-msg-to"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-auto"
          />
        </div>
      </div>

      {listQuery.isLoading ? (
        <Skeleton className="h-40" />
      ) : listQuery.data && listQuery.data.rows.length > 0 ? (
        <table className="w-full border-collapse text-sm" data-test-id="hr-messages-table">
          <thead className="bg-[var(--ms-bg-app)] text-[var(--ms-text-muted)] text-xs uppercase">
            <tr>
              <th className="px-3 py-2 text-left">{t('col_created_at')}</th>
              <th className="px-3 py-2 text-left">{t('col_counterparty')}</th>
              <th className="px-3 py-2 text-left">{t('col_phone')}</th>
              <th className="px-3 py-2 text-left">{t('col_message')}</th>
              <th className="px-3 py-2 text-left">{t('col_status')}</th>
              <th className="px-3 py-2 text-right">{tCommon('actions')}</th>
            </tr>
          </thead>
          <tbody>
            {listQuery.data.rows.map((row) => (
              <tr
                key={row.id}
                className="border-[var(--ms-border-default)] border-t hover:bg-[var(--ms-bg-app)]"
                data-test-id={`hr-msg-row-${row.id}`}
              >
                <td className="px-3 py-2 font-mono text-[var(--ms-text-muted)] text-xs">
                  {fmtDateTime(row.createdAt)}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Avatar name={row.counterparty?.name ?? '?'} size="sm" />
                    <span>{row.counterparty?.name ?? '—'}</span>
                  </div>
                </td>
                <td className="px-3 py-2 font-mono text-[var(--ms-text-muted)] text-xs">
                  {row.toPhone}
                </td>
                <td className="px-3 py-2 max-w-md">
                  <div className="line-clamp-2 whitespace-pre-wrap">{row.messageText}</div>
                  {row.failReason && (
                    <div className="mt-1 text-[var(--ms-text-destructive)] text-xs">
                      ⚠ {row.failReason}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2">
                  <Badge tone={hrMessageStatusTone(row.status)}>{t(`status_${row.status}`)}</Badge>
                  {row.status === 'retry' && row.nextRetryAt && (
                    <div className="mt-1 text-[var(--ms-text-muted)] text-xs">
                      → {fmtDateTime(row.nextRetryAt)}
                    </div>
                  )}
                  {row.status === 'sent' && row.sentBySlot && (
                    <div className="mt-1 text-[var(--ms-text-muted)] text-xs">
                      slot {row.sentBySlot}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="flex justify-end gap-2">
                    {row.counterpartyId && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setChatFor(row)}
                        data-test-id={`hr-msg-chat-${row.id}`}
                      >
                        {t('chat_panel')}
                      </Button>
                    )}
                    {row.status === 'failed' && (
                      <Button
                        size="sm"
                        onClick={() => requeueMut.mutate(row.id)}
                        disabled={requeueMut.isPending}
                        data-test-id={`hr-msg-requeue-${row.id}`}
                      >
                        {t('requeue')}
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <EmptyState title={t('empty')} description={t('empty_hint')} />
      )}

      {chatFor && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/40"
          // Tasodifiy yopilish yo'q: fonga bosish ham, Esc ham oynani yopmaydi —
          // faqat oynaning o'z tugmalari (@moysklad/ui `noAccidentalClose` bilan
          // bir xil shartnoma; egasining jonli sinovi, 2026-08-12).
          // biome-ignore lint/a11y/useSemanticElements: native <dialog> incompatible with tanstack-query; role=dialog; oyna faqat o‘z tugmalari bilan yopiladi
          role="dialog"
          aria-modal="true"
          tabIndex={-1}
          data-test-id="hr-messages-chat-panel"
        >
          <div className="flex h-full w-full max-w-md flex-col bg-[var(--ms-bg-surface)] shadow-xl">
            <div className="border-[var(--ms-border-default)] border-b p-4">
              <h2 className="font-semibold text-[var(--ms-text-strong)] text-lg">
                {chatFor.counterparty?.name ?? '—'}
              </h2>
              <p className="font-mono text-[var(--ms-text-muted)] text-xs">{chatFor.toPhone}</p>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {chatQuery.isLoading ? (
                <Skeleton className="h-40" />
              ) : chatQuery.data && chatQuery.data.length > 0 ? (
                <div className="space-y-3">
                  {chatQuery.data.map((m) => (
                    <div
                      key={m.id}
                      className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-app)] p-2 text-sm"
                    >
                      <div className="mb-1 flex items-center gap-2 text-[var(--ms-text-muted)] text-xs">
                        <Badge tone={hrMessageStatusTone(m.status)}>
                          {t(`status_${m.status}`)}
                        </Badge>
                        <span className="font-mono">{fmtDateTime(m.createdAt)}</span>
                      </div>
                      <div className="whitespace-pre-wrap">{m.messageText}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[var(--ms-text-muted)] text-sm">{t('chat_empty')}</div>
              )}
            </div>
            <div className="border-[var(--ms-border-default)] border-t p-3 text-right">
              <Button variant="secondary" onClick={() => setChatFor(null)}>
                {tCommon('cancel')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusChip({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: StateTone;
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-[var(--ms-radius-default)] bg-[var(--ms-bg-app)] px-2 py-1">
      <Badge tone={tone}>{count}</Badge>
      <span className="text-[var(--ms-text-muted)]">{label}</span>
    </div>
  );
}
