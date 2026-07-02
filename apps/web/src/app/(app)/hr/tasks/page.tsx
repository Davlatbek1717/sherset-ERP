'use client';

/**
 * HR Tasks — 2 tab:
 *   • Shablonlar (Templates) — admin shablonlarni boshqaradi (CRUD via API,
 *     16-input TemplateModal P3e da quriladi).
 *   • Loglar (Logs) — yuborilgan vazifalar tarixi, FSM status, qaytarib yuborish.
 */

import { activeTone, hrTaskPriorityTone } from '@/lib/domain-status-tone';
import {
  type HrTaskLogRow,
  type HrTaskLogStatus,
  type HrTaskTemplateRow,
  hrTaskSendApi,
  hrTaskTemplateApi,
} from '@/lib/hr-api';
import { Badge, Button, EmptyState, Input, NativeSelect, Skeleton, useConfirm } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { LogsTable } from './_components/logs-table';
import { TemplateModal } from './_components/template-modal';

function fmtMinor(v: string | null | undefined): string {
  if (!v) return '—';
  // Server emits BigInt as string. Display as integer UZS (minor=tiyin → / 100).
  const n = Number(v) / 100;
  if (!Number.isFinite(n)) return '—';
  return `${new Intl.NumberFormat('uz-UZ').format(n)} so'm`;
}

