'use client';

/**
 * /sales-returns/new — moysklad-parity «Возврат покупателя» editor.
 *
 * Direction-flipped mirror of the certed «Возврат поставщику» create editor
 * (purchase-returns/new): the same PO/CO document-editor shell adapted to the
 * customer-side return. Field set (grounded via the sales-return detail page):
 *
 *   Row 1  Организация (+ «Сум» account sub-row) · Склад
 *   Row 2  Контрагент (+ «Баланс» sub-line)      · Договор
 *   Row 3  Проект                                 · Канал продаж
 *   Row 4  Отгрузка (Основание)                   · Счёт контрагента
 *   Row 5  Внешний код
 *   Row 6  Валюта документа (+ rate)
 *
 * The return is born FROM a Отгрузка (Demand) via its «Создать → Возврат»,
 * pre-filled through the `fromDemand` query param. «Владелец» owner popover +
 * the account custom «Статус» pill mirror the certed toolbar/header. The
 * SR-specific «Причина» field + the «Себестоимость ГТД»/«Страна» position
 * columns are retained (customer-side return specifics).
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
import { useNewDocStaging } from '@/components/documents/use-new-doc-staging';
import {
  type ReceiptData,
  ReceiptPrintPortal,
  receiptDate,
} from '@/components/pick-list/receipt-print-portal';
import { usePrintTemplatesManager } from '@/components/print/print-templates-provider';
import { type KitPrintForm, KitPrintModal } from '@/components/purchase-orders/kit-print-modal';
import { SendEmailDialog } from '@/components/send-email-dialog';
import { useDocumentEditorLabels } from '@/hooks/use-document-editor-labels';
import { useTotalsLabels } from '@/hooks/use-totals-labels';
import { defaultDocStore, useUserDefaults } from '@/hooks/use-user-defaults';
import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';
import { computeLineTotalSafe } from '@/lib/doc-totals';
import { distributeAgreementDelta } from '@/lib/position-agreement';
import { resolveDefaultSalePriceOrZero, useCurrencyRates, usePriceTypeIds } from '@/lib/sale-price';
import {
  Button,
  CatalogPicker,
  CatalogPickerField,
  type DocPositionRow,
  DocumentEditor,
  DocumentMetaField,
  DocumentMetaRow,
  DocumentTabs,
  DocumentTotalsPanel,
  Icons,
  Input,
  NativeSelect,
  type PickerItem,
  PositionInlineAdd,
  PositionNameCell,
  PositionTable,
  type PositionTableColumnConfig,
  Textarea,
  formatMoney,
  useToast,
} from '@moysklad/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
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
  salePrices: Array<{ priceTypeId: string; value: string }> | null;
  vat: number | null;
  // moysklad shows the product's live stock «Остаток» per return line.
  stock?: { onHand: string; reserved: string; inTransit: string; available: string } | null;
  productFolder?: { id: string; name: string; pathName: string } | null;
}

interface NewPositionRow extends DocPositionRow {
  assortmentId: string | null;
  demandPositionId: string | null;
  folderPath?: string;
}

function uid(): string {
  return Math.random().toString(36).slice(2);
}

// «События» on the CREATE form — hidden 2026-07-09 (moysklad's old-design /new has
// no События tab). Flip to true to re-enable; the tab's code is kept below.
const SHOW_NEW_EVENTS_TAB = false;

// moysklad «Возврат покупателя» position columns (direction-flipped mirror of
// «Возврат поставщику»): always-on = Наименование · Кол-во · Ячейка · Остаток ·
// Цена · НДС · Сумма. The ⚙ on «Сумма» toggles the rest — including the
// customer-side «Себестоимость ГТД»/«Страна» customs pair (default-off).
const DEFAULT_COL_VISIBLE: Record<string, boolean> = {
  image: false,
  unit: false,
  discount: false,
  vatAmount: false,
  // moysklad-parity (#31/#36, 2026-07-30): «Себестоимость ГТД»/«Страна» /new'da
  // ham default-ko'rinadigan — detail sahifasi bilan moslashtirildi (u yerda on).
  gtdSumMinor: true,
  country: true,
};

export default function NewSalesReturnPage() {
  const router = useRouter();
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const { defaultId } = usePriceTypeIds();
  // Valyuta kurslari — valyutali salePrices'ni baza valyutasiga o'girish uchun
  // (kurssiz bunday narx '0' bo'lib ko'rinmay qoladi).
  const rates = useCurrencyRates();
  const t = useTranslations('pages.sales_returns');
  const totalsLabels = useTotalsLabels();
  const tFields = useTranslations('fields');
  const tForm = useTranslations('form');
  const tPrint = useTranslations('print_menu');
  const tSpiska = useTranslations('pages.pickLists');
  const tBulk = useTranslations('bulk_actions');
  const tCreate = useTranslations('create_related');
  const { openTemplates } = usePrintTemplatesManager();
  const tDetailForm = useTranslations('detail_form');
  const tDetailTabs = useTranslations('detail_tabs');
  const tDetailTitles = useTranslations('detail_titles');
  const tPos = useTranslations('position_editor');
  const { toast } = useToast();
  const tCols = useTranslations('position_cols');
  const tCommon = useTranslations('common');
  const docEditorLabels = useDocumentEditorLabels();

  const fromDemandId = searchParams.get('fromDemand');

  // «Статус» — the account's own return statuses (State rows, entityType="salesreturn").
  // moysklad shows a grey «Статус» pill until the admin defines some via «Настроить...»
  // → /settings/sales-return-statuses. This is the account custom status (NOT the FSM
  // draft/posted state, which is decorative on /new — the API always creates a draft).
  const { data: statusData } = useQuery<{
    items: Array<{ id: string; name: string; color: string | null }>;
  }>({
    queryKey: ['states', 'salesreturn'],
    queryFn: () => api.get('/states?entityType=salesreturn&archived=false&limit=250'),
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

  // Optional pre-fill from Demand (Отгрузка) — the source shipment being returned.
  const { data: fromDemand } = useQuery<{
    id: string;
    name: string;
    agent: { id: string; name: string };
    organization: { id: string; name: string };
    store: { id: string; name: string };
    customerOrder: { id: string; name: string } | null;
    vatEnabled: boolean;
    vatIncluded: boolean;
    positions: Array<{
      id: string;
      assortmentId: string;
      quantity: string;
      priceMinor: string;
      discount: string;
      vat: number | null;
      vatEnabled: boolean;
      product: { id: string; name: string; code: string | null; uom: string | null } | null;
    }>;
  }>({
    queryKey: ['demand', fromDemandId],
    queryFn: () => api.get(`/demands/${fromDemandId}`),
    enabled: !!fromDemandId,
  });

  // Header state
  const [docNumber, setDocNumber] = useState('');
  const [docDate, setDocDate] = useState(() => {
    const d = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const [applicable, setApplicable] = useState(true);

  // Meta state
  const [agentId, setAgentId] = useState<string | null>(null);
  const [agentLabel, setAgentLabel] = useState('');
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [organizationLabel, setOrganizationLabel] = useState('');
  const [storeId, setStoreId] = useState<string | null>(null);
  const [storeLabel, setStoreLabel] = useState('');
  const [demandId, setDemandId] = useState<string | null>(null);
  const [demandLabel, setDemandLabel] = useState('');
  const [customerOrderId, setCustomerOrderId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectLabel, setProjectLabel] = useState('');
  const [contractId, setContractId] = useState<string | null>(null);
  const [contractLabel, setContractLabel] = useState('');
  const [salesChannelId, setSalesChannelId] = useState<string | null>(null);
  const [salesChannelLabel, setSalesChannelLabel] = useState('');
  const [currency, setCurrency] = useState<string>('UZS');
  const [rateOverride, setRateOverride] = useState<string | null>(null);
  const [rateModalOpen, setRateModalOpen] = useState(false);
  const [bankAccountId, setBankAccountId] = useState<string | null>(null);
  const [bankAccountLabel, setBankAccountLabel] = useState('');
  const [agentAccountId, setAgentAccountId] = useState<string | null>(null);
  const [agentAccountLabel, setAgentAccountLabel] = useState('');
  const [externalCode, setExternalCode] = useState('');
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');

  // VAT toggles
  const [vatEnabled, setVatEnabled] = useState(true);
  const [vatIncluded, setVatIncluded] = useState(false);

  // «Владелец» — owner/access. A new doc defaults to the current user; department
  // (groupId) + «Общий доступ» (shared) editable via the toolbar owner popover.
  const [ownerAccess, setOwnerAccess] = useState<OwnerAccessValue>(() => ({
    ownerId: user?.id ?? null,
    ownerLabel: user?.name ?? '',
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
  // «Скидка» header bulk discount/markup (moysklad parity) — apply % to selected
  // rows (or all when none selected). Discount sets each line's `discount`; markup
  // raises `priceMinor` (our model has no negative discount).
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
  const [colVisible, setColVisible] = useState<Record<string, boolean>>(DEFAULT_COL_VISIBLE);
  const [withGroups, setWithGroups] = useState(false);

  // Pickers + error
  const [openPicker, setOpenPicker] = useState<
    | null
    | 'agent'
    | 'org'
    | 'store'
    | 'demand'
    | 'project'
    | 'contract'
    | 'salesChannel'
    | 'bankAccount'
    | 'agentAccount'
    | { kind: 'product'; rowUid: string }
    | { kind: 'country'; rowUid: string }
  >(null);
  // «Добавить из справочника» — the catalog «Выбор товара» modal (was: appended
  // an EMPTY row; audit 2026-08-23 — the sibling sales-returns/[id] editor and
  // internal-orders/new already open the picker).
  const [catalogAddOpen, setCatalogAddOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // moysklad marks a required-but-empty «Контрагент» RED on a failed «Сохранить»
  // (short «Поле должно быть заполнено» under the field, same text in the toolbar
  // error line — never a page-wide banner). Mirror PO/new.
  const [agentInvalid, setAgentInvalid] = useState(false);

  // «Печать» / «Отправить» — the account's own «Возврат покупателя» PDF forms
  // (moysklad lists them ABOVE the standard form, and pins each as its OWN
  // toolbar button after «Отправить»). Empty on accounts with none configured.
  const { data: printForms } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ['sales-return-print-forms'],
    queryFn: () => api.get<Array<{ id: string; name: string }>>('/sales-returns/print-forms'),
    staleTime: 60_000,
  });
  // Toolbar action state (save-then-act): the id of the just-saved return (for the email
  // composer), the «Комплект…» + «Отправить» dialogs, and a busy flag so double-clicks
  // don't create two returns.
  const [savedId, setSavedId] = useState<string | null>(null);
  const [kitPrintOpen, setKitPrintOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailAttachments, setEmailAttachments] = useState<{ id: string; filename: string }[]>([]);
  const [toolbarBusy, setToolbarBusy] = useState(false);

  // «Курс валюты документа» — the rate is the account's currency-справочник rate
  // (Настройки → Валюты), the SAME admin-set value moysklad books documents at.
  // NOT a live CB feed: that drifts from the admin rate (e.g. 11 990 vs 12 200),
  // so USD docs were stored at the wrong base-currency value. One source of
  // truth → GET /currencies (mirror enters / losses / payments-in).
  const { data: currenciesData } = useQuery<{
    items: Array<{ id: string; isoCode: string; name: string; rate: string }>;
  }>({
    queryKey: ['currencies'],
    queryFn: () => api.get('/currencies'),
    staleTime: 60_000,
  });
  const currencies = currenciesData?.items ?? [];
  const adminRate = currencies.find((c) => c.isoCode === currency)?.rate;
  const effectiveRate = rateOverride ?? adminRate ?? '1';

  // Auto-fill from the user's «Значения по умолчанию» (moysklad applies the user
  // defaults to every new document). Sales doc — Организация/Склад=default with a
  // first-item fallback, Контрагент=defaultCustomer, Проект=defaultProject. Skipped
  // when pre-filling from a demand — the demand's own values win.
  const userDefaults = useUserDefaults();
  const defaultsAppliedRef = useRef(false);
  // moysklad «Печать» pins on /new = save first, then act. This ref carries the
  // click's intent through createMut into onSuccess (mirror PO/new); the built-in
  // form + «Комплект…» + «Отправить» keep their withSave flows below.
  const afterSaveRef = useRef<'view' | 'print'>('view');
  // «Печать» — which account custom form the save-first print should render once
  // the return exists: {view} = plain save (land on detail), {form,templateId} =
  // a custom form PDF (rendered via /sales-returns/bulk-print + a new tab).
  const printTargetRef = useRef<{ kind: 'view' | 'form'; templateId?: string }>({
    kind: 'view',
  });
  const draftSaveRef = useRef(false);
  // «Связанные документы» tab — staged links / tasks / files (moysklad's create
  // form works fully in place; everything persists in flush() right after save).
  const staging = useNewDocStaging({ entityType: 'SalesReturn', route: 'sales-returns' });
  useEffect(() => {
    if (defaultsAppliedRef.current || fromDemandId) return;
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
  }, [
    orgsData,
    storesData,
    userDefaults.data,
    userDefaults.isLoading,
    organizationId,
    storeId,
    agentId,
    projectId,
    fromDemandId,
  ]);

  // Pre-fill from Demand when loaded — header + one return row per demand line
  // (the demandPositionId back-link traces the source shipment line).
  useEffect(() => {
    if (!fromDemand) return;
    setAgentId(fromDemand.agent.id);
    setAgentLabel(fromDemand.agent.name);
    setOrganizationId(fromDemand.organization.id);
    setOrganizationLabel(fromDemand.organization.name);
    setStoreId(fromDemand.store.id);
    setStoreLabel(fromDemand.store.name);
    setDemandId(fromDemand.id);
    setDemandLabel(fromDemand.name);
    if (fromDemand.customerOrder) setCustomerOrderId(fromDemand.customerOrder.id);
    setVatEnabled(fromDemand.vatEnabled);
    setVatIncluded(fromDemand.vatIncluded);
    setPositions(
      fromDemand.positions.map((p) => ({
        id: uid(),
        assortmentId: p.assortmentId,
        productLabel: p.product?.name ?? '',
        productUom: p.product?.uom ?? null,
        demandPositionId: p.id,
        quantity: p.quantity,
        priceMinor: p.priceMinor,
        discount: p.discount,
        vat: p.vat != null ? String(p.vat) : '12',
        vatEnabled: p.vatEnabled,
      })),
    );
  }, [fromDemand]);

  // Choosing/changing the organization auto-fills its default account for the
  // document currency — the «Сум» sub-line under Организация (mirror PR).
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
      setBankAccountLabel(acct ? acct.name || acct.accountNumber || acct.currency : '');
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId, currency]);

  /** Append ONE catalog product as a return line. Shared by the inline
   *  typeahead/pick-modal (`onPick`, which supplies `entry`) and the
   *  «Добавить из справочника» catalog modal (no `entry` — the row falls back
   *  to the product's own default sale price). Returns the new row id: the
   *  pick-modal → «Кол-во» focus chain depends on it (owner 2026-07-18). */
  const appendPositionFromCatalog = (
    item: { id: string; primary: string; raw?: unknown },
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
    const defaultPrice = resolveDefaultSalePriceOrZero(raw?.salePrices, defaultId, rates);
    const newId = uid();
    setPositions((ps) => [
      ...ps,
      {
        id: newId,
        assortmentId: item.id,
        productLabel: item.primary,
        productCode: raw?.code ?? undefined,
        productUom: raw?.uom ?? null,
        demandPositionId: null,
        quantity: entry?.quantity ?? '1',
        priceMinor: entry?.priceMinor ?? defaultPrice,
        discount: '0',
        vat: raw?.vat != null ? String(raw.vat) : '12',
        vatEnabled: true,
        // «Остаток» — read-only stock cluster at the store.
        stock: raw?.stock?.onHand,
        available: raw?.stock?.available,
        folderPath: raw?.productFolder?.pathName ?? undefined,
      },
    ]);
    // owner 2026-07-18: returning the id hands focus to the new
    // row's «Кол-во» (modal → table entry chain).
    return newId;
  };
  const updatePosition = (rowId: string, patch: Partial<NewPositionRow>) => {
    setPositions((ps) => ps.map((p) => (p.id === rowId ? { ...p, ...patch } : p)));
  };
  const removePosition = (rowId: string) => {
    setPositions((ps) => ps.filter((p) => p.id !== rowId));
  };

  // Totals — BigInt-safe reduce.
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

  // «Настроить столбцы» gear options — the customer-side optional columns.
  const optionalColumnOptions = useMemo(
    () => [
      { key: 'image', label: tCols('image') },
      { key: 'unit', label: tCols('unit') },
      { key: 'discount', label: tCols('discount') },
      { key: 'vatAmount', label: tCols('vatAmount') },
      { key: 'gtdSumMinor', label: tFields('gtd_cost') },
      { key: 'country', label: tFields('country') },
    ],
    [tCols, tFields],
  );

  // moysklad «Возврат покупателя» columns, built dynamically from the customizer.
  // Always-on: Наименование · Кол-во · Ячейка · Остаток · Цена · НДС · Сумма (gear).
  const positionColumns = useMemo<PositionTableColumnConfig[]>(() => {
    const cols: PositionTableColumnConfig[] = [{ key: 'dragarea' }, { key: 'select' }];
    if (colVisible.image) cols.push({ key: 'image' });
    cols.push({ key: 'name', label: tCols('name') });
    cols.push({ key: 'quantity', label: tPos('quantity') });
    if (colVisible.unit) cols.push({ key: 'unit', label: tCols('unit') });
    // «Ячейка» — address-storage bin (PositionTable supplies the «Ячейка» header).
    cols.push({ key: 'cell' });
    // «Остаток» — the line product's live stock at the store (default-on).
    cols.push({ key: 'stock', label: tCols('stock') });
    cols.push({ key: 'price', label: tCols('price') });
    if (vatEnabled) {
      cols.push({ key: 'vat', label: tCols('vat') });
      if (colVisible.vatAmount) cols.push({ key: 'vatAmount', label: tCols('vatAmount') });
    }
    if (colVisible.discount)
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
    cols.push({
      key: 'amount',
      label: (
        <span className="inline-flex items-center gap-1">
          {tCols('amount')}
          <PositionColumnCustomizer
            options={optionalColumnOptions}
            visible={colVisible}
            onToggle={(key, next) => setColVisible((v) => ({ ...v, [key]: next }))}
            ariaLabel={tCols('configure')}
          />
        </span>
      ),
    });
    // moysklad «Возврат покупателя» customs pair (gear-optional): Себестоимость ГТД
    // + Страна (no «Номер ГТД» column — outbound-origin return).
    if (colVisible.gtdSumMinor) cols.push({ key: 'gtdSumMinor', label: tFields('gtd_cost') });
    if (colVisible.country) cols.push({ key: 'country' });
    cols.push({ key: 'menu' });
    return cols;
  }, [
    colVisible,
    vatEnabled,
    optionalColumnOptions,
    tCols,
    tPos,
    tFields,
    applyDiscountMarkup,
    selectedRowIds.size,
  ]);

  // Build + validate the create payload — shared by «Сохранить» and every save-then-act
  // toolbar action. Throws a localized message on the first invalid field.
  const buildCreatePayload = () => {
    if (!agentId) throw new Error(tForm('select_customer'));
    if (!organizationId) throw new Error(tForm('select_organization'));
    if (!storeId) throw new Error(tForm('select_store'));
    // Owner 2026-07-08: «Проведено» has NO position precondition — an empty document may be saved/posted (BE allows it: 0 positions ⇒ 0 stock delta).
    for (const [i, p] of positions.entries()) {
      if (!p.assortmentId) throw new Error(tForm('position_select_product', { n: i + 1 }));
      if (Number(p.quantity) <= 0)
        throw new Error(tForm('position_quantity_positive', { n: i + 1 }));
    }
    return {
      agentId,
      organizationId,
      storeId,
      ...(bankAccountId ? { organizationAccountId: bankAccountId } : {}),
      ...(agentAccountId ? { agentAccountId } : {}),
      ...(externalCode ? { externalCode } : {}),
      // «Владелец» — owner employee / department / shared (else BE stamps creator).
      ...(ownerAccess.ownerId ? { ownerId: ownerAccess.ownerId } : {}),
      ...(ownerAccess.groupId ? { groupId: ownerAccess.groupId } : {}),
      ...(ownerAccess.shared ? { shared: true } : {}),
      ...(statusId ? { statusId } : {}),
      demandId: demandId ?? undefined,
      customerOrderId: customerOrderId ?? undefined,
      ...(projectId ? { projectId } : {}),
      ...(contractId ? { contractId } : {}),
      ...(salesChannelId ? { salesChannelId } : {}),
      ...(docNumber ? { name: docNumber } : {}),
      moment: docDate ? new Date(docDate).toISOString() : undefined,
      // «⊕ Задача»/«⊕ Файл» draft: force applicable=false so an empty return persists.
      applicable: draftSaveRef.current ? false : applicable,
      currency,
      rateValue:
        currency === 'UZS'
          ? '100000000'
          : BigInt(Math.round(Number(effectiveRate) * 100000000)).toString(),
      reason: reason || undefined,
      description: description || undefined,
      vatEnabled,
      vatIncluded,
      positions: positions.map((p) => ({
        assortmentKind: 'product' as const,
        // biome-ignore lint/style/noNonNullAssertion: validated non-null in the loop above before payload build
        assortmentId: p.assortmentId!,
        demandPositionId: p.demandPositionId ?? undefined,
        quantity: p.quantity,
        priceMinor: p.priceMinor,
        discount: p.discount || '0',
        vat: p.vat ? Number(p.vat) : undefined,
        vatEnabled: p.vatEnabled,
        gtdSumMinor: p.gtdSumMinor || undefined,
        countryId: p.countryId || undefined,
        ...(p.cellId ? { cellId: p.cellId } : {}),
        ...(p.cell ? { cell: p.cell } : {}),
      })),
    };
  };
  const submitCreate = () => api.post<{ id: string }>('/sales-returns', buildCreatePayload());

  const createMut = useMutation({
    mutationFn: submitCreate,
    onSuccess: async (created) => {
      const intent = afterSaveRef.current;
      afterSaveRef.current = 'view';
      draftSaveRef.current = false;
      // Staged files / links / tasks (the related tab works in place before save) —
      // persist them all onto the freshly-created return.
      await staging.flush(created.id);
      // «Печать» (pinned form buttons + the menu's form items): render the chosen
      // account custom form's PDF and OPEN IT IN A NEW TAB (moysklad «Открыть в
      // браузере» — the user presses «Печать» there; NOT a save-to-disk download),
      // then land on the saved return's detail page. Mirror PO/new.
      if (intent === 'print') {
        const target = printTargetRef.current;
        printTargetRef.current = { kind: 'view' };
        if (target.kind === 'form' && target.templateId) {
          void api.postOpenInBrowser('/sales-returns/bulk-print', {
            ids: [created.id],
            templateId: target.templateId,
          });
        }
      }
      router.push(`/sales-returns/${created.id}`);
    },
    onError: (err: Error) => {
      afterSaveRef.current = 'view';
      printTargetRef.current = { kind: 'view' };
      draftSaveRef.current = false;
      setError(err.message);
    },
  });

  // ── Toolbar «save-then-act» helpers (moysklad populates these on a brand-new return;
  // its draft exists server-side. Ours has no id until saved, so each toolbar action
  // first creates the return via submitCreate, then runs `action(id)`. `savedId` is kept
  // so the email composer can attach to the freshly-created document; the busy flag stops
  // a double-click creating two returns). ────────────────────────────────────────────
  const withSave = async (action: (id: string) => Promise<void> | void) => {
    if (toolbarBusy) return;
    setError(null);
    setToolbarBusy(true);
    try {
      const created = await submitCreate();
      setSavedId(created.id);
      await action(created.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setToolbarBusy(false);
    }
  };
  const printSaved = (id: string, templateId?: string) => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    return api.postDownload(
      '/sales-returns/bulk-print',
      { ids: [id], ...(templateId ? { templateId } : {}) },
      `sales-return-${stamp}.pdf`,
    );
  };
  // «Печать» — save then render THIS return (built-in form or account templateId) to PDF.
  const saveThenPrint = (templateId?: string) => withSave((id) => printSaved(id, templateId));
  // Pinned form button / the menu's form items — store the form, save the return
  // (same validation as «Сохранить»), then createMut.onSuccess renders that form's
  // PDF into a NEW TAB and lands on the detail page. Mirror PO/new.
  const saveThenPrintForm = (templateId: string) => {
    printTargetRef.current = { kind: 'form', templateId };
    afterSaveRef.current = 'print';
    setError(null);
    createMut.mutate();
  };
  // «Печать ▸ Комплект…» — save then bundle several forms into one PDF.
  const saveThenKitPrint = (templateIds: Array<string | null>) =>
    withSave((id) => {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      return api.postDownload(
        '/sales-returns/kit-print',
        { ids: [id], templateIds },
        `sales-return-kit-${stamp}.pdf`,
      );
    });
  // «Отправить» — save, render the chosen form, attach the PDF and open the composer.
  const saveThenSend = (templateId?: string) =>
    withSave(async (id) => {
      const att = await api.post<{ attachmentId: string; filename: string }>(
        `/sales-returns/${id}/print-attachment`,
        templateId ? { templateId } : {},
      );
      setEmailAttachments([{ id: att.attachmentId, filename: att.filename }]);
      setEmailOpen(true);
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
  const demandFetcher = async (s: string): Promise<PickerItem[]> => {
    const filters = new URLSearchParams();
    filters.set('limit', '50');
    if (s) filters.set('search', s);
    if (agentId) filters.set('agentId', agentId);
    filters.set('state', 'posted');
    const d = await api.get<{
      items: Array<{
        id: string;
        name: string;
        agent: { name: string };
        state: string;
        sumMinor: string;
      }>;
    }>(`/demands?${filters.toString()}`);
    return d.items.map((r) => ({
      id: r.id,
      primary: r.name,
      secondary: r.agent.name,
      meta: formatMoney(r.sumMinor),
    }));
  };
  const projectFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: RefItem[] }>(`/projects?search=${encodeURIComponent(s)}`);
    return d.items.map((p) => ({ id: p.id, primary: p.name }));
  };
  const contractFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: RefItem[] }>(
      `/contracts?search=${encodeURIComponent(s)}&limit=50`,
    );
    return d.items.map((c) => ({ id: c.id, primary: c.name }));
  };
  const salesChannelFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: RefItem[] }>(
      `/sales-channels?search=${encodeURIComponent(s)}&limit=50`,
    );
    return d.items.map((c) => ({ id: c.id, primary: c.name }));
  };
  const countryFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: Array<{ id: string; name: string; code: string | null }> }>(
      `/countries?search=${encodeURIComponent(s)}&limit=100`,
    );
    return d.items.map((c) => ({ id: c.id, primary: c.name, secondary: c.code ?? undefined }));
  };

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
        id: a.id,
        primary: a.name || a.accountNumber || a.currency,
        secondary: a.bankName ?? a.accountNumber ?? undefined,
      }));
  };

  // moysklad parity — counterparty bank accounts have no flat list endpoint;
  // the only route is the nested /counterparties/:id/bank-accounts (same as
  // the contract picker is gated on the chosen agent). Client-filter by
  // search since the nested endpoint takes no search param.
  const agentAccountFetcher = async (s: string): Promise<PickerItem[]> => {
    if (!agentId) return [];
    const d = await api.get<Array<{ id: string; accountNumber: string; bankName: string | null }>>(
      `/counterparties/${agentId}/bank-accounts`,
    );
    const q = s.trim().toLowerCase();
    return d
      .filter(
        (a) =>
          !q ||
          a.accountNumber.toLowerCase().includes(q) ||
          (a.bankName ?? '').toLowerCase().includes(q),
      )
      .map((a) => ({ id: a.id, primary: a.accountNumber, secondary: a.bankName ?? undefined }));
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

  // «Ячейка» — address-storage cell picker. The closure carries storeId + the row's
  // product so the picker can filter «С этим товаром» (mirror supplies/new).
  const renderPositionCellCell = (row: DocPositionRow) => {
    const p = row as NewPositionRow;
    return (
      <CellPickerField
        storeId={storeId}
        assortmentId={p.assortmentId}
        label={p.cell}
        onSelect={(cellId, label) => updatePosition(row.id, { cellId, cell: label })}
        onClear={() => updatePosition(row.id, { cellId: null, cell: '' })}
      />
    );
  };

  const renderPositionCountryCell = (row: DocPositionRow) => (
    <CatalogPickerField
      value={row.countryId ? { id: row.countryId, label: row.countryLabel ?? '' } : null}
      placeholder={tFields('country')}
      onPick={() => setOpenPicker({ kind: 'country', rowUid: row.id })}
      onClear={() => updatePosition(row.id, { countryId: null, countryLabel: '' })}
    />
  );

  // moysklad b-operation-form-top — a ROW-PAIRED table. The org's «Сум» account is a
  // subRow UNDER Организация. Fixed-width fields grouped from the left. Rendered as a
  // persistent sibling ABOVE the tab strip so the header stays visible on «Связанные
  // документы» too (mirror the certed «Возврат поставщику» editor).
  const metaPanel = (
    <div className="max-w-[860px] space-y-2 bg-[var(--ms-bg-surface)] px-4 py-3">
      <DocumentMetaRow fixedWidth>
        <DocumentMetaField
          label={tFields('organization')}
          required
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
            placeholder=""
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
              setBankAccountId(null);
              setBankAccountLabel('');
            }}
          />
        </DocumentMetaField>
        <DocumentMetaField label={tFields('store')} required>
          <CatalogPickerField
            value={storeId ? { id: storeId, label: storeLabel } : null}
            placeholder=""
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
              setDemandId(null);
              setDemandLabel('');
              setCustomerOrderId(null);
              setAgentAccountId(null);
              setAgentAccountLabel('');
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
            onPick={() => setOpenPicker('contract')}
            inlineFetcher={contractFetcher}
            onInlineSelect={(item) => {
              setContractId(item.id);
              setContractLabel(String(item.primary));
            }}
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
            placeholder=""
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
        <DocumentMetaField label={tFields('sales_channel')}>
          <CatalogPickerField
            value={salesChannelId ? { id: salesChannelId, label: salesChannelLabel } : null}
            placeholder=""
            onPick={() => setOpenPicker('salesChannel')}
            onClear={() => {
              setSalesChannelId(null);
              setSalesChannelLabel('');
            }}
          />
        </DocumentMetaField>
      </DocumentMetaRow>

      <DocumentMetaRow fixedWidth>
        <DocumentMetaField label={tFields('linked_demand')}>
          <CatalogPickerField
            value={demandId ? { id: demandId, label: demandLabel } : null}
            placeholder=""
            onPick={() => agentId && setOpenPicker('demand')}
            disabled={!agentId}
            disabledHint={tForm('select_customer_first')}
            onClear={() => {
              setDemandId(null);
              setDemandLabel('');
              setCustomerOrderId(null);
            }}
          />
        </DocumentMetaField>
        <DocumentMetaField label={tFields('agent_account')}>
          <CatalogPickerField
            value={agentAccountId ? { id: agentAccountId, label: agentAccountLabel } : null}
            placeholder=""
            onPick={() => agentId && setOpenPicker('agentAccount')}
            disabled={!agentId}
            disabledHint={tForm('select_customer_first')}
            onClear={() => {
              setAgentAccountId(null);
              setAgentAccountLabel('');
            }}
          />
        </DocumentMetaField>
      </DocumentMetaRow>

      <DocumentMetaRow fixedWidth>
        <DocumentMetaField label={tDetailForm('external_code')}>
          <Input
            value={externalCode}
            onChange={(e) => setExternalCode(e.target.value)}
            data-test-id="field-external-code"
          />
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
            renderCellCell={renderPositionCellCell}
            // moysklad row ⋮ «Заменить» — swap the line's product (the name is now a
            // card link, so swapping moves here). Opens the per-row product picker.
            onReplace={(id) => setOpenPicker({ kind: 'product', rowUid: id })}
            renderCountryCell={renderPositionCountryCell}
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
                      priceMinor: resolveDefaultSalePriceOrZero(p.salePrices, defaultId, rates),
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
                // «Добавить из справочника» — open the catalog picker (was:
                // appended an empty row; audit 2026-08-23).
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
                onImportPositions={(rows) => {
                  setPositions((ps) => [
                    ...ps,
                    ...rows.map(({ item, quantity }) => {
                      const raw = item.raw as ProductItem | undefined;
                      const defaultPrice = resolveDefaultSalePriceOrZero(
                        raw?.salePrices,
                        defaultId,
                        rates,
                      );
                      return {
                        id: uid(),
                        assortmentId: item.id,
                        productLabel: item.primary,
                        productCode: raw?.code ?? undefined,
                        productUom: raw?.uom ?? null,
                        demandPositionId: null,
                        quantity: Number(quantity) > 0 ? quantity : '1',
                        priceMinor: defaultPrice,
                        discount: '0',
                        vat: raw?.vat != null ? String(raw.vat) : '12',
                        vatEnabled: true,
                        stock: raw?.stock?.onHand,
                        available: raw?.stock?.available,
                        folderPath: raw?.productFolder?.pathName ?? undefined,
                      };
                    }),
                  ]);
                }}
              />
            }
          />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto]">
            <div className="space-y-2">
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t('reason_placeholder')}
                data-test-id="field-reason"
              />
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={tFields('description')}
                rows={3}
                data-test-id="field-description"
              />
            </div>
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
            kind: 'sales-return',
          }}
          entityType="SalesReturn"
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

  // ── Toolbar dropdown menus (moysklad «Возврат покупателя» new parity) ──────────────
  // moysklad shows the dropdowns populated on a brand-new return (its draft exists
  // server-side); ours save-then-act (submitCreate) so the same items work here.
  const kitForms: KitPrintForm[] = [
    { id: null, name: tDetailTitles('sales_return') },
    ...(printForms ?? []).map((f) => ({ id: f.id, name: f.name })),
  ];
  // «Изменить» → «Удалить», greyed on an unsaved document (nothing to delete yet).
  const modifyMenu = [
    { label: tBulk('delete'), disabled: true, destructive: true, testId: 'sr-new-modify-delete' },
  ];
  // «Создать документ» — a customer return refunds the customer (money OUT), so the
  // downstream docs are the outgoing/refund ones (mirror of purchase-return's incoming
  // set, direction-flipped). Rendered as label-parity placeholders (greyed) until the
  // from-sales-return backend flows are built — same honest stub the purchase-return
  // editor uses for its unbuilt money docs. Exact item set pending moysklad grounding.
  const createDocMenu = [
    { label: tCreate('facture_out'), disabled: true, testId: 'sr-new-create-facture-out' },
    { label: tCreate('payment_out_single'), disabled: true, testId: 'sr-new-create-payment-out' },
    { label: tCreate('cash_out_single'), disabled: true, testId: 'sr-new-create-cash-out' },
  ];
  // «Печать» → the account's own forms + the built-in «Возврат покупателя» form +
  // «Комплект…» + «Настроить…». A custom form saves the return first, then opens
  // that form's PDF in a NEW TAB (same handler as the pinned toolbar buttons);
  // the built-in form + «Комплект…» keep their save-then-download flow.
  // «Печать → Лист сборки» (climart port 2026-07-28): qaytarilgan tovarni
  // omborga JOYLASH varag'i — yacheyka mahsulotdan jonli hal qilinadi (qatorning
  // o'z tanlangan yacheykasi ustun); sarlavha «qaytarish» ekanini ko'rsatadi.
  const [spiska, setSpiska] = useState<ReceiptData | null>(null);
  const openSpiska = useCallback(async () => {
    const rows = positions.filter((p) => p.assortmentId && Number(p.quantity) > 0);
    const ids = [...new Set(rows.map((r) => r.assortmentId as string))];
    const res = ids.length
      ? await api
          .get<{ cells: Record<string, string | null> }>(
            `/pick-lists/cells-by-products?productIds=${ids.join(',')}`,
          )
          .catch(() => ({ cells: {} as Record<string, string | null> }))
      : { cells: {} as Record<string, string | null> };
    setSpiska({
      title: tSpiska('receipt_title_return'),
      number: docNumber || '—',
      dateStr: receiptDate(new Date()),
      agentName: agentLabel || null,
      agentPhone: null,
      ownerName: user?.name ?? null,
      description: description || null,
      positions: rows.map((r) => ({
        name: r.productLabel,
        qty: r.quantity,
        uom: r.productUom ?? null,
        cell: r.cell || (res.cells[r.assortmentId as string] ?? null),
      })),
    });
  }, [positions, docNumber, agentLabel, description, user?.name, tSpiska]);
  const printMenu = [
    ...(printForms ?? []).map((f) => ({
      label: f.name,
      onClick: () => saveThenPrintForm(f.id),
      testId: `sr-new-print-${f.id}`,
    })),
    {
      label: tDetailTitles('sales_return'),
      onClick: () => saveThenPrint(),
      testId: 'sr-new-print-standard',
    },
    {
      label: tSpiska('spiska_form'),
      onClick: () => void openSpiska(),
      testId: 'sr-new-print-spiska',
    },
    { label: tPrint('set'), onClick: () => setKitPrintOpen(true), testId: 'sr-new-print-kit' },
    { divider: true },
    {
      label: tPrint('configure'),
      onClick: () => openTemplates('salesreturn'),
      testId: 'sr-new-print-configure',
    },
  ];
  // «Отправить» → the same forms, each rendered + attached + opened in the email composer.
  const sendMenu = [
    ...(printForms ?? []).map((f) => ({
      label: f.name,
      onClick: () => saveThenSend(f.id),
      testId: `sr-new-send-${f.id}`,
    })),
    {
      label: tDetailTitles('sales_return'),
      onClick: () => saveThenSend(),
      testId: 'sr-new-send-standard',
    },
  ];

  return (
    <>
      <DocumentEditor
        {...docEditorLabels}
        testId="sales-return-new-page"
        documentTypeLabel={tDetailTitles('sales_return')}
        number={docNumber}
        onNumberChange={setDocNumber}
        date={docDate}
        onDateChange={setDocDate}
        status={statusId}
        statusOptions={statusOptions}
        onStatusChange={setStatusId}
        onConfigureStatuses={() => router.push('/settings/sales-return-statuses')}
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
        saving={createMut.isPending || toolbarBusy}
        onClose={() => router.push('/sales-returns')}
        modifyMenu={modifyMenu}
        createDocMenu={createDocMenu}
        printMenu={printMenu}
        sendMenu={sendMenu}
        // moysklad pins each configured print form as its OWN button right after
        // «Отправить». Each saves the return first, then renders that form's PDF
        // into a new tab. Mirror PO/new.
        trailingSlot={(printForms ?? []).map((f) => (
          <Button
            key={f.id}
            type="button"
            variant="secondary"
            size="sm"
            // «Past ko'k» — check-print type buttons stand out in a soft blue
            // (brand-100 fill · brand-600 text · brand-300 border), matching
            // PO/supplies/new. Owner request 2026-07-15/16.
            className="border-[var(--ms-brand-300)] bg-[var(--ms-brand-100)] text-[var(--ms-brand-600)] hover:bg-[var(--ms-brand-200)] hover:text-[var(--ms-brand-700)]"
            onClick={() => saveThenPrintForm(f.id)}
            data-test-id={`toolbar-print-form-${f.id}`}
          >
            <Icons.print className="h-4 w-4" />
            {f.name}
          </Button>
        ))}
        rightSlot={<OwnerAccessPopover value={ownerAccess} onChange={setOwnerAccess} />}
        error={error}
        onErrorRetry={() => {
          setError(null);
          createMut.mutate();
        }}
      >
        {metaPanel}
        <DocumentTabs tabs={tabs} defaultActiveKey="main" />
      </DocumentEditor>

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
        open={openPicker === 'demand'}
        onClose={() => setOpenPicker(null)}
        title={tFields('linked_demand')}
        fetcher={demandFetcher}
        onSelect={(item) => {
          setDemandId(item.id);
          setDemandLabel(String(item.primary));
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
        open={openPicker === 'bankAccount'}
        onClose={() => setOpenPicker(null)}
        title={tFields('organization_account')}
        fetcher={bankAccountFetcher}
        onSelect={(item) => {
          setBankAccountId(item.id);
          setBankAccountLabel(String(item.primary));
        }}
      />
      <CatalogPicker
        open={openPicker === 'agentAccount'}
        onClose={() => setOpenPicker(null)}
        title={tFields('agent_account')}
        fetcher={agentAccountFetcher}
        onSelect={(item) => {
          setAgentAccountId(item.id);
          setAgentAccountLabel(String(item.primary));
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
          const defaultPrice = resolveDefaultSalePriceOrZero(raw?.salePrices, defaultId, rates);
          updatePosition(openPicker.rowUid, {
            assortmentId: item.id,
            productLabel: String(item.primary),
            productCode: raw?.code ?? undefined,
            productUom: raw?.uom ?? null,
            priceMinor: defaultPrice,
            vat: raw?.vat != null ? String(raw.vat) : '12',
            stock: raw?.stock?.onHand,
            available: raw?.stock?.available,
            folderPath: raw?.productFolder?.pathName ?? undefined,
          });
        }}
      />
      {/* «Добавить из справочника» — pick a product and append it as a new line
          (mirror sales-returns/[id]; no qty/price modal on this path — the row
          takes the product's own default sale price). */}
      <CatalogPicker
        open={catalogAddOpen}
        onClose={() => setCatalogAddOpen(false)}
        title={tDetailForm('add_from_catalog')}
        fetcher={productFetcher}
        onSelect={(item) => {
          appendPositionFromCatalog({
            id: item.id,
            primary: String(item.primary),
            raw: (item as PickerItem & { raw?: ProductItem }).raw,
          });
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

      {/* «Печать ▸ Комплект…» — pick forms, then save the return + download one PDF. */}
      <KitPrintModal
        open={kitPrintOpen}
        onOpenChange={setKitPrintOpen}
        forms={kitForms}
        selectedCount={1}
        labels={{
          title: tPrint('set'),
          confirm: tPrint('kit_confirm'),
          cancel: tPrint('kit_cancel'),
        }}
        onConfirm={saveThenKitPrint}
      />

      {/* «Отправить» — email this return with the chosen print form pre-attached (the
          return is saved first, so `savedId` is set before the composer opens). */}
      {savedId && (
        <SendEmailDialog
          open={emailOpen}
          onClose={() => {
            setEmailOpen(false);
            setEmailAttachments([]);
          }}
          entity="SalesReturn"
          entityId={savedId}
          defaultSubject={`${tDetailTitles('sales_return')} ${docNumber}`.trim()}
          defaultBodyHtml={`<p>${tDetailTitles('sales_return')} ${docNumber}</p>`}
          initialAttachments={emailAttachments}
        />
      )}
      {spiska && <ReceiptPrintPortal data={spiska} onClose={() => setSpiska(null)} />}
    </>
  );
}
