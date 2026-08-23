'use client';

/**
 * /demands/[id] — moysklad-parity «Отгрузка» detail editor.
 *
 * Converged (2026-07-06) onto the SAME shell the certified customer-orders/[id]
 * + supplies/[id] use: DetailToolbar + editable <DocumentHeader> (custom «Статус»
 * pill via the immediate setStatus endpoint, «Проведено» FSM toggle, «Не оплачено»
 * pill) + three-column <DocumentMetaColumns> + <PositionTable> (moysklad grid with
 * «Остаток» reddened at ≤ 0, inline «Добавить позицию» search, «Цена ▾» menu,
 * column ⚙) + <DocumentTotalsPanel labels={totalsLabels}>. Demand-only bits (Накладные расходы, cost,
 * the transport block, the from-CustomerOrder cascade, the stock-shortage post
 * error, «Возврат покупателя») are preserved; the transport/overhead/shipping
 * fields move into a «Другие поля» disclosure exactly like /demands/new + moysklad.
 *
 * Deferred (honest — needs backend the account doesn't have yet):
 *  - «Маркировка» column: the marked-goods (Честный знак) subsystem is separate;
 *    not wired to demand positions. Not faked.
 *
 * Closed since: «Ячейка» per-position column (2026-07-30 — demand_positions.cell_id
 * migration + CellPickerField; cellId reaches the StockDelta on post/unpost/cancel).
 */

import { AttachmentsSection } from '@/components/attachments-section';
import { AttributeInput, type AttributeMetaRow } from '@/components/attributes-editor';
import { RelatedDocsTab } from '@/components/customer-orders/related-docs-tab';
import {
  type CreateMenuItem,
  DetailContentTabs,
  DetailToolbar,
  DocumentHistoryLink,
} from '@/components/document-detail';
import { CurrencyRateModal } from '@/components/document-detail/currency-rate-modal';
import { DocumentTasksSection } from '@/components/document-tasks-section';
import { CellPickerField } from '@/components/documents/cell-picker-field';
import { PositionAgreementButton } from '@/components/documents/position-agreement-modal';
import { PositionColumnCustomizer } from '@/components/documents/position-column-customizer';
import { PositionDiscountMenu } from '@/components/documents/position-discount-menu';
import { PositionPriceMenu } from '@/components/documents/position-price-menu';
import {
  type CustomerReceiptData,
  CustomerReceiptPortal,
} from '@/components/pick-list/customer-receipt-portal';
import { ReceiptPrintPortal, receiptDate } from '@/components/pick-list/receipt-print-portal';
import { usePrintTemplatesManager } from '@/components/print/print-templates-provider';
import { ProductCreateModal } from '@/components/products/product-create-modal';
import { ProductEditModal } from '@/components/products/product-edit-modal';
import { SendEmailDialog } from '@/components/send-email-dialog';
import { useApiMutation } from '@/hooks/use-api-mutation';
import { useConflictReload } from '@/hooks/use-conflict-reload';
import { useDestructiveMutation } from '@/hooks/use-destructive-mutation';
import { useDetailNavigation } from '@/hooks/use-detail-navigation';
import { useDocumentEditorLabels } from '@/hooks/use-document-editor-labels';
import { usePickSheet } from '@/hooks/use-pick-sheet';
import { useSaveMutation } from '@/hooks/use-save-mutation';
import { useTotalsLabels } from '@/hooks/use-totals-labels';
import { useUnsavedGuard } from '@/hooks/use-unsaved-guard';
import { api } from '@/lib/api-client';
import { computeLineTotalSafe, docMeasureTotals } from '@/lib/doc-totals';
import { imageRawUrl } from '@/lib/image-url';
import { distributeAgreementDelta } from '@/lib/position-agreement';
import { buildPrintMenu } from '@/lib/print-menu';
import { resolveDefaultSalePriceOrZero, usePriceTypeIds } from '@/lib/sale-price';
import {
  Alert,
  CatalogPicker,
  CatalogPickerField,
  DatePicker,
  type DocPositionRow,
  DocumentDisclosurePanel,
  DocumentHeader,
  DocumentMetaColumn,
  DocumentMetaColumns,
  DocumentMetaField,
  DocumentTotalsPanel,
  Input,
  NativeSelect,
  type PickerItem,
  type PositionColumnKey,
  PositionInlineAdd,
  PositionNameCell,
  PositionTable,
  type PositionTableColumnConfig,
  Textarea,
  currencyDisplayName,
  formatDate,
  useToast,
} from '@moysklad/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

interface PositionDetail {
  id: string;
  position: number;
  assortmentKind: string;
  assortmentId: string;
  quantity: string;
  priceMinor: string;
  discount: string;
  vat: number | null;
  vatEnabled: boolean;
  costMinor: string | null;
  customerOrderPositionId: string | null;
  // «Ячейка» — address-storage bin: `cellId` (FK, drives the picker) + `cell` (label).
  cellId: string | null;
  cell: string | null;
  product: {
    id: string;
    name: string;
    code: string | null;
    article: string | null;
    uom: string | null;
    weightG: number | null;
    volumeML: number | null;
    images?: { id: string }[];
  } | null;
}

interface DemandDetail {
  id: string;
  version: number;
  name: string;
  externalCode: string | null;
  overheadSumMinor: string;
  overheadDistribution: string;
  state: string;
  /** Account-defined custom status (moysklad «Статус»). Null until one is chosen. */
  status: { id: string; name: string; color: string | null } | null;
  applicable: boolean;
  moment: string;
  postedAt: string | null;
  description: string | null;
  sumMinor: string;
  currency: string;
  /** Per-document FX rate snapshot, 8-dp minor units. */
  rateValue: string | null;
  payedSumMinor: string;
  vatSumMinor: string;
  costSumMinor: string;
  vatEnabled: boolean;
  vatIncluded: boolean;
  agent: { id: string; name: string; legalTitle: string | null; companyType: string };
  organization: { id: string; name: string; legalTitle: string | null };
  store: { id: string; name: string };
  owner: { id: string; name: string } | null;
  customerOrder: { id: string; name: string; state: string } | null;
  salesChannel: { id: string; name: string } | null;
  contract: { id: string; name: string } | null;
  project: { id: string; name: string } | null;
  organizationAccount: { id: string; name: string; accountNumber: string | null } | null;
  deliveryPlannedMoment: string | null;
  paymentPlannedMoment: string | null;
  shipmentAddress: string | null;
  consignor: { id: string; name: string } | null;
  consignee: { id: string; name: string } | null;
  carrier: { id: string; name: string } | null;
  cargoName: string | null;
  shipperInstructions: string | null;
  transportFacility: string | null;
  carNumber: string | null;
  placesCount: number | null;
  shippingDocNo: string | null;
  shippingDocDate: string | null;
  stateContractId: string | null;
  positions: PositionDetail[];
  createdAt: string;
  updatedAt: string;
}

interface ProductItem {
  id: string;
  name: string;
  code: string | null;
  article: string | null;
  uom: string | null;
  salePrices: Array<{ priceTypeId: string; value: string }> | null;
  vat: number | null;
  stock?: { onHand: string; reserved: string; inTransit: string; available: string } | null;
  weightG?: number | null;
  volumeML?: number | null;
  mainImageId?: string | null;
}

// Detail-page position row — the PositionTable row shape (keyed on `id`).
interface DetailPositionRow extends DocPositionRow {
  assortmentId: string | null;
  salePrices?: Array<{ priceTypeId: string; value: string }> | null;
}

function uid(): string {
  return Math.random().toString(36).slice(2);
}

/** ISO moment (UTC) → local `YYYY-MM-DDTHH:MM` for the shared <DocumentHeader>. */
function momentToLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// moysklad grid = fixed columns + optional ones toggled by the «Сумма ⚙»
// customizer. Default-visible: stock + vatAmount (a shipment shows «Остаток»);
// image / available / unit(inline) / weight / volume OFF by default.
const OPTIONAL_POSITION_COLUMNS: { key: PositionColumnKey; on: boolean }[] = [
  { key: 'image', on: false },
  { key: 'unit', on: true },
  { key: 'code', on: false },
  { key: 'article', on: false },
  { key: 'stock', on: true },
  { key: 'available', on: false },
  { key: 'weight', on: false },
  { key: 'volume', on: false },
  { key: 'vatAmount', on: true },
];
const DEFAULT_COL_VISIBLE: Record<string, boolean> = Object.fromEntries(
  OPTIONAL_POSITION_COLUMNS.map((c) => [c.key, c.on]),
);

// moysklad inline state-change palette (demand FSM). The custom «Статус» pill
// overrides this when the account defines statuses.
const DEMAND_STATE_COLOR: Record<string, string> = {
  draft: '#9ca3af',
  posted: '#16a34a',
  cancelled: '#e92919',
};
// Demand FSM transitions are verb-based (post/unpost/cancel).
const DEMAND_STATE_VERB: Record<string, string> = {
  draft: 'unpost',
  posted: 'post',
  cancelled: 'cancel',
};
const DEMAND_STATES = ['draft', 'posted', 'cancelled'] as const;

interface FormState {
  name: string;
  moment: string;
  agentId: string;
  agentLabel: string;
  organizationId: string;
  organizationLabel: string;
  storeId: string;
  storeLabel: string;
  salesChannelId: string | null;
  salesChannelLabel: string;
  contractId: string | null;
  contractLabel: string;
  projectId: string | null;
  projectLabel: string;
  organizationAccountId: string | null;
  organizationAccountLabel: string;
  currency: string;
  deliveryPlannedMoment: string | null;
  paymentPlannedMoment: string | null;
  shipmentAddress: string;
  consignorId: string | null;
  consignorLabel: string;
  consigneeId: string | null;
  consigneeLabel: string;
  carrierId: string | null;
  carrierLabel: string;
  cargoName: string;
  shipperInstructions: string;
  transportFacility: string;
  carNumber: string;
  placesCount: string;
  shippingDocNo: string;
  shippingDocDate: string;
  stateContractId: string;
  externalCode: string;
  overheadMajor: string;
  overheadDistribution: 'WEIGHT' | 'PRICE' | 'VOLUME' | 'QUANTITY';
  description: string;
  vatEnabled: boolean;
  vatIncluded: boolean;
  positions: DetailPositionRow[];
  attributes: Record<string, unknown>;
}

