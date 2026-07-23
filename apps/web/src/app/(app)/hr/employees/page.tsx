'use client';

/**
 * HR Employees list — moysklad "Сотрудники" parity.
 *
 * moysklad #employee is a real Settings → Справочники catalog list. We keep
 * our richer HR design (avatars, role chips, telegram, department, per-row
 * set-password/edit/delete) AND add the moysklad-parity bulk surface:
 *   - row selection (checkboxes + "N selected")
 *   - «Изменить ▾» dropdown {Удалить, Поместить в архив, Извлечь из архива}
 *   - «Состояние» active/archived view (so «Извлечь из архива» is reachable)
 * See docs/moysklad-reference/employees/ for the captured source-of-truth.
 *
 * Filters: search (debounced 300ms), role dropdown, isChecker toggle, status
 * (active/archived). Server pagination via `page` + `limit=50`.
 */

import { hrEmployeeApi, hrRoleApi } from '@/lib/hr-api';
import type { HrEmployeeListResult, HrEmployeeRow, HrRole } from '@/lib/hr-api';
import {
  Avatar,
  Badge,
  Button,
  Checkbox,
  EmptyState,
  ErrorState,
  Input,
  NativeSelect,
  Skeleton,
  useConfirm,
  useDebounce,
  useToast,
} from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { EmployeeBulkActionsDropdown } from './_components/bulk-actions-dropdown';
import { EmployeeModal } from './_components/employee-modal';
import { SetPasswordModal } from './_components/set-password-modal';

const LIMIT = 50;

