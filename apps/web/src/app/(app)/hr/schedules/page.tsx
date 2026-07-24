'use client';

/**
 * HR Ish jadvallari (Schedules) — named schedule-template list.
 *
 * Columns: Nomi / Turi (badge) / Boshlanish sanasi / Sikl, with view (👁) +
 * edit (✏️) row actions and a 10-per-page footer (TimePay "1 dan 10 gacha").
 * Soft-delete via the modal's server guard. See spec §5.1.
 */

import {
  type HrScheduleDetail,
  type HrScheduleListResult,
  type HrScheduleRow,
  hrScheduleTemplateApi,
} from '@/lib/hr-api';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Skeleton,
  useConfirm,
  useToast,
} from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ScheduleFormModal } from './_components/schedule-form-modal';

const LIMIT = 10;

export default function HrSchedulesPage() {
  const t = useTranslations('pages.hrSchedules');
  const tCommon = useTranslations('common');
  const qc = useQueryClient();
  const { confirm } = useConfirm();
  const { toast } = useToast();

  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<HrScheduleDetail | null>(null);
  const [viewTarget, setViewTarget] = useState<HrScheduleDetail | null>(null);

  const { data, isLoading, error, refetch } = useQuery<HrScheduleListResult>({
    queryKey: ['hr-schedules', { page }],
    queryFn: () => hrScheduleTemplateApi.list({ page, limit: LIMIT }),
  });

  const openMut = useMutation({
    mutationFn: (id: string) => hrScheduleTemplateApi.findOne(id),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => hrScheduleTemplateApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr-schedules'] });
      toast.success(tCommon('saved'));
    },
    onError: (e: Error) => toast.error(tCommon('action_failed'), { description: e.message }),
  });

  const openEdit = async (id: string) => setEditTarget(await openMut.mutateAsync(id));
  const openView = async (id: string) => setViewTarget(await openMut.mutateAsync(id));

  const handleDelete = async (row: HrScheduleRow) => {
    const ok = await confirm({
      title: t('delete_confirm'),
      description: row.name,
      confirmLabel: tCommon('delete'),
      tone: 'destructive',
    });
    if (ok) deleteMut.mutate(row.id);
  };

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));
  const from = total === 0 ? 0 : (page - 1) * LIMIT + 1;
  const to = Math.min(page * LIMIT, total);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-semibold text-2xl text-[var(--ms-text-strong)]">{t('title')}</h1>
          <p className="text-[var(--ms-text-muted)] text-sm">{t('subtitle')}</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} data-test-id="hr-schedules-create">
          + {t('create_button')}
        </Button>
      </div>

      <div className="overflow-hidden rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)]">
        {isLoading ? (
          <div className="p-4">
            <Skeleton className="h-8 w-full" />
          </div>
        ) : error ? (
          <ErrorState
            title={tCommon('action_failed')}
            description={(error as Error).message}
            onRetry={() => refetch()}
          />
        ) : rows.length === 0 ? (
          <EmptyState title={t('empty')} />
        ) : (
          <table className="w-full text-sm">
            <thead className="border-[var(--ms-border-default)] border-b bg-[var(--ms-bg-app)] text-[var(--ms-text-muted)] text-xs">
              <tr>
                <th className="px-3 py-2 text-left font-medium">{t('col_name')}</th>
                <th className="px-3 py-2 text-left font-medium">{t('col_type')}</th>
                <th className="px-3 py-2 text-left font-medium">{t('col_start_date')}</th>
                <th className="px-3 py-2 text-left font-medium">{t('col_cycle')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('col_actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-[var(--ms-border-default)] border-b last:border-b-0"
                  data-test-id={`hr-schedule-row-${row.id}`}
                >
                  <td className="px-3 py-2 font-medium text-[var(--ms-text-primary)]">
                    {row.name}
                  </td>
                  <td className="px-3 py-2">
                    <Badge tone={row.type === 'flexible' ? 'success' : 'neutral'}>
                      {row.type === 'flexible' ? t('type_flexible') : t('type_free')}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 font-mono text-[var(--ms-text-muted)]">
                    {row.startDate}
                  </td>
                  <td className="px-3 py-2 text-[var(--ms-text-muted)]">
                    {row.type === 'free' ? '—' : row.cycleDays}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => openView(row.id)}
                        title={t('view_title')}
                        aria-label={t('view_title')}
                        data-test-id={`hr-schedule-view-${row.id}`}
                      >
                        👁
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => openEdit(row.id)}
                        title={tCommon('edit')}
                        aria-label={tCommon('edit')}
                        data-test-id={`hr-schedule-edit-${row.id}`}
                      >
                        ✏️
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleDelete(row)}
                        title={tCommon('delete')}
                        aria-label={tCommon('delete')}
                        className="hover:text-[var(--ms-text-destructive)]"
                        data-test-id={`hr-schedule-delete-${row.id}`}
                      >
                        ❌
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {total > LIMIT && (
        <div className="flex items-center justify-between text-[var(--ms-text-muted)] text-xs">
          <span>{t('pagination', { from, to, total })}</span>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              data-test-id="hr-schedules-prev"
            >
              {t('prev')}
            </Button>
            <span className="px-2 py-1">
              {page} / {totalPages}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              data-test-id="hr-schedules-next"
            >
              {t('next')}
            </Button>
          </div>
        </div>
      )}

      <ScheduleFormModal open={createOpen} onOpenChange={setCreateOpen} mode="create" />
      <ScheduleFormModal
        open={!!editTarget}
        onOpenChange={(v) => !v && setEditTarget(null)}
        mode="edit"
        initial={editTarget}
      />
      <ScheduleFormModal
        open={!!viewTarget}
        onOpenChange={(v) => !v && setViewTarget(null)}
        mode="view"
        initial={viewTarget}
      />
    </div>
  );
}
