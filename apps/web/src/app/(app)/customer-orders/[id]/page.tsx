'use client';

import { AttachmentsSection } from '@/components/attachments-section';
import { AttributeInput, type AttributeMetaRow } from '@/components/attributes-editor';
import {
  type DeliveryAddressFull,
  DeliveryAddressGroup,
} from '@/components/customer-orders/delivery-address-group';
import { RelatedDocsTab } from '@/components/customer-orders/related-docs-tab';
import {
  type CreateMenuItem,
  DetailContentTabs,
  DetailToolbar,
  DocumentHistoryLink,
} from '@/components/document-detail';
import { CurrencyRateModal } from '@/components/document-detail/currency-rate-modal';
import { DocumentTasksSection } from '@/components/document-tasks-section';
import {
  OwnerAccessPopover,
  type OwnerAccessValue,
} from '@/components/documents/owner-access-popover';
import { PositionColumnCustomizer } from '@/components/documents/position-column-customizer';
import { PositionPriceMenu } from '@/components/documents/position-price-menu';
import { PositionReserveMenu } from '@/components/documents/position-reserve-menu';
import { PresenceIndicator } from '@/components/documents/presence-indicator';
import { SendEmailDialog } from '@/components/send-email-dialog';
import { useApiMutation } from '@/hooks/use-api-mutation';
import { useConflictReload } from '@/hooks/use-conflict-reload';
import { useDestructiveMutation } from '@/hooks/use-destructive-mutation';
import { useDetailNavigation } from '@/hooks/use-detail-navigation';
import { useDocumentEditorLabels } from '@/hooks/use-document-editor-labels';
import { usePresence } from '@/hooks/use-presence';
import { useSaveMutation } from '@/hooks/use-save-mutation';
import { useUnsavedGuard } from '@/hooks/use-unsaved-guard';
import { api } from '@/lib/api-client';
import { resolveDefaultSalePriceOrZero, usePriceTypeIds } from '@/lib/sale-price';
import { computePositionTotal } from '@moysklad/money';
import {
  Button,
  CatalogPicker,
  CatalogPickerField,
  DatePicker,
  type DocPositionRow,
  DocumentHeader,
  DocumentMetaColumn,
  DocumentMetaColumns,
  DocumentMetaField,
  DocumentTotalsPanel,
  FormField,
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
  /** «Зарезерв.» — this order's per-line held quantity. */
  reservedQty: string | number | null;
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

interface OrderDetail {
  id: string;
  version: number;
  name: string;
  externalCode: string | null;
  state: string;
  /** Account-defined custom status (moysklad «Статус», e.g. «Текширилмаган»).
   *  Separate from the internal FSM `state`; null until one is chosen. */
  status: { id: string; name: string; color: string | null } | null;
  applicable: boolean;
  moment: string;
  deliveryPlannedMoment: string | null;
  description: string | null;
  sumMinor: string;
  vatSumMinor: string;
  payedSumMinor: string;
  invoicedSumMinor: string;
  shippedSumMinor: string;
  vatEnabled: boolean;
  vatIncluded: boolean;
  /** Currency code (UZS, USD, RUB, ...). */
  currency: string;
  /** Per-document FX rate snapshot, 8-dp minor units (e.g. "1199026000000" = 11990.26). */
  rateValue: string | null;
  /** Single-line denormalised delivery address (legacy). */
  shipmentAddress: string | null;
  /** Structured delivery address (city/street/building/...). */
  shipmentAddressFull: DeliveryAddressFull | null;
  agent: { id: string; name: string; legalTitle: string | null; companyType: string };
  organization: { id: string; name: string; legalTitle: string | null };
  store: { id: string; name: string };
  contract: { id: string; name: string } | null;
  project: { id: string; name: string } | null;
  salesChannel: { id: string; name: string } | null;
  organizationAccount: { id: string; name: string; accountNumber: string | null } | null;
  owner: { id: string; name: string } | null;
  /** «Владелец-отдел» (department) — resolved by the service (no Prisma relation
   *  on CustomerOrder; scalar groupId only). null when no department is set. */
  group: { id: string; name: string } | null;
  /** «Общий доступ» (shared) flag. */
  shared: boolean;
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
  // moysklad position table shows the product's live stock cluster (Остаток /
  // Резерв) per row; /products returns it, we carry it onto the position.
  stock?: { onHand: string; reserved: string; inTransit: string; available: string } | null;
  // Per-unit weight (g) / volume (ml) — carried onto the row so «Вес»/«Объём»
  // show the line total (× Кол-во).
  weightG?: number | null;
  volumeML?: number | null;
  // Main image id — builds the «Изображение» thumbnail URL.
  mainImageId?: string | null;
}

// Detail-page position row — the PositionTable row shape (keyed on `id`, not
// PositionEditor's `_uid`). Mirrors /new's NewPositionRow: carries assortmentId
// + the product's full price list so «Расценить» can re-price without re-fetch.
interface DetailPositionRow extends DocPositionRow {
  assortmentId: string | null;
  salePrices?: Array<{ priceTypeId: string; value: string }> | null;
}

function uid(): string {
  return Math.random().toString(36).slice(2);
}

// Per-line total for the live «Итого» footer — delegates to the shared
// `computePositionTotal` (the single source the BE + print use) so the editable
// detail footer shows the EXACT total the API will post, updating as the user
// edits qty/price/discount. Mirrors /new/page.tsx's helper of the same name.
function computeLineTotal(
  p: DetailPositionRow,
  vatIncluded: boolean,
): { net: bigint; vat: bigint; gross: bigint } {
  try {
    const { totalMinor, vatAmountMinor, baseMinor } = computePositionTotal(
      {
        quantity: p.quantity || '0',
        priceMinor: p.priceMinor || '0',
        discount: p.discount || '0',
        vat: p.vatEnabled && p.vat ? Number(p.vat) : null,
      },
      p.vatEnabled,
      vatIncluded,
    );
    return { net: baseMinor, vat: vatAmountMinor, gross: totalMinor };
  } catch {
    return { net: 0n, vat: 0n, gross: 0n };
  }
}

/** ISO moment (UTC) → local `YYYY-MM-DDTHH:MM` — the string the shared
 *  <DocumentHeader> expects (date.slice(0,10) + time at slice(11,16)). Mirrors
 *  /new's docDate initialiser so the header reads/writes the same shape. */
function momentToLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// moysklad position table = fixed columns + optional columns toggled by the
// «Сумма ⚙» customizer. Default-visible: reserve + stock + vatAmount ON (live-
// grounded against the customer-order header); image / available / waiting /
// shipped / weight / volume OFF (mirrors /new/page.tsx exactly).
const OPTIONAL_POSITION_COLUMNS: { key: PositionColumnKey; on: boolean }[] = [
  { key: 'image', on: false },
  // «Единица измерения» — base unit, rendered INLINE in «Кол-во» («1 шт»); ON by
  // default (mirrors /new + the purchase-order grid).
  { key: 'unit', on: true },
  { key: 'code', on: false },
  { key: 'article', on: false },
  { key: 'reserve', on: true },
  { key: 'stock', on: true },
  { key: 'available', on: false },
  { key: 'waiting', on: false },
  { key: 'shipped', on: false },
  { key: 'weight', on: false },
  { key: 'volume', on: false },
  { key: 'vatAmount', on: true },
];
const DEFAULT_COL_VISIBLE: Record<string, boolean> = Object.fromEntries(
  OPTIONAL_POSITION_COLUMNS.map((c) => [c.key, c.on]),
);

// FSM transition map and state-meta map were inlined here previously.
// They've moved to first-class components (DetailHeader for the
// status pill + Provedeno toggle, DetailToolbar for the FSM-aware
// "Создать документ" dropdown gating). The page itself now only
// needs the canCreateDemand / canCreateInvoice helpers below.

interface FormState {
  /** «№» — editable document number (moysklad header field). Empty ⇒ auto on save. */
  name: string;
  /** «от» — editable document moment, as the local `YYYY-MM-DDTHH:MM` string the
   *  shared <DocumentHeader> expects (mirrors /new's docDate format exactly). */
  moment: string;
  agentId: string;
  agentLabel: string;
  organizationId: string;
  organizationLabel: string;
  storeId: string;
  storeLabel: string;
  contractId: string | null;
  contractLabel: string;
  projectId: string | null;
  projectLabel: string;
  salesChannelId: string | null;
  salesChannelLabel: string;
  organizationAccountId: string | null;
  organizationAccountLabel: string;
  /** Document currency code (UZS / USD / RUB) — moysklad's "Валюта документа" dropdown. */
  currency: string;
  /** Planned shipment date — moysklad's "План. дата отгрузки" date input.
   *  Stored as ISO yyyy-mm-dd; null when unset. */
  deliveryPlannedMoment: string | null;
  /** Structured delivery address — moysklad's "Адрес доставки" expandable. */
  deliveryAddressFull: DeliveryAddressFull;
  /** Free-form delivery-address text — moysklad's main «Адрес доставки» textarea
   *  (the structured group recomposes this when used). */
  deliveryAddressText: string;
  description: string;
  /** «Внешний код» — editable metadata field (moysklad parity). */
  externalCode: string;
  /** Account-defined custom status id (moysklad «Статус» dropdown). Saved via
   *  the PATCH like any other edited field. */
  statusId: string | null;
  vatEnabled: boolean;
  vatIncluded: boolean;
  /** «Владелец» / «Владелец-отдел» / «Общий доступ» — editable via the header
   *  owner popover (mirrors /new). BE writes all three regardless of `applicable`. */
  ownerAccess: OwnerAccessValue;
  positions: DetailPositionRow[];
  attributes: Record<string, unknown>;
}

function formFromData(d: OrderDetail): FormState {
  return {
    name: d.name,
    moment: momentToLocalInput(d.moment),
    agentId: d.agent.id,
    agentLabel: d.agent.name,
    organizationId: d.organization.id,
    organizationLabel: d.organization.name,
    storeId: d.store.id,
    storeLabel: d.store.name,
    contractId: d.contract?.id ?? null,
    contractLabel: d.contract?.name ?? '',
    projectId: d.project?.id ?? null,
    projectLabel: d.project?.name ?? '',
    salesChannelId: d.salesChannel?.id ?? null,
    salesChannelLabel: d.salesChannel?.name ?? '',
    organizationAccountId: d.organizationAccount?.id ?? null,
    organizationAccountLabel:
      d.organizationAccount?.accountNumber || d.organizationAccount?.name || '',
    currency: d.currency,
    deliveryPlannedMoment: d.deliveryPlannedMoment ? d.deliveryPlannedMoment.slice(0, 10) : null,
    deliveryAddressFull: d.shipmentAddressFull ?? {},
    deliveryAddressText: d.shipmentAddress ?? '',
    description: d.description ?? '',
    externalCode: d.externalCode ?? '',
    statusId: d.status?.id ?? null,
    vatEnabled: d.vatEnabled,
    vatIncluded: d.vatIncluded,
    ownerAccess: {
      ownerId: d.owner?.id ?? null,
      ownerLabel: d.owner?.name ?? '',
      groupId: d.group?.id ?? null,
      groupLabel: d.group?.name ?? '',
      shared: d.shared ?? false,
    },
    // PositionTable keys on `id` (DocPositionRow.id), not PositionEditor's
    // `_uid`. Use the persisted position id as the stable React key.
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
      // «Зарезерв.» = THIS order's per-line hold (so an edit re-sends it and the
      // reserve survives; the column shows the real held qty, not store-wide total).
      reserve: p.reservedQty != null ? String(p.reservedQty) : '0',
      // Per-unit weight/volume → «Вес»/«Объём» line total (× Кол-во).
      weightG: p.product?.weightG ?? undefined,
      volumeML: p.product?.volumeML ?? undefined,
      imageUrl: p.product?.images?.[0]?.id
        ? `/api/v1/images/${p.product.images[0].id}/raw`
        : undefined,
      salePrices: null,
    })),
    attributes: (d as { attributes?: Record<string, unknown> }).attributes ?? {},
  };
}

