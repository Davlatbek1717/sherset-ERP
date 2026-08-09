'use client';

/**
 * /demands/new — moysklad-parity «Отгрузка» editor.
 *
 * Built on the document-editor framework. Mirrors purchase-orders/new
 * with sales-side labels. Preserves the live-stock sidebar (stock
 * check per assortmentId) in the position name-cell renderer.
 * Status includes 'shipped' in addition to the standard 3.
 */

import { AttributeInput, type AttributeMetaRow } from '@/components/attributes-editor';
import { CurrencyRateModal } from '@/components/document-detail/currency-rate-modal';
import { CellPickerField } from '@/components/documents/cell-picker-field';
import { NewDocRelatedTab } from '@/components/documents/new-doc-related-tab';
import { PositionAgreementButton } from '@/components/documents/position-agreement-modal';
import { PositionDiscountMenu } from '@/components/documents/position-discount-menu';
import { useNewDocStaging } from '@/components/documents/use-new-doc-staging';
import { ReceiptPrintPortal } from '@/components/pick-list/receipt-print-portal';
import { usePrintTemplatesManager } from '@/components/print/print-templates-provider';
import { ProductCreateModal } from '@/components/products/product-create-modal';
import { ProductEditModal } from '@/components/products/product-edit-modal';
import { useDocumentEditorLabels } from '@/hooks/use-document-editor-labels';
import { usePickSheet } from '@/hooks/use-pick-sheet';
import { useTotalsLabels } from '@/hooks/use-totals-labels';
import { useUserDefaults } from '@/hooks/use-user-defaults';
import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';
import { computeLineTotalSafe, docMeasureTotals } from '@/lib/doc-totals';
import { distributeAgreementDelta } from '@/lib/position-agreement';
import { resolveDefaultSalePriceOrZero } from '@/lib/sale-price';
import {
  Button,
  CatalogPicker,
  CatalogPickerField,
  type DocPositionRow,
  DocumentDisclosurePanel,
  DocumentEditor,
  DocumentMetaField,
  DocumentMetaPanel,
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
  salePrices: Array<{ priceTypeId: string; value: string }> | null;
  vat: number | null;
  /** Stock cluster from /products — the pick modal's «Остаток» line. */
  stock?: { available: string } | null;
  /** Per-unit weight (g) / volume (ml) — feed the «Вес» / «Объём» footer.
   *  /products returns every scalar Product column (`include`, not `select`). */
  weightG?: number | null;
  volumeML?: number | null;
}

interface NewPositionRow extends DocPositionRow {
  assortmentId: string | null;
  /** Product sale-price list — powers the per-row «Цена ▾» quick-pick. */
  salePrices?: Array<{ priceTypeId: string; value: string }> | null;
}

function uid(): string {
  return Math.random().toString(36).slice(2);
}

// «События» on the CREATE form — hidden 2026-07-09 (moysklad's old-design /new has
// no События tab). Flip to true to re-enable; the tab's code is kept below.
const SHOW_NEW_EVENTS_TAB = false;

const POSITION_COLUMNS: PositionTableColumnConfig[] = [
  { key: 'dragarea' },
  { key: 'select' },
  { key: 'index' },
  { key: 'image' },
  { key: 'name' },
  { key: 'quantity' },
  { key: 'goodPack' },
  // «Ячейка» — the address-storage bin the goods leave FROM (PositionTable
  // supplies the header). Mirrors purchase-returns/new, the other outbound doc.
  { key: 'cell' },
  { key: 'price' },
  { key: 'vat' },
  { key: 'vatAmount' },
  { key: 'discount' },
  { key: 'amount' },
  { key: 'menu' },
];

