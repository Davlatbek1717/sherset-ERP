'use client';

/**
 * /invoices-out/new — moysklad-parity «Счёт покупателю» editor.
 *
 * Rebuilt 2026-06-26 onto the PO/invoice-in/new document-editor shell so the create
 * form is 1:1 with live moysklad (ground: docs/audits/invoices-out-new-2026-06-26 —
 * `ms-invoiceout-editor-ground.mjs`, screen `moysklad/40-new-editor-full.png`):
 * INLINE type-to-search ref fields (NOT modals), metaPanel ABOVE the tabs, owner
 * popover top-right, «Баланс» under Контрагент, rich position columns (Цена▾ ·
 * Наименование▾ · Сумма⚙), DatePicker (dd.mm.yyyy), and the «Связанные документы»
 * relations tab. Sales-doc specifics vs the supplier invoice: line price = SALE
 * price (NOT buyPrice), «Канал продаж» meta field, NO «Входящий номер». moysklad
 * defaults «Проведено» CHECKED (→ the BE posts on create) and «Цена включает НДС»
 * CHECKED — both grounded via clips-state.json. No «Счёт контрагента»/«Внешний код»
 * (absent in moysklad's sales-invoice editor).
 */

import { CounterpartyBalanceInline } from '@/components/counterparty-balance-inline';
import { CurrencyRateModal } from '@/components/document-detail/currency-rate-modal';
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
import { useDocumentEditorLabels } from '@/hooks/use-document-editor-labels';
import { useTotalsLabels } from '@/hooks/use-totals-labels';
import { useUnsavedGuard } from '@/hooks/use-unsaved-guard';
import { defaultDocStore, useUserDefaults } from '@/hooks/use-user-defaults';
import { api } from '@/lib/api-client';
import { computeLineTotalSafe } from '@/lib/doc-totals';
import { distributeAgreementDelta } from '@/lib/position-agreement';
import { resolveDefaultSalePriceOrZero, useCurrencyRates, usePriceTypeIds } from '@/lib/sale-price';
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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
  // A sales invoice prices each line at the SALE price (the default price type),
  // NOT buyPrice. Read salePrices and resolve via resolveDefaultSalePriceOrZero.
  salePrices: Array<{ priceTypeId: string; value: string }> | null;
  vat: number | null;
  stock?: { onHand: string; reserved: string; inTransit: string; available: string } | null;
  productFolder?: { id: string; name: string; pathName: string } | null;
}

interface NewPositionRow extends DocPositionRow {
  assortmentId: string | null;
  salePrices?: Array<{ priceTypeId: string; value: string }> | null;
  folderPath?: string;
}

function uid(): string {
  return Math.random().toString(36).slice(2);
}

// «События» on the CREATE form — hidden 2026-07-09 (moysklad's old-design /new has
// no События tab). Flip to true to re-enable; the tab's code is kept below.
const SHOW_NEW_EVENTS_TAB = false;

// moysklad «Счёт покупателю» optional position columns (toggle via the «Сумма ⚙»
// gear). Live-grounded default for the sales invoice (2026-06-26): Доступно ON,
// Единица ON; Изображение · Отгружено · Остаток · Резерв · Ожидание · Вес · Объём ·
// Сумма НДС OFF. `shipped` is moysklad's «Отгружено» on sales docs.
const OPTIONAL_POSITION_COLUMNS: { key: PositionColumnKey; labelKey: string; on: boolean }[] = [
  { key: 'image', labelKey: 'image', on: false },
  { key: 'unit', labelKey: 'unit', on: true },
  { key: 'shipped', labelKey: 'shipped', on: false },
  { key: 'available', labelKey: 'available', on: true },
  { key: 'stock', labelKey: 'stock', on: false },
  { key: 'reserve', labelKey: 'reserve', on: false },
  { key: 'waiting', labelKey: 'waiting', on: false },
  { key: 'weight', labelKey: 'weight', on: false },
  { key: 'volume', labelKey: 'volume', on: false },
  { key: 'vatAmount', labelKey: 'vatAmount', on: false },
];
const DEFAULT_COL_VISIBLE: Record<string, boolean> = Object.fromEntries(
  OPTIONAL_POSITION_COLUMNS.map((c) => [c.key, c.on]),
);

