'use client';

// Settings → Сотрудники (moysklad #employee list, 1:1).
// Custom toolbar (NOT ListView — its generic toolbar doesn't match moysklad's
// employee header): H1 + refresh, «+ Сотрудник», «Фильтр» (Состояние popover),
// «ФИО» search, joined count+«Изменить ▾» bulk dropdown, disabled ⚙, and the
// far-right «? Как настроить права доступа» help link. Table itself reuses the
// shared DataTable (same grid ListView renders internally).

import { api } from '@/lib/api-client';
import { employeeImageRawUrl } from '@/lib/image-url';
import {
  Button,
  DataTable,
  type DataTableColumn,
  DropdownMenu,
  ErrorState,
  Icons,
  Input,
  Select,
  useConfirm,
  useDebounce,
  useToast,
} from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

interface EmployeeRoleLink {
  role: {
    id: string;
    name: string;
    isSystem: boolean;
  };
}

interface EmployeeRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  username: string | null;
  telegramPhone: string | null;
  department: string | null;
  position: string | null;
  archived: boolean;
  version: number;
  lastLoginAt: string | null;
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  description: string | null;
  loginAllowed: boolean;
  hasImage: boolean;
  roles: EmployeeRoleLink[];
}

interface ListResponse {
  rows: EmployeeRow[];
  total: number;
  page: number;
  limit: number;
}

/** Partial-result summary returned by the /bulk-* endpoints (runBulk shape). */
interface BulkResult {
  total: number;
  succeeded: string[];
  failed: Array<{ id: string; error: string }>;
}

const LIMIT = 25;

/** «Фамилия» — explicit lastName, else the first word of the display name. */
function surnameOf(row: EmployeeRow): string {
  if (row.lastName) return row.lastName;
  return row.name.split(' ')[0] ?? '';
}

/** «Имя» — explicit firstName, else the rest of the display name. */
function firstNameOf(row: EmployeeRow): string {
  if (row.firstName) return row.firstName;
  return row.name.split(' ').slice(1).join(' ');
}

