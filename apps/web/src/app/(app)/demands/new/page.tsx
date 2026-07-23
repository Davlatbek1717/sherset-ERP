'use client';

/**
 * /demands/new — moysklad-parity «Отгрузка» editor.
 *
 * Built on the document-editor framework. Mirrors customer-orders/new
 * (the fully-realised sales-side reference): the meta grid is a compact
 * 3-column block (Организация/Контрагент/Проект/Валюта ‖ Склад/Договор/
 * Канал продаж ‖ Адрес доставки + Комментарий) rendered ABOVE the
 * «Главная / Связанные документы» tabs, a small «▶ Другие поля» inline
 * disclosure sits under it, and the header carries the «Не оплачено»
 * payment pill + the account «Статус» colour-chip popup. Preserves the
 * live-stock sidebar (stock check per assortmentId) in the position
 * name-cell renderer.
 */

import { AttributesEditor } from '@/components/attributes-editor';
import {
  type DeliveryAddressFull,
  DeliveryAddressGroup,
} from '@/components/customer-orders/delivery-address-group';
import { useDocumentEditorLabels } from '@/hooks/use-document-editor-labels';
import { useUserDefaults } from '@/hooks/use-user-defaults';
import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';
import { pinDefaultCustomer } from '@/lib/pin-default-customer';
import { resolveDefaultSalePriceOrZero } from '@/lib/sale-price';
import { computePositionTotal } from '@moysklad/money';
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
  PositionTable,
  type PositionTableColumnConfig,
  Textarea,
} from '@moysklad/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
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
  // Per-unit cost (buyPrice) in minor units (tiyin). The /products response
  // already carries it; we surface it as «Себест. единицы» + real «Прибыль».
  buyPrice: string | null;
}

/** buyPrice → position `buyPriceMinor` string (the API may serialise the BigInt
 *  as a string or number). */
function buyPriceMinorOf(p?: ProductItem): string | undefined {
  return p?.buyPrice != null ? String(p.buyPrice) : undefined;
}

interface NewPositionRow extends DocPositionRow {
  assortmentId: string | null;
}

function uid(): string {
  return Math.random().toString(36).slice(2);
}

/** Compose the denormalised single-line address from the structured parts. */
function composeAddress(a: DeliveryAddressFull): string | null {
  const parts: string[] = [];
  if (a.country) parts.push(a.country);
  if (a.index) parts.push(a.index);
  if (a.city) parts.push(a.city);
  if (a.street || a.building) parts.push([a.street, a.building].filter(Boolean).join(' '));
  if (a.apartment) parts.push(a.apartment);
  if (a.other) parts.push(a.other);
  const composed = parts.filter(Boolean).join(', ').trim();
  return composed || null;
}

