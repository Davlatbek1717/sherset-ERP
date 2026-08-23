'use client';

/**
 * /supplies/new — moysklad-parity «Приёмка» editor.
 *
 * Built on the document-editor framework (DocumentEditor + Toolbar + Header +
 * MetaPanel + PositionTable + TotalsPanel + DisclosurePanel + Tabs). Mirrors the
 * shell proven on /purchase-orders/new and /supplies/[id]: the metadata grid is a
 * standalone `metaPanel` SIBLING above the «Главная»/«Связанные документы» tabs
 * (NOT nested in a tab), every reference field is an inline-typeahead picker
 * (type-in-place `inlineFetcher` + `onInlineSelect`, the modal stays the "expand"
 * affordance), Контрагент shows the live «Баланс», and the toolbar's right slot is
 * the «Владелец» (owner/access) popover. After save the user is redirected to
 * /supplies/[id], which mounts the same shell with all toolbar entries populated.
 */

import { CounterpartyBalanceInline } from '@/components/counterparty-balance-inline';
import { CurrencyRateModal } from '@/components/document-detail/currency-rate-modal';
import { CellPickerField } from '@/components/documents/cell-picker-field';
import { NewDocRelatedTab } from '@/components/documents/new-doc-related-tab';
import {
  OwnerAccessPopover,
  type OwnerAccessValue,
} from '@/components/documents/owner-access-popover';
import { PositionAgreementButton } from '@/components/documents/position-agreement-modal';
import { PositionColumnCustomizer } from '@/components/documents/position-column-customizer';
import { PositionDiscountMenu } from '@/components/documents/position-discount-menu';
import { PositionPriceMenu } from '@/components/documents/position-price-menu';
import { useNewDocStaging } from '@/components/documents/use-new-doc-staging';
import { ReceiptPrintPortal } from '@/components/pick-list/receipt-print-portal';
import { usePrintTemplatesManager } from '@/components/print/print-templates-provider';
import { ProductCreateModal } from '@/components/products/product-create-modal';
import { ProductEditModal } from '@/components/products/product-edit-modal';
import { type KitPrintForm, KitPrintModal } from '@/components/purchase-orders/kit-print-modal';
import { useDocumentEditorLabels } from '@/hooks/use-document-editor-labels';
import { usePickSheet } from '@/hooks/use-pick-sheet';
import { useTotalsLabels } from '@/hooks/use-totals-labels';
import { useUnsavedGuard } from '@/hooks/use-unsaved-guard';
import { defaultDocStore, useUserDefaults } from '@/hooks/use-user-defaults';
import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';
import { computeLineTotalSafe } from '@/lib/doc-totals';
import { parsePositionImport } from '@/lib/parse-position-import';
import { distributeAgreementDelta } from '@/lib/position-agreement';
import { type PickedProduct, replaceRowProductPatch } from '@/lib/product-row-fields';
import { purchaseLinePriceMinor } from '@/lib/purchase-line-price';
import { resolveSalePriceByType, useCurrencyRates } from '@/lib/sale-price';
import {
  Button,
  CatalogPicker,
  CatalogPickerField,
  DatePicker,
  type DocPositionRow,
  DocumentEditor,
  DocumentMetaField,
  DocumentMetaRow,
  DocumentTabs,
  DocumentTotalsPanel,
  Icons,
  Input,
  Modal,
  NativeSelect,
  type PickerItem,
  type PositionColumnKey,
  PositionInlineAdd,
  PositionNameCell,
  PositionTable,
  type PositionTableColumnConfig,
  Textarea,
  useToast,
} from '@moysklad/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
interface RefItem {
  id: string;
  name: string;
  legalTitle?: string | null;
  code?: string | null;
}
interface ProductItem {
  id: string;
  name: string;
  code: string | null;
  uom: string | null;
  // Buy price in minor units — the field /products actually returns is `buyPrice`
  // (NOT `buyPriceMinor`; the API has no such key), so reading the wrong name made
  // every picked line pre-fill its price as 0. Mirrors supplies/[id]'s ProductItem.
  buyPrice: string | null;
  vat: number | null;
  // «Остаток» column + rich add-row «Доступно» badge (mirror supplies/[id]).
  stock?: { onHand?: string | number | null; available?: string | number | null } | null;
  // «Цена ▾ → Расценить» price-type source (mirror supplies/[id]).
  salePrices?: Array<{ priceTypeId: string; value: string }> | null;
}

interface NewPositionRow extends DocPositionRow {
  assortmentId: string | null;
  salePrices?: Array<{ priceTypeId: string; value: string }> | null;
}

function uid(): string {
  return Math.random().toString(36).slice(2);
}

// ⚙ gear-optional columns — mirror the live-certed supplies/[id] set. Defaults
// per the moysklad supply-grid ground (2026-07-03 audit: hidden-class list =
// weight·volume·vatAmount + import block toggled off): image·unit·stock ON,
// the rest OFF. «Ячейка» stays always-on (address-storage campaign decision,
// mirror supplies/[id]); «Сумма ГТД» has NO column in moysklad's supply grid
// (colgroup has gtd + country only) so it is not offered at all.
const OPTIONAL_POSITION_COLUMNS: { key: PositionColumnKey; labelKey: string; on: boolean }[] = [
  { key: 'image', labelKey: 'image', on: true },
  { key: 'unit', labelKey: 'unit', on: true },
  { key: 'stock', labelKey: 'stock', on: true },
  { key: 'weight', labelKey: 'weight', on: false },
  { key: 'volume', labelKey: 'volume', on: false },
  { key: 'vatAmount', labelKey: 'vatAmount', on: false },
  // «Себест. единицы» / «Себестоимость» — moysklad's Приёмка grid shows both by
  // default (2026-07-27 HTML ground: gwt-Label header «Себест. единицы» +
  // «Себестоимость»). Read-only: unit cost = price, line cost = amount. ON by default.
  { key: 'costPerUnit', labelKey: 'costPerUnit', on: true },
  { key: 'costTotal', labelKey: 'costTotal', on: true },
  // Import/customs block — editable when toggled on (default OFF, moysklad parity).
  { key: 'gtdNumber', labelKey: 'gtd', on: false },
  { key: 'country', labelKey: 'country', on: false },
  // «Маркировка» (Честный знак) + «РНПТ» — marked-goods only, default OFF (⚙ to enable).
  { key: 'marking', labelKey: 'marking', on: false },
  { key: 'rnpt', labelKey: 'rnpt', on: false },
];
const DEFAULT_COL_VISIBLE: Record<string, boolean> = Object.fromEntries(
  OPTIONAL_POSITION_COLUMNS.map((c) => [c.key, c.on]),
);

// moysklad old-design create form (user request 2026-07-09): only «Позиции» +
// «Связанные документы» tabs — «События» is HIDDEN on /new, and «Задача»/«Файл»
// live INSIDE the related tab (NewDocRelatedTab). Flip to true to restore События.
const SHOW_NEW_EVENTS_TAB = false;