export default function HrEmployeesPage() {
  const t = useTranslations('pages.hrEmployees');
  const tCommon = useTranslations('common');
  const tBulk = useTranslations('bulk');
  const router = useRouter();
  const qc = useQueryClient();
  const { confirm } = useConfirm();
  const { toast } = useToast();

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [role, setRole] = useState<string>('');
  const [isChecker, setIsChecker] = useState(false);
  // moysklad «Состояние»: active list by default, archived view on demand.
  const [archived, setArchived] = useState(false);
  const [page, setPage] = useState(1);

  // moysklad row selection for the «Изменить» bulk menu.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const clearSelection = () => setSelectedIds(new Set());

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<HrEmployeeRow | null>(null);
  const [passwordTarget, setPasswordTarget] = useState<HrEmployeeRow | null>(null);

  const queryKey = ['hr-employees', { search, role, isChecker, archived, page }] as const;
  const { data, isLoading, error, refetch } = useQuery<HrEmployeeListResult>({
    queryKey,
    queryFn: () =>
      hrEmployeeApi.list({
        search: search || undefined,
        role: role || undefined,
        isChecker: isChecker || undefined,
        // Backend z.coerce.boolean turns "false" into TRUE — so only ever
        // send `true`; omit for the active view (see HrEmployeeFilter docs).
        archived: archived || undefined,
        page,
        limit: LIMIT,
      }),
  });

  const { data: roles = [] } = useQuery<HrRole[]>({
    queryKey: ['hr-roles'],
    queryFn: () => hrRoleApi.list(),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => hrEmployeeApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr-employees'] });
      toast.success(tCommon('saved'));
    },
    onError: (e: Error) => toast.error(tCommon('action_failed'), { description: e.message }),
  });

  // Per-row restore — shown instead of the archive (❌) icon while viewing the
  // archived list, so the row action there is meaningful (re-archiving an
  // already-archived row is a no-op). Reuses the bulk-restore endpoint.
  const restoreMut = useMutation({
    mutationFn: (id: string) => hrEmployeeApi.bulkRestore([id]),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr-employees'] });
      toast.success(tCommon('saved'));
    },
    onError: (e: Error) => toast.error(tCommon('action_failed'), { description: e.message }),
  });

  const handleDelete = async (row: HrEmployeeRow) => {
    const ok = await confirm({
      title: t('delete_confirm'),
      description: `${row.name} — ${t('delete_confirm_desc')}`,
      confirmLabel: tCommon('delete'),
      tone: 'destructive',
    });
    if (ok) deleteMut.mutate(row.id);
  };

  const initials = (name: string) =>
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? '')
      .join('');

  const labelOfRole = (value: string) => roles.find((r) => r.value === value)?.label ?? value;

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));
  const rows = data?.rows ?? [];
  const hasFilter = !!search || !!role || isChecker || archived;

  // Selection helpers — selection is scoped to the rows currently visible;
  // any filter/page/status change clears it so a bulk action never hits a
  // hidden row the user can no longer see.
  const allOnPageSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.id));
  const toggleAllOnPage = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const r of rows) {
        if (checked) next.add(r.id);
        else next.delete(r.id);
      }
      return next;
    });
  };
  const toggleRow = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };
  // Wrap a state setter so changing the view also resets paging + selection.
  const withReset =
    <T,>(setter: (v: T) => void) =>
    (v: T) => {
      setter(v);
      setPage(1);
      clearSelection();
    };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-semibold text-2xl text-[var(--ms-text-strong)]">{t('title')}</h1>
          <p className="text-[var(--ms-text-muted)] text-sm">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          {selectedIds.size > 0 && (
            <span
              className="text-[var(--ms-text-muted)] text-sm"
              data-test-id="hr-employees-selected-count"
            >
              {tBulk('selected_count', { count: selectedIds.size })}
            </span>
          )}
          <EmployeeBulkActionsDropdown
            selectedIds={selectedIds}
            archivedView={archived}
            onClearSelection={clearSelection}
          />
          <Button onClick={() => setCreateOpen(true)} data-test-id="hr-employees-create">
            + {t('create_button')}
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-3">
        <Input
          type="search"
          value={searchInput}
          onChange={(e) => {
            setSearchInput(e.target.value);
            setPage(1);
            clearSelection();
          }}
          placeholder={t('search_placeholder')}
          className="min-w-[240px] flex-1"
          data-test-id="hr-employees-search"
        />

        <NativeSelect
          value={role}
          onChange={(e) => withReset(setRole)(e.target.value)}
          className="w-auto"
          data-test-id="hr-employees-role-filter"
          aria-label={t('filter_role')}
        >
          <option value="">{t('filter_role_all')}</option>
          {roles.map((r) => (
            <option key={r.id} value={r.value}>
              {r.label}
            </option>
          ))}
        </NativeSelect>

        {/* moysklad «Состояние» — active / archived view */}
        <NativeSelect
          value={archived ? 'archived' : 'active'}
          onChange={(e) => withReset(setArchived)(e.target.value === 'archived')}
          className="w-auto"
          data-test-id="hr-employees-status-filter"
          aria-label={t('filter_status')}
        >
          <option value="active">{tCommon('active')}</option>
          <option value="archived">{tCommon('archived')}</option>
        </NativeSelect>

        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={isChecker}
            onCheckedChange={(v) => withReset(setIsChecker)(v === true)}
            data-test-id="hr-employees-checker-filter"
          />
          {t('filter_checker')}
        </label>
      </div>

      {/* Table */}
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
          <EmptyState
            title={hasFilter ? tCommon('no_results') : t('empty_title')}
            description={hasFilter ? undefined : t('empty_hint')}
          />
        ) : (
          <table className="w-full text-sm">
            <thead className="border-[var(--ms-border-default)] border-b bg-[var(--ms-bg-app)] text-[var(--ms-text-muted)] text-xs">
              <tr>
                <th className="w-10 px-3 py-2 text-left font-medium">
                  <Checkbox
                    checked={
                      // Third visual state when only some rows on the page are
                      // selected (Radix takes 'indeterminate' as a checked value).
                      selectedIds.size > 0 && !allOnPageSelected
                        ? 'indeterminate'
                        : allOnPageSelected
                    }
                    onCheckedChange={(v) => toggleAllOnPage(v === true)}
                    aria-label={tCommon('select_all')}
                    data-test-id="hr-employees-select-all"
                  />
                </th>
                <th className="px-3 py-2 text-left font-medium">{t('col_name')}</th>
                <th className="px-3 py-2 text-left font-medium">{t('col_roles')}</th>
                <th className="px-3 py-2 text-left font-medium">{t('col_telegram')}</th>
                <th className="px-3 py-2 text-left font-medium">{t('col_department')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('col_actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  tabIndex={0}
                  className="cursor-pointer border-[var(--ms-border-default)] border-b last:border-b-0 hover:bg-[var(--ms-bg-hover)] focus:bg-[var(--ms-bg-hover)] focus:outline-none"
                  onClick={() => router.push(`/hr/employees/${row.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      router.push(`/hr/employees/${row.id}`);
                    }
                  }}
                  data-test-id={`hr-employee-row-${row.id}`}
                >
                  <td
                    className="px-3 py-2"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <Checkbox
                      checked={selectedIds.has(row.id)}
                      onCheckedChange={(v) => toggleRow(row.id, v === true)}
                      aria-label={row.name}
                      data-test-id={`hr-employee-select-${row.id}`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Avatar name={row.name} initials={initials(row.name)} size="sm" />
                      <div className="min-w-0">
                        <div className="truncate font-medium text-[var(--ms-text-primary)]">
                          {row.name}
                          {row.isChecker && (
                            <Badge tone="brand" className="ml-2">
                              ✓
                            </Badge>
                          )}
                        </div>
                        <div className="truncate text-[var(--ms-text-muted)] text-[11px]">
                          {row.email || row.phone || '—'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {row.hrRoles.length === 0 && (
                        <span className="text-[var(--ms-text-muted)] text-xs">—</span>
                      )}
                      {row.hrRoles.map((v) => (
                        <Badge key={v} tone="neutral">
                          {labelOfRole(v)}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-[var(--ms-text-muted)] text-xs">
                    {row.telegramPhone || '—'}
                  </td>
                  <td className="px-3 py-2 text-[var(--ms-text-muted)] text-xs">
                    {row.department || '—'}
                  </td>
                  <td
                    className="px-3 py-2"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setPasswordTarget(row)}
                        title={t('action_set_password')}
                        aria-label={t('action_set_password')}
                        data-test-id={`hr-employee-set-password-${row.id}`}
                      >
                        🔑
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setEditTarget(row)}
                        title={t('action_edit')}
                        aria-label={t('action_edit')}
                        data-test-id={`hr-employee-edit-${row.id}`}
                      >
                        ✏️
                      </Button>
                      {archived ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => restoreMut.mutate(row.id)}
                          title={tBulk('restore')}
                          aria-label={tBulk('restore')}
                          data-test-id={`hr-employee-restore-${row.id}`}
                        >
                          ↩️
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleDelete(row)}
                          title={t('action_delete')}
                          aria-label={t('action_delete')}
                          className="hover:text-[var(--ms-text-destructive)]"
                          data-test-id={`hr-employee-delete-${row.id}`}
                        >
                          ❌
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {total > LIMIT && (
        <div className="flex items-center justify-between text-[var(--ms-text-muted)] text-xs">
          <span>
            {tCommon('records_count', { count: total })} · {page} / {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={page <= 1}
              onClick={() => {
                setPage((p) => Math.max(1, p - 1));
                clearSelection();
              }}
              data-test-id="hr-employees-prev"
            >
              ←
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => {
                setPage((p) => p + 1);
                clearSelection();
              }}
              data-test-id="hr-employees-next"
            >
              →
            </Button>
          </div>
        </div>
      )}

      {/* Modals */}
      <EmployeeModal open={createOpen} onOpenChange={setCreateOpen} mode="create" />
      <EmployeeModal
        open={!!editTarget}
        onOpenChange={(v) => !v && setEditTarget(null)}
        mode="edit"
        initialValues={editTarget}
      />
      <SetPasswordModal
        open={!!passwordTarget}
        onOpenChange={(v) => !v && setPasswordTarget(null)}
        employee={passwordTarget}
      />
    </div>
  );
}
