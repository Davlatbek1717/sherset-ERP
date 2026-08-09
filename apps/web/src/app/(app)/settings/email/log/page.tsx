'use client';

import { useApiMutation } from '@/hooks/use-api-mutation';
import { api } from '@/lib/api-client';
import { deliveryStatusTone } from '@/lib/domain-status-tone';
import type { ListEnvelope as ListResponse } from '@moysklad/contracts';
import {
  Badge,
  Button,
  type DataTableColumn,
  Icons,
  ListView,
  type ListViewFilter,
} from '@moysklad/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState } from 'react';

interface EmailLogRow {
  id: string;
  entity: string | null;
  entityId: string | null;
  toAddresses: string[];
  ccAddresses: string[];
  subject: string;
  /** `sending` — Faza 28: worker holds an exclusive claim, SMTP call in flight. */
  status: 'pending' | 'sending' | 'sent' | 'dead' | 'failed';
  attempt: number;
  maxAttempts: number;
  errorMsg: string | null;
  nextRetryAt: string | null;
  attemptedAt: string | null;
  sentAt: string | null;
  createdAt: string;
  sender: { id: string; name: string } | null;
}

const STATUSES: Array<EmailLogRow['status']> = ['pending', 'sending', 'sent', 'dead', 'failed'];
const LIMIT = 100;

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('uz-UZ', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function EmailLogPage() {
  const t = useTranslations('pages.email_log');
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<EmailLogRow['status'] | null>(null);
  const [sortKey, setSortKey] = useState<string>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const params = new URLSearchParams({ limit: String(LIMIT), sortBy: sortKey, sortDir });
  if (statusFilter) params.set('status', statusFilter);

  const { data, isLoading, error, refetch } = useQuery<ListResponse<EmailLogRow>>({
    queryKey: ['email-logs', statusFilter, sortKey, sortDir],
    queryFn: () => api.get<ListResponse<EmailLogRow>>(`/email/logs?${params.toString()}`),
  });

  const retryMut = useApiMutation({
    mutationFn: (id: string) => api.post(`/email/logs/${id}/retry`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['email-logs'] }),
  });

  const filters: ListViewFilter[] = [
    {
      key: 'all',
      label: t('filter_all'),
      active: statusFilter === null,
      onClick: () => setStatusFilter(null),
    },
    ...STATUSES.map((s) => ({
      key: s,
      label: t(`status_${s}`),
      active: statusFilter === s,
      onClick: () => setStatusFilter(s),
    })),
  ];

  const columns: DataTableColumn<EmailLogRow>[] = [
    {
      key: 'status',
      header: t('col_status'),
      width: '110px',
      cell: (r) => <Badge tone={deliveryStatusTone(r.status)}>{t(`status_${r.status}`)}</Badge>,
      cellText: (r) => r.status,
    },
    {
      key: 'attempt',
      header: t('col_attempt'),
      width: '90px',
      align: 'center',
      cell: (r) => (
        <span className="text-sm tabular-nums">
          {r.attempt} / {r.maxAttempts}
        </span>
      ),
      cellText: (r) => `${r.attempt}/${r.maxAttempts}`,
    },
    {
      key: 'subject',
      header: t('col_subject'),
      sortable: true,
      sortField: 'subject',
      cell: (r) => <span className="font-medium">{r.subject}</span>,
      cellText: (r) => r.subject,
    },
    {
      key: 'to',
      header: t('col_to'),
      cell: (r) => (
        <span className="text-[var(--ms-text-muted)] text-xs">{r.toAddresses.join(', ')}</span>
      ),
      cellText: (r) => r.toAddresses.join(', '),
    },
    {
      key: 'createdAt',
      header: t('col_created'),
      width: '140px',
      sortable: true,
      sortField: 'createdAt',
      cell: (r) => (
        <span className="text-[var(--ms-text-muted)] text-[12px] tabular-nums">
          {formatDate(r.createdAt)}
        </span>
      ),
      cellText: (r) => r.createdAt,
    },
    {
      key: 'sentAt',
      header: t('col_sent'),
      width: '140px',
      sortable: true,
      sortField: 'sentAt',
      cell: (r) => (
        <span className="text-[var(--ms-text-muted)] text-[12px] tabular-nums">
          {formatDate(r.sentAt)}
        </span>
      ),
      cellText: (r) => r.sentAt ?? '',
    },
    {
      key: 'errorMsg',
      header: t('col_error'),
      cell: (r) =>
        r.errorMsg ? (
          <code className="break-all text-[var(--ms-text-danger)] text-xs">{r.errorMsg}</code>
        ) : (
          <span className="text-[var(--ms-text-muted)]">—</span>
        ),
      cellText: (r) => r.errorMsg ?? '',
    },
    {
      key: 'actions',
      header: '',
      width: '110px',
      align: 'right',
      cell: (r) =>
        r.status === 'dead' || r.status === 'failed' ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => retryMut.mutate(r.id)}
            disabled={retryMut.isPending}
            data-test-id={`email-retry-${r.id}`}
          >
            <Icons.refresh className="mr-1 h-3.5 w-3.5" />
            {t('action_retry')}
          </Button>
        ) : null,
    },
  ];

  return (
    <div>
      <div className="mb-2 px-6 pt-4">
        <Link
          href="/settings/email"
          className="inline-flex items-center text-[var(--ms-text-muted)] text-sm hover:text-[var(--ms-text-brand)]"
        >
          ← {t('back_to_email')}
        </Link>
      </div>
      <ListView
        testId="email-log-page"
        title={t('title')}
        subtitle={t('subtitle')}
        filters={filters}
        columns={columns}
        rows={data?.items ?? []}
        keyField="id"
        rowTestId={(r) => `email-log-${r.id}`}
        total={data?.items.length ?? 0}
        limit={LIMIT}
        loading={isLoading}
        error={error as Error | null}
        onRetry={() => refetch()}
        emptyTitle={t('empty_title')}
        emptyDescription={t('empty_description')}
        sortKey={sortKey}
        sortDir={sortDir}
        onSortChange={(key, dir) => {
          setSortKey(key);
          setSortDir(dir);
        }}
      />
    </div>
  );
}