export default function NewSupplyPage() {
  const router = useRouter();
  const { user } = useAuth();
  // Narx qavati valyutada saqlangan bo'lishi mumkin — «Расценить» uni JORIY
  // kurs bilan bazaga o'giradi (2026-08-23; usiz «10 dollar» 10 so'm bo'lardi).
  const rates = useCurrencyRates();
  const t = useTranslations('pages.supplies');
  const totalsLabels = useTotalsLabels();
  const { toast } = useToast();
  const tFields = useTranslations('fields');
  const tForm = useTranslations('form');
  const tDetailForm = useTranslations('detail_form');
  const tDetailHeader = useTranslations('detail_header');
  const tDetailTabs = useTranslations('detail_tabs');
  const tDetailTitles = useTranslations('detail_titles');
  const tCommon = useTranslations('common');
  const tPos = useTranslations('position_editor');
  const tUnsaved = useTranslations('unsaved_dialog');
  // Toolbar-dropdown label namespaces (mirror supplies/[id] + the certed
  // invoices-in/new pattern) so the four «Приёмка» /new dropdowns list their
  // moysklad items instead of rendering as disabled empty triggers.
  const tBulk = useTranslations('bulk_actions');
  const tPrint = useTranslations('print_menu');
  const tCreate = useTranslations('create_related');
  const tPrintSupply = useTranslations('print_menu_supply');
  const docEditorLabels = useDocumentEditorLabels();

  // «Статус» — the account's own supply statuses (State rows, entityType="supply"),
  // NOT the FSM draft/posted state (same data-origin bug-class as the list-column
  // fix `73e5ae31`). moysklad shows a grey «Статус» pill until the admin defines
  // some via «Настроить...» → /settings/supply-statuses. Sent as statusId on create
  // (mirror purchase-returns/new + supplies/[id]).
  const { data: statusData } = useQuery<{
    items: Array<{ id: string; name: string; color: string | null }>;
  }>({
    queryKey: ['states', 'supply'],
    queryFn: () => api.get('/states?entityType=supply&archived=false&limit=250'),
    staleTime: 60_000,
  });
  const statusOptions = (statusData?.items ?? []).map((s) => ({
    value: s.id,
    label: s.name,
    color: s.color ?? undefined,
  }));
  const [statusId, setStatusId] = useState<string>('');

  const { data: orgsData } = useQuery<{ items: RefItem[] }>({
    queryKey: ['organizations'],
    queryFn: () => api.get('/organizations'),
  });
  const { data: storesData } = useQuery<{ items: RefItem[] }>({
    queryKey: ['stores'],
    queryFn: () => api.get('/stores'),
  });

  // Header state
  const [docNumber, setDocNumber] = useState('');
  const [docDate, setDocDate] = useState(() => {
    const d = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  // moysklad-parity: a NEW receipt opens with «Проведено» CHECKED — saving posts
  // it to stock (mirror purchase-returns/new + purchase-orders/new, live-certed).
  const [applicable, setApplicable] = useState(true);

  // Meta state
  const [agentId, setAgentId] = useState<string | null>(null);
  const [agentLabel, setAgentLabel] = useState<string>('');
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [organizationLabel, setOrganizationLabel] = useState<string>('');
  const [storeId, setStoreId] = useState<string | null>(null);
  const [storeLabel, setStoreLabel] = useState<string>('');
  const [contractId, setContractId] = useState<string | null>(null);
  const [contractLabel, setContractLabel] = useState('');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectLabel, setProjectLabel] = useState('');
  const [incomingNumber, setIncomingNumber] = useState('');
  const [incomingDate, setIncomingDate] = useState('');
  const [currency, setCurrency] = useState<string>('UZS');
  const [rateOverride, setRateOverride] = useState<string | null>(null);
  const [rateModalOpen, setRateModalOpen] = useState(false);
  // Bank account is org-scoped — moysklad shows a sub-row under Организация with the
  // org's account («Сум»). Clearing the org also clears the picked account.
  const [bankAccountId, setBankAccountId] = useState<string | null>(null);
  const [bankAccountLabel, setBankAccountLabel] = useState('');
  const [description, setDescription] = useState('');

  // «Накладные расходы» — extra delivery/customs cost, distributed across
  // received positions at post time (raises their FIFO cost basis). Entered
  // in document-currency major units; sent as tiyin.
  const [overheadMajor, setOverheadMajor] = useState('');
  // moysklad default «Распределить: по цене» (2026-07-27 HTML ground: «Распределить по цене»).
  const [overheadDistribution, setOverheadDistribution] = useState<'WEIGHT' | 'PRICE' | 'VOLUME'>(
    'PRICE',
  );

  // VAT toggles
  const [vatEnabled, setVatEnabled] = useState(true);
  // moysklad-parity: purchase docs open with «Цена включает НДС» CHECKED
  // (mirror purchase-returns/new, live-certed 2026-06-29).
  const [vatIncluded, setVatIncluded] = useState(true);

  // moysklad «Владелец» (owner/access) — a new doc defaults to the current user as
  // owner; department (groupId) + «Общий доступ» (shared) are editable via the
  // header owner popover. Sent on create (ownerId/groupId/shared), tenant-validated BE.
  const [ownerAccess, setOwnerAccess] = useState<OwnerAccessValue>(() => ({
    ownerId: user?.id ?? null,
    ownerLabel: user?.name ?? '',
    groupId: null,
    groupLabel: '',
    shared: false,
  }));

  // Positions
  const [positions, setPositions] = useState<NewPositionRow[]>([]);
  // Omborchi varag'i — saqlashsiz, JONLI forma holatidan chiqadi
  // (customer-orders/new dagi o'rnatilgan namuna; varaq yuridik hujjat
  //  emas — ish qog'ozi, shuning uchun hujjat raqami hali bo'lmasa ham).
  const tSheet = useTranslations('pages.pickLists');
  const { sheet, openSheet, closeSheet } = usePickSheet();
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  // ⚙ gear-optional column visibility (mirror supplies/[id]).
  const [colVisible, setColVisible] = useState<Record<string, boolean>>(DEFAULT_COL_VISIBLE);
  // Dirty-close guard — baseline snapshot is taken on the render AFTER the
  // user-defaults prefill settles (so auto-filled org/store/agent don't count
  // as user edits); any later change to the tracked state marks the form dirty.
  const [baselineReady, setBaselineReady] = useState(false);
  const [baselineSnap, setBaselineSnap] = useState<string | null>(null);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);

  // Pickers + error
  const [openPicker, setOpenPicker] = useState<
    | null
    | 'agent'
    | 'org'
    | 'store'
    | 'contract'
    | 'project'
    | 'bankAccount'
    | { kind: 'product'; rowUid: string }
    | { kind: 'country'; rowUid: string }
  >(null);
  // «Добавить из справочника» — the full catalog modal (it used to append an
  // EMPTY row; user 2026-07-14 bug report, fixed on internal-orders/new first).
  const [catalogAddOpen, setCatalogAddOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // «Курс валюты документа» — rate from the account currency-справочник (Настройки
  // → Валюты), the admin-set value moysklad books documents at — NOT a live CB
  // feed (drifts e.g. 11 990 vs 12 200, storing USD docs at the wrong base value).
  // One source of truth → GET /currencies (mirror enters / losses / payments-in).
  const { data: currenciesData } = useQuery<{
    items: Array<{ id: string; isoCode: string; name: string; rate: string }>;
  }>({
    queryKey: ['currencies'],
    queryFn: () => api.get('/currencies'),
    staleTime: 60_000,
  });
  // «Валюта документа» options — the account's REAL currencies (Настройки → Валюты),
  // never a hardcoded list (a phantom EUR/RUB the account doesn't have must not appear).
  const currencies = currenciesData?.items ?? [];
  const adminRate = currencies.find((c) => c.isoCode === currency)?.rate;
  const effectiveRate = rateOverride ?? adminRate ?? '1';

  // Pre-fill from the user's «Значения по умолчанию» once the reference lists +
  // settings settle (moysklad applies the user defaults to EVERY new document).
  // Организация/Склад fall back to the first list item; Контрагент (this is a
  // PURCHASE doc → defaultSupplier) + Проект come only from an explicit default.
  const userDefaults = useUserDefaults();
  const defaultsAppliedRef = useRef(false);
  // moysklad old-design «Связанные документы» tab (NewDocRelatedTab) owns file
  // staging + «Задача»/«Файл»/«Привязать документ» in place; staged files/tasks/
  // links are flushed onto the receipt right after it's saved. Mirror PO/new.
  const staging = useNewDocStaging({ entityType: 'Supply', route: 'supplies' });
  useEffect(() => {
    if (defaultsAppliedRef.current) return;
    if (!orgsData || !storesData) return;
    if (userDefaults.isLoading) return;
    defaultsAppliedRef.current = true;
    setBaselineReady(true);
    const us = userDefaults.data;
    if (!organizationId) {
      if (us?.defaultCompany) {
        setOrganizationId(us.defaultCompany.id);
        setOrganizationLabel(us.defaultCompany.name);
      } else if (orgsData.items[0]) {
        setOrganizationId(orgsData.items[0].id);
        setOrganizationLabel(orgsData.items[0].name);
      }
    }
    if (!storeId) {
      const store = defaultDocStore(us, storesData.items);
      if (store) {
        setStoreId(store.id);
        setStoreLabel(store.name);
      }
    }
    if (!agentId && us?.defaultSupplier) {
      setAgentId(us.defaultSupplier.id);
      setAgentLabel(us.defaultSupplier.name);
    }
    if (!projectId && us?.defaultProject) {
      setProjectId(us.defaultProject.id);
      setProjectLabel(us.defaultProject.name);
    }
  }, [
    orgsData,
    storesData,
    userDefaults.data,
    userDefaults.isLoading,
    organizationId,
    storeId,
    agentId,
    projectId,
  ]);

  // moysklad parity: choosing (or changing) the organization auto-fills its
  // default account for the document currency — the «Сум» sub-line under
  // Организация (moysklad pre-selects it). Keyed on org/currency only, so a
  // manual account pick isn't clobbered by unrelated re-renders.
  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    void (async () => {
      const d = await api.get<{
        items: Array<{ id: string; name: string; accountNumber: string | null; currency: string }>;
      }>(`/bank-accounts?organizationId=${organizationId}`);
      if (cancelled) return;
      const acct = d.items.find((a) => a.currency === currency) ?? d.items[0];
      setBankAccountId(acct?.id ?? null);
      // moysklad shows the account NAME («Сум»), not the (often blank) number.
      setBankAccountLabel(acct ? acct.name || acct.accountNumber || acct.currency : '');
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId, currency]);

  /** Append ONE catalog product as a new position — shared by the inline
   *  typeahead pick and by the «Добавить из справочника» modal, so both land a
   *  filled row (the button used to append an EMPTY row; same bug-class as the
   *  internal-orders/new fix from the user's 2026-07-14 report). */
  const appendPositionFromCatalog = (
    item: { id: string; primary: unknown; raw?: unknown },
    entry?: { quantity: string; priceMinor: string },
  ) => {
    const raw = item.raw as ProductItem | undefined;
    const newId = uid();
    setPositions((ps) => [
      ...ps,
      {
        id: newId,
        assortmentId: item.id,
        productLabel: String(item.primary),
        productUom: raw?.uom ?? null,
        quantity: entry?.quantity ?? '1',
        priceMinor: entry?.priceMinor ?? purchaseLinePriceMinor(raw),
        discount: '0',
        vat: raw?.vat != null ? String(raw.vat) : '12',
        vatEnabled: true,
        stock: raw?.stock?.onHand != null ? String(raw.stock.onHand) : undefined,
        salePrices: raw?.salePrices ?? null,
      },
    ]);
    // owner 2026-07-18: returning the id hands focus to the new
    // row's «Кол-во» (modal → table entry chain).
    return newId;
  };

  // «Импорт ▾» — the user picks a CSV/TSV (Excel «Сохранить как CSV» or a plain
  // list of «kod;miqdor»). Each line is resolved against the catalog by code →
  // exact name → sole result, and matched products are appended. NEVER throws:
  // a bad file / unmatched lines degrade to a summary toast (owner "no new bugs"
  // bar). Parsing is the unit-tested pure `parsePositionImport`.
  const importInputRef = useRef<HTMLInputElement>(null);
  // «Наименование» click → edit that product in an overlay, WITHOUT leaving the
  // (unsaved) receipt (owner 2026-07-27). Conditionally mounted → fresh each open.
  const [editProductId, setEditProductId] = useState<string | null>(null);
  // «Создать новый товар "<query>"» → create in an overlay, then append it as a
  // position (null = closed; a string = open, pre-filling that typed name).
  const [createProductName, setCreateProductName] = useState<string | null>(null);
  const handleImportFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    try {
      const { rows, skipped } = parsePositionImport(await file.text());
      if (rows.length === 0) {
        toast.warning(tPos('import_empty'));
        return;
      }
      let missing = 0;
      const additions: NewPositionRow[] = [];
      for (const row of rows) {
        try {
          const res = await api.get<{ items: ProductItem[] }>(
            `/products?search=${encodeURIComponent(row.identifier)}&limit=20`,
          );
          const items = res.items ?? [];
          const key = row.identifier.toLowerCase();
          const found =
            items.find((p) => (p.code ?? '').toLowerCase() === key) ??
            items.find((p) => p.name.toLowerCase() === key) ??
            (items.length === 1 ? items[0] : undefined);
          if (!found) {
            missing += 1;
            continue;
          }
          additions.push({
            id: uid(),
            assortmentId: found.id,
            productLabel: found.name,
            productUom: found.uom ?? null,
            quantity: String(row.quantity),
            priceMinor: found.buyPrice ?? '0',
            discount: '0',
            vat: found.vat != null ? String(found.vat) : '12',
            vatEnabled: true,
            stock: found.stock?.onHand != null ? String(found.stock.onHand) : undefined,
            salePrices: found.salePrices ?? null,
          });
        } catch {
          missing += 1;
        }
      }
      if (additions.length > 0) setPositions((ps) => [...ps, ...additions]);
      toast.success(tPos('import_result', { added: additions.length, missing, skipped }));
    } catch {
      toast.error(tPos('import_empty'));
    }
  };
  const updatePosition = (id: string, patch: Partial<NewPositionRow>) => {
    setPositions((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };
  const removePosition = (id: string) => {
    setPositions((ps) => ps.filter((p) => p.id !== id));
  };
  // «Kelishuv» — spread the negotiated delta across the lines (owner 2026-07-17).
  const applyAgreement = useCallback(
    (deltaMinor: bigint) => {
      setPositions((ps) => {
        const patch = distributeAgreementDelta(ps, deltaMinor, vatIncluded);
        if (patch.size === 0) return ps;
        return ps.map((p) => {
          const next = patch.get(p.id);
          return next != null ? { ...p, priceMinor: next } : p;
        });
      });
    },
    [vatIncluded],
  );

  const totals = useMemo(
    () =>
      positions.reduce(
        (acc, p) => {
          const t = computeLineTotalSafe(p, vatIncluded);
          return { net: acc.net + t.net, vat: acc.vat + t.vat, gross: acc.gross + t.gross };
        },
        { net: 0n, vat: 0n, gross: 0n },
      ),
    [positions, vatIncluded],
  );
  const totalQty = positions.reduce((acc, p) => acc + Number(p.quantity || '0'), 0);
  // moysklad shell notice — «Позиции документа содержат повторяющиеся товары.»
  // (green ✓ line between toolbar and title when a product repeats; mirror
  // invoices-in/new).
  const hasDuplicatePositions = useMemo(() => {
    const seen = new Set<string>();
    for (const p of positions) {
      if (!p.assortmentId) continue;
      if (seen.has(p.assortmentId)) return true;
      seen.add(p.assortmentId);
    }
    return false;
  }, [positions]);

  // Dirty tracking for the moysklad «Сохранение изменений» close guard.
  // bankAccount/ownerAccess are excluded — both are auto-derived defaults.
  const dirtySnap = JSON.stringify({
    docNumber,
    agentId,
    organizationId,
    storeId,
    contractId,
    projectId,
    incomingNumber,
    incomingDate,
    currency,
    description,
    statusId,
    overheadMajor,
    overheadDistribution,
    applicable,
    vatEnabled,
    vatIncluded,
    positions: positions.map((p) => [
      p.assortmentId,
      p.quantity,
      p.priceMinor,
      p.discount,
      p.vat,
      p.cellId ?? null,
      p.rnpt ?? null,
      p.marking ?? null,
    ]),
  });
  useEffect(() => {
    if (baselineReady && baselineSnap === null) setBaselineSnap(dirtySnap);
  }, [baselineReady, baselineSnap, dirtySnap]);
  const isDirty = baselineSnap !== null && dirtySnap !== baselineSnap;
  // Also arms the router-level UnsavedNavGuard (browser back / nav away).
  useUnsavedGuard(isDirty);

  // «Цена ▾» price-type list (mirror supplies/[id]).
  const tCols = useTranslations('position_cols');
  const { data: priceTypesData } = useQuery<{ items: Array<{ id: string; name: string }> }>({
    queryKey: ['price-types'],
    queryFn: () => api.get('/price-types'),
    staleTime: 60_000,
  });
  // «Расценить» — re-price every row by the chosen price-type (from each product's
  // carried salePrices; rows picked before this session's mapping keep their price —
  // same limitation as supplies/[id]).
  const repricePositions = useCallback(
    (priceTypeId: string) => {
      setPositions((ps) =>
        ps.map((p) => {
          // «Расценить» — qavat valyutada bo'lsa JORIY kurs bilan bazaga o'giriladi;
          // kursi noma'lum bo'lsa qator narxi TEGILMAYDI (xom son yozishdan ko'ra
          // eskisi qolgani xavfsizroq — 2026-08-23 auditi).
          const next = resolveSalePriceByType(p.salePrices, priceTypeId, rates);
          return next != null ? { ...p, priceMinor: next } : p;
        }),
      );
    },
    [rates],
  );
  // «Сохранить цены» — push each line's price back onto its product; on a receipt
  // the line price is the BUY price → Product.buyPrice (mirror supplies/[id]).
  const saveProductPrices = useCallback(async () => {
    const seen = new Set<string>();
    for (const p of positions) {
      if (!p.assortmentId || seen.has(p.assortmentId)) continue;
      seen.add(p.assortmentId);
      try {
        const prod = await api.get<{ version: number }>(`/products/${p.assortmentId}`);
        await api.patch(`/products/${p.assortmentId}`, {
          version: prod.version,
          buyPrice: p.priceMinor,
          // Qiymat BAZA valyutasida — eski valyuta belgisi qolib ketmasin
          // (aks holda keyin u xorijiy deb o'qilardi). 2026-08-23.
          buyPriceCurrency: null,
        });
      } catch {
        // skip products that can't be updated (e.g. concurrent edit); others proceed
      }
    }
  }, [positions]);
  // «Скидка ▾» → «Скидка/наценка» — targets selected rows, or ALL when none selected
  // (mirror supplies/[id]).
  const applyDiscountMarkup = useCallback(
    (mode: 'discount' | 'markup', percent: number) => {
      setPositions((ps) =>
        ps.map((p) => {
          if (selectedRowIds.size > 0 && !selectedRowIds.has(p.id)) return p;
          if (mode === 'discount') return { ...p, discount: String(percent) };
          const base = Number(p.priceMinor || '0');
          if (!Number.isFinite(base)) return p;
          return { ...p, priceMinor: String(Math.round(base * (1 + percent / 100))) };
        }),
      );
    },
    [selectedRowIds],
  );

  // Positions grid — mirror the live-certed supplies/[id] column set: NO «#»
  // row-number column (moysklad's rownum cell IS the select checkbox), gear-driven
  // optional columns, «Цена ▾»/«Скидка ▾» header menus, «Ячейка» between the
  // quantity block and «Цена» (G2 order: Кол-во · Ячейка · Остаток · Цена).
  const positionColumns = useMemo<PositionTableColumnConfig[]>(() => {
    const cols: PositionTableColumnConfig[] = [{ key: 'dragarea' }, { key: 'select' }];
    if (colVisible.image) cols.push({ key: 'image' });
    cols.push({ key: 'name', label: tCols('name') });
    // moysklad «Маркировка» sits right after «Наименование» (marked-goods; ⚙-optional).
    if (colVisible.marking) cols.push({ key: 'marking', label: tCols('marking') });
    // moysklad «Приёмка» qty header is «Принято» (received), NOT «Кол-во» — grounded
    // live 2026-07-06 on the user's account (#supply/edit 00905) + the user's own
    // screenshot. The earlier «Кол-во» was mis-borrowed from the PO editor (whose
    // Приёмка header never rendered in the reference capture).
    cols.push({ key: 'quantity', label: tCols('received') });
    if (colVisible.unit) cols.push({ key: 'unit', label: tCols('unit') });
    cols.push({ key: 'cell', label: tCols('cell'), placeholder: tCols('cell_unset') });
    if (colVisible.stock) cols.push({ key: 'stock', label: tCols('stock') });
    cols.push(
      {
        key: 'price',
        label: (
          <PositionPriceMenu
            label={tCols('price')}
            repriceLabel={tCols('reprice')}
            saveLabel={tCols('savePrices')}
            priceTypes={priceTypesData?.items ?? []}
            onReprice={repricePositions}
            onSavePrices={saveProductPrices}
          />
        ),
      },
      { key: 'vat', label: tCols('vat') },
    );
    if (colVisible.vatAmount) cols.push({ key: 'vatAmount', label: tCols('vatAmount') });
    cols.push({
      key: 'discount',
      label: (
        <PositionDiscountMenu
          label={tCols('discount')}
          title={tCols('discountMarkupTitle')}
          selectedText={tCols('selectedPositions', { count: selectedRowIds.size })}
          discountLabel={tCols('discount')}
          markupLabel={tCols('markup')}
          applyDiscountLabel={tCols('applyDiscount')}
          applyMarkupLabel={tCols('applyMarkup')}
          cancelLabel={tCols('cancel')}
          onApply={applyDiscountMarkup}
        />
      ),
    });
    if (colVisible.weight) cols.push({ key: 'weight', label: tCols('weight') });
    if (colVisible.volume) cols.push({ key: 'volume', label: tCols('volume') });
    // moysklad «Приёмка» import/customs columns — editable when toggled on (⚙).
    if (colVisible.gtdNumber) cols.push({ key: 'gtdNumber', label: tCols('gtd') });
    if (colVisible.rnpt) cols.push({ key: 'rnpt', label: tCols('rnpt') });
    if (colVisible.country) cols.push({ key: 'country', label: tCols('country') });
    cols.push({
      key: 'amount',
      label: (
        <span className="inline-flex items-center gap-1">
          {tCols('amount')}
          <PositionColumnCustomizer
            options={OPTIONAL_POSITION_COLUMNS.map((c) => ({
              key: c.key,
              label: tCols(c.labelKey),
            }))}
            visible={colVisible}
            onToggle={(key, next) => setColVisible((v) => ({ ...v, [key]: next }))}
            ariaLabel={tCols('configure')}
          />
        </span>
      ),
    });
    // moysklad column order: …Сумма · Себест. единицы · Себестоимость (after «Сумма»).
    if (colVisible.costPerUnit) cols.push({ key: 'costPerUnit', label: tCols('costPerUnit') });
    if (colVisible.costTotal) cols.push({ key: 'costTotal', label: tCols('costTotal') });
    cols.push({ key: 'menu' });
    return cols;
  }, [
    colVisible,
    tCols,
    priceTypesData,
    repricePositions,
    saveProductPrices,
    applyDiscountMarkup,
    selectedRowIds,
  ]);

  const { openTemplates } = usePrintTemplatesManager();
  // The account's own custom «Приёмка» print forms (moysklad «Печать» lists them
  // ABOVE the built-in «Приходная накладная», and pins each as its OWN toolbar
  // button after «Отправить»). Empty on accounts with none configured. Mirror PO/new.
  const { data: printForms } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ['supply-print-forms'],
    queryFn: () => api.get('/supplies/print-forms'),
    staleTime: 60_000,
  });
  // moysklad «Печать» on a NEW receipt: silently save, then open the check in a NEW
  // TAB (HTML print view) — the print flag lives on the ref so `createMut.onSuccess`
  // knows whether the save was triggered by «Печать».
  const afterSaveRef = useRef<'view' | 'print' | 'send-goods'>('view');
  // Which form the save-first print should open once the receipt exists: {view} =
  // built-in «Приходная накладная» HTML check, {form} = a custom form PDF (rendered
  // via /supplies/bulk-print + opened in a new tab), {kit} = «Комплект…». Mirror PO/new.
  const printTargetRef = useRef<{ kind: 'view' | 'form' | 'kit'; templateId?: string }>({
    kind: 'view',
  });
  const [kitPrintOpen, setKitPrintOpen] = useState(false);
  const [printedSupplyId, setPrintedSupplyId] = useState<string | null>(null);
  // moysklad marks a required-but-empty «Контрагент» RED on a blocked save:
  // field border + short «Поле должно быть заполнено» line under it, the same
  // short message under the toolbar — never a page-wide banner. Mirror PO/new.
  const [agentInvalid, setAgentInvalid] = useState(false);
  const createMut = useMutation({
    mutationFn: async () => {
      if (!agentId) throw new Error(tForm('select_supplier'));
      if (!organizationId) throw new Error(tForm('select_organization'));
      if (!storeId) throw new Error(tForm('select_store'));
      // Owner 2026-07-08: «Проведено» has NO position precondition — an empty document may be saved/posted (BE allows it: 0 positions ⇒ 0 stock delta).
      for (const [i, p] of positions.entries()) {
        if (!p.assortmentId) throw new Error(tForm('position_select_product', { n: i + 1 }));
        if (Number(p.quantity) <= 0)
          throw new Error(tForm('position_quantity_positive', { n: i + 1 }));
      }
      const payload = {
        agentId,
        organizationId,
        storeId,
        ...(bankAccountId ? { organizationAccountId: bankAccountId } : {}),
        // «Владелец» — owner employee / department / shared (else BE stamps creator).
        ...(ownerAccess.ownerId ? { ownerId: ownerAccess.ownerId } : {}),
        ...(ownerAccess.groupId ? { groupId: ownerAccess.groupId } : {}),
        ...(ownerAccess.shared ? { shared: true } : {}),
        ...(contractId ? { contractId } : {}),
        ...(projectId ? { projectId } : {}),
        // «Статус» — the picked account custom status (BE tenant-validates).
        ...(statusId ? { statusId } : {}),
        description: description || undefined,
        incomingNumber: incomingNumber || undefined,
        incomingDate: incomingDate || undefined,
        ...(docNumber ? { name: docNumber } : {}),
        moment: docDate ? new Date(docDate).toISOString() : undefined,
        applicable,
        currency,
        // rateValue stored as BigInt minor (× 100000000) — moysklad's convention.
        // UZS stays at 1.0, other currencies carry the effective rate (overridden
        // or auto-fetched).
        rateValue:
          currency === 'UZS'
            ? '100000000'
            : BigInt(Math.round(Number(effectiveRate) * 100000000)).toString(),
        vatEnabled,
        vatIncluded,
        ...(Number(overheadMajor) > 0
          ? {
              overheadSumMinor: String(BigInt(Math.round(Number(overheadMajor) * 100))),
              overheadDistribution,
              overheadCurrency: currency,
            }
          : {}),
        positions: positions.map((p) => ({
          assortmentKind: 'product',
          // biome-ignore lint/style/noNonNullAssertion: validated non-null in the loop above before payload build
          assortmentId: p.assortmentId!,
          quantity: p.quantity,
          priceMinor: p.priceMinor,
          discount: p.discount || '0',
          vat: p.vat ? Number(p.vat) : undefined,
          vatEnabled: p.vatEnabled,
          gtdNumber: p.gtdNumber || undefined,
          gtdSumMinor: p.gtdSumMinor || undefined,
          countryId: p.countryId || undefined,
          rnpt: p.rnpt || undefined,
          marking: p.marking || undefined,
          // «Ячейка» — address-storage bin (cellId drives per-cell stock).
          ...(p.cellId ? { cellId: p.cellId } : {}),
          ...(p.cell ? { cell: p.cell } : {}),
        })),
      };
      return api.post<{ id: string }>('/supplies', payload);
    },
    onSuccess: async (created: { id: string }) => {
      const intent = afterSaveRef.current;
      afterSaveRef.current = 'view';
      // Flush «Связанные документы» staged files / tasks / links onto the receipt.
      await staging.flush(created.id);
      // «Печать»: open the chosen form of the freshly-saved receipt in a NEW TAB
      // (moysklad «Открыть в браузере» — the user presses «Печать» there, no
      // auto-print), then land on the saved receipt's detail page. Mirror PO/new.
      // «Tovarlar ro'yxati (Excel)» — send THIS supply's goods to the agent.
      if (intent === 'send-goods') {
        try {
          await api.post(`/supply-goods/${created.id}?deliver=true`, {});
          toast.success(t('send_goods_ok'));
        } catch (e) {
          toast.error((e as Error).message);
        }
        router.push(`/supplies/${created.id}`);
        return;
      }
      if (intent === 'print') {
        const target = printTargetRef.current;
        printTargetRef.current = { kind: 'view' };
        if (target.kind === 'form' && target.templateId) {
          // An account custom form → render its PDF and OPEN IT IN A NEW TAB.
          void api.postOpenInBrowser('/supplies/bulk-print', {
            ids: [created.id],
            templateId: target.templateId,
          });
        } else if (target.kind === 'kit') {
          // «Комплект…» — open the bundle picker over the now-saved receipt; stay on
          // /new so the modal stays mounted (it prints via `printedSupplyId`).
          setPrintedSupplyId(created.id);
          setKitPrintOpen(true);
          return;
        } else {
          // Built-in «Приходная накладная» — open the standard HTML check in a new tab.
          window.open(`/print/supply/${created.id}`, '_blank');
        }
      }
      router.push(`/supplies/${created.id}`);
    },
    onError: (err: Error) => {
      afterSaveRef.current = 'view';
      setError(err.message);
    },
  });

  const agentFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{
      items: Array<{ id: string; name: string; legalTitle: string | null }>;
    }>(`/counterparties?search=${encodeURIComponent(s)}&limit=50`);
    return d.items.map((c) => ({
      id: c.id,
      primary: c.name,
      secondary: c.legalTitle ?? undefined,
    }));
  };
  const productFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: ProductItem[] }>(
      `/products?search=${encodeURIComponent(s)}&limit=50`,
    );
    return d.items.map((p) => ({
      id: p.id,
      primary: p.name,
      secondary: p.code ?? undefined,
      meta: p.uom ?? undefined,
      raw: p,
    }));
  };
  const orgFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: RefItem[] }>(`/organizations?search=${encodeURIComponent(s)}`);
    return d.items.map((o) => ({
      id: o.id,
      primary: o.name,
      secondary: o.legalTitle ?? undefined,
    }));
  };
  const storeFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: RefItem[] }>(`/stores?search=${encodeURIComponent(s)}`);
    return d.items.map((st) => ({ id: st.id, primary: st.name, secondary: st.code ?? undefined }));
  };
  const contractFetcher = async (s: string): Promise<PickerItem[]> => {
    // moysklad scopes «Договор» to the receipt's counterparty; without an agent
    // chosen yet the picker stays empty and the field is greyed.
    if (!agentId) return [];
    const d = await api.get<{ items: RefItem[] }>(
      `/contracts?counterpartyId=${agentId}&search=${encodeURIComponent(s)}`,
    );
    return d.items.map((c) => ({ id: c.id, primary: c.name }));
  };
  const projectFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: RefItem[] }>(
      `/projects?search=${encodeURIComponent(s)}&limit=50`,
    );
    return d.items.map((p) => ({ id: p.id, primary: p.name }));
  };
  const countryFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: Array<{ id: string; name: string; code: string | null }> }>(
      `/countries?search=${encodeURIComponent(s)}&limit=100`,
    );
    return d.items.map((c) => ({ id: c.id, primary: c.name, secondary: c.code ?? undefined }));
  };

  // Bank account picker — scoped to the currently-selected org and currency.
  // Without orgId chosen yet the picker stays empty.
  const bankAccountFetcher = async (s: string): Promise<PickerItem[]> => {
    if (!organizationId) return [];
    const d = await api.get<{
      items: Array<{
        id: string;
        name: string;
        bankName: string | null;
        accountNumber: string | null;
        currency: string;
      }>;
    }>(`/bank-accounts?organizationId=${organizationId}&search=${encodeURIComponent(s)}`);
    return d.items
      .filter((a) => a.currency === currency)
      .map((a) => ({
        // moysklad shows the account NAME («Сум»), not the bare number.
        id: a.id,
        primary: a.name || a.accountNumber || a.currency,
        secondary: a.bankName ?? a.accountNumber ?? undefined,
      }));
  };

  const renderPositionNameCell = (row: DocPositionRow) => {
    const p = row as NewPositionRow;
    // moysklad parity: a picked product's name LINKS to its product card (where the
    // «Аналоги» tab lives). Swapping moves to the row ⋮ «Заменить» (onReplace below).
    const href = p.assortmentId ? `/products/${p.assortmentId}` : undefined;
    return (
      <PositionNameCell
        label={p.productLabel}
        placeholder={tForm('select_product')}
        onPick={() => setOpenPicker({ kind: 'product', rowUid: p.id })}
        productHref={href}
        onNavigate={p.assortmentId ? () => setEditProductId(p.assortmentId) : undefined}
        navigateAsButton
        testId={`pos-${p.id}-name`}
      />
    );
  };

  // «Цена ▾» per-row quick-pick — the product's sale prices (Оптом / Sotilish),
  // labelled by price-type name; picking one sets the row price (owner 2026-07-27).
  const positionPriceOptions = useCallback(
    (row: DocPositionRow) => {
      const sps = (row as NewPositionRow).salePrices ?? [];
      return sps.map((sp) => ({
        id: sp.priceTypeId,
        label: priceTypesData?.items.find((t) => t.id === sp.priceTypeId)?.name ?? tCols('price'),
        value: sp.value,
      }));
    },
    [priceTypesData, tCols],
  );

  const renderPositionCountryCell = (row: DocPositionRow) => (
    <CatalogPickerField
      value={row.countryId ? { id: row.countryId, label: row.countryLabel ?? '' } : null}
      placeholder={tFields('country')}
      onPick={() => setOpenPicker({ kind: 'country', rowUid: row.id })}
      onClear={() => updatePosition(row.id, { countryId: null, countryLabel: '' })}
    />
  );

  // «Ячейка» — address-storage cell picker (Адресное хранение). The closure has
  // storeId (page state) + the row's product (assortmentId), so the picker can show
  // «Все ячейки» / «С этим товаром». Stores cellId (drives per-cell stock) + the
  // «Зона / Ячейка» label in `cell` (mirror enters/losses).
  const renderPositionCellCell = (row: DocPositionRow) => {
    const p = row as NewPositionRow;
    return (
      <CellPickerField
        storeId={storeId}
        assortmentId={p.assortmentId}
        label={p.cell}
        // Приёмка stores goods: picking a cell for a cell-less product binds it
        // as that product's home cell (never overwrites an existing binding).
        bindProductCell
        onSelect={(cellId, label) => updatePosition(row.id, { cellId, cell: label })}
        onClear={() => updatePosition(row.id, { cellId: null, cell: '' })}
      />
    );
  };

  // moysklad-parity: the metadata grid sits ABOVE the «Главная»/«Связанные
  // документы» tabs and stays visible across tab switches — the tabs only swap the
  // positions ↔ related-docs area below. So render it as a SIBLING, not inside «main»
  // (mirrors PO/new + supplies/[id]). Field set + order = supplies/[id]'s meta:
  // Организация(+«Сум» account subRow)‖Склад · Контрагент(+Баланс)‖Договор ·
  // Проект‖Входящий номер+«от»+дата · Валюта‖∅.
  const metaPanel = (
    <div className="max-w-[860px] space-y-2 bg-[var(--ms-bg-surface)] px-4 py-3">
      <DocumentMetaRow fixedWidth>
        <DocumentMetaField
          label={tFields('organization')}
          required
          // moysklad: the org's settlement account («Сум») is a sub-row directly
          // under Организация — the right column has NO counterpart at this line.
          subRow={
            organizationId ? (
              <CatalogPickerField
                value={bankAccountId ? { id: bankAccountId, label: bankAccountLabel } : null}
                placeholder=""
                onPick={() => setOpenPicker('bankAccount')}
                inlineFetcher={bankAccountFetcher}
                onInlineSelect={(item) => {
                  setBankAccountId(item.id);
                  setBankAccountLabel(String(item.primary));
                }}
                onClear={() => {
                  setBankAccountId(null);
                  setBankAccountLabel('');
                }}
              />
            ) : undefined
          }
        >
          <CatalogPickerField
            value={organizationId ? { id: organizationId, label: organizationLabel } : null}
            placeholder={tFields('organization')}
            onPick={() => setOpenPicker('org')}
            inlineFetcher={orgFetcher}
            onInlineSelect={(item) => {
              setOrganizationId(item.id);
              setOrganizationLabel(String(item.primary));
              // Changing the org invalidates its scoped account.
              setBankAccountId(null);
              setBankAccountLabel('');
            }}
            onEdit={
              organizationId
                ? () => window.open(`/organizations/${organizationId}`, '_blank', 'noopener')
                : undefined
            }
            editLabel={tCommon('edit')}
            onClear={() => {
              setOrganizationId(null);
              setOrganizationLabel('');
              // Bank accounts are org-scoped — clearing the org invalidates the account.
              setBankAccountId(null);
              setBankAccountLabel('');
            }}
          />
        </DocumentMetaField>
        <DocumentMetaField label={tFields('store')} required>
          <CatalogPickerField
            value={storeId ? { id: storeId, label: storeLabel } : null}
            placeholder={tFields('store')}
            onPick={() => setOpenPicker('store')}
            inlineFetcher={storeFetcher}
            onInlineSelect={(item) => {
              setStoreId(item.id);
              setStoreLabel(String(item.primary));
            }}
            onEdit={
              storeId ? () => window.open(`/stores/${storeId}`, '_blank', 'noopener') : undefined
            }
            editLabel={tCommon('edit')}
            onClear={() => {
              setStoreId(null);
              setStoreLabel('');
            }}
          />
        </DocumentMetaField>
      </DocumentMetaRow>

      <DocumentMetaRow fixedWidth>
        <DocumentMetaField
          label={tFields('agent')}
          required
          error={agentInvalid ? tCommon('must_fill') : undefined}
        >
          <CatalogPickerField
            value={agentId ? { id: agentId, label: agentLabel } : null}
            placeholder={tFields('agent')}
            invalid={agentInvalid}
            onPick={() => setOpenPicker('agent')}
            inlineFetcher={agentFetcher}
            onInlineSelect={(item) => {
              setAgentId(item.id);
              setAgentLabel(String(item.primary));
              // Picking an agent resolves the moysklad-style field error.
              setAgentInvalid(false);
              setError(null);
              // Changing the agent invalidates its scoped contract.
              setContractId(null);
              setContractLabel('');
            }}
            onEdit={
              agentId
                ? () => window.open(`/counterparties/${agentId}`, '_blank', 'noopener')
                : undefined
            }
            editLabel={tCommon('edit')}
            onClear={() => {
              setAgentId(null);
              setAgentLabel('');
              // Clearing the agent invalidates any chosen contract.
              setContractId(null);
              setContractLabel('');
            }}
            onCreate={() => router.push('/counterparties/new')}
            createLabel={tForm('create_new_counterparty')}
          />
          <CounterpartyBalanceInline counterpartyId={agentId} />
        </DocumentMetaField>
        <DocumentMetaField label={tFields('contract')}>
          <CatalogPickerField
            value={contractId ? { id: contractId, label: contractLabel } : null}
            placeholder={tFields('contract')}
            onPick={() => agentId && setOpenPicker('contract')}
            inlineFetcher={contractFetcher}
            onInlineSelect={(item) => {
              setContractId(item.id);
              setContractLabel(String(item.primary));
            }}
            disabled={!agentId}
            disabledHint={tForm('select_supplier_first')}
            onClear={() => {
              setContractId(null);
              setContractLabel('');
            }}
            onCreate={() => router.push('/contracts/new')}
            createLabel={tForm('create_new_contract')}
          />
        </DocumentMetaField>
      </DocumentMetaRow>

      <DocumentMetaRow fixedWidth>
        <DocumentMetaField label={tFields('project')}>
          <CatalogPickerField
            value={projectId ? { id: projectId, label: projectLabel } : null}
            placeholder={tFields('project')}
            onPick={() => setOpenPicker('project')}
            inlineFetcher={projectFetcher}
            onInlineSelect={(item) => {
              setProjectId(item.id);
              setProjectLabel(String(item.primary));
            }}
            onClear={() => {
              setProjectId(null);
              setProjectLabel('');
            }}
            onCreate={() => router.push('/settings/projects/new')}
            createLabel={tForm('create_new_project')}
          />
        </DocumentMetaField>
        <DocumentMetaField label={tFields('incoming_number')}>
          {/* moysklad «Входящий номер» + «от» «Входящая дата» together in one
              field (supplier's document number + its date). */}
          <div className="flex items-center gap-2">
            <Input
              value={incomingNumber}
              onChange={(e) => setIncomingNumber(e.target.value)}
              className="min-w-0 flex-1"
              data-test-id="field-incoming-number"
            />
            <span className="shrink-0 text-[var(--ms-text-muted)] text-xs">
              {tDetailHeader('from')}
            </span>
            <div className="shrink-0">
              <DatePicker
                value={incomingDate || null}
                onChange={(d) => setIncomingDate(d ?? '')}
                locale="ru-RU"
                testId="field-incoming-date"
              />
            </div>
          </div>
        </DocumentMetaField>
      </DocumentMetaRow>

      <DocumentMetaRow fixedWidth>
        <DocumentMetaField
          label={tDetailForm('currency')}
          required
          helper={
            currency !== 'UZS' ? (
              <span className="inline-flex items-center gap-2">
                <span className="tabular-nums">
                  1 {currency} ={' '}
                  {Number(effectiveRate).toLocaleString('ru-RU', { maximumFractionDigits: 4 })} UZS
                </span>
                <Button
                  type="button"
                  variant="link"
                  onClick={() => setRateModalOpen(true)}
                  className="h-auto px-0 font-normal text-xs"
                  aria-label={tForm('rate_edit')}
                  data-test-id="rate-edit"
                >
                  ✎
                </Button>
              </span>
            ) : undefined
          }
        >
          <NativeSelect
            value={currency}
            onChange={(e) => {
              setCurrency(e.target.value);
              setRateOverride(null);
            }}
            data-test-id="field-currency"
          >
            {currencies.length === 0 && <option value={currency}>{currency}</option>}
            {currencies.map((c) => (
              <option key={c.id} value={c.isoCode}>
                {c.name} ({c.isoCode})
              </option>
            ))}
          </NativeSelect>
        </DocumentMetaField>
      </DocumentMetaRow>
    </div>
  );

  const tabs = [
    {
      key: 'main',
      // moysklad old-design create form: first tab is «Главная» (2-tab strip
      // «Главная» + «Связанные документы») — matches the sibling /new editors.
      label: tDetailTabs('main'),
      content: (
        <div className="space-y-4">
          {/* Owner 2026-07-23: «Договорная цена» — blue, at the table's OUTER
              top-right corner (same spot in every section). */}
          <div className="-mb-2.5 flex justify-end">
            <PositionAgreementButton
              totalMinor={totals.gross}
              currency={currency}
              labels={{
                button: tPos('agreement_button'),
                total: tPos('agreement_total'),
                amount: tPos('agreement_amount'),
                add: tPos('agreement_add'),
                subtract: tPos('agreement_subtract'),
                save: tPos('pick_modal_save'),
                cancel: tPos('pick_modal_cancel'),
              }}
              onApply={applyAgreement}
            />
          </div>
          <PositionTable
            columns={positionColumns}
            rows={positions}
            onUpdate={(id, patch) => updatePosition(id, patch as Partial<NewPositionRow>)}
            onRemove={removePosition}
            onDuplicate={(id) => {
              const source = positions.find((p) => p.id === id);
              if (!source) return;
              setPositions((ps) => [...ps, { ...source, id: uid() }]);
            }}
            onReorder={(from, to) => {
              setPositions((ps) => {
                const next = ps.slice();
                const [moved] = next.splice(from, 1);
                if (moved) next.splice(to, 0, moved);
                return next;
              });
            }}
            renderNameCell={renderPositionNameCell}
            priceOptions={positionPriceOptions}
            renderCountryCell={renderPositionCountryCell}
            renderCellCell={renderPositionCellCell}
            onReplace={(id) => setOpenPicker({ kind: 'product', rowUid: id })}
            vatIncluded={vatIncluded}
            selectedIds={selectedRowIds}
            onSelectionChange={setSelectedRowIds}
            footerToolbar={
              <>
                <PositionInlineAdd
                  placeholder={tPos('addPositionPlaceholder')}
                  addFromCatalogLabel={tPos('addFromCatalog')}
                  checkCompletenessLabel={tPos('checkCompleteness')}
                  // Rich product suggestions — thumbnail · code · «Доступно» badge ·
                  // sort toggle · «Ещё N» · «Создать новый товар» (mirror the certed
                  // purchase-returns/new + supplies/[id] actionbar).
                  onSearch={async (q) => {
                    const r = await api.get<{ items: ProductItem[]; total: number }>(
                      `/products?search=${encodeURIComponent(q)}&limit=20`,
                    );
                    return {
                      items: r.items.map((p) => ({
                        id: p.id,
                        primary: p.name,
                        code: p.code ?? undefined,
                        available: p.stock?.available != null ? Number(p.stock.available) : 0,
                        // Pick modal (owner 2026-07-18): reference «Цена» = the same
                        // default the row would get (buy price on purchase docs).
                        priceMinor: p.buyPrice ?? '0',
                        uomLabel: p.uom ?? undefined,
                        raw: p,
                      })),
                      total: r.total ?? r.items.length,
                    };
                  }}
                  sortAvailableLabel={tPos('sortByAvailable')}
                  moreItemsLabel={(n) => tPos('moreItems', { count: n })}
                  createProductLabel={(q) => tPos('createProductNamed', { query: q })}
                  onCreateProduct={(q) => setCreateProductName(q)}
                  // Owner 2026-07-27: product picks add DIRECTLY — no qty/price modal
                  // (moysklad's Приёмка add-line has none); the search box clears.
                  // Price defaults to the BUY price (owner 2026-08-23) — it is what
                  // «Сохранить цены» writes back and what the post turns into the
                  // batch's `costMinor`; seeding it from the retail tier overwrote
                  // the product's cost with its own sale price.
                  clearQueryOnPick
                  onPick={appendPositionFromCatalog}
                  // «Добавить из справочника» — opens the full catalog modal
                  // (was: appended an empty row; user 2026-07-14 bug report).
                  onAddFromCatalog={() => setCatalogAddOpen(true)}
                  onCheckCompleteness={() => {
                    if (!storeId) {
                      setError(t('select_store_first'));
                      return;
                    }
                    if (positions.length === 0) {
                      setError(t('add_position_first'));
                      return;
                    }
                    setError(null);
                  }}
                  importItems={[
                    {
                      label: tPos('import_file'),
                      onClick: () => importInputRef.current?.click(),
                    },
                  ]}
                />
                <input
                  ref={importInputRef}
                  type="file"
                  accept=".csv,.txt,text/csv,text/plain"
                  className="hidden"
                  onChange={handleImportFile}
                  data-test-id="supply-import-file"
                />
              </>
            }
          />

          {/* Bottom band — moysklad b-delivery-footer: left = «Комментарий»
              textarea (moysklad renders NO visible «Внешний код» input — only a
              hidden link in ground; the field stays state/payload-only); right =
              totals column with the «Накладные расходы» row INSIDE it, under
              «Кол-во» (G1: overhead-panel lives in totals-panel, help icon +
              inline input + «Распределить» + mode control). */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto]">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={tFields('description')}
              rows={3}
              data-test-id="field-description"
            />
            <div className="space-y-2">
              <DocumentTotalsPanel
                labels={totalsLabels}
                subtotalMinor={totals.net}
                vatMinor={totals.vat}
                totalMinor={totals.gross}
                currency={currency}
                vatEnabled={vatEnabled}
                onVatEnabledChange={setVatEnabled}
                vatIncluded={vatIncluded}
                onVatIncludedChange={setVatIncluded}
                quantity={totalQty > 0 ? totalQty : null}
              />
              <div
                className="flex items-center gap-2 border-[var(--ms-border-default)] border-t pt-2 text-[12px]"
                data-test-id="overhead-panel"
              >
                <span
                  className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--ms-bg-muted)] text-[10px] text-[var(--ms-text-muted)]"
                  title={tDetailForm('overhead_sum')}
                  aria-hidden
                >
                  ?
                </span>
                <span className="text-[var(--ms-text-primary)]">{tDetailForm('overhead_sum')}</span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={overheadMajor}
                  placeholder="0"
                  onChange={(e) => setOverheadMajor(e.target.value)}
                  className="h-7 w-24 text-right"
                  data-test-id="field-overhead-sum"
                />
                <span className="text-[var(--ms-text-primary)]">
                  {tDetailForm('overhead_distribute')}
                </span>
                <NativeSelect
                  value={overheadDistribution}
                  onChange={(e) =>
                    setOverheadDistribution(e.target.value as 'WEIGHT' | 'PRICE' | 'VOLUME')
                  }
                  data-test-id="field-overhead-distribution"
                  disabled={!(Number(overheadMajor) > 0)}
                  className="h-7 w-auto"
                >
                  {/* moysklad overhead.distribution enum = weight/volume/price only
                      (JSON API 1.2); the QUANTITY mode is not a moysklad option —
                      BE still accepts it for API parity, just not offered here. */}
                  <option value="WEIGHT">{tDetailForm('overhead_by_weight')}</option>
                  <option value="PRICE">{tDetailForm('overhead_by_price')}</option>
                  <option value="VOLUME">{tDetailForm('overhead_by_volume')}</option>
                </NativeSelect>
              </div>
            </div>
          </div>
        </div>
      ),
    },
    // moysklad-parity (live #supply/edit?new): «Связанные документы» on a NEW
    // receipt shows ONLY a «Привязать документ» button — clicking SAVES the
    // receipt first, then the relations diagram + real linking live on the saved
    // detail. Mirrors the certed purchase-orders/new (`11608ae1`).
    // moysklad old-design «Связанные документы» — the relations diagram + inline
    // «Привязать документ» (filter-table modal) + «Задача» + «Файл» (staged), all
    // IN PLACE (no save/navigation). Mirrors the certed sibling /new pages.
    {
      key: 'related',
      label: tDetailTabs('related'),
      content: (
        <NewDocRelatedTab
          current={{
            id: 'new',
            name: docNumber,
            moment: docDate ? new Date(docDate).toISOString() : new Date().toISOString(),
            sumMinor: String(totals.gross),
            state: applicable ? 'posted' : 'draft',
            kind: 'supply',
          }}
          entityType="Supply"
          staging={staging}
          linkDefaults={{
            agent: agentId ? { id: agentId, name: agentLabel } : undefined,
            organization: organizationId
              ? { id: organizationId, name: organizationLabel }
              : undefined,
            storeTo: storeId ? { id: storeId, name: storeLabel } : undefined,
          }}
        />
      ),
    },
    // «События» — HIDDEN on /new (moysklad old-design create form has no События
    // tab); code kept behind SHOW_NEW_EVENTS_TAB for later re-enabling.
    ...(SHOW_NEW_EVENTS_TAB
      ? [
          {
            key: 'events',
            label: tDetailTabs('events'),
            content: (
              <div className="space-y-3 bg-[var(--ms-bg-surface)] px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-[var(--ms-text-primary)] text-base">
                    {tDetailTabs('events_title')}
                  </span>
                  <Button type="button" variant="secondary" size="sm" disabled>
                    <Icons.visible className="h-4 w-4" />
                    {tDetailTabs('events_watch')}
                  </Button>
                </div>
                <Textarea
                  value=""
                  readOnly
                  disabled
                  rows={3}
                  placeholder={tDetailTabs('events_comment_placeholder')}
                />
                <div className="flex items-center gap-2">
                  <Button type="button" variant="primary" size="sm" disabled>
                    {tDetailTabs('events_post')}
                  </Button>
                  <Button type="button" variant="secondary" size="sm" disabled>
                    {tDetailTabs('events_cancel')}
                  </Button>
                </div>
              </div>
            ),
          },
        ]
      : []),
  ];

  // «Комплект…» bundle picker — the built-in «Приходная накладная» (id null) first,
  // then the account's own custom forms. Prints over the freshly-saved receipt.
  const kitForms: KitPrintForm[] = [
    { id: null, name: tPrintSupply('prixodnaya') },
    ...(printForms ?? []).map((f) => ({ id: f.id, name: f.name })),
  ];
  const kitPrint = (templateIds: Array<string | null>) => {
    if (templateIds.length === 0 || !printedSupplyId) return;
    // «Комплект…» opens the combined PDF in a new tab (moysklad «Открыть в браузере»),
    // not a save-to-disk download; then land on the saved receipt.
    void api
      .postOpenInBrowser('/supplies/kit-print', { ids: [printedSupplyId], templateIds })
      .then(() => router.push(`/supplies/${printedSupplyId}`));
  };

  return (
    <>
      <DocumentEditor
        {...docEditorLabels}
        testId="supply-new-page"
        documentTypeLabel={tDetailTitles('supply')}
        number={docNumber}
        onNumberChange={setDocNumber}
        date={docDate}
        onDateChange={setDocDate}
        status={statusId}
        statusOptions={statusOptions}
        onStatusChange={setStatusId}
        onConfigureStatuses={() => router.push('/settings/supply-statuses')}
        applicable={applicable}
        onApplicableChange={setApplicable}
        applicableHelp={t('applicable_help')}
        onSave={() => {
          // moysklad-style validation (owner 2026-07-11): mark the missing
          // FIELD red + short text under it, echo the same short message
          // under the toolbar — never a page-wide banner.
          if (!agentId) {
            setAgentInvalid(true);
            setError(tCommon('must_fill'));
            return;
          }
          setError(null);
          createMut.mutate();
        }}
        saving={createMut.isPending}
        // moysklad-parity dirty-close guard: «Сохранение изменений» (Да/Нет/Отмена)
        // instead of silently discarding the form (ground: the GWT save dialog in
        // 45-edit-default.html).
        onClose={() => {
          if (isDirty) setCloseConfirmOpen(true);
          else router.push('/supplies');
        }}
        // moysklad-parity: on a NEW «Приёмка» all four toolbar dropdowns OPEN and
        // list their items (were disabled/empty). A new doc has nothing to act on
        // yet, so every actionable item SAVES the receipt first, then lands on the
        // detail page where «Создать документ»/«Печать»/«Отправить» are fully wired.
        // Item sets ground-truthed live on #supply/edit?new (user screenshots,
        // 2026-07-07). «Удалить» is greyed on a new doc (nothing saved yet).
        modifyMenu={[
          { label: tBulk('delete'), disabled: true, destructive: true },
          {
            label: tBulk('copy'),
            onClick: () => {
              setError(null);
              createMut.mutate();
            },
          },
        ]}
        // «Создать документ» — moysklad Приёмка (7): Счёт поставщика · Счёт-фактура
        // полученный · Исходящий платёж · Расходный ордер · Возврат поставщику ·
        // Отгрузка · Перемещение.
        createDocMenu={[
          tDetailTitles('invoice_in'),
          tCreate('facture_in'),
          tDetailTitles('payment_out'),
          tDetailTitles('cash_out'),
          tDetailTitles('purchase_return'),
          tDetailTitles('demand'),
          tDetailTitles('move'),
        ].map((label) => ({
          label,
          onClick: () => {
            setError(null);
            createMut.mutate();
          },
        }))}
        // «Печать» — moysklad: the account's own custom «Приёмка» forms FIRST, then
        // the built-in «Приходная накладная», then «Комплект…» + «Настроить…» +
        // «Запросить форму». Each print saves the receipt first (it can't render
        // before it exists), then opens the chosen form in a new tab. Mirror PO/new.
        printMenu={[
          ...(printForms ?? []).map((f) => ({
            label: f.name,
            onClick: () => {
              printTargetRef.current = { kind: 'form' as const, templateId: f.id };
              afterSaveRef.current = 'print' as const;
              setError(null);
              createMut.mutate();
            },
          })),
          {
            // «Приходная накладная» — the standard built-in receipt form (HTML check).
            label: tPrintSupply('prixodnaya'),
            onClick: () => {
              printTargetRef.current = { kind: 'view' };
              afterSaveRef.current = 'print';
              setError(null);
              createMut.mutate();
            },
          },
          {
            // «Joylashtirish varag'i» — omborchi tovarni QAYSI javonga qo'yishini
            // ko'rsatadi. Boshqa bandlardan farqli: saqlash SHART EMAS, chunki
            // varaq hujjat emas — u joriy forma pozitsiyalaridan chiqadi
            // (customer-orders/new dagi o'rnatilgan namuna).
            label: tSheet('putaway_form'),
            onClick: () =>
              void openSheet({
                title: tSheet('sheet_title_putaway'),
                number: docNumber || '—',
                moment: docDate,
                agentName: agentLabel || null,
                ownerName: user?.name ?? null,
                description: description || null,
                rows: positions,
              }),
          },
          {
            // «Комплект…» — bundle several forms into one PDF over the saved receipt.
            label: tPrint('set'),
            onClick: () => {
              printTargetRef.current = { kind: 'kit' };
              afterSaveRef.current = 'print';
              setError(null);
              createMut.mutate();
            },
          },
          { divider: true, label: '' },
          {
            // «Настроить…» — open the print-template manager slide-over (no save).
            label: tPrint('configure'),
            onClick: () => openTemplates('supply'),
          },
          {
            label: tPrint('request_form'),
            onClick: () => {
              setError(null);
              createMut.mutate();
            },
          },
        ]}
        // «Отправить» — «Tovarlar ro'yxati (Excel)» (saqlab, agentga yuboradi) +
        // moysklad: Приходная накладная · Комплект…
        sendMenu={[
          {
            label: t('send_goods'),
            onClick: () => {
              afterSaveRef.current = 'send-goods';
              setError(null);
              createMut.mutate();
            },
          },
          ...[tPrintSupply('prixodnaya'), tPrint('set')].map((label) => ({
            label,
            onClick: () => {
              setError(null);
              createMut.mutate();
            },
          })),
        ]}
        // moysklad pins each configured custom print form as its OWN button right
        // after «Отправить». Each saves the receipt first, then renders that form's
        // PDF into a new tab. Mirror PO/new.
        trailingSlot={(printForms ?? []).map((f) => (
          <Button
            key={f.id}
            type="button"
            variant="secondary"
            size="sm"
            // «Past ko'k» — the check-print type buttons stand out in a soft blue
            // (brand-100 fill · brand-600 text · brand-300 border) vs the plain
            // white/grey toolbar buttons. Owner request 2026-07-15.
            className="border-[var(--ms-brand-300)] bg-[var(--ms-brand-100)] text-[var(--ms-brand-600)] hover:bg-[var(--ms-brand-200)] hover:text-[var(--ms-brand-700)]"
            onClick={() => {
              printTargetRef.current = { kind: 'form', templateId: f.id };
              afterSaveRef.current = 'print';
              setError(null);
              createMut.mutate();
            }}
            data-test-id={`toolbar-print-form-${f.id}`}
          >
            <Icons.print className="h-4 w-4" />
            {f.name}
          </Button>
        ))}
        // moysklad-parity: right side of toolbar = «Владелец» (owner/access) popover —
        // click «Файзуллоев Ф. / Основной» to set Сотрудник (employee) / Отдел
        // (department) / «Общий доступ» (shared). Saved on create.
        rightSlot={<OwnerAccessPopover value={ownerAccess} onChange={setOwnerAccess} />}
        noticeSlot={
          hasDuplicatePositions ? (
            <div
              className="flex items-center gap-2 px-4 pt-1 text-[var(--ms-text-primary)] text-sm"
              data-test-id="duplicate-positions-notice"
            >
              <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-[#5fa83d] text-[11px] text-white">
                ✓
              </span>
              <span>{tDetailForm('duplicate_positions')}</span>
            </div>
          ) : undefined
        }
        error={error}
        onErrorRetry={() => {
          setError(null);
          createMut.mutate();
        }}
      >
        {metaPanel}
        {/* moysklad new-design: «Файлы»/«Задачи»/«События» are TABS in the strip
            above (not disclosure panels below) — the 5-tab layout is fully inside
            <DocumentTabs>. */}
        <DocumentTabs tabs={tabs} defaultActiveKey="main" />
      </DocumentEditor>

      {/* moysklad «Сохранение изменений» — 3-action close guard (ground labels:
          «Данные были изменены. Сохранить изменения?» · Да / Нет / Отмена). */}
      <Modal
        open={closeConfirmOpen}
        onOpenChange={setCloseConfirmOpen}
        title={tUnsaved('title')}
        testId="save-changes-dialog"
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={createMut.isPending}
              onClick={() => {
                setCloseConfirmOpen(false);
                setError(null);
                createMut.mutate();
              }}
              data-test-id="save-changes-yes"
            >
              {tUnsaved('yes')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setCloseConfirmOpen(false);
                router.push('/supplies');
              }}
              data-test-id="save-changes-no"
            >
              {tUnsaved('no')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setCloseConfirmOpen(false)}
              data-test-id="save-changes-cancel"
            >
              {tUnsaved('cancel')}
            </Button>
          </>
        }
      >
        <div className="space-y-2 px-4 py-3 text-[13px] text-[var(--ms-text-primary)]">
          <p>{tUnsaved('changed')}</p>
          <p>{tUnsaved('question')}</p>
        </div>
      </Modal>

      <CatalogPicker
        open={openPicker === 'agent'}
        onClose={() => setOpenPicker(null)}
        title={tForm('supplier_picker_title')}
        fetcher={agentFetcher}
        onSelect={(item) => {
          // Picking an agent resolves the moysklad-style field error.
          setAgentInvalid(false);
          setError(null);
          setAgentId(item.id);
          setAgentLabel(String(item.primary));
        }}
        createLabel={tForm('create_new_counterparty')}
        onCreate={() => router.push('/counterparties/new')}
      />
      <CatalogPicker
        open={openPicker === 'org'}
        onClose={() => setOpenPicker(null)}
        title={tForm('organization_picker_title')}
        fetcher={orgFetcher}
        onSelect={(item) => {
          setOrganizationId(item.id);
          setOrganizationLabel(String(item.primary));
        }}
      />
      <CatalogPicker
        open={openPicker === 'store'}
        onClose={() => setOpenPicker(null)}
        title={tForm('store_picker_title')}
        fetcher={storeFetcher}
        onSelect={(item) => {
          setStoreId(item.id);
          setStoreLabel(String(item.primary));
        }}
      />
      <CatalogPicker
        open={openPicker === 'contract'}
        onClose={() => setOpenPicker(null)}
        title={tForm('contract_picker_title')}
        fetcher={contractFetcher}
        onSelect={(item) => {
          setContractId(item.id);
          setContractLabel(String(item.primary));
        }}
      />
      <CatalogPicker
        open={openPicker === 'project'}
        onClose={() => setOpenPicker(null)}
        title={tForm('project_picker_title')}
        fetcher={projectFetcher}
        onSelect={(item) => {
          setProjectId(item.id);
          setProjectLabel(String(item.primary));
        }}
      />
      <CatalogPicker
        open={openPicker === 'bankAccount'}
        onClose={() => setOpenPicker(null)}
        title={tForm('bank_account_picker_title')}
        fetcher={bankAccountFetcher}
        onSelect={(item) => {
          setBankAccountId(item.id);
          setBankAccountLabel(String(item.primary));
        }}
      />
      <CatalogPicker
        open={
          typeof openPicker === 'object' && openPicker !== null && openPicker.kind === 'product'
        }
        onClose={() => setOpenPicker(null)}
        title={tForm('product_picker_title')}
        fetcher={productFetcher}
        onSelect={(item) => {
          if (typeof openPicker !== 'object' || openPicker === null) return;
          const raw = (item as PickerItem & { raw?: ProductItem }).raw;
          // Tovardan keladigan HAMMA maydon yagona yordamchidan: ilgari bu yerda
          // atigi 5 tasi yangilanardi va eski tovarning qoldig'i, narx qavatlari
          // hamda YACHEYKASI qatorda qolib ketardi (2026-08-23 auditi).
          updatePosition(openPicker.rowUid, {
            ...replaceRowProductPatch(item as PickedProduct),
            priceMinor: purchaseLinePriceMinor(raw),
          });
        }}
      />
      {/* «Добавить из справочника» — every pick appends a FILLED position row
          (mirrors supplies/[id]); no qty/price modal, the row takes the page's
          own buy-price default. */}
      <CatalogPicker
        open={catalogAddOpen}
        onClose={() => setCatalogAddOpen(false)}
        title={tDetailForm('add_from_catalog')}
        fetcher={productFetcher}
        onSelect={(item) => {
          appendPositionFromCatalog(item);
        }}
      />
      <CatalogPicker
        open={
          typeof openPicker === 'object' && openPicker !== null && openPicker.kind === 'country'
        }
        onClose={() => setOpenPicker(null)}
        title={tFields('country')}
        fetcher={countryFetcher}
        onSelect={(item) => {
          if (typeof openPicker !== 'object' || openPicker === null) return;
          updatePosition(openPicker.rowUid, {
            countryId: item.id,
            countryLabel: String(item.primary),
          });
        }}
      />
      {currency !== 'UZS' && (
        <CurrencyRateModal
          open={rateModalOpen}
          onOpenChange={setRateModalOpen}
          currency={currency}
          referenceRate={adminRate ?? '1'}
          currentOverride={rateOverride}
          onApply={setRateOverride}
        />
      )}
      {/* «Печать ▸ Комплект…» — opens over the just-saved receipt to bundle forms. */}
      <KitPrintModal
        open={kitPrintOpen}
        onOpenChange={(o) => {
          setKitPrintOpen(o);
          if (!o && printedSupplyId) router.push(`/supplies/${printedSupplyId}`);
        }}
        forms={kitForms}
        selectedCount={1}
        labels={{
          title: tPrint('set'),
          confirm: tPrint('kit_confirm'),
          cancel: tPrint('kit_cancel'),
        }}
        onConfirm={kitPrint}
      />
      {editProductId && (
        <ProductEditModal productId={editProductId} open onClose={() => setEditProductId(null)} />
      )}
      {createProductName !== null && (
        <ProductCreateModal
          open
          initialName={createProductName}
          onClose={() => setCreateProductName(null)}
          // The modal hands over the whole created product, so the row is built
          // right here — no second request that could fail silently and leave
          // the user re-creating the product (2026-08-23 audit).
          onCreated={(created) => {
            setPositions((ps) => [
              ...ps,
              {
                id: uid(),
                assortmentId: created.id,
                productLabel: created.name,
                productUom: created.uom ?? null,
                quantity: '1',
                priceMinor: purchaseLinePriceMinor(created),
                discount: '0',
                vat: created.vat != null ? String(created.vat) : '12',
                vatEnabled: true,
                salePrices: created.salePrices ?? null,
              },
            ]);
          }}
        />
      )}
      {sheet && <ReceiptPrintPortal data={sheet} onClose={closeSheet} />}
    </>
  );
}
