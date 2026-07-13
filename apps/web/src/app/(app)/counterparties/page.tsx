'use client';

import { ColumnSettings } from '@/components/column-settings';
import { CounterpartyBulkActionsDropdown } from '@/components/counterparties/bulk-actions-dropdown';
import { CounterpartyCreateTasksModal } from '@/components/counterparties/create-tasks-modal';
import { CounterpartyGroupManagerModal } from '@/components/counterparties/group-manager-modal';
import { CounterpartyMassEditModal } from '@/components/counterparties/mass-edit-modal';
import { CounterpartyPrintDropdown } from '@/components/counterparties/print-dropdown';
import { CounterpartyStatusDropdown } from '@/components/counterparties/status-dropdown';
import { FilterToggleButton } from '@/components/filters/filter-toggle-button';
import { useBulkDocumentActions } from '@/hooks/use-bulk-actions';
import { useColumnVisibility } from '@/hooks/use-column-visibility';
import { useColumnWidths } from '@/hooks/use-column-widths';
import { useEnterOnHover } from '@/hooks/use-keyboard-nav';
import { api } from '@/lib/api-client';
import { attrReferenceEndpoint } from '@/lib/custom-attr';
import {
  Badge,
  Button,
  CatalogPicker,
  CatalogPickerField,
  type CsvColumn,
  type DataTableColumn,
  InlineFilterPanel,
  Input,
  ListView,
  NativeSelect,
  PeriodInputs,
  PeriodShortcuts,
  type PickerItem,
  buildCsv,
  csvTimestamp,
  downloadCsv,
  formatDate,
  formatMoney,
  useDebounce,
} from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';

interface Counterparty {
  id: string;
  name: string;
  legalTitle: string | null;
  companyType: string;
  email: string | null;
  phone: string | null;
  fax: string | null;
  code: string | null;
  archived: boolean;
  salesAmount: string;
  // UZ requisites + person fields live in the uzRequisites JSON blob (no
  // migration): inn · pinfl (ПИНФЛ) · kpp (КПП) · birthDate · gender.
  uzRequisites: {
    inn?: string;
    pinfl?: string;
    kpp?: string;
    birthDate?: string;
    gender?: string;
  } | null;
  // «Комментарий» column maps to Counterparty.description (moysklad parity).
  description: string | null;
  actualAddress: string | null;
  // Extra gear-available columns climart offers (data already in the payload).
  legalAddress: string | null; // «Юридический адрес»
  discountCardNumber: string | null; // «Дисконтная карта»
  shared: boolean; // «Общий доступ»
  bonusPoints: number; // «Баллы»
  priceType: { id: string; name: string } | null; // «Цены»
  createdAt: string;
  // «Когда изменен» — climart default column.
  updatedAt: string;
  owner: { id: string; name: string } | null;
  modifiedBy: { id: string; name: string } | null; // «Кто изменил»
  group: { id: string; name: string } | null; // «Отдел» (access dept) — NOT the list column
  // «Группы» — moysklad's many-to-many counterparty grouping (the list column).
  groups: { id: string; name: string }[];
  // CRM «Статус» — tenant State row (colored pill).
  state: { id: string; name: string; color: string | null } | null;
  // Server-computed CRM aggregates (counterparty.service list()):
  //   balanceMinor   → «Баланс» (base-currency net, tiyin string)
  //   salesCount     → «Количество продаж» (posted demands)
  //   lastSaleDate   → «Последняя продажа» (max posted-demand moment)
  //   averageCheckMinor → «Средний чек» (Σsum / count, tiyin string)
  balanceMinor: string;
  salesCount: number;
  firstSaleDate: string | null; // «Первая продажа»
  lastSaleDate: string | null;
  averageCheckMinor: string;
  profitMinor: string; // «Прибыль» (revenue − self-cost, can be negative)
  returnsCount: number; // «Количество возвратов»
  returnsSumMinor: string; // «Сумма возвратов»
  discountSumMinor: string; // «Сумма скидок»
  bankName: string | null; // «Банк» (main account)
  bankAccountNumber: string | null; // «Расчетный счет» (main account)
  eventDate: string | null; // «Дата события» (last Call)
  eventText: string | null; // «Текст события» (last Call summary)
  // Custom «Дополнительные поля» — keyed by attribute-metadata `code` (e.g. the
  // account's «Усто» / «tgid»). Surfaced as dynamic gear columns.
  attributes: Record<string, unknown> | null;
}

// One account-defined custom counterparty attribute (moysklad «Доп. поле»).
interface AttrMeta {
  id: string;
  code: string;
  name: string;
  type: string;
  archived: boolean;
  position: number;
  enumOptions?: Array<{ value: string; label: string }> | null;
  // For the native `reference` type — the target entity (e.g. 'Counterparty').
  referenceEntity?: string | null;
}

interface ListResponse {
  items: Counterparty[];
  nextCursor?: string;
  total: number;
  // «Итого Баланс» — ALL-pages grand total (every filtered counterparty, not just the
  // current 100/50), base-currency tiyin. Rendered in the pinned footer strip.
  balanceTotalMinor?: string;
}

// Moysklad parity — 100 rows per page (matches every other list).
const LIMIT = 100;

// ─── «Tranzaksiyalar» tab — merged sale/supply/payment feed ──────────────────

interface TxnRow {
  id: string;
  type: 'sale' | 'supply' | 'payment_in' | 'payment_out';
  number: string;
  counterpartyName: string | null;
  moment: string;
  sumMinor: string;
  sign: 1 | -1;
}
const TXN_LABEL: Record<TxnRow['type'], string> = {
  sale: 'Savdo',
  supply: 'Kirim',
  payment_in: "Kiruvchi to'lov",
  payment_out: "Chiquvchi to'lov",
};

