'use client';

import { HomepageTabs } from '@/components/homepage-tabs';
import { useApiMutation } from '@/hooks/use-api-mutation';
import { useDestructiveMutation } from '@/hooks/use-destructive-mutation';
import { api } from '@/lib/api-client';
import { Button, Container, Input, NativeSelect, PageHeader } from '@moysklad/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

// ---------------------------------------------------------------------------
// Backend contract — mirror the response of
// GET /attachments/all?entity=&search=&limit=&cursor= (apps/api attachments
// module — already tested). No invented fields: these are exactly the columns
// the endpoint ships. The raw/delete endpoints are plain REST on the same
// /api/v1 base used everywhere else.
// ---------------------------------------------------------------------------

interface FileItem {
  id: string;
  entity: string;
  entityId: string;
  filename: string;
  mime: string;
  sizeBytes: number;
  description: string | null;
  createdAt: string;
  uploader: { id: string; name: string } | null;
}

interface FilesResponse {
  items: FileItem[];
  nextCursor: string | null;
}

// The 20 moysklad host types the endpoint filters by (the `entity` param).
// Labelled via t('entities.<Entity>').
const ENTITY_TYPES = [
  'Counterparty',
  'CustomerOrder',
  'Demand',
  'InvoiceOut',
  'Supply',
  'PurchaseOrder',
  'InvoiceIn',
  'PaymentIn',
  'PaymentOut',
  'SalesReturn',
  'PurchaseReturn',
  'Move',
  'Loss',
  'Enter',
  'Inventory',
  'CashIn',
  'CashOut',
  'Opportunity',
  'Product',
  'Task',
] as const;

const COLUMN_COUNT = 8;

const INPUT_CLASS =
  'h-9 px-3 text-sm bg-[var(--ms-bg-surface)] border border-[var(--ms-border-default)] rounded-[var(--ms-radius-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ms-border-focus)] focus-visible:ring-offset-1 hover:border-[var(--ms-border-strong)]';

const SELECT_CLASS = INPUT_CLASS;

// Human-readable byte formatting, mirroring attachments-section.tsx:86.
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_000_000) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

// Date formatting, mirroring attachments-section.tsx:92.
function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Files page — moysklad «Файлы»: the account-wide file repository.
 *
 * A searchable / host-type-filterable table over every attachment in the
 * account, served by GET /attachments/all. Filenames link to the inline raw
 * endpoint (open/download); each row can be deleted via the shared confirm
 * dialog. Cursor pagination via a "Load more" button that appends pages.
 */
