'use client';

/**
 * /money — Unified money-operations feed (moysklad parity).
 *
 * Aggregates all 4 cash-flow document types (CashIn / CashOut /
 * PaymentIn / PaymentOut) from the shared MoneyOperation ledger
 * into a single timeline. The 4 source pages stay as the editors;
 * this page is the read-only consolidated view that surfaces what
 * moysklad's "Деньги" tab shows.
 */

import { FilterToggleButton } from '@/components/filters/filter-toggle-button';
import { api } from '@/lib/api-client';
import { moneyFlowTone } from '@/lib/domain-status-tone';
import {
  Badge,
  Button,
  CatalogPicker,
  CatalogPickerField,
  type DataTableColumn,
  DropdownMenu,
  Icons,
  InlineFilterPanel,
  ListView,
  type ListViewFilter,
  NativeSelect,
  PeriodInputs,
  PeriodShortcuts,
  type PickerItem,
  formatDate,
  formatMoney,
  useDebounce,
} from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * De-facto `MoneyOperation.documentKind` slugs — exactly what the BE writers
 * store. The page previously assumed 'cashin'/'cashout'/'paymentin'/
 * 'paymentout' — none of which ever matched a stored row, so every row link
 * was `undefined/<id>`, the kind cell rendered the raw i18n key path, and the
 * kind filter always returned an empty list (FE↔BE contract drift, found by
 * the 2026-06-11 Conv-3 browser smoke; locked by money-kind-contract.test.ts).
 *
 * Faza 11 (`M-06`/`FE-03`) closed the other half of that drift: bank payments
 * now WRITE the ledger, so 'payment_in'/'payment_out' appear here — until then
 * this page offered «+ Создать → Входящий платёж» and then never showed the
 * result, and the In/Out/Net totals silently excluded every bank movement.
 * 'debtpayment' (`M-05`) is the cash a debtor hands over at the till.
 */
type LedgerKind =
  | 'cash_in'
  | 'cash_out'
  | 'retailsale'
  | 'payment_in'
  | 'payment_out'
  | 'debtpayment';
/** Kinds offered by the «+ Создать» dropdown — navigation targets only. */
type CreateKind = 'cashin' | 'cashout' | 'paymentin' | 'paymentout';

interface MoneyOperationRow {
  id: string;
  at: string;
  documentKind: LedgerKind;
  documentId: string;
  deltaMinor: string;
  currency: string;
  counterpartyId: string | null;
  counterpartyName: string | null;
  organizationAccountId: string | null;
  organizationAccountName: string | null;
  cashDeskId: string | null;
  cashDeskName: string | null;
  description: string | null;
}

interface ListResponse {
  items: MoneyOperationRow[];
  total: number;
  // M-14 (Faza 17): totals are PER CURRENCY — the ledger mixes UZS tiyin and
  // USD cents, so a single number (previously rendered as «so'm») was
  // meaningless in a multi-currency tenant.
  totals: {
    byCurrency: Array<{
      currency: string;
      inMinor: string;
      outMinor: string;
      netMinor: string;
    }>;
    mixedCurrency: boolean;
  };
  nextCursor: string | null;
}

const KIND_ROUTES: Record<LedgerKind, string> = {
  cash_in: '/cash-in',
  cash_out: '/cash-out',
  retailsale: '/retail/sales',
  payment_in: '/payments-in',
  payment_out: '/payments-out',
  // A POS debt payment has no editor page — its `documentId` is the PKO batch,
  // and the receipt print view is the only per-batch document there is.
  debtpayment: '/print/debt-payment',
};

/** Single source for the kind filter's options — see the select below. */
const LEDGER_KINDS = Object.keys(KIND_ROUTES) as LedgerKind[];

const NEW_ROUTES: Record<CreateKind, string> = {
  cashin: '/cash-in/new',
  cashout: '/cash-out/new',
  paymentin: '/payments-in/new',
  paymentout: '/payments-out/new',
};