function CounterpartyTransactionsView() {
  const [page, setPage] = useState(1);
  const limit = 50;
  const { data, isLoading } = useQuery<{ items: TxnRow[]; total: number }>({
    queryKey: ['counterparty-transactions', page],
    queryFn: () => api.get(`/counterparty-transactions?limit=${limit}&page=${page}`),
    refetchInterval: 30_000,
  });
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="p-4" data-test-id="cp-transactions">
      <div className="overflow-hidden rounded-xl border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)]">
        <table className="w-full text-sm">
          <thead className="border-[var(--ms-border-default)] border-b bg-[var(--ms-bg-muted)] text-[10px] text-[var(--ms-text-muted)] uppercase tracking-widest">
            <tr>
              <th className="px-4 py-2 text-left">Sana</th>
              <th className="px-4 py-2 text-left">Tur</th>
              <th className="px-4 py-2 text-left">Hujjat</th>
              <th className="px-4 py-2 text-left">Kontragent</th>
              <th className="px-4 py-2 text-right">Summa</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--ms-border-default)]">
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-[var(--ms-text-muted)]">
                  Yuklanmoqda...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-[var(--ms-text-muted)]">
                  Hozircha tranzaksiya yo'q (savdo/kirim/to'lov qilinganda shu yerda chiqadi)
                </td>
              </tr>
            ) : (
              items.map((t) => (
                <tr key={`${t.type}-${t.id}`} className="hover:bg-[var(--ms-bg-hover)]">
                  <td className="px-4 py-2.5 text-[var(--ms-text-muted)] text-xs">
                    {formatDate(t.moment)}
                  </td>
                  <td className="px-4 py-2.5">{TXN_LABEL[t.type]}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{t.number}</td>
                  <td className="px-4 py-2.5">{t.counterpartyName ?? '—'}</td>
                  <td
                    className={`px-4 py-2.5 text-right font-medium tabular-nums ${
                      t.sign > 0 ? 'text-emerald-600' : 'text-amber-600'
                    }`}
                  >
                    {t.sign > 0 ? '+' : '−'}
                    {formatMoney(t.sumMinor, 'UZS', { displayAs: 'none' })}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {total > limit && (
        <div className="mt-3 flex items-center justify-end gap-3 text-sm">
          <span className="text-[var(--ms-text-muted)]">
            {page} / {lastPage} ({total} ta)
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            ←
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={page >= lastPage}
            onClick={() => setPage((p) => p + 1)}
          >
            →
          </Button>
        </div>
      )}
    </div>
  );
}

export default function CounterpartiesPage() {
  const t = useTranslations('pages.counterparties');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tFilters = useTranslations('filters');

  // Company-type label map — localized (ru+uz). Was a module-level
  // hardcoded Latin-Uzbek const, which leaked Uzbek into the RU «Тип
  // контрагента» filter dropdown + badge (gate-blind: the no-hardcoded
  // gate scans only document forms, not this list page). RU values are
  // grounded on the counterparty form (company_type_*) + standard legal
  // forms; the UZ-vs-RU legal-form distinction (legalUZ vs legal) is
  // preserved via the «(UZ)»/«(RU)» suffixes.
  const typeLabel: Record<string, string> = {
    legalUZ: t('type_legalUZ'),
    entrepreneurUZ: t('type_entrepreneurUZ'),
    individualUZ: t('type_individualUZ'),
    legal: t('type_legal'),
    entrepreneur: t('type_entrepreneur'),
    individual: t('type_individual'),
  };

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  // «Показывать» tri-state (moysklad-parity, captured value «Только обычные»):
  // active = «Только обычные» (default), archived = «Только архивные», all =
  // «Все» (sends archived=all → no archive predicate). Mirrors products.
  const [archived, setArchived] = useState<'active' | 'archived' | 'all'>('active');
  // CRM state (Статус) — tenant-defined State rows for entityType
  // 'counterparty'; backed by Counterparty.stateId.
  const [stateId, setStateId] = useState<string>('');
  // Owner (Владелец-сотрудник) — Counterparty.ownerId → Employee, picked via
  // the /employees reference endpoint.
  const [ownerId, setOwnerId] = useState<string>('');
  const [ownerLabel, setOwnerLabel] = useState<string>('');
  // 2026-06-18 — FILTER reconciled to the USER'S OWN account (climart) live set:
  //   Создан · Наименование · Телефон · Адрес · Показывать · Статус ·
  //   Владелец-сотрудник (+ dynamic custom «Усто»/«tgid» below). The earlier 11k
  //   fields (Тип/Группа/Код/ИНН/Цены/Дисконтная карта/Общий доступ/Метки/Когда
  //   изменен) were from a DIFFERENT account's capture — climart's filter has
  //   none of them, so they're removed. DEFERRED (climart has, backend lacks):
  //   «Баланс» от/до (computed) · «Дата/Текст события» (no CRM event log).
  const [nameInput, setNameInput] = useState<string>('');
  const name = useDebounce(nameInput, 300);
  const [phoneInput, setPhoneInput] = useState<string>('');
  const phone = useDebounce(phoneInput, 300);
  const [addressInput, setAddressInput] = useState<string>('');
  const address = useDebounce(addressInput, 300);
  const [createdFrom, setCreatedFrom] = useState<string>('');
  const [createdTo, setCreatedTo] = useState<string>('');
  // «Дата события» (period over the counterparty's Calls) + «Текст события».
  const [eventFrom, setEventFrom] = useState<string>('');
  const [eventTo, setEventTo] = useState<string>('');
  const [eventTextInput, setEventTextInput] = useState<string>('');
  const eventText = useDebounce(eventTextInput, 300);
  // «Баланс» от/до (major UZS units; debounced into the query).
  const [balanceFromInput, setBalanceFromInput] = useState<string>('');
  const [balanceToInput, setBalanceToInput] = useState<string>('');
  const balanceFrom = useDebounce(balanceFromInput, 300);
  const balanceTo = useDebounce(balanceToInput, 300);
  // Custom «Дополнительные поля» filter values, keyed by attribute code (Усто/tgid).
  const [attrFilters, setAttrFilters] = useState<Record<string, string>>({});
  // For reference-type custom attrs (Усто = counterparty), attrFilters stores the
  // picked entity ID; attrRefLabels keeps its display name for the picker field.
  const [attrRefLabels, setAttrRefLabels] = useState<Record<string, string>>({});
  const [pickerOpen, setPickerOpen] = useState<null | 'owner' | { code: string; type: string }>(
    null,
  );
  // The open reference-attr picker (when pickerOpen targets a custom attr, not owner).
  const attrPicker = pickerOpen && typeof pickerOpen === 'object' ? pickerOpen : null;
  // Offset paging (moysklad jump-to-any-page) — `page` 1-based, `pageSize` from the
  // gear «Количество строк» selector. Any filter/sort change resets to page 1.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(LIMIT);
  const [sortKey, setSortKey] = useState<string>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [filterOpen, setFilterOpen] = useState(true);
  // «Создать задачи» bulk drawer (opens for the current selection).
  const [tasksOpen, setTasksOpen] = useState(false);
  // «Массовое редактирование» wizard (un-greys the «Изменить ▾» menu item).
  const [massEditOpen, setMassEditOpen] = useState(false);
  // «Группы» self-service manager — create / rename / delete counterparty groups
  // (Ta'minotchilar, Mijozlar, …). The backend CRUD always existed; this exposes it.
  const [groupMgrOpen, setGroupMgrOpen] = useState(false);
  // 2026-07-13: sichqoncha qator ustida turganda ENTER → mijoz sahifasi.
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  useEnterOnHover(
    useCallback(() => (hoveredId ? `/counterparties/${hoveredId}` : null), [hoveredId]),
  );

  // Kontragent tablari. Mijozlar/Ta'minotchilar AUTO-detected by usage (backend
  // role filter): customer = has a sale, supplier = has a supply. «transactions»
  // swaps the list for the merged sale/supply/payment feed.
  const [tab, setTab] = useState<'all' | 'customers' | 'suppliers' | 'transactions'>('all');
  const role = tab === 'customers' ? 'customer' : tab === 'suppliers' ? 'supplier' : undefined;

  // CRM states (Статус) for the dropdown — tenant rows keyed by
  // entityType. Same pattern the StatusChangeDropdown uses for
  // customerorder; here we scope to 'counterparty'. Failure (e.g. a
  // user without settings/view) degrades to an empty dropdown rather
  // than blocking the list.
  const { data: crmStates } = useQuery<{
    items: { id: string; name: string; color: string | null }[];
  }>({
    queryKey: ['states', 'counterparty'],
    queryFn: () =>
      api.get<{ items: { id: string; name: string; color: string | null }[] }>(
        '/states?entityType=counterparty&archived=false',
      ),
    staleTime: 5 * 60 * 1000,
  });

  // Account-defined custom fields («Дополнительные поля») → one dynamic gear
  // column each, moysklad-parity (this is how the account's «Усто»/«tgid» appear).
  const { data: attrMeta } = useQuery<{ items: AttrMeta[] }>({
    queryKey: ['attribute-metadata', 'Counterparty'],
    queryFn: () => api.get<{ items: AttrMeta[] }>('/attribute-metadata/entity/Counterparty'),
    staleTime: 5 * 60 * 1000,
  });

  // Active custom-attribute filter params (attr_<code>=<value>, only non-empty).
  const attrFilterParams = Object.fromEntries(
    Object.entries(attrFilters)
      .filter(([, v]) => v.trim() !== '')
      .map(([k, v]) => [`attr_${k}`, v.trim()]),
  );
  const attrFilterKey = JSON.stringify(attrFilterParams);

  const params = new URLSearchParams({
    ...(search ? { search } : {}),
    // Tri-state «Показывать»: 'all' → archived=all (schema maps to no predicate).
    archived: archived === 'all' ? 'all' : archived === 'archived' ? 'true' : 'false',
    ...(stateId ? { stateId } : {}),
    ...(ownerId ? { ownerId } : {}),
    ...(role ? { role } : {}),
    ...(name.trim() ? { name: name.trim() } : {}),
    ...(phone.trim() ? { phone: phone.trim() } : {}),
    ...(address.trim() ? { address: address.trim() } : {}),
    ...(balanceFrom.trim() ? { balanceFrom: balanceFrom.trim() } : {}),
    ...(balanceTo.trim() ? { balanceTo: balanceTo.trim() } : {}),
    ...(createdFrom ? { createdFrom } : {}),
    ...(createdTo ? { createdTo } : {}),
    ...(eventFrom ? { eventFrom } : {}),
    ...(eventTo ? { eventTo } : {}),
    ...(eventText.trim() ? { eventText: eventText.trim() } : {}),
    ...attrFilterParams,
    limit: String(pageSize),
    sortBy: sortKey,
    sortDir,
    page: String(page),
  });

  const listQueryKey = [
    'counterparties',
    search,
    archived,
    stateId,
    ownerId,
    role ?? '',
    name,
    phone,
    address,
    balanceFrom,
    balanceTo,
    createdFrom,
    createdTo,
    eventFrom,
    eventTo,
    eventText,
    attrFilterKey,
    page,
    pageSize,
    sortKey,
    sortDir,
  ] as const;
  const { data, isLoading, error, refetch } = useQuery<ListResponse>({
    queryKey: listQueryKey,
    queryFn: () => api.get<ListResponse>(`/counterparties?${params.toString()}`),
  });
  // Last page from the total (offset paging) → enables real first/last + «N-M из T».
  const lastPage = Math.max(1, Math.ceil((data?.total ?? 0) / pageSize));

  const bulk = useBulkDocumentActions('counterparties', listQueryKey, {
    hasFSM: false,
    hasArchive: true,
  });

  // Programmatic CSV export — reused by CounterpartyPrintDropdown.
  const handleListExport = () => {
    const items = data?.items ?? [];
    const active = columns
      .filter((c) => cols.visibleKeys.has(c.key))
      .filter((c) => typeof c.cellText === 'function');
    if (active.length === 0 || items.length === 0) return;
    const csvCols: CsvColumn<Counterparty>[] = active.map((c) => ({
      header: c.headerText ?? (typeof c.header === 'string' ? c.header : c.key),
      // biome-ignore lint/style/noNonNullAssertion: filtered above
      cellText: c.cellText!,
    }));
    const csv = buildCsv(csvCols, items);
    downloadCsv(`counterparties_${csvTimestamp()}.csv`, csv);
  };

  // moysklad parity — live-grounded 2026-06-18 on the USER'S OWN account
  // (farrux@climart_santex_group, the only account; ⚙ gear default-visible set).
  // climart shows these 10 by default; every other column (code/createdAt/fax/
  // email/averageCheck/eventDate/eventText/legalTitle/companyType/inn/salesAmount/
  // owner) stays gear-available — matching moysklad's per-user customizer.
  // See docs/audits/counterparties-list-climart-live-audit.md.
  const cols = useColumnVisibility('counterparties', [
    'name',
    'phone',
    'state',
    'actualAddress',
    'description',
    'group',
    'lastSale',
    'salesCount',
    'balance',
    'updatedAt',
  ]);
  const colWidths = useColumnWidths('counterparties');

  // moysklad shows custom-attribute («Усто»/«tgid») columns by DEFAULT (the live climart list
  // shows `tgid` as a default column). The static default set above can't list them (they're
  // account-dynamic), so merge the account's custom-attr column keys into the visible set once
  // attrMeta loads — unless the user already saved a column preference, which must win.
  const attrColsMerged = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: one-shot merge, guarded by the ref
  useEffect(() => {
    if (attrColsMerged.current) return;
    const items = attrMeta?.items;
    if (!items) return;
    attrColsMerged.current = true;
    let hasSavedPref = false;
    try {
      hasSavedPref = !!localStorage.getItem('ms:column-visibility:counterparties');
    } catch {}
    if (hasSavedPref) return;
    // moysklad parity: only SCALAR custom attrs are default-visible columns (e.g. «tgid»).
    // Reference-type attrs (e.g. «Усто» = counterparty link) are filter-only on the live list —
    // they stay gear-available but NOT default-visible (live climart shows tgid, not Усто, as a column).
    const attrKeys = items
      .filter((a) => !a.archived && !attrReferenceEndpoint(a))
      .map((a) => `attr_${a.code}`);
    if (attrKeys.length) cols.setVisibleKeys(new Set([...cols.visibleKeys, ...attrKeys]));
  }, [attrMeta]);

  // moysklad's counterparty list uses moyskladToolbar + Фильтр panel
  // (no pill sub-tabs). Тип (companyType) + Holat (archived) filtering
  // is the inline panel below, backed by CounterpartyFilterSchema. No
  // SavedFiltersPills — not FilterDrawerValues-shaped (no-op otherwise).

  // moysklad parity (live-grounded 2026-06-18 on the user's own account
  // online.moysklad.uz/admin@ozodbekmirgasimov1, capture
  // counterparties/states/01-default.png). The CRM «Контрагенты» list shows
  // 16 default columns in this exact order:
  //   Наименование · Код · Создан · Телефон · Факс · E-mail · Статус ·
  //   Фактический адрес · Комментарий · Группы · Последняя продажа ·
  //   Количество продаж · Средний чек · Баланс · Дата события · Текст события
  // The array order IS the render order (DataTable filters by visibleKeys but
  // preserves array order). Legacy/extra fields (Юр. название · Тип · ИНН ·
  // Сумма продаж · Контакт · Владелец) stay gear-available below the defaults.
  const baseColumns: DataTableColumn<Counterparty>[] = [
    {
      key: 'name',
      // moysklad uses «Наименование» (not «Название») for the list name column.
      header: t('col_name'),
      // Explicit width is REQUIRED: the DataTable is table-layout:fixed, so a
      // width-less column collapses to 0 once the other (fixed-width) columns
      // already fill the table — which clipped the «Наименование» header to
      // invisible. Same width-0 trap the purchase-orders list hit (2134fdac).
      // 200px ≈ climart's «Наименование» drag-width (measured ~187px live).
      width: '200px',
      sortable: true,
      // moysklad list names are plain dark text (#222, 11px, weight 400, NO
      // underline) — clickable but NOT a blue link (measured live on climart).
      cell: (cp) => (
        <a
          href={`/counterparties/${cp.id}`}
          // Qator-klik ham shu manzilga boradi — ikki marta otilmasin.
          onClick={(e) => e.stopPropagation()}
          className="text-[var(--ms-text-primary)]"
        >
          {cp.name}
        </a>
      ),
      cellText: (r: Counterparty) => r.name,
    },
    {
      key: 'code',
      header: tFields('code'),
      width: '110px',
      sortable: true,
      cell: (cp) => <span className="font-mono text-xs">{cp.code ?? ''}</span>,
      cellText: (r: Counterparty) => r.code ?? '',
    },
    {
      key: 'createdAt',
      header: tCommon('created'),
      width: '140px',
      sortable: true,
      cell: (cp) => (
        <span className="text-[var(--ms-text-muted)] text-xs">{formatDate(cp.createdAt)}</span>
      ),
      cellText: (r: Counterparty) => formatDate(r.createdAt),
    },
    {
      key: 'phone',
      header: tFields('phone'),
      width: '120px',
      cell: (cp) => <span className="text-[var(--ms-text-muted)] text-xs">{cp.phone ?? ''}</span>,
      cellText: (r: Counterparty) => r.phone ?? '',
    },
    {
      key: 'fax',
      header: t('col_fax'),
      width: '130px',
      cell: (cp) => <span className="text-[var(--ms-text-muted)] text-xs">{cp.fax ?? ''}</span>,
      cellText: (r: Counterparty) => r.fax ?? '',
    },
    {
      key: 'email',
      header: tFields('email'),
      width: '180px',
      cell: (cp) => <span className="text-[var(--ms-text-muted)] text-xs">{cp.email ?? ''}</span>,
      cellText: (r: Counterparty) => r.email ?? '',
    },
    {
      key: 'state',
      header: t('col_state'),
      width: '120px',
      // moysklad renders the CRM «Статус» as a solid colored pill (white text);
      // State.color comes from the tenant's counterparty State settings.
      cell: (cp) =>
        cp.state ? (
          <span
            className="inline-flex items-center rounded-[var(--ms-radius-default)] px-2 py-0.5 font-medium text-xs"
            style={{
              backgroundColor: cp.state.color ?? 'var(--ms-bg-muted)',
              color: cp.state.color ? '#fff' : 'var(--ms-text-primary)',
            }}
          >
            {cp.state.name}
          </span>
        ) : null,
      cellText: (r: Counterparty) => r.state?.name ?? '',
    },
    {
      key: 'actualAddress',
      header: t('col_actual_address'),
      width: '140px',
      cell: (cp) => (
        <span className="text-[var(--ms-text-muted)] text-xs">{cp.actualAddress ?? ''}</span>
      ),
      cellText: (r: Counterparty) => r.actualAddress ?? '',
    },
    {
      key: 'description',
      header: t('col_comment'),
      width: '140px',
      cell: (cp) => (
        <span className="text-[var(--ms-text-muted)] text-xs">{cp.description ?? ''}</span>
      ),
      cellText: (r: Counterparty) => r.description ?? '',
    },
    {
      key: 'group',
      header: t('col_groups'),
      width: '130px',
      // moysklad «Группы» = many-to-many membership pills (light-blue #e4f1fa /
      // #186999, 10px radius, 11px — measured live on climart). A counterparty can
      // be in several groups, so render one pill each. NOT the «Отдел» (cp.group/dept).
      cell: (cp) =>
        cp.groups.length ? (
          <span className="inline-flex flex-wrap gap-1">
            {cp.groups.map((g) => (
              <span
                key={g.id}
                className="inline-flex items-center rounded-[10px] bg-[var(--ms-brand-100)] px-1.5 py-0.5 text-[11px] text-[var(--ms-brand-500)]"
              >
                {g.name}
              </span>
            ))}
          </span>
        ) : null,
      cellText: (r: Counterparty) => r.groups.map((g) => g.name).join(', '),
    },
    {
      key: 'firstSale',
      header: t('col_first_sale'),
      width: '150px',
      cell: (cp) => (
        <span className="text-[var(--ms-text-muted)] text-xs">
          {cp.firstSaleDate ? formatDate(cp.firstSaleDate) : ''}
        </span>
      ),
      cellText: (r: Counterparty) => (r.firstSaleDate ? formatDate(r.firstSaleDate) : ''),
    },
    {
      key: 'lastSale',
      header: t('col_last_sale'),
      width: '130px',
      cell: (cp) => (
        <span className="text-[var(--ms-text-muted)] text-xs">
          {cp.lastSaleDate ? formatDate(cp.lastSaleDate) : ''}
        </span>
      ),
      cellText: (r: Counterparty) => (r.lastSaleDate ? formatDate(r.lastSaleDate) : ''),
    },
    {
      key: 'salesCount',
      header: t('col_sales_count'),
      width: '120px',
      align: 'right',
      cell: (cp) => <span className="tabular-nums">{cp.salesCount}</span>,
      cellText: (r: Counterparty) => String(r.salesCount),
    },
    {
      key: 'averageCheck',
      header: t('col_average_check'),
      width: '140px',
      align: 'right',
      cell: (cp) => (
        <span className="tabular-nums">
          {formatMoney(cp.averageCheckMinor, 'UZS', { displayAs: 'none' })}
        </span>
      ),
      // CSV mirrors the on-screen value (grouped number, no « сум» suffix).
      cellText: (r: Counterparty) => formatMoney(r.averageCheckMinor, 'UZS', { displayAs: 'none' }),
    },
    {
      key: 'returnsCount',
      header: t('col_returns_count'),
      width: '150px',
      align: 'right',
      cell: (cp) => <span className="tabular-nums">{cp.returnsCount}</span>,
      cellText: (r: Counterparty) => String(r.returnsCount),
    },
    {
      key: 'returnsSum',
      header: t('col_returns_sum'),
      width: '150px',
      align: 'right',
      cell: (cp) => (
        <span className="tabular-nums">
          {formatMoney(cp.returnsSumMinor, 'UZS', { displayAs: 'none' })}
        </span>
      ),
      cellText: (r: Counterparty) => formatMoney(r.returnsSumMinor, 'UZS', { displayAs: 'none' }),
    },
    {
      key: 'discountSum',
      header: t('col_discount_sum'),
      width: '140px',
      align: 'right',
      cell: (cp) => (
        <span className="tabular-nums">
          {formatMoney(cp.discountSumMinor, 'UZS', { displayAs: 'none' })}
        </span>
      ),
      cellText: (r: Counterparty) => formatMoney(r.discountSumMinor, 'UZS', { displayAs: 'none' }),
    },
    {
      key: 'balance',
      header: t('col_balance'),
      width: '110px',
      align: 'right',
      cell: (cp) => (
        <span className="font-medium tabular-nums">
          {formatMoney(cp.balanceMinor, 'UZS', { displayAs: 'none' })}
        </span>
      ),
      cellText: (r: Counterparty) => formatMoney(r.balanceMinor, 'UZS', { displayAs: 'none' }),
    },
    {
      key: 'profit',
      header: t('col_profit'),
      width: '140px',
      align: 'right',
      cell: (cp) => (
        <span className="tabular-nums">
          {formatMoney(cp.profitMinor, 'UZS', { displayAs: 'none' })}
        </span>
      ),
      cellText: (r: Counterparty) => formatMoney(r.profitMinor, 'UZS', { displayAs: 'none' }),
    },
    {
      key: 'updatedAt',
      header: t('col_updated'),
      width: '130px',
      sortable: true,
      cell: (cp) => (
        <span className="text-[var(--ms-text-muted)] text-xs">{formatDate(cp.updatedAt)}</span>
      ),
      cellText: (r: Counterparty) => formatDate(r.updatedAt),
    },
    // «Дата события» / «Текст события» — moysklad's CRM last-event columns, wired
    // to the counterparty's last Call (the app's CRM event model; startedAt +
    // summary). Empty when the counterparty has no logged calls.
    {
      key: 'eventDate',
      header: t('col_event_date'),
      width: '150px',
      cell: (cp) => (
        <span className="text-[var(--ms-text-muted)] text-xs">
          {cp.eventDate ? formatDate(cp.eventDate) : ''}
        </span>
      ),
      cellText: (r: Counterparty) => (r.eventDate ? formatDate(r.eventDate) : ''),
    },
    {
      key: 'eventText',
      header: t('col_event_text'),
      width: '180px',
      cell: (cp) => (
        <span className="text-[var(--ms-text-muted)] text-xs">{cp.eventText ?? ''}</span>
      ),
      cellText: (r: Counterparty) => r.eventText ?? '',
    },
    // ── gear-available extras (not in moysklad's default set) ──
    {
      key: 'legalTitle',
      header: t('col_legal_title'),
      cell: (cp) => (
        <span className="text-[var(--ms-text-muted)] text-sm">{cp.legalTitle ?? ''}</span>
      ),
    },
    {
      key: 'companyType',
      header: t('col_company_type'),
      width: '140px',
      cell: (cp) => (
        <Badge tone={cp.companyType.endsWith('UZ') ? 'brand' : 'neutral'}>
          {typeLabel[cp.companyType] ?? cp.companyType}
        </Badge>
      ),
    },
    {
      key: 'inn',
      header: t('col_inn'),
      width: '130px',
      cell: (cp) => <span className="font-mono text-xs">{cp.uzRequisites?.inn ?? ''}</span>,
    },
    {
      key: 'salesAmount',
      header: tFields('sales_amount'),
      width: '150px',
      align: 'right',
      // Computed from the live posted-demand aggregate (BE emits salesAmount), so —
      // like Баланс/Средний чек/Прибыль — NOT a DB-sortable column.
      cell: (cp) => (
        <span className="font-medium tabular-nums">
          {formatMoney(cp.salesAmount, 'UZS', { displayAs: 'none' })}
        </span>
      ),
      cellText: (r: Counterparty) => formatMoney(r.salesAmount, 'UZS', { displayAs: 'none' }),
    },
    {
      key: 'owner',
      header: tFields('owner'),
      width: '160px',
      cell: (cp) => (
        <span className="text-[var(--ms-text-muted)] text-xs">{cp.owner?.name ?? ''}</span>
      ),
      cellText: (r: Counterparty) => r.owner?.name ?? '',
    },
    // ── more gear-available columns climart offers (data already in payload) ──
    {
      key: 'legalAddress',
      header: t('col_legal_address'),
      width: '180px',
      cell: (cp) => (
        <span className="text-[var(--ms-text-muted)] text-xs">{cp.legalAddress ?? ''}</span>
      ),
      cellText: (r: Counterparty) => r.legalAddress ?? '',
    },
    {
      key: 'priceType',
      header: tFilters('prices'),
      width: '140px',
      cell: (cp) => (
        <span className="text-[var(--ms-text-muted)] text-xs">{cp.priceType?.name ?? ''}</span>
      ),
      cellText: (r: Counterparty) => r.priceType?.name ?? '',
    },
    {
      key: 'discountCard',
      header: tFilters('discount_card'),
      width: '150px',
      cell: (cp) => <span className="font-mono text-xs">{cp.discountCardNumber ?? ''}</span>,
      cellText: (r: Counterparty) => r.discountCardNumber ?? '',
    },
    {
      key: 'shared',
      header: tFilters('shared'),
      width: '120px',
      cell: (cp) => (
        <span className="text-[var(--ms-text-muted)] text-xs">
          {cp.shared ? tCommon('yes') : tCommon('no')}
        </span>
      ),
      cellText: (r: Counterparty) => (r.shared ? tCommon('yes') : tCommon('no')),
    },
    {
      key: 'bonusPoints',
      header: t('col_bonus_points'),
      width: '110px',
      align: 'right',
      cell: (cp) => <span className="tabular-nums">{cp.bonusPoints}</span>,
      cellText: (r: Counterparty) => String(r.bonusPoints),
    },
    {
      key: 'modifiedBy',
      header: t('col_modified_by'),
      width: '160px',
      cell: (cp) => (
        <span className="text-[var(--ms-text-muted)] text-xs">{cp.modifiedBy?.name ?? ''}</span>
      ),
      cellText: (r: Counterparty) => r.modifiedBy?.name ?? '',
    },
    {
      key: 'bankName',
      header: t('col_bank'),
      width: '160px',
      cell: (cp) => (
        <span className="text-[var(--ms-text-muted)] text-xs">{cp.bankName ?? ''}</span>
      ),
      cellText: (r: Counterparty) => r.bankName ?? '',
    },
    {
      key: 'bankAccount',
      header: t('col_bank_account'),
      width: '170px',
      cell: (cp) => <span className="font-mono text-xs">{cp.bankAccountNumber ?? ''}</span>,
      cellText: (r: Counterparty) => r.bankAccountNumber ?? '',
    },
    {
      key: 'innUz',
      header: t('col_inn_uz'),
      width: '130px',
      cell: (cp) => <span className="font-mono text-xs">{cp.uzRequisites?.inn ?? ''}</span>,
      cellText: (r: Counterparty) => r.uzRequisites?.inn ?? '',
    },
    {
      key: 'ownerDept',
      header: t('col_owner_dept'),
      width: '150px',
      cell: (cp) => (
        <span className="text-[var(--ms-text-muted)] text-xs">{cp.group?.name ?? ''}</span>
      ),
      cellText: (r: Counterparty) => r.group?.name ?? '',
    },
    {
      key: 'pinfl',
      header: t('col_pinfl'),
      width: '150px',
      cell: (cp) => <span className="font-mono text-xs">{cp.uzRequisites?.pinfl ?? ''}</span>,
      cellText: (r: Counterparty) => r.uzRequisites?.pinfl ?? '',
    },
    {
      key: 'kpp',
      header: t('col_kpp'),
      width: '120px',
      cell: (cp) => <span className="font-mono text-xs">{cp.uzRequisites?.kpp ?? ''}</span>,
      cellText: (r: Counterparty) => r.uzRequisites?.kpp ?? '',
    },
    {
      key: 'birthDate',
      header: t('col_birth_date'),
      width: '140px',
      cell: (cp) => (
        <span className="text-[var(--ms-text-muted)] text-xs">
          {cp.uzRequisites?.birthDate ? formatDate(cp.uzRequisites.birthDate) : ''}
        </span>
      ),
      cellText: (r: Counterparty) =>
        r.uzRequisites?.birthDate ? formatDate(r.uzRequisites.birthDate) : '',
    },
    {
      key: 'gender',
      header: t('col_gender'),
      width: '110px',
      cell: (cp) => (
        <span className="text-[var(--ms-text-muted)] text-xs">
          {cp.uzRequisites?.gender ? t(`gender_${cp.uzRequisites.gender}` as 'gender_male') : ''}
        </span>
      ),
      cellText: (r: Counterparty) =>
        r.uzRequisites?.gender ? t(`gender_${r.uzRequisites.gender}` as 'gender_male') : '',
    },
  ];

  // Render one custom-attribute value (scalar / enum-label / reference object).
  const renderAttr = (val: unknown, attr: AttrMeta): string => {
    if (val == null || val === '') return '';
    if (attr.type === 'enum' && attr.enumOptions) {
      return attr.enumOptions.find((o) => o.value === val)?.label ?? String(val);
    }
    if (typeof val === 'object') {
      const o = val as { name?: string; label?: string };
      return o.name ?? o.label ?? JSON.stringify(val);
    }
    return String(val);
  };

  // Dynamic «Дополнительные поля» columns — one per account-defined custom
  // counterparty attribute (gear-available, moysklad parity). Empty here unless
  // the account has defined custom fields (e.g. «Усто»/«tgid» on climart).
  const customColumns: DataTableColumn<Counterparty>[] = (attrMeta?.items ?? [])
    .filter((a) => !a.archived)
    .sort((a, b) => a.position - b.position)
    .map((attr) => ({
      key: `attr_${attr.code}`,
      header: attr.name,
      width: '160px',
      cell: (cp: Counterparty) => (
        <span className="text-[var(--ms-text-muted)] text-xs">
          {renderAttr(cp.attributes?.[attr.code], attr)}
        </span>
      ),
      cellText: (r: Counterparty) => renderAttr(r.attributes?.[attr.code], attr),
    }));

  const columns: DataTableColumn<Counterparty>[] = [...baseColumns, ...customColumns];

  const hasFilter =
    !!search ||
    archived !== 'active' ||
    !!stateId ||
    !!ownerId ||
    !!name.trim() ||
    !!phone.trim() ||
    !!address.trim() ||
    !!balanceFrom.trim() ||
    !!balanceTo.trim() ||
    !!createdFrom ||
    !!createdTo ||
    !!eventFrom ||
    !!eventTo ||
    !!eventText.trim() ||
    Object.keys(attrFilterParams).length > 0;

  // moysklad «Итого» grand-total — rendered as the bottommost GRID ROW (DataTable
  // <tfoot>, aligned under the «Баланс» column), NOT a separate strip below the
  // list. The figure is the ALL-pages «Баланс» total (every filtered counterparty,
  // not just this page's 100/50; BE `balanceTotalMinor`), so it never changes as
  // you page through. The backend aggregates over the BASE currency only (UZS) —
  // CounterpartyBalance is summed `where currency = BASE_CURRENCY` — so this total
  // is single-currency by construction and needs no mixed-currency «—» guard (the
  // «Баланс» column likewise always formats UZS). Until the list loads, «0».
  const footerRow: Record<string, React.ReactNode> = {
    balance: formatMoney(data?.balanceTotalMinor ?? '0', 'UZS', { displayAs: 'none' }),
  };

  return (
    <>
      {/* Kontragent tablari — bitta sahifada Hammasi / Mijozlar / Ta'minotchilar.
          Mijozlar/Ta'minotchilar mos m2m guruh (cpGroupId) bo'yicha filtrlanadi. */}
      <div className="border-[var(--ms-border-default)] border-b bg-[var(--ms-bg-surface)] px-4 pt-2">
        <div className="inline-flex gap-1">
          {(
            [
              { k: 'all', label: 'Hammasi' },
              { k: 'customers', label: 'Mijozlar' },
              { k: 'suppliers', label: "Ta'minotchilar" },
              { k: 'transactions', label: 'Tranzaksiyalar' },
            ] as const
          ).map((tb) => (
            <button
              key={tb.k}
              type="button"
              onClick={() => {
                setTab(tb.k);
                setPage(1);
              }}
              className={`-mb-px rounded-t-md border-b-2 px-4 py-2 font-medium text-sm transition-colors ${
                tab === tb.k
                  ? 'border-[var(--ms-text-brand)] text-[var(--ms-text-brand)]'
                  : 'border-transparent text-[var(--ms-text-muted)] hover:text-[var(--ms-text-primary)]'
              }`}
              data-test-id={`cp-tab-${tb.k}`}
            >
              {tb.label}
            </button>
          ))}
        </div>
      </div>
      {tab === 'transactions' ? (
        <CounterpartyTransactionsView />
      ) : (
        <ListView
          testId="counterparties-page"
          title={t('title')}
          moyskladToolbar
          onRefresh={() => refetch()}
          onHelp={() => window.open('/help/counterparties', '_blank')}
          selectionCount={bulk.selectedIds.size}
          createHref="/counterparties/new"
          createLabel={t('create_button')}
          createPosition="start"
          // 2026-07-12: qatorning ISTALGAN joyi bosilganda mijoz sahifasi
          // ochiladi (avval faqat ism havolasi ishlar edi). Belgilash
          // checkboxlari DataTable ichida stopPropagation qilingan — bulk
          // tanlashga xalaqit bermaydi.
          onRowClick={(cp) => {
            window.location.href = `/counterparties/${cp.id}`;
          }}
          onRowMouseEnter={(cp) => setHoveredId(cp.id)}
          onRowMouseLeave={() => setHoveredId(null)}
          search={searchInput}
          onSearchChange={(v) => {
            setSearchInput(v);
            setPage(1);
          }}
          sortKey={sortKey}
          sortDir={sortDir}
          onSortChange={(key, dir) => {
            setSortKey(key);
            setSortDir(dir);
            setPage(1);
          }}
          searchPlaceholder={t('search_placeholder')}
          columns={columns}
          rows={data?.items ?? []}
          keyField="id"
          rowTestId={(cp) => `counterparty-row-${cp.id}`}
          rowActions={(cp) => bulk.rowDelete(cp.id)}
          total={data?.total ?? 0}
          limit={pageSize}
          paginationOffset={(page - 1) * pageSize}
          hasNext={page < lastPage}
          hasPrevious={page > 1}
          onFirst={() => setPage(1)}
          onPrevious={() => setPage((p) => Math.max(1, p - 1))}
          onNext={() => setPage((p) => p + 1)}
          onLast={() => setPage(lastPage)}
          loading={isLoading}
          error={error as Error | null}
          onRetry={() => refetch()}
          emptyTitle={hasFilter ? tCommon('no_results') : t('empty_title')}
          hasActiveFilter={hasFilter}
          richEmpty={{
            heading: t('empty_rich_heading'),
            cta: { label: t('create_button'), href: '/counterparties/new' },
            helper: { label: t('empty_rich_helper'), href: '/contact-persons/new' },
          }}
          {...bulk.listViewProps}
          visibleColumnKeys={cols.visibleKeys}
          footerRow={footerRow}
          headerSlot={
            /* Inline filter panel — reconciled 2026-06-18 to the USER'S OWN account
             (farrux@climart_santex_group) live filter: Создан · Наименование ·
             Телефон · Адрес · Показывать · Статус · Владелец-сотрудник + dynamic
             custom «Дополнительные поля» (Усто/tgid). The earlier 11k fields
             (Тип/Группа/Код/ИНН/Цены/Дисконтная карта/Общий доступ/Метки/Когда
             изменен) were from a DIFFERENT account — climart's filter has none, so
             removed. DEFERRED (climart has, backend lacks): «Баланс» от/до
             (computed) · «Дата/Текст события» (no CRM event log). */
            <InlineFilterPanel
              hidden={!filterOpen}
              applyLabel={tFilters('find')}
              clearLabel={tFilters('clear')}
              onClear={() => {
                setArchived('active');
                setStateId('');
                setOwnerId('');
                setOwnerLabel('');
                setNameInput('');
                setPhoneInput('');
                setAddressInput('');
                setBalanceFromInput('');
                setBalanceToInput('');
                setCreatedFrom('');
                setCreatedTo('');
                setEventFrom('');
                setEventTo('');
                setEventTextInput('');
                setAttrFilters({});
                setAttrRefLabels({});
                setPage(1);
              }}
              testId="counterparties-inline-filter"
            >
              {/* Создан — half-open day range over createdAt. Compact moysklad layout:
                «вч·сег·нед·мес» shortcuts INLINE with the label + date boxes below (the
                split PeriodShortcuts/PeriodInputs the other lists use), so «Создан» and
                «Дата события» sit side-by-side on ONE row (climart parity), not stacked. */}
              <InlineFilterPanel.Field
                label={tFilters('created_period')}
                expandable
                inlineSuffix={
                  <PeriodShortcuts
                    onChange={({ from, to }) => {
                      setCreatedFrom(from ?? '');
                      setCreatedTo(to ?? '');
                      setPage(1);
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
                  from={createdFrom}
                  to={createdTo}
                  onChange={({ from, to }) => {
                    setCreatedFrom(from ?? '');
                    setCreatedTo(to ?? '');
                    setPage(1);
                  }}
                  testId="filter-created-period"
                />
              </InlineFilterPanel.Field>
              {/* Дата события (последнее) — period over the counterparty's Calls. Same
                compact split as «Создан» so the two period filters share one row. */}
              <InlineFilterPanel.Field
                label={t('col_event_date')}
                expandable
                inlineSuffix={
                  <PeriodShortcuts
                    onChange={({ from, to }) => {
                      setEventFrom(from ?? '');
                      setEventTo(to ?? '');
                      setPage(1);
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
                  from={eventFrom}
                  to={eventTo}
                  onChange={({ from, to }) => {
                    setEventFrom(from ?? '');
                    setEventTo(to ?? '');
                    setPage(1);
                  }}
                  testId="filter-event-period"
                />
              </InlineFilterPanel.Field>
              {/* Текст события (последнее) — Call summary contains. */}
              <InlineFilterPanel.Field label={t('col_event_text')} expandable>
                <Input
                  value={eventTextInput}
                  onChange={(e) => {
                    setEventTextInput(e.target.value);
                    setPage(1);
                  }}
                  data-test-id="filter-event-text"
                />
              </InlineFilterPanel.Field>
              {/* Наименование — name (contains, insensitive). */}
              <InlineFilterPanel.Field label={t('col_name')} expandable>
                <Input
                  value={nameInput}
                  onChange={(e) => {
                    setNameInput(e.target.value);
                    setPage(1);
                  }}
                  data-test-id="filter-name"
                />
              </InlineFilterPanel.Field>
              {/* Телефон — phone (contains, insensitive). */}
              <InlineFilterPanel.Field label={tFields('phone')} expandable>
                <Input
                  value={phoneInput}
                  onChange={(e) => {
                    setPhoneInput(e.target.value);
                    setPage(1);
                  }}
                  data-test-id="filter-phone"
                />
              </InlineFilterPanel.Field>
              {/* Адрес — actualAddress (contains, insensitive). */}
              <InlineFilterPanel.Field label={tFilters('address')} expandable>
                <Input
                  value={addressInput}
                  onChange={(e) => {
                    setAddressInput(e.target.value);
                    setPage(1);
                  }}
                  data-test-id="filter-address"
                />
              </InlineFilterPanel.Field>
              {/* Показывать — tri-state visibility. */}
              <InlineFilterPanel.Field label={tFilters('show')} expandable>
                <NativeSelect
                  value={archived}
                  onChange={(e) => {
                    setArchived(e.target.value as 'active' | 'archived' | 'all');
                    setPage(1);
                  }}
                  data-test-id="filter-archived"
                >
                  <option value="active">{tFilters('show_regular')}</option>
                  <option value="archived">{tFilters('show_archived')}</option>
                  <option value="all">{tCommon('all')}</option>
                </NativeSelect>
              </InlineFilterPanel.Field>
              {/* Баланс — base-currency (UZS) от/до range over CounterpartyBalance. */}
              <InlineFilterPanel.Field label={t('col_balance')} expandable>
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    value={balanceFromInput}
                    onChange={(e) => {
                      setBalanceFromInput(e.target.value);
                      setPage(1);
                    }}
                    placeholder={tFilters('period_from')}
                    data-test-id="filter-balance-from"
                  />
                  <span className="text-[var(--ms-text-muted)]">—</span>
                  <Input
                    type="number"
                    value={balanceToInput}
                    onChange={(e) => {
                      setBalanceToInput(e.target.value);
                      setPage(1);
                    }}
                    placeholder={tFilters('period_to')}
                    data-test-id="filter-balance-to"
                  />
                </div>
              </InlineFilterPanel.Field>
              {/* Статус — tenant CRM states. */}
              <InlineFilterPanel.Field label={tFields('state')} expandable>
                <NativeSelect
                  value={stateId}
                  onChange={(e) => {
                    setStateId(e.target.value);
                    setPage(1);
                  }}
                  data-test-id="filter-state"
                >
                  <option value="" />
                  {(crmStates?.items ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </NativeSelect>
              </InlineFilterPanel.Field>
              {/* Владелец-сотрудник — Employee picker via /employees. */}
              <InlineFilterPanel.Field label={tFilters('owner_employee')} expandable>
                <CatalogPickerField
                  value={ownerId ? { id: ownerId, label: ownerLabel || ownerId } : null}
                  placeholder=""
                  onPick={() => setPickerOpen('owner')}
                  onClear={() => {
                    setOwnerId('');
                    setOwnerLabel('');
                    setPage(1);
                  }}
                  inlineFetcher={async (q) => {
                    const r = await api.get<{ items: { id: string; name: string }[] }>(
                      `/employees?search=${encodeURIComponent(q)}&limit=20`,
                    );
                    return r.items.map((x) => ({ id: x.id, primary: x.name }));
                  }}
                  onInlineSelect={(item) => {
                    setOwnerId(item.id);
                    setOwnerLabel(String(item.primary));
                    setPage(1);
                  }}
                  testId="filter-owner"
                />
              </InlineFilterPanel.Field>
              {/* Dynamic «Дополнительные поля» (e.g. Усто/tgid). Reference-type attrs
                (Усто = counterparty) render an entity PICKER → the filter sends the
                picked id (BE matches the .id path); scalar attrs are a contains text. */}
              {(attrMeta?.items ?? [])
                .filter((a) => !a.archived)
                .sort((a, b) => a.position - b.position)
                .map((attr) => {
                  if (attrReferenceEndpoint(attr)) {
                    const refVal = attrFilters[attr.code];
                    return (
                      <InlineFilterPanel.Field key={attr.code} label={attr.name} expandable>
                        <CatalogPickerField
                          value={
                            refVal
                              ? { id: refVal, label: attrRefLabels[attr.code] || refVal }
                              : null
                          }
                          placeholder=""
                          onPick={() => setPickerOpen({ code: attr.code, type: attr.type })}
                          onClear={() => {
                            setAttrFilters((prev) => {
                              const next = { ...prev };
                              delete next[attr.code];
                              return next;
                            });
                            setAttrRefLabels((prev) => {
                              const next = { ...prev };
                              delete next[attr.code];
                              return next;
                            });
                            setPage(1);
                          }}
                          inlineFetcher={async (q) => {
                            const ep = attrReferenceEndpoint(attr);
                            if (!ep) return [];
                            const r = await api.get<{ items: { id: string; name: string }[] }>(
                              `${ep}?search=${encodeURIComponent(q)}&limit=20`,
                            );
                            return r.items.map((x) => ({ id: x.id, primary: x.name }));
                          }}
                          onInlineSelect={(item) => {
                            setAttrFilters((prev) => ({ ...prev, [attr.code]: item.id }));
                            setAttrRefLabels((prev) => ({
                              ...prev,
                              [attr.code]: String(item.primary),
                            }));
                            setPage(1);
                          }}
                          testId={`filter-attr-${attr.code}`}
                        />
                      </InlineFilterPanel.Field>
                    );
                  }
                  return (
                    <InlineFilterPanel.Field key={attr.code} label={attr.name} expandable>
                      <Input
                        value={attrFilters[attr.code] ?? ''}
                        onChange={(e) => {
                          setAttrFilters((prev) => ({ ...prev, [attr.code]: e.target.value }));
                          setPage(1);
                        }}
                        data-test-id={`filter-attr-${attr.code}`}
                      />
                    </InlineFilterPanel.Field>
                  );
                })}
            </InlineFilterPanel>
          }
          extraActionsLeft={
            <FilterToggleButton
              open={filterOpen}
              onToggle={() => setFilterOpen((v) => !v)}
              label={tFilters('trigger')}
            />
          }
          extraActions={
            <>
              {/* moysklad parity: «Изменить · Статус · Печать» render as ONE connected
                segmented group (shared borders, no inner gaps); «Создать задачи» stays a
                separate button. Each dropdown renders its trigger <button> directly, so the
                arbitrary-variant rules below round only the group's outer corners and overlap
                the inner borders by 1px. */}
              <div className="[&>button:not(:first-child)]:-ml-px flex items-center [&>button:first-child]:rounded-l-[var(--ms-radius-default)] [&>button:focus-within]:z-[1] [&>button:hover]:z-[1] [&>button:last-child]:rounded-r-[var(--ms-radius-default)] [&>button]:rounded-none">
                <CounterpartyBulkActionsDropdown
                  selectedIds={bulk.selectedIds}
                  listQueryKey={listQueryKey}
                  onClearSelection={bulk.clearSelection}
                  onMassEdit={() => setMassEditOpen(true)}
                />
                {/* «Статус ▾» — bulk CRM-status quick-set. */}
                <CounterpartyStatusDropdown
                  selectedIds={bulk.selectedIds}
                  states={crmStates?.items ?? []}
                  listQueryKey={listQueryKey}
                  onClearSelection={bulk.clearSelection}
                />
                <CounterpartyPrintDropdown onExportList={handleListExport} />
              </div>
              {/* «Создать задачи» — bulk task-create drawer (separate button, after the group).
                Disabled w/o a selection (one task is created per selected counterparty). */}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setTasksOpen(true)}
                disabled={bulk.selectedIds.size === 0}
                data-test-id="counterparties-create-tasks"
              >
                {t('create_tasks_button')}
              </Button>
              {/* «Группы» — self-service counterparty-group manager (create/rename/delete).
                Always enabled (not selection-dependent); groups drive the «Группы» column/filter. */}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setGroupMgrOpen(true)}
                data-test-id="counterparties-manage-groups"
              >
                Группы
              </Button>
              {/* climart's toolbar is exactly Контрагент · Фильтр · Изменить ·
                Статус · Печать · Создать задачи — no Импорт/Экспорт (those were
                the stale ozodbek account). The /counterparties/import route still
                exists; it just has no toolbar button, matching climart 1:1. */}
            </>
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
      )}

      {/* Владелец picker — opened from the inline filter's owner field.
          Sources employees from the /employees reference endpoint (same
          shape the customer-orders owner picker uses). */}
      <CatalogPicker
        open={pickerOpen === 'owner'}
        onClose={() => setPickerOpen(null)}
        title={tFilters('owner_employee')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/employees?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setOwnerId(item.id);
          setOwnerLabel(String(item.primary));
          setPage(1);
        }}
      />

      {/* Reference custom-attribute picker (e.g. «Усто» → counterparty). Opened from
          the inline filter; sources entities from the attr type's /reference endpoint. */}
      <CatalogPicker
        open={!!attrPicker}
        onClose={() => setPickerOpen(null)}
        title={attrMeta?.items.find((a) => a.code === attrPicker?.code)?.name ?? ''}
        fetcher={async (q): Promise<PickerItem[]> => {
          const attr = attrMeta?.items.find((a) => a.code === attrPicker?.code);
          const ep = attr ? attrReferenceEndpoint(attr) : null;
          if (!ep) return [];
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `${ep}?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          if (!attrPicker) return;
          const code = attrPicker.code;
          setAttrFilters((prev) => ({ ...prev, [code]: item.id }));
          setAttrRefLabels((prev) => ({ ...prev, [code]: String(item.primary) }));
          setPage(1);
        }}
      />

      {/* «Создать задачи» bulk drawer — one task per selected counterparty. */}
      <CounterpartyCreateTasksModal
        open={tasksOpen}
        onOpenChange={setTasksOpen}
        ids={Array.from(bulk.selectedIds)}
        invalidateKey={listQueryKey}
        onCreated={bulk.clearSelection}
      />
      <CounterpartyMassEditModal
        open={massEditOpen}
        onClose={() => setMassEditOpen(false)}
        selectedIds={bulk.selectedIds}
        crmStates={crmStates?.items ?? []}
        attrMeta={attrMeta?.items ?? []}
        onDone={() => {
          refetch();
          bulk.clearSelection();
        }}
      />
      <CounterpartyGroupManagerModal open={groupMgrOpen} onClose={() => setGroupMgrOpen(false)} />
    </>
  );
}