/**
 * Compose the denormalised single-line address (legacy column).
 * Mirrors moysklad's display: "City, Street Building, Apt — Country, Index".
 */
function composeAddress(a: DeliveryAddressFull): string | null {
  const parts: string[] = [];
  if (a.country) parts.push(a.country);
  if (a.index) parts.push(a.index);
  if (a.city) parts.push(a.city);
  if (a.street || a.building) {
    parts.push([a.street, a.building].filter(Boolean).join(' '));
  }
  if (a.apartment) parts.push(a.apartment);
  if (a.other) parts.push(a.other);
  const composed = parts.filter(Boolean).join(', ').trim();
  return composed || null;
}

function snapshot(s: FormState): string {
  return JSON.stringify({
    name: s.name,
    moment: s.moment,
    agentId: s.agentId,
    organizationId: s.organizationId,
    storeId: s.storeId,
    contractId: s.contractId,
    projectId: s.projectId,
    salesChannelId: s.salesChannelId,
    organizationAccountId: s.organizationAccountId,
    currency: s.currency,
    deliveryPlannedMoment: s.deliveryPlannedMoment,
    deliveryAddressFull: s.deliveryAddressFull,
    deliveryAddressText: s.deliveryAddressText,
    description: s.description,
    externalCode: s.externalCode,
    statusId: s.statusId,
    vatEnabled: s.vatEnabled,
    vatIncluded: s.vatIncluded,
    ownerId: s.ownerAccess.ownerId,
    groupId: s.ownerAccess.groupId,
    shared: s.ownerAccess.shared,
    positions: s.positions.map((p) => ({
      assortmentId: p.assortmentId,
      quantity: p.quantity,
      priceMinor: p.priceMinor,
      discount: p.discount,
      vat: p.vat,
      vatEnabled: p.vatEnabled,
    })),
    attributes: s.attributes,
  });
}

// State-tone map for the customer-order FSM. Drives the colored
// pill in DetailHeader. Each detail page declares its own.

// moysklad parity: inline state-change dropdown («Новый ▾») colour
// swatches — mirror the list-view StatusChangeDropdown palette.
const STATE_COLOR: Record<string, string> = {
  draft: '#9ca3af',
  confirmed: '#2563eb',
  awaiting_payment: '#e68116',
  paid: '#008739',
  partially_shipped: '#a2c617',
  fully_shipped: '#16a34a',
  closed: '#475569',
  cancelled: '#e92919',
};
const ORDER_STATES = [
  'draft',
  'confirmed',
  'awaiting_payment',
  'paid',
  'partially_shipped',
  'fully_shipped',
  'closed',
  'cancelled',
] as const;