const LIMIT = 25;

export default function MoneyPage() {
  const t = useTranslations('pages.money');
  const tKind = useTranslations('pages.money.kinds');
  const tFlow = useTranslations('pages.money.flow');
  const tFilters = useTranslations('filters');
  const router = useRouter();

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [flow, setFlow] = useState<'all' | 'in' | 'out'>('all');
  const [cursor, setCursor] = useState<string | undefined>();
  const [filterOpen, setFilterOpen] = useState(true);
  const [docKind, setDocKind] = useState<LedgerKind | ''>('');
  const [fromDate, setFromDate] = useState<string | undefined>(undefined);
  const [toDate, setToDate] = useState<string | undefined>(undefined);
  const [counterparty, setCounterparty] = useState<{ id: string; label: string } | null>(null);
  const [account, setAccount] = useState<{ id: string; label: string } | null>(null);
  const [pickerOpen, setPickerOpen] = useState<null | 'counterparty' | 'account'>(null);

  const onResetCursor = () => setCursor(undefined);

  const params = new URLSearchParams();
  params.set('limit', String(LIMIT));
  if (search) params.set('search', search);
  if (flow !== 'all') params.set('flow', flow);
  if (cursor) params.set('cursor', cursor);
  if (docKind) params.set('documentKind', docKind);
  if (counterparty) params.set('counterpartyId', counterparty.id);
  if (account) params.set('organizationAccountId', account.id);
  if (fromDate) params.set('fromDate', fromDate);
  if (toDate) params.set('toDate', toDate);

  const listQueryKey = [
    'money-operations',
    search,
    flow,
    docKind,
    counterparty?.id,
    account?.id,
    fromDate,
    toDate,
    cursor,
    params.toString(),
  ] as const;

  const { data, isLoading, error, refetch } = useQuery<ListResponse>({
    queryKey: listQueryKey,
    queryFn: () => api.get<ListResponse>(`/money-operations?${params.toString()}`),
  });

  const hasFilter =
    !!search ||
    flow !== 'all' ||
    !!docKind ||
    !!counterparty ||
    !!account ||
    !!fromDate ||
    !!toDate;

  const filters: ListViewFilter[] = [
    { key: 'all', label: tFlow('all'), active: flow === 'all', onClick: () => setFlow('all') },
    { key: 'in', label: tFlow('in'), active: flow === 'in', onClick: () => setFlow('in') },
    { key: 'out', label: tFlow('out'), active: flow === 'out', onClick: () => setFlow('out') },
  ];

  const columns: DataTableColumn<MoneyOperationRow>[] = [
    {
      key: 'at',
      header: t('column_when'),
      cell: (r: MoneyOperationRow) => formatDate(r.at),
      width: '140px',
    },
    {
      key: 'kind',
      header: t('column_kind'),
      cell: (r: MoneyOperationRow) => (
        // Tone follows the SIGN, not the slug: an unposted cash_in writes a
        // negative 'cash_in' row, and 'debtpayment' is an inflow whose slug
        // ends in neither. Reading the delta is the only always-true rule.
        <Badge tone={moneyFlowTone(r.deltaMinor.startsWith('-') ? 'out' : 'in')}>
          {tKind(r.documentKind)}
        </Badge>
      ),
      width: '140px',
    },
    {
      key: 'source',
      header: t('column_source'),
      cell: (r: MoneyOperationRow) => r.organizationAccountName ?? r.cashDeskName ?? '—',
    },
    {
      key: 'counterparty',
      header: t('column_counterparty'),
      cell: (r: MoneyOperationRow) => r.counterpartyName ?? '—',
    },
    {
      key: 'delta',
      header: t('column_delta'),
      cell: (r: MoneyOperationRow) => {
        const v = formatMoney(r.deltaMinor, r.currency);
        return (
          <span className={r.deltaMinor.startsWith('-') ? 'text-red-600' : 'text-emerald-600'}>
            {v}
          </span>
        );
      },
      align: 'right',
      width: '160px',
    },
    {
      key: 'description',
      header: t('column_description'),
      cell: (r: MoneyOperationRow) => r.description ?? '',
    },
    {
      key: 'doc',
      header: t('column_doc'),
      cell: (r: MoneyOperationRow) => (
        <Link
          href={`${KIND_ROUTES[r.documentKind]}/${r.documentId}`}
          className="text-[var(--ms-text-link)] hover:underline"
        >
          {t('open_doc')}
        </Link>
      ),
      width: '110px',
    },
  ];

  // One totals line per currency — each amount formatted in ITS OWN currency
  // (M-14). A single-currency tenant renders exactly one line, as before.
  const totalsRow = data?.totals?.byCurrency?.length ? (
    <div
      className="flex flex-col gap-1 border-[var(--ms-border-default)] border-b bg-[var(--ms-bg-muted)] px-4 py-2 text-sm"
      data-test-id="money-totals"
    >
      {data.totals.byCurrency.map((cur) => (
        <div key={cur.currency} className="flex flex-wrap items-center gap-6">
          {data.totals.mixedCurrency ? (
            <span className="font-medium text-[var(--ms-text-muted)]">{cur.currency}</span>
          ) : null}
          <div>
            <span className="text-[var(--ms-text-muted)]">{t('totals_in')}: </span>
            <span className="font-medium text-emerald-700 tabular-nums">
              {formatMoney(cur.inMinor, cur.currency)}
            </span>
          </div>
          <div>
            <span className="text-[var(--ms-text-muted)]">{t('totals_out')}: </span>
            <span className="font-medium text-red-700 tabular-nums">
              {formatMoney(cur.outMinor, cur.currency)}
            </span>
          </div>
          <div>
            <span className="text-[var(--ms-text-muted)]">{t('totals_net')}: </span>
            <span
              className={`font-medium tabular-nums ${
                cur.netMinor.startsWith('-') ? 'text-red-700' : 'text-emerald-700'
              }`}
            >
              {formatMoney(cur.netMinor, cur.currency)}
            </span>
          </div>
        </div>
      ))}
    </div>
  ) : null;

  const filterPanel = (
    <InlineFilterPanel
      hidden={!filterOpen}
      applyLabel={tFilters('find')}
      clearLabel={tFilters('clear')}
      onClear={() => {
        setDocKind('');
        setFromDate(undefined);
        setToDate(undefined);
        setCounterparty(null);
        setAccount(null);
        onResetCursor();
      }}
    >
      <InlineFilterPanel.Field
        label={`${tFilters('period')}:`}
        inlineSuffix={
          <PeriodShortcuts
            onChange={({ from, to }) => {
              setFromDate(from);
              setToDate(to);
              onResetCursor();
            }}
            labels={{
              yesterday: tFilters('period_yesterday'),
              today: tFilters('period_today'),
              week: tFilters('period_week'),
              month: tFilters('period_month'),
            }}
          />
        }
      >
        <PeriodInputs
          from={fromDate}
          to={toDate}
          onChange={({ from, to }) => {
            setFromDate(from);
            setToDate(to);
            onResetCursor();
          }}
        />
      </InlineFilterPanel.Field>

      <InlineFilterPanel.Field label={t('filter_kind')} expandable>
        <NativeSelect
          value={docKind}
          onChange={(e) => {
            setDocKind((e.target.value as LedgerKind) || '');
            onResetCursor();
          }}
          data-test-id="money-filter-kind"
        >
          <option value="">{tFilters('all')}</option>
          {/* Derived from KIND_ROUTES, never hand-listed: the three kinds
              added in Faza 11 would otherwise have been filterable by the BE
              and invisible in this dropdown — the same drift the kind slugs
              themselves suffered. Locked by money-kind-contract.test.ts. */}
          {LEDGER_KINDS.map((k) => (
            <option key={k} value={k}>
              {tKind(k)}
            </option>
          ))}
        </NativeSelect>
      </InlineFilterPanel.Field>

      <InlineFilterPanel.Field label={tFilters('agent')} expandable>
        <CatalogPickerField
          value={counterparty}
          placeholder={tFilters('agent')}
          onPick={() => setPickerOpen('counterparty')}
          onClear={() => {
            setCounterparty(null);
            onResetCursor();
          }}
        />
      </InlineFilterPanel.Field>

      <InlineFilterPanel.Field label={t('filter_account')} expandable>
        <CatalogPickerField
          value={account}
          placeholder={t('filter_account')}
          onPick={() => setPickerOpen('account')}
          onClear={() => {
            setAccount(null);
            onResetCursor();
          }}
        />
      </InlineFilterPanel.Field>
    </InlineFilterPanel>
  );

  return (
    <>
      <ListView
        testId="money-page"
        moyskladToolbar
        title={t('title')}
        onRefresh={() => refetch()}
        search={searchInput}
        onSearchChange={(v) => {
          setSearchInput(v);
          onResetCursor();
        }}
        searchPlaceholder={t('search_placeholder')}
        filters={filters}
        columns={columns}
        rows={data?.items ?? []}
        keyField="id"
        total={data?.total ?? 0}
        limit={LIMIT}
        hasNext={!!data?.nextCursor}
        hasPrevious={!!cursor}
        onNext={() => setCursor(data?.nextCursor ?? undefined)}
        onPrevious={() => setCursor(undefined)}
        loading={isLoading}
        error={error as Error | null}
        onRetry={() => refetch()}
        emptyTitle={t('empty_title')}
        hasActiveFilter={hasFilter}
        headerSlot={
          <>
            {totalsRow}
            {filterPanel}
          </>
        }
        extraActionsLeft={
          <>
            <DropdownMenu
              trigger={
                <Button variant="primary" data-test-id="money-create-trigger">
                  + {t('create_button')}
                  <Icons.down className="h-4 w-4" />
                </Button>
              }
              testId="money-create-dropdown"
            >
              <DropdownMenu.Item
                onSelect={() => router.push(NEW_ROUTES.paymentin)}
                testId="money-create-paymentin"
              >
                {tKind('paymentin')}
              </DropdownMenu.Item>
              <DropdownMenu.Item
                onSelect={() => router.push(NEW_ROUTES.paymentout)}
                testId="money-create-paymentout"
              >
                {tKind('paymentout')}
              </DropdownMenu.Item>
              <DropdownMenu.Item
                onSelect={() => router.push(NEW_ROUTES.cashin)}
                testId="money-create-cashin"
              >
                {tKind('cashin')}
              </DropdownMenu.Item>
              <DropdownMenu.Item
                onSelect={() => router.push(NEW_ROUTES.cashout)}
                testId="money-create-cashout"
              >
                {tKind('cashout')}
              </DropdownMenu.Item>
            </DropdownMenu>
            <FilterToggleButton
              open={filterOpen}
              onToggle={() => setFilterOpen((v) => !v)}
              label={tFilters('trigger')}
            />
          </>
        }
      />

      <CatalogPicker
        open={pickerOpen === 'counterparty'}
        onClose={() => setPickerOpen(null)}
        title={tFilters('agent')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/counterparties?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setCounterparty({ id: item.id, label: String(item.primary) });
          setPickerOpen(null);
          onResetCursor();
        }}
      />
      <CatalogPicker
        open={pickerOpen === 'account'}
        onClose={() => setPickerOpen(null)}
        title={t('filter_account')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/admin/organization-accounts?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setAccount({ id: item.id, label: String(item.primary) });
          setPickerOpen(null);
          onResetCursor();
        }}
      />
    </>
  );
}