function formFromData(d: DemandDetail): FormState {
  return {
    name: d.name,
    moment: momentToLocalInput(d.moment),
    agentId: d.agent.id,
    agentLabel: d.agent.name,
    organizationId: d.organization.id,
    organizationLabel: d.organization.name,
    storeId: d.store.id,
    storeLabel: d.store.name,
    salesChannelId: d.salesChannel?.id ?? null,
    salesChannelLabel: d.salesChannel?.name ?? '',
    contractId: d.contract?.id ?? null,
    contractLabel: d.contract?.name ?? '',
    projectId: d.project?.id ?? null,
    projectLabel: d.project?.name ?? '',
    organizationAccountId: d.organizationAccount?.id ?? null,
    organizationAccountLabel:
      d.organizationAccount?.accountNumber || d.organizationAccount?.name || '',
    currency: d.currency,
    deliveryPlannedMoment: d.deliveryPlannedMoment ? d.deliveryPlannedMoment.slice(0, 10) : null,
    paymentPlannedMoment: d.paymentPlannedMoment ? d.paymentPlannedMoment.slice(0, 10) : null,
    shipmentAddress: d.shipmentAddress ?? '',
    consignorId: d.consignor?.id ?? null,
    consignorLabel: d.consignor?.name ?? '',
    consigneeId: d.consignee?.id ?? null,
    consigneeLabel: d.consignee?.name ?? '',
    carrierId: d.carrier?.id ?? null,
    carrierLabel: d.carrier?.name ?? '',
    cargoName: d.cargoName ?? '',
    shipperInstructions: d.shipperInstructions ?? '',
    transportFacility: d.transportFacility ?? '',
    carNumber: d.carNumber ?? '',
    placesCount: d.placesCount != null ? String(d.placesCount) : '',
    shippingDocNo: d.shippingDocNo ?? '',
    shippingDocDate: d.shippingDocDate ? d.shippingDocDate.slice(0, 10) : '',
    stateContractId: d.stateContractId ?? '',
    externalCode: d.externalCode ?? '',
    overheadMajor:
      d.overheadSumMinor && d.overheadSumMinor !== '0'
        ? (Number(d.overheadSumMinor) / 100).toString()
        : '',
    overheadDistribution: (['WEIGHT', 'PRICE', 'VOLUME', 'QUANTITY'] as const).includes(
      d.overheadDistribution as 'WEIGHT' | 'PRICE' | 'VOLUME' | 'QUANTITY',
    )
      ? (d.overheadDistribution as 'WEIGHT' | 'PRICE' | 'VOLUME' | 'QUANTITY')
      : 'PRICE',
    description: d.description ?? '',
    vatEnabled: d.vatEnabled,
    vatIncluded: d.vatIncluded,
    positions: d.positions.map((p) => ({
      id: p.id,
      assortmentId: p.assortmentId,
      productLabel: p.product?.name ?? '—',
      productCode: p.product?.code ?? undefined,
      productArticle: p.product?.article ?? undefined,
      productUom: p.product?.uom ?? null,
      quantity: p.quantity,
      priceMinor: p.priceMinor,
      discount: p.discount,
      vat: p.vat != null ? String(p.vat) : '',
      vatEnabled: p.vatEnabled,
      weightG: p.product?.weightG ?? undefined,
      volumeML: p.product?.volumeML ?? undefined,
      imageUrl: p.product?.images?.[0]?.id ? imageRawUrl(p.product.images[0].id) : undefined,
      salePrices: null,
      cellId: p.cellId ?? null,
      cell: p.cell ?? undefined,
    })),
    attributes: (d as { attributes?: Record<string, unknown> }).attributes ?? {},
  };
}

function snapshot(s: FormState): string {
  return JSON.stringify({
    name: s.name,
    moment: s.moment,
    agentId: s.agentId,
    organizationId: s.organizationId,
    storeId: s.storeId,
    salesChannelId: s.salesChannelId,
    contractId: s.contractId,
    projectId: s.projectId,
    organizationAccountId: s.organizationAccountId,
    currency: s.currency,
    deliveryPlannedMoment: s.deliveryPlannedMoment,
    paymentPlannedMoment: s.paymentPlannedMoment,
    shipmentAddress: s.shipmentAddress,
    consignorId: s.consignorId,
    consigneeId: s.consigneeId,
    carrierId: s.carrierId,
    cargoName: s.cargoName,
    shipperInstructions: s.shipperInstructions,
    transportFacility: s.transportFacility,
    carNumber: s.carNumber,
    placesCount: s.placesCount,
    shippingDocNo: s.shippingDocNo,
    shippingDocDate: s.shippingDocDate,
    stateContractId: s.stateContractId,
    externalCode: s.externalCode,
    overheadMajor: s.overheadMajor,
    overheadDistribution: s.overheadDistribution,
    description: s.description,
    vatEnabled: s.vatEnabled,
    vatIncluded: s.vatIncluded,
    positions: s.positions.map((p) => ({
      assortmentId: p.assortmentId,
      quantity: p.quantity,
      priceMinor: p.priceMinor,
      discount: p.discount,
      vat: p.vat,
      vatEnabled: p.vatEnabled,
      // Part of the dirty-check snapshot — re-picking a bin must mark the form dirty.
      cell: p.cell ?? null,
    })),
    attributes: s.attributes,
  });
}