export default function NewDemandPage() {
  const router = useRouter();
  const { user } = useAuth();
  const t = useTranslations('pages.demands');
  const totalsLabels = useTotalsLabels();
  const tFields = useTranslations('fields');
  const tForm = useTranslations('form');
  const tDetailForm = useTranslations('detail_form');
  const tDetailTabs = useTranslations('detail_tabs');
  const tDetailTitles = useTranslations('detail_titles');
  const tDetailHeader = useTranslations('detail_header');
  const tStates = useTranslations('states.demand');
  const tPrint = useTranslations('print_menu');
  const tBulk = useTranslations('bulk_actions');
  const tCreate = useTranslations('create_related');
  const tPos = useTranslations('position_editor');
  const tCols = useTranslations('position_cols');
  const docEditorLabels = useDocumentEditorLabels();
  const { openTemplates } = usePrintTemplatesManager();
  // moysklad «Печать»/«Отправить»/«Создать документ» on /new = save first, then
  // act. This ref carries the click's intent through createMut into onSuccess.
  const afterSaveRef = useRef<'view' | 'print'>('view');
  // «Печать» — which form the save-first print should open once the shipment
  // exists: {view} = the standard print page (new tab), {form,templateId} = an
  // account custom form PDF (rendered via /demands/bulk-print). Mirror PO/new.
  const printTargetRef = useRef<{ kind: 'view' | 'form'; templateId?: string }>({
    kind: 'view',
  });
  // The account's own custom «Отгрузка» print forms (moysklad «Печать» lists
  // them ABOVE the standard form, and pins each as its OWN toolbar button after
  // «Отправить»). Empty on accounts with none configured. Mirror PO/new.
  // Doc-scoped endpoint (/demands/print-forms) — gated on the DOC view permission, not
  // settings, so a cashier sees the pinned check buttons too (the shared
  // /print-templates listing is admin-only). Bare array, PO/new shape.
  const { data: printFormsData } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ['demand-print-forms'],
    queryFn: () => api.get('/demands/print-forms'),
    staleTime: 60_000,
  });
  const printForms = printFormsData ?? [];
  // «＋ Задача» saves the order as a draft (skips the post + position rules).
  const draftSaveRef = useRef(false);
  // moysklad marks a required-but-empty «Контрагент» RED when you try to save/act
  // without it (instead of a generic banner). Set on a failed «＋ Задача» click.
  const [agentInvalid, setAgentInvalid] = useState(false);
  // «Связанные документы» tab — staged links / tasks / files (moysklad's create
  // form works fully in place; everything persists in flush() right after save).
  const staging = useNewDocStaging({ entityType: 'Demand', route: 'demands' });

  // moysklad demand FSM = draft / posted / cancelled (mirrors demands/[id]).
  // The status field is decorative on /new (not sent on create — the API
  // always creates a draft), so we surface the same three real states.
  const STATUS_OPTIONS = [
    { value: 'draft', label: tStates('draft'), color: '#e8eef5' },
    { value: 'posted', label: tStates('posted'), color: '#cfe8d3' },
    { value: 'cancelled', label: tStates('cancelled'), color: '#f4d4d4' },
  ];

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
  const [status, setStatus] = useState<string>('draft');
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
  const [shipmentAddress, setShipmentAddress] = useState('');
  // «Доп. поля» values keyed by attribute code — sent as `attributes` on create
  // (CreateDemandSchema already accepts it; only the form was missing).
  const [customAttrs, setCustomAttrs] = useState<Record<string, unknown>>({});
  const [consignorId, setConsignorId] = useState<string | null>(null);
  const [consignorLabel, setConsignorLabel] = useState('');
  const [consigneeId, setConsigneeId] = useState<string | null>(null);
  const [consigneeLabel, setConsigneeLabel] = useState('');
  const [carrierId, setCarrierId] = useState<string | null>(null);
  const [carrierLabel, setCarrierLabel] = useState('');
  const [cargoName, setCargoName] = useState('');
  const [shipperInstructions, setShipperInstructions] = useState('');
  const [transportFacility, setTransportFacility] = useState('');
  const [carNumber, setCarNumber] = useState('');
  const [placesCount, setPlacesCount] = useState('');
  const [shippingDocNo, setShippingDocNo] = useState('');
  const [shippingDocDate, setShippingDocDate] = useState('');
  const [stateContractId, setStateContractId] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [paymentPlannedMoment, setPaymentPlannedMoment] = useState('');
  const [currency, setCurrency] = useState<string>('UZS');
  const [rateOverride, setRateOverride] = useState<string | null>(null);
  const [rateModalOpen, setRateModalOpen] = useState(false);
  const [bankAccountId, setBankAccountId] = useState<string | null>(null);
  const [bankAccountLabel, setBankAccountLabel] = useState('');
  const [description, setDescription] = useState('');
  const [externalCode, setExternalCode] = useState('');
  // «Накладные расходы» (Отгрузка) — sale-side expense lowering «Прибыль».
  // Major units in the input; sent as tiyin. Default «по цене» (PRICE).
  const [overheadMajor, setOverheadMajor] = useState('');
  const [overheadDistribution, setOverheadDistribution] = useState<
    'WEIGHT' | 'PRICE' | 'VOLUME' | 'QUANTITY'
  >('PRICE');

  // VAT toggles
  const [vatEnabled, setVatEnabled] = useState(true);
  const [vatIncluded, setVatIncluded] = useState(false);

  // Positions
  const [positions, setPositions] = useState<NewPositionRow[]>([]);
  // Omborchi varag'i — saqlashsiz, JONLI forma holatidan chiqadi
  // (customer-orders/new dagi o'rnatilgan namuna; varaq yuridik hujjat
  //  emas — ish qog'ozi, shuning uchun hujjat raqami hali bo'lmasa ham).
  const tSheet = useTranslations('pages.pickLists');
  const { sheet, openSheet, closeSheet } = usePickSheet();
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
  // POSITION_COLUMNS is a static module array — override just the «Скидка»
  // header with the bulk discount/markup menu (moysklad parity).
  const positionColumns = useMemo<PositionTableColumnConfig[]>(
    () =>
      POSITION_COLUMNS.map((c) =>
        c.key === 'discount'
          ? {
              ...c,
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
            }
          : c,
      ),
    [applyDiscountMarkup, selectedRowIds, tCols],
  );

  // «Цена ▾» price-type list — labels the per-row quick-pick (mirror supplies).
  const { data: priceTypesData } = useQuery<{ items: Array<{ id: string; name: string }> }>({
    queryKey: ['price-types'],
    queryFn: () => api.get('/price-types'),
  });
  // «Цена ▾» per-row quick-pick — the product's sale prices (Оптом / Sotilish),
  // labelled by price-type name; picking one sets the row price (owner 2026-07-28).
  const positionPriceOptions = useCallback(
    (row: DocPositionRow) => {
      const sps = (row as NewPositionRow).salePrices ?? [];
      return sps.map((sp) => ({
        id: sp.priceTypeId,
        label: priceTypesData?.items.find((pt) => pt.id === sp.priceTypeId)?.name ?? tCols('price'),
        value: sp.value,
      }));
    },
    [priceTypesData, tCols],
  );

  // «Наименование» click → edit that product in an overlay, WITHOUT leaving the
  // (unsaved) shipment (owner 2026-07-28). Conditionally mounted → fresh each open.
  const [editProductId, setEditProductId] = useState<string | null>(null);
  // «Создать новый товар "<query>"» → create in an overlay, then append it as a
  // position (null = closed; a string = open, pre-filling that typed name).
  const [createProductName, setCreateProductName] = useState<string | null>(null);

  // Pickers + error
  const [openPicker, setOpenPicker] = useState<
    | null
    | 'agent'
    | 'org'
    | 'store'
    | 'contract'
    | 'project'
    | 'salesChannel'
    | 'bankAccount'
    | 'consignor'
    | 'consignee'
    | 'carrier'
    | { kind: 'product'; rowUid: string }
  >(null);
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
  // SALES doc → defaultCustomer) + Проект come only from an explicit default.
  const userDefaults = useUserDefaults();
  const defaultsAppliedRef = useRef(false);
  useEffect(() => {
    if (defaultsAppliedRef.current) return;
    if (!orgsData || !storesData) return;
    if (userDefaults.isLoading) return;
    defaultsAppliedRef.current = true;
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
      if (us?.defaultStore) {
        setStoreId(us.defaultStore.id);
        setStoreLabel(us.defaultStore.name);
      } else if (storesData.items[0]) {
        setStoreId(storesData.items[0].id);
        setStoreLabel(storesData.items[0].name);
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
  ]);

  // Live stock for selected positions (keyed by assortmentId)
  const assortmentIds = useMemo(
    () => positions.map((p) => p.assortmentId).filter((id): id is string => !!id),
    [positions],
  );
  const { data: stockData } = useQuery<{ items: Array<{ assortmentId: string; qty: string }> }>({
    queryKey: ['stocks', storeId, assortmentIds.join(',')],
    queryFn: () =>
      api.get(
        `/stocks?storeId=${storeId}&assortmentIds=${encodeURIComponent(assortmentIds.join(','))}`,
      ),
    enabled: !!storeId && assortmentIds.length > 0,
  });
  const stockMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of stockData?.items ?? []) m.set(r.assortmentId, r.qty);
    return m;
  }, [stockData]);

  const addPosition = () => {
    setPositions((ps) => [
      ...ps,
      {
        id: uid(),
        assortmentId: null,
        productLabel: '',
        productUom: null,
        quantity: '1',
        priceMinor: '0',
        discount: '0',
        vat: '12',
        vatEnabled: true,
      },
    ]);
  };
  const updatePosition = (id: string, patch: Partial<NewPositionRow>) => {
    setPositions((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };
  const removePosition = (id: string) => {
    setPositions((ps) => ps.filter((p) => p.id !== id));
  };

  // Totals — BigInt-safe reduce.
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

  // «Вес» / «Объём» footer — same aggregation the detail page uses, so the two
  // pages can never disagree about the same document.
  const measures = useMemo(() => docMeasureTotals(positions), [positions]);

  // Account custom fields (доп. поля). Required-ness is validated by the backend
  // (validateAndNormalize) — an empty required field 400s into the error banner,
  // matching customer-orders/new rather than duplicating the rule client-side.
  const { data: attrMetaData } = useQuery<{ items: AttributeMetaRow[] }>({
    queryKey: ['attribute-metadata-entity', 'Demand'],
    queryFn: () => api.get('/attribute-metadata/entity/Demand'),
    staleTime: 60_000,
  });
  const customFields = [...(attrMetaData?.items ?? [])].sort((a, b) => a.position - b.position);

  const createMut = useMutation({
    mutationFn: async () => {
      // moysklad «＋ Задача» saves the order as a DRAFT (no post, no positions
      // required) so a task can attach to it — draftSaveRef forces that here.
      const asDraft = draftSaveRef.current;
      draftSaveRef.current = false;
      const effApplicable = asDraft ? false : applicable;
      if (!agentId) throw new Error(tForm('select_counterparty'));
      if (!organizationId) throw new Error(tForm('select_organization'));
      if (!storeId) throw new Error(tForm('select_store'));
      // A posted order needs ≥1 position; a draft may be empty (moysklad parity).
      if (effApplicable && positions.length === 0)
        throw new Error(tForm('add_at_least_one_position'));
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
        ...(contractId ? { contractId } : {}),
        ...(projectId ? { projectId } : {}),
        ...(salesChannelId ? { salesChannelId } : {}),
        ...(shipmentAddress ? { shipmentAddress } : {}),
        ...(consignorId ? { consignorId } : {}),
        ...(consigneeId ? { consigneeId } : {}),
        ...(carrierId ? { carrierId } : {}),
        ...(cargoName ? { cargoName } : {}),
        ...(shipperInstructions ? { shipperInstructions } : {}),
        ...(transportFacility ? { transportFacility } : {}),
        ...(carNumber ? { carNumber } : {}),
        ...(placesCount ? { placesCount: Number(placesCount) } : {}),
        ...(shippingDocNo ? { shippingDocNo } : {}),
        ...(shippingDocDate ? { shippingDocDate } : {}),
        ...(stateContractId ? { stateContractId } : {}),
        ...(externalCode ? { externalCode } : {}),
        ...(Number(overheadMajor) > 0
          ? {
              overheadSumMinor: String(BigInt(Math.round(Number(overheadMajor) * 100))),
              overheadDistribution,
              overheadCurrency: currency,
            }
          : {}),
        ...(docNumber ? { name: docNumber } : {}),
        attributes: customAttrs,
        ...(deliveryDate ? { deliveryPlannedMoment: deliveryDate } : {}),
        ...(paymentPlannedMoment ? { paymentPlannedMoment } : {}),
        moment: docDate ? new Date(docDate).toISOString() : undefined,
        applicable: effApplicable,
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
          ...(p.cellId ? { cellId: p.cellId } : {}),
          ...(p.cell ? { cell: p.cell } : {}),
        })),
      };
      return api.post<{ id: string }>('/demands', payload);
    },
    onSuccess: async (created) => {
      const intent = afterSaveRef.current;
      afterSaveRef.current = 'view';
      // Staged files / links / tasks (the related tab works in place before save) —
      // persist them all onto the freshly-created shipment.
      await staging.flush(created.id);
      // «Печать»: open the standalone print view of the freshly-saved shipment,
      // then land on its detail. Everything else lands on the detail page (where
      // the fully-gated «Создать документ» / email composer live).
      if (intent === 'print') {
        const target = printTargetRef.current;
        printTargetRef.current = { kind: 'view' };
        if (target.kind === 'form' && target.templateId) {
          // An account custom form → render its PDF and OPEN IT IN A NEW TAB
          // (moysklad «Открыть в браузере» — the user presses «Печать» there; NOT a
          // save-to-disk download).
          void api.postOpenInBrowser('/demands/bulk-print', {
            ids: [created.id],
            templateId: target.templateId,
          });
        } else {
          window.open(`/print/demand/${created.id}?auto=1`, '_blank', 'width=820,height=1100');
        }
      }
      router.push(`/demands/${created.id}`);
    },
    onError: (err: Error) => setError(err.message),
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
  const consignorFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{
      items: Array<{ id: string; name: string; legalTitle: string | null }>;
    }>(`/counterparties?search=${encodeURIComponent(s)}&limit=50`);
    return d.items.map((c) => ({
      id: c.id,
      primary: c.name,
      secondary: c.legalTitle ?? undefined,
    }));
  };
  const consigneeFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{
      items: Array<{ id: string; name: string; legalTitle: string | null }>;
    }>(`/counterparties?search=${encodeURIComponent(s)}&limit=50`);
    return d.items.map((c) => ({
      id: c.id,
      primary: c.name,
      secondary: c.legalTitle ?? undefined,
    }));
  };
  const carrierFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{
      items: Array<{ id: string; name: string; legalTitle: string | null }>;
    }>(`/counterparties?search=${encodeURIComponent(s)}&limit=50`);
    return d.items.map((c) => ({
      id: c.id,
      primary: c.name,
      secondary: c.legalTitle ?? undefined,
    }));
  };

  const bankAccountFetcher = async (s: string): Promise<PickerItem[]> => {
    if (!organizationId) return [];
    const d = await api.get<{
      items: Array<{
        id: string;
        bankName: string | null;
        accountNumber: string;
        currency: string;
      }>;
    }>(`/bank-accounts?organizationId=${organizationId}&search=${encodeURIComponent(s)}`);
    return d.items
      .filter((a) => a.currency === currency)
      .map((a) => ({
        id: a.id,
        primary: a.accountNumber,
        secondary: a.bankName ?? undefined,
      }));
  };

  // Position name-cell with stock hint
  const renderPositionNameCell = (row: DocPositionRow) => {
    const p = row as NewPositionRow;
    const stockQty = p.assortmentId ? stockMap.get(p.assortmentId) : undefined;
    const wantQty = Number(p.quantity || '0');
    const stockNum = stockQty !== undefined ? Number(stockQty) : undefined;
    const isInsufficient = stockNum !== undefined && wantQty > stockNum;
    // moysklad parity: a picked product's name LINKS to its product card (where the
    // «Аналоги» tab lives). Swapping moves to the row ⋮ «Заменить» (onReplace below).
    const href = p.assortmentId ? `/products/${p.assortmentId}` : undefined;
    return (
      <div className="flex flex-col gap-0.5">
        <PositionNameCell
          imageUrl={p.imageUrl}
          code={p.productCode}
          label={p.productLabel}
          placeholder={tForm('select_product')}
          onPick={() => setOpenPicker({ kind: 'product', rowUid: p.id })}
          productHref={href}
          onNavigate={p.assortmentId ? () => setEditProductId(p.assortmentId) : undefined}
          navigateAsButton
          testId={`pos-${p.id}-name`}
        />
        {stockQty !== undefined && (
          <span
            className={`text-xs tabular-nums ${isInsufficient ? 'font-medium text-[var(--ms-text-destructive)]' : 'text-[var(--ms-text-muted)]'}`}
          >
            {t('stock_available', { qty: stockNum ?? '', uom: p.productUom ?? '' })}
          </span>
        )}
      </div>
    );
  };

  // «Ячейка» — address-storage cell picker. The closure carries storeId + the row's
  // product so the picker can filter «С этим товаром» (mirror purchase-returns/new).
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

  const metaPanel = (
    <DocumentMetaPanel compact>
      <DocumentMetaRow>
        <DocumentMetaField label={tFields('agent')} required>
          <CatalogPickerField
            value={agentId ? { id: agentId, label: agentLabel } : null}
            placeholder={tFields('agent')}
            invalid={agentInvalid}
            onPick={() => setOpenPicker('agent')}
            onClear={() => {
              setAgentId(null);
              setAgentLabel('');
              setContractId(null);
              setContractLabel('');
            }}
            onCreate={() => router.push('/counterparties/new')}
            createLabel={tForm('create_new_counterparty')}
          />
        </DocumentMetaField>
        <DocumentMetaField label={tFields('store')}>
          <CatalogPickerField
            value={storeId ? { id: storeId, label: storeLabel } : null}
            placeholder={tFields('store')}
            onPick={() => setOpenPicker('store')}
            onClear={() => {
              setStoreId(null);
              setStoreLabel('');
            }}
          />
        </DocumentMetaField>
      </DocumentMetaRow>

      <DocumentMetaRow>
        <DocumentMetaField
          label={tFields('organization')}
          required
          helper={
            organizationId ? (
              <CatalogPickerField
                value={bankAccountId ? { id: bankAccountId, label: bankAccountLabel } : null}
                placeholder={tForm('select_bank_account', { currency })}
                onPick={() => setOpenPicker('bankAccount')}
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
            onClear={() => {
              setOrganizationId(null);
              setOrganizationLabel('');
              setBankAccountId(null);
              setBankAccountLabel('');
            }}
          />
        </DocumentMetaField>
        <DocumentMetaField label={tFields('contract')}>
          <CatalogPickerField
            value={contractId ? { id: contractId, label: contractLabel } : null}
            placeholder={agentId ? tFields('contract') : tForm('select_customer_first')}
            onPick={() => agentId && setOpenPicker('contract')}
            onClear={() => {
              setContractId(null);
              setContractLabel('');
            }}
          />
        </DocumentMetaField>
      </DocumentMetaRow>

      <DocumentMetaRow>
        <DocumentMetaField label={tFields('project')}>
          <CatalogPickerField
            value={projectId ? { id: projectId, label: projectLabel } : null}
            placeholder={tFields('project')}
            onPick={() => setOpenPicker('project')}
            onClear={() => {
              setProjectId(null);
              setProjectLabel('');
            }}
            onCreate={() => router.push('/settings/projects/new')}
            createLabel={tForm('create_new_project')}
          />
        </DocumentMetaField>
        <DocumentMetaField label={t('delivery_date')}>
          <Input
            type="date"
            value={deliveryDate}
            onChange={(e) => setDeliveryDate(e.target.value)}
            data-test-id="field-delivery-date"
          />
        </DocumentMetaField>
        <DocumentMetaField label={tFields('payment_planned')}>
          <Input
            type="date"
            value={paymentPlannedMoment}
            onChange={(e) => setPaymentPlannedMoment(e.target.value)}
            data-test-id="field-payment-planned"
          />
        </DocumentMetaField>
      </DocumentMetaRow>

      <DocumentMetaRow>
        <DocumentMetaField label={tFields('sales_channel')}>
          <CatalogPickerField
            value={salesChannelId ? { id: salesChannelId, label: salesChannelLabel } : null}
            placeholder={tFields('sales_channel')}
            onPick={() => setOpenPicker('salesChannel')}
            onClear={() => {
              setSalesChannelId(null);
              setSalesChannelLabel('');
            }}
          />
        </DocumentMetaField>
        <DocumentMetaField label={tFields('delivery_address')}>
          <Input
            value={shipmentAddress}
            onChange={(e) => setShipmentAddress(e.target.value)}
            data-test-id="field-shipment-address"
          />
        </DocumentMetaField>
      </DocumentMetaRow>

      <DocumentMetaRow>
        <DocumentMetaField
          label={tDetailForm('currency')}
          required
          helper={
            currency !== 'UZS' ? (
              <span className="inline-flex items-center gap-2">
                <span className="tabular-nums">
                  1 {currency} ={' '}
                  {Number(effectiveRate).toLocaleString('ru-RU', {
                    maximumFractionDigits: 4,
                  })}{' '}
                  UZS
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
      {/* Account custom fields (доп. поля — «Уста», «Санаси» …). The detail page
          has always had these; /new did not, so a required custom field made the
          shipment IMPOSSIBLE to create from this form (backend 400s on save and
          the form offers no input). Mirrors customer-orders/new. */}
      {customFields.length > 0 && (
        <DocumentMetaRow>
          {customFields.map((m) => (
            <DocumentMetaField key={m.id} label={m.name} required={m.required}>
              <AttributeInput
                meta={m}
                value={customAttrs[m.code]}
                onChange={(v) =>
                  setCustomAttrs((prev) => {
                    if (v === '' || v == null) {
                      const next = { ...prev };
                      delete next[m.code];
                      return next;
                    }
                    return { ...prev, [m.code]: v };
                  })
                }
                testId={`field-attr-${m.code}`}
              />
            </DocumentMetaField>
          ))}
        </DocumentMetaRow>
      )}
    </DocumentMetaPanel>
  );

  const tabs = [
    {
      key: 'main',
      // moysklad old-design create form: the first tab is «Главная» (2026-07-09).
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
            renderCellCell={renderPositionCellCell}
            priceOptions={positionPriceOptions}
            // moysklad row ⋮ «Заменить» — swap the line's product (the name is now a
            // card link, so swapping moves here). Opens the per-row product picker.
            onReplace={(id) => setOpenPicker({ kind: 'product', rowUid: id })}
            vatIncluded={vatIncluded}
            selectedIds={selectedRowIds}
            onSelectionChange={setSelectedRowIds}
            footerToolbar={
              <PositionInlineAdd
                onSearch={async (q) => {
                  const r = await api.get<{ items: ProductItem[] }>(
                    `/products?search=${encodeURIComponent(q)}&limit=20`,
                  );
                  return r.items.map((p) => ({
                    id: p.id,
                    primary: p.name,
                    secondary: p.code ?? undefined,
                    // Band 1 pick modal: «Остаток» line needs the stock figure.
                    available: p.stock?.available != null ? Number(p.stock.available) : 0,
                    priceMinor: resolveDefaultSalePriceOrZero(p.salePrices),
                    uomLabel: p.uom ?? undefined,
                    raw: p,
                  }));
                }}
                createProductLabel={(q) => tPos('createProductNamed', { query: q })}
                onCreateProduct={(q) => setCreateProductName(q)}
                // Owner 2026-07-28: product picks add DIRECTLY — no qty/price modal
                // (moysklad's Отгрузка add-line has none). Price defaults to the
                // product's sale price; the search box clears.
                clearQueryOnPick
                onPick={(item, entry) => {
                  const raw = item.raw as ProductItem | undefined;
                  const defaultPrice = resolveDefaultSalePriceOrZero(raw?.salePrices);
                  const newId = uid();
                  setPositions((ps) => [
                    ...ps,
                    {
                      id: newId,
                      assortmentId: item.id,
                      productLabel: item.primary,
                      productUom: raw?.uom ?? null,
                      quantity: entry?.quantity ?? '1',
                      priceMinor: entry?.priceMinor ?? defaultPrice,
                      discount: '0',
                      vat: raw?.vat != null ? String(raw.vat) : '12',
                      vatEnabled: true,
                      salePrices: raw?.salePrices ?? null,
                      weightG: raw?.weightG ?? undefined,
                      volumeML: raw?.volumeML ?? undefined,
                    },
                  ]);
                  // owner 2026-07-18: returning the id hands focus to the new
                  // row's «Кол-во» (modal → table entry chain).
                  return newId;
                }}
                onAddFromCatalog={addPosition}
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
                      const defaultPrice = resolveDefaultSalePriceOrZero(raw?.salePrices);
                      return {
                        id: uid(),
                        assortmentId: item.id,
                        productLabel: item.primary,
                        productUom: raw?.uom ?? null,
                        quantity: Number(quantity) > 0 ? quantity : '1',
                        priceMinor: defaultPrice,
                        discount: '0',
                        vat: raw?.vat != null ? String(raw.vat) : '12',
                        vatEnabled: true,
                        salePrices: raw?.salePrices ?? null,
                        weightG: raw?.weightG ?? undefined,
                        volumeML: raw?.volumeML ?? undefined,
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
              weight={measures.weight}
              volume={measures.volume}
              // A draft has no FIFO cost yet, so real profit is unknowable. moysklad
              // still shows the row — render it with «—» rather than dropping it
              // (layout parity) or printing revenue as profit (a dangerous mis-read).
              profitUnknown
            />
          </div>

          {/* «Задачи» / «Файлы» now have their own tabs (moysklad new-design) — the
              old inline «save after» disclosures were removed to avoid duplication. */}
          {/* «Грузоотправитель» — moysklad groups the 10 shipping fields under
              this heading (capture demand-02-detail: shippingBlock_Грузоотправитель).
              We had them inside a generic «Другие поля» mixed with our own extras. */}
          <DocumentDisclosurePanel title={tFields('consignor')} defaultOpen={false}>
            <DocumentMetaPanel compact>
              <DocumentMetaRow>
                <DocumentMetaField label={tFields('consignor')}>
                  <CatalogPickerField
                    value={consignorId ? { id: consignorId, label: consignorLabel } : null}
                    placeholder={tFields('consignor')}
                    onPick={() => setOpenPicker('consignor')}
                    onClear={() => {
                      setConsignorId(null);
                      setConsignorLabel('');
                    }}
                  />
                </DocumentMetaField>
                <DocumentMetaField label={tFields('consignee')}>
                  <CatalogPickerField
                    value={consigneeId ? { id: consigneeId, label: consigneeLabel } : null}
                    placeholder={tFields('consignee')}
                    onPick={() => setOpenPicker('consignee')}
                    onClear={() => {
                      setConsigneeId(null);
                      setConsigneeLabel('');
                    }}
                  />
                </DocumentMetaField>
              </DocumentMetaRow>

              <DocumentMetaRow>
                <DocumentMetaField label={tFields('carrier')}>
                  <CatalogPickerField
                    value={carrierId ? { id: carrierId, label: carrierLabel } : null}
                    placeholder={tFields('carrier')}
                    onPick={() => setOpenPicker('carrier')}
                    onClear={() => {
                      setCarrierId(null);
                      setCarrierLabel('');
                    }}
                  />
                </DocumentMetaField>
                <DocumentMetaField label={tFields('cargo_name')}>
                  <Input
                    value={cargoName}
                    onChange={(e) => setCargoName(e.target.value)}
                    data-test-id="field-cargo-name"
                  />
                </DocumentMetaField>
              </DocumentMetaRow>

              <DocumentMetaRow>
                <DocumentMetaField label={tFields('transport_facility')}>
                  <Input
                    value={transportFacility}
                    onChange={(e) => setTransportFacility(e.target.value)}
                    data-test-id="field-transport-facility"
                  />
                </DocumentMetaField>
                <DocumentMetaField label={tFields('car_number')}>
                  <Input
                    value={carNumber}
                    onChange={(e) => setCarNumber(e.target.value)}
                    data-test-id="field-car-number"
                  />
                </DocumentMetaField>
              </DocumentMetaRow>

              <DocumentMetaRow>
                <DocumentMetaField label={tFields('places_count')}>
                  <Input
                    type="number"
                    min="0"
                    value={placesCount}
                    onChange={(e) => setPlacesCount(e.target.value)}
                    data-test-id="field-places-count"
                  />
                </DocumentMetaField>
                <DocumentMetaField label={tFields('shipping_doc_no')}>
                  <Input
                    value={shippingDocNo}
                    onChange={(e) => setShippingDocNo(e.target.value)}
                    data-test-id="field-shipping-doc-no"
                  />
                </DocumentMetaField>
              </DocumentMetaRow>

              <DocumentMetaRow>
                <DocumentMetaField label={tFields('shipping_doc_date')}>
                  <Input
                    type="date"
                    value={shippingDocDate}
                    onChange={(e) => setShippingDocDate(e.target.value)}
                    data-test-id="field-shipping-doc-date"
                  />
                </DocumentMetaField>
                <DocumentMetaField label={tFields('state_contract_id')}>
                  <Input
                    value={stateContractId}
                    onChange={(e) => setStateContractId(e.target.value)}
                    data-test-id="field-state-contract-id"
                  />
                </DocumentMetaField>
              </DocumentMetaRow>

              <DocumentMetaRow>
                <DocumentMetaField label={tFields('shipper_instructions')} fullWidth>
                  <Input
                    value={shipperInstructions}
                    onChange={(e) => setShipperInstructions(e.target.value)}
                    data-test-id="field-shipper-instructions"
                  />
                </DocumentMetaField>
              </DocumentMetaRow>
            </DocumentMetaPanel>
          </DocumentDisclosurePanel>

          {/* «Другие поля» — the fields that are OURS, not moysklad's shipping
              block: Внешний код + Накладные расходы. Kept in a separate
              disclosure so the «Грузоотправитель» block above is a faithful
              1:1 of the capture's 10-field group instead of a mixed bag. */}
          <DocumentDisclosurePanel title={tForm('other_fields')} defaultOpen={false}>
            <DocumentMetaPanel compact>
              <DocumentMetaRow>
                <DocumentMetaField label={tDetailForm('external_code')}>
                  <Input
                    value={externalCode}
                    onChange={(e) => setExternalCode(e.target.value)}
                    data-test-id="field-external-code"
                  />
                </DocumentMetaField>
              </DocumentMetaRow>

              <DocumentMetaRow>
                <DocumentMetaField label={tDetailForm('overhead_sum')}>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={overheadMajor}
                    placeholder="0"
                    onChange={(e) => setOverheadMajor(e.target.value)}
                    data-test-id="field-overhead-sum"
                  />
                </DocumentMetaField>
                <DocumentMetaField label={tDetailForm('overhead_distribution')}>
                  <NativeSelect
                    value={overheadDistribution}
                    onChange={(e) =>
                      setOverheadDistribution(
                        e.target.value as 'WEIGHT' | 'PRICE' | 'VOLUME' | 'QUANTITY',
                      )
                    }
                    data-test-id="field-overhead-distribution"
                    disabled={!(Number(overheadMajor) > 0)}
                  >
                    <option value="PRICE">{tDetailForm('overhead_by_price')}</option>
                    <option value="WEIGHT">{tDetailForm('overhead_by_weight')}</option>
                    <option value="VOLUME">{tDetailForm('overhead_by_volume')}</option>
                    <option value="QUANTITY">{tDetailForm('overhead_by_quantity')}</option>
                  </NativeSelect>
                </DocumentMetaField>
              </DocumentMetaRow>
            </DocumentMetaPanel>
          </DocumentDisclosurePanel>
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
            kind: 'demand',
          }}
          entityType="Demand"
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
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled
                    data-test-id="events-watch-button"
                  >
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
                  data-test-id="events-comment-input"
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

  return (
    <>
      <DocumentEditor
        {...docEditorLabels}
        testId="demand-new-page"
        documentTypeLabel={tDetailTitles('demand')}
        number={docNumber}
        onNumberChange={setDocNumber}
        date={docDate}
        onDateChange={setDocDate}
        status={status}
        statusOptions={STATUS_OPTIONS}
        onStatusChange={setStatus}
        applicable={applicable}
        onApplicableChange={setApplicable}
        applicableHelp={t('applicable_help')}
        waiting={undefined}
        onSave={() => {
          setError(null);
          createMut.mutate();
        }}
        saving={createMut.isPending}
        onClose={() => router.push('/demands')}
        modifyMenu={[
          // moysklad «Изменить» = [Удалить, Копировать]. On /new: Копировать saves
          // then lands on the shipment detail (where the clone action lives); Удалить
          // discards back to the list.
          {
            label: tBulk('copy'),
            onClick: () => {
              afterSaveRef.current = 'view';
              setError(null);
              createMut.mutate();
            },
          },
          {
            label: tBulk('delete'),
            onClick: () => router.push('/demands'),
            destructive: true,
          },
        ]}
        createDocMenu={[
          // moysklad «Создать документ» for a shipment. Each saves the shipment
          // first, then lands on its detail page — where the fully state-gated
          // «Создать документ» menu (incl. «Возврат покупателя» on a posted
          // shipment) lives. No dead-ends: the downstream targets that lack a
          // from-demand backend stay on the detail rather than opening a blank form.
          ...(
            [
              tDetailTitles('move'),
              tDetailTitles('invoice_out'),
              tCreate('facture_out'),
              tDetailTitles('payment_in'),
              tDetailTitles('cash_in'),
              tCreate('sales_return'),
            ] as const
          ).map((label) => ({
            label,
            onClick: () => {
              afterSaveRef.current = 'view';
              setError(null);
              createMut.mutate();
            },
          })),
        ]}
        printMenu={[
          // moysklad «Печать»: the account's own custom forms first, then the
          // standard «Бланк документа», then «Настроить…». Each form saves the
          // shipment first (it can't print before it exists), then renders;
          // «Настроить…» opens the template slide-over (no save needed).
          ...printForms.map((f) => ({
            label: f.name,
            onClick: () => {
              printTargetRef.current = { kind: 'form' as const, templateId: f.id };
              afterSaveRef.current = 'print' as const;
              setError(null);
              createMut.mutate();
            },
          })),
          {
            label: tPrint('document_blank'),
            onClick: () => {
              printTargetRef.current = { kind: 'view' };
              afterSaveRef.current = 'print';
              setError(null);
              createMut.mutate();
            },
          },
          {
            // «Yig'ish varag'i» — omborchi jo'natma uchun tovarni javondan yig'adi.
            // Saqlash SHART EMAS: varaq joriy forma pozitsiyalaridan chiqadi
            // (saqlangan jo'natmada ham xuddi shu band bor — demands/[id]).
            label: tSheet('spiska_form'),
            onClick: () =>
              void openSheet({
                title: tSheet('sheet_title_pick'),
                number: docNumber || '—',
                moment: docDate,
                agentName: agentLabel || null,
                ownerName: user?.name ?? null,
                description: description || null,
                rows: positions,
              }),
          },
          { divider: true, label: '' },
          { label: tPrint('configure'), onClick: () => openTemplates('demand') },
        ]}
        sendMenu={[
          // «Отправить» — save then land on the detail (the email composer lives there).
          {
            label: tPrint('document_blank'),
            onClick: () => {
              afterSaveRef.current = 'view';
              setError(null);
              createMut.mutate();
            },
          },
        ]}
        // moysklad pins each configured print form as its OWN button right after
        // «Отправить». Each saves the shipment first, then renders that form's PDF.
        trailingSlot={printForms.map((f) => (
          <Button
            key={f.id}
            type="button"
            variant="secondary"
            size="sm"
            // «Past ko'k» — check-print type buttons stand out in a soft blue
            // (brand-100 fill · brand-600 text · brand-300 border), matching
            // supplies/new + PO/new. Owner request 2026-07-15/16.
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
        rightSlot={
          user ? (
            <div className="text-right text-xs leading-tight">
              <div className="font-medium text-[var(--ms-text-primary)]">{user.name}</div>
              <div className="text-[var(--ms-text-muted)]">
                {user.position ?? tDetailHeader('role_primary')}
              </div>
            </div>
          ) : null
        }
        error={error}
        onErrorRetry={() => {
          setError(null);
          createMut.mutate();
        }}
      >
        <>
          {metaPanel}
          <DocumentTabs tabs={tabs} defaultActiveKey="main" />
        </>
      </DocumentEditor>

      <CatalogPicker
        open={openPicker === 'agent'}
        onClose={() => setOpenPicker(null)}
        title={tFields('agent')}
        fetcher={agentFetcher}
        onSelect={(item) => {
          setAgentInvalid(false);
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
        open={openPicker === 'consignor'}
        onClose={() => setOpenPicker(null)}
        title={tFields('consignor')}
        fetcher={consignorFetcher}
        onSelect={(item) => {
          setConsignorId(item.id);
          setConsignorLabel(String(item.primary));
        }}
      />
      <CatalogPicker
        open={openPicker === 'consignee'}
        onClose={() => setOpenPicker(null)}
        title={tFields('consignee')}
        fetcher={consigneeFetcher}
        onSelect={(item) => {
          setConsigneeId(item.id);
          setConsigneeLabel(String(item.primary));
        }}
      />
      <CatalogPicker
        open={openPicker === 'carrier'}
        onClose={() => setOpenPicker(null)}
        title={tFields('carrier')}
        fetcher={carrierFetcher}
        onSelect={(item) => {
          setCarrierId(item.id);
          setCarrierLabel(String(item.primary));
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
        open={
          typeof openPicker === 'object' && openPicker !== null && openPicker.kind === 'product'
        }
        onClose={() => setOpenPicker(null)}
        title={tForm('product_picker_title')}
        fetcher={productFetcher}
        onSelect={(item) => {
          if (typeof openPicker !== 'object' || openPicker === null) return;
          const raw = (item as PickerItem & { raw?: ProductItem }).raw;
          const defaultPrice = resolveDefaultSalePriceOrZero(raw?.salePrices);
          updatePosition(openPicker.rowUid, {
            assortmentId: item.id,
            productLabel: String(item.primary),
            productUom: raw?.uom ?? null,
            priceMinor: defaultPrice,
            vat: raw?.vat != null ? String(raw.vat) : '12',
            salePrices: raw?.salePrices ?? null,
            // «Заменить» swaps the product — the measures must follow it, else the
            // footer keeps the OLD product's weight.
            weightG: raw?.weightG ?? undefined,
            volumeML: raw?.volumeML ?? undefined,
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
      {editProductId && (
        <ProductEditModal productId={editProductId} open onClose={() => setEditProductId(null)} />
      )}
      {createProductName !== null && (
        <ProductCreateModal
          open
          initialName={createProductName}
          onClose={() => setCreateProductName(null)}
          onCreated={async (created) => {
            try {
              const res = await api.get<{
                name: string;
                uom: string | null;
                buyPrice: string | null;
                vat?: number | null;
                salePrices?: Array<{ priceTypeId: string; value: string }> | null;
              }>(`/products/${created.id}`);
              setPositions((ps) => [
                ...ps,
                {
                  id: uid(),
                  assortmentId: created.id,
                  productLabel: res.name,
                  productUom: res.uom ?? null,
                  quantity: '1',
                  priceMinor: resolveDefaultSalePriceOrZero(res.salePrices),
                  discount: '0',
                  vat: res.vat != null ? String(res.vat) : '12',
                  vatEnabled: true,
                  salePrices: res.salePrices ?? null,
                },
              ]);
            } catch {
              // product created but couldn't fetch to append — non-fatal
            }
          }}
        />
      )}
      {sheet && <ReceiptPrintPortal data={sheet} onClose={closeSheet} />}
    </>
  );
}