export default function NewInvoiceOutPage() {
  const router = useRouter();
  const t = useTranslations('pages.invoices_out');
  const totalsLabels = useTotalsLabels();
  const tFields = useTranslations('fields');
  const tForm = useTranslations('form');
  const tDetailForm = useTranslations('detail_form');
  const tDetailTabs = useTranslations('detail_tabs');
  const tDetailTitles = useTranslations('detail_titles');
  const tPos = useTranslations('position_editor');
  const { toast } = useToast();
  const tCols = useTranslations('position_cols');
  const tCommon = useTranslations('common');
  const tUnsaved = useTranslations('unsaved_dialog');
  const docEditorLabels = useDocumentEditorLabels();

  // «Статус» — the account's own invoice-out statuses (State rows,
  // entityType="invoiceout"), NOT the FSM draft/posted state (data-origin
  // bug-class). moysklad shows a grey «Статус» pill until the admin defines
  // some via «Настроить...» → /settings/invoice-out-statuses. Sent as statusId
  // on create (mirror supplies/new).
  const { data: statusData } = useQuery<{
    items: Array<{ id: string; name: string; color: string | null }>;
  }>({
    queryKey: ['states', 'invoiceout'],
    queryFn: () => api.get('/states?entityType=invoiceout'),
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
  const { priceTypes, defaultId: defaultPriceTypeId } = usePriceTypeIds();
  // Valyuta kurslari — valyutali salePrices'ni baza valyutasiga o'girish uchun.
  const rates = useCurrencyRates();

  // Header state
  const [docNumber, setDocNumber] = useState('');
  const [docDate, setDocDate] = useState(() => {
    const d = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  // «Проведено» — moysklad defaults the sales-invoice create form to CHECKED
  // (grounded clips-state.json). The BE posts on create when this is true.
  const [applicable, setApplicable] = useState(true);

  // Meta state
  const [agentId, setAgentId] = useState<string | null>(null);
  const [agentLabel, setAgentLabel] = useState('');
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [organizationLabel, setOrganizationLabel] = useState('');
  const [storeId, setStoreId] = useState<string | null>(null);
  const [storeLabel, setStoreLabel] = useState('');
  const [contractId, setContractId] = useState<string | null>(null);
  const [contractLabel, setContractLabel] = useState('');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectLabel, setProjectLabel] = useState('');
  const [salesChannelId, setSalesChannelId] = useState<string | null>(null);
  const [salesChannelLabel, setSalesChannelLabel] = useState('');
  // Org settlement account («Сум») — a sub-row UNDER Организация, scoped to the
  // chosen org + currency. Cleared when the org changes.
  const [orgAccountId, setOrgAccountId] = useState<string | null>(null);
  const [orgAccountLabel, setOrgAccountLabel] = useState('');
  const [paymentPlannedDate, setPaymentPlannedDate] = useState('');
  const [currency, setCurrency] = useState<string>('UZS');
  const [rateOverride, setRateOverride] = useState<string | null>(null);
  const [rateModalOpen, setRateModalOpen] = useState(false);
  const [description, setDescription] = useState('');

  // VAT toggles (totals panel). moysklad defaults BOTH checked for sales invoices
  // (grounded clips-state.json: «НДС» + «Цена включает НДС»).
  const [vatEnabled, setVatEnabled] = useState(true);
  const [vatIncluded, setVatIncluded] = useState(true);

  // «Владелец» (owner/access) — defaults to the current user; department + «Общий
  // доступ» editable via the header popover. Sent on create (BE tenant-validates).
  const [ownerAccess, setOwnerAccess] = useState<OwnerAccessValue>(() => ({
    ownerId: null,
    ownerLabel: '',
    groupId: null,
    groupLabel: '',
    shared: false,
  }));

  // Positions
  const [positions, setPositions] = useState<NewPositionRow[]>([]);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
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
  const [colVisible, setColVisible] = useState<Record<string, boolean>>(DEFAULT_COL_VISIBLE);
  const [withGroups, setWithGroups] = useState(false);

  // Dirty-close guard — baseline snapshot is taken on the render AFTER the
  // user-defaults prefill settles (so auto-filled org/store/agent don't count
  // as user edits); any later change to the tracked state marks the form dirty
  // (mirror supplies/new).
  const [baselineReady, setBaselineReady] = useState(false);
  const [baselineSnap, setBaselineSnap] = useState<string | null>(null);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);

  // Pickers (the chevron «browse from catalogue» secondary path) + error.
  const [openPicker, setOpenPicker] = useState<
    | null
    | 'agent'
    | 'org'
    | 'store'
    | 'contract'
    | 'project'
    | 'salesChannel'
    | 'orgAccount'
    | { kind: 'product'; rowUid: string }
  >(null);
  // «Добавить из справочника» — the product catalog modal that APPENDS a
  // position (it used to append an EMPTY row; audit 2026-08-23, the same
  // bug-class the user reported on internal-orders/new 2026-07-14).
  const [catalogAddOpen, setCatalogAddOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // «Курс валюты документа» — the rate is the account's currency-справочник rate
  // (Настройки → Валюты), the SAME admin-set value moysklad books documents at —
  // NOT a live CB feed (that drifts e.g. 11 990 vs 12 200, storing USD docs at the
  // wrong base value). One source of truth → GET /currencies.
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

  // Pre-fill from the user's «Значения по умолчанию» (defaultCompany / defaultStore /
  // defaultCustomer / defaultProject), falling back to the first reference item for
  // Организация / Склад (a SALES doc → defaultCustomer for Контрагент).
  const userDefaults = useUserDefaults();
  const defaultsAppliedRef = useRef(false);
  const afterSaveRef = useRef<'view'>('view');
  const draftSaveRef = useRef(false);
  // moysklad marks a required-but-empty «Контрагент» RED on «Сохранить» (owner
  // 2026-07-11): field border red + «Поле должно быть заполнено» under it, the
  // toolbar error echoes the SAME short text (mirror purchase-orders/new).
  const [agentInvalid, setAgentInvalid] = useState(false);
  // «Связанные документы» tab — staged links / tasks / files (moysklad's create
  // form works fully in place; everything persists in flush() right after save).
  const staging = useNewDocStaging({ entityType: 'InvoiceOut', route: 'invoices-out' });
  useEffect(() => {
    if (defaultsAppliedRef.current) return;
    if (!orgsData || !storesData || userDefaults.isLoading) return;
    defaultsAppliedRef.current = true;
    const us = userDefaults.data;
    if (!organizationId) {
      const org = us?.defaultCompany ?? orgsData.items[0];
      if (org) {
        setOrganizationId(org.id);
        setOrganizationLabel(org.name);
      }
    }
    if (!storeId) {
      const store = defaultDocStore(us, storesData.items);
      if (store) {
        setStoreId(store.id);
        setStoreLabel(store.name);
      }
    }
    if (!agentId && us?.defaultCustomer) {
      setAgentId(us.defaultCustomer.id);
      setAgentLabel(us.defaultCustomer.name);
    }
    if (!projectId && us?.defaultProject) {
      setProjectId(us.defaultProject.id);
      setProjectLabel(us.defaultProject.name);
    }
    // Defaults settled → arm the dirty-close baseline on the NEXT render.
    setBaselineReady(true);
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

  // moysklad parity: choosing (or changing) the organization auto-fills its default
  // account for the document currency — the «Сум» sub-line under Организация.
  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    void (async () => {
      const d = await api.get<{
        items: Array<{ id: string; name: string; accountNumber: string | null; currency: string }>;
      }>(`/bank-accounts?organizationId=${organizationId}`);
      if (cancelled) return;
      const acct = d.items.find((a) => a.currency === currency) ?? d.items[0];
      setOrgAccountId(acct?.id ?? null);
      setOrgAccountLabel(acct ? acct.name || acct.accountNumber || acct.currency : '');
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId, currency]);

  // Dirty-close guard — JSON snapshot of everything the user can edit; compared
  // against the post-prefill baseline (mirror supplies/new). `orgAccountId` and
  // `ownerAccess` are EXCLUDED: both are auto-derived defaults (orgAccountId is
  // set by an async /bank-accounts fetch AFTER the baseline is captured — including
  // it would flip a pristine form to «dirty» with zero user input; supplies/new
  // omits its bankAccountId for exactly this reason — adversarial-review finding).
  const dirtySnap = JSON.stringify({
    docNumber,
    docDate,
    statusId,
    applicable,
    agentId,
    organizationId,
    storeId,
    contractId,
    projectId,
    salesChannelId,
    paymentPlannedDate,
    currency,
    rateOverride,
    description,
    vatEnabled,
    vatIncluded,
    stagedFileCount: staging.files.length,
    stagedLinkCount: staging.links.length,
    stagedTaskCount: staging.tasks.length,
    positions: positions.map((p) => [
      p.assortmentId,
      p.quantity,
      p.priceMinor,
      p.discount,
      p.vat,
      p.vatEnabled,
    ]),
  });
  useEffect(() => {
    if (baselineReady && baselineSnap === null) setBaselineSnap(dirtySnap);
  }, [baselineReady, baselineSnap, dirtySnap]);
  const isDirty = baselineSnap !== null && dirtySnap !== baselineSnap;
  // Also arms the router-level UnsavedNavGuard (browser back / nav away).
  useUnsavedGuard(isDirty);

  /** Append ONE catalog hit as a position. Shared by the inline typeahead
   *  (which passes the qty/price modal's `entry`) and «Добавить из
   *  справочника» (no `entry` — the line falls back to the product's default
   *  sale price). Returns the new row id so the inline bar can hand focus to
   *  its «Кол-во» cell (owner 2026-07-18 modal → table entry chain). */
  const appendPositionFromCatalog = (
    item: PickerItem & { raw?: unknown },
    entry?: { quantity: string; priceMinor: string; permanent?: boolean },
  ): string => {
    if (entry?.permanent) {
      // «Doimiy narx» — persist to the product card (owner 2026-07-17).
      api
        .post(`/products/${item.id}/sale-price`, { priceMinor: entry.priceMinor })
        .then(() => toast.success(tPos('pick_modal_price_saved')))
        .catch(() => toast.error(tPos('pick_modal_price_save_failed')));
    }
    const raw = item.raw as ProductItem | undefined;
    const newId = uid();
    setPositions((ps) => [
      ...ps,
      {
        id: newId,
        assortmentId: item.id,
        productLabel: String(item.primary),
        productCode: raw?.code ?? undefined,
        productUom: raw?.uom ?? null,
        quantity: entry?.quantity ?? '1',
        priceMinor:
          entry?.priceMinor ??
          resolveDefaultSalePriceOrZero(raw?.salePrices, defaultPriceTypeId, rates),
        discount: '0',
        vat: raw?.vat != null ? String(raw.vat) : '12',
        vatEnabled: true,
        available: raw?.stock?.available,
        stock: raw?.stock?.onHand,
        reserve: raw?.stock?.reserved,
        waiting: raw?.stock?.inTransit,
        salePrices: raw?.salePrices ?? null,
        folderPath: raw?.productFolder?.pathName ?? undefined,
      },
    ]);
    return newId;
  };
  const updatePosition = (id: string, patch: Partial<NewPositionRow>) => {
    setPositions((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };
  const removePosition = (id: string) => {
    setPositions((ps) => ps.filter((p) => p.id !== id));
  };

  // «Цена ▾» → «Расценить» (re-price every row from a price type's carried value).
  const repricePositions = useCallback((priceTypeId: string) => {
    setPositions((ps) =>
      ps.map((p) => {
        const sp = p.salePrices?.find((x) => x.priceTypeId === priceTypeId);
        return sp ? { ...p, priceMinor: sp.value } : p;
      }),
    );
  }, []);
  // «Цена ▾» → «Сохранить цены» — on a SALES doc the line price is the SALE price,
  // so save to the product's salePrices under the DEFAULT price type (preserving the
  // other tiers + their currency). Fetch for the lock version, PATCH.
  const saveProductPrices = useCallback(async () => {
    if (!defaultPriceTypeId) return;
    const seen = new Set<string>();
    for (const p of positions) {
      if (!p.assortmentId || seen.has(p.assortmentId)) continue;
      seen.add(p.assortmentId);
      try {
        const prod = await api.get<{
          version: number;
          salePrices: Array<{ priceTypeId: string; value: string; currencyCode?: string }> | null;
        }>(`/products/${p.assortmentId}`);
        const existing = prod.salePrices ?? [];
        const merged = existing.some((sp) => sp.priceTypeId === defaultPriceTypeId)
          ? existing.map((sp) =>
              sp.priceTypeId === defaultPriceTypeId ? { ...sp, value: p.priceMinor } : sp,
            )
          : [...existing, { priceTypeId: defaultPriceTypeId, value: p.priceMinor }];
        await api.patch(`/products/${p.assortmentId}`, {
          version: prod.version,
          salePrices: merged,
        });
      } catch {
        // skip products that can't be updated (e.g. concurrent edit); others proceed
      }
    }
  }, [positions, defaultPriceTypeId]);
  // «Скидка ▾» → «Скидка/наценка» — a discount % sets each line's `discount`; a markup
  // % raises the unit price. Targets the selected rows, or ALL rows when none selected.
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

  const totals = useMemo(
    () =>
      positions.reduce(
        (acc, p) => {
          const lt = computeLineTotalSafe(p, vatIncluded);
          return { net: acc.net + lt.net, vat: acc.vat + lt.vat, gross: acc.gross + lt.gross };
        },
        { net: 0n, vat: 0n, gross: 0n },
      ),
    [positions, vatIncluded],
  );

  // moysklad green-check notice — «Позиции документа содержат повторяющиеся товары»
  // when the same product is on more than one line.
  const hasDuplicatePositions = useMemo(() => {
    const seen = new Set<string>();
    for (const p of positions) {
      if (!p.assortmentId) continue;
      if (seen.has(p.assortmentId)) return true;
      seen.add(p.assortmentId);
    }
    return false;
  }, [positions]);

  // Position columns, built dynamically from the customizer (mirror PO/invoice-in).
  const positionColumns = useMemo<PositionTableColumnConfig[]>(() => {
    const cols: PositionTableColumnConfig[] = [{ key: 'dragarea' }, { key: 'select' }];
    if (colVisible.image) cols.push({ key: 'image' });
    cols.push({ key: 'name', label: tCols('name') });
    cols.push({ key: 'quantity', label: tPos('quantity') });
    if (colVisible.unit) cols.push({ key: 'unit', label: tCols('unit') });
    if (colVisible.shipped) cols.push({ key: 'shipped', label: tCols('shipped') });
    if (colVisible.stock) cols.push({ key: 'stock', label: tCols('stock') });
    if (colVisible.reserve) cols.push({ key: 'reserve', label: tCols('reserve') });
    if (colVisible.available) cols.push({ key: 'available', label: tCols('available') });
    if (colVisible.waiting) cols.push({ key: 'waiting', label: tCols('waiting') });
    cols.push({
      key: 'price',
      label: (
        <PositionPriceMenu
          label={tCols('price')}
          repriceLabel={tCols('reprice')}
          saveLabel={tCols('savePrices')}
          priceTypes={priceTypes.map((pt) => ({ id: pt.id, name: pt.name }))}
          onReprice={repricePositions}
          onSavePrices={saveProductPrices}
        />
      ),
    });
    if (vatEnabled) {
      cols.push({ key: 'vat', label: tCols('vat') });
      if (colVisible.vatAmount) cols.push({ key: 'vatAmount', label: tCols('vatAmount') });
    }
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
    cols.push(
      {
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
      },
      { key: 'menu' },
    );
    return cols;
  }, [
    colVisible,
    vatEnabled,
    tCols,
    tPos,
    priceTypes,
    repricePositions,
    saveProductPrices,
    applyDiscountMarkup,
    selectedRowIds,
  ]);

  const createMut = useMutation({
    mutationFn: async () => {
      if (!agentId) throw new Error(tForm('select_customer'));
      if (!organizationId) throw new Error(tForm('select_organization'));
      // Owner 2026-07-08: «Проведено» has NO position precondition — an empty document may be saved/posted (BE allows it: 0 positions ⇒ 0 stock delta).
      for (const [i, p] of positions.entries()) {
        if (!p.assortmentId) throw new Error(tForm('position_select_product', { n: i + 1 }));
        if (Number(p.quantity) <= 0)
          throw new Error(tForm('position_quantity_positive', { n: i + 1 }));
      }
      const payload = {
        agentId,
        organizationId,
        ...(storeId ? { storeId } : {}),
        ...(orgAccountId ? { organizationAccountId: orgAccountId } : {}),
        ...(ownerAccess.ownerId ? { ownerId: ownerAccess.ownerId } : {}),
        ...(ownerAccess.groupId ? { groupId: ownerAccess.groupId } : {}),
        ...(ownerAccess.shared ? { shared: true } : {}),
        ...(contractId ? { contractId } : {}),
        ...(projectId ? { projectId } : {}),
        ...(salesChannelId ? { salesChannelId } : {}),
        // «Статус» — the picked account custom status (BE tenant-validates).
        ...(statusId ? { statusId } : {}),
        ...(docNumber ? { name: docNumber } : {}),
        ...(paymentPlannedDate ? { paymentPlannedMoment: paymentPlannedDate } : {}),
        moment: docDate ? new Date(docDate).toISOString() : undefined,
        // «⊕ Задача» draft: force applicable=false so an empty invoice persists as a draft.
        applicable: draftSaveRef.current ? false : applicable,
        currency,
        rateValue:
          currency === 'UZS'
            ? '100000000'
            : BigInt(Math.round(Number(effectiveRate) * 100000000)).toString(),
        description: description || undefined,
        vatEnabled,
        vatIncluded,
        positions: positions.map((p) => ({
          assortmentKind: 'product' as const,
          // biome-ignore lint/style/noNonNullAssertion: validated non-null in the loop above before payload build
          assortmentId: p.assortmentId!,
          quantity: p.quantity,
          priceMinor: p.priceMinor,
          discount: p.discount || '0',
          vat: p.vat ? Number(p.vat) : undefined,
          vatEnabled: p.vatEnabled,
        })),
      };
      return api.post<{ id: string }>('/invoices-out', payload);
    },
    onSuccess: async (created) => {
      afterSaveRef.current = 'view';
      draftSaveRef.current = false;
      // Staged files / links / tasks (the related tab works in place before save) —
      // persist them all onto the freshly-created invoice.
      await staging.flush(created.id);
      router.push(`/invoices-out/${created.id}`);
    },
    onError: (err: Error) => {
      afterSaveRef.current = 'view';
      draftSaveRef.current = false;
      setError(err.message);
    },
  });

  // Inline type-to-search fetchers — moysklad parity (click → anchored dropdown).
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
    if (!agentId) return [];
    const d = await api.get<{ items: RefItem[] }>(
      `/contracts?counterpartyId=${agentId}&search=${encodeURIComponent(s)}`,
    );
    return d.items.map((c) => ({ id: c.id, primary: c.name }));
  };
  const projectFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: RefItem[] }>(`/projects?search=${encodeURIComponent(s)}`);
    return d.items.map((p) => ({ id: p.id, primary: p.name }));
  };
  const salesChannelFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: RefItem[] }>(
      `/sales-channels?search=${encodeURIComponent(s)}&limit=50`,
    );
    return d.items.map((c) => ({ id: c.id, primary: c.name }));
  };
  const orgAccountFetcher = async (s: string): Promise<PickerItem[]> => {
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
        imageUrl={p.imageUrl}
        code={p.productCode}
        label={p.productLabel}
        placeholder={tForm('select_product')}
        onPick={() => setOpenPicker({ kind: 'product', rowUid: p.id })}
        productHref={href}
        onNavigate={href ? () => router.push(href) : undefined}
        testId={`pos-${p.id}-name`}
      />
    );
  };

  // moysklad b-operation-form-top — a ROW-PAIRED table: each row aligns the LEFT field
  // with its RIGHT counterpart (Организация↔Склад · Контрагент↔Договор · План.дата↔Проект).
  // The org's «Сум» account is a subRow UNDER Организация. «Канал продаж» + «Валюта» are
  // LEFT-only rows (no right counterpart — matches the live capture).
  const metaPanel = (
    <div className="max-w-[860px] space-y-2 bg-[var(--ms-bg-surface)] px-4 py-3">
      <DocumentMetaRow fixedWidth>
        <DocumentMetaField
          label={tFields('organization')}
          required
          subRow={
            organizationId ? (
              <CatalogPickerField
                value={orgAccountId ? { id: orgAccountId, label: orgAccountLabel } : null}
                placeholder=""
                testId="field-organization-account"
                onPick={() => setOpenPicker('orgAccount')}
                inlineFetcher={orgAccountFetcher}
                onInlineSelect={(item) => {
                  setOrgAccountId(item.id);
                  setOrgAccountLabel(String(item.primary));
                }}
                onClear={() => {
                  setOrgAccountId(null);
                  setOrgAccountLabel('');
                }}
              />
            ) : undefined
          }
        >
          <CatalogPickerField
            value={organizationId ? { id: organizationId, label: organizationLabel } : null}
            placeholder=""
            testId="field-organization"
            onPick={() => setOpenPicker('org')}
            inlineFetcher={orgFetcher}
            onInlineSelect={(item) => {
              setOrganizationId(item.id);
              setOrganizationLabel(String(item.primary));
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
              setOrgAccountId(null);
              setOrgAccountLabel('');
            }}
          />
        </DocumentMetaField>
        <DocumentMetaField label={tFields('store')}>
          <CatalogPickerField
            value={storeId ? { id: storeId, label: storeLabel } : null}
            placeholder=""
            testId="field-store"
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
            placeholder=""
            testId="field-agent"
            invalid={agentInvalid}
            onPick={() => setOpenPicker('agent')}
            inlineFetcher={agentFetcher}
            onInlineSelect={(item) => {
              setAgentId(item.id);
              setAgentLabel(String(item.primary));
              // Picking an agent resolves the moysklad-style field error.
              setAgentInvalid(false);
              setError(null);
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
            placeholder=""
            testId="field-contract"
            onPick={() => agentId && setOpenPicker('contract')}
            inlineFetcher={contractFetcher}
            onInlineSelect={(item) => {
              setContractId(item.id);
              setContractLabel(String(item.primary));
            }}
            disabled={!agentId}
            disabledHint={tForm('select_customer_first')}
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
        {/* moysklad invoice-out = «План. дата оплаты» (payment plan), dd.mm.yyyy. */}
        <DocumentMetaField label={tFields('payment_planned')}>
          <DatePicker
            value={paymentPlannedDate || null}
            onChange={(d) => setPaymentPlannedDate(d ?? '')}
            locale="ru-RU"
            testId="field-payment-planned"
          />
        </DocumentMetaField>
        <DocumentMetaField label={tFields('project')}>
          <CatalogPickerField
            value={projectId ? { id: projectId, label: projectLabel } : null}
            placeholder=""
            testId="field-project"
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
      </DocumentMetaRow>

      {/* «Канал продаж» — left-only row (no right counterpart in the live capture). */}
      <DocumentMetaRow fixedWidth>
        <DocumentMetaField label={tFields('sales_channel')}>
          <CatalogPickerField
            value={salesChannelId ? { id: salesChannelId, label: salesChannelLabel } : null}
            placeholder=""
            testId="field-sales-channel"
            onPick={() => setOpenPicker('salesChannel')}
            inlineFetcher={salesChannelFetcher}
            onInlineSelect={(item) => {
              setSalesChannelId(item.id);
              setSalesChannelLabel(String(item.primary));
            }}
            onClear={() => {
              setSalesChannelId(null);
              setSalesChannelLabel('');
            }}
          />
        </DocumentMetaField>
      </DocumentMetaRow>

      {/* moysklad: [валюта ▾] ✎ 1 USD = N UZS ✎ — rate INLINE (same row), with a ✎ to
          override the rate for this document. */}
      <DocumentMetaRow>
        <DocumentMetaField label={tDetailForm('currency')} required>
          <div className="flex items-center gap-1">
            <div className="w-[180px] shrink-0">
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
            </div>
            <button
              type="button"
              onClick={() => window.open('/settings/currencies', '_blank', 'noopener,noreferrer')}
              className="shrink-0 px-1 text-[var(--ms-text-muted)] text-sm hover:text-[var(--ms-text-primary)]"
              aria-label={tCommon('edit')}
              data-test-id="currency-settings"
            >
              ✎
            </button>
            {currency !== 'UZS' && (
              <span className="ml-1 inline-flex items-center gap-1 text-[var(--ms-text-muted)] text-[12px] tabular-nums">
                <span>
                  1 {currency} ={' '}
                  {Number(effectiveRate).toLocaleString('ru-RU', { maximumFractionDigits: 4 })} UZS
                </span>
                <button
                  type="button"
                  onClick={() => setRateModalOpen(true)}
                  className="px-0.5 text-[var(--ms-text-brand)] hover:opacity-80"
                  aria-label={tForm('rate_edit')}
                  data-test-id="rate-edit"
                >
                  ✎
                </button>
              </span>
            )}
          </div>
        </DocumentMetaField>
      </DocumentMetaRow>
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
    </div>
  );

  const tabs = [
    {
      key: 'main',
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
            emptyText=""
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
            onSortPositions={(by) =>
              setPositions((ps) => {
                const key = (p: NewPositionRow) =>
                  by === 'name' ? (p.productLabel ?? '') : (p.productCode ?? '');
                return [...ps].sort((a, b) => {
                  if (withGroups) {
                    const g = (a.folderPath ?? '').localeCompare(b.folderPath ?? '', 'ru');
                    if (g !== 0) return g;
                  }
                  return key(a).localeCompare(key(b), 'ru');
                });
              })
            }
            sortByNameLabel={tPos('sort_by_name')}
            sortByCodeLabel={tPos('sort_by_code')}
            withGroups={withGroups}
            onWithGroupsChange={setWithGroups}
            withGroupsLabel={tPos('sort_with_groups')}
            renderNameCell={renderPositionNameCell}
            // moysklad row ⋮ «Заменить» — swap the line's product (the name is now a
            // card link, so swapping moves here). Opens the per-row product picker.
            onReplace={(id) => setOpenPicker({ kind: 'product', rowUid: id })}
            vatIncluded={vatIncluded}
            selectedIds={selectedRowIds}
            onSelectionChange={setSelectedRowIds}
            footerToolbar={
              <PositionInlineAdd
                placeholder={tPos('addPositionPlaceholder')}
                addFromCatalogLabel={tPos('addFromCatalog')}
                checkCompletenessLabel={tPos('checkCompleteness')}
                importCsvLabel={tPos('importCsv')}
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
                      priceMinor: resolveDefaultSalePriceOrZero(
                        p.salePrices,
                        defaultPriceTypeId,
                        rates,
                      ),
                      uomLabel: p.uom ?? undefined,
                      raw: p,
                    })),
                    total: r.total ?? r.items.length,
                  };
                }}
                sortAvailableLabel={tPos('sortByAvailable')}
                moreItemsLabel={(n) => tPos('moreItems', { count: n })}
                createProductLabel={(qq) => tPos('createProductNamed', { query: qq })}
                onCreateProduct={() => router.push('/products/new')}
                pickModal={{
                  currency,
                  labels: {
                    stock: tPos('pick_modal_stock'),
                    price: tPos('pick_modal_price'),
                    quantity: tPos('pick_modal_quantity'),
                    salePrice: tPos('pick_modal_sale_price'),
                    priceThisSale: tPos('pick_modal_price_this_sale'),
                    pricePermanent: tPos('pick_modal_price_permanent'),
                    save: tPos('pick_modal_save'),
                    cancel: tPos('pick_modal_cancel'),
                  },
                }}
                onPick={appendPositionFromCatalog}
                // «Добавить из справочника» — the full catalog modal (was:
                // appended an EMPTY row; audit 2026-08-23).
                onAddFromCatalog={() => setCatalogAddOpen(true)}
                onCheckCompleteness={() => {
                  if (positions.length === 0) {
                    setError(t('add_position_first'));
                    return;
                  }
                  setError(null);
                }}
                onImportPositions={(rows) => {
                  setPositions((ps) => [
                    ...ps,
                    ...rows.map(({ item, quantity }) => {
                      const raw = item.raw as ProductItem | undefined;
                      return {
                        id: uid(),
                        assortmentId: item.id,
                        productLabel: item.primary,
                        productCode: raw?.code ?? undefined,
                        productUom: raw?.uom ?? null,
                        quantity: Number(quantity) > 0 ? quantity : '1',
                        priceMinor: resolveDefaultSalePriceOrZero(
                          raw?.salePrices,
                          defaultPriceTypeId,
                          rates,
                        ),
                        discount: '0',
                        vat: raw?.vat != null ? String(raw.vat) : '12',
                        vatEnabled: true,
                        available: raw?.stock?.available,
                        stock: raw?.stock?.onHand,
                        reserve: raw?.stock?.reserved,
                        waiting: raw?.stock?.inTransit,
                        salePrices: raw?.salePrices ?? null,
                        folderPath: raw?.productFolder?.pathName ?? undefined,
                      };
                    }),
                  ]);
                }}
              />
            }
          />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto]">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={tFields('description')}
              rows={3}
              data-test-id="field-description"
            />
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
              quantity={positions.reduce((acc, p) => acc + Number(p.quantity || '0'), 0)}
            />
          </div>
        </div>
      ),
    },
    {
      key: 'related',
      label: tDetailTabs('related'),
      // moysklad OLD-design create form (re-grounded 2026-07-09, user screenshots):
      // /new has TWO tabs only — Главная + «Связанные документы»; Задачи and Файлы
      // are bottom sections INSIDE this tab. Everything works IN PLACE (no save,
      // no navigation) — picks are staged and persisted by staging.flush() after save.
      content: (
        <NewDocRelatedTab
          current={{
            id: 'new',
            name: docNumber,
            moment: docDate ? new Date(docDate).toISOString() : new Date().toISOString(),
            sumMinor: String(totals.gross),
            state: applicable ? 'posted' : 'draft',
            kind: 'invoice-out',
          }}
          entityType="InvoiceOut"
          staging={staging}
          linkDefaults={{
            agent: agentId ? { id: agentId, name: agentLabel } : null,
            organization: organizationId ? { id: organizationId, name: organizationLabel } : null,
            storeTo: storeId ? { id: storeId, name: storeLabel } : null,
          }}
        />
      ),
    },
    // «Файлы»/«Задачи» moved INTO the related tab (moysklad old-design, 2026-07-09).
    // «События» HIDDEN behind SHOW_NEW_EVENTS_TAB — code kept for re-enabling.
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
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      <DocumentEditor
        {...docEditorLabels}
        testId="invoice-out-new-page"
        documentTypeLabel={tDetailTitles('invoice_out')}
        number={docNumber}
        onNumberChange={setDocNumber}
        date={docDate}
        onDateChange={setDocDate}
        status={statusId}
        statusOptions={statusOptions}
        onStatusChange={setStatusId}
        onConfigureStatuses={() => router.push('/settings/invoice-out-statuses')}
        configureStatusesLabel={tForm('configure_statuses')}
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
        // instead of silently discarding the form (mirror supplies/new).
        onClose={() => {
          if (isDirty) setCloseConfirmOpen(true);
          else router.push('/invoices-out');
        }}
        modifyMenu={[]}
        createDocMenu={[]}
        printMenu={[]}
        sendMenu={[]}
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
                router.push('/invoices-out');
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
        title={tFields('agent')}
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
        title={tFields('organization')}
        fetcher={orgFetcher}
        onSelect={(item) => {
          setOrganizationId(item.id);
          setOrganizationLabel(String(item.primary));
        }}
      />
      <CatalogPicker
        open={openPicker === 'store'}
        onClose={() => setOpenPicker(null)}
        title={tFields('store')}
        fetcher={storeFetcher}
        onSelect={(item) => {
          setStoreId(item.id);
          setStoreLabel(String(item.primary));
        }}
      />
      <CatalogPicker
        open={openPicker === 'contract'}
        onClose={() => setOpenPicker(null)}
        title={tFields('contract')}
        fetcher={contractFetcher}
        onSelect={(item) => {
          setContractId(item.id);
          setContractLabel(String(item.primary));
        }}
      />
      <CatalogPicker
        open={openPicker === 'project'}
        onClose={() => setOpenPicker(null)}
        title={tFields('project')}
        fetcher={projectFetcher}
        onSelect={(item) => {
          setProjectId(item.id);
          setProjectLabel(String(item.primary));
        }}
      />
      <CatalogPicker
        open={openPicker === 'salesChannel'}
        onClose={() => setOpenPicker(null)}
        title={tFields('sales_channel')}
        fetcher={salesChannelFetcher}
        onSelect={(item) => {
          setSalesChannelId(item.id);
          setSalesChannelLabel(String(item.primary));
        }}
      />
      <CatalogPicker
        open={openPicker === 'orgAccount'}
        onClose={() => setOpenPicker(null)}
        title={tFields('organization_account')}
        fetcher={orgAccountFetcher}
        onSelect={(item) => {
          setOrgAccountId(item.id);
          setOrgAccountLabel(String(item.primary));
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
          updatePosition(openPicker.rowUid, {
            assortmentId: item.id,
            productLabel: String(item.primary),
            productCode: raw?.code ?? undefined,
            productUom: raw?.uom ?? null,
            priceMinor: resolveDefaultSalePriceOrZero(raw?.salePrices, defaultPriceTypeId, rates),
            vat: raw?.vat != null ? String(raw.vat) : '12',
            available: raw?.stock?.available,
            stock: raw?.stock?.onHand,
            reserve: raw?.stock?.reserved,
            waiting: raw?.stock?.inTransit,
            salePrices: raw?.salePrices ?? null,
            folderPath: raw?.productFolder?.pathName ?? undefined,
          });
        }}
      />
      {/* «Добавить из справочника» — pick a product from the catalog and append
          it as a NEW position (no qty/price modal here: the line takes the
          product's default sale price, editable in the grid). */}
      <CatalogPicker
        open={catalogAddOpen}
        onClose={() => setCatalogAddOpen(false)}
        title={tDetailForm('add_from_catalog')}
        fetcher={productFetcher}
        onSelect={(item) => {
          appendPositionFromCatalog(item);
        }}
      />
    </>
  );
}