export default function CustomerOrderDetailPage() {
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tForm = useTranslations('form');
  const tDetailForm = useTranslations('detail_form');
  // Localized DocumentHeader labels (applicableLabel «Проведено», numberPlaceholder
  // «Авто», …) — WITHOUT spreading these the shared component falls back to its
  // hardcoded RUSSIAN defaults, leaking RU into the UZ detail header. /new already
  // passes them; the converged /[id] form must too (mirror).
  const docEditorLabels = useDocumentEditorLabels();
  const tDetailHeader = useTranslations('detail_header');
  const tCurShort = useTranslations('currency_short');
  const tDetailTitles = useTranslations('detail_titles');
  const tStates = useTranslations('states.customer_order');
  const tDetailTabs = useTranslations('detail_tabs');
  const tEmail = useTranslations('email_template');
  const tPrint = useTranslations('print_menu');
  // position_editor / position_cols — explicit labels for the shared
  // PositionTable + PositionInlineAdd (without them the position area falls
  // back to Latin-uz / the table's RU defaults; same class as /new/page.tsx).
  const tPos = useTranslations('position_editor');
  const tCols = useTranslations('position_cols');
  const tPages = useTranslations('pages.customer_orders');
  // Sherset custom — «Yig'ishga yuborish» (picking) labels.
  const tPicking = useTranslations('picking');
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  // Server mode → real «N из ВСЕГО» + whole-set ‹ › (shows even on direct URL).
  const detailNav = useDetailNavigation('customer-orders', id, { server: true });
  const { toast } = useToast();
  const { defaultId } = usePriceTypeIds();
  // Price types for the «Цена ▾» → «Расценить» (re-price by type) menu.
  const { data: priceTypesData } = useQuery<{ items: Array<{ id: string; name: string }> }>({
    queryKey: ['price-types'],
    queryFn: () => api.get('/price-types'),
    staleTime: 60_000,
  });

  const { data, isLoading } = useQuery<OrderDetail>({
    queryKey: ['customer-order', id],
    queryFn: () => api.get(`/customer-orders/${id}`),
  });

  // moysklad «Смотрит» — OTHER employees currently viewing THIS saved order
  // (heartbeat presence). Empty (indicator hidden) when you're the only viewer.
  const presenceViewers = usePresence('CustomerOrder', id);

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
  >(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const [openCatalogPicker, setOpenCatalogPicker] = useState(false);
  // Per-row product picker for the position «Наименование» cell (mirrors
  // /new's { kind: 'product', rowUid }). Holds the row id whose name-cell was
  // clicked; null when closed. Reuses the existing productFetcher below.
  const [productRowId, setProductRowId] = useState<string | null>(null);
  // moysklad «Сумма ⚙» column customizer — toggles the optional position columns.
  const [colVisible, setColVisible] = useState<Record<string, boolean>>(DEFAULT_COL_VISIBLE);
  // Bulk-select set for the position table's leading checkbox column.
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  // moysklad parity: «Внешний код» is a collapsed LINK under the comment; clicking
  // expands the input (mirrors /new). Auto-expanded when a value already exists.
  const [showExternalCode, setShowExternalCode] = useState(false);
  // «НДС» cell is click-to-edit (moysklad parity): the rate shows as plain text
  // («без НДС»/«12%») until the cell is clicked, then a <select> takes over.
  const [editingVatId, setEditingVatId] = useState<string | null>(null);
  // «Канал продаж» «+» quick-create — a modal (NOT navigation, which would lose the
  // unsaved order form) that creates a channel and selects it, like moysklad.
  const [channelCreateOpen, setChannelCreateOpen] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');

  // Related docs (Связанные документы tab) — fetched lazily once the
  // user opens the tab. Empty arrays until then so the diagram can
  // still render with just the current doc card.
  const { data: related } = useQuery<{
    demands: Array<{ id: string; name: string; moment: string; state: string; sumMinor: string }>;
    invoicesOut: Array<{
      id: string;
      name: string;
      moment: string;
      state: string;
      sumMinor: string;
    }>;
    prepayments: Array<{
      id: string;
      name: string;
      moment: string;
      state: string;
      sumMinor: string;
    }>;
    moves: Array<{ id: string; name: string; moment: string; state: string; sumMinor: string }>;
  }>({
    queryKey: ['customer-order-related', id],
    queryFn: () => api.get(`/customer-orders/${id}/related`),
  });

  // Account-defined custom statuses (moysklad «Статус») — the header colour
  // dropdown lists these; the FSM `state` stays internal (driven by
  // «Проведено» + document creation). When the account has none, the header
  // falls back to the FSM state dropdown (below) so nothing is lost.
  const { data: statusData } = useQuery<{
    items: Array<{ id: string; name: string; color: string | null }>;
  }>({
    queryKey: ['states', 'customerorder'],
    queryFn: () => api.get('/states?entityType=customerorder'),
    staleTime: 60_000,
  });
  const customStatuses = statusData?.items ?? [];

  // Account-defined custom fields (доп. поля, e.g. «Уста»/«Санаси»). Rendered
  // INLINE in the meta grid (round-robin across the three columns), replacing
  // the bottom <AttributesEditor>; values live in form.attributes (single
  // source, already round-trips in the PATCH). Mirrors /new/page.tsx.
  const { data: attrMetaData } = useQuery<{ items: AttributeMetaRow[] }>({
    queryKey: ['attribute-metadata-entity', 'CustomerOrder'],
    queryFn: () => api.get('/attribute-metadata/entity/CustomerOrder'),
    staleTime: 60_000,
  });

  // moysklad parity: «Баланс : <amount>» caption under Контрагент — the
  // counterparty's balance ledger for the document currency. Empty/no-row ⇒
  // 0,00. Shown only once an agent is picked (mirrors /new/page.tsx).
  const { data: agentBalanceData } = useQuery<{
    items: Array<{ currency: string; balanceMinor: string }>;
  }>({
    queryKey: ['counterparty-balance', form?.agentId],
    queryFn: () => api.get(`/counterparty-balances/${form?.agentId}`),
    enabled: !!form?.agentId,
  });

  // moysklad parity: «1 {cur} = N UZS» helper under «Валюта» with a «✎» that opens
  // the rate modal (CurrencyRateModal). `rateOverride` (null ⇒ reference rate) is
  // view-only local state; the override is sent in the PATCH payload as rateValue.
  const [rateOverride, setRateOverride] = useState<string | null>(null);
  // moysklad «Курс валюты документа» — the «✎» opens a modal (CurrencyRateModal),
  // not an inline input. `rateOverride` (null ⇒ use the reference rate) is the choice.
  const [rateModalOpen, setRateModalOpen] = useState(false);
  // «Курс валюты документа» — rate from the account currency-справочник (Настройки
  // → Валюты), the admin-set value moysklad books documents at — NOT a live CB
  // feed (drifts e.g. 11 990 vs 12 200, storing USD docs at the wrong base value).
  // One source of truth → GET /currencies (mirror enters / losses / payments-in).
  const { data: currenciesData } = useQuery<{ items: Array<{ isoCode: string; rate: string }> }>({
    queryKey: ['currencies'],
    queryFn: () => api.get('/currencies'),
    staleTime: 60_000,
  });
  const adminRate = (currenciesData?.items ?? []).find((c) => c.isoCode === form?.currency)?.rate;
  const effectiveRate = rateOverride ?? adminRate ?? '1';

  useEffect(() => {
    if (data && !form) {
      const initial = formFromData(data);
      setForm(initial);
      setOriginal(snapshot(initial));
      // moysklad shows the document's OWN saved FX rate (snapshot), not today's
      // reference. Seed the override from the persisted rateValue (8-dp minor →
      // human rate) so the «1 {cur} = N UZS» helper + modal reflect the doc.
      if (data.currency !== 'UZS' && data.rateValue && data.rateValue !== '0') {
        setRateOverride((Number(data.rateValue) / 1e8).toString());
      }
    }
  }, [data, form]);

  const isDirty = useMemo(() => (form ? snapshot(form) !== original : false), [form, original]);
  useUnsavedGuard(isDirty);

  // ── Position table callbacks (mirror /new) — all mutate form.positions ──
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
  // «Зарезерв. ▾» bulk-reserve (moysklad: «Поставить резерв» / «Снять резерв»).
  // Set each line's reserve to its full quantity, or clear all to 0. The value is
  // re-sent on save and the BE re-applies the hold (same as /new).
  const setAllReserve = useCallback(() => {
    setForm((s) =>
      s ? { ...s, positions: s.positions.map((p) => ({ ...p, reserve: p.quantity })) } : s,
    );
  }, []);
  const clearAllReserve = useCallback(() => {
    setForm((s) => (s ? { ...s, positions: s.positions.map((p) => ({ ...p, reserve: '0' })) } : s));
  }, []);
  // «Расценить» — re-price every row by the chosen price-type (from each
  // product's carried salePrices). Loaded rows have no salePrices until the
  // product is re-picked, so they keep their current price.
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
  // «Сохранить цены» — push each row's price back onto its product.
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
        // skip products that can't be updated (e.g. concurrent edit); others proceed
      }
    }
  }, [form, defaultId]);

  // moysklad position table columns (fixed + optional, customizer + price menu).
  // Mirrors /new/page.tsx positionColumns exactly.
  const positionColumns = useMemo<PositionTableColumnConfig[]>(() => {
    const cols: PositionTableColumnConfig[] = [
      { key: 'dragarea' },
      { key: 'select' },
      // moysklad parity: the row-number column has an EMPTY header (the number
      // shows only in the data cell) — override the default «#» label.
      { key: 'index', label: '' },
    ];
    if (colVisible.image) cols.push({ key: 'image' });
    cols.push({ key: 'name', label: tCols('name') });
    // «Единица измерения» — inline in «Кол-во» (PositionTable drops the standalone
    // column when the key is present); pushing it drives that inline unit.
    if (colVisible.unit) cols.push({ key: 'unit', label: tCols('unit') });
    if (colVisible.code) cols.push({ key: 'code', label: tCols('code') });
    if (colVisible.article) cols.push({ key: 'article', label: tCols('article') });
    cols.push({ key: 'quantity', label: tPos('quantity') });
    if (colVisible.reserve)
      cols.push({
        key: 'reserve',
        // moysklad «Зарезерв. ▾» — bulk «Поставить резерв» / «Снять резерв».
        label: (
          <PositionReserveMenu
            label={tCols('reserve')}
            setReserveLabel={tCols('set_reserve')}
            clearReserveLabel={tCols('clear_reserve')}
            onSetReserve={setAllReserve}
            onClearReserve={clearAllReserve}
          />
        ),
      });
    if (colVisible.stock) cols.push({ key: 'stock', label: tCols('stock') });
    if (colVisible.available) cols.push({ key: 'available', label: tCols('available') });
    if (colVisible.waiting) cols.push({ key: 'waiting', label: tCols('waiting') });
    if (colVisible.shipped) cols.push({ key: 'shipped', label: tCols('shipped') });
    // Posted orders are EDITABLE now (moysklad parity), so the «Цена ▾» menu
    // (reprice / save-prices) + the column customizer ⚙ stay active.
    const editableCols = true;
    cols.push(
      {
        key: 'price',
        label: editableCols ? (
          <PositionPriceMenu
            label={tCols('price')}
            repriceLabel={tCols('reprice')}
            saveLabel={tCols('savePrices')}
            priceTypes={priceTypesData?.items ?? []}
            onReprice={repricePositions}
            onSavePrices={saveProductPrices}
          />
        ) : (
          tCols('price')
        ),
      },
      { key: 'vat', label: tCols('vat') },
    );
    if (colVisible.vatAmount) cols.push({ key: 'vatAmount', label: tCols('vatAmount') });
    cols.push({ key: 'discount', label: tCols('discount') });
    if (colVisible.weight) cols.push({ key: 'weight', label: tCols('weight') });
    if (colVisible.volume) cols.push({ key: 'volume', label: tCols('volume') });
    cols.push(
      {
        key: 'amount',
        label: (
          <span className="inline-flex items-center gap-1">
            {tCols('amount')}
            {editableCols && (
              <PositionColumnCustomizer
                options={OPTIONAL_POSITION_COLUMNS.map((c) => ({
                  key: c.key,
                  label: tCols(c.key),
                }))}
                visible={colVisible}
                onToggle={(key, next) => setColVisible((v) => ({ ...v, [key]: next }))}
                ariaLabel={tCols('configure')}
              />
            )}
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
    setAllReserve,
    clearAllReserve,
  ]);

  const onConflict = useConflictReload(['customer-order', id], () => setForm(null));

  const transitionMut = useApiMutation({
    mutationFn: (target: string) => api.post(`/customer-orders/${id}/transitions/${target}`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customer-order', id] }),
  });

  const deleteMut = useApiMutation({
    mutationFn: () => api.delete(`/customer-orders/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customer-orders'] });
      router.push('/customer-orders');
    },
  });

  const { runDestructive } = useDestructiveMutation();

  const shipMut = useApiMutation({
    mutationFn: () => api.post<{ id: string }>(`/demands/from-customer-order/${id}`, {}),
    onSuccess: (demand) => {
      qc.invalidateQueries({ queryKey: ['customer-orders'] });
      qc.invalidateQueries({ queryKey: ['customer-order', id] });
      router.push(`/demands/${demand.id}`);
    },
  });

  const invoiceMut = useApiMutation({
    mutationFn: () => api.post<{ id: string }>(`/invoices-out/from-customer-order/${id}`, {}),
    onSuccess: (invoice) => {
      qc.invalidateQueries({ queryKey: ['customer-orders'] });
      qc.invalidateQueries({ queryKey: ['customer-order', id] });
      router.push(`/invoices-out/${invoice.id}`);
    },
  });

  const cloneMut = useApiMutation({
    mutationFn: () => api.post<{ id: string }>(`/customer-orders/${id}/clone`, {}),
    onSuccess: (clone) => {
      qc.invalidateQueries({ queryKey: ['customer-orders'] });
      router.push(`/customer-orders/${clone.id}`);
    },
  });

  // «Канал продаж» «+» quick-create: POST a channel (kind defaults to «custom») and
  // select it on the order, then close — moysklad's inline create-and-pick.
  const channelCreateMut = useApiMutation({
    mutationFn: () =>
      api.post<{ id: string; name: string }>('/sales-channels', {
        name: newChannelName.trim(),
        kind: 'custom',
      }),
    onSuccess: (ch) => {
      setForm((s) => s && { ...s, salesChannelId: ch.id, salesChannelLabel: ch.name });
      setChannelCreateOpen(false);
      setNewChannelName('');
    },
  });

  const saveMut = useSaveMutation({
    mutationFn: async () => {
      if (!form || !data) throw new Error('Form not ready');
      const payload: Record<string, unknown> = {
        version: data.version,
        description: form.description || null,
        vatEnabled: form.vatEnabled,
        vatIncluded: form.vatIncluded,
      };
      if (!data.applicable) {
        // «№» — the Create/Update schema's `name` is .optional() (string, NOT
        // nullable): send it only when non-blank, omit when cleared so the
        // server keeps the existing number (moysklad auto-assigns on blank).
        const trimmedName = form.name.trim();
        if (trimmedName) payload.name = trimmedName;
        // «от» — local `YYYY-MM-DDTHH:MM` (header field) → ISO for the wire,
        // matching /new's `new Date(docDate).toISOString()` handling exactly.
        if (form.moment) payload.moment = new Date(form.moment).toISOString();
        payload.agentId = form.agentId;
        payload.organizationId = form.organizationId;
        payload.contractId = form.contractId;
        payload.projectId = form.projectId;
        payload.salesChannelId = form.salesChannelId;
        payload.organizationAccountId = form.organizationAccountId;
        payload.currency = form.currency;
        // moysklad «Валюта» rate edit (✎): when the user overrode the auto rate,
        // send it as rateValue (8-dp minor units, like /new). Untouched ⇒ omit so
        // the server keeps the document's stored rate.
        if (form.currency !== 'UZS' && rateOverride) {
          payload.rateValue = BigInt(Math.round(Number(effectiveRate) * 100000000)).toString();
        }
        payload.deliveryPlannedMoment = form.deliveryPlannedMoment
          ? `${form.deliveryPlannedMoment}T00:00:00.000Z`
          : null;
        payload.shipmentAddressFull = form.deliveryAddressFull;
        // Free-form textarea wins; fall back to the structured compose (legacy
        // single-line column). Mirrors /new/page.tsx.
        payload.shipmentAddress =
          form.deliveryAddressText.trim() || composeAddress(form.deliveryAddressFull);
        payload.storeId = form.storeId;
        payload.externalCode = form.externalCode || null;
        payload.statusId = form.statusId || null;
        payload.positions = form.positions.map((p) => ({
          assortmentKind: 'product',
          // biome-ignore lint/style/noNonNullAssertion: position rows always have a product picked before save
          assortmentId: p.assortmentId!,
          quantity: Number(p.quantity),
          priceMinor: p.priceMinor,
          discount: Number(p.discount || '0'),
          vat: p.vat ? Number(p.vat) : undefined,
          vatEnabled: p.vatEnabled,
          // Re-send each line's current «Зарезерв.» so an edit preserves the hold
          // (the backend re-applies it; a 0 releases). Without this, editing any
          // field would strand/zero the reservation (the D1 desync).
          reservedQty: Number(p.reserve || '0'),
        }));
      }
      payload.attributes = form.attributes;
      // «Владелец» / «Владелец-отдел» / «Общий доступ» — metadata, editable even
      // on a posted order (moysklad keeps the owner popover active when проведён),
      // so send them OUTSIDE the !applicable block. Schema accepts null (clears).
      payload.ownerId = form.ownerAccess.ownerId;
      payload.groupId = form.ownerAccess.groupId;
      payload.shared = form.ownerAccess.shared;
      return api.patch(`/customer-orders/${id}`, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customer-order', id] });
      qc.invalidateQueries({ queryKey: ['customer-orders'] });
      if (form) setOriginal(snapshot(form));
    },
    // No caller onError: useSaveMutation already toasts non-conflict failures
    // (save_failed + message) and routes the optimistic-lock 409 to onConflict.
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
  const contractFetcher = async (s: string): Promise<PickerItem[]> => {
    // Filter by counterparty when one is selected — moysklad only
    // shows contracts that belong to the order's customer.
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
  const salesChannelFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: Array<{ id: string; name: string; code?: string | null }> }>(
      `/sales-channels?search=${encodeURIComponent(s)}`,
    );
    return d.items.map((c) => ({ id: c.id, primary: c.name, secondary: c.code ?? undefined }));
  };
  const organizationAccountFetcher = async (s: string): Promise<PickerItem[]> => {
    // Scope accounts to the chosen organization — moysklad only shows
    // bank accounts that belong to the order's organization (same idiom
    // as the contract picker gated on the chosen agent).
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

  if (isLoading || !form) {
    return <div className="p-8 text-[var(--ms-text-muted)] text-sm">{tCommon('loading')}</div>;
  }
  if (!data) return <div className="p-8 text-sm">{tCommon('not_found')}</div>;

  // moysklad parity: a posted («Проведён») order's fields stay EDITABLE (no grey-
  // out, no «locked» banner) — you edit + save and it remains posted. The BE
  // re-applies the reserve on save (release-then-reapply), so this is safe.
  const editableLines = true;

  // moysklad «Баланс» caption — the counterparty balance CONSOLIDATED to the account
  // base currency (сум), with the document-currency equivalent in parens. Balances
  // are tracked per (counterparty × currency); convert each to base tiyin (UZS as-is;
  // a foreign minor unit × the doc rate, since e.g. 1 USD-cent = rate tiyin). Sign:
  // + ⇒ they owe us «(нам должны)», − ⇒ we owe them «(мы должны)».
  const balanceDocRate = Number(effectiveRate) || 1;
  const agentBaseBalanceMinor = (agentBalanceData?.items ?? []).reduce((acc, b) => {
    const m = Number(b.balanceMinor || '0');
    if (b.currency === 'UZS') return acc + m;
    if (b.currency === form.currency) return acc + m * balanceDocRate;
    return acc; // other currencies (rare) aren't consolidated here
  }, 0);
  const balanceAbsMajor = Math.abs(agentBaseBalanceMinor) / 100;
  const balanceQualifier =
    agentBaseBalanceMinor > 0
      ? tDetailHeader('owed_to_us')
      : agentBaseBalanceMinor < 0
        ? tDetailHeader('we_owe')
        : '';

  // Account custom fields (доп. поля). Distributed round-robin by `position`
  // across the three meta columns (1st→left, 2nd→middle, 3rd→right …) so a
  // 2-field account gets «Уста» left + «Санаси» middle, like the live account.
  // Values read/write form.attributes (single source — same as the PATCH).
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
            if (v === '' || v == null) {
              delete next[m.code];
            } else {
              next[m.code] = v;
            }
            return { ...s, attributes: next };
          })
        }
        disabled={!editableLines}
        testId={`field-attr-${m.code}`}
      />
    </DocumentMetaField>
  );

  // Position «Наименование» cell — moysklad-parity borderless [img] + bold code
  // + name plain text (PositionNameCell), clicking re-opens the per-row product
  // picker (productRowId modal below). On a posted order it's read-only text.
  const renderPositionNameCell = (row: DocPositionRow) => {
    const p = row as DetailPositionRow;
    return (
      <PositionNameCell
        imageUrl={p.imageUrl}
        code={p.productCode}
        label={p.productLabel}
        placeholder={tForm('select_product')}
        onPick={() => editableLines && setProductRowId(p.id)}
        disabled={!editableLines}
        testId={`pos-${p.id}-name`}
      />
    );
  };

  // moysklad «НДС» cell — a rate dropdown showing «без НДС» (no VAT) or «{rate}%»
  // (UZ rates: без НДС / 0% / 12%), NOT a bare editable number. Read-only on a
  // posted order. The row's current rate is always offered so any stored value
  // (e.g. a legacy 20) still renders + round-trips.
  const fmtVat = (v: string) => (v === '' ? tCols('vat_none') : `${v}%`);
  const renderVatCell = (row: DocPositionRow) => {
    const p = row as DetailPositionRow;
    const vat = p.vat ?? '';
    // moysklad shows the rate as plain text and only swaps to a picker on click
    // (b-inlineeditor-table cell). Read-only posted orders are always text.
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
      <select
        // biome-ignore lint/a11y/noAutofocus: click-to-edit cell focuses the picker the user just opened (moysklad inline editor)
        autoFocus
        value={vat}
        onChange={(e) => updatePosition(p.id, { vat: e.target.value })}
        onBlur={() => setEditingVatId(null)}
        className="h-7 w-full rounded-[var(--ms-radius-sm)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] px-1 text-[12px] focus:border-[var(--ms-border-focus)] focus:outline-none"
        data-test-id={`pos-${p.id}-vat-select`}
      >
        {opts.map((v) => (
          <option key={v} value={v}>
            {fmtVat(v)}
          </option>
        ))}
      </select>
    );
  };

  const canCreateDemand = (
    ['confirmed', 'awaiting_payment', 'paid', 'partially_shipped'] as const
  ).includes(data.state as never);
  const canCreateInvoice = (
    ['confirmed', 'awaiting_payment', 'paid', 'partially_shipped', 'fully_shipped'] as const
  ).includes(data.state as never);

  // Live document totals computed from the (editable) form positions — mirrors
  // /new (DocumentTotalsPanel) so the footer updates as the user edits qty / price
  // / discount instead of showing the stale server-saved sum. Single source of
  // truth = computePositionTotal (the same the BE + print use).
  const totals = form.positions.reduce(
    (acc, p) => {
      const t = computeLineTotal(p, form.vatIncluded);
      return { net: acc.net + t.net, vat: acc.vat + t.vat, gross: acc.gross + t.gross };
    },
    { net: 0n, vat: 0n, gross: 0n },
  );
  const totalQty = form.positions.reduce((acc, p) => acc + Number(p.quantity || 0), 0);

  // moysklad «Не оплачено» payment affordance — kept via <DocumentHeader>'s
  // paymentLabel + onRequestPayment (the shared header has no general pill slot;
  // the «Не отгружено» badge has no header counterpart and is dropped, matching
  // moysklad's editable form header). Shown only while the order is not fully
  // paid. The request flow uses the existing detail router.push (no save-then-
  // create — the order already exists).
  // moysklad payment states (user 2026-06-20 «qachon Не оплачено oplachno bo'ladi»):
  // paid ≥ total → «Оплачено» (green) · 0 < paid < total → «Частично оплачено»
  // (orange) · else «Не оплачено». The pill shows in ALL THREE states — it used to
  // hide once fully paid, which is why «Оплачено» never appeared.
  // Payment status compares the paid amount against the SAVED document sum
  // (data.sumMinor) — payment is booked against the persisted order, not the
  // unsaved live edit, so this stays on the server value (the live `totals` drive
  // only the footer panel).
  const savedSumBig = BigInt(data.sumMinor || '0');
  const paidBig = BigInt(data.payedSumMinor || '0');
  const fullyPaid = savedSumBig > 0n && paidBig >= savedSumBig;
  const partiallyPaid = paidBig > 0n && paidBig < savedSumBig;
  const paymentTone = fullyPaid ? 'paid' : partiallyPaid ? 'partial' : 'unpaid';
  const paymentPillLabel = fullyPaid
    ? tDetailHeader('paid')
    : partiallyPaid
      ? tDetailHeader('partially_paid')
      : tDetailHeader('not_paid');

  // moysklad «Создать документ» — full 11-item list in live order (screenshot
  // co-live-2026-06-18/03). On a saved order each opens the target /new
  // pre-linked (?fromOrder=…); Отгрузка/Счёт use the existing backend conversions
  // (from-customer-order). Три пункта disabled: no Волна отбора / Розничная
  // продажа / Снабжение document subsystem yet (future scope).
  const createMenuItems: CreateMenuItem[] = [
    {
      id: 'move',
      label: tDetailTitles('move'),
      onSelect: () => router.push(`/moves/new?fromOrder=${id}`),
    },
    {
      id: 'invoice-out',
      label: tDetailTitles('invoice_out'),
      onSelect: canCreateInvoice ? () => invoiceMut.mutate() : undefined,
      disabled: !canCreateInvoice,
    },
    {
      id: 'picking-wave',
      label: tDetailTitles('picking_wave'),
      // Sherset custom — open the per-sklad picking sheets (creates the omborchi
      // picking tasks + notifies them; idempotent).
      onSelect: () => window.open(`/print/picking/${id}?auto=1`, '_blank', 'width=900,height=1100'),
      disabled: false,
    },
    {
      id: 'demand',
      label: tDetailTitles('demand'),
      onSelect: canCreateDemand ? () => shipMut.mutate() : undefined,
      disabled: !canCreateDemand,
    },
    {
      id: 'payment-in',
      label: tDetailTitles('payment_in'),
      onSelect: () => router.push(`/payments-in/new?fromOrder=${id}`),
    },
    {
      id: 'cash-in',
      label: tDetailTitles('cash_in'),
      onSelect: () => router.push(`/cash-in/new?fromOrder=${id}`),
    },
    {
      id: 'prepayment',
      label: tDetailTitles('prepayment'),
      onSelect: () => router.push(`/prepayments/new?fromOrder=${id}`),
    },
    {
      id: 'purchase-order',
      label: tDetailTitles('purchase_order'),
      onSelect: () => router.push(`/purchase-orders/new?fromOrder=${id}`),
    },
    {
      id: 'po-available',
      label: tDetailTitles('po_with_available'),
      onSelect: () => router.push(`/purchase-orders/new?fromOrder=${id}&availability=1`),
    },
    { id: 'retail-sale', label: tDetailTitles('retail_sale'), onSelect: undefined, disabled: true },
    {
      id: 'supply-planning',
      label: tDetailTitles('supply_planning'),
      onSelect: undefined,
      disabled: true,
    },
  ];

  // moysklad «Статус» header dropdown — converged onto the shared
  // <DocumentHeader> prop shape (status / statusOptions / onStatusChange, the
  // same trio /new passes). When the account defines custom statuses, show them
  // (selecting one edits form.statusId, persisted on «Сохранить» like any field
  // — moysklad's editor is save-based). Otherwise fall back to the FSM `state`
  // dropdown (immediate transitions) so accounts without custom statuses keep
  // the prior behaviour (status is never left blank). The «Проведено» toggle
  // (confirmed/draft) stays on the FSM in both modes.
  const hasCustomStatuses = customStatuses.length > 0;
  const statusHeaderProps = hasCustomStatuses
    ? {
        status: form.statusId ?? '',
        statusOptions: customStatuses.map((s) => ({
          value: s.id,
          label: s.name,
          color: s.color ?? undefined,
        })),
        onStatusChange: (sid: string) => setForm((f) => (f ? { ...f, statusId: sid } : f)),
      }
    : {
        status: data.state,
        statusOptions: ORDER_STATES.map((slug) => ({
          value: slug,
          label: tStates(slug),
          color: STATE_COLOR[slug],
        })),
        // No custom statuses ⇒ the dropdown drives the FSM directly (immediate
        // transition), preserving the prior detail-page behaviour.
        onStatusChange: (slug: string) => transitionMut.mutate(slug),
      };

  return (
    <div
      className="flex min-h-screen flex-col bg-[var(--ms-bg-page)]"
      data-test-id="customer-order-detail-page"
    >
      <DetailToolbar
        isDirty={isDirty}
        isSaving={saveMut.isPending}
        onSave={() => saveMut.mutate()}
        onClose={() => router.push('/customer-orders')}
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
        onPrintList={() =>
          window.open(`/print/customer-order/${data.id}?auto=1`, '_blank', 'width=820,height=1100')
        }
        // moysklad's CO print menu names the single-doc form «Заказ» (matches
        // /new). Without this the shared toolbar showed the generic default.
        printDocumentLabel={tPrint('order_form')}
        printEntity="customerorder"
        onSendEmail={() => setEmailOpen(true)}
        apiData={data}
        apiTitle={`API · ${data.name}`}
        // moysklad parity: the owner block + «Смотрит» presence + «Изменения» link
        // sit on the TOOLBAR row (far right), NOT a separate header row — this also
        // pulls the Изменить/Создать/Печать/Отправить menus to the LEFT (the
        // toolbar's `ml-auto` only kicks in WITHOUT a rightSlot), matching moysklad.
        rightSlot={
          <>
            {/* Sherset custom — «Yig'ishga yuborish»: opens the per-sklad picking
                sheets (creates the omborchi picking tasks + notifies). The 2nd of
                the «2 xil chop etish»; the customer receipt is the toolbar Печать. */}
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                window.open(`/print/picking/${id}?auto=1`, '_blank', 'width=900,height=1100')
              }
              data-test-id="send-to-picking"
            >
              {tPicking('send_to_picking')}
            </Button>
            <OwnerAccessPopover
              value={form.ownerAccess}
              onChange={(v) => setForm((f) => (f ? { ...f, ownerAccess: v } : f))}
            />
            <PresenceIndicator viewers={presenceViewers} label={tDetailHeader('viewing')} />
            <DocumentHistoryLink auditEntity="CustomerOrder" entityId={data.id} />
          </>
        }
      />
      {/* Stage-3 convergence: the static read-only <DetailHeader> («№ … от …» +
          author block) is replaced by the EDITABLE shared <DocumentHeader> that
          /new uses, rendered STANDALONE directly below the toolbar (NOT wrapped
          in DocumentEditor — that would couple/replace the toolbar). Number /
          date / status are now editable (gated read-only on a posted order, since
          DocumentHeader exposes no `disabled` — we simply omit the change
          handlers when posted). «Проведено» drives the server-side FSM via the
          existing transition mutation (NOT a form field). The author block has no
          slot here and is dropped — moysklad's editable form header omits it. */}
      <DocumentHeader
        {...docEditorLabels}
        documentTypeLabel={tDetailTitles('customer_order')}
        number={form.name}
        onNumberChange={editableLines ? (v) => setForm((f) => f && { ...f, name: v }) : undefined}
        date={form.moment}
        onDateChange={editableLines ? (v) => setForm((f) => f && { ...f, moment: v }) : undefined}
        // moysklad «Статус» dropdown — account custom statuses (form-edited,
        // persisted on save) when defined, else the FSM state dropdown (immediate
        // transitions); see statusHeaderProps above. Read-only when posted.
        status={statusHeaderProps.status}
        statusOptions={statusHeaderProps.statusOptions}
        onStatusChange={editableLines ? statusHeaderProps.onStatusChange : undefined}
        // «Не оплачено» pill + «Запросить оплату» — kept via DocumentHeader's
        // paymentLabel/onRequestPayment (no general pill slot). The request flow
        // uses the existing detail router.push (the order already exists — no
        // save-then-create).
        paymentLabel={paymentPillLabel}
        paymentTone={paymentTone}
        requestPaymentLabel={tDetailHeader('request_payment')}
        onRequestPayment={
          !fullyPaid ? () => router.push(`/payments-in/new?fromOrder=${data.id}`) : undefined
        }
        // «Проведено» — server-side FSM posting action (NOT a form field): wired
        // to the existing transition mutation, exactly as DetailHeader's
        // onToggleApplicable was.
        applicable={data.applicable}
        onApplicableChange={(next) => transitionMut.mutate(next ? 'confirmed' : 'draft')}
        applicableHelp={tPages('applicable_help')}
        // moysklad parity: the owner / «Смотрит» / «Изменения» cluster moved UP to
        // the toolbar row (DetailToolbar rightSlot) — moysklad keeps them on the
        // action-bar line, not a separate header row. So DocumentHeader has no
        // rightSlot here.
      />

      <main className="flex-1 px-4 py-4">
        {/* Errors surface as moysklad-style toasts — the save / transition /
            ship / invoice mutations all auto-toast (useApiMutation /
            useSaveMutation), so we no longer stack full-width destructive
            banners here (the «big red box» the /new form moved away from).
            The optimistic-lock 409 is handled by onConflict (reload dialog),
            not a banner. moysklad shows NO «locked» banner on a posted order —
            it stays editable — so the old data.applicable Alert is gone. */}

        {/* moysklad b-operation-form-top — THREE independent columns, converged
            onto /new/page.tsx's composition. LEFT: Организация (+account sub-row)
            · Контрагент (+Баланс caption) · План. дата отгрузки · Канал продаж ·
            Валюта (+rate ✎/↺). MIDDLE: Склад · Договор · Проект · Счёт
            контрагента. RIGHT: Адрес доставки (editable textarea) · Комментарий.
            Custom fields (доп. поля) render in a SECOND DocumentMetaColumns row.
            Posted orders stay read-only (editableLines gates every control). */}
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
                    onPick={() => editableLines && setOpenPicker('organizationAccount')}
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
                      editableLines &&
                      setForm(
                        (s) =>
                          s && {
                            ...s,
                            organizationAccountId: null,
                            organizationAccountLabel: '',
                          },
                      )
                    }
                    disabled={!editableLines}
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
                onPick={() => editableLines && setOpenPicker('org')}
                inlineFetcher={orgFetcher}
                onInlineSelect={(item) =>
                  setForm(
                    (s) =>
                      s && {
                        ...s,
                        organizationId: item.id,
                        organizationLabel: String(item.primary),
                        // Changing the org invalidates any org-scoped account.
                        organizationAccountId: null,
                        organizationAccountLabel: '',
                      },
                  )
                }
                onEdit={
                  form.organizationId
                    ? () =>
                        window.open(`/organizations/${form.organizationId}`, '_blank', 'noopener')
                    : undefined
                }
                editLabel={tCommon('edit')}
                onClear={() =>
                  editableLines &&
                  setForm(
                    (s) =>
                      s && {
                        ...s,
                        organizationId: '',
                        organizationLabel: '',
                        // Clearing the org also clears the org-scoped account.
                        organizationAccountId: null,
                        organizationAccountLabel: '',
                      },
                  )
                }
                disabled={!editableLines}
                testId="field-organization"
              />
            </DocumentMetaField>
            <DocumentMetaField
              label={tFields('agent')}
              required
              helper={
                form.agentId ? (
                  // moysklad: «Баланс (нам должны): 300 000,00 сум (24,5902 доллар)» —
                  // base-currency amount + qualifier + doc-currency equivalent, in red
                  // when the counterparty owes (or is owed).
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
                    {tCurShort('uzs')}
                    {form.currency !== 'UZS'
                      ? ` (${(balanceAbsMajor / balanceDocRate).toLocaleString('ru-RU', {
                          maximumFractionDigits: 4,
                        })} ${tCurShort(form.currency.toLowerCase())})`
                      : ''}
                  </span>
                ) : undefined
              }
            >
              <CatalogPickerField
                value={form.agentId ? { id: form.agentId, label: form.agentLabel } : null}
                placeholder={tFields('agent')}
                onPick={() => editableLines && setOpenPicker('agent')}
                inlineFetcher={agentFetcher}
                onInlineSelect={(item) =>
                  setForm(
                    (s) =>
                      s && {
                        ...s,
                        agentId: item.id,
                        agentLabel: String(item.primary),
                        // Changing the agent invalidates its contract/account.
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
                  editableLines &&
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
                disabled={!editableLines}
                testId="field-agent"
              />
            </DocumentMetaField>
            <DocumentMetaField label={tDetailForm('delivery_planned')}>
              {/* moysklad parity: «План. дата отгрузки» = DD.MM.YYYY (a native
                  <input type="date"> renders US mm/dd/yyyy on en-US browsers). */}
              <DatePicker
                value={form.deliveryPlannedMoment || null}
                onChange={(d) => setForm((s) => s && { ...s, deliveryPlannedMoment: d })}
                locale="ru-RU"
                disabled={!editableLines}
                testId="field-delivery-planned"
              />
            </DocumentMetaField>
            <DocumentMetaField label={tDetailForm('sales_channel')}>
              <CatalogPickerField
                value={
                  form.salesChannelId
                    ? { id: form.salesChannelId, label: form.salesChannelLabel }
                    : null
                }
                placeholder={tDetailForm('sales_channel')}
                onPick={() => editableLines && setOpenPicker('salesChannel')}
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
                  editableLines &&
                  setForm((s) => s && { ...s, salesChannelId: null, salesChannelLabel: '' })
                }
                onCreate={editableLines ? () => setChannelCreateOpen(true) : undefined}
                createLabel={tForm('create_new_sales_channel')}
                disabled={!editableLines}
                testId="field-sales-channel"
              />
            </DocumentMetaField>
            <DocumentMetaField
              label={tDetailForm('currency')}
              required
              helper={
                form.currency !== 'UZS' ? (
                  // moysklad: «1 {cur} = N UZS» with a «✎» that opens the rate modal.
                  <span className="inline-flex items-center gap-1.5">
                    <span className="tabular-nums">
                      1 {form.currency} ={' '}
                      {Number(effectiveRate).toLocaleString('ru-RU', { maximumFractionDigits: 4 })}{' '}
                      UZS
                    </span>
                    {editableLines && (
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
              {/* moysklad: the «Валюта» dropdown; the rate «✎» (→ rate modal) lives
                  in the helper «1 {cur} = N UZS ✎» below, mirroring the live form. */}
              <NativeSelect
                value={form.currency}
                onChange={(e) => {
                  const next = e.target.value;
                  setRateOverride(null);
                  setForm((s) => s && { ...s, currency: next });
                }}
                disabled={!editableLines}
                data-test-id="field-currency"
              >
                <option value="UZS">{tForm('currency_uzs')}</option>
                <option value="USD">{tForm('currency_usd')}</option>
                <option value="EUR">{tForm('currency_eur')}</option>
                <option value="RUB">{tForm('currency_rub')}</option>
              </NativeSelect>
            </DocumentMetaField>
          </DocumentMetaColumn>

          <DocumentMetaColumn>
            <DocumentMetaField label={tFields('store')} required>
              <CatalogPickerField
                value={form.storeId ? { id: form.storeId, label: form.storeLabel } : null}
                placeholder={tFields('store')}
                onPick={() => editableLines && setOpenPicker('store')}
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
                  editableLines && setForm((s) => s && { ...s, storeId: '', storeLabel: '' })
                }
                disabled={!editableLines}
                testId="field-store"
              />
            </DocumentMetaField>
            <DocumentMetaField label={tDetailForm('contract')}>
              <CatalogPickerField
                value={form.contractId ? { id: form.contractId, label: form.contractLabel } : null}
                placeholder={tDetailForm('contract')}
                onPick={() => editableLines && form.agentId && setOpenPicker('contract')}
                inlineFetcher={contractFetcher}
                onInlineSelect={(item) =>
                  setForm(
                    (s) => s && { ...s, contractId: item.id, contractLabel: String(item.primary) },
                  )
                }
                onClear={() =>
                  editableLines &&
                  setForm((s) => s && { ...s, contractId: null, contractLabel: '' })
                }
                onCreate={editableLines ? () => router.push('/contracts/new') : undefined}
                createLabel={tForm('create_new_contract')}
                disabled={!editableLines || !form.agentId}
                testId="field-contract"
              />
            </DocumentMetaField>
            <DocumentMetaField label={tFields('project')}>
              <CatalogPickerField
                value={form.projectId ? { id: form.projectId, label: form.projectLabel } : null}
                placeholder={tFields('project')}
                onPick={() => editableLines && setOpenPicker('project')}
                inlineFetcher={projectFetcher}
                onInlineSelect={(item) =>
                  setForm(
                    (s) => s && { ...s, projectId: item.id, projectLabel: String(item.primary) },
                  )
                }
                onClear={() =>
                  editableLines && setForm((s) => s && { ...s, projectId: null, projectLabel: '' })
                }
                onCreate={editableLines ? () => router.push('/projects/new') : undefined}
                createLabel={tForm('create_new_project')}
                disabled={!editableLines}
                testId="field-project"
              />
            </DocumentMetaField>
          </DocumentMetaColumn>

          <DocumentMetaColumn>
            <DocumentMetaField label={tDetailForm('delivery_address')}>
              <DeliveryAddressGroup
                value={form.deliveryAddressFull}
                onChange={(next) => setForm((s) => s && { ...s, deliveryAddressFull: next })}
                text={form.deliveryAddressText}
                onTextChange={(next) => setForm((s) => s && { ...s, deliveryAddressText: next })}
                disabled={!editableLines}
                defaultOpen={false}
              />
            </DocumentMetaField>
            {/* moysklad parity: «Комментарий» ALSO renders here in the top-right meta
                (under «Адрес доставки»), in addition to the bottom band. Both bind to
                the SAME `form.description`, so editing either keeps them in sync —
                mirrors moysklad, which shows the comment field in both spots. */}
            <DocumentMetaField label={tFields('description')}>
              <Textarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm((s) => s && { ...s, description: e.target.value })}
                placeholder={tFields('description')}
                aria-label={tFields('description')}
                disabled={!editableLines}
                data-test-id="field-description-meta"
              />
            </DocumentMetaField>
          </DocumentMetaColumn>
        </DocumentMetaColumns>

        {/* moysklad parity: account custom fields (доп. поля, e.g. «Уста»/
            «Санаси») render in their OWN aligned row below the standard meta
            columns (round-robin distribution). Omitted when the account defines
            none. Values live in form.attributes (single source — the bottom
            <AttributesEditor> was removed so they don't show twice). */}
        {customFields.length > 0 && (
          <DocumentMetaColumns>
            <DocumentMetaColumn>{attrColumns[0]?.map(renderCustomField)}</DocumentMetaColumn>
            <DocumentMetaColumn>{attrColumns[1]?.map(renderCustomField)}</DocumentMetaColumn>
            <DocumentMetaColumn>{attrColumns[2]?.map(renderCustomField)}</DocumentMetaColumn>
          </DocumentMetaColumns>
        )}

        {/* Tab strip — Pozitsiyalar (default) | Bog'liq hujjatlar | Fayllar | Tarix.
            Mirrors the tab strip moysklad renders across every doc type;
            customer-order keeps its custom RelatedDocsTab (with the visual
            diagram) by passing it via the relatedSlot. */}
        <div className="mt-6">
          <DetailContentTabs
            auditEntity="CustomerOrder"
            entityId={data.id}
            positionsLabel={tDetailTabs('main')}
            relatedGroups={[]}
            filesSlot={<AttachmentsSection entity="CustomerOrder" entityId={data.id} />}
            tasksSlot={<DocumentTasksSection entity="CustomerOrder" entityId={data.id} />}
            historyInline={false}
            relatedSlot={
              <RelatedDocsTab
                current={{
                  id: data.id,
                  name: data.name,
                  moment: data.moment,
                  state: data.state,
                  sumMinor: data.sumMinor,
                  kind: 'customer-order',
                }}
                linkedDemands={(related?.demands ?? []).map((d) => ({
                  id: d.id,
                  name: d.name,
                  moment: d.moment,
                  state: d.state,
                  sumMinor: d.sumMinor,
                  kind: 'demand' as const,
                }))}
                linkedInvoicesOut={(related?.invoicesOut ?? []).map((i) => ({
                  id: i.id,
                  name: i.name,
                  moment: i.moment,
                  state: i.state,
                  sumMinor: i.sumMinor,
                  kind: 'invoice-out' as const,
                }))}
                linkedPrepayments={(related?.prepayments ?? []).map((p) => ({
                  id: p.id,
                  name: p.name,
                  moment: p.moment,
                  state: p.state,
                  sumMinor: p.sumMinor,
                  kind: 'prepayment' as const,
                }))}
                linkedMoves={(related?.moves ?? []).map((m) => ({
                  id: m.id,
                  name: m.name,
                  moment: m.moment,
                  state: m.state,
                  sumMinor: m.sumMinor,
                  kind: 'move' as const,
                }))}
              />
            }
          >
            <div className="space-y-4">
              {/* moysklad position table = full column set (reserve / stock /
                    Сумма НДС optional cols + ⚙ customizer + «Цена ▾» menu +
                    select column + drag-reorder + kebab row menu) with the
                    inline «Добавить позицию» search bar as its footerToolbar.
                    Converged onto /new's composition (PositionTable +
                    PositionInlineAdd). Posted orders are read-only: the table,
                    the inline-add bar, and the customizer are all disabled. */}
              <PositionTable
                columns={positionColumns}
                editableReserve
                emptyText={tPos('empty')}
                rows={form.positions}
                onUpdate={(rowId, patch) =>
                  updatePosition(rowId, patch as Partial<DetailPositionRow>)
                }
                onRemove={removePosition}
                onDuplicate={duplicatePosition}
                onReorder={reorderPositions}
                // moysklad «Наименование ▾» — sort lines by name/code (editable
                // docs only; a posted order's lines are read-only).
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
                            raw: p,
                          })),
                          total: r.total ?? r.items.length,
                        };
                      }}
                      sortAvailableLabel={tPos('sortByAvailable')}
                      moreItemsLabel={(n) => tPos('moreItems', { count: n })}
                      createProductLabel={(qq) => tPos('createProductNamed', { query: qq })}
                      onCreateProduct={() => router.push('/products/new')}
                      onPick={(item) => {
                        const raw = item.raw as ProductItem | undefined;
                        const defaultPrice = resolveDefaultSalePriceOrZero(raw?.salePrices);
                        setForm((s) =>
                          s
                            ? {
                                ...s,
                                positions: [
                                  ...s.positions,
                                  {
                                    id: uid(),
                                    assortmentId: item.id,
                                    productLabel: item.primary,
                                    productCode: raw?.code ?? undefined,
                                    productArticle: raw?.article ?? undefined,
                                    productUom: raw?.uom ?? null,
                                    quantity: '1',
                                    priceMinor: defaultPrice,
                                    discount: '0',
                                    vat: raw?.vat != null ? String(raw.vat) : '0',
                                    vatEnabled: s.vatEnabled,
                                    stock: raw?.stock?.onHand,
                                    reserve: '0',
                                    available: raw?.stock?.available,
                                    waiting: raw?.stock?.inTransit,
                                    weightG: raw?.weightG ?? undefined,
                                    volumeML: raw?.volumeML ?? undefined,
                                    imageUrl: raw?.mainImageId
                                      ? `/api/v1/images/${raw.mainImageId}/raw`
                                      : undefined,
                                    salePrices: raw?.salePrices ?? null,
                                  },
                                ],
                              }
                            : s,
                        );
                      }}
                      onAddFromCatalog={() => setOpenCatalogPicker(true)}
                      onCheckCompleteness={() => {
                        if (!form.storeId) {
                          toast.error(tPages('select_store_first'));
                          return;
                        }
                        if (form.positions.length === 0) {
                          toast.error(tPages('add_position_first'));
                          return;
                        }
                      }}
                    />
                  ) : undefined
                }
              />
              {/* Bottom band (moysklad parity, mirrors /new): «Комментарий»
                  textarea (left) + «Внешний код» field beneath it, and the
                  DocumentTotalsPanel footer (Промежуточный итог / НДС / Цена
                  включает НДС / Итого / Кол-во) on the right. Live totals from the
                  editable positions; a posted order passes no toggle handlers so
                  the checkboxes are read-only. */}
              <div className="flex flex-col items-start justify-between gap-4 sm:flex-row">
                <div className="flex w-full flex-col gap-3 text-sm sm:w-[520px] sm:max-w-full">
                  <Textarea
                    rows={3}
                    value={form.description}
                    onChange={(e) => setForm((s) => s && { ...s, description: e.target.value })}
                    placeholder={tFields('description')}
                    aria-label={tFields('description')}
                    disabled={!editableLines}
                    data-test-id="field-description"
                  />
                  {showExternalCode || form.externalCode ? (
                    <FormField id="external-code" label={tDetailForm('external_code')}>
                      <Input
                        value={form.externalCode}
                        onChange={(e) =>
                          setForm((s) => s && { ...s, externalCode: e.target.value })
                        }
                        disabled={!editableLines}
                        maxLength={50}
                        data-test-id="field-external-code"
                      />
                    </FormField>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowExternalCode(true)}
                      className="self-start text-[var(--ms-text-brand)] text-sm hover:underline"
                      data-test-id="external-code-toggle"
                    >
                      {tDetailForm('external_code')}
                    </button>
                  )}
                </div>
                <DocumentTotalsPanel
                  subtotalMinor={totals.net}
                  vatMinor={totals.vat}
                  totalMinor={totals.gross}
                  currency={form.currency}
                  vatEnabled={form.vatEnabled}
                  onVatEnabledChange={
                    editableLines ? (v) => setForm((s) => s && { ...s, vatEnabled: v }) : undefined
                  }
                  vatIncluded={form.vatIncluded}
                  onVatIncludedChange={
                    editableLines ? (v) => setForm((s) => s && { ...s, vatIncluded: v }) : undefined
                  }
                  quantity={totalQty}
                />
              </div>
            </div>
          </DetailContentTabs>
        </div>

        {/* Задачи / Файлы / Изменения render as inline bottom sections INSIDE
            DetailContentTabs (moysklad-grounded layout) — see tasksSlot/filesSlot. */}
      </main>

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
            (s) =>
              s && {
                ...s,
                organizationId: item.id,
                organizationLabel: String(item.primary),
                // Changing the org invalidates any account scoped to the
                // previous org — clear it so the picker re-fetches fresh.
                organizationAccountId: null,
                organizationAccountLabel: '',
              },
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
        open={openPicker === 'contract'}
        onClose={() => setOpenPicker(null)}
        title={tDetailForm('contract')}
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
        open={openPicker === 'salesChannel'}
        onClose={() => setOpenPicker(null)}
        title={tDetailForm('sales_channel')}
        fetcher={salesChannelFetcher}
        onSelect={(item) =>
          setForm(
            (s) => s && { ...s, salesChannelId: item.id, salesChannelLabel: String(item.primary) },
          )
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
        open={openCatalogPicker}
        onClose={() => setOpenCatalogPicker(false)}
        title={tDetailForm('add_from_catalog')}
        fetcher={productFetcher}
        onSelect={(item) => {
          const raw = (item as { raw?: ProductItem }).raw;
          const newPos: DetailPositionRow = {
            // PositionTable keys on `id` (not PositionEditor's `_uid`).
            id: uid(),
            assortmentId: item.id,
            productLabel: String(item.primary),
            productCode: raw?.code ?? undefined,
            productArticle: raw?.article ?? undefined,
            productUom: raw?.uom ?? null,
            quantity: '1',
            priceMinor: resolveDefaultSalePriceOrZero(raw?.salePrices),
            discount: '0',
            vat: raw?.vat != null ? String(raw.vat) : '0',
            vatEnabled: form.vatEnabled,
            stock: raw?.stock?.onHand,
            reserve: '0',
            available: raw?.stock?.available,
            waiting: raw?.stock?.inTransit,
            weightG: raw?.weightG ?? undefined,
            volumeML: raw?.volumeML ?? undefined,
            imageUrl: raw?.mainImageId ? `/api/v1/images/${raw.mainImageId}/raw` : undefined,
            salePrices: raw?.salePrices ?? null,
          };
          setForm((s) => s && { ...s, positions: [...s.positions, newPos] });
        }}
      />

      {/* Per-row product picker for the position «Наименование» cell — opened
          by renderPositionNameCell (productRowId holds the target row). */}
      <CatalogPicker
        open={productRowId !== null}
        onClose={() => setProductRowId(null)}
        title={tForm('select_product')}
        fetcher={productFetcher}
        onSelect={(item) => {
          if (!productRowId) return;
          const raw = (item as { raw?: ProductItem }).raw;
          updatePosition(productRowId, {
            assortmentId: item.id,
            productLabel: String(item.primary),
            productCode: raw?.code ?? undefined,
            productArticle: raw?.article ?? undefined,
            productUom: raw?.uom ?? null,
            priceMinor: resolveDefaultSalePriceOrZero(raw?.salePrices),
            vat: raw?.vat != null ? String(raw.vat) : '0',
            stock: raw?.stock?.onHand,
            reserve: '0',
            available: raw?.stock?.available,
            waiting: raw?.stock?.inTransit,
            weightG: raw?.weightG ?? undefined,
            volumeML: raw?.volumeML ?? undefined,
            imageUrl: raw?.mainImageId ? `/api/v1/images/${raw.mainImageId}/raw` : undefined,
            salePrices: raw?.salePrices ?? null,
          });
        }}
      />

      {/* «Канал продаж» «+» quick-create modal — name → POST → select (stays on
          the order, no navigation, so unsaved edits survive). */}
      <Modal
        open={channelCreateOpen}
        onOpenChange={setChannelCreateOpen}
        title={tForm('create_new_sales_channel')}
      >
        <div className="flex flex-col gap-4 p-4">
          <FormField id="new-channel-name" label={tDetailForm('sales_channel')}>
            <Input
              value={newChannelName}
              onChange={(e) => setNewChannelName(e.target.value)}
              autoFocus
              maxLength={255}
              data-test-id="new-channel-name"
            />
          </FormField>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setChannelCreateOpen(false)}>
              {tCommon('cancel')}
            </Button>
            <Button
              variant="success"
              size="sm"
              onClick={() => channelCreateMut.mutate()}
              loading={channelCreateMut.isPending}
              disabled={!newChannelName.trim() || channelCreateMut.isPending}
              data-test-id="new-channel-save"
            >
              {tCommon('create')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* moysklad «Курс валюты документа» — opened by the «✎» in the «1 {cur} = N UZS»
          helper. Applies a per-document rate override (null ⇒ reference rate). */}
      {form.currency !== 'UZS' && (
        <CurrencyRateModal
          open={rateModalOpen}
          onOpenChange={setRateModalOpen}
          currency={form.currency}
          referenceRate={adminRate ?? '1'}
          currentOverride={rateOverride}
          onApply={setRateOverride}
          disabled={!editableLines}
        />
      )}

      <SendEmailDialog
        open={emailOpen}
        onClose={() => setEmailOpen(false)}
        entity="CustomerOrder"
        entityId={data.id}
        defaultSubject={tEmail('subject_order', { name: data.name })}
        defaultBodyHtml={tEmail.raw('body_order')}
      />
    </div>
  );
}
