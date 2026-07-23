'use client';

/**
 * /commission-reports — unified «Отчёты комиссионера» list (moysklad «Продажи →
 * Отчёты комиссионера»).
 *
 * One list of BOTH report types — «Выданный отчёт комиссионера» (we are the
 * commissioner) and «Полученный отчёт комиссионера» (we are the consigner) —
 * with a «Тип документа» column, exactly as moysklad (grounded 2026-06-27:
 * docs/audits/commission-reports-list-2026-06-27). Backed by the read-only union
 * endpoint `GET /commission-reports` (CommissionReportService) which UNIONs
 * commission_reports_out + commission_reports_in.
 *
 * Filter panel is pixel-grounded to the real moysklad #commissionreport Фильтр
 * (10-filter-open.png + crop-row1..4): a 6-column grid of 20 fields with the «●»
 * bullet on every reference/value/date/status field and none on the boolean
 * selects + «Тип документа» + «Счет организации». Our model stores only agent /
 * organization / contract / owner / group, so five fields (Товар или группа ·
 * Проект · Счет организации · Канал продаж · Кто изменил) are present for layout
 * parity but carry a «not wired» tooltip and send no filter — they go live with
 * the consignment FSM sprint. Create + bulk-edit / print also join that sprint.
 */

import { ColumnSettings } from '@/components/column-settings';
import { SavedFiltersPills } from '@/components/customer-orders/saved-filters-pills';
import { FilterToggleButton } from '@/components/filters/filter-toggle-button';
import { useColumnVisibility } from '@/hooks/use-column-visibility';
import { useColumnWidths } from '@/hooks/use-column-widths';
import { api } from '@/lib/api-client';
import {
  Button,
  CatalogPicker,
  type DataTableColumn,
  DropdownMenu,
  Icons,
  InlineFilterPanel,
  type ListToolbarMenuItem,
  ListView,
  MassEditModal,
  MultiCombobox,
  NativeSelect,
  PeriodInputs,
  PeriodShortcuts,
  type PickerItem,
  footerMoneyCells,
  formatDate,
  formatMoney,
  useConfirm,
  useDebounce,
  useToast,
} from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import type React from 'react';
import { useState } from 'react';

type Kind = 'out' | 'in';
type RefMulti = { id: string; label: string };
type MassEditPickerValue = { id: string; label: string } | null;

interface CommissionReportRow {
  kind: Kind;
  id: string;
  name: string;
  moment: string;
  organization: { id: string; name: string } | null;
  agent: { id: string; name: string; legalTitle: string | null } | null;
  contract: { id: string; name: string } | null;
  sumMinor: string;
  rewardSumMinor: string;
  otherServicesSumMinor: string;
  commitentSumMinor: string;
  payedSumMinor: string;
  currency: string;
  comment: string | null;
  state: string;
  applicable: boolean;
  printed: boolean;
  published: boolean;
  shared: boolean;
  updatedAt: string;
  owner: { id: string; name: string } | null;
  group: { id: string; name: string } | null;
  // moysklad «Статус» column = account-defined CUSTOM workflow status (coloured
  // pill), NOT the FSM `state`. The list() UNION now resolves it via status_id.
  status: { id: string; name: string; color: string | null } | null;
}

interface ListResponse {
  items: CommissionReportRow[];
  total: number;
  page: number;
  pageSize: number;
  totals: {
    sumMinor: string;
    rewardSumMinor: string;
    otherServicesSumMinor: string;
    commitentSumMinor: string;
    payedSumMinor: string;
    currencies: string[];
  };
}

const PAGE_SIZE = 100;
const KIND_ROUTE: Record<Kind, string> = {
  out: 'commission-reports',
  in: 'commission-reports-in',
};
const CURRENCY_LABEL: Record<string, string> = {
  UZS: 'сум',
  USD: 'доллар',
  EUR: 'евро',
  RUB: 'руб',
};

// Filter fields default to all-visible (moysklad shows every field on
// #commissionreport); the ⚙ enumerates them from the Field children (fieldKey).
const HIDDEN_FILTER_STORAGE = 'commission-reports.filterFields.hidden.v1';

/** localStorage-backed initial hidden-field set (default = all visible). */
function initialHiddenFields(): Set<string> {
  if (typeof window !== 'undefined') {
    const saved = window.localStorage.getItem(HIDDEN_FILTER_STORAGE);
    if (saved) {
      try {
        return new Set(JSON.parse(saved) as string[]);
      } catch {
        // fall through
      }
    }
  }
  return new Set();
}

/** Merge new selection ids back into RefMulti[] keeping known labels. */
function mergeRefs(
  value: RefMulti[],
  nextIds: string[],
  toggled?: { value: string; label: React.ReactNode },
): RefMulti[] {
  return nextIds.map((id) => {
    const ex = value.find((v) => v.id === id);
    if (ex) return ex;
    if (toggled?.value === id) return { id, label: String(toggled.label) };
    return { id, label: id };
  });
}

/**
 * Multi-select reference filter (search + checkbox dropdown). Module-level so its
 * component type is stable across parent renders (inline would remount the
 * MultiCombobox on every keystroke and drop its open/search state).
 */
