'use client';

/**
 * /payments — unified «Платежи» list (moysklad «Деньги → Платежи»).
 *
 * One list of every payment document — Входящий платеж / Исходящий платеж /
 * Приходный ордер / Расходный ордер — with a Приход and a Расход money column,
 * exactly as moysklad's «Платежи» tab. Backed by the read-only union endpoint
 * `GET /payments` (PaymentsService). Each №-link routes to the matching
 * per-type editor; the «+ Приход ▾» / «+ Расход ▾» menus open those editors'
 * /new pages.
 *
 * Filter panel is pixel-grounded to the real moysklad «Платежи» Фильтр
 * (docs/audits/payments-in-audit-2026-06-25/moysklad/31-filter-panel.png):
 * a 6-column grid of 24 fields, reference fields are multi-select (search +
 * checkboxes), saved filters via the 🔖 bookmark, field show/hide via ⚙.
 * Five fields (Распределён · Точка продаж · Отправлено · Кто изменил · Дата
 * начисления) are present for layout parity but our schema does not track
 * their data yet → they carry a «not wired» tooltip and send no filter.
 */

import { ColumnSettings } from '@/components/column-settings';
import { SavedFiltersPills } from '@/components/customer-orders/saved-filters-pills';
import { FilterToggleButton } from '@/components/filters/filter-toggle-button';
import { useMoneyPrintMenuItems } from '@/components/money/document-toolbar-menus';
import { useColumnVisibility } from '@/hooks/use-column-visibility';
import { useColumnWidths } from '@/hooks/use-column-widths';
import { api } from '@/lib/api-client';
import {
  Button,
  type DataTableColumn,
  DropdownMenu,
  Icons,
  InlineFilterPanel,
  type ListToolbarMenuItem,
  ListView,
  MoneyInput,
  MultiCombobox,
  NativeSelect,
  PeriodInputs,
  PeriodShortcuts,
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

type Kind = 'paymentin' | 'paymentout' | 'cashin' | 'cashout';
type RefMulti = { id: string; label: string };

interface PaymentRow {
  kind: Kind;
  id: string;
  name: string;
  moment: string;
  organization: { id: string; name: string } | null;
  organizationAccountName: string | null;
  agent: { id: string; name: string } | null;
  agentAccountName: string | null;
  incomeMinor: string;
  expenseMinor: string;
  currency: string;
  paymentPurpose: string | null;
  comment: string | null;
  sent: null;
  printed: boolean;
  state: string;
  // extra column-settings fields (moysklad ⚙); default-hidden columns
  contractName: string | null;
  projectName: string | null;
  salesChannelName: string | null;
  ownerName: string | null;
  groupName: string | null;
  expenseItem: string | null;
  shared: boolean;
  incomingNumber: string | null;
  incomingDate: string | null;
  linkedMinor: string;
  notLinkedMinor: string;
  updatedAt: string;
}

interface ListResponse {
  items: PaymentRow[];
  total: number;
  page: number;
  pageSize: number;
  totals: { incomeMinor: string; expenseMinor: string; currencies: string[] };
}

const PAGE_SIZE = 100;

const KIND_ROUTE: Record<Kind, string> = {
  paymentin: 'payments-in',
  paymentout: 'payments-out',
  cashin: 'cash-in',
  cashout: 'cash-out',
};

// Every filter field's stable key, in moysklad grid order.
const FILTER_FIELD_KEYS = [
  'period',
  'expenseItem',
  'sum',
  'distributed',
  'pointOfSale',
  'project',
  'agent',
  'agentGroup',
  'contract',
  'agentOwner',
  'organization',
  'orgAccount',
  'docType',
  'status',
  'applicable',
  'printed',
  'sentFlag',
  'salesChannel',
  'noClosing',
  'owner',
  'group',
  'shared',
  'updated',
  'modifiedBy',
  'accrualDate',
] as const;
// moysklad «Платежи» DEFAULT-visible filter fields (the ⚙ checklist's default
// ticks — grounded 2026-06-26 from the user's live moysklad: only these 6 show
// out-of-box; the rest are revealed via the gear). NOT all 25 at once.
const DEFAULT_VISIBLE_FILTER_FIELDS = [
  'period',
  'agent',
  'organization',
  'orgAccount',
  'owner',
  'accrualDate',
];
const HIDDEN_FILTER_STORAGE = 'payments.filterFields.hidden.v1';

/** localStorage-backed initial hidden-field set (default = all but the 6). */
function initialHiddenFields(): Set<string> {
  if (typeof window !== 'undefined') {
    const saved = window.localStorage.getItem(HIDDEN_FILTER_STORAGE);
    if (saved) {
      try {
        return new Set(JSON.parse(saved) as string[]);
      } catch {
        // fall through to the default below
      }
    }
  }
  return new Set(FILTER_FIELD_KEYS.filter((k) => !DEFAULT_VISIBLE_FILTER_FIELDS.includes(k)));
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
 * Multi-select reference filter (search + checkbox dropdown). Module-level so
 * its component type is stable across parent renders — defining it inline would
 * remount the MultiCombobox on every keystroke and drop its open/search state.
 */
function MultiRefField(props: {
  label: string;
  fieldKey: string;
  value: RefMulti[];
  onChange: (next: RefMulti[]) => void;
  endpoint: string;
  testId: string;
  /** When true the picker value IS the item name (e.g. «Статья расходов»). */
  byName?: boolean;
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
          return r.items.map((x) => ({ value: props.byName ? x.name : x.id, label: x.name }));
        }}
        onChange={(nextIds, toggled) => props.onChange(mergeRefs(props.value, nextIds, toggled))}
        placeholder=""
        testId={props.testId}
      />
    </InlineFilterPanel.Field>
  );
}

