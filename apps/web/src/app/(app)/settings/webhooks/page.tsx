'use client';

import { useApiMutation } from '@/hooks/use-api-mutation';
import { useDestructiveMutation } from '@/hooks/use-destructive-mutation';
import { api } from '@/lib/api-client';
import { Badge, Button, type DataTableColumn, Icons, ListView } from '@moysklad/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState } from 'react';
import { WebhookDialog } from './webhook-dialog';

interface WebhookRow {
  id: string;
  entityType: string;
  /** Comma-separated list e.g. "CREATE,UPDATE" — server stores as string */
  action: string;
  url: string;
  secretHash: string | null;
  diffType: string | null;
  enabled: boolean;
  authContext: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

interface ListResponse {
  items: WebhookRow[];
  nextCursor?: string;
  total: number;
}

const LIMIT = 50;

export default function WebhooksAdminPage() {
  const t = useTranslations('pages.webhook_admin');
  const tCommon = useTranslations('common');
  const qc = useQueryClient();
  const { runDestructive } = useDestructiveMutation();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [sortKey, setSortKey] = useState<string>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [cursor, setCursor] = useState<string | undefined>();

  const params = new URLSearchParams({
    limit: String(LIMIT),
    sortBy: sortKey,
    sortDir,
    ...(cursor ? { cursor } : {}),
  });

  const { data, isLoading, error, refetch } = useQuery<ListResponse>({
    queryKey: ['webhooks', sortKey, sortDir, cursor],
    queryFn: () => api.get<ListResponse>(`/webhook?${params.toString()}`),
  });

  const deleteMut = useApiMutation({
    mutationFn: (id: string) => api.delete(`/webhook/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['webhooks'] });
    },
  });

  const toggleMut = useApiMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.patch(`/webhook/${id}`, { enabled }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['webhooks'] });
    },
  });

  const columns: DataTableColumn<WebhookRow>[] = [
    {
      key: 'entityType',
      header: t('col_entity'),
      width: '160px',
      sortable: true,
      sortField: 'entityType',
      cell: (r) => (
        <button
          type="button"
          onClick={() => setEditingId(r.id)}
          className="font-medium text-[var(--ms-text-primary)] underline-offset-2 hover:text-[var(--ms-text-brand)] hover:underline"
        >
          {r.entityType}
        </button>
      ),
      cellText: (r) => r.entityType,
    },
    {
      key: 'action',
      header: t('col_action'),
      width: '180px',
      cell: (r) => (
        <div className="flex flex-wrap gap-1">
          {r.action.split(',').map((a) => (
            <Badge key={a} tone="neutral">
              {a}
            </Badge>
          ))}
        </div>
      ),
      cellText: (r) => r.action,
    },
    {
      key: 'url',
      header: t('col_url'),
      cell: (r) => <code className="break-all text-[var(--ms-text-muted)] text-xs">{r.url}</code>,
      cellText: (r) => r.url,
    },
    {
      key: 'enabled',
      header: t('col_enabled'),
      width: '110px',
      align: 'center',
      cell: (r) => (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => toggleMut.mutate({ id: r.id, enabled: !r.enabled })}
          data-test-id={`webhook-toggle-${r.id}`}
        >
          {r.enabled ? (
            <Badge tone="success">{t('enabled_yes')}</Badge>
          ) : (
            <Badge tone="neutral">{t('enabled_no')}</Badge>
          )}
        </Button>
      ),
      cellText: (r) => (r.enabled ? '✓' : ''),
    },
    {
      key: 'secretHash',
      header: t('col_signed'),
      width: '90px',
      align: 'center',
      cell: (r) =>
        r.secretHash ? (
          <Icons.check className="mx-auto h-4 w-4 text-[var(--ms-text-success)]" />
        ) : (
          <span className="text-[var(--ms-text-muted)]">—</span>
        ),
      cellText: (r) => (r.secretHash ? '✓' : ''),
    },
    {
      key: 'actions',
      header: '',
      width: '160px',
      align: 'right',
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <Link
            href={`/settings/webhooks/${r.id}/deliveries`}
            className="inline-flex h-7 items-center justify-center rounded px-2 text-[var(--ms-text-muted)] text-xs hover:bg-[var(--ms-bg-muted)] hover:text-[var(--ms-text-brand)]"
            data-test-id={`webhook-deliveries-${r.id}`}
            title={t('action_deliveries')}
          >
            <Icons.refresh className="h-3.5 w-3.5" />
          </Link>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => setEditingId(r.id)}
            data-test-id={`webhook-edit-${r.id}`}
            aria-label={tCommon('edit')}
          >
            <Icons.edit className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() =>
              runDestructive({
                title: t('delete_confirm', { url: r.url }),
                run: () => deleteMut.mutateAsync(r.id),
              })
            }
            data-test-id={`webhook-delete-${r.id}`}
            aria-label={tCommon('delete')}
          >
            <Icons.delete className="h-4 w-4 text-[var(--ms-action-destructive)]" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <ListView
        testId="webhook-admin-page"
        title={t('title')}
        subtitle={t('subtitle')}
        onCreate={() => setCreateOpen(true)}
        createLabel={t('create_button')}
        columns={columns}
        rows={data?.items ?? []}
        keyField="id"
        rowTestId={(r) => `webhook-row-${r.id}`}
        total={data?.total ?? 0}
        limit={LIMIT}
        hasNext={!!data?.nextCursor}
        hasPrevious={!!cursor}
        onNext={() => setCursor(data?.nextCursor)}
        onPrevious={() => setCursor(undefined)}
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
          setCursor(undefined);
        }}
      />
      {createOpen && (
        <WebhookDialog
          mode="create"
          onClose={() => setCreateOpen(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['webhooks'] });
            setCreateOpen(false);
          }}
        />
      )}
      {editingId && (
        <WebhookDialog
          mode="edit"
          id={editingId}
          onClose={() => setEditingId(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['webhooks'] });
            setEditingId(null);
          }}
        />
      )}
    </>
  );
}