export default function DemandDetailPage() {
  const tCommon = useTranslations('common');
  const totalsLabels = useTotalsLabels();
  const tFields = useTranslations('fields');
  const tForm = useTranslations('form');
  const tDetailForm = useTranslations('detail_form');
  const docEditorLabels = useDocumentEditorLabels();
  const tDetailHeader = useTranslations('detail_header');
  const tDetailTitles = useTranslations('detail_titles');
  const tStates = useTranslations('states.demand');
  const tDetailTabs = useTranslations('detail_tabs');
  const tEmail = useTranslations('email_template');
  const tPos = useTranslations('position_editor');
  const tCols = useTranslations('position_cols');
  const tCreate = useTranslations('create_related');
  const tPrintMenu = useTranslations('print_menu');
  const tSpiska = useTranslations('pages.pickLists');
  const { openTemplates } = usePrintTemplatesManager();
  const { data: printForms } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ['demand-print-forms'],
    queryFn: () => api.get<Array<{ id: string; name: string }>>('/demands/print-forms'),
    staleTime: 60_000,
  });
  const tDemands = useTranslations('pages.demands');
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const detailNav = useDetailNavigation('demands', id, { server: true });
  const { toast } = useToast();
  const { defaultId } = usePriceTypeIds();

  const { data: priceTypesData } = useQuery<{ items: Array<{ id: string; name: string }> }>({
    queryKey: ['price-types'],
    queryFn: () => api.get('/price-types'),
    staleTime: 60_000,
  });

  // «Наименование» click → edit that product in an overlay (owner 2026-07-28);
  // «Создать товар "<q>"» → create in an overlay then append (null = closed).
  const [editProductId, setEditProductId] = useState<string | null>(null);
  const [createProductName, setCreateProductName] = useState<string | null>(null);
  // «Цена ▾» per-row quick-pick — the product's sale prices, labelled by
  // price-type name; picking one sets the row price (mirror /new + supplies).
  const positionPriceOptions = useCallback(
    (row: DocPositionRow) => {
      const sps = (row as DetailPositionRow).salePrices ?? [];
      return sps.map((sp) => ({
        id: sp.priceTypeId,
        label: priceTypesData?.items.find((pt) => pt.id === sp.priceTypeId)?.name ?? tCols('price'),
        value: sp.value,
      }));
    },
    [priceTypesData, tCols],
  );

  const { data, isLoading } = useQuery<DemandDetail>({
    queryKey: ['demand', id],
    queryFn: () => api.get(`/demands/${id}`),
  });

  // «Связанные документы» — the real relation chain (upstream Заказ покупателя +
  // downstream Возвраты / Счета-фактуры / Перемещения), fed to <RelatedDocsTab>.
  interface RelatedDoc {
    id: string;
    name: string;
    moment: string;
    state: string;
    sumMinor: string;
  }
  const { data: related } = useQuery<{
    customerOrder: RelatedDoc | null;
    salesReturns: RelatedDoc[];
    moves: RelatedDoc[];
  }>({
    queryKey: ['demand-related', id],
    queryFn: () => api.get(`/demands/${id}/related`),
    enabled: !!id,
  });

  const [form, setForm] = useState<FormState | null>(null);
  const [original, setOriginal] = useState<string>('');
  const [openPicker, setOpenPicker] = useState<
    | null
    | 'agent'
    | 'org'
    | 'store'
    | 'contract'
    | 'project'
    | 'salesChannel'
    | 'organizationAccount'
    | 'consignor'
    | 'consignee'
    | 'carrier'
  >(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const [openCatalogPicker, setOpenCatalogPicker] = useState(false);
  const [productRowId, setProductRowId] = useState<string | null>(null);
  const [colVisible, setColVisible] = useState<Record<string, boolean>>(DEFAULT_COL_VISIBLE);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  // «Kelishuv» — spread the negotiated delta across the lines (owner 2026-07-17).
  const applyAgreement = useCallback((deltaMinor: bigint) => {
    setForm((s) => {
      if (!s) return s;
      const patch = distributeAgreementDelta(s.positions, deltaMinor, s.vatIncluded);
      if (patch.size === 0) return s;
      return {
        ...s,
        positions: s.positions.map((p) => {
          const next = patch.get(p.id);
          return next != null ? { ...p, priceMinor: next } : p;
        }),
      };
    });
  }, []);
  // «Скидка» header bulk discount/markup (moysklad parity) — apply % to selected
  // rows (or all when none selected). Discount sets each line's `discount`; markup
  // raises `priceMinor` (our model has no negative discount).
  const applyDiscountMarkup = useCallback(
    (mode: 'discount' | 'markup', percent: number) => {
      setForm((s) =>
        s
          ? {
              ...s,
              positions: s.positions.map((p) => {
                if (selectedRowIds.size > 0 && !selectedRowIds.has(p.id)) return p;
                if (mode === 'discount') return { ...p, discount: String(percent) };
                const base = Number(p.priceMinor || '0');
                if (!Number.isFinite(base)) return p;
                return { ...p, priceMinor: String(Math.round(base * (1 + percent / 100))) };
              }),
            }
          : s,
      );
    },
    [selectedRowIds],
  );
  const [editingVatId, setEditingVatId] = useState<string | null>(null);
  const [rateOverride, setRateOverride] = useState<string | null>(null);
  const [rateModalOpen, setRateModalOpen] = useState(false);

  // Account-defined custom statuses (moysklad «Статус») for the header pill.
  const { data: statusData } = useQuery<{
    items: Array<{ id: string; name: string; color: string | null }>;
  }>({
    queryKey: ['states', 'demand'],
    queryFn: () => api.get('/states?entityType=demand'),
    staleTime: 60_000,
  });
  const customStatuses = statusData?.items ?? [];

  // Account custom fields (доп. поля, e.g. «Уста») — rendered inline in the meta grid.
  const { data: attrMetaData } = useQuery<{ items: AttributeMetaRow[] }>({
    queryKey: ['attribute-metadata-entity', 'Demand'],
    queryFn: () => api.get('/attribute-metadata/entity/Demand'),
    staleTime: 60_000,
  });

  // moysklad «Баланс» caption under Контрагент.
  const { data: agentBalanceData } = useQuery<{
    items: Array<{ currency: string; balanceMinor: string }>;
  }>({
    queryKey: ['counterparty-balance', form?.agentId],
    queryFn: () => api.get(`/counterparty-balances/${form?.agentId}`),
    enabled: !!form?.agentId,
  });

  // Account currencies (Настройки → Валюты) — the admin-set booking rate.
  const { data: currenciesData } = useQuery<{
    items: Array<{ id: string; isoCode: string; name: string; rate: string }>;
  }>({
    queryKey: ['currencies'],
    queryFn: () => api.get('/currencies'),
    staleTime: 60_000,
  });
  const currencies = currenciesData?.items ?? [];
  const adminRate = currencies.find((c) => c.isoCode === form?.currency)?.rate;
  const effectiveRate = rateOverride ?? adminRate ?? '1';

  // Live «Остаток» per position — the store-scoped on-hand for each assortment
  // (mirrors /demands/new). Injected onto the rows for the «Остаток» column so a
  // shipment shows the stock it draws down (reddened at ≤ 0 by warnStock).
  const assortmentIds = useMemo(
    () => (form?.positions ?? []).map((p) => p.assortmentId).filter((x): x is string => !!x),
    [form],
  );
  const { data: stockData } = useQuery<{ items: Array<{ assortmentId: string; qty: string }> }>({
    queryKey: ['stocks', form?.storeId, assortmentIds.join(',')],
    queryFn: () =>
      api.get(
        `/stocks?storeId=${form?.storeId}&assortmentIds=${encodeURIComponent(assortmentIds.join(','))}`,
      ),
    enabled: !!form?.storeId && assortmentIds.length > 0,
  });
  const stockMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of stockData?.items ?? []) m.set(r.assortmentId, r.qty);
    return m;
  }, [stockData]);

  useEffect(() => {
    if (data && !form) {
      const initial = formFromData(data);
      setForm(initial);
      setOriginal(snapshot(initial));
      if (data.currency !== 'UZS' && data.rateValue && data.rateValue !== '0') {
        setRateOverride((Number(data.rateValue) / 1e8).toString());
      }
    }
  }, [data, form]);

  const isDirty = useMemo(() => (form ? snapshot(form) !== original : false), [form, original]);
  useUnsavedGuard(isDirty);

  const updatePosition = useCallback((rowId: string, patch: Partial<DetailPositionRow>) => {
    setForm((s) =>
      s
        ? { ...s, positions: s.positions.map((p) => (p.id === rowId ? { ...p, ...patch } : p)) }
        : s,
    );
  }, []);
  const removePosition = useCallback((rowId: string) => {
    setForm((s) => (s ? { ...s, positions: s.positions.filter((p) => p.id !== rowId) } : s));
  }, []);
  const duplicatePosition = useCallback((rowId: string) => {
    setForm((s) => {
      if (!s) return s;
      const source = s.positions.find((p) => p.id === rowId);
      if (!source) return s;
      return { ...s, positions: [...s.positions, { ...source, id: uid() }] };
    });
  }, []);
  const reorderPositions = useCallback((from: number, to: number) => {
    setForm((s) => {
      if (!s) return s;
      const next = s.positions.slice();
      const [moved] = next.splice(from, 1);
      if (moved) next.splice(to, 0, moved);
      return { ...s, positions: next };
    });
  }, []);
  const repricePositions = useCallback((priceTypeId: string) => {
    setForm((s) =>
      s
        ? {
            ...s,
            positions: s.positions.map((p) => {
              const sp = p.salePrices?.find((x) => x.priceTypeId === priceTypeId);
              return sp ? { ...p, priceMinor: sp.value } : p;
            }),
          }
        : s,
    );
  }, []);
  const saveProductPrices = useCallback(async () => {
    const positions = form?.positions ?? [];
    const seen = new Set<string>();
    for (const p of positions) {
      if (!p.assortmentId || seen.has(p.assortmentId)) continue;
      seen.add(p.assortmentId);
      try {
        const prod = await api.get<{
          version: number;
          salePrices?: Array<{ priceTypeId: string; value: string }>;
        }>(`/products/${p.assortmentId}`);
        const existing = prod.salePrices ?? [];
        const matchIdx = existing.findIndex(
          (x) => (defaultId && x.priceTypeId === defaultId) || x.priceTypeId === 'default',
        );
        const idx = matchIdx < 0 && existing.length > 0 ? 0 : matchIdx;
        const salePrices =
          idx >= 0
            ? existing.map((x, i) => (i === idx ? { ...x, value: p.priceMinor } : x))
            : [{ priceTypeId: defaultId ?? 'default', value: p.priceMinor }];
        await api.patch(`/products/${p.assortmentId}`, { version: prod.version, salePrices });
      } catch {
        // skip products that can't be updated
      }
    }
  }, [form, defaultId]);

  const onConflict = useConflictReload(['demand', id], () => setForm(null));

  const transitionMut = useApiMutation({
    mutationFn: (target: string) => api.post(`/demands/${id}/transitions/${target}`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['demand', id] });
      qc.invalidateQueries({ queryKey: ['demands'] });
      if (data?.customerOrder) {
        qc.invalidateQueries({ queryKey: ['customer-order', data.customerOrder.id] });
        qc.invalidateQueries({ queryKey: ['customer-orders'] });
      }
    },
  });

  // moysklad «Статус» — set the account custom status immediately (mirror supply).
  const setStatusMut = useApiMutation({
    mutationFn: (statusId: string) => api.patch(`/demands/${id}/status`, { statusId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['demand', id] });
      qc.invalidateQueries({ queryKey: ['demands'] });
    },
  });

  const deleteMut = useApiMutation({
    mutationFn: () => api.delete(`/demands/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['demands'] });
      router.push('/demands');
    },
  });

  const cloneMut = useApiMutation({
    mutationFn: () => api.post<{ id: string }>(`/demands/${id}/clone`, {}),
    onSuccess: (clone) => {
      qc.invalidateQueries({ queryKey: ['demands'] });
      router.push(`/demands/${clone.id}`);
    },
  });

  const { runDestructive } = useDestructiveMutation();

  const saveMut = useSaveMutation({
    mutationFn: async () => {
      if (!form || !data) throw new Error('Form not ready');
      const payload: Record<string, unknown> = {
        version: data.version,
        description: form.description || null,
        vatEnabled: form.vatEnabled,
        vatIncluded: form.vatIncluded,
        // Header refs + Адрес доставки are metadata, editable any time.
        salesChannelId: form.salesChannelId,
        contractId: form.contractId,
        projectId: form.projectId,
        organizationAccountId: form.organizationAccountId,
        deliveryPlannedMoment: form.deliveryPlannedMoment || null,
        paymentPlannedMoment: form.paymentPlannedMoment || null,
        shipmentAddress: form.shipmentAddress || null,
        consignorId: form.consignorId,
        consigneeId: form.consigneeId,
        carrierId: form.carrierId,
        cargoName: form.cargoName || null,
        shipperInstructions: form.shipperInstructions || null,
        transportFacility: form.transportFacility || null,
        carNumber: form.carNumber || null,
        placesCount: form.placesCount ? Number(form.placesCount) : null,
        shippingDocNo: form.shippingDocNo || null,
        shippingDocDate: form.shippingDocDate || null,
        stateContractId: form.stateContractId || null,
        externalCode: form.externalCode || null,
        overheadSumMinor:
          Number(form.overheadMajor) > 0
            ? String(BigInt(Math.round(Number(form.overheadMajor) * 100)))
            : '0',
        overheadDistribution: form.overheadDistribution,
      };
      if (!data.applicable) {
        const trimmedName = form.name.trim();
        if (trimmedName) payload.name = trimmedName;
        if (form.moment) payload.moment = new Date(form.moment).toISOString();
        payload.agentId = form.agentId;
        payload.organizationId = form.organizationId;
        payload.storeId = form.storeId;
        payload.currency = form.currency;
        // Rate override (8-dp minor units) — only when the user changed it.
        if (form.currency !== 'UZS' && rateOverride) {
          payload.rateValue = BigInt(Math.round(Number(effectiveRate) * 100000000)).toString();
        }
        payload.positions = form.positions.map((p) => ({
          assortmentKind: 'product',
          // biome-ignore lint/style/noNonNullAssertion: rows always have a product before save
          assortmentId: p.assortmentId!,
          quantity: Number(p.quantity),
          priceMinor: p.priceMinor,
          discount: Number(p.discount || '0'),
          vat: p.vat ? Number(p.vat) : undefined,
          vatEnabled: p.vatEnabled,
          // «Ячейка» — address-storage bin (cellId drives per-cell stock on post).
          ...(p.cellId ? { cellId: p.cellId } : {}),
          ...(p.cell ? { cell: p.cell } : {}),
        }));
      }
      payload.attributes = form.attributes;
      return api.patch(`/demands/${id}`, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['demand', id] });
      qc.invalidateQueries({ queryKey: ['demands'] });
      if (form) setOriginal(snapshot(form));
    },
    onConflict,
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
  const orgFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{
      items: Array<{ id: string; name: string; legalTitle: string | null }>;
    }>(`/organizations?search=${encodeURIComponent(s)}`);
    return d.items.map((o) => ({
      id: o.id,
      primary: o.name,
      secondary: o.legalTitle ?? undefined,
    }));
  };
  const storeFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: Array<{ id: string; name: string; code: string | null }> }>(
      `/stores?search=${encodeURIComponent(s)}`,
    );
    return d.items.map((st) => ({ id: st.id, primary: st.name, secondary: st.code ?? undefined }));
  };
  const salesChannelFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: Array<{ id: string; name: string; code?: string | null }> }>(
      `/sales-channels?search=${encodeURIComponent(s)}&limit=50`,
    );
    return d.items.map((c) => ({ id: c.id, primary: c.name, secondary: c.code ?? undefined }));
  };
  const contractFetcher = async (s: string): Promise<PickerItem[]> => {
    const params = new URLSearchParams({ search: s });
    if (form?.agentId) params.set('agentId', form.agentId);
    const d = await api.get<{ items: Array<{ id: string; name: string; code: string | null }> }>(
      `/contracts?${params.toString()}`,
    );
    return d.items.map((c) => ({ id: c.id, primary: c.name, secondary: c.code ?? undefined }));
  };
  const projectFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: Array<{ id: string; name: string; code: string | null }> }>(
      `/projects?search=${encodeURIComponent(s)}`,
    );
    return d.items.map((p) => ({ id: p.id, primary: p.name, secondary: p.code ?? undefined }));
  };
  const organizationAccountFetcher = async (s: string): Promise<PickerItem[]> => {
    const params = new URLSearchParams({ search: s, limit: '50' });
    if (form?.organizationId) params.set('organizationId', form.organizationId);
    const d = await api.get<{
      items: Array<{
        id: string;
        name: string;
        accountNumber: string | null;
        bankName: string | null;
      }>;
    }>(`/organization-accounts?${params.toString()}`);
    return d.items.map((x) => ({
      id: x.id,
      primary: x.accountNumber || x.name,
      secondary: x.bankName ?? undefined,
    }));
  };
  const counterpartyFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{
      items: Array<{ id: string; name: string; legalTitle: string | null }>;
    }>(`/counterparties?search=${encodeURIComponent(s)}&limit=50`);
    return d.items.map((c) => ({
      id: c.id,
      primary: c.name,
      secondary: c.legalTitle ?? undefined,
    }));
  };
  const productFetcher = async (s: string) => {
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

  // moysklad position columns (fixed + optional, customizer + «Цена ▾» menu).
  const positionColumns = useMemo<PositionTableColumnConfig[]>(() => {
    const cols: PositionTableColumnConfig[] = [
      { key: 'dragarea' },
      { key: 'select' },
      { key: 'index', label: '' },
    ];
    if (colVisible.image) cols.push({ key: 'image' });
    cols.push({ key: 'name', label: tCols('name') });
    if (colVisible.unit) cols.push({ key: 'unit', label: tCols('unit') });
    if (colVisible.code) cols.push({ key: 'code', label: tCols('code') });
    if (colVisible.article) cols.push({ key: 'article', label: tCols('article') });
    cols.push({ key: 'quantity', label: tPos('quantity') });
    // «Ячейка» — the bin the goods leave FROM (mirror purchase-returns/[id]).
    cols.push({ key: 'cell', label: tCols('cell'), placeholder: tCols('cell_unset') });
    if (colVisible.stock) cols.push({ key: 'stock', label: tCols('stock') });
    if (colVisible.available) cols.push({ key: 'available', label: tCols('available') });
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
    cols.push(
      {
        key: 'amount',
        label: (
          <span className="inline-flex items-center gap-1">
            {tCols('amount')}
            <PositionColumnCustomizer
              options={OPTIONAL_POSITION_COLUMNS.map((c) => ({ key: c.key, label: tCols(c.key) }))}
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
    tPos,
    tCols,
    priceTypesData,
    repricePositions,
    saveProductPrices,
    applyDiscountMarkup,
    selectedRowIds.size,
  ]);

  // ⚠️ HOOK'LAR ERTA `return`DAN YUQORIDA TURISHI SHART.
  // Bu blok avval pastda, `if (isLoading || !form) return` dan KEYIN edi:
  // birinchi render (yuklanmoqda) erta chiqib ketib hook'larni chaqirmasdi,
  // ikkinchi render esa chaqirardi — hook SONI o'zgarib React #310 bilan
  // butun sahifani yiqitardi. Callback'lar `form`/`data` ni o'zlari
  // tekshiradi, shuning uchun bu yerda turishi xavfsiz.
  // ── Climart termal cheklar (72mm) — invoices-out bilan bir xil manba ──────
  // «Yig'ish varag'i»: ombor bo'yicha guruh + yacheyka, NARXSIZ (omborchi uchun).
  // «Tovar cheki»: narx + qator summasi (xaridorga beriladi).
  // Varaq mantiqi umumiy hook'da (`hooks/use-pick-sheet.ts`) — bu yerdagi nusxa
  // qatorning O'Z yacheykasini e'tiborsiz qoldirib, har safar tovarning standart
  // yacheykasini so'rardi: hujjatda «01-02-03 dan olindi» yozilgan bo'lsa ham
  // omborchi boshqa javonga yuborilishi mumkin edi.
  const { sheet: spiska, openSheet, closeSheet } = usePickSheet();
  const [creceipt, setCreceipt] = useState<CustomerReceiptData | null>(null);

  const openSpiska = useCallback(() => {
    if (!form || !data) return;
    // Sarlavha «Tovar cheki» EMAS — u xaridor chekining nomi; omborchi varag'i
    // xuddi shu nom bilan chiqsa, ikkalasi bir hujjatdek ko'rinardi.
    return openSheet({
      title: tSpiska('sheet_title_pick'),
      number: data.name,
      moment: form.moment,
      agentName: form.agentLabel || null,
      ownerName: data.owner?.name ?? null,
      description: form.description || null,
      rows: form.positions,
    });
  }, [form, data, tSpiska, openSheet]);

  const openCustomerReceipt = useCallback(() => {
    if (!form || !data) return;
    const rows = form.positions.filter((p) => p.assortmentId && Number(p.quantity) > 0);
    setCreceipt({
      number: data.name,
      dateStr: receiptDate(new Date(form.moment)),
      orgName: form.organizationLabel || null,
      sellerName: data.owner?.name ?? null,
      buyerName: form.agentLabel || null,
      phone: null,
      comment: form.description || null,
      positions: rows.map((r) => ({
        name: r.productLabel,
        uom: r.productUom ?? null,
        qty: r.quantity,
        priceMinor: r.priceMinor || '0',
        sumMinor: String(Math.round(Number(r.priceMinor || '0') * Number(r.quantity || '0'))),
      })),
    });
  }, [form, data]);

  // 404 (o'chirilgan hujjat yoki record-scope ko'rsatmaydigan yozuv) yuklash
  // TUGAGACH shu yerda tutiladi. Ilgari bu shart quyidagi loading-shoxidan
  // KEYIN turardi va HECH QACHON ishlamasdi (form faqat data kelganda
  // to'ladi) — sahifa abadiy «Yuklanmoqda…» bo'lib qolardi (MK40 brauzer-QA).
  if (!data)
    return isLoading ? (
      <div className="p-8 text-[var(--ms-text-muted)] text-sm">{tCommon('loading')}</div>
    ) : (
      <div className="p-8 text-sm">{tCommon('not_found')}</div>
    );
  if (!form)
    return <div className="p-8 text-[var(--ms-text-muted)] text-sm">{tCommon('loading')}</div>;

  // moysklad locks a posted («Проведён») shipment — you unpost to edit (the FIFO
  // cost + stock cascade is booked at post). Draft stays fully editable.
  const editable = !data.applicable;
  const editableLines = editable;
  const canCreateReturn = data.state === 'posted';

  // «Баланс» caption — counterparty balance consolidated to base сум.
  const balanceDocRate = Number(effectiveRate) || 1;
  const agentBaseBalanceMinor = (agentBalanceData?.items ?? []).reduce((acc, b) => {
    const m = Number(b.balanceMinor || '0');
    if (b.currency === 'UZS') return acc + m;
    if (b.currency === form.currency) return acc + m * balanceDocRate;
    return acc;
  }, 0);
  const balanceAbsMajor = Math.abs(agentBaseBalanceMinor) / 100;
  const balanceQualifier =
    agentBaseBalanceMinor > 0
      ? tDetailHeader('owed_to_us')
      : agentBaseBalanceMinor < 0
        ? tDetailHeader('we_owe')
        : '';

  // Custom fields (доп. поля) distributed round-robin across the 3 meta columns.
  const customFields = [...(attrMetaData?.items ?? [])].sort((a, b) => a.position - b.position);
  const attrColumns: AttributeMetaRow[][] = [[], [], []];
  customFields.forEach((m, i) => attrColumns[i % 3]?.push(m));
  const renderCustomField = (m: AttributeMetaRow) => (
    <DocumentMetaField key={m.id} label={m.name} required={m.required}>
      <AttributeInput
        meta={m}
        value={form.attributes[m.code]}
        onChange={(v) =>
          setForm((s) => {
            if (!s) return s;
            const next = { ...s.attributes };
            if (v === '' || v == null) delete next[m.code];
            else next[m.code] = v;
            return { ...s, attributes: next };
          })
        }
        disabled={!editableLines}
        testId={`field-attr-${m.code}`}
      />
    </DocumentMetaField>
  );

  // Rows with the live «Остаток» merged in (display-only; edits still target
  // form.positions by id through onUpdate).
  const rows: DetailPositionRow[] = form.positions.map((p) => ({
    ...p,
    stock: p.assortmentId ? (stockMap.get(p.assortmentId) ?? p.stock) : p.stock,
  }));

  const renderPositionNameCell = (row: DocPositionRow) => {
    const p = row as DetailPositionRow;
    const href = p.assortmentId ? `/products/${p.assortmentId}` : undefined;
    return (
      <PositionNameCell
        imageUrl={p.imageUrl}
        code={p.productCode}
        label={p.productLabel}
        placeholder={tForm('select_product')}
        onPick={() => editableLines && setProductRowId(p.id)}
        productHref={href}
        onNavigate={p.assortmentId ? () => setEditProductId(p.assortmentId) : undefined}
        navigateAsButton
        disabled={!editableLines}
        testId={`pos-${p.id}-name`}
      />
    );
  };

  // «Ячейка» — address-storage cell picker. The closure carries storeId + the row's
  // product so the picker can filter «С этим товаром» (mirror purchase-returns/[id]).
  const renderPositionCellCell = (row: DocPositionRow) => {
    const p = row as DetailPositionRow;
    return (
      <CellPickerField
        storeId={form.storeId || null}
        assortmentId={p.assortmentId}
        label={p.cell}
        readOnly={!editableLines}
        onSelect={(cellId, label) => updatePosition(row.id, { cellId, cell: label })}
        onClear={() => updatePosition(row.id, { cellId: null, cell: '' })}
      />
    );
  };

  const fmtVat = (v: string) => (v === '' ? tCols('vat_none') : `${v}%`);
  const renderVatCell = (row: DocPositionRow) => {
    const p = row as DetailPositionRow;
    const vat = p.vat ?? '';
    if (!editableLines || editingVatId !== p.id) {
      return (
        <button
          type="button"
          disabled={!editableLines}
          onClick={() => editableLines && setEditingVatId(p.id)}
          className="block w-full cursor-text text-right tabular-nums disabled:cursor-default"
          data-test-id={`pos-${p.id}-vat`}
        >
          {fmtVat(vat)}
        </button>
      );
    }
    const opts = ['', '0', '12'].includes(vat) ? ['', '0', '12'] : ['', '0', '12', vat];
    return (
      // MASTER-TODO #12: DS NativeSelect with a DENSE override. The base
      // control is h-9/13px; this is an inline click-to-edit cell inside the
      // positions grid, so it keeps h-7/12px via `selectClassName` (twMerge
      // lets the override win). Swapping to the DS primitive is what buys the
      // shared chevron + focus ring; the size stays moysklad-dense.
      <NativeSelect
        autoFocus
        value={vat}
        onChange={(e) => updatePosition(p.id, { vat: e.target.value })}
        onBlur={() => setEditingVatId(null)}
        selectClassName="h-7 px-1 text-[12px]"
        data-test-id={`pos-${p.id}-vat-select`}
      >
        {opts.map((v) => (
          <option key={v} value={v}>
            {fmtVat(v)}
          </option>
        ))}
      </NativeSelect>
    );
  };

  // Live totals from the (editable) form positions.
  const totals = form.positions.reduce(
    (acc, p) => {
      const t = computeLineTotalSafe(p, form.vatIncluded);
      return { net: acc.net + t.net, vat: acc.vat + t.vat, gross: acc.gross + t.gross };
    },
    { net: 0n, vat: 0n, gross: 0n },
  );
  const totalQty = form.positions.reduce((acc, p) => acc + Number(p.quantity || 0), 0);

  // «Не оплачено» pill.
  const savedSumBig = BigInt(data.sumMinor || '0');
  const paidBig = BigInt(data.payedSumMinor || '0');

  // «Прибыль» (MASTER-TODO #6) — moysklad shows gross profit on a shipment.
  // `DocumentTotalsPanel` has carried an optional `profitMinor` prop all along
  // and the API already returns `costSumMinor`; the page simply never wired the
  // two, so the row never rendered.
  //
  // Gated on cost>0 ON PURPOSE: `costSumMinor` is only populated at POST time
  // (FIFO / weighted-average consumption). A draft has 0, and `sum - 0` would
  // present the FULL REVENUE as profit — the exact mis-read this gate prevents.
  //
  // Paired with the SAVED sum, not the live editor total: cost is a persisted,
  // posted-time value, so mixing it with unsaved position edits would show a
  // profit that belongs to neither state.
  const costSumBig = BigInt(data.costSumMinor || '0');
  const profitMinor = costSumBig > 0n ? (savedSumBig - costSumBig).toString() : undefined;
  // When cost is not known yet the row still renders, with «—» (moysklad always
  // shows Прибыль; dropping the row shifts the whole totals block). See the
  // gate above for why a number is never invented here.
  const profitUnknown = profitMinor === undefined;

  // «Вес» / «Объём» footer — shared helper, so /new and /[id] agree exactly.
  const measures = docMeasureTotals(form.positions);
  const fullyPaid = savedSumBig > 0n && paidBig >= savedSumBig;
  const partiallyPaid = paidBig > 0n && paidBig < savedSumBig;
  const paymentTone = fullyPaid ? 'paid' : partiallyPaid ? 'partial' : 'unpaid';
  const paymentPillLabel = fullyPaid
    ? tDetailHeader('paid')
    : partiallyPaid
      ? tDetailHeader('partially_paid')
      : tDetailHeader('not_paid');

  // moysklad «Создать документ» for a shipment. Only «Возврат покупателя» is wired
  // (its from-demand backend exists); the rest are label-parity placeholders.

  // Akkauntning O'Z «Отгрузка» shablonlari — bulk-print orqali templateId bilan.
  // Backend `GET /demands/print-forms` + `POST /demands/bulk-print` ALLAQACHON
  // bor edi, sahifa esa ularni so'ramasdi (2026-08-01 audit).
  const printForm = (templateId?: string) => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    void api
      .postDownload(
        '/demands/bulk-print',
        { ids: [data.id], ...(templateId ? { templateId } : {}) },
        `demand-${data.name}-${stamp}.pdf`,
      )
      .then(() => qc.invalidateQueries({ queryKey: ['demand', id] }));
  };

  // Kanonik tartib — `lib/print-menu.ts` ga qara. «Комплект…» YO'Q, chunki
  // demand modulida `kit-print` endpointi yo'q (invoice-out/supply/… da bor).
  // Soxta band qo'yishdan ko'ra tushirib qoldirish halolroq.
  const printMenuItems: CreateMenuItem[] = buildPrintMenu({
    accountForms: printForms,
    onAccountForm: printForm,
    standard: {
      label: tPrintMenu('document_blank'),
      onSelect: () =>
        window.open(`/print/demand/${data.id}?auto=1`, '_blank', 'width=820,height=1100'),
    },
    extras: [
      { id: 'spiska', label: tSpiska('spiska_form'), onSelect: () => void openSpiska() },
      {
        id: 'creceipt',
        label: tSpiska('receipt_title_customer'),
        onSelect: () => openCustomerReceipt(),
      },
    ],
    configure: { label: tPrintMenu('configure'), onSelect: () => openTemplates('demand') },
  });

  const createMenuItems: CreateMenuItem[] = [
    { id: 'move', label: tDetailTitles('move'), disabled: true },
    { id: 'invoice-out', label: tDetailTitles('invoice_out'), disabled: true },
    { id: 'facture-out', label: tCreate('facture_out'), disabled: true },
    { id: 'payment-in', label: tDetailTitles('payment_in'), disabled: true },
    { id: 'cash-in', label: tDetailTitles('cash_in'), disabled: true },
    {
      id: 'sales-return',
      label: tCreate('sales_return'),
      onSelect: canCreateReturn
        ? () => router.push(`/sales-returns/new?fromDemand=${data.id}`)
        : undefined,
      disabled: !canCreateReturn,
    },
  ];

  // «Проведено» — post/unpost (cancelled is terminal → no toggle).
  const onApplicableChange =
    data.state === 'cancelled'
      ? undefined
      : (next: boolean) => transitionMut.mutate(next ? 'post' : 'unpost');

  // «Статус» header — custom statuses (immediate setStatus) when the account has
  // any, else the FSM state dropdown (verb transitions). Mirrors CO/supply.
  const hasCustomStatuses = customStatuses.length > 0;
  const statusHeaderProps = hasCustomStatuses
    ? {
        status: data.status?.id ?? '',
        statusOptions: customStatuses.map((s) => ({
          value: s.id,
          label: s.name,
          color: s.color ?? undefined,
        })),
        onStatusChange: (sid: string) => setStatusMut.mutate(sid),
      }
    : {
        status: data.state,
        statusOptions: DEMAND_STATES.map((slug) => ({
          value: slug,
          label: tStates(slug),
          color: DEMAND_STATE_COLOR[slug],
        })),
        onStatusChange: (slug: string) => transitionMut.mutate(DEMAND_STATE_VERB[slug] ?? slug),
      };

  return (
    <div
      className="flex min-h-screen flex-col bg-[var(--ms-bg-page)]"
      data-test-id="demand-detail-page"
    >
      <DetailToolbar
        isDirty={isDirty}
        isSaving={saveMut.isPending}
        onSave={() => saveMut.mutate()}
        onClose={() => router.push('/demands')}
        position={detailNav.position}
        onPrev={detailNav.onPrev}
        onNext={detailNav.onNext}
        onClone={() => cloneMut.mutate()}
        onDelete={
          !data.applicable
            ? () =>
                runDestructive({
                  title: tCommon('delete_confirm', { name: data.name }),
                  run: () => deleteMut.mutateAsync(),
                  successMessage: tCommon('saved'),
                })
            : undefined
        }
        createMenuItems={createMenuItems}
        printMenuItems={printMenuItems}
        printEntity="demand"
        onSendEmail={() => setEmailOpen(true)}
        apiData={data}
        apiTitle={`API · ${data.name}`}
        rightSlot={
          <div className="flex items-start gap-4">
            <div
              className="flex flex-col items-end text-right text-xs leading-tight"
              data-test-id="doc-owner-readonly"
            >
              <span className="font-medium text-[var(--ms-text-brand)]">
                {data.owner?.name ?? '—'}
              </span>
              <span className="text-[var(--ms-text-muted)]">
                {tDetailHeader('changed')}: {formatDate(data.updatedAt)}
              </span>
            </div>
            <DocumentHistoryLink auditEntity="Demand" entityId={data.id} />
          </div>
        }
      />

      <DocumentHeader
        {...docEditorLabels}
        documentTypeLabel={tDetailTitles('demand')}
        number={form.name}
        onNumberChange={editable ? (v) => setForm((f) => f && { ...f, name: v }) : undefined}
        date={form.moment}
        onDateChange={editable ? (v) => setForm((f) => f && { ...f, moment: v }) : undefined}
        status={statusHeaderProps.status}
        statusOptions={statusHeaderProps.statusOptions}
        onStatusChange={statusHeaderProps.onStatusChange}
        paymentLabel={paymentPillLabel}
        paymentTone={paymentTone}
        // «Запросить оплату» is intentionally NOT wired: /payments-in/new reads
        // `fromOrder` (a customer order), not a demand, so pre-fill-from-shipment
        // isn't supported yet — surfacing the button would dead-end to an empty
        // form. The payment PILL still renders. (Keeps the prior honest behaviour.)
        applicable={data.applicable}
        onApplicableChange={onApplicableChange}
        applicableHelp={tDemands('applicable_help')}
      />

      <main className="flex-1 px-4 py-4">
        {transitionMut.error && (
          <Alert tone="destructive" className="mb-3">
            {(() => {
              const err = transitionMut.error as Error & {
                data?: {
                  details?: {
                    shortages?: Array<{
                      assortmentId: string;
                      requested: string;
                      available: string;
                      shortage: string;
                    }>;
                  };
                };
              };
              const shortages = err.data?.details?.shortages;
              if (shortages && shortages.length > 0) {
                return (
                  <div>
                    <div className="mb-1 font-medium">{tDemands('stock_shortage_title')}</div>
                    <ul className="ml-5 list-disc text-sm">
                      {shortages.map((s) => (
                        <li key={s.assortmentId}>
                          {tDemands('stock_shortage_line', {
                            requested: s.requested,
                            available: s.available,
                            shortage: s.shortage,
                          })}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              }
              return err.message;
            })()}
          </Alert>
        )}

        {/* moysklad three-column meta. LEFT: Организация(+account) · Контрагент
            (+Баланс) · Проект · Валюта(+rate). MIDDLE: Склад · Договор · Канал
            продаж · План. дата отгрузки · Срок оплаты. RIGHT: Адрес доставки ·
            Комментарий. Custom fields (доп. поля) fill a second row. */}
        <DocumentMetaColumns>
          <DocumentMetaColumn>
            <DocumentMetaField
              label={tFields('organization')}
              required
              helper={
                form.organizationId ? (
                  <CatalogPickerField
                    value={
                      form.organizationAccountId
                        ? { id: form.organizationAccountId, label: form.organizationAccountLabel }
                        : null
                    }
                    placeholder={tFields('organization_account')}
                    onPick={() => editable && setOpenPicker('organizationAccount')}
                    inlineFetcher={organizationAccountFetcher}
                    onInlineSelect={(item) =>
                      setForm(
                        (s) =>
                          s && {
                            ...s,
                            organizationAccountId: item.id,
                            organizationAccountLabel: String(item.primary),
                          },
                      )
                    }
                    onClear={() =>
                      editable &&
                      setForm(
                        (s) =>
                          s && { ...s, organizationAccountId: null, organizationAccountLabel: '' },
                      )
                    }
                    disabled={!editable}
                    testId="field-organization-account"
                  />
                ) : undefined
              }
            >
              <CatalogPickerField
                value={
                  form.organizationId
                    ? { id: form.organizationId, label: form.organizationLabel }
                    : null
                }
                placeholder={tFields('organization')}
                onPick={() => editable && setOpenPicker('org')}
                inlineFetcher={orgFetcher}
                onInlineSelect={(item) =>
                  setForm(
                    (s) =>
                      s && {
                        ...s,
                        organizationId: item.id,
                        organizationLabel: String(item.primary),
                        organizationAccountId: null,
                        organizationAccountLabel: '',
                      },
                  )
                }
                onClear={() =>
                  editable &&
                  setForm(
                    (s) =>
                      s && {
                        ...s,
                        organizationId: '',
                        organizationLabel: '',
                        organizationAccountId: null,
                        organizationAccountLabel: '',
                      },
                  )
                }
                disabled={!editable}
                testId="field-organization"
              />
            </DocumentMetaField>
            <DocumentMetaField
              label={tFields('agent')}
              required
              helper={
                form.agentId ? (
                  <span
                    data-test-id="agent-balance"
                    className={
                      agentBaseBalanceMinor !== 0
                        ? 'text-[var(--ms-action-destructive)]'
                        : 'text-[var(--ms-text-muted)]'
                    }
                  >
                    {tDetailHeader('balance')}
                    {balanceQualifier ? ` ${balanceQualifier}` : ''}:{' '}
                    {balanceAbsMajor.toLocaleString('ru-RU', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{' '}
                    {currencyDisplayName('UZS')}
                  </span>
                ) : undefined
              }
            >
              <CatalogPickerField
                value={form.agentId ? { id: form.agentId, label: form.agentLabel } : null}
                placeholder={tFields('agent')}
                onPick={() => editable && setOpenPicker('agent')}
                inlineFetcher={agentFetcher}
                onInlineSelect={(item) =>
                  setForm(
                    (s) =>
                      s && {
                        ...s,
                        agentId: item.id,
                        agentLabel: String(item.primary),
                        contractId: null,
                        contractLabel: '',
                      },
                  )
                }
                onEdit={
                  form.agentId
                    ? () => window.open(`/counterparties/${form.agentId}`, '_blank', 'noopener')
                    : undefined
                }
                editLabel={tCommon('edit')}
                onClear={() =>
                  editable &&
                  setForm(
                    (s) =>
                      s && {
                        ...s,
                        agentId: '',
                        agentLabel: '',
                        contractId: null,
                        contractLabel: '',
                      },
                  )
                }
                disabled={!editable}
                testId="field-agent"
              />
            </DocumentMetaField>
            <DocumentMetaField label={tFields('project')}>
              <CatalogPickerField
                value={form.projectId ? { id: form.projectId, label: form.projectLabel } : null}
                placeholder={tFields('project')}
                onPick={() => editable && setOpenPicker('project')}
                inlineFetcher={projectFetcher}
                onInlineSelect={(item) =>
                  setForm(
                    (s) => s && { ...s, projectId: item.id, projectLabel: String(item.primary) },
                  )
                }
                onClear={() =>
                  editable && setForm((s) => s && { ...s, projectId: null, projectLabel: '' })
                }
                disabled={!editable}
                testId="field-project"
              />
            </DocumentMetaField>
            <DocumentMetaField
              label={tDetailForm('currency')}
              required
              helper={
                form.currency !== 'UZS' ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="tabular-nums">
                      1 {form.currency} ={' '}
                      {Number(effectiveRate).toLocaleString('ru-RU', { maximumFractionDigits: 4 })}{' '}
                      UZS
                    </span>
                    {editable && (
                      <button
                        type="button"
                        onClick={() => setRateModalOpen(true)}
                        className="shrink-0 text-[var(--ms-text-brand)] text-xs"
                        aria-label={tForm('rate_edit')}
                        data-test-id="rate-edit"
                      >
                        ✎
                      </button>
                    )}
                  </span>
                ) : undefined
              }
            >
              <NativeSelect
                value={form.currency}
                onChange={(e) => {
                  const next = e.target.value;
                  setRateOverride(null);
                  setForm((s) => s && { ...s, currency: next });
                }}
                disabled={!editable}
                data-test-id="field-currency"
              >
                {currencies.length === 0 && <option value={form.currency}>{form.currency}</option>}
                {currencies.map((c) => (
                  <option key={c.id} value={c.isoCode}>
                    {c.name} ({c.isoCode})
                  </option>
                ))}
              </NativeSelect>
            </DocumentMetaField>
          </DocumentMetaColumn>

          <DocumentMetaColumn>
            <DocumentMetaField label={tFields('store')} required>
              <CatalogPickerField
                value={form.storeId ? { id: form.storeId, label: form.storeLabel } : null}
                placeholder={tFields('store')}
                onPick={() => editable && setOpenPicker('store')}
                inlineFetcher={storeFetcher}
                onInlineSelect={(item) =>
                  setForm((s) => s && { ...s, storeId: item.id, storeLabel: String(item.primary) })
                }
                onEdit={
                  form.storeId
                    ? () => window.open(`/stores/${form.storeId}`, '_blank', 'noopener')
                    : undefined
                }
                editLabel={tCommon('edit')}
                onClear={() =>
                  editable && setForm((s) => s && { ...s, storeId: '', storeLabel: '' })
                }
                disabled={!editable}
                testId="field-store"
              />
            </DocumentMetaField>
            <DocumentMetaField label={tFields('contract')}>
              <CatalogPickerField
                value={form.contractId ? { id: form.contractId, label: form.contractLabel } : null}
                placeholder={tFields('contract')}
                onPick={() => editable && form.agentId && setOpenPicker('contract')}
                inlineFetcher={contractFetcher}
                onInlineSelect={(item) =>
                  setForm(
                    (s) => s && { ...s, contractId: item.id, contractLabel: String(item.primary) },
                  )
                }
                onClear={() =>
                  editable && setForm((s) => s && { ...s, contractId: null, contractLabel: '' })
                }
                disabled={!editable || !form.agentId}
                testId="field-contract"
              />
            </DocumentMetaField>
            <DocumentMetaField label={tFields('sales_channel')}>
              <CatalogPickerField
                value={
                  form.salesChannelId
                    ? { id: form.salesChannelId, label: form.salesChannelLabel }
                    : null
                }
                placeholder={tFields('sales_channel')}
                onPick={() => editable && setOpenPicker('salesChannel')}
                inlineFetcher={salesChannelFetcher}
                onInlineSelect={(item) =>
                  setForm(
                    (s) =>
                      s && {
                        ...s,
                        salesChannelId: item.id,
                        salesChannelLabel: String(item.primary),
                      },
                  )
                }
                onClear={() =>
                  editable &&
                  setForm((s) => s && { ...s, salesChannelId: null, salesChannelLabel: '' })
                }
                disabled={!editable}
                testId="field-sales-channel"
              />
            </DocumentMetaField>
            <DocumentMetaField label={tDemands('delivery_date')}>
              <DatePicker
                value={form.deliveryPlannedMoment || null}
                onChange={(d) => setForm((s) => s && { ...s, deliveryPlannedMoment: d })}
                locale="ru-RU"
                disabled={!editable}
                testId="field-delivery-planned"
              />
            </DocumentMetaField>
            <DocumentMetaField label={tFields('payment_planned')}>
              <DatePicker
                value={form.paymentPlannedMoment || null}
                onChange={(d) => setForm((s) => s && { ...s, paymentPlannedMoment: d })}
                locale="ru-RU"
                disabled={!editable}
                testId="field-payment-planned"
              />
            </DocumentMetaField>
          </DocumentMetaColumn>

          <DocumentMetaColumn>
            <DocumentMetaField label={tFields('delivery_address')}>
              <Textarea
                rows={2}
                value={form.shipmentAddress}
                onChange={(e) => setForm((s) => s && { ...s, shipmentAddress: e.target.value })}
                disabled={!editable}
                data-test-id="field-shipment-address"
              />
            </DocumentMetaField>
            <DocumentMetaField label={tFields('description')}>
              <Textarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm((s) => s && { ...s, description: e.target.value })}
                placeholder={tFields('description')}
                aria-label={tFields('description')}
                disabled={!editable}
                data-test-id="field-description-meta"
              />
            </DocumentMetaField>
            {data.customerOrder && (
              <DocumentMetaField label={tDetailTitles('customer_order')}>
                <div className="flex h-9 items-center px-2 text-sm">
                  <a
                    href={`/customer-orders/${data.customerOrder.id}`}
                    className="text-[var(--ms-text-brand)] underline-offset-2 hover:underline"
                    data-test-id="field-customer-order"
                  >
                    {data.customerOrder.name}
                  </a>
                </div>
              </DocumentMetaField>
            )}
          </DocumentMetaColumn>
        </DocumentMetaColumns>

        {customFields.length > 0 && (
          <DocumentMetaColumns>
            <DocumentMetaColumn>{attrColumns[0]?.map(renderCustomField)}</DocumentMetaColumn>
            <DocumentMetaColumn>{attrColumns[1]?.map(renderCustomField)}</DocumentMetaColumn>
            <DocumentMetaColumn>{attrColumns[2]?.map(renderCustomField)}</DocumentMetaColumn>
          </DocumentMetaColumns>
        )}

        <div className="mt-6">
          <DetailContentTabs
            auditEntity="Demand"
            entityId={data.id}
            positionsLabel={tDetailTabs('positions')}
            relatedGroups={[]}
            relatedSlot={
              <RelatedDocsTab
                current={{
                  id: data.id,
                  name: data.name,
                  moment: data.moment,
                  state: data.state,
                  sumMinor: data.sumMinor,
                  kind: 'demand',
                }}
                // «Привязать документ» — the tab owns the «Привязка документа»
                // modal (pre-scoped to this shipment's refs) + manual links +
                // unlink + the «?link=new» auto-open hand-off.
                linkable={{
                  entityType: 'Demand',
                  agent: data.agent,
                  organization: data.organization,
                  storeTo: data.store,
                }}
                linked={[
                  ...(related?.customerOrder
                    ? [{ ...related.customerOrder, kind: 'customer-order' as const }]
                    : []),
                  ...(related?.salesReturns ?? []).map((d) => ({
                    ...d,
                    kind: 'sales-return' as const,
                  })),
                  ...(related?.moves ?? []).map((d) => ({ ...d, kind: 'move' as const })),
                ]}
              />
            }
            filesSlot={<AttachmentsSection entity="Demand" entityId={data.id} />}
            tasksSlot={<DocumentTasksSection entity="Demand" entityId={data.id} />}
            historyInline={false}
          >
            <div className="space-y-4">
              {/* Owner 2026-07-23: «Договорная цена» — blue, at the table's OUTER
                  top-right corner (same spot in every section). */}
              {editableLines && (
                <div className="-mb-2.5 flex justify-end">
                  <PositionAgreementButton
                    totalMinor={totals.gross}
                    currency={form.currency}
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
              )}
              <PositionTable
                columns={positionColumns}
                // moysklad sales-grid: «Остаток»/«Доступно» ≤ 0 shows red.
                warnStock
                emptyText={tPos('empty')}
                rows={rows}
                onUpdate={(rowId, patch) =>
                  updatePosition(rowId, patch as Partial<DetailPositionRow>)
                }
                onRemove={removePosition}
                onDuplicate={duplicatePosition}
                onReorder={reorderPositions}
                onSortPositions={
                  editableLines
                    ? (by) =>
                        setForm((f) =>
                          f
                            ? {
                                ...f,
                                positions: [...f.positions].sort((a, b) =>
                                  (by === 'name'
                                    ? (a.productLabel ?? '')
                                    : (a.productCode ?? '')
                                  ).localeCompare(
                                    by === 'name' ? (b.productLabel ?? '') : (b.productCode ?? ''),
                                    'ru',
                                  ),
                                ),
                              }
                            : f,
                        )
                    : undefined
                }
                sortByNameLabel={tPos('sort_by_name')}
                sortByCodeLabel={tPos('sort_by_code')}
                renderNameCell={renderPositionNameCell}
                renderCellCell={renderPositionCellCell}
                priceOptions={positionPriceOptions}
                onReplace={(rowId) => editableLines && setProductRowId(rowId)}
                renderVatCell={renderVatCell}
                vatIncluded={form.vatIncluded}
                selectedIds={selectedRowIds}
                onSelectionChange={setSelectedRowIds}
                readOnly={!editableLines}
                footerToolbar={
                  editableLines ? (
                    <PositionInlineAdd
                      placeholder={tPos('addPositionPlaceholder')}
                      addFromCatalogLabel={tPos('addFromCatalog')}
                      checkCompletenessLabel={tPos('checkCompleteness')}
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
                            priceMinor: resolveDefaultSalePriceOrZero(p.salePrices, defaultId),
                            uomLabel: p.uom ?? undefined,
                            raw: p,
                          })),
                          total: r.total ?? r.items.length,
                        };
                      }}
                      sortAvailableLabel={tPos('sortByAvailable')}
                      moreItemsLabel={(n) => tPos('moreItems', { count: n })}
                      createProductLabel={(qq) => tPos('createProductNamed', { query: qq })}
                      onCreateProduct={(q) => setCreateProductName(q)}
                      // Owner 2026-07-28: product picks add DIRECTLY — no qty/price
                      // modal (moysklad Отгрузка parity). The search box clears.
                      clearQueryOnPick
                      onPick={(item, entry) => {
                        const raw = item.raw as ProductItem | undefined;
                        const defaultPrice = resolveDefaultSalePriceOrZero(
                          raw?.salePrices,
                          defaultId,
                        );
                        const newId = uid();
                        setForm((s) =>
                          s
                            ? {
                                ...s,
                                positions: [
                                  ...s.positions,
                                  {
                                    id: newId,
                                    assortmentId: item.id,
                                    productLabel: item.primary,
                                    productCode: raw?.code ?? undefined,
                                    productArticle: raw?.article ?? undefined,
                                    productUom: raw?.uom ?? null,
                                    quantity: entry?.quantity ?? '1',
                                    priceMinor: entry?.priceMinor ?? defaultPrice,
                                    discount: '0',
                                    vat: raw?.vat != null ? String(raw.vat) : '12',
                                    vatEnabled: s.vatEnabled,
                                    stock: raw?.stock?.onHand,
                                    available: raw?.stock?.available,
                                    weightG: raw?.weightG ?? undefined,
                                    volumeML: raw?.volumeML ?? undefined,
                                    imageUrl: raw?.mainImageId
                                      ? imageRawUrl(raw.mainImageId)
                                      : undefined,
                                    salePrices: raw?.salePrices ?? null,
                                  },
                                ],
                              }
                            : s,
                        );
                        // owner 2026-07-18: returning the id hands focus to the new
                        // row's «Кол-во» (modal → table entry chain).
                        return newId;
                      }}
                      onAddFromCatalog={() => setOpenCatalogPicker(true)}
                      onCheckCompleteness={() => {
                        if (!form.storeId) {
                          toast.error(tDemands('select_store_first'));
                          return;
                        }
                        if (form.positions.length === 0) {
                          toast.error(tDemands('add_position_first'));
                          return;
                        }
                      }}
                    />
                  ) : undefined
                }
              />

              <div className="flex flex-col items-start justify-between gap-4 sm:flex-row">
                <div className="flex w-full flex-col gap-3 text-sm sm:w-[520px] sm:max-w-full">
                  <Textarea
                    rows={3}
                    value={form.description}
                    onChange={(e) => setForm((s) => s && { ...s, description: e.target.value })}
                    placeholder={tFields('description')}
                    aria-label={tFields('description')}
                    disabled={!editable}
                    data-test-id="field-description"
                  />
                </div>
                <DocumentTotalsPanel
                  labels={totalsLabels}
                  subtotalMinor={totals.net}
                  vatMinor={totals.vat}
                  totalMinor={totals.gross}
                  currency={form.currency}
                  vatEnabled={form.vatEnabled}
                  onVatEnabledChange={
                    editable ? (v) => setForm((s) => s && { ...s, vatEnabled: v }) : undefined
                  }
                  vatIncluded={form.vatIncluded}
                  onVatIncludedChange={
                    editable ? (v) => setForm((s) => s && { ...s, vatIncluded: v }) : undefined
                  }
                  quantity={totalQty}
                  profitMinor={profitMinor}
                  profitUnknown={profitUnknown}
                  weight={measures.weight}
                  volume={measures.volume}
                />
              </div>

              {/* «Другие поля» — transport block + Накладные расходы + Внешний код +
                  Проведён, hidden by default exactly like moysklad + /demands/new. */}
              {/* «Грузоотправитель» — moysklad groups the 10 shipping fields under
                  this heading (capture demand-02-detail: shippingBlock_Грузоотправитель).
                  Ours used to sit in a generic «Другие поля» with our extras mixed in. */}
              <DocumentDisclosurePanel title={tFields('consignor')} defaultOpen={false}>
                <DocumentMetaColumns>
                  <DocumentMetaColumn>
                    <DocumentMetaField label={tFields('consignor')}>
                      <CatalogPickerField
                        value={
                          form.consignorId
                            ? { id: form.consignorId, label: form.consignorLabel }
                            : null
                        }
                        placeholder={tFields('consignor')}
                        onPick={() => editable && setOpenPicker('consignor')}
                        onClear={() =>
                          editable &&
                          setForm((s) => s && { ...s, consignorId: null, consignorLabel: '' })
                        }
                        disabled={!editable}
                        testId="field-consignor"
                      />
                    </DocumentMetaField>
                    <DocumentMetaField label={tFields('consignee')}>
                      <CatalogPickerField
                        value={
                          form.consigneeId
                            ? { id: form.consigneeId, label: form.consigneeLabel }
                            : null
                        }
                        placeholder={tFields('consignee')}
                        onPick={() => editable && setOpenPicker('consignee')}
                        onClear={() =>
                          editable &&
                          setForm((s) => s && { ...s, consigneeId: null, consigneeLabel: '' })
                        }
                        disabled={!editable}
                        testId="field-consignee"
                      />
                    </DocumentMetaField>
                    <DocumentMetaField label={tFields('carrier')}>
                      <CatalogPickerField
                        value={
                          form.carrierId ? { id: form.carrierId, label: form.carrierLabel } : null
                        }
                        placeholder={tFields('carrier')}
                        onPick={() => editable && setOpenPicker('carrier')}
                        onClear={() =>
                          editable &&
                          setForm((s) => s && { ...s, carrierId: null, carrierLabel: '' })
                        }
                        disabled={!editable}
                        testId="field-carrier"
                      />
                    </DocumentMetaField>
                  </DocumentMetaColumn>

                  <DocumentMetaColumn>
                    <DocumentMetaField label={tFields('cargo_name')}>
                      <Input
                        value={form.cargoName}
                        onChange={(e) => setForm((s) => s && { ...s, cargoName: e.target.value })}
                        disabled={!editable}
                        data-test-id="field-cargo-name"
                      />
                    </DocumentMetaField>
                    <DocumentMetaField label={tFields('transport_facility')}>
                      <Input
                        value={form.transportFacility}
                        onChange={(e) =>
                          setForm((s) => s && { ...s, transportFacility: e.target.value })
                        }
                        disabled={!editable}
                        data-test-id="field-transport-facility"
                      />
                    </DocumentMetaField>
                    <DocumentMetaField label={tFields('car_number')}>
                      <Input
                        value={form.carNumber}
                        onChange={(e) => setForm((s) => s && { ...s, carNumber: e.target.value })}
                        disabled={!editable}
                        data-test-id="field-car-number"
                      />
                    </DocumentMetaField>
                    <DocumentMetaField label={tFields('places_count')}>
                      <Input
                        type="number"
                        min="0"
                        value={form.placesCount}
                        onChange={(e) => setForm((s) => s && { ...s, placesCount: e.target.value })}
                        disabled={!editable}
                        data-test-id="field-places-count"
                      />
                    </DocumentMetaField>
                    <DocumentMetaField label={tFields('shipper_instructions')}>
                      <Input
                        value={form.shipperInstructions}
                        onChange={(e) =>
                          setForm((s) => s && { ...s, shipperInstructions: e.target.value })
                        }
                        disabled={!editable}
                        data-test-id="field-shipper-instructions"
                      />
                    </DocumentMetaField>
                  </DocumentMetaColumn>

                  <DocumentMetaColumn>
                    <DocumentMetaField label={tFields('shipping_doc_no')}>
                      <Input
                        value={form.shippingDocNo}
                        onChange={(e) =>
                          setForm((s) => s && { ...s, shippingDocNo: e.target.value })
                        }
                        disabled={!editable}
                        data-test-id="field-shipping-doc-no"
                      />
                    </DocumentMetaField>
                    <DocumentMetaField label={tFields('shipping_doc_date')}>
                      <Input
                        type="date"
                        value={form.shippingDocDate}
                        onChange={(e) =>
                          setForm((s) => s && { ...s, shippingDocDate: e.target.value })
                        }
                        disabled={!editable}
                        data-test-id="field-shipping-doc-date"
                      />
                    </DocumentMetaField>
                    <DocumentMetaField label={tFields('state_contract_id')}>
                      <Input
                        value={form.stateContractId}
                        onChange={(e) =>
                          setForm((s) => s && { ...s, stateContractId: e.target.value })
                        }
                        disabled={!editable}
                        data-test-id="field-state-contract-id"
                      />
                    </DocumentMetaField>
                  </DocumentMetaColumn>
                </DocumentMetaColumns>
              </DocumentDisclosurePanel>

              {/* «Другие поля» — OUR additions, not part of moysklad's
                  «Грузоотправитель» block: Внешний код, Проведён и Накладные
                  расходы. Split out so the block above is a faithful 1:1 of the
                  capture's 10-field group instead of interleaving our extras. */}
              <DocumentDisclosurePanel title={tForm('other_fields')} defaultOpen={false}>
                <DocumentMetaColumns>
                  <DocumentMetaColumn>
                    <DocumentMetaField label={tDetailForm('external_code')}>
                      <Input
                        value={form.externalCode}
                        onChange={(e) =>
                          setForm((s) => s && { ...s, externalCode: e.target.value })
                        }
                        disabled={!editable}
                        placeholder="—"
                        data-test-id="field-external-code"
                      />
                    </DocumentMetaField>
                    <DocumentMetaField label={tFields('posted_at')}>
                      <Input
                        value={data.postedAt ? formatDate(data.postedAt) : ''}
                        disabled
                        placeholder="—"
                        data-test-id="field-posted-at"
                      />
                    </DocumentMetaField>
                  </DocumentMetaColumn>

                  <DocumentMetaColumn>
                    <DocumentMetaField label={tDetailForm('overhead_sum')}>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        value={form.overheadMajor}
                        placeholder="0"
                        onChange={(e) =>
                          setForm((s) => s && { ...s, overheadMajor: e.target.value })
                        }
                        disabled={!editable}
                        data-test-id="field-overhead-sum"
                      />
                    </DocumentMetaField>
                    <DocumentMetaField label={tDetailForm('overhead_distribution')}>
                      <NativeSelect
                        value={form.overheadDistribution}
                        onChange={(e) =>
                          setForm(
                            (s) =>
                              s && {
                                ...s,
                                overheadDistribution: e.target
                                  .value as FormState['overheadDistribution'],
                              },
                          )
                        }
                        data-test-id="field-overhead-distribution"
                        disabled={!editable || !(Number(form.overheadMajor) > 0)}
                      >
                        <option value="PRICE">{tDetailForm('overhead_by_price')}</option>
                        <option value="WEIGHT">{tDetailForm('overhead_by_weight')}</option>
                        <option value="VOLUME">{tDetailForm('overhead_by_volume')}</option>
                        <option value="QUANTITY">{tDetailForm('overhead_by_quantity')}</option>
                      </NativeSelect>
                    </DocumentMetaField>
                  </DocumentMetaColumn>
                </DocumentMetaColumns>
              </DocumentDisclosurePanel>
            </div>
          </DetailContentTabs>
        </div>
      </main>

      {/* Field pickers (modal fallback for the inline autocompletes) */}
      <CatalogPicker
        open={openPicker === 'agent'}
        onClose={() => setOpenPicker(null)}
        title={tFields('agent')}
        fetcher={agentFetcher}
        onSelect={(item) =>
          setForm((s) => s && { ...s, agentId: item.id, agentLabel: String(item.primary) })
        }
      />
      <CatalogPicker
        open={openPicker === 'org'}
        onClose={() => setOpenPicker(null)}
        title={tFields('organization')}
        fetcher={orgFetcher}
        onSelect={(item) =>
          setForm(
            (s) => s && { ...s, organizationId: item.id, organizationLabel: String(item.primary) },
          )
        }
      />
      <CatalogPicker
        open={openPicker === 'store'}
        onClose={() => setOpenPicker(null)}
        title={tFields('store')}
        fetcher={storeFetcher}
        onSelect={(item) =>
          setForm((s) => s && { ...s, storeId: item.id, storeLabel: String(item.primary) })
        }
      />
      <CatalogPicker
        open={openPicker === 'salesChannel'}
        onClose={() => setOpenPicker(null)}
        title={tFields('sales_channel')}
        fetcher={salesChannelFetcher}
        onSelect={(item) =>
          setForm(
            (s) => s && { ...s, salesChannelId: item.id, salesChannelLabel: String(item.primary) },
          )
        }
      />
      <CatalogPicker
        open={openPicker === 'contract'}
        onClose={() => setOpenPicker(null)}
        title={tFields('contract')}
        fetcher={contractFetcher}
        onSelect={(item) =>
          setForm((s) => s && { ...s, contractId: item.id, contractLabel: String(item.primary) })
        }
      />
      <CatalogPicker
        open={openPicker === 'project'}
        onClose={() => setOpenPicker(null)}
        title={tFields('project')}
        fetcher={projectFetcher}
        onSelect={(item) =>
          setForm((s) => s && { ...s, projectId: item.id, projectLabel: String(item.primary) })
        }
      />
      <CatalogPicker
        open={openPicker === 'organizationAccount'}
        onClose={() => setOpenPicker(null)}
        title={tFields('organization_account')}
        fetcher={organizationAccountFetcher}
        onSelect={(item) =>
          setForm(
            (s) =>
              s && {
                ...s,
                organizationAccountId: item.id,
                organizationAccountLabel: String(item.primary),
              },
          )
        }
      />
      <CatalogPicker
        open={openPicker === 'consignor'}
        onClose={() => setOpenPicker(null)}
        title={tFields('consignor')}
        fetcher={counterpartyFetcher}
        onSelect={(item) =>
          setForm((s) => s && { ...s, consignorId: item.id, consignorLabel: String(item.primary) })
        }
      />
      <CatalogPicker
        open={openPicker === 'consignee'}
        onClose={() => setOpenPicker(null)}
        title={tFields('consignee')}
        fetcher={counterpartyFetcher}
        onSelect={(item) =>
          setForm((s) => s && { ...s, consigneeId: item.id, consigneeLabel: String(item.primary) })
        }
      />
      <CatalogPicker
        open={openPicker === 'carrier'}
        onClose={() => setOpenPicker(null)}
        title={tFields('carrier')}
        fetcher={counterpartyFetcher}
        onSelect={(item) =>
          setForm((s) => s && { ...s, carrierId: item.id, carrierLabel: String(item.primary) })
        }
      />

      {/* Per-row product picker (name-cell click / ⋮ «Заменить») */}
      <CatalogPicker
        open={openCatalogPicker || productRowId !== null}
        onClose={() => {
          setOpenCatalogPicker(false);
          setProductRowId(null);
        }}
        title={tDetailForm('add_from_catalog')}
        fetcher={productFetcher}
        onSelect={(item) => {
          const raw = (item as { raw?: ProductItem }).raw;
          const defaultPrice = resolveDefaultSalePriceOrZero(raw?.salePrices, defaultId);
          if (productRowId) {
            // Swap the product on the clicked row.
            updatePosition(productRowId, {
              assortmentId: item.id,
              productLabel: String(item.primary),
              productCode: raw?.code ?? undefined,
              productArticle: raw?.article ?? undefined,
              productUom: raw?.uom ?? null,
              priceMinor: defaultPrice,
              vat: raw?.vat != null ? String(raw.vat) : '12',
              stock: raw?.stock?.onHand,
              available: raw?.stock?.available,
              salePrices: raw?.salePrices ?? null,
            });
            setProductRowId(null);
            return;
          }
          setForm((s) =>
            s
              ? {
                  ...s,
                  positions: [
                    ...s.positions,
                    {
                      id: uid(),
                      assortmentId: item.id,
                      productLabel: String(item.primary),
                      productCode: raw?.code ?? undefined,
                      productArticle: raw?.article ?? undefined,
                      productUom: raw?.uom ?? null,
                      quantity: '1',
                      priceMinor: defaultPrice,
                      discount: '0',
                      vat: raw?.vat != null ? String(raw.vat) : '12',
                      vatEnabled: s.vatEnabled,
                      stock: raw?.stock?.onHand,
                      available: raw?.stock?.available,
                      salePrices: raw?.salePrices ?? null,
                    },
                  ],
                }
              : s,
          );
        }}
      />

      {form.currency !== 'UZS' && (
        <CurrencyRateModal
          open={rateModalOpen}
          onOpenChange={setRateModalOpen}
          currency={form.currency}
          referenceRate={adminRate ?? '1'}
          currentOverride={rateOverride}
          onApply={setRateOverride}
          disabled={!editable}
        />
      )}

      {spiska && <ReceiptPrintPortal data={spiska} onClose={closeSheet} />}
      {creceipt && <CustomerReceiptPortal data={creceipt} onClose={() => setCreceipt(null)} />}

      <SendEmailDialog
        open={emailOpen}
        onClose={() => setEmailOpen(false)}
        entity="Demand"
        entityId={data.id}
        defaultSubject={tEmail('subject_shipment', { name: data.name })}
        defaultBodyHtml={tEmail.raw('body_shipment')}
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
            setForm((s) =>
              s
                ? {
                    ...s,
                    positions: [
                      ...s.positions,
                      {
                        id: uid(),
                        assortmentId: created.id,
                        productLabel: created.name,
                        productUom: created.uom ?? null,
                        quantity: '1',
                        priceMinor: resolveDefaultSalePriceOrZero(created.salePrices, defaultId),
                        discount: '0',
                        vat: created.vat != null ? String(created.vat) : '12',
                        vatEnabled: s.vatEnabled,
                        salePrices: created.salePrices ?? null,
                      },
                    ],
                  }
                : s,
            );
          }}
        />
      )}
    </div>
  );
}