/** Boolean «Да / Нет» select filter. */
function BoolField(props: {
  label: string;
  fieldKey: string;
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  testId: string;
  tooltip?: string;
}) {
  const tCommon = useTranslations('common');
  return (
    <InlineFilterPanel.Field
      label={props.label}
      fieldKey={props.fieldKey}
      tooltip={props.tooltip}
      expandable
    >
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

export default function PaymentsPage() {
  const t = useTranslations('pages.payments');
  const tFields = useTranslations('fields');
  const tCommon = useTranslations('common');
  const tFilters = useTranslations('filters');
  const tStates = useTranslations('states.payment_in');
  const router = useRouter();

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [page, setPage] = useState(1);
  // «Количество строк» — rows-per-page, chosen in the column ⚙ (25 / 50 / 100).
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [sortKey, setSortKey] = useState('moment');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [filterOpen, setFilterOpen] = useState(false);
  const [savedAdding, setSavedAdding] = useState(false);
  const [hiddenFields, setHiddenFields] = useState<Set<string>>(initialHiddenFields);
  // «Дата начисления» is data-less (no accrual date on payment docs) but is in
  // moysklad's default-visible 6, so it renders as a live date-range for layout
  // parity — its value is NOT sent as a filter (see the «not wired» tooltip).
  const [accrual, setAccrual] = useState<{ from?: string; to?: string }>({});

  // Single-value + range filters.
  const [single, setSingle] = useState<{
    kind?: Kind;
    state?: string;
    applicable?: string;
    printed?: string;
    shared?: string;
    noClosingDocs?: string;
    momentFrom?: string;
    momentTo?: string;
    updatedFrom?: string;
    updatedTo?: string;
    sumFrom?: string;
    sumTo?: string;
  }>({});

  // Multi-select reference filters (search + checkbox dropdowns).
  const [organizations, setOrganizations] = useState<RefMulti[]>([]);
  const [agents, setAgents] = useState<RefMulti[]>([]);
  const [agentGroups, setAgentGroups] = useState<RefMulti[]>([]);
  const [agentOwners, setAgentOwners] = useState<RefMulti[]>([]);
  const [contracts, setContracts] = useState<RefMulti[]>([]);
  const [projects, setProjects] = useState<RefMulti[]>([]);
  const [orgAccounts, setOrgAccounts] = useState<RefMulti[]>([]);
  const [owners, setOwners] = useState<RefMulti[]>([]);
  const [groups, setGroups] = useState<RefMulti[]>([]);
  const [salesChannels, setSalesChannels] = useState<RefMulti[]>([]);
  const [expenseItems, setExpenseItems] = useState<RefMulti[]>([]);

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
    setProjects([]);
    setOrgAccounts([]);
    setOwners([]);
    setGroups([]);
    setSalesChannels([]);
    setExpenseItems([]);
    setAccrual({});
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
  if (single.state) paramsRecord.state = single.state;
  if (single.applicable) paramsRecord.applicable = single.applicable;
  if (single.printed) paramsRecord.printed = single.printed;
  if (single.shared) paramsRecord.shared = single.shared;
  if (single.noClosingDocs) paramsRecord.noClosingDocs = single.noClosingDocs;
  if (single.momentFrom) paramsRecord.momentFrom = single.momentFrom;
  if (single.momentTo) paramsRecord.momentTo = single.momentTo;
  if (single.updatedFrom) paramsRecord.updatedFrom = single.updatedFrom;
  if (single.updatedTo) paramsRecord.updatedTo = single.updatedTo;
  if (single.sumFrom) paramsRecord.sumFrom = single.sumFrom;
  if (single.sumTo) paramsRecord.sumTo = single.sumTo;
  if (organizations.length) paramsRecord.organizationIds = organizations.map((x) => x.id).join(',');
  if (agents.length) paramsRecord.agentIds = agents.map((x) => x.id).join(',');
  if (agentGroups.length) paramsRecord.agentGroupIds = agentGroups.map((x) => x.id).join(',');
  if (agentOwners.length) paramsRecord.agentOwnerIds = agentOwners.map((x) => x.id).join(',');
  if (contracts.length) paramsRecord.contractIds = contracts.map((x) => x.id).join(',');
  if (projects.length) paramsRecord.projectIds = projects.map((x) => x.id).join(',');
  if (orgAccounts.length)
    paramsRecord.organizationAccountIds = orgAccounts.map((x) => x.id).join(',');
  if (owners.length) paramsRecord.ownerIds = owners.map((x) => x.id).join(',');
  if (groups.length) paramsRecord.groupIds = groups.map((x) => x.id).join(',');
  if (salesChannels.length) paramsRecord.salesChannelIds = salesChannels.map((x) => x.id).join(',');
  if (expenseItems.length) paramsRecord.expenseItems = expenseItems.map((x) => x.id).join(',');
  const params = new URLSearchParams(paramsRecord);

  const { data, isLoading, error, refetch } = useQuery<ListResponse>({
    queryKey: ['payments', params.toString()],
    queryFn: () => api.get<ListResponse>(`/payments?${params.toString()}`),
  });

  // moysklad «Платежи» DEFAULT-visible table columns (grounded 2026-06-26 from
  // the user's live column ⚙): the 16 below show out-of-box; the rest are
  // gear-optional. Mirrors the filter's default-6 grounding.
  const cols = useColumnVisibility('payments', [
    'documentType',
    'name',
    'moment',
    'organization',
    'organizationAccount',
    'agent',
    'agentAccount',
    'income',
    'currency',
    'expense',
    'currencyExp',
    'paymentPurpose',
    'state',
    'sent',
    'printed',
    'comment',
  ]);
  const colWidths = useColumnWidths('payments');

  const total = data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const hasActiveFilter =
    !!search ||
    Object.values(single).some((v) => v !== undefined && v !== '') ||
    [
      organizations,
      agents,
      agentGroups,
      agentOwners,
      contracts,
      projects,
      orgAccounts,
      owners,
      groups,
      salesChannels,
      expenseItems,
    ].some((a) => a.length > 0);

  // ---- bulk toolbar (moysklad «N · Изменить ▾ · Статус ▾ · Печать ▾») --------
  const qc = useQueryClient();
  const { confirm } = useConfirm();
  const { toast } = useToast();
  const tBulk = useTranslations('bulk');
  const tBulkActions = useTranslations('bulk_actions');
  const tPrintMenu = useTranslations('print_menu');
  const tStatusMenu = useTranslations('money_docs_menu');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const clearSelection = () => setSelectedIds(new Set());
  // Group selected ids by document kind so each subset goes to its own per-type
  // bulk endpoint — the union list mixes all four payment types in one grid.
  const groupSelectedByKind = (): Array<[Kind, string[]]> => {
    const m = new Map<Kind, string[]>();
    for (const r of data?.items ?? []) {
      if (selectedIds.has(r.id)) {
        const arr = m.get(r.kind) ?? [];
        arr.push(r.id);
        m.set(r.kind, arr);
      }
    }
    return [...m];
  };
  const afterBulk = () => {
    qc.invalidateQueries({ queryKey: ['payments'] });
    clearSelection();
  };
  const bulkDelete = useMutation({
    mutationFn: async () => {
      const res = await Promise.all(
        groupSelectedByKind().map(([kind, ids]) =>
          api.post<{ failed: { id: string; error: string }[] }>(
            `/${KIND_ROUTE[kind]}/bulk-delete`,
            {
              ids,
            },
          ),
        ),
      );
      return res.flatMap((r) => r.failed ?? []);
    },
    onSuccess: (failed) => {
      afterBulk();
      if (failed.length > 0) toast.error(failed[0]?.error ?? tCommon('action_failed'));
    },
  });
  const bulkTransition = useMutation({
    mutationFn: async (target: string) => {
      await Promise.all(
        groupSelectedByKind().map(([kind, ids]) =>
          api.post(`/${KIND_ROUTE[kind]}/bulk-transition`, { ids, target }),
        ),
      );
    },
    onSuccess: afterBulk,
  });
  const noSel = selectedIds.size === 0;
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
    { id: 'mass-edit', label: tBulkActions('mass_edit'), disabled: true },
  ];
  const statusMenuItems: ListToolbarMenuItem[] = [
    {
      id: 'post',
      label: tStatusMenu('post'),
      disabled: noSel || bulkTransition.isPending,
      onSelect: () => bulkTransition.mutate('post'),
    },
    {
      id: 'unpost',
      label: tStatusMenu('unpost'),
      disabled: noSel || bulkTransition.isPending,
      onSelect: () => bulkTransition.mutate('unpost'),
    },
    {
      id: 'cancel',
      label: t('status_cancel'),
      destructive: true,
      disabled: noSel || bulkTransition.isPending,
      onSelect: () => bulkTransition.mutate('cancel'),
    },
  ];
  const printMenuItems = useMoneyPrintMenuItems();

  const moneyCell = (minor: string, currency: string) =>
    minor && minor !== '0' ? formatMoney(minor, currency || 'UZS', { displayAs: 'none' }) : '';

  const columns: DataTableColumn<PaymentRow>[] = [
    {
      key: 'documentType',
      header: tFields('document_type'),
      width: '150px',
      cell: (p) => <span className="text-sm">{t(`type_${p.kind}`)}</span>,
      cellText: (p) => t(`type_${p.kind}`),
    },
    {
      key: 'name',
      header: tFields('number'),
      width: '90px',
      sortable: true,
      cell: (p) => (
        <a
          href={`/${KIND_ROUTE[p.kind]}/${p.id}`}
          className="font-medium text-[var(--ms-text-primary)] underline-offset-2 hover:text-[var(--ms-text-brand)] hover:underline"
        >
          {p.name}
        </a>
      ),
      cellText: (p) => p.name,
    },
    {
      key: 'moment',
      header: tFields('time'),
      width: '130px',
      sortable: true,
      cell: (p) => (
        <span className="text-[var(--ms-text-muted)] text-xs">{formatDate(p.moment)}</span>
      ),
      cellText: (p) => formatDate(p.moment),
    },
    {
      key: 'organization',
      header: tFields('organization'),
      width: '160px',
      cell: (p) => (
        <span className="block max-w-[160px] truncate text-sm">{p.organization?.name ?? ''}</span>
      ),
      cellText: (p) => p.organization?.name ?? '',
    },
    {
      key: 'organizationAccount',
      header: tFields('organization_account'),
      width: '120px',
      cell: (p) => (
        <span className="block max-w-[120px] truncate text-[var(--ms-text-muted)] text-[11px]">
          {p.organizationAccountName ?? ''}
        </span>
      ),
      cellText: (p) => p.organizationAccountName ?? '',
    },
    {
      key: 'agent',
      header: tFields('agent'),
      width: '200px',
      cell: (p) => (
        <span className="block max-w-[200px] truncate font-medium">{p.agent?.name ?? ''}</span>
      ),
      cellText: (p) => p.agent?.name ?? '',
    },
    {
      key: 'agentAccount',
      header: tFields('agent_account'),
      width: '120px',
      cell: (p) => (
        <span className="block max-w-[120px] truncate text-[var(--ms-text-muted)] text-[11px]">
          {p.agentAccountName ?? ''}
        </span>
      ),
      cellText: (p) => p.agentAccountName ?? '',
    },
    {
      key: 'income',
      header: tFields('income'),
      align: 'right',
      width: '140px',
      sortable: true,
      cell: (p) => (
        <span className="font-medium text-[var(--ms-status-success-text,#2e7d32)] tabular-nums">
          {moneyCell(p.incomeMinor, p.currency)}
        </span>
      ),
      cellText: (p) => moneyCell(p.incomeMinor, p.currency),
    },
    {
      // «Валюта» after «Приход» — moysklad shows a currency column next to
      // each money column (both render the doc's single currency).
      key: 'currency',
      header: tFields('currency'),
      width: '70px',
      cell: (p) => <span className="text-[var(--ms-text-muted)] text-xs">{p.currency}</span>,
      cellText: (p) => p.currency,
    },
    {
      key: 'expense',
      header: tFields('expense'),
      align: 'right',
      width: '140px',
      sortable: true,
      cell: (p) => (
        <span className="font-medium tabular-nums">{moneyCell(p.expenseMinor, p.currency)}</span>
      ),
      cellText: (p) => moneyCell(p.expenseMinor, p.currency),
    },
    {
      // «Валюта» after «Расход» (moysklad's second currency column).
      key: 'currencyExp',
      header: tFields('currency'),
      width: '70px',
      cell: (p) => <span className="text-[var(--ms-text-muted)] text-xs">{p.currency}</span>,
      cellText: (p) => p.currency,
    },
    {
      // «Дата начисления» — no backing column yet; display-only placeholder so the ⚙
      // list matches moysklad. Renders empty until an accrual_date field is added.
      key: 'accrualDate',
      header: t('flt_accrual_date'),
      width: '130px',
      cell: () => <span title={t('flt_not_wired')} />,
      cellText: () => '',
    },
    {
      key: 'linked',
      header: t('col_linked'),
      align: 'right',
      width: '120px',
      cell: (p) => (
        <span className="text-[var(--ms-text-muted)] text-[12px] tabular-nums">
          {moneyCell(p.linkedMinor, p.currency)}
        </span>
      ),
      cellText: (p) => moneyCell(p.linkedMinor, p.currency),
    },
    {
      key: 'notLinked',
      header: t('col_not_linked'),
      align: 'right',
      width: '120px',
      cell: (p) => (
        <span className="text-[var(--ms-text-muted)] text-[12px] tabular-nums">
          {moneyCell(p.notLinkedMinor, p.currency)}
        </span>
      ),
      cellText: (p) => moneyCell(p.notLinkedMinor, p.currency),
    },
    {
      key: 'paymentPurpose',
      header: tFields('payment_purpose'),
      cell: (p) => (
        <span className="block max-w-[240px] truncate text-[var(--ms-text-muted)] text-[11px]">
          {p.paymentPurpose ?? ''}
        </span>
      ),
      cellText: (p) => p.paymentPurpose ?? '',
    },
    {
      key: 'expenseItem',
      header: tFields('expense_item'),
      width: '150px',
      cell: (p) => (
        <span className="block max-w-[150px] truncate text-[var(--ms-text-muted)] text-[11px]">
          {p.expenseItem ?? ''}
        </span>
      ),
      cellText: (p) => p.expenseItem ?? '',
    },
    {
      key: 'incomingNumber',
      header: t('col_incoming_number'),
      width: '120px',
      cell: (p) => (
        <span className="text-[var(--ms-text-muted)] text-xs">{p.incomingNumber ?? ''}</span>
      ),
      cellText: (p) => p.incomingNumber ?? '',
    },
    {
      key: 'incomingDate',
      header: tFields('incoming_date'),
      width: '120px',
      cell: (p) => (
        <span className="text-[var(--ms-text-muted)] text-xs">
          {p.incomingDate ? formatDate(p.incomingDate) : ''}
        </span>
      ),
      cellText: (p) => (p.incomingDate ? formatDate(p.incomingDate) : ''),
    },
    {
      key: 'project',
      header: tFields('project'),
      width: '140px',
      cell: (p) => (
        <span className="block max-w-[140px] truncate text-sm">{p.projectName ?? ''}</span>
      ),
      cellText: (p) => p.projectName ?? '',
    },
    {
      key: 'contract',
      header: tFields('contract'),
      width: '140px',
      cell: (p) => (
        <span className="block max-w-[140px] truncate text-sm">{p.contractName ?? ''}</span>
      ),
      cellText: (p) => p.contractName ?? '',
    },
    {
      key: 'salesChannel',
      header: tFields('sales_channel'),
      width: '140px',
      cell: (p) => (
        <span className="block max-w-[140px] truncate text-sm">{p.salesChannelName ?? ''}</span>
      ),
      cellText: (p) => p.salesChannelName ?? '',
    },
    {
      key: 'shared',
      header: t('flt_shared'),
      width: '110px',
      cell: (p) => (p.shared ? <span className="text-[#3aa757]">✓</span> : null),
      cellText: (p) => (p.shared ? '✓' : ''),
    },
    {
      key: 'ownerGroup',
      header: t('flt_group'),
      width: '140px',
      cell: (p) => (
        <span className="block max-w-[140px] truncate text-[var(--ms-text-muted)] text-[11px]">
          {p.groupName ?? ''}
        </span>
      ),
      cellText: (p) => p.groupName ?? '',
    },
    {
      key: 'ownerEmployee',
      header: t('flt_owner'),
      width: '160px',
      cell: (p) => (
        <span className="block max-w-[160px] truncate text-sm">{p.ownerName ?? ''}</span>
      ),
      cellText: (p) => p.ownerName ?? '',
    },
    {
      key: 'state',
      header: t('flt_status'),
      width: '120px',
      cell: (p) => <span className="text-[var(--ms-text-muted)] text-xs">{tStates(p.state)}</span>,
      cellText: (p) => tStates(p.state),
    },
    {
      key: 'sent',
      header: tFields('sent'),
      width: '110px',
      cell: () => <span />,
      cellText: () => '',
    },
    {
      key: 'printed',
      header: tFields('printed'),
      width: '110px',
      // moysklad parity: cyan (#00bfe6) filled pill «Напечатан» when printed, EMPTY
      // otherwise (NOT «Да»). Live-grounded rgb(0,191,230); mirror CO/demands.
      cell: (p) =>
        p.printed ? (
          <span
            className="inline-flex items-center whitespace-nowrap rounded-[3px] bg-[#00bfe6] px-2 py-0.5 font-medium text-white text-xs"
            data-test-id="printed-badge"
          >
            {tFields('printed_badge')}
          </span>
        ) : null,
      cellText: (p) => (p.printed ? tFields('printed_badge') : ''),
    },
    {
      key: 'comment',
      header: tFields('comment'),
      width: '180px',
      cell: (p) => (
        <span className="block max-w-[200px] truncate text-[var(--ms-text-muted)] text-[11px]">
          {p.comment ?? ''}
        </span>
      ),
      cellText: (p) => p.comment ?? '',
    },
    {
      key: 'updatedWhen',
      header: t('flt_updated'),
      width: '130px',
      cell: (p) => (
        <span className="text-[var(--ms-text-muted)] text-xs">{formatDate(p.updatedAt)}</span>
      ),
      cellText: (p) => formatDate(p.updatedAt),
    },
    {
      // «Кто изменил» — no updatedById column on the money models yet; display-only
      // placeholder so the ⚙ list matches moysklad (empty until audit-author tracked).
      key: 'modifiedBy',
      header: t('flt_modified_by'),
      width: '160px',
      cell: () => <span title={t('flt_not_wired')} />,
      cellText: () => '',
    },
  ];

  const footerRow: Record<string, React.ReactNode> = footerMoneyCells(data?.totals, {
    income: data?.totals?.incomeMinor ?? '0',
    expense: data?.totals?.expenseMinor ?? '0',
  });

  // Wrap a RefMulti setter so selecting a value also resets to page 1.
  const wireMulti =
    (setter: (v: RefMulti[]) => void) =>
    (next: RefMulti[]): void => {
      setter(next);
      resetPage();
    };

  // Apply a saved filter — restore ids (labels show as ids until re-opened).
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
    refs('projectIds', setProjects);
    refs('organizationAccountIds', setOrgAccounts);
    refs('ownerIds', setOwners);
    refs('groupIds', setGroups);
    refs('salesChannelIds', setSalesChannels);
    refs('expenseItems', setExpenseItems);
    setSingle({
      kind: (sp.get('kind') as Kind) || undefined,
      state: sp.get('state') || undefined,
      applicable: sp.get('applicable') || undefined,
      printed: sp.get('printed') || undefined,
      shared: sp.get('shared') || undefined,
      noClosingDocs: sp.get('noClosingDocs') || undefined,
      momentFrom: sp.get('momentFrom') || undefined,
      momentTo: sp.get('momentTo') || undefined,
      updatedFrom: sp.get('updatedFrom') || undefined,
      updatedTo: sp.get('updatedTo') || undefined,
      sumFrom: sp.get('sumFrom') || undefined,
      sumTo: sp.get('sumTo') || undefined,
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
    <ListView
      testId="payments-page"
      moyskladToolbar
      title={t('title')}
      onRefresh={() => refetch()}
      search={searchInput}
      onSearchChange={(v) => {
        setSearchInput(v);
        resetPage();
      }}
      searchPlaceholder={t('search_placeholder')}
      columns={columns}
      rows={data?.items ?? []}
      keyField="id"
      rowTestId={(p) => `payment-row-${p.id}`}
      selectable
      selectedIds={selectedIds}
      onSelectionChange={setSelectedIds}
      selectionCount={selectedIds.size}
      editMenu={{ label: tBulkActions('trigger'), items: editMenuItems }}
      statusMenu={{ label: t('status_trigger'), items: statusMenuItems }}
      printMenu={{ label: tPrintMenu('trigger'), items: printMenuItems }}
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
      sortKey={sortKey}
      sortDir={sortDir}
      onSortChange={(key, dir) => {
        setSortKey(key);
        setSortDir(dir);
        resetPage();
      }}
      visibleColumnKeys={cols.visibleKeys}
      footerRow={footerRow}
      extraActionsLeft={
        <>
          <DropdownMenu
            trigger={
              <Button variant="primary" data-test-id="payments-create-prihod">
                + {t('prihod')}
                <Icons.down className="h-4 w-4" />
              </Button>
            }
            testId="payments-create-prihod-menu"
          >
            <DropdownMenu.Item
              onSelect={() => router.push('/payments-in/new')}
              testId="payments-create-paymentin"
            >
              {t('type_paymentin')}
            </DropdownMenu.Item>
            <DropdownMenu.Item
              onSelect={() => router.push('/cash-in/new')}
              testId="payments-create-cashin"
            >
              {t('type_cashin')}
            </DropdownMenu.Item>
          </DropdownMenu>
          <DropdownMenu
            trigger={
              <Button variant="primary" data-test-id="payments-create-rashod">
                + {t('rashod')}
                <Icons.down className="h-4 w-4" />
              </Button>
            }
            testId="payments-create-rashod-menu"
          >
            <DropdownMenu.Item
              onSelect={() => router.push('/payments-out/new')}
              testId="payments-create-paymentout"
            >
              {t('type_paymentout')}
            </DropdownMenu.Item>
            <DropdownMenu.Item
              onSelect={() => router.push('/cash-out/new')}
              testId="payments-create-cashout"
            >
              {t('type_cashout')}
            </DropdownMenu.Item>
          </DropdownMenu>
          <Button
            variant="secondary"
            disabled
            title={t('transfer_unbuilt')}
            data-test-id="payments-create-transfer"
          >
            + {t('transfer')}
          </Button>
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
              entity="payment"
              currentQueryString={params.toString()}
              onApply={applySaved}
              adding={savedAdding}
              onAddingChange={setSavedAdding}
            />
          }
          testId="payments-inline-filter"
        >
          {/* Row 1 — Период · Статья расходов · Сумма платежа · Распределён · Точка продаж */}
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
          <MultiRefField
            label={t('flt_expense_item')}
            fieldKey="expenseItem"
            value={expenseItems}
            onChange={wireMulti(setExpenseItems)}
            endpoint="/expense-items"
            testId="filter-expense-item"
            byName
          />
          <InlineFilterPanel.Field label={t('flt_sum')} fieldKey="sum" expandable>
            <div className="flex items-center gap-1">
              <MoneyInput
                allowEmpty
                valueMinor={single.sumFrom ?? ''}
                onChangeMinor={(m) => patchSingle({ sumFrom: m === '' ? undefined : m })}
                placeholder={t('flt_from')}
                data-test-id="filter-sum-from"
              />
              <span className="text-[var(--ms-text-muted)]">—</span>
              <MoneyInput
                allowEmpty
                valueMinor={single.sumTo ?? ''}
                onChangeMinor={(m) => patchSingle({ sumTo: m === '' ? undefined : m })}
                placeholder={t('flt_to')}
                data-test-id="filter-sum-to"
              />
            </div>
          </InlineFilterPanel.Field>
          <InlineFilterPanel.Field
            label={t('flt_distributed')}
            fieldKey="distributed"
            tooltip={t('flt_not_wired')}
            expandable
          >
            <NativeSelect disabled value="" data-test-id="filter-distributed">
              <option value="" />
            </NativeSelect>
          </InlineFilterPanel.Field>
          <InlineFilterPanel.Field
            label={t('flt_point_of_sale')}
            fieldKey="pointOfSale"
            tooltip={t('flt_not_wired')}
            expandable
          >
            <NativeSelect disabled value="" data-test-id="filter-point-of-sale">
              <option value="" />
            </NativeSelect>
          </InlineFilterPanel.Field>

          {/* Row 2 — Проект · Контрагент · Группа контрагента · Договор · Владелец контрагента · Организация */}
          <MultiRefField
            label={t('flt_project')}
            fieldKey="project"
            value={projects}
            onChange={wireMulti(setProjects)}
            endpoint="/projects"
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

          {/* Row 3 — Счет организации · Тип документа · Статус · Проведено · Напечатано · Отправлено */}
          <MultiRefField
            label={t('flt_org_account')}
            fieldKey="orgAccount"
            value={orgAccounts}
            onChange={wireMulti(setOrgAccounts)}
            endpoint="/organization-accounts"
            testId="filter-org-account"
          />
          <InlineFilterPanel.Field label={t('flt_doc_type')} fieldKey="docType" expandable>
            <NativeSelect
              value={single.kind ?? ''}
              onChange={(e) =>
                patchSingle({ kind: (e.target.value || undefined) as Kind | undefined })
              }
              data-test-id="filter-kind"
            >
              <option value="">{t('flt_all')}</option>
              {(['paymentin', 'paymentout', 'cashin', 'cashout'] as const).map((k) => (
                <option key={k} value={k}>
                  {t(`type_${k}`)}
                </option>
              ))}
            </NativeSelect>
          </InlineFilterPanel.Field>
          <InlineFilterPanel.Field label={t('flt_status')} fieldKey="status" expandable>
            <NativeSelect
              value={single.state ?? ''}
              onChange={(e) => patchSingle({ state: e.target.value || undefined })}
              data-test-id="filter-state"
            >
              <option value="" />
              {['draft', 'posted', 'cancelled'].map((s) => (
                <option key={s} value={s}>
                  {tStates(s)}
                </option>
              ))}
            </NativeSelect>
          </InlineFilterPanel.Field>
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
          <InlineFilterPanel.Field
            label={t('flt_sent')}
            fieldKey="sentFlag"
            tooltip={t('flt_not_wired')}
            expandable
          >
            <NativeSelect disabled value="" data-test-id="filter-sent">
              <option value="" />
            </NativeSelect>
          </InlineFilterPanel.Field>

          {/* Row 4 — Канал продаж · Без закрывающих документов · Владелец-сотрудник · Владелец-отдел · Общий доступ · Когда изменен */}
          <MultiRefField
            label={t('flt_sales_channel')}
            fieldKey="salesChannel"
            value={salesChannels}
            onChange={wireMulti(setSalesChannels)}
            endpoint="/sales-channels"
            testId="filter-sales-channel"
          />
          <BoolField
            label={t('flt_no_closing')}
            fieldKey="noClosing"
            value={single.noClosingDocs}
            onChange={(v) => patchSingle({ noClosingDocs: v })}
            testId="filter-no-closing"
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

          {/* Row 5 — Кто изменил · Дата начисления (present for parity; not wired) */}
          <InlineFilterPanel.Field
            label={t('flt_modified_by')}
            fieldKey="modifiedBy"
            tooltip={t('flt_not_wired')}
            expandable
          >
            <NativeSelect disabled value="" data-test-id="filter-modified-by">
              <option value="" />
            </NativeSelect>
          </InlineFilterPanel.Field>
          <InlineFilterPanel.Field
            label={t('flt_accrual_date')}
            fieldKey="accrualDate"
            tooltip={t('flt_not_wired')}
            inlineSuffix={periodShortcuts((from, to) => setAccrual({ from, to }))}
            expandable
          >
            <PeriodInputs
              from={accrual.from}
              to={accrual.to}
              onChange={({ from, to }) => setAccrual({ from, to })}
              testId="filter-accrual-date"
            />
          </InlineFilterPanel.Field>
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
  );
}