export default function FilesPage() {
  const t = useTranslations('pages.files');
  const tCommon = useTranslations('common');
  const qc = useQueryClient();
  const { runDestructive } = useDestructiveMutation();

  // Draft search box value vs the applied value that actually drives the
  // query — re-fetch only on Apply / Enter, not per keystroke.
  const [searchDraft, setSearchDraft] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [entity, setEntity] = useState('');

  // Extra pages accumulated via "Load more" (page 1 lives in the query).
  const [extraItems, setExtraItems] = useState<FileItem[]>([]);
  const [extraCursor, setExtraCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const buildUrl = (cursor?: string | null) => {
    const params = new URLSearchParams();
    if (entity) params.set('entity', entity);
    if (appliedSearch) params.set('search', appliedSearch);
    if (cursor) params.set('cursor', cursor);
    const qs = params.toString();
    return qs ? `/attachments/all?${qs}` : '/attachments/all';
  };

  const queryKey = ['files', entity, appliedSearch] as const;

  const { data, isLoading, error, refetch } = useQuery<FilesResponse>({
    queryKey,
    queryFn: () => api.get<FilesResponse>(buildUrl()),
  });

  const resetPagination = () => {
    setExtraItems([]);
    setExtraCursor(null);
  };

  const applyFilters = () => {
    resetPagination();
    setAppliedSearch(searchDraft.trim());
    // If entity/search are unchanged the queryKey is stable; force a refetch
    // so Apply always reloads page 1.
    void refetch();
  };

  const invalidate = () => {
    resetPagination();
    qc.invalidateQueries({ queryKey });
  };

  const deleteMut = useApiMutation({
    mutationFn: (id: string) => api.delete<{ ok: true }>(`/attachments/${id}`),
    onSuccess: invalidate,
  });

  const loadMore = async () => {
    const cursor = extraCursor ?? data?.nextCursor ?? null;
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const next = await api.get<FilesResponse>(buildUrl(cursor));
      setExtraItems((prev) => [...prev, ...next.items]);
      setExtraCursor(next.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  };

  const items: FileItem[] = [...(data?.items ?? []), ...extraItems];
  // Once any extra page is loaded, the live cursor is the last extra page's;
  // otherwise it's page 1's cursor.
  const liveCursor = extraItems.length > 0 ? extraCursor : (data?.nextCursor ?? null);

  return (
    <Container size="lg" className="space-y-6 py-4">
      {/* Page-level tab strip (Показатели / … / Файлы) */}
      <HomepageTabs activeKey="files" />

      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      {/* Filter row — search + host-type filter + apply (mirrors reports/aging). */}
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <div className="mb-1 text-[var(--ms-text-muted)] text-xs">{t('col_file')}</div>
          <Input
            type="search"
            value={searchDraft}
            placeholder={t('search_placeholder')}
            onChange={(e) => setSearchDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applyFilters();
            }}
            className={`${INPUT_CLASS} w-full`}
          />
        </div>
        <div>
          <div className="mb-1 text-[var(--ms-text-muted)] text-xs">{t('col_host')}</div>
          <NativeSelect
            value={entity}
            onChange={(e) => {
              setEntity(e.target.value);
              resetPagination();
            }}
            className={SELECT_CLASS}
          >
            <option value="">{t('all_types')}</option>
            {ENTITY_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`entities.${type}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Button type="button" variant="primary" onClick={applyFilters} loading={isLoading}>
          {tCommon('apply')}
        </Button>
      </div>

      {isLoading && <div className="text-[var(--ms-text-muted)] text-sm">{t('loading')}</div>}

      {error && !isLoading && (
        <div className="mb-3 rounded border border-[var(--ms-destructive-500)] bg-[var(--ms-destructive-50)] p-3 text-[var(--ms-text-destructive)] text-sm">
          {(error as Error).message || t('error_generic')}
        </div>
      )}

      {!isLoading && !error && (
        <div className="overflow-auto rounded border border-[var(--ms-border-default)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--ms-bg-muted)]">
              <tr>
                <th className="px-3 py-2 text-left">{t('col_file')}</th>
                <th className="px-3 py-2 text-left">{t('col_host')}</th>
                <th className="px-3 py-2 text-right">{t('col_size')}</th>
                <th className="px-3 py-2 text-left">{t('col_type')}</th>
                <th className="px-3 py-2 text-left">{t('col_desc')}</th>
                <th className="px-3 py-2 text-left">{t('col_uploaded')}</th>
                <th className="px-3 py-2 text-left">{t('col_by')}</th>
                <th className="px-3 py-2 text-right">{t('col_actions')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((f) => (
                <tr
                  key={f.id}
                  className="border-[var(--ms-border-default)] border-t hover:bg-[var(--ms-bg-muted)]"
                >
                  <td className="px-3 py-2">
                    <a
                      href={`/api/v1/attachments/${f.id}/raw`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium underline-offset-2 hover:text-[var(--ms-text-brand)] hover:underline"
                    >
                      {f.filename}
                    </a>
                  </td>
                  <td className="px-3 py-2 text-[var(--ms-text-secondary)]">
                    <span>{t(`entities.${f.entity}`)}</span>
                    <span className="ml-1 text-[var(--ms-text-muted)] text-xs tabular-nums">
                      #{f.entityId.slice(0, 8)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-[var(--ms-text-muted)] tabular-nums">
                    {formatSize(f.sizeBytes)}
                  </td>
                  <td className="max-w-[180px] truncate px-3 py-2 text-[var(--ms-text-muted)] text-xs">
                    {f.mime}
                  </td>
                  <td className="max-w-[240px] truncate px-3 py-2 text-[var(--ms-text-muted)]">
                    {f.description ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-[var(--ms-text-muted)] text-xs tabular-nums">
                    {formatDateTime(f.createdAt)}
                  </td>
                  <td className="max-w-[160px] truncate px-3 py-2 text-[var(--ms-text-muted)]">
                    {f.uploader?.name ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <a
                        href={`/api/v1/attachments/${f.id}/raw`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[var(--ms-text-brand)] text-xs underline-offset-2 hover:underline"
                      >
                        {t('download')}
                      </a>
                      <Button
                        size="sm"
                        variant="tertiary"
                        onClick={() =>
                          runDestructive({
                            title: t('confirm_delete', { name: f.filename }),
                            run: () => deleteMut.mutateAsync(f.id),
                          })
                        }
                        disabled={deleteMut.isPending}
                      >
                        {t('delete')}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td
                    colSpan={COLUMN_COUNT}
                    className="p-6 text-center text-[var(--ms-text-muted)] text-sm"
                  >
                    {t('empty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && !error && liveCursor && (
        <div className="flex justify-center">
          <Button type="button" variant="tertiary" onClick={loadMore} loading={loadingMore}>
            {t('load_more')}
          </Button>
        </div>
      )}
    </Container>
  );
}