function MultiRefField(props: {
  label: string;
  fieldKey: string;
  value: RefMulti[];
  onChange: (next: RefMulti[]) => void;
  endpoint: string;
  testId: string;
}) {
  return (
    <InlineFilterPanel.Field label={props.label} fieldKey={props.fieldKey} expandable>
      <MultiCombobox
        value={props.value.map((x) => x.id)}
        items={props.value.map((x) => ({ value: x.id, label: x.label }))}
        onSearch={async (q) => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `${props.endpoint}?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ value: x.id, label: x.name }));
        }}
        onChange={(nextIds, toggled) => props.onChange(mergeRefs(props.value, nextIds, toggled))}
        placeholder=""
        testId={props.testId}
      />
    </InlineFilterPanel.Field>
  );
}

/** Boolean «Да / Нет» select filter — moysklad shows NO «●» bullet on these. */
function BoolField(props: {
  label: string;
  fieldKey: string;
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  testId: string;
}) {
  const tCommon = useTranslations('common');
  return (
    <InlineFilterPanel.Field label={props.label} fieldKey={props.fieldKey} expandable={false}>
      <NativeSelect
        value={props.value ?? ''}
        onChange={(e) => props.onChange(e.target.value || undefined)}
        data-test-id={props.testId}
      >
        <option value="" />
        <option value="false">{tCommon('no')}</option>
        <option value="true">{tCommon('yes')}</option>
      </NativeSelect>
    </InlineFilterPanel.Field>
  );
}

/**
 * Present-for-parity filter whose data our read-only model does not track yet
 * (Товар или группа · Проект · Счет организации · Канал продаж · Кто изменил).
 * Disabled + tooltip; sends no filter. `bullet` mirrors the grounded «●» map.
 */
function NotWiredField(props: {
  label: string;
  fieldKey: string;
  bullet: boolean;
  testId: string;
}) {
  const t = useTranslations('pages.commission_reports');
  return (
    <InlineFilterPanel.Field
      label={props.label}
      fieldKey={props.fieldKey}
      tooltip={t('flt_not_wired')}
      expandable={props.bullet}
    >
      <NativeSelect disabled value="" data-test-id={props.testId}>
        <option value="" />
      </NativeSelect>
    </InlineFilterPanel.Field>
  );
}

export default function CommissionReportsPage() {
  const router = useRouter();
  const t = useTranslations('pages.commission_reports');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tFilters = useTranslations('filters');
  const tBulkActions = useTranslations('bulk_actions');
  const tStatusMenu = useTranslations('money_docs_menu');
  const tPrintMenu = useTranslations('print_menu');
  const tBulk = useTranslations('bulk');

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [sortKey, setSortKey] = useState('moment');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [filterOpen, setFilterOpen] = useState(false);
  const [savedAdding, setSavedAdding] = useState(false);
  const [hiddenFields, setHiddenFields] = useState<Set<string>>(initialHiddenFields);

  // Single-value + range filters.
  const [single, setSingle] = useState<{
    kind?: Kind;
    // «Статус» filter = the account-defined CUSTOM workflow status (State id),
    // mirroring the column + the demands filter. The FSM `state` is no longer a
    // filter field (posting lives in the «Проведено» flag below).
    statusId?: string;
    applicable?: string;
    printed?: string;
    published?: string;
    shared?: string;
    momentFrom?: string;
    momentTo?: string;
    updatedFrom?: string;
    updatedTo?: string;
  }>({});

  // Multi-select reference filters.
  const [organizations, setOrganizations] = useState<RefMulti[]>([]);
  const [agents, setAgents] = useState<RefMulti[]>([]);
  const [agentGroups, setAgentGroups] = useState<RefMulti[]>([]);
  const [agentOwners, setAgentOwners] = useState<RefMulti[]>([]);
  const [contracts, setContracts] = useState<RefMulti[]>([]);
  const [owners, setOwners] = useState<RefMulti[]>([]);
  const [groups, setGroups] = useState<RefMulti[]>([]);

  const resetPage = () => setPage(1);
  const patchSingle = (p: Partial<typeof single>) => {
    setSingle((s) => ({ ...s, ...p }));
    resetPage();
  };

  const clearAll = () => {
    setSingle({});
    setOrganizations([]);
    setAgents([]);
    setAgentGroups([]);
    setAgentOwners([]);
    setContracts([]);
    setOwners([]);
    setGroups([]);
    resetPage();
  };

  const paramsRecord: Record<string, string> = {
    page: String(page),
    pageSize: String(pageSize),
    sortBy: sortKey,
    sortDir,
  };
  if (search) paramsRecord.search = search;
  if (single.kind) paramsRecord.kind = single.kind;
  if (single.statusId) paramsRecord.statusId = single.statusId;
  if (single.applicable) paramsRecord.applicable = single.applicable;
  if (single.printed) paramsRecord.printed = single.printed;
  if (single.published) paramsRecord.published = single.published;
  if (single.shared) paramsRecord.shared = single.shared;
  if (single.momentFrom) paramsRecord.momentFrom = single.momentFrom;
  if (single.momentTo) paramsRecord.momentTo = single.momentTo;
  if (single.updatedFrom) paramsRecord.updatedFrom = single.updatedFrom;
  if (single.updatedTo) paramsRecord.updatedTo = single.updatedTo;
  if (organizations.length) paramsRecord.organizationIds = organizations.map((x) => x.id).join(',');
  if (agents.length) paramsRecord.agentIds = agents.map((x) => x.id).join(',');
  if (agentGroups.length) paramsRecord.agentGroupIds = agentGroups.map((x) => x.id).join(',');
  if (agentOwners.length) paramsRecord.agentOwnerIds = agentOwners.map((x) => x.id).join(',');
  if (contracts.length) paramsRecord.contractIds = contracts.map((x) => x.id).join(',');
  if (owners.length) paramsRecord.ownerIds = owners.map((x) => x.id).join(',');
  if (groups.length) paramsRecord.groupIds = groups.map((x) => x.id).join(',');
  const params = new URLSearchParams(paramsRecord);

  const { data, isLoading, error, refetch } = useQuery<ListResponse>({
    queryKey: ['commission-reports', params.toString()],
    queryFn: () => api.get<ListResponse>(`/commission-reports?${params.toString()}`),
  });

  // «Статус» filter options — the account's CUSTOM workflow statuses. The list
  // UNIONs Выданный (commissionreportout) + Полученный (commissionreportin), so
  // gather BOTH entity types and de-duplicate by id (a status id is unique per
  // account regardless of entityType). Mirrors the demands status filter.
  const { data: statusData } = useQuery<{
    items: Array<{ id: string; name: string; color: string | null }>;
  }>({
    queryKey: ['states', 'commission'],
    queryFn: async () => {
      const [out, inn] = await Promise.all([
        api.get<{ items: Array<{ id: string; name: string; color: string | null }> }>(
          '/states?entityType=commissionreportout',
        ),
        api.get<{ items: Array<{ id: string; name: string; color: string | null }> }>(
          '/states?entityType=commissionreportin',
        ),
      ]);
      const byId = new Map<string, { id: string; name: string; color: string | null }>();
      for (const s of [...(out.items ?? []), ...(inn.items ?? [])]) byId.set(s.id, s);
      return { items: [...byId.values()] };
    },
    staleTime: 60_000,
  });
  const customStatuses = statusData?.items ?? [];

  // moysklad default-visible columns (grounded 2026-06-27, 15 in this order).
  // «Договор» is defined but gear-optional (not in moysklad's default set).
  const cols = useColumnVisibility('commission-reports', [
    'documentType',
    'name',
    'moment',
    'organization',
    'agent',
    'sum',
    'currency',
    'commission',
    'otherServices',
    'commitentSum',
    'payed',
    'state',
    'published',
    'printed',
    'comment',
  ]);
  const colWidths = useColumnWidths('commission-reports');

  const total = data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const hasActiveFilter =
    !!search ||
    Object.values(single).some((v) => v !== undefined && v !== '') ||
    [organizations, agents, agentGroups, agentOwners, contracts, owners, groups].some(
      (a) => a.length > 0,
    );

  // ---- bulk toolbar («N · Изменить ▾ · Печать ▾») --------------------------
  const qc = useQueryClient();
  const { confirm } = useConfirm();
  const { toast } = useToast();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const clearSelection = () => setSelectedIds(new Set());
  const noSel = selectedIds.size === 0;

  const fetchEmployees = async (qq: string): Promise<PickerItem[]> => {
    const r = await api.get<{ items: { id: string; name: string }[] }>(
      `/employees?search=${encodeURIComponent(qq)}&limit=20`,
    );
    return r.items.map((x) => ({ id: x.id, primary: x.name }));
  };

  const afterBulk = () => {
    qc.invalidateQueries({ queryKey: ['commission-reports'] });
    clearSelection();
  };
  const bulkDelete = useMutation({
    mutationFn: () => api.post('/commission-reports/bulk-delete', { ids: Array.from(selectedIds) }),
    onSuccess: afterBulk,
    onError: () => toast.error(tCommon('action_failed')),
  });

  // «Массовое редактирование» — owner + description (model has no projectId).
  const [massEditOpen, setMassEditOpen] = useState(false);
  const [massEditIds, setMassEditIds] = useState<string[]>([]);
  const [massEditOwner, setMassEditOwner] = useState<MassEditPickerValue>(null);
  const [ownerPickerOpen, setOwnerPickerOpen] = useState(false);
  const massEdit = useMutation({
    mutationFn: (patch: { ownerId?: string | null; description?: string | null }) =>
      api.post('/commission-reports/mass-edit', { ids: massEditIds, ...patch }),
    onSuccess: () => {
      setMassEditOpen(false);
      afterBulk();
    },
    onError: () => toast.error(tCommon('action_failed')),
  });

  const editMenuItems: ListToolbarMenuItem[] = [
    {
      id: 'delete',
      label: tCommon('delete'),
      destructive: true,
      disabled: noSel || bulkDelete.isPending,
      onSelect: async () => {
        if (noSel) return;
        const ok = await confirm({
          title: tBulk('delete_confirm', { count: selectedIds.size }),
          confirmLabel: tCommon('delete'),
          tone: 'destructive',
        });
        if (ok === true) bulkDelete.mutate();
      },
    },
    // «Копировать» / «Провести» / «Снять проведение» need the create/post FSM
    // (consignment sprint) — present for menu parity, disabled until then.
    { id: 'duplicate', label: t('act_duplicate'), disabled: true },
    {
      id: 'mass-edit',
      label: tBulkActions('mass_edit'),
      disabled: noSel,
      onSelect: () => {
        setMassEditIds(Array.from(selectedIds));
        setMassEditOwner(null);
        setMassEditOpen(true);
      },
    },
    { id: 'post', label: tStatusMenu('post'), disabled: true },
    { id: 'unpost', label: tStatusMenu('unpost'), disabled: true },
  ];
  // «Печать» — this doc type has no print template yet (moysklad shows a
  // request-form placeholder); present for toolbar parity, disabled.
  const printMenuItems: ListToolbarMenuItem[] = [
    { id: 'no-templates', label: t('print_no_templates'), disabled: true },
  ];

  const money = (minor: string, currency: string) =>
    formatMoney(minor, currency || 'UZS', { displayAs: 'none' });

  const columns: DataTableColumn<CommissionReportRow>[] = [
    {
      key: 'documentType',
      header: tFields('document_type'),
      width: '200px',
      cell: (o) => <span className="text-sm">{t(`type_${o.kind}`)}</span>,
      cellText: (o) => t(`type_${o.kind}`),
    },
    {
      key: 'name',
      header: tFields('number'),
      width: '90px',
      sortable: true,
      cell: (o) => (
        <a
          href={`/${KIND_ROUTE[o.kind]}/${o.id}`}
          className="font-medium text-[var(--ms-text-primary)] underline-offset-2 hover:text-[var(--ms-text-brand)] hover:underline"
        >
          {o.name}
        </a>
      ),
      cellText: (o) => o.name,
    },
    {
      key: 'moment',
      header: t('col_time'),
      width: '140px',
      sortable: true,
      cell: (o) => (
        <span className="text-[var(--ms-text-muted)] text-[12px] tabular-nums">
          {formatDate(o.moment)}
        </span>
      ),
      cellText: (o) => formatDate(o.moment),
    },
    {
      key: 'organization',
      header: tFields('organization'),
      width: '180px',
      cell: (o) => (
        <span className="block max-w-[180px] truncate text-sm">{o.organization?.name ?? ''}</span>
      ),
      cellText: (o) => o.organization?.name ?? '',
    },
    // «Счёт организации» — gear-optional. No organizationAccountId on the read-only
    // model yet (consignment FSM sprint) → present for column-⚙ parity, empty cell.
    {
      key: 'orgAccount',
      header: t('flt_org_account'),
      width: '140px',
      cell: () => <span />,
      cellText: () => '',
    },
    {
      key: 'agent',
      header: tFields('agent'),
      width: '220px',
      sortable: true,
      cell: (o) => (
        <div>
          <div className="max-w-[260px] truncate font-medium">{o.agent?.name ?? ''}</div>
          {o.agent?.legalTitle && (
            <div className="max-w-[260px] truncate text-[var(--ms-text-muted)] text-[11px]">
              {o.agent.legalTitle}
            </div>
          )}
        </div>
      ),
      cellText: (o) =>
        o.agent?.legalTitle ? `${o.agent.name} (${o.agent.legalTitle})` : (o.agent?.name ?? ''),
    },
    // «Счёт контрагента» — gear-optional, no field yet → empty (column-⚙ parity).
    {
      key: 'agentAccount',
      header: t('col_agent_account'),
      width: '140px',
      cell: () => <span />,
      cellText: () => '',
    },
    {
      key: 'sum',
      header: tFields('sum'),
      align: 'right',
      width: '130px',
      sortable: true,
      cell: (o) => (
        <span className="font-medium tabular-nums">{money(o.sumMinor, o.currency)}</span>
      ),
      cellText: (o) => money(o.sumMinor, o.currency),
    },
    {
      key: 'currency',
      header: tFields('currency'),
      width: '70px',
      cell: (o) => (
        <span className="text-[var(--ms-text-muted)] text-sm">
          {CURRENCY_LABEL[o.currency] ?? o.currency}
        </span>
      ),
      cellText: (o) => CURRENCY_LABEL[o.currency] ?? o.currency,
    },
    // «Проект» — gear-optional, no projectId on the model yet → empty (⚙ parity).
    {
      key: 'project',
      header: t('flt_project'),
      width: '140px',
      cell: () => <span />,
      cellText: () => '',
    },
    // «Договор» — gear-optional (moysklad default-hides it), real data when set.
    {
      key: 'contract',
      header: t('col_contract'),
      width: '160px',
      cell: (o) =>
        o.contract ? (
          <span className="text-sm">{o.contract.name}</span>
        ) : (
          <span className="text-[var(--ms-text-muted)] text-sm">—</span>
        ),
      cellText: (o) => o.contract?.name ?? '',
    },
    {
      key: 'commission',
      header: t('col_commission'),
      align: 'right',
      width: '140px',
      sortable: true,
      cell: (o) => (
        <span className="font-medium text-[var(--ms-text-success)] tabular-nums">
          {money(o.rewardSumMinor, o.currency)}
        </span>
      ),
      cellText: (o) => money(o.rewardSumMinor, o.currency),
    },
    {
      key: 'otherServices',
      header: t('col_other_services'),
      align: 'right',
      width: '130px',
      sortable: true,
      cell: (o) => (
        <span className="tabular-nums">{money(o.otherServicesSumMinor, o.currency)}</span>
      ),
      cellText: (o) => money(o.otherServicesSumMinor, o.currency),
    },
    {
      key: 'commitentSum',
      header: t('col_commitent_sum'),
      align: 'right',
      width: '150px',
      sortable: true,
      cell: (o) => <span className="tabular-nums">{money(o.commitentSumMinor, o.currency)}</span>,
      cellText: (o) => money(o.commitentSumMinor, o.currency),
    },
    {
      key: 'payed',
      header: t('col_payed'),
      align: 'right',
      width: '140px',
      sortable: true,
      cell: (o) => {
        const payed = BigInt(o.payedSumMinor);
        const totalSum = BigInt(o.sumMinor);
        const fullyPaid = payed >= totalSum && totalSum > 0n;
        return (
          <span
            className={
              fullyPaid
                ? 'font-medium text-[var(--ms-text-success)] tabular-nums'
                : 'text-[var(--ms-text-muted)] tabular-nums'
            }
          >
            {money(o.payedSumMinor, o.currency)}
          </span>
        );
      },
      cellText: (o) => money(o.payedSumMinor, o.currency),
    },
    // «Осталось оплатить» — gear-optional. Sum − Оплачено (clamped ≥ 0).
    {
      key: 'remaining',
      header: t('col_remaining'),
      align: 'right',
      width: '140px',
      cell: (o) => {
        const rem = BigInt(o.sumMinor) - BigInt(o.payedSumMinor);
        return (
          <span className="text-[var(--ms-text-muted)] tabular-nums">
            {money((rem > 0n ? rem : 0n).toString(), o.currency)}
          </span>
        );
      },
      cellText: (o) => {
        const rem = BigInt(o.sumMinor) - BigInt(o.payedSumMinor);
        return money((rem > 0n ? rem : 0n).toString(), o.currency);
      },
    },
    // «Начало/Конец периода» · «Входящий номер/дата» — gear-optional, no fields yet.
    {
      key: 'periodStart',
      header: t('col_period_start'),
      width: '130px',
      cell: () => <span />,
      cellText: () => '',
    },
    {
      key: 'periodEnd',
      header: t('col_period_end'),
      width: '130px',
      cell: () => <span />,
      cellText: () => '',
    },
    {
      key: 'incomingNumber',
      header: t('col_incoming_number'),
      width: '130px',
      cell: () => <span />,
      cellText: () => '',
    },
    {
      key: 'incomingDate',
      header: t('col_incoming_date'),
      width: '130px',
      cell: () => <span />,
      cellText: () => '',
    },
    {
      key: 'salesChannel',
      header: t('flt_sales_channel'),
      width: '140px',
      cell: () => <span />,
      cellText: () => '',
    },
    // «Общий доступ» — gear-optional, real data (shared boolean).
    {
      key: 'shared',
      header: t('flt_shared'),
      width: '110px',
      align: 'center',
      // moysklad «Общий доступ» = green ✓ when shared, blank otherwise (grounded;
      // NOT «Да»). Mirror products list.
      cell: (o) =>
        o.shared ? (
          <Icons.check
            className="mx-auto h-4 w-4 text-[var(--ms-text-success)]"
            aria-label={tCommon('yes')}
          />
        ) : (
          ''
        ),
      cellText: (o) => (o.shared ? tCommon('yes') : ''),
    },
    // «Владелец-отдел» (group) · «Владелец-сотрудник» (owner) — gear-optional, real data.
    {
      key: 'ownerGroup',
      header: t('flt_group'),
      width: '150px',
      cell: (o) => (
        <span className="block max-w-[150px] truncate text-sm">{o.group?.name ?? ''}</span>
      ),
      cellText: (o) => o.group?.name ?? '',
    },
    {
      key: 'ownerEmployee',
      header: t('flt_owner'),
      width: '160px',
      cell: (o) => (
        <span className="block max-w-[160px] truncate text-sm">{o.owner?.name ?? ''}</span>
      ),
      cellText: (o) => o.owner?.name ?? '',
    },
    {
      // moysklad parity: «Статус» column = the account-defined CUSTOM status
      // (coloured pill), NOT the FSM state. Grey «Status» placeholder until one is
      // assigned. Posting lives in «Проведено», not here. Mirror demands.
      key: 'state',
      header: tFields('state'),
      width: '120px',
      cell: (o) =>
        o.status ? (
          <span
            className="inline-flex items-center whitespace-nowrap rounded-[3px] px-2 py-0.5 font-medium text-white text-xs"
            style={{ backgroundColor: o.status.color ?? 'var(--ms-text-muted)' }}
            data-test-id="commission-status-pill"
          >
            {o.status.name}
          </span>
        ) : (
          <span
            className="inline-flex items-center whitespace-nowrap rounded-[3px] bg-[var(--ms-bg-muted)] px-2 py-0.5 text-[var(--ms-text-muted)] text-xs"
            data-test-id="commission-status-placeholder"
          >
            {tFields('custom_status_placeholder')}
          </span>
        ),
      cellText: (o) => o.status?.name ?? '',
    },
    {
      key: 'published',
      header: tFields('sent'),
      width: '110px',
      // moysklad parity: cyan (#00bfe6) filled pill «Отправлен» when sent, EMPTY
      // otherwise (NOT «Да»). Live-grounded rgb(0,191,230); mirror CO/demands.
      cell: (o) =>
        o.published ? (
          <span
            className="inline-flex items-center whitespace-nowrap rounded-[3px] bg-[#00bfe6] px-2 py-0.5 font-medium text-white text-xs"
            data-test-id="published-badge"
          >
            {tFields('published_badge')}
          </span>
        ) : null,
      cellText: (o) => (o.published ? tFields('published_badge') : ''),
    },
    {
      key: 'printed',
      header: tFields('printed'),
      width: '110px',
      cell: (o) =>
        o.printed ? (
          <span
            className="inline-flex items-center whitespace-nowrap rounded-[3px] bg-[#00bfe6] px-2 py-0.5 font-medium text-white text-xs"
            data-test-id="printed-badge"
          >
            {tFields('printed_badge')}
          </span>
        ) : null,
      cellText: (o) => (o.printed ? tFields('printed_badge') : ''),
    },
    {
      key: 'comment',
      header: tFields('comment'),
      cell: (o) => (
        <span className="block max-w-[240px] truncate text-[var(--ms-text-muted)] text-sm">
          {o.comment ?? ''}
        </span>
      ),
      cellText: (o) => o.comment ?? '',
    },
    // «Когда изменен» — gear-optional, real data (updatedAt).
    {
      key: 'updatedAt',
      header: t('flt_updated'),
      width: '140px',
      cell: (o) => (
        <span className="text-[var(--ms-text-muted)] text-[12px] tabular-nums">
          {formatDate(o.updatedAt)}
        </span>
      ),
      cellText: (o) => formatDate(o.updatedAt),
    },
    // «Кто изменил» — gear-optional, no modifiedBy tracking yet → empty (⚙ parity).
    {
      key: 'modifiedBy',
      header: t('flt_modified_by'),
      width: '160px',
      cell: () => <span />,
      cellText: () => '',
    },
  ];

  // Footer «Итого» — five money totals across the whole filtered set, with the
  // shared currency-guard («—» on a mixed-currency set, «…» until loaded).
  const footerRow: Record<string, React.ReactNode> = footerMoneyCells(data?.totals, {
    sum: data?.totals?.sumMinor ?? '0',
    commission: data?.totals?.rewardSumMinor ?? '0',
    otherServices: data?.totals?.otherServicesSumMinor ?? '0',
    commitentSum: data?.totals?.commitentSumMinor ?? '0',
    payed: data?.totals?.payedSumMinor ?? '0',
  });

  const wireMulti =
    (setter: (v: RefMulti[]) => void) =>
    (next: RefMulti[]): void => {
      setter(next);
      resetPage();
    };

  const applySaved = (qs: string) => {
    const sp = new URLSearchParams(qs);
    clearAll();
    const refs = (key: string, set: (v: RefMulti[]) => void) => {
      const v = sp.get(key);
      if (v)
        set(
          v
            .split(',')
            .filter(Boolean)
            .map((id) => ({ id, label: id })),
        );
    };
    refs('organizationIds', setOrganizations);
    refs('agentIds', setAgents);
    refs('agentGroupIds', setAgentGroups);
    refs('agentOwnerIds', setAgentOwners);
    refs('contractIds', setContracts);
    refs('ownerIds', setOwners);
    refs('groupIds', setGroups);
    setSingle({
      kind: (sp.get('kind') as Kind) || undefined,
      statusId: sp.get('statusId') || undefined,
      applicable: sp.get('applicable') || undefined,
      printed: sp.get('printed') || undefined,
      published: sp.get('published') || undefined,
      shared: sp.get('shared') || undefined,
      momentFrom: sp.get('momentFrom') || undefined,
      momentTo: sp.get('momentTo') || undefined,
      updatedFrom: sp.get('updatedFrom') || undefined,
      updatedTo: sp.get('updatedTo') || undefined,
    });
    resetPage();
  };

  const periodShortcuts = (apply: (from: string, to: string) => void) => (
    <PeriodShortcuts
      onChange={({ from, to }) => apply(from ?? '', to ?? '')}
      labels={{
        yesterday: tFilters('period_yesterday'),
        today: tFilters('period_today'),
        week: tFilters('period_week'),
        month: tFilters('period_month'),
      }}
    />
  );

  return (
    <>
      <ListView
        testId="commission-reports-page"
        moyskladToolbar
        title={t('title')}
        onRefresh={() => refetch()}
        selectable
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        selectionCount={selectedIds.size}
        editMenu={{ label: tBulkActions('trigger'), items: editMenuItems }}
        printMenu={{ label: tPrintMenu('trigger'), items: printMenuItems }}
        search={searchInput}
        onSearchChange={(v) => {
          setSearchInput(v);
          resetPage();
        }}
        searchPlaceholder={t('search_placeholder')}
        columns={columns}
        rows={data?.items ?? []}
        keyField="id"
        rowTestId={(o) => `commission-report-row-${o.id}`}
        total={total}
        limit={pageSize}
        paginationOffset={(page - 1) * pageSize}
        hasPrevious={page > 1}
        hasNext={page < lastPage}
        onPrevious={() => setPage((p) => Math.max(1, p - 1))}
        onNext={() => setPage((p) => Math.min(lastPage, p + 1))}
        onFirst={() => setPage(1)}
        onLast={() => setPage(lastPage)}
        loading={isLoading}
        error={error as Error | null}
        onRetry={() => refetch()}
        emptyTitle={hasActiveFilter ? tCommon('no_results') : t('empty_title')}
        hasActiveFilter={hasActiveFilter}
        footerRow={footerRow}
        sortKey={sortKey}
        sortDir={sortDir}
        onSortChange={(key, dir) => {
          setSortKey(key);
          setSortDir(dir);
          resetPage();
        }}
        visibleColumnKeys={cols.visibleKeys}
        extraActionsLeft={
          <>
            {/* «⊕ Отчет комиссионера ▾» — create dropdown (moysklad order:
              «Полученный» then «Выданный»). «Выданный» (out) opens the live editor;
              «Полученный» (in) joins the next focused session (stays disabled). */}
            <DropdownMenu
              trigger={
                <Button variant="primary" data-test-id="commission-create">
                  {t('create_trigger')}
                  <Icons.down className="h-4 w-4" />
                </Button>
              }
              testId="commission-create-menu"
            >
              <DropdownMenu.Item
                onSelect={() => router.push('/commission-reports/new-in')}
                testId="commission-create-in"
              >
                {t('type_in')}
              </DropdownMenu.Item>
              <DropdownMenu.Item
                onSelect={() => router.push('/commission-reports/new')}
                testId="commission-create-out"
              >
                {t('type_out')}
              </DropdownMenu.Item>
            </DropdownMenu>
            <FilterToggleButton
              open={filterOpen}
              onToggle={() => setFilterOpen((v) => !v)}
              label={tFilters('trigger')}
            />
          </>
        }
        headerSlot={
          <InlineFilterPanel
            hidden={!filterOpen}
            columns={6}
            applyLabel={tFilters('find')}
            clearLabel={tFilters('clear')}
            onClear={clearAll}
            onBookmarkClick={() => setSavedAdding(true)}
            fieldVisibility={{
              hidden: hiddenFields,
              onToggle: (key) =>
                setHiddenFields((prev) => {
                  const next = new Set(prev);
                  if (next.has(key)) next.delete(key);
                  else next.add(key);
                  if (typeof window !== 'undefined') {
                    window.localStorage.setItem(HIDDEN_FILTER_STORAGE, JSON.stringify([...next]));
                  }
                  return next;
                }),
            }}
            pills={
              <SavedFiltersPills
                entity="commissionreport"
                currentQueryString={params.toString()}
                onApply={applySaved}
                adding={savedAdding}
                onAddingChange={setSavedAdding}
              />
            }
            testId="commission-reports-inline-filter"
          >
            {/* Row 1 — Период · Товар или группа · Проект · Контрагент · Группа контрагента */}
            <InlineFilterPanel.Field
              label={t('flt_period')}
              fieldKey="period"
              inlineSuffix={periodShortcuts((from, to) =>
                patchSingle({ momentFrom: from, momentTo: to }),
              )}
              expandable
            >
              <PeriodInputs
                from={single.momentFrom}
                to={single.momentTo}
                onChange={({ from, to }) => patchSingle({ momentFrom: from, momentTo: to })}
                testId="filter-period"
              />
            </InlineFilterPanel.Field>
            <NotWiredField
              label={t('flt_product')}
              fieldKey="product"
              bullet
              testId="filter-product"
            />
            <NotWiredField
              label={t('flt_project')}
              fieldKey="project"
              bullet
              testId="filter-project"
            />
            <MultiRefField
              label={t('flt_agent')}
              fieldKey="agent"
              value={agents}
              onChange={wireMulti(setAgents)}
              endpoint="/counterparties"
              testId="filter-agent"
            />
            <MultiRefField
              label={t('flt_agent_group')}
              fieldKey="agentGroup"
              value={agentGroups}
              onChange={wireMulti(setAgentGroups)}
              endpoint="/groups"
              testId="filter-agent-group"
            />

            {/* Row 2 — Договор · Владелец контрагента · Организация · Счет организации · Тип документа · Статус */}
            <MultiRefField
              label={t('flt_contract')}
              fieldKey="contract"
              value={contracts}
              onChange={wireMulti(setContracts)}
              endpoint="/contracts"
              testId="filter-contract"
            />
            <MultiRefField
              label={t('flt_agent_owner')}
              fieldKey="agentOwner"
              value={agentOwners}
              onChange={wireMulti(setAgentOwners)}
              endpoint="/employees"
              testId="filter-agent-owner"
            />
            <MultiRefField
              label={t('flt_organization')}
              fieldKey="organization"
              value={organizations}
              onChange={wireMulti(setOrganizations)}
              endpoint="/organizations"
              testId="filter-org"
            />
            <NotWiredField
              label={t('flt_org_account')}
              fieldKey="orgAccount"
              bullet={false}
              testId="filter-org-account"
            />
            <InlineFilterPanel.Field
              label={t('flt_doc_type')}
              fieldKey="docType"
              expandable={false}
            >
              <NativeSelect
                value={single.kind ?? ''}
                onChange={(e) =>
                  patchSingle({ kind: (e.target.value || undefined) as Kind | undefined })
                }
                data-test-id="filter-kind"
              >
                <option value="">{t('flt_all')}</option>
                <option value="out">{t('type_out')}</option>
                <option value="in">{t('type_in')}</option>
              </NativeSelect>
            </InlineFilterPanel.Field>
            <InlineFilterPanel.Field label={t('flt_status')} fieldKey="status" expandable>
              <NativeSelect
                value={single.statusId ?? ''}
                onChange={(e) => patchSingle({ statusId: e.target.value || undefined })}
                data-test-id="filter-status"
              >
                <option value="" />
                {customStatuses.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </NativeSelect>
            </InlineFilterPanel.Field>

            {/* Row 3 — Проведено · Напечатано · Отправлено · Канал продаж · Владелец-сотрудник · Владелец-отдел */}
            <BoolField
              label={t('flt_applicable')}
              fieldKey="applicable"
              value={single.applicable}
              onChange={(v) => patchSingle({ applicable: v })}
              testId="filter-applicable"
            />
            <BoolField
              label={t('flt_printed')}
              fieldKey="printed"
              value={single.printed}
              onChange={(v) => patchSingle({ printed: v })}
              testId="filter-printed"
            />
            <BoolField
              label={t('flt_sent')}
              fieldKey="sent"
              value={single.published}
              onChange={(v) => patchSingle({ published: v })}
              testId="filter-sent"
            />
            <NotWiredField
              label={t('flt_sales_channel')}
              fieldKey="salesChannel"
              bullet
              testId="filter-sales-channel"
            />
            <MultiRefField
              label={t('flt_owner')}
              fieldKey="owner"
              value={owners}
              onChange={wireMulti(setOwners)}
              endpoint="/employees"
              testId="filter-owner"
            />
            <MultiRefField
              label={t('flt_group')}
              fieldKey="group"
              value={groups}
              onChange={wireMulti(setGroups)}
              endpoint="/groups"
              testId="filter-group"
            />

            {/* Row 4 — Общий доступ · Когда изменен · Кто изменил */}
            <BoolField
              label={t('flt_shared')}
              fieldKey="shared"
              value={single.shared}
              onChange={(v) => patchSingle({ shared: v })}
              testId="filter-shared"
            />
            <InlineFilterPanel.Field
              label={t('flt_updated')}
              fieldKey="updated"
              inlineSuffix={periodShortcuts((from, to) =>
                patchSingle({ updatedFrom: from, updatedTo: to }),
              )}
              expandable
            >
              <PeriodInputs
                from={single.updatedFrom}
                to={single.updatedTo}
                onChange={({ from, to }) => patchSingle({ updatedFrom: from, updatedTo: to })}
                testId="filter-updated"
              />
            </InlineFilterPanel.Field>
            <NotWiredField
              label={t('flt_modified_by')}
              fieldKey="modifiedBy"
              bullet
              testId="filter-modified-by"
            />
          </InlineFilterPanel>
        }
        headerEndSlot={
          <ColumnSettings
            columns={columns.map((c) => ({ key: c.key, label: c.header }))}
            visibleKeys={cols.visibleKeys}
            onChange={cols.setVisibleKeys}
            onReset={cols.reset}
            rowsPerPage={pageSize}
            onRowsPerPageChange={(n) => {
              setPageSize(n);
              setPage(1);
            }}
          />
        }
        columnWidths={colWidths.values}
        onColumnResize={colWidths.set}
      />
      <MassEditModal
        open={massEditOpen}
        onOpenChange={setMassEditOpen}
        onSubmit={(patch) => massEdit.mutate(patch)}
        selectedCount={massEditIds.length}
        ownerValue={massEditOwner}
        onOwnerPick={() => setOwnerPickerOpen(true)}
        onOwnerClear={() => setMassEditOwner(null)}
        projectValue={null}
        onProjectPick={() => {}}
        onProjectClear={() => {}}
        hideProject
        labels={{
          title: t('mass_edit_title'),
          ownerLabel: t('mass_edit_owner_label'),
          projectLabel: t('flt_project'),
          descriptionLabel: t('mass_edit_description_label'),
          apply: t('mass_edit_apply'),
          cancel: t('mass_edit_cancel'),
        }}
        testId="commission-mass-edit"
      />
      <CatalogPicker
        open={ownerPickerOpen}
        onClose={() => setOwnerPickerOpen(false)}
        title={t('mass_edit_owner_label')}
        fetcher={fetchEmployees}
        onSelect={(item) => setMassEditOwner({ id: item.id, label: String(item.primary) })}
      />
    </>
  );
}
