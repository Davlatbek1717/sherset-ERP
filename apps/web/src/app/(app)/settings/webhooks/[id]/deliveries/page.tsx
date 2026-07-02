'use client';

import { useApiMutation } from '@/hooks/use-api-mutation';
import { api } from '@/lib/api-client';
import { deliveryStatusTone } from '@/lib/domain-status-tone';
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
import { useParams } from 'next/navigation';
import { useState } from 'react';

interface DeliveryRow {
  id: string;
  webhookId: string;
  status: 'pending' | 'sent' | 'dead';
  attempt: number;
  maxAttempts: number;
  httpStatus: number | null;
  errorMsg: string | null;
  nextRetryAt: string;
  attemptedAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

interface WebhookDetail {
  id: string;
  entityType: string;
  action: string;
  url: string;
  enabled: boolean;
}

interface ListResponse {
  items: DeliveryRow[];
  total: number;
}

const LIMIT = 100;

const STATUSES: Array<DeliveryRow['status']> = ['pending', 'sent', 'dead'];

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('uz-UZ', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default function WebhookDeliveriesPage() {
  const params = useParams<{ id: string }>();
  const webhookId = params.id;
  const t = useTranslations('pages.webhook_deliveries');
  const qc = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<DeliveryRow['status'] | null>(null);

  const { data: webhook } = useQuery<WebhookDetail>({
    queryKey: ['webhook', webhookId],
    queryFn: () => api.get(`/webhook/${webhookId}`),
  });

  const queryParams = new URLSearchParams({ limit: String(LIMIT) });
  if (statusFilter) queryParams.set('status', statusFilter);

  const { data, isLoading, error, refetch } = useQuery<ListResponse>({
    queryKey: ['webhook-deliveries', webhookId, statusFilter],
    queryFn: () =>
      api.get<ListResponse>(`/webhook/${webhookId}/deliveries?${queryParams.toString()}`),
  });

  const retryMut = useApiMutation({
    mutationFn: (deliveryId: string) =>
      api.post(`/webhook/${webhookId}/deliveries/${deliveryId}/retry`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['webhook-deliveries', webhookId] });
    },
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

  const columns: DataTableColumn<DeliveryRow>[] = [
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
        <span className="tabular-nums text-sm">
          {r.attempt} / {r.maxAttempts}
        </span>
      ),
      cellText: (r) => `${r.attempt}/${r.maxAttempts}`,
    },
    {
      key: 'httpStatus',
      header: t('col_http'),
      width: '90px',
      align: 'center',
      cell: (r) => (
        <span className="tabular-nums text-sm text-[var(--ms-text-muted)]">
          {r.httpStatus ?? '—'}
        </span>
      ),
      cellText: (r) => String(r.httpStatus ?? ''),
    },
    {
      key: 'createdAt',
      header: t('col_created'),
      width: '160px',
      cell: (r) => (
        <span className="text-[var(--ms-text-muted)] text-xs tabular-nums">
          {formatDate(r.createdAt)}
        </span>
      ),
      cellText: (r) => r.createdAt,
    },
    {
      key: 'attemptedAt',
      header: t('col_attempted'),
      width: '160px',
      cell: (r) => (
        <span className="text-[var(--ms-text-muted)] text-xs tabular-nums">
          {formatDate(r.attemptedAt)}
        </span>
      ),
      cellText: (r) => r.attemptedAt ?? '',
    },
    {
      key: 'nextRetryAt',
      header: t('col_next_retry'),
      width: '160px',
      cell: (r) =>
        r.status === 'pending' && r.attempt > 1 ? (
          <span className="text-[var(--ms-text-muted)] text-xs tabular-nums">
            {formatDate(r.nextRetryAt)}
          </span>
        ) : (
          <span className="text-[var(--ms-text-muted)]">—</span>
        ),
      cellText: (r) => r.nextRetryAt,
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
        r.status === 'dead' || (r.status === 'pending' && r.attempt > 1) ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => retryMut.mutate(r.id)}
            disabled={retryMut.isPending}
            data-test-id={`delivery-retry-${r.id}`}
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
          href="/settings/webhooks"
          className="inline-flex items-center text-[var(--ms-text-muted)] text-sm hover:text-[var(--ms-text-brand)]"
        >
          ← {t('back_to_webhooks')}
        </Link>
      </div>
      <ListView
        testId="webhook-deliveries-page"
        title={t('title')}
        subtitle={
          webhook ? (
            <span className="font-mono text-xs">
              {webhook.entityType} · {webhook.action} · {webhook.url}
            </span>
          ) : undefined
        }
        filters={filters}
        columns={columns}
        rows={data?.items ?? []}
        keyField="id"
        rowTestId={(r) => `delivery-row-${r.id}`}
        total={data?.total ?? 0}
        limit={LIMIT}
        loading={isLoading}
        error={error as Error | null}
        onRetry={() => refetch()}
        emptyTitle={t('empty_title')}
        emptyDescription={t('empty_description')}
      />
    </div>
  );
}