export default function HrTasksPage() {
  const t = useTranslations('pages.hrTasks');
  const tCommon = useTranslations('common');
  const qc = useQueryClient();
  const { confirm } = useConfirm();

  const [tab, setTab] = useState<'templates' | 'logs'>('templates');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTpl, setEditingTpl] = useState<HrTaskTemplateRow | null>(null);

  // Templates filter
  const [tplSearch, setTplSearch] = useState('');
  const [tplTrigger, setTplTrigger] = useState<'' | 'manual' | 'scheduled' | 'event'>('');
  const [tplActive, setTplActive] = useState<'' | 'true' | 'false'>('');

  // Logs filter
  const [logStatus, setLogStatus] = useState<'' | HrTaskLogStatus>('');
  const [logDateFrom, setLogDateFrom] = useState('');
  const [logDateTo, setLogDateTo] = useState('');

  const templatesQuery = useQuery<{ rows: HrTaskTemplateRow[]; total: number }>({
    queryKey: ['hr-task-templates', tplSearch, tplTrigger, tplActive],
    queryFn: () =>
      hrTaskTemplateApi.list({
        ...(tplSearch ? { search: tplSearch } : {}),
        ...(tplTrigger ? { triggerType: tplTrigger } : {}),
        ...(tplActive ? { isActive: tplActive === 'true' } : {}),
        limit: 100,
      }),
    enabled: tab === 'templates',
  });

  const logsQuery = useQuery<{ rows: HrTaskLogRow[]; total: number }>({
    queryKey: ['hr-task-logs', logStatus, logDateFrom, logDateTo],
    queryFn: () =>
      hrTaskSendApi.listLogs({
        ...(logStatus ? { status: logStatus } : {}),
        ...(logDateFrom ? { dateFrom: logDateFrom } : {}),
        ...(logDateTo ? { dateTo: logDateTo } : {}),
        limit: 100,
      }),
    enabled: tab === 'logs',
  });

  const setActiveMut = useMutation({
    mutationFn: (v: { id: string; isActive: boolean }) =>
      hrTaskTemplateApi.setActive(v.id, v.isActive),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hr-task-templates'] }),
  });

  const dispatchMut = useMutation({
    mutationFn: (templateId: string) => hrTaskSendApi.dispatch(templateId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr-task-templates'] });
      qc.invalidateQueries({ queryKey: ['hr-task-logs'] });
    },
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => hrTaskTemplateApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hr-task-templates'] }),
  });

  const tabs: Array<{ id: 'templates' | 'logs'; label: string; count?: number }> = useMemo(
    () => [
      { id: 'templates', label: t('templates_tab'), count: templatesQuery.data?.total },
      { id: 'logs', label: t('logs_tab'), count: logsQuery.data?.total },
    ],
    [t, templatesQuery.data?.total, logsQuery.data?.total],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-semibold text-2xl text-[var(--ms-text-strong)]">{t('title')}</h1>
        <Button
          onClick={() => {
            setEditingTpl(null);
            setModalOpen(true);
          }}
          data-test-id="hr-tasks-new-template"
        >
          {t('new_template')}
        </Button>
      </div>

      <div className="flex border-[var(--ms-border-default)] border-b">
        {tabs.map((item) => (
          <button
            type="button"
            key={item.id}
            onClick={() => setTab(item.id)}
            className={`-mb-px border-b-2 px-4 py-2 font-medium text-sm transition-colors ${
              tab === item.id
                ? 'border-[var(--ms-border-focus)] text-[var(--ms-text-strong)]'
                : 'border-transparent text-[var(--ms-text-muted)] hover:text-[var(--ms-text-primary)]'
            }`}
            data-test-id={`hr-tasks-tab-${item.id}`}
          >
            {item.label}
            {typeof item.count === 'number' && (
              <span className="ml-2 text-[var(--ms-text-muted)] text-xs">({item.count})</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'templates' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="hr-tpl-search" className="text-[var(--ms-text-muted)] text-xs">
                {t('search')}
              </label>
              <Input
                id="hr-tpl-search"
                type="text"
                value={tplSearch}
                onChange={(e) => setTplSearch(e.target.value)}
                placeholder={t('search_placeholder')}
                className="w-64"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="hr-tpl-trigger" className="text-[var(--ms-text-muted)] text-xs">
                {t('trigger')}
              </label>
              <NativeSelect
                id="hr-tpl-trigger"
                value={tplTrigger}
                onChange={(e) =>
                  setTplTrigger(e.target.value as '' | 'manual' | 'scheduled' | 'event')
                }
                className="w-auto"
              >
                <option value="">{t('all')}</option>
                <option value="manual">{t('trigger_manual')}</option>
                <option value="scheduled">{t('trigger_scheduled')}</option>
                <option value="event">{t('trigger_event')}</option>
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="hr-tpl-active" className="text-[var(--ms-text-muted)] text-xs">
                {t('status')}
              </label>
              <NativeSelect
                id="hr-tpl-active"
                value={tplActive}
                onChange={(e) => setTplActive(e.target.value as '' | 'true' | 'false')}
                className="w-auto"
              >
                <option value="">{t('all')}</option>
                <option value="true">{t('active')}</option>
                <option value="false">{t('inactive')}</option>
              </NativeSelect>
            </div>
          </div>

          {templatesQuery.isLoading ? (
            <Skeleton className="h-40" />
          ) : templatesQuery.data && templatesQuery.data.rows.length > 0 ? (
            <table
              className="w-full border-collapse text-sm"
              data-test-id="hr-tasks-templates-table"
            >
              <thead className="bg-[var(--ms-bg-app)] text-[var(--ms-text-muted)] text-xs uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">{t('col_title')}</th>
                  <th className="px-3 py-2 text-left">{t('col_assignee')}</th>
                  <th className="px-3 py-2 text-left">{t('col_trigger')}</th>
                  <th className="px-3 py-2 text-left">{t('col_priority')}</th>
                  <th className="px-3 py-2 text-right">{t('col_reward_fine')}</th>
                  <th className="px-3 py-2 text-left">{t('col_status')}</th>
                  <th className="px-3 py-2 text-right">{tCommon('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {templatesQuery.data.rows.map((tpl) => (
                  <tr
                    key={tpl.id}
                    className="border-[var(--ms-border-default)] border-t hover:bg-[var(--ms-bg-app)]"
                    data-test-id={`hr-tpl-row-${tpl.id}`}
                  >
                    <td className="px-3 py-2">
                      <div className="font-medium text-[var(--ms-text-strong)]">{tpl.title}</div>
                      {tpl.description && (
                        <div className="line-clamp-1 text-[var(--ms-text-muted)] text-xs">
                          {tpl.description}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {tpl.assignedEmployee?.name ??
                        (tpl.assignedRole ? `${t('role_prefix')}: ${tpl.assignedRole}` : '—')}
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone="neutral">{t(`trigger_${tpl.triggerType}`)}</Badge>
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={hrTaskPriorityTone(tpl.priority)}>
                        {t(`priority_${tpl.priority}`)}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="text-emerald-600 dark:text-emerald-400">
                        +{fmtMinor(tpl.rewardMinor)}
                      </div>
                      <div className="text-red-600 dark:text-red-400">
                        −{fmtMinor(tpl.fineMinor)}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={activeTone(tpl.isActive)}>
                        {tpl.isActive ? t('active') : t('inactive')}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        {tpl.triggerType === 'manual' && tpl.isActive && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => dispatchMut.mutate(tpl.id)}
                            disabled={dispatchMut.isPending}
                            data-test-id={`hr-tpl-dispatch-${tpl.id}`}
                          >
                            {t('dispatch')}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setEditingTpl(tpl);
                            setModalOpen(true);
                          }}
                          data-test-id={`hr-tpl-edit-${tpl.id}`}
                        >
                          {tCommon('edit')}
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            setActiveMut.mutate({ id: tpl.id, isActive: !tpl.isActive })
                          }
                          disabled={setActiveMut.isPending}
                          data-test-id={`hr-tpl-toggle-${tpl.id}`}
                        >
                          {tpl.isActive ? t('deactivate') : t('activate')}
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={async () => {
                            const ok = await confirm({
                              title: t('delete_confirm'),
                              confirmLabel: tCommon('delete'),
                              tone: 'destructive',
                            });
                            if (ok) removeMut.mutate(tpl.id);
                          }}
                          disabled={removeMut.isPending}
                          data-test-id={`hr-tpl-delete-${tpl.id}`}
                        >
                          {tCommon('delete')}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState title={t('empty_templates')} description={t('empty_templates_hint')} />
          )}
        </div>
      )}

      {tab === 'logs' && (
        <LogsTable
          rows={logsQuery.data?.rows ?? []}
          isLoading={logsQuery.isLoading}
          status={logStatus}
          onStatus={setLogStatus}
          dateFrom={logDateFrom}
          onDateFrom={setLogDateFrom}
          dateTo={logDateTo}
          onDateTo={setLogDateTo}
        />
      )}

      <TemplateModal
        open={modalOpen}
        onOpenChange={(open) => {
          setModalOpen(open);
          if (!open) setEditingTpl(null);
        }}
        mode={editingTpl ? 'edit' : 'create'}
        initialValues={editingTpl}
      />
    </div>
  );
}