function computeLineTotal(
  p: NewPositionRow,
  vatIncluded: boolean,
): { net: bigint; vat: bigint; gross: bigint } {
  // Delegates to the shared `computePositionTotal` — the SAME single-round,
  // micro-tiyin discipline the API posts with — so the «Итого» footer agrees
  // with the per-row «Сумма» cells (PositionTable) and the stored document
  // total exactly (no FE↔BE rounding drift; a fractional «НДС» like 7.5 no
  // longer throws a BigInt RangeError mid-edit).
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

export default function NewDemandPage() {
  const router = useRouter();
  const { user } = useAuth();
  const t = useTranslations('pages.demands');
  const tFields = useTranslations('fields');
  const tForm = useTranslations('form');
  const tDetailForm = useTranslations('detail_form');
  const tDetailTabs = useTranslations('detail_tabs');
  const tDetailTitles = useTranslations('detail_titles');
  const tDetailHeader = useTranslations('detail_header');
  // position_cols / position_editor: the shared PositionTable defaults to its
  // Russian DEFAULT_LABELS when a column carries no `label` — that leaked
  // Russian headers into the UZ locale. Every column below carries an explicit
  // i18n label (RU values identical → RU parity unchanged).
  const tCols = useTranslations('position_cols');
  const tPos = useTranslations('position_editor');
  const tCreate = useTranslations('create_related');
  const tBulk = useTranslations('bulk_actions');
  const docEditorLabels = useDocumentEditorLabels();

  // moysklad «Статус» = account-defined custom statuses (State rows,
  // entityType="demand") with colours — NOT the internal draft/posted/cancelled
  // FSM. With no account statuses defined the shared StatusPill shows a grey
  // «Статус» trigger (moysklad parity). The FSM lives on «Проведено»
  // (applicable) and the «Не оплачено» payment pill, both header-separate.
  // Status is decorative on /new: the create schema takes no statusId (the API
  // always creates a draft), so the choice is not sent.
  const { data: statusData } = useQuery<{
    items: Array<{ id: string; name: string; color: string | null }>;
  }>({
    queryKey: ['states', 'demand'],
    queryFn: () => api.get('/states?entityType=demand'),
    staleTime: 60_000,
  });
  const statusOptions = (statusData?.items ?? []).map((s) => ({
    value: s.id,
    label: s.name,
    color: s.color ?? undefined,
  }));

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
  const [statusId, setStatusId] = useState<string | null>(null);
  // moysklad opens a NEW отгрузка with «Проведено» ticked (capture demand-03-new:
  // the gwt-CheckBox input carries `checked=""`) — a save posts the shipment
  // immediately (stock deducted), which is moysklad's default for a new shipment.
  const [applicable, setApplicable] = useState(true);
  // Toolbar «Печать»/«Отправить»/«Изменить» on /new are post-save actions: the
  // demand is created first, then the intent runs (mirrors customer-orders/new).
  const afterSaveRef = useRef<'view' | 'print'>('view');

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
  // «Адрес доставки» — structured parts + the free-form textarea (moysklad's
  // main input, recomposed from the structured helper). The denormalised
  // single-line string is composed from these on save (`shipmentAddress`).
  const [deliveryAddressFull, setDeliveryAddressFull] = useState<DeliveryAddressFull>({});
  const [deliveryAddressText, setDeliveryAddressText] = useState('');
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
  const [rateEditing, setRateEditing] = useState(false);
  const [bankAccountId, setBankAccountId] = useState<string | null>(null);
  const [bankAccountLabel, setBankAccountLabel] = useState('');
  const [description, setDescription] = useState('');
  const [externalCode, setExternalCode] = useState('');
  // moysklad «Внешний код» — a collapsed brand-blue link at the bottom-left that
  // expands to an input when clicked (rarely-used optional field).
  const [showExternalCode, setShowExternalCode] = useState(false);
  // Account custom fields (moysklad доп. поля). Keyed by attribute code; the
  // backend validates any required ones on create (validateAndNormalize), so no
  // client-side required check — an empty required field surfaces as a 400 in
  // the error banner. Sent even when {} for that server-side enforcement.
  const [customAttrs, setCustomAttrs] = useState<Record<string, unknown>>({});
  // «Накладные расходы» (Отгрузка) — sale-side expense lowering «Прибыль».
  // Major units in the input; sent as tiyin. Default «по цене» (PRICE).
  const [overheadMajor, setOverheadMajor] = useState('');
  const [overheadDistribution, setOverheadDistribution] = useState<
    'WEIGHT' | 'PRICE' | 'VOLUME' | 'QUANTITY'
  >('PRICE');

  // VAT toggles. moysklad's «Отгрузка» defaults «Цена включает НДС» = CHECKED
  // (live capture demand-03-new: both «НДС» and «Цена включает НДС» ticked).
  const [vatEnabled, setVatEnabled] = useState(true);
  const [vatIncluded, setVatIncluded] = useState(true);

  // Positions
  const [positions, setPositions] = useState<NewPositionRow[]>([]);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());

  // moysklad position grid (live-grounded against demand-03-new): Наименование ·
  // Кол-во · Остаток · Цена · НДС · Скидка · Сумма. «Остаток» is the live store
  // balance per row (merged from the stock query below), placed after «Кол-во»
  // like moysklad. (Маркировка = QISM 4 [new DS column type]; Себест. единицы
  // is DEFERRED — the /products API deliberately strips buyPrice and demand
  // COGS is only known at post via FIFO, so a draft has no unit cost to show.)
  // Explicit labels stop the RU DEFAULT_LABELS leaking into the UZ locale.
  const positionColumns = useMemo<PositionTableColumnConfig[]>(
    () => [
      { key: 'dragarea' },
      { key: 'select' },
      { key: 'name', label: tCols('name') },
      { key: 'quantity', label: tPos('quantity') },
      { key: 'stock', label: tCols('stock') },
      { key: 'price', label: tCols('price') },
      { key: 'vat', label: tCols('vat') },
      { key: 'discount', label: tCols('discount') },
      { key: 'amount', label: tCols('amount') },
      { key: 'costPerUnit', label: tCols('costPerUnit') },
      { key: 'costTotal', label: tCols('costTotal') },
      { key: 'menu' },
    ],
    [tCols, tPos],
  );

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
  const { data: currenciesData } = useQuery<{ items: Array<{ isoCode: string; rate: string }> }>({
    queryKey: ['currencies'],
    queryFn: () => api.get('/currencies'),
    staleTime: 60_000,
  });
  const adminRate = (currenciesData?.items ?? []).find((c) => c.isoCode === currency)?.rate;
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
    // Sherset (2026-07-16, owner decision): defaultCustomer is NOT auto-filled into
    // new documents anymore — it only powers the pinned top row of the Контрагент
    // picker in customer orders (lib/pin-default-customer.ts).
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

  // moysklad «Остаток» column = the LIVE store balance per row. Merge the stock
  // query onto each row for render (derived, not stored — keeps the balance live
  // as the store/positions change without mutating position state).
  const rowsWithStock = useMemo(
    () =>
      positions.map((p) => ({
        ...p,
        stock: p.assortmentId ? stockMap.get(p.assortmentId) : undefined,
      })),
    [positions, stockMap],
  );

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
        vat: '0',
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
          const t = computeLineTotal(p, vatIncluded);
          return { net: acc.net + t.net, vat: acc.vat + t.vat, gross: acc.gross + t.gross };
        },
        { net: 0n, vat: 0n, gross: 0n },
      ),
    [positions, vatIncluded],
  );

  // «Себестоимость» = Σ(buyPrice × qty) over the lines — the COGS the sale sits
  // against. «Прибыль» = net revenue − COGS (mirrors the [id] detail's
  // sumMinor − costSumMinor). On a draft this now shows real expected profit
  // from the product cost, instead of a flat 0,00.
  const costSum = useMemo(
    () =>
      positions.reduce(
        (acc, p) =>
          acc + BigInt(Math.round(Number(p.buyPriceMinor || '0') * Number(p.quantity || '0'))),
        0n,
      ),
    [positions],
  );
  const profitMinor = totals.net - costSum;

  const createMut = useMutation({
    mutationFn: async () => {
      if (!agentId) throw new Error(tForm('select_counterparty'));
      if (!organizationId) throw new Error(tForm('select_organization'));
      if (!storeId) throw new Error(tForm('select_store'));
      if (positions.length === 0) throw new Error(tForm('add_at_least_one_position'));
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
        // Free-form textarea wins; fall back to the structured compose. The demand
        // create schema takes only the denormalised `shipmentAddress` (there is no
        // `shipmentAddressFull` field), so only the composed string is sent.
        ...(deliveryAddressText.trim() || composeAddress(deliveryAddressFull)
          ? { shipmentAddress: deliveryAddressText.trim() || composeAddress(deliveryAddressFull) }
          : {}),
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
        ...(deliveryDate ? { deliveryPlannedMoment: deliveryDate } : {}),
        ...(paymentPlannedMoment ? { paymentPlannedMoment } : {}),
        moment: docDate ? new Date(docDate).toISOString() : undefined,
        applicable,
        currency,
        rateValue:
          currency === 'UZS'
            ? '100000000'
            : BigInt(Math.round(Number(effectiveRate) * 100000000)).toString(),
        description: description || undefined,
        // Custom-field values (доп. поля). Sent even when {} so the backend's
        // validateAndNormalize enforces any required custom fields server-side.
        attributes: customAttrs,
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
      return api.post<{ id: string }>('/demands', payload);
    },
    onSuccess: (created) => {
      const intent = afterSaveRef.current;
      afterSaveRef.current = 'view';
      if (intent === 'print') {
        window.open(`/print/demand/${created.id}?auto=1`, '_blank', 'width=820,height=1100');
      }
      router.push(`/demands/${created.id}`);
    },
    onError: (err: Error) => setError(err.message),
  });

  const agentFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{
      items: Array<{ id: string; name: string; legalTitle: string | null }>;
    }>(`/counterparties?search=${encodeURIComponent(s)}&limit=50`);
    const items = d.items.map((c) => ({
      id: c.id,
      primary: c.name,
      secondary: c.legalTitle ?? undefined,
    }));
    return pinDefaultCustomer(
      items,
      userDefaults.data?.defaultCustomer,
      s,
      tForm('pinned_default'),
    );
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

  // Position name-cell = product picker only (moysklad parity). The store
  // balance is now its own «Остаток» column (rowsWithStock), not a hint under
  // the product name.
  const renderPositionNameCell = (row: DocPositionRow) => {
    const p = row as NewPositionRow;
    return (
      <CatalogPickerField
        value={p.assortmentId ? { id: p.assortmentId, label: p.productLabel } : null}
        placeholder={tForm('select_product')}
        onPick={() => setOpenPicker({ kind: 'product', rowUid: p.id })}
        onClear={() =>
          updatePosition(p.id, {
            assortmentId: null,
            productLabel: '',
            productUom: null,
          })
        }
      />
    );
  };

  // moysklad b-operation-form-top — the meta grid sits ABOVE the «Главная /
  // Связанные документы» tabs and stays visible (the tabs switch only the
  // positions/related content below). ROW-ALIGNED (customer-order parity):
  // «Организация‖Склад», «Контрагент‖Договор», «Проект‖Канал продаж» line up
  // per row; the LEFT field's sub-row (the Перечисление / org-account picker)
  // extends DOWN inside its own row via `startRow`. The wide Адрес доставки +
  // Комментарий column flows beside the pair, top-aligned.
  const metaPanel = (
    <div className="bg-[var(--ms-bg-surface)] px-4 py-3" data-test-id="doc-meta-panel">
      <div className="flex flex-col gap-x-12 gap-y-4 lg:flex-row lg:items-start">
        {/* LEFT + MIDDLE field columns, paired per row */}
        <div className="grid grid-cols-[auto_minmax(0,190px)_auto_minmax(0,190px)] items-baseline gap-x-2.5 gap-y-2.5">
          {/* Row 1 — Организация ‖ Склад */}
          <DocumentMetaField
            label={tFields('organization')}
            required
            startRow
            subRow={
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
          <DocumentMetaField label={tFields('store')} className="pl-8">
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

          {/* Row 2 — Контрагент ‖ Договор */}
          <DocumentMetaField label={tFields('agent')} required startRow>
            <CatalogPickerField
              value={agentId ? { id: agentId, label: agentLabel } : null}
              placeholder={tFields('agent')}
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
          <DocumentMetaField label={tFields('contract')} className="pl-8">
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

          {/* Row 3 — Проект ‖ Канал продаж */}
          <DocumentMetaField label={tFields('project')} startRow>
            <CatalogPickerField
              value={projectId ? { id: projectId, label: projectLabel } : null}
              placeholder={tFields('project')}
              onPick={() => setOpenPicker('project')}
              onClear={() => {
                setProjectId(null);
                setProjectLabel('');
              }}
              onCreate={() => router.push('/projects/new')}
              createLabel={tForm('create_new_project')}
            />
          </DocumentMetaField>
          <DocumentMetaField label={tFields('sales_channel')} className="pl-8">
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

          {/* Row 4 — Валюта документа (alone on the left) */}
          <DocumentMetaField
            label={tDetailForm('currency')}
            required
            startRow
            helper={
              currency !== 'UZS' ? (
                <span className="inline-flex items-center gap-2">
                  <span>1 {currency} =</span>
                  {rateEditing ? (
                    <>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={rateOverride ?? effectiveRate}
                        onChange={(e) => setRateOverride(e.target.value)}
                        onBlur={() => setRateEditing(false)}
                        className="h-6 w-24 rounded-[var(--ms-radius-sm)] border border-[var(--ms-border-default)] px-1 text-right text-xs tabular-nums focus:outline-none focus:ring-1 focus:ring-[var(--ms-text-brand)]"
                        data-test-id="rate-input"
                      />
                      <span>UZS</span>
                    </>
                  ) : (
                    <>
                      <span className="font-medium tabular-nums">
                        {Number(effectiveRate).toLocaleString('ru-RU')}
                      </span>
                      <span>UZS</span>
                      <Button
                        type="button"
                        variant="link"
                        onClick={() => setRateEditing(true)}
                        className="h-auto px-0 font-normal text-xs"
                        aria-label={tForm('rate_edit')}
                      >
                        ✎
                      </Button>
                      {rateOverride && (
                        <Button
                          type="button"
                          variant="link"
                          onClick={() => setRateOverride(null)}
                          className="h-auto px-0 font-normal text-[var(--ms-text-muted)] text-xs"
                          title={tForm('rate_auto_reset')}
                        >
                          ↺
                        </Button>
                      )}
                    </>
                  )}
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
              <option value="UZS">{tForm('currency_uzs')}</option>
              <option value="USD">{tForm('currency_usd')}</option>
              <option value="EUR">{tForm('currency_eur')}</option>
              <option value="RUB">{tForm('currency_rub')}</option>
            </NativeSelect>
          </DocumentMetaField>
        </div>

        {/* RIGHT — Адрес доставки + Комментарий (wide column, top-aligned). */}
        <div className="grid grid-cols-[auto_minmax(0,280px)] content-start items-start gap-x-2.5 gap-y-2.5">
          <DocumentMetaField label={tFields('delivery_address')}>
            <DeliveryAddressGroup
              value={deliveryAddressFull}
              onChange={setDeliveryAddressFull}
              text={deliveryAddressText}
              onTextChange={setDeliveryAddressText}
            />
          </DocumentMetaField>
          <DocumentMetaField label={tFields('description')}>
            <Textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              aria-label={tFields('description')}
              className="min-h-[34px] text-[12px]"
              data-test-id="field-description-meta"
            />
          </DocumentMetaField>
        </div>
      </div>
    </div>
  );

  // «▶ Другие поля» — a small inline disclosure directly under the meta grid
  // (moysklad places it below Валюта документа, above the tabs). Holds the
  // shipping fields + planned dates + overhead + external code. The
  // «Грузоотправитель» sub-block grouping is a subsequent functional task.
  const otherFields = (
    <DocumentDisclosurePanel title={tForm('other_fields')} defaultOpen={false}>
      <DocumentMetaPanel>
        <DocumentMetaRow>
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
  );

  const tabs = [
    {
      key: 'main',
      label: tDetailTabs('main'),
      content: (
        <div className="space-y-4">
          <PositionTable
            columns={positionColumns}
            rows={rowsWithStock}
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
            vatIncluded={vatIncluded}
            selectedIds={selectedRowIds}
            onSelectionChange={setSelectedRowIds}
            footerToolbar={
              <PositionInlineAdd
                placeholder={tPos('addPositionPlaceholder')}
                addFromCatalogLabel={tPos('addFromCatalog')}
                checkCompletenessLabel={tPos('checkCompleteness')}
                onSearch={async (q) => {
                  const r = await api.get<{ items: ProductItem[] }>(
                    `/products?search=${encodeURIComponent(q)}&limit=20`,
                  );
                  return r.items.map((p) => ({
                    id: p.id,
                    primary: p.name,
                    secondary: p.code ?? undefined,
                    raw: p,
                  }));
                }}
                onPick={(item) => {
                  const raw = item.raw as ProductItem | undefined;
                  const defaultPrice = resolveDefaultSalePriceOrZero(raw?.salePrices);
                  setPositions((ps) => [
                    ...ps,
                    {
                      id: uid(),
                      assortmentId: item.id,
                      productLabel: item.primary,
                      productUom: raw?.uom ?? null,
                      quantity: '1',
                      priceMinor: defaultPrice,
                      discount: '0',
                      vat: raw?.vat != null ? String(raw.vat) : '0',
                      vatEnabled: true,
                      buyPriceMinor: buyPriceMinorOf(raw),
                    },
                  ]);
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
                        vat: raw?.vat != null ? String(raw.vat) : '0',
                        vatEnabled: true,
                        buyPriceMinor: buyPriceMinorOf(raw),
                      };
                    }),
                  ]);
                }}
              />
            }
          />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto]">
            {/* Left: document Комментарий + the «Внешний код» collapsed toggle-link
                beneath it (moysklad shows external-code as a brand-blue link at the
                bottom-left that expands to an input on click). */}
            <div className="flex flex-col gap-3 text-sm">
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={tFields('description')}
                rows={3}
                data-test-id="field-description"
              />
              {showExternalCode ? (
                <label className="flex flex-col gap-1">
                  <span className="text-[var(--ms-text-muted)]">{tFields('external_code')}</span>
                  <input
                    type="text"
                    value={externalCode}
                    onChange={(e) => setExternalCode(e.target.value)}
                    className="h-[var(--ms-control-h)] w-56 rounded-[var(--ms-radius-sm)] border border-[var(--ms-border-default)] px-2 text-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--ms-text-brand)]"
                    data-test-id="field-external-code"
                  />
                </label>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowExternalCode(true)}
                  className="self-start text-[var(--ms-text-brand)] hover:underline"
                  data-test-id="external-code-toggle"
                >
                  {tFields('external_code')}
                </button>
              )}
            </div>
            {/* Right: totals panel + the «Накладные расходы» compact row directly
                below it (moysklad places overhead under the totals, not in «Другие
                поля»). */}
            <div className="flex flex-col gap-2">
              <DocumentTotalsPanel
                subtotalMinor={totals.net}
                vatMinor={totals.vat}
                totalMinor={totals.gross}
                currency={currency}
                vatEnabled={vatEnabled}
                onVatEnabledChange={setVatEnabled}
                vatIncluded={vatIncluded}
                onVatIncludedChange={setVatIncluded}
                // moysklad shows «Прибыль» (not «Кол-во») in the sales totals — the
                // expected profit from the product cost (net revenue − Σ buyPrice×qty).
                profitMinor={profitMinor}
              />
              <div
                className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1 text-[12px]"
                data-test-id="overhead-row"
              >
                <span className="text-[var(--ms-text-muted)]">{tDetailForm('overhead_sum')}</span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={overheadMajor}
                  placeholder="0"
                  onChange={(e) => setOverheadMajor(e.target.value)}
                  className="w-28 text-right"
                  data-test-id="field-overhead-sum"
                />
                <span className="text-[var(--ms-text-muted)]">
                  {tDetailForm('overhead_distribution')}
                </span>
                <NativeSelect
                  value={overheadDistribution}
                  onChange={(e) =>
                    setOverheadDistribution(
                      e.target.value as 'WEIGHT' | 'PRICE' | 'VOLUME' | 'QUANTITY',
                    )
                  }
                  data-test-id="field-overhead-distribution"
                  disabled={!(Number(overheadMajor) > 0)}
                  className="w-40"
                >
                  <option value="PRICE">{tDetailForm('overhead_by_price')}</option>
                  <option value="WEIGHT">{tDetailForm('overhead_by_weight')}</option>
                  <option value="VOLUME">{tDetailForm('overhead_by_volume')}</option>
                  <option value="QUANTITY">{tDetailForm('overhead_by_quantity')}</option>
                </NativeSelect>
              </div>
            </div>
          </div>

          {/* Account custom fields (доп. поля) — moysklad keeps these inline
              below the position/totals area, outside the tab strip (mirrors the
              demand [id] detail so create ↔ detail stay consistent). Renders
              nothing when the account defines no custom fields. */}
          <AttributesEditor
            entity="Demand"
            values={customAttrs}
            onChange={setCustomAttrs}
            testIdPrefix="demand"
          />

          <DocumentDisclosurePanel
            title={tForm('tasks_section')}
            headerAction={
              <Button type="button" variant="secondary" disabled>
                <Icons.create className="h-4 w-4" />
                {tForm('add_task')}
              </Button>
            }
            defaultOpen={false}
          >
            <p className="text-[var(--ms-text-muted)] text-sm">{tForm('tasks_after_save_hint')}</p>
          </DocumentDisclosurePanel>

          <DocumentDisclosurePanel
            title={tForm('files_section')}
            headerAction={
              <Button type="button" variant="secondary" disabled>
                <Icons.create className="h-4 w-4" />
                {tForm('add_file')}
              </Button>
            }
            defaultOpen={false}
          >
            <p className="text-[var(--ms-text-muted)] text-sm">{tForm('files_after_save_hint')}</p>
          </DocumentDisclosurePanel>
        </div>
      ),
    },
    {
      key: 'related',
      label: tDetailTabs('related'),
      content: (
        <p className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-6 text-center text-[var(--ms-text-muted)] text-sm">
          {t('related_empty')}
        </p>
      ),
    },
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
        status={statusId ?? ''}
        statusOptions={statusOptions}
        onStatusChange={setStatusId}
        paymentLabel={tDetailHeader('not_paid')}
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
          // moysklad «Изменить» = [Копировать, Удалить]. On /new: Копировать saves
          // then lands on the created demand's detail (clone lives there); Удалить
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
          // moysklad «Создать документ» for a demand lists these 6 downstream docs
          // (same order/labels as the detail). From /new they need a saved demand +
          // from-demand endpoints that don't exist yet, so they render as visible
          // placeholders (parity: the button + list appear).
          { label: tDetailTitles('move'), disabled: true },
          { label: tDetailTitles('invoice_out'), disabled: true },
          { label: tCreate('facture_out'), disabled: true },
          { label: tDetailTitles('payment_in'), disabled: true },
          { label: tDetailTitles('cash_in'), disabled: true },
          { label: tCreate('sales_return'), disabled: true },
        ]}
        printMenu={[
          // «Печать» on /new saves first, then opens the standalone print view.
          {
            label: tDetailTitles('demand'),
            onClick: () => {
              afterSaveRef.current = 'print';
              setError(null);
              createMut.mutate();
            },
          },
        ]}
        sendMenu={[
          // «Отправить» saves first, then lands on the detail (the email composer
          // lives there).
          {
            label: tDetailTitles('demand'),
            onClick: () => {
              afterSaveRef.current = 'view';
              setError(null);
              createMut.mutate();
            },
          },
        ]}
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
          {otherFields}
          <DocumentTabs tabs={tabs} defaultActiveKey="main" />
        </>
      </DocumentEditor>

      <CatalogPicker
        open={openPicker === 'agent'}
        onClose={() => setOpenPicker(null)}
        title={tFields('agent')}
        fetcher={agentFetcher}
        onSelect={(item) => {
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
            vat: raw?.vat != null ? String(raw.vat) : '0',
            buyPriceMinor: buyPriceMinorOf(raw),
          });
        }}
      />
    </>
  );
}