export default function EmployeesPage() {
  const t = useTranslations('pages.employees');
  const router = useRouter();
  const { toast } = useToast();
  const { confirm } = useConfirm();

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [page, setPage] = useState(1);
  // «Состояние» filter — the API defaults to active-only (archived=false),
  // matching moysklad's default «Действующие» view, so the param is always sent.
  const [archivedFilter, setArchivedFilter] = useState<'false' | 'true'>('false');
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkPending, setBulkPending] = useState(false);

  // Close the «Фильтр» popover on outside click. Clicks inside a portaled
  // Radix popper (the Состояние Select's option list renders into a body
  // portal) are NOT outside — without the guard picking an option would
  // close the popover mid-selection.
  useEffect(() => {
    if (!filterOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (filterRef.current?.contains(target)) return;
      if (target.closest('[data-radix-popper-content-wrapper]')) return;
      setFilterOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [filterOpen]);

  const params = new URLSearchParams({
    page: String(page),
    limit: String(LIMIT),
    archived: archivedFilter,
  });
  if (search) params.set('search', search);

  const { data, isLoading, error, refetch } = useQuery<ListResponse>({
    queryKey: ['settings-employees', search, page, archivedFilter],
    queryFn: () => api.get<ListResponse>(`/hr/employees?${params.toString()}`),
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));
  // moysklad pagination range: «1-6 из 6»; floor is 1 even on an empty list.
  const rangeStart = total === 0 ? 1 : (page - 1) * LIMIT + 1;
  const rangeEnd = total === 0 ? 1 : (page - 1) * LIMIT + rows.length;

  const resetAnd = (fn: () => void) => {
    fn();
    setPage(1);
    setSelectedIds(new Set());
  };

  /** moysklad «Роль» column: system-role names map to fixed labels; any other
   *  first role (system or custom) renders as «Пользователь (name)». */
  const roleLabel = (row: EmployeeRow): string => {
    const first = row.roles[0]?.role;
    if (!first) return '—';
    if (first.isSystem) {
      if (first.name === 'AccountOwner') return t('role_owner');
      if (first.name === 'Administrator') return t('role_admin');
      if (first.name === 'PointOfSale') return t('role_pos');
    }
    return t('role_user', { name: first.name });
  };

  const runBulk = async (action: 'bulk-delete' | 'bulk-archive' | 'bulk-restore') => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0 || bulkPending) return;
    setBulkPending(true);
    try {
      const res = await api.post<BulkResult>(`/hr/employees/${action}`, { ids });
      // Partial-result contract: blocked rows come back 200 with the reason in
      // failed[] (e.g. archiving yourself) — surface it instead of a silent no-op.
      if (res.failed.length > 0) {
        toast.error(res.failed[0]?.error ?? t('bulk_failed'));
      } else {
        toast.success(t('bulk_done', { count: res.succeeded.length }));
      }
      setSelectedIds(new Set());
      await refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('bulk_failed'));
    } finally {
      setBulkPending(false);
    }
  };

  const onBulkDelete = async () => {
    const ok = await confirm({
      title: t('confirm_delete_title', { count: selectedIds.size }),
      description: t('confirm_delete_desc'),
      confirmLabel: t('bulk_delete'),
      cancelLabel: t('cancel'),
      tone: 'destructive',
    });
    if (ok) await runBulk('bulk-delete');
  };

  const columns: DataTableColumn<EmployeeRow>[] = [
    {
      key: 'loginFlag',
      header: t('col_login_flag'),
      width: '52px',
      align: 'center',
      sortable: false,
      cell: (row) =>
        row.loginAllowed && !row.archived && row.username ? (
          <Icons.check className="inline-block h-4 w-4 text-[var(--ms-text-success)]" />
        ) : null,
      cellText: (row) => (row.loginAllowed && !row.archived && row.username ? '✓' : ''),
    },
    {
      key: 'lastName',
      header: t('col_last_name'),
      width: '140px',
      cell: (row) => (
        <span className="font-medium text-[var(--ms-text-primary)]">{surnameOf(row)}</span>
      ),
      cellText: (row) => surnameOf(row),
    },
    {
      key: 'avatar',
      header: '',
      width: '40px',
      align: 'center',
      sortable: false,
      cell: (row) =>
        row.hasImage ? (
          // real card photo (moysklad shows the employee's avatar in the grid)
          <img
            src={employeeImageRawUrl(row.id)}
            alt=""
            className="inline-block h-6 w-6 rounded-full object-cover"
          />
        ) : (
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--ms-bg-muted)]">
            <Icons.user className="h-3.5 w-3.5 text-[var(--ms-text-muted)]" />
          </span>
        ),
    },
    {
      key: 'firstName',
      header: t('col_first_name'),
      width: '130px',
      cell: (row) => <span className="text-[var(--ms-text-primary)]">{firstNameOf(row)}</span>,
      cellText: (row) => firstNameOf(row),
    },
    {
      key: 'middleName',
      header: t('col_middle_name'),
      width: '130px',
      cell: (row) => <span className="text-[var(--ms-text-primary)]">{row.middleName ?? ''}</span>,
      cellText: (row) => row.middleName ?? '',
    },
    {
      key: 'email',
      header: t('col_email'),
      cell: (row) => <span className="text-[var(--ms-text-muted)]">{row.email}</span>,
      cellText: (row) => row.email,
    },
    {
      key: 'phone',
      header: t('col_phone'),
      width: '130px',
      cell: (row) => (
        <span className="text-[var(--ms-text-muted)] tabular-nums">{row.phone ?? ''}</span>
      ),
      cellText: (row) => row.phone ?? '',
    },
    {
      key: 'username',
      header: t('col_login'),
      width: '140px',
      cell: (row) => <span className="text-[var(--ms-text-muted)]">{row.username ?? ''}</span>,
      cellText: (row) => row.username ?? '',
    },
    {
      key: 'description',
      header: t('col_description'),
      cell: (row) => <span className="text-[var(--ms-text-muted)]">{row.description ?? ''}</span>,
      cellText: (row) => row.description ?? '',
    },
    {
      key: 'role',
      header: t('col_role'),
      width: '210px',
      cell: (row) => <span className="text-[var(--ms-text-primary)]">{roleLabel(row)}</span>,
      cellText: (row) => roleLabel(row),
    },
  ];

  return (
    <div className="flex flex-col gap-3 p-4" data-testid="employees-page">
      {/* ─── Header / toolbar row (moysklad #employee) ─── */}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-medium text-[var(--ms-text-primary)] text-xl">{t('title')}</h1>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => refetch()}
          title={t('refresh')}
          aria-label={t('refresh')}
        >
          <Icons.refresh className="h-4 w-4" />
        </Button>

        <Button
          variant="secondary"
          data-testid="employee-create"
          onClick={() => router.push('/settings/employees/new')}
        >
          <Icons.create className="h-4 w-4 text-[var(--ms-text-success)]" />
          {t('add_employee')}
        </Button>

        {/* «Фильтр» — small popover with the «Состояние» select */}
        <div className="relative" ref={filterRef}>
          <Button
            variant="secondary"
            data-testid="employees-filter"
            onClick={() => setFilterOpen((o) => !o)}
          >
            {t('filter')}
          </Button>
          {filterOpen && (
            <div className="absolute top-full left-0 z-[var(--ms-z-popover)] mt-1 w-64 rounded-[var(--ms-radius-md)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-3 shadow-[var(--ms-shadow-elevated)]">
              <div className="mb-1 text-[var(--ms-text-secondary)] text-xs">{t('state_label')}</div>
              <Select
                value={archivedFilter}
                onChange={(next) => resetAnd(() => setArchivedFilter(next))}
                options={[
                  { value: 'false', label: t('state_active') },
                  { value: 'true', label: t('state_archived') },
                ]}
                ariaLabel={t('state_label')}
              />
              <div className="mt-3 flex justify-end">
                <Button
                  variant="link"
                  onClick={() => {
                    resetAnd(() => setArchivedFilter('false'));
                    setFilterOpen(false);
                  }}
                >
                  {t('clear')}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* «ФИО» search */}
        <Input
          value={searchInput}
          onChange={(e) => resetAnd(() => setSearchInput(e.target.value))}
          placeholder={t('search_placeholder')}
          className="w-44"
        />

        {/* Joined count box + «Изменить ▾» bulk dropdown */}
        <div className="flex items-stretch">
          <span className="inline-flex h-9 min-w-9 items-center justify-center rounded-l-[var(--ms-radius-default)] border border-[var(--ms-border-strong)] border-r-0 bg-[var(--ms-bg-muted)] px-2 text-[var(--ms-text-secondary)] text-sm tabular-nums">
            {selectedIds.size}
          </span>
          <DropdownMenu
            trigger={
              <Button
                variant="secondary"
                className="rounded-l-none"
                disabled={selectedIds.size === 0 || bulkPending}
                data-testid="employees-bulk-edit"
              >
                {t('edit')}
                <Icons.down className="h-4 w-4" />
              </Button>
            }
          >
            <DropdownMenu.Item
              destructive
              icon={<Icons.delete className="h-4 w-4" />}
              onSelect={() => void onBulkDelete()}
            >
              {t('bulk_delete')}
            </DropdownMenu.Item>
            <DropdownMenu.Item
              icon={<Icons.archive className="h-4 w-4" />}
              onSelect={() => void runBulk('bulk-archive')}
            >
              {t('bulk_archive')}
            </DropdownMenu.Item>
            <DropdownMenu.Item
              icon={<Icons.restore className="h-4 w-4" />}
              onSelect={() => void runBulk('bulk-restore')}
            >
              {t('bulk_restore')}
            </DropdownMenu.Item>
          </DropdownMenu>
        </div>

        {/* ⚙ column settings — rendered but not wired yet (moysklad parity slot) */}
        <Button
          variant="secondary"
          size="icon"
          disabled
          title={t('columns_settings')}
          aria-label={t('columns_settings')}
        >
          <Icons.settings className="h-4 w-4" />
        </Button>

        {/* Far right: «? Как настроить права доступа» */}
        <a
          href="https://support.moysklad.ru"
          target="_blank"
          rel="noreferrer"
          className="ml-auto inline-flex items-center gap-1 text-[var(--ms-text-brand)] text-sm underline-offset-2 hover:underline"
        >
          <Icons.help className="h-4 w-4" />
          {t('help_rights')}
        </a>
      </div>

      {/* ─── Table ─── */}
      {error ? (
        <ErrorState
          title={t('error_title')}
          description={(error as Error).message}
          onRetry={() => refetch()}
          retryLabel={t('retry')}
        />
      ) : (
        <DataTable<EmployeeRow>
          columns={columns}
          rows={rows}
          keyField="id"
          loading={isLoading}
          selectable
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          onRowClick={(row) => router.push(`/settings/employees/${row.id}`)}
          rowTestId={(row) => `employee-row-${row.id}`}
          empty={
            <div className="py-10 text-center text-[var(--ms-text-secondary)] text-sm">
              {t('empty_title')}
            </div>
          }
        />
      )}

      {/* ─── Pagination: |« ‹ 1-6 из 6 › »| ─── */}
      <div className="flex items-center gap-1 text-[var(--ms-text-muted)] text-xs">
        <button
          type="button"
          onClick={() => setPage(1)}
          disabled={page <= 1}
          aria-label={t('page_first')}
          className="rounded p-1 hover:bg-[var(--ms-bg-muted)] disabled:opacity-30"
          data-testid="employees-page-first"
        >
          <Icons.pageFirst className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setPage((p) => Math.max(p - 1, 1))}
          disabled={page <= 1}
          aria-label={t('page_prev')}
          className="rounded p-1 hover:bg-[var(--ms-bg-muted)] disabled:opacity-30"
          data-testid="employees-page-prev"
        >
          <Icons.left className="h-4 w-4" />
        </button>
        <span className="mx-1 tabular-nums" data-testid="employees-page-range">
          {rangeStart}-{rangeEnd} {t('of')} {total}
        </span>
        <button
          type="button"
          onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
          disabled={page >= totalPages}
          aria-label={t('page_next')}
          className="rounded p-1 hover:bg-[var(--ms-bg-muted)] disabled:opacity-30"
          data-testid="employees-page-next"
        >
          <Icons.right className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setPage(totalPages)}
          disabled={page >= totalPages}
          aria-label={t('page_last')}
          className="rounded p-1 hover:bg-[var(--ms-bg-muted)] disabled:opacity-30"
          data-testid="employees-page-last"
        >
          <Icons.pageLast className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
