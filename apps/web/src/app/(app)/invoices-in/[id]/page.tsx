'use client';

/**
 * /invoices-in/[id] — moysklad-parity «Счёт поставщика» editor (existing doc).
 *
 * Rebuilt 2026-06-25 onto the SAME shell as purchase-orders/[id] (the proven detail
 * reference) so the edit form is 1:1 with live moysklad: DetailToolbar + the shared
 * DocumentHeader (title · grey «Статус» · «Не оплачено» pill · «Проведено») + INLINE
 * type-to-search ref fields (NOT modals) + row-paired metaPanel (Организация+«Сум»
 * subRow · Контрагент+«Баланс» · План.дата оплаты · Входящий номер+«от»+дата · Валюта
 * документа+FX | Склад · Договор · Проект) + PositionTable (Цена▾/Наименование▾/Сумма⚙)
 * + owner popover (toolbar rightSlot) + «Внешний код» + DetailContentTabs (positions/
 * related/files/tasks/history) + AttributesEditor.
 *
 * A posted («Проведено») supplier invoice is locked (the API rejects edits while
 * applicable) — every field + the owner popover render read-only with a notice.
 */

import { AttachmentsSection } from '@/components/attachments-section';
import { AttributesEditor } from '@/components/attributes-editor';
import { CounterpartyBalanceInline } from '@/components/counterparty-balance-inline';
import { RelatedDocsTab } from '@/components/customer-orders/related-docs-tab';
import {
  type CreateMenuItem,
  DetailContentTabs,
  DetailToolbar,
  DetailTotalsSidebar,
  DocumentHistoryLink,
} from '@/components/document-detail';
import { DocumentTasksSection } from '@/components/document-tasks-section';
import { OwnerAccessPopover } from '@/components/documents/owner-access-popover';
import { PositionColumnCustomizer } from '@/components/documents/position-column-customizer';
import { PositionDiscountMenu } from '@/components/documents/position-discount-menu';
import { PositionPriceMenu } from '@/components/documents/position-price-menu';
import { useApiMutation } from '@/hooks/use-api-mutation';
import { useConflictReload } from '@/hooks/use-conflict-reload';
import { useDestructiveMutation } from '@/hooks/use-destructive-mutation';
import { useDetailNavigation } from '@/hooks/use-detail-navigation';
import { useDocumentEditorLabels } from '@/hooks/use-document-editor-labels';
import { useSaveMutation } from '@/hooks/use-save-mutation';
import { useUnsavedGuard } from '@/hooks/use-unsaved-guard';
import { api } from '@/lib/api-client';
import { docTotals } from '@/lib/doc-totals';
import { isOptimisticConflict } from '@/lib/optimistic-lock';
import {
  Alert,
  CatalogPicker,
  CatalogPickerField,
  DatePicker,
  type DocPositionRow,
  DocumentHeader,
  DocumentMetaField,
  DocumentMetaRow,
  Input,
  NativeSelect,
  type PickerItem,
  type PositionColumnKey,
  PositionInlineAdd,
  PositionTable,
  type PositionTableColumnConfig,
  Textarea,
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
  product: { id: string; name: string; code: string | null; uom: string | null } | null;
}

interface InvoiceDetail {
  id: string;
  version: number;
  name: string;
  externalCode: string | null;
  incomingNumber: string | null;
  incomingDate: string | null;
  state: string;
  applicable: boolean;
  moment: string;
  paymentPlannedMoment: string | null;
  postedAt: string | null;
  description: string | null;
  sumMinor: string;
  /** ISO currency of the document (e.g. USD), for money formatting + FX. */
  currency: string;
  vatSumMinor: string;
  payedSumMinor: string;
  vatEnabled: boolean;
  vatIncluded: boolean;
  agent: { id: string; name: string; legalTitle: string | null; companyType: string };
  organization: { id: string; name: string; legalTitle: string | null };
  owner: { id: string; name: string } | null;
  /** «Владелец-отдел» — resolved by the service (scalar groupId only), null when unset. */
  group: { id: string; name: string } | null;
  /** «Общий доступ» flag. */
  shared: boolean;
  purchaseOrder: { id: string; name: string; state: string } | null;
  contract: { id: string; name: string } | null;
  project: { id: string; name: string } | null;
  store: { id: string; name: string } | null;
  organizationAccount: { id: string; name: string; accountNumber: string | null } | null;
  positions: PositionDetail[];
  createdAt: string;
  updatedAt: string;
}

interface ProductItem {
  id: string;
  name: string;
  code: string | null;
  uom: string | null;
  buyPrice: string | null;
  vat: number | null;
  stock?: { onHand: string; reserved: string; inTransit: string; available: string } | null;
  salePrices?: Array<{ priceTypeId: string; value: string }> | null;
}

// Account currency (Настройки → Валюты) — drives the «1 USD = N UZS» rate helper.
interface CurrencyItem {
  id: string;
  isoCode: string;
  name: string;
  default: boolean;
  rateValue: string;
  rate: string;
}

interface DetailPositionRow extends DocPositionRow {
  assortmentId: string | null;
  salePrices?: Array<{ priceTypeId: string; value: string }> | null;
}

interface FormState {
  moment: string;
  agentId: string;
  agentLabel: string;
  organizationId: string;
  organizationLabel: string;
  storeId: string | null;
  storeLabel: string;
  contractId: string | null;
  contractLabel: string;
  projectId: string | null;
  projectLabel: string;
  organizationAccountId: string | null;
  organizationAccountLabel: string;
  externalCode: string;
  description: string;
  incomingNumber: string;
  incomingDate: string;
  paymentPlannedMoment: string;
  currency: string;
  vatEnabled: boolean;
  vatIncluded: boolean;
  ownerId: string | null;
  ownerLabel: string;
  groupId: string | null;
  groupLabel: string;
  shared: boolean;
  positions: DetailPositionRow[];
  attributes: Record<string, unknown>;
}

function uid(): string {
  return Math.random().toString(36).slice(2);
}

/** ISO moment (UTC) → local `YYYY-MM-DDTHH:MM` (the string <DocumentHeader> expects). */
function momentToLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// moysklad «Счёт поставщика» optional position columns (live-grounded 2026-06-25):
// Доступно ON, Единица ON; Изображение · Принято · Остаток · Резерв · Вес · Объём ·
// Сумма НДС OFF. Toggle via «Сумма ⚙». Mirrors /invoices-in/new.
const OPTIONAL_POSITION_COLUMNS: { key: PositionColumnKey; labelKey: string; on: boolean }[] = [
  { key: 'image', labelKey: 'image', on: false },
  { key: 'unit', labelKey: 'unit', on: true },
  { key: 'shipped', labelKey: 'received', on: false },
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

function formFromData(d: InvoiceDetail): FormState {
  return {
    moment: momentToLocalInput(d.moment),
    agentId: d.agent.id,
    agentLabel: d.agent.name,
    organizationId: d.organization.id,
    organizationLabel: d.organization.name,
    storeId: d.store?.id ?? null,
    storeLabel: d.store?.name ?? '',
    contractId: d.contract?.id ?? null,
    contractLabel: d.contract?.name ?? '',
    projectId: d.project?.id ?? null,
    projectLabel: d.project?.name ?? '',
    organizationAccountId: d.organizationAccount?.id ?? null,
    organizationAccountLabel:
      d.organizationAccount?.name || d.organizationAccount?.accountNumber || '',
    externalCode: d.externalCode ?? '',
    description: d.description ?? '',
    incomingNumber: d.incomingNumber ?? '',
    incomingDate: d.incomingDate ? d.incomingDate.slice(0, 10) : '',
    paymentPlannedMoment: d.paymentPlannedMoment ? d.paymentPlannedMoment.slice(0, 10) : '',
    currency: d.currency,
    vatEnabled: d.vatEnabled,
    vatIncluded: d.vatIncluded,
    ownerId: d.owner?.id ?? null,
    ownerLabel: d.owner?.name ?? '',
    groupId: d.group?.id ?? null,
    groupLabel: d.group?.name ?? '',
    shared: d.shared ?? false,
    positions: d.positions.map((p) => ({
      id: p.id,
      assortmentId: p.assortmentId,
      productLabel: p.product?.name ?? '—',
      productCode: p.product?.code ?? undefined,
      productUom: p.product?.uom ?? null,
      quantity: p.quantity,
      priceMinor: p.priceMinor,
      discount: p.discount,
      vat: p.vat != null ? String(p.vat) : '',
      vatEnabled: p.vatEnabled,
      salePrices: null,
    })),
    attributes: (d as { attributes?: Record<string, unknown> }).attributes ?? {},
  };
}

function snapshot(s: FormState): string {
  return JSON.stringify({
    moment: s.moment,
    agentId: s.agentId,
    organizationId: s.organizationId,
    storeId: s.storeId,
    contractId: s.contractId,
    projectId: s.projectId,
    organizationAccountId: s.organizationAccountId,
    externalCode: s.externalCode,
    description: s.description,
    incomingNumber: s.incomingNumber,
    incomingDate: s.incomingDate,
    paymentPlannedMoment: s.paymentPlannedMoment,
    currency: s.currency,
    vatEnabled: s.vatEnabled,
    vatIncluded: s.vatIncluded,
    ownerId: s.ownerId,
    groupId: s.groupId,
    shared: s.shared,
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

export default function InvoiceInDetailPage() {
  const { id } = useParams<{ id: string }>();
  // moysklad «N из ВСЕГО ‹ ›» — server-backed (GET /invoices-in/:id/position) so the
  // toolbar shows the REAL total + the arrows walk the whole ordered set even on a
  // direct-URL visit (no list cache). Mirrors purchase-orders/[id].
  const detailNav = useDetailNavigation('invoices-in', id, { server: true });
  const docEditorLabels = useDocumentEditorLabels();
  const router = useRouter();
  const qc = useQueryClient();
  const t = useTranslations('pages.invoices_in');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tDetailHeader = useTranslations('detail_header');
  const tDetailTitles = useTranslations('detail_titles');
  const tDetailForm = useTranslations('detail_form');
  const tDetailTabs = useTranslations('detail_tabs');
  const tForm = useTranslations('form');
  const tPos = useTranslations('position_editor');
  const tCols = useTranslations('position_cols');

  const { data, isLoading } = useQuery<InvoiceDetail>({
    queryKey: ['invoice-in', id],
    queryFn: () => api.get(`/invoices-in/${id}`),
  });

  // Price types for the «Цена ▾» → «Расценить» menu.
  const { data: priceTypesData } = useQuery<{ items: Array<{ id: string; name: string }> }>({
    queryKey: ['price-types'],
    queryFn: () => api.get('/price-types'),
    staleTime: 60_000,
  });

  // «Валюта документа» options + rates — the account's REAL currencies (Настройки →
  // Валюты), never a hardcoded list. `default` = base, `rate` = value vs base.
  const { data: currenciesData } = useQuery<{ items: CurrencyItem[] }>({
    queryKey: ['currencies'],
    queryFn: () => api.get('/currencies'),
    staleTime: 60_000,
  });
  const currencies = useMemo(() => currenciesData?.items ?? [], [currenciesData]);

  const [form, setForm] = useState<FormState | null>(null);
  const [original, setOriginal] = useState<string>('');
  const [openPicker, setOpenPicker] = useState<
    null | 'agent' | 'org' | 'store' | 'contract' | 'project' | 'organizationAccount'
  >(null);
  const [openCatalogPicker, setOpenCatalogPicker] = useState(false);
  const [productRowId, setProductRowId] = useState<string | null>(null);
  const [colVisible, setColVisible] = useState<Record<string, boolean>>(DEFAULT_COL_VISIBLE);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  // «Валюта документа» FX — moysklad shows «1 USD = N UZS» INLINE with the picker + a ✎ to
  // override the rate for THIS document (else the account currency rate is used).
  const [rateOverride, setRateOverride] = useState<string | null>(null);
  const [rateEditing, setRateEditing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const onConflict = useConflictReload(['invoice-in', id], () => setForm(null));

  useEffect(() => {
    if (data && !form) {
      const initial = formFromData(data);
      setForm(initial);
      setOriginal(snapshot(initial));
    }
  }, [data, form]);

  const isDirty = useMemo(() => (form ? snapshot(form) !== original : false), [form, original]);
  useUnsavedGuard(isDirty);

  // ── Position table callbacks ──
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
  // «Сохранить цены» — supplier invoice line price is the BUY price → save to buyPrice.
  const saveProductPrices = useCallback(async () => {
    const positions = form?.positions ?? [];
    const seen = new Set<string>();
    for (const p of positions) {
      if (!p.assortmentId || seen.has(p.assortmentId)) continue;
      seen.add(p.assortmentId);
      try {
        const prod = await api.get<{ version: number }>(`/products/${p.assortmentId}`);
        await api.patch(`/products/${p.assortmentId}`, {
          version: prod.version,
          buyPrice: p.priceMinor,
        });
      } catch {
        // skip products that can't be updated; others proceed
      }
    }
  }, [form]);
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

  const transitionMut = useApiMutation({
    mutationFn: (target: string) => api.post(`/invoices-in/${id}/transitions/${target}`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoice-in', id] });
      qc.invalidateQueries({ queryKey: ['invoices-in'] });
      if (data?.purchaseOrder) {
        qc.invalidateQueries({ queryKey: ['purchase-order', data.purchaseOrder.id] });
        qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      }
    },
  });

  const deleteMut = useApiMutation({
    mutationFn: () => api.delete(`/invoices-in/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices-in'] });
      router.push('/invoices-in');
    },
  });

  const cloneMut = useApiMutation({
    mutationFn: () => api.post<{ id: string }>(`/invoices-in/${id}/clone`, {}),
    onSuccess: (clone) => {
      qc.invalidateQueries({ queryKey: ['invoices-in'] });
      router.push(`/invoices-in/${clone.id}`);
    },
  });

  const { runDestructive } = useDestructiveMutation();

  // moysklad «Создать документ → Исходящий платёж» for the unpaid balance.
  const createPaymentMut = useApiMutation({
    mutationFn: () => api.post<{ id: string }>(`/payments-out/from-invoice-in/${id}`, {}),
    onSuccess: (payment) => {
      qc.invalidateQueries({ queryKey: ['invoice-in', id] });
      qc.invalidateQueries({ queryKey: ['invoices-in'] });
      router.push(`/payments-out/${payment.id}`);
    },
  });

  const saveMut = useSaveMutation({
    mutationFn: async () => {
      if (!form || !data) throw new Error('Form not ready');
      const sel = currencies.find((c) => c.isoCode === form.currency);
      const isBase = sel?.default ?? form.currency === 'UZS';
      const payload: Record<string, unknown> = {
        version: data.version,
        description: form.description || null,
        incomingNumber: form.incomingNumber || null,
        incomingDate: form.incomingDate || null,
        paymentPlannedMoment: form.paymentPlannedMoment || null,
        vatEnabled: form.vatEnabled,
        vatIncluded: form.vatIncluded,
        contractId: form.contractId,
        projectId: form.projectId,
        storeId: form.storeId,
        organizationAccountId: form.organizationAccountId,
        externalCode: form.externalCode || null,
        // «Владелец» / «Владелец-отдел» / «Общий доступ» — metadata (editable while draft).
        ownerId: form.ownerId,
        groupId: form.groupId,
        shared: form.shared,
        // moysklad keeps currency / moment / positions editable on a DRAFT invoice
        // (a posted one is locked server-side — `editable` below guards the form).
        currency: form.currency,
        // per-doc rate override (moysklad ✎) wins; else the account currency's rate.
        rateValue: isBase
          ? '100000000'
          : rateOverride
            ? BigInt(Math.round(Number(rateOverride) * 100000000)).toString()
            : (sel?.rateValue ?? '100000000'),
        agentId: form.agentId,
        organizationId: form.organizationId,
        moment: form.moment ? new Date(form.moment).toISOString() : undefined,
        positions: form.positions.map((p) => ({
          assortmentKind: 'product',
          // biome-ignore lint/style/noNonNullAssertion: a product is always picked before save
          assortmentId: p.assortmentId!,
          quantity: p.quantity,
          priceMinor: p.priceMinor,
          discount: p.discount || '0',
          vat: p.vat ? Number(p.vat) : undefined,
          vatEnabled: p.vatEnabled,
        })),
        attributes: form.attributes,
      };
      return api.patch(`/invoices-in/${id}`, payload);
    },
    onSuccess: () => {
      setSaveError(null);
      qc.invalidateQueries({ queryKey: ['invoice-in', id] });
      qc.invalidateQueries({ queryKey: ['invoices-in'] });
      if (form) setOriginal(snapshot(form));
    },
    onError: (err: Error) => {
      if (isOptimisticConflict(err)) return;
      setSaveError(err.message);
    },
    onConflict,
  });

  // ── Inline type-to-search fetchers (moysklad parity — NOT modals) ──
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
    const params = new URLSearchParams({ search: s, limit: '50' });
    if (form?.agentId) params.set('agentId', form.agentId);
    const d = await api.get<{ items: Array<{ id: string; name: string }> }>(
      `/contracts?${params.toString()}`,
    );
    return d.items.map((x) => ({ id: x.id, primary: x.name }));
  };
  const projectFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: Array<{ id: string; name: string }> }>(
      `/projects?search=${encodeURIComponent(s)}&limit=50`,
    );
    return d.items.map((x) => ({ id: x.id, primary: x.name }));
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
      primary: x.name || x.accountNumber || '',
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

  // ── Position columns (mirror /invoices-in/new; menus disabled when posted) ──
  // moysklad keeps a POSTED («Проведено») supplier invoice editable — only a cancelled
  // one is locked (the BE re-derives balance + PO invoiced-total on save). Mirrors PO/[id].
  const editable = !!data && data.state !== 'cancelled';
  const positionColumns = useMemo<PositionTableColumnConfig[]>(() => {
    const cols: PositionTableColumnConfig[] = [{ key: 'dragarea' }, { key: 'select' }];
    if (colVisible.image) cols.push({ key: 'image' });
    cols.push({ key: 'name', label: tCols('name') });
    cols.push({ key: 'quantity', label: tPos('quantity') });
    if (colVisible.unit) cols.push({ key: 'unit', label: tCols('unit') });
    if (colVisible.shipped) cols.push({ key: 'shipped', label: tCols('received') });
    if (colVisible.stock) cols.push({ key: 'stock', label: tCols('stock') });
    if (colVisible.reserve) cols.push({ key: 'reserve', label: tCols('reserve') });
    if (colVisible.available) cols.push({ key: 'available', label: tCols('available') });
    if (colVisible.waiting) cols.push({ key: 'waiting', label: tCols('waiting') });
    cols.push({
      key: 'price',
      label: editable ? (
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
    });
    if (form?.vatEnabled) {
      cols.push({ key: 'vat', label: tCols('vat') });
      if (colVisible.vatAmount) cols.push({ key: 'vatAmount', label: tCols('vatAmount') });
    }
    cols.push({
      key: 'discount',
      label: editable ? (
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
      ) : (
        tCols('discount')
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
            {editable && (
              <PositionColumnCustomizer
                options={OPTIONAL_POSITION_COLUMNS.map((c) => ({
                  key: c.key,
                  label: tCols(c.labelKey),
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
    editable,
    form?.vatEnabled,
    tCols,
    tPos,
    priceTypesData,
    repricePositions,
    saveProductPrices,
    applyDiscountMarkup,
    selectedRowIds,
  ]);

  if (isLoading || !form)
    return <div className="p-8 text-[var(--ms-text-muted)] text-sm">{tCommon('loading')}</div>;
  if (!data) return <div className="p-8 text-sm">{tCommon('not_found')}</div>;

  const sumBig = BigInt(data.sumMinor || '0');
  const vatBig = BigInt(data.vatSumMinor || '0');
  const paidBig = BigInt(data.payedSumMinor || '0');
  const { subtotal, total } = docTotals(sumBig, vatBig);
  const totalQty = form.positions.reduce((acc, p) => acc + Number(p.quantity || 0), 0);
  const isPaid = sumBig > 0n && paidBig >= sumBig;

  const canCreatePayment =
    (['posted', 'partially_paid'] as const).includes(data.state as never) && !isPaid;

  const createMenuItems: CreateMenuItem[] = [
    {
      id: 'payment-out',
      label: tDetailTitles('payment_out'),
      onSelect: canCreatePayment ? () => createPaymentMut.mutate() : undefined,
      disabled: !canCreatePayment,
    },
  ];

  // moysklad «Проведено» drives the FSM (post/unpost). A cancelled invoice can't toggle.
  const onApplicableChange = (['cancelled'] as readonly string[]).includes(data.state)
    ? undefined
    : (next: boolean) => transitionMut.mutate(next ? 'post' : 'unpost');

  // «Валюта документа» rate helper «1 USD = N UZS» (when not the base currency).
  const selectedCurrency = currencies.find((c) => c.isoCode === form.currency);
  const isBaseCurrency = selectedCurrency?.default ?? form.currency === 'UZS';
  const effectiveRate = rateOverride ?? selectedCurrency?.rate ?? '1';

  // moysklad does NOT show a «Не оплачено»/«Оплачено» pill in the doc editor header
  // (payment status lives only in the LIST «Оплачено» column) — so no payment pill here.

  // moysklad green-check notice (below the toolbar): «Позиции документа содержат
  // повторяющиеся товары» — shown when the same product appears on more than one line.
  const hasDuplicatePositions = (() => {
    const seen = new Set<string>();
    for (const p of form.positions) {
      if (!p.assortmentId) continue;
      if (seen.has(p.assortmentId)) return true;
      seen.add(p.assortmentId);
    }
    return false;
  })();

  const applyProductToRow = (rowId: string, item: PickerItem) => {
    const raw = (item as { raw?: ProductItem }).raw;
    updatePosition(rowId, {
      assortmentId: item.id,
      productLabel: String(item.primary),
      productCode: raw?.code ?? undefined,
      productUom: raw?.uom ?? null,
      priceMinor: raw?.buyPrice ?? '0',
      vat: raw?.vat != null ? String(raw.vat) : '12',
      available: raw?.stock?.available,
      stock: raw?.stock?.onHand,
      reserve: raw?.stock?.reserved,
      salePrices: raw?.salePrices ?? null,
    });
  };
  const renderPositionNameCell = (row: DocPositionRow) => {
    const p = row as DetailPositionRow;
    return (
      <CatalogPickerField
        value={p.assortmentId ? { id: p.assortmentId, label: p.productLabel } : null}
        placeholder={tForm('select_product')}
        // moysklad parity: the position name is an INLINE type-to-search (NOT a modal) —
        // the chevron + typing open the anchored product dropdown. onPick stays as the
        // legacy fallback (not triggered now that the inline variant is active).
        inlineFetcher={editable ? productFetcher : undefined}
        onInlineSelect={editable ? (item) => applyProductToRow(p.id, item) : undefined}
        onPick={() => editable && setProductRowId(p.id)}
        onClear={() =>
          editable &&
          updatePosition(p.id, { assortmentId: null, productLabel: '', productUom: null })
        }
        disabled={!editable}
      />
    );
  };

  return (
    <div
      className="flex min-h-screen flex-col bg-[var(--ms-bg-surface)]"
      data-test-id="invoice-in-detail-page"
    >
      <div className="w-full max-w-[1300px]">
        <DetailToolbar
          isDirty={isDirty}
          isSaving={saveMut.isPending}
          onSave={() => saveMut.mutate()}
          onClose={() => router.push('/invoices-in')}
          position={detailNav.position}
          onPrev={detailNav.onPrev}
          onNext={detailNav.onNext}
          apiData={data}
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
          hideOpenApi
          printEntity="invoicein"
          rightSlot={
            <>
              {editable ? (
                <OwnerAccessPopover
                  value={{
                    ownerId: form.ownerId,
                    ownerLabel: form.ownerLabel,
                    groupId: form.groupId,
                    groupLabel: form.groupLabel,
                    shared: form.shared,
                  }}
                  onChange={(v) =>
                    setForm((f) =>
                      f
                        ? {
                            ...f,
                            ownerId: v.ownerId,
                            ownerLabel: v.ownerLabel,
                            groupId: v.groupId,
                            groupLabel: v.groupLabel,
                            shared: v.shared,
                          }
                        : f,
                    )
                  }
                />
              ) : (
                <div
                  className="flex flex-col items-end text-right text-xs leading-tight"
                  data-test-id="doc-owner-readonly"
                >
                  <span className="font-medium text-[var(--ms-text-brand)]">
                    {form.ownerLabel || '—'}
                  </span>
                  <span className="text-[var(--ms-text-muted)]">{form.groupLabel || ''}</span>
                </div>
              )}
              <DocumentHistoryLink auditEntity="InvoiceIn" entityId={data.id} />
            </>
          }
        />

        {/* moysklad green-check notice below the toolbar — «Позиции документа содержат
            повторяющиеся товары» when the same product is on more than one line. */}
        {hasDuplicatePositions && (
          <div
            className="flex items-center gap-2 px-4 pt-1 text-[var(--ms-text-primary)] text-sm"
            data-test-id="duplicate-positions-notice"
          >
            <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-[#5fa83d] text-[11px] text-white">
              ✓
            </span>
            <span>{tDetailForm('duplicate_positions')}</span>
          </div>
        )}

        <DocumentHeader
          {...docEditorLabels}
          documentTypeLabel={tDetailTitles('invoice_in')}
          number={data.name}
          date={form.moment}
          onDateChange={editable ? (v) => setForm((f) => f && { ...f, moment: v }) : undefined}
          // moysklad «Статус» — supplier invoices have no account custom statuses yet,
          // so the pill stays a grey «Статус» (FSM lifecycle is driven by «Проведено»).
          status=""
          statusOptions={[]}
          applicable={data.applicable}
          onApplicableChange={onApplicableChange}
          applicableHelp={t('applicable_help')}
        />

        <main className="px-4 py-4">
          {saveError && (
            <Alert tone="destructive" className="mb-3">
              {saveError}
            </Alert>
          )}
          {transitionMut.error && (
            <Alert tone="destructive" className="mb-3">
              {(transitionMut.error as Error).message}
            </Alert>
          )}
          {createPaymentMut.error && (
            <Alert tone="destructive" className="mb-3">
              {(createPaymentMut.error as Error).message}
            </Alert>
          )}
          {/* moysklad b-operation-form-top — row-paired meta (INLINE fields, /new parity). */}
          <div className="max-w-[860px] space-y-2">
            <DocumentMetaRow fixedWidth>
              <DocumentMetaField
                label={tFields('organization')}
                required
                subRow={
                  form.organizationId ? (
                    <CatalogPickerField
                      value={
                        form.organizationAccountId
                          ? { id: form.organizationAccountId, label: form.organizationAccountLabel }
                          : null
                      }
                      placeholder=""
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
                            s && {
                              ...s,
                              organizationAccountId: null,
                              organizationAccountLabel: '',
                            },
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
                  onEdit={
                    form.organizationId
                      ? () =>
                          window.open(`/organizations/${form.organizationId}`, '_blank', 'noopener')
                      : undefined
                  }
                  editLabel={tCommon('edit')}
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
              <DocumentMetaField label={tFields('store')}>
                <CatalogPickerField
                  value={form.storeId ? { id: form.storeId, label: form.storeLabel } : null}
                  placeholder={tFields('store')}
                  onPick={() => editable && setOpenPicker('store')}
                  inlineFetcher={storeFetcher}
                  onInlineSelect={(item) =>
                    setForm(
                      (s) => s && { ...s, storeId: item.id, storeLabel: String(item.primary) },
                    )
                  }
                  onEdit={
                    form.storeId
                      ? () => window.open(`/stores/${form.storeId}`, '_blank', 'noopener')
                      : undefined
                  }
                  editLabel={tCommon('edit')}
                  onClear={() =>
                    editable && setForm((s) => s && { ...s, storeId: null, storeLabel: '' })
                  }
                  disabled={!editable}
                  testId="field-store"
                />
              </DocumentMetaField>
            </DocumentMetaRow>

            <DocumentMetaRow fixedWidth>
              <DocumentMetaField label={tFields('agent')} required>
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
                  onCreate={editable ? () => router.push('/counterparties/new') : undefined}
                  createLabel={tForm('create_new_counterparty')}
                  disabled={!editable}
                  testId="field-agent"
                />
                <CounterpartyBalanceInline counterpartyId={form.agentId || null} />
              </DocumentMetaField>
              <DocumentMetaField label={tFields('contract')}>
                <CatalogPickerField
                  value={
                    form.contractId ? { id: form.contractId, label: form.contractLabel } : null
                  }
                  placeholder={tFields('contract')}
                  onPick={() => editable && form.agentId && setOpenPicker('contract')}
                  inlineFetcher={contractFetcher}
                  onInlineSelect={(item) =>
                    setForm(
                      (s) =>
                        s && { ...s, contractId: item.id, contractLabel: String(item.primary) },
                    )
                  }
                  onClear={() =>
                    editable && setForm((s) => s && { ...s, contractId: null, contractLabel: '' })
                  }
                  disabled={!editable || !form.agentId}
                  testId="field-contract"
                />
              </DocumentMetaField>
            </DocumentMetaRow>

            <DocumentMetaRow fixedWidth>
              <DocumentMetaField label={tFields('payment_planned')}>
                <DatePicker
                  value={form.paymentPlannedMoment || null}
                  onChange={(d) => setForm((s) => s && { ...s, paymentPlannedMoment: d ?? '' })}
                  locale="ru-RU"
                  disabled={!editable}
                  testId="field-payment-planned"
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
                  onCreate={editable ? () => router.push('/projects/new') : undefined}
                  createLabel={tForm('create_new_project')}
                  disabled={!editable}
                  testId="field-project"
                />
              </DocumentMetaField>
            </DocumentMetaRow>

            {/* «Входящий номер» [____] «от» [📅____] — left-only row. */}
            <DocumentMetaRow>
              <DocumentMetaField label={t('col_incoming_number')}>
                <div className="flex items-center gap-2">
                  <Input
                    value={form.incomingNumber}
                    onChange={(e) => setForm((s) => s && { ...s, incomingNumber: e.target.value })}
                    className="w-40"
                    disabled={!editable}
                    data-test-id="field-incoming-number"
                  />
                  <span className="text-[var(--ms-text-muted)] text-xs">
                    {tDetailHeader('from')}
                  </span>
                  <DatePicker
                    value={form.incomingDate || null}
                    onChange={(d) => setForm((s) => s && { ...s, incomingDate: d ?? '' })}
                    locale="ru-RU"
                    disabled={!editable}
                    testId="field-incoming-date"
                  />
                </div>
              </DocumentMetaField>
            </DocumentMetaRow>

            {/* moysklad: [валюта ▾] ✎ 1 USD = N UZS ✎ — the rate sits INLINE (same row as
                the picker), with a ✎ to override the rate for this document. NOT a helper
                below. No fixedWidth cap so the inline rate can extend right. */}
            <DocumentMetaRow>
              <DocumentMetaField label={tDetailForm('currency')} required>
                <div className="flex items-center gap-1">
                  <div className="w-[180px] shrink-0">
                    <NativeSelect
                      value={form.currency}
                      onChange={(e) =>
                        setForm((s) => {
                          if (s) setRateOverride(null);
                          return s && { ...s, currency: e.target.value };
                        })
                      }
                      disabled={!editable}
                      data-test-id="field-currency"
                    >
                      {currencies.length === 0 && (
                        <option value={form.currency}>{form.currency}</option>
                      )}
                      {currencies.map((c) => (
                        <option key={c.id} value={c.isoCode}>
                          {c.name} ({c.isoCode})
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      window.open('/settings/currencies', '_blank', 'noopener,noreferrer')
                    }
                    className="shrink-0 px-1 text-[var(--ms-text-muted)] text-sm hover:text-[var(--ms-text-primary)]"
                    aria-label={tCommon('edit')}
                    data-test-id="currency-settings"
                  >
                    ✎
                  </button>
                  {!isBaseCurrency && selectedCurrency && (
                    <span className="ml-1 inline-flex items-center gap-1 text-[var(--ms-text-muted)] text-xs tabular-nums">
                      <span>1 {form.currency} =</span>
                      {rateEditing ? (
                        <input
                          type="text"
                          inputMode="decimal"
                          value={rateOverride ?? effectiveRate}
                          onChange={(e) => setRateOverride(e.target.value)}
                          onBlur={() => setRateEditing(false)}
                          disabled={!editable}
                          className="h-6 w-24 rounded-[var(--ms-radius-sm)] border border-[var(--ms-border-default)] px-1 text-right text-xs tabular-nums focus:outline-none focus:ring-1 focus:ring-[var(--ms-text-brand)]"
                          data-test-id="rate-input"
                        />
                      ) : (
                        <span className="font-medium">
                          {Number(effectiveRate).toLocaleString('ru-RU')}
                        </span>
                      )}
                      <span>UZS</span>
                      {editable && !rateEditing && (
                        <button
                          type="button"
                          onClick={() => setRateEditing(true)}
                          className="px-0.5 text-[var(--ms-text-muted)] hover:text-[var(--ms-text-primary)]"
                          aria-label={tCommon('edit')}
                          data-test-id="rate-edit"
                        >
                          ✎
                        </button>
                      )}
                      {editable && rateOverride && !rateEditing && (
                        <button
                          type="button"
                          onClick={() => setRateOverride(null)}
                          className="px-0.5 text-[var(--ms-text-muted)] hover:text-[var(--ms-text-primary)]"
                          title={tForm('rate_auto_reset')}
                          data-test-id="rate-reset"
                        >
                          ↺
                        </button>
                      )}
                    </span>
                  )}
                </div>
              </DocumentMetaField>
            </DocumentMetaRow>
          </div>

          <div className="mt-4">
            <DetailContentTabs
              auditEntity="InvoiceIn"
              entityId={data.id}
              relatedGroups={[]}
              positionsLabel={tDetailTabs('main')}
              filesSlot={<AttachmentsSection entity="InvoiceIn" entityId={data.id} />}
              tasksSlot={<DocumentTasksSection entity="InvoiceIn" entityId={data.id} />}
              historyInline={false}
              relatedSlot={
                <RelatedDocsTab
                  current={{
                    id: data.id,
                    name: data.name,
                    moment: data.moment,
                    state: data.state,
                    sumMinor: data.sumMinor,
                    kind: 'invoice-in',
                  }}
                />
              }
            >
              <div>
                <div className="min-w-0">
                  <PositionTable
                    columns={positionColumns}
                    emptyText={tPos('empty')}
                    rows={form.positions}
                    onUpdate={(rowId, patch) =>
                      updatePosition(rowId, patch as Partial<DetailPositionRow>)
                    }
                    onRemove={removePosition}
                    onDuplicate={duplicatePosition}
                    onReorder={reorderPositions}
                    onSortPositions={
                      editable
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
                                        by === 'name'
                                          ? (b.productLabel ?? '')
                                          : (b.productCode ?? ''),
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
                    vatIncluded={form.vatIncluded}
                    selectedIds={selectedRowIds}
                    onSelectionChange={setSelectedRowIds}
                    readOnly={!editable}
                    footerToolbar={
                      editable ? (
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
                                available:
                                  p.stock?.available != null ? Number(p.stock.available) : 0,
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
                                        productUom: raw?.uom ?? null,
                                        quantity: '1',
                                        priceMinor: raw?.buyPrice ?? '0',
                                        discount: '0',
                                        vat: raw?.vat != null ? String(raw.vat) : '12',
                                        vatEnabled: s.vatEnabled,
                                        available: raw?.stock?.available,
                                        stock: raw?.stock?.onHand,
                                        reserve: raw?.stock?.reserved,
                                        salePrices: raw?.salePrices ?? null,
                                      },
                                    ],
                                  }
                                : s,
                            );
                          }}
                          onAddFromCatalog={() => setOpenCatalogPicker(true)}
                          onCheckCompleteness={() => {}}
                          onImportPositions={(rows) => {
                            setForm((s) =>
                              s
                                ? {
                                    ...s,
                                    positions: [
                                      ...s.positions,
                                      ...rows.map(({ item, quantity }) => {
                                        const raw = item.raw as ProductItem | undefined;
                                        return {
                                          id: uid(),
                                          assortmentId: item.id,
                                          productLabel: item.primary,
                                          productCode: raw?.code ?? undefined,
                                          productUom: raw?.uom ?? null,
                                          quantity: Number(quantity) > 0 ? quantity : '1',
                                          priceMinor: raw?.buyPrice ?? '0',
                                          discount: '0',
                                          vat: raw?.vat != null ? String(raw.vat) : '12',
                                          vatEnabled: s.vatEnabled,
                                          available: raw?.stock?.available,
                                          stock: raw?.stock?.onHand,
                                          reserve: raw?.stock?.reserved,
                                          salePrices: raw?.salePrices ?? null,
                                        };
                                      }),
                                    ],
                                  }
                                : s,
                            );
                          }}
                        />
                      ) : undefined
                    }
                  />
                </div>

                <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
                  <div className="min-w-0 max-w-[840px]">
                    <Textarea
                      value={form.description}
                      onChange={(e) => setForm((s) => s && { ...s, description: e.target.value })}
                      placeholder={tFields('description')}
                      aria-label={tFields('description')}
                      rows={2}
                      disabled={!editable}
                      data-test-id="field-description"
                    />
                    {/* moysklad's «Счёт поставщика» editor does NOT surface «Внешний код»
                        (live-checked 2026-06-25: the DOM has a hidden `external-code-link`
                        but it is never displayed). The value is preserved on save (carried
                        in form.externalCode) — set only via import / API, not this form. */}
                  </div>

                  <DetailTotalsSidebar
                    bare
                    subtotalMinor={subtotal.toString()}
                    currency={data.currency}
                    vatMinor={data.vatSumMinor}
                    vatEnabled={form.vatEnabled}
                    vatIncluded={form.vatIncluded}
                    totalMinor={total.toString()}
                    totalQty={totalQty}
                    readOnly={!editable}
                    onToggleVatEnabled={(v) => setForm((s) => s && { ...s, vatEnabled: v })}
                    onToggleVatIncluded={(v) => setForm((s) => s && { ...s, vatIncluded: v })}
                  />
                </div>
              </div>
            </DetailContentTabs>
          </div>

          <div className="mt-4">
            <AttributesEditor
              entity="InvoiceIn"
              values={form.attributes}
              onChange={(next) => setForm((f) => f && { ...f, attributes: next })}
              disabled={!editable}
              testIdPrefix="invoice-in"
            />
          </div>
        </main>
      </div>

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
        open={openCatalogPicker}
        onClose={() => setOpenCatalogPicker(false)}
        title={tDetailForm('add_from_catalog')}
        fetcher={productFetcher}
        onSelect={(item) => {
          const raw = (item as { raw?: ProductItem }).raw;
          const newPos: DetailPositionRow = {
            id: uid(),
            assortmentId: item.id,
            productLabel: String(item.primary),
            productCode: raw?.code ?? undefined,
            productUom: raw?.uom ?? null,
            quantity: '1',
            priceMinor: raw?.buyPrice ?? '0',
            discount: '0',
            vat: raw?.vat != null ? String(raw.vat) : '12',
            vatEnabled: form.vatEnabled,
            available: raw?.stock?.available,
            stock: raw?.stock?.onHand,
            reserve: raw?.stock?.reserved,
            salePrices: raw?.salePrices ?? null,
          };
          setForm((s) => s && { ...s, positions: [...s.positions, newPos] });
        }}
      />

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
            productUom: raw?.uom ?? null,
            priceMinor: raw?.buyPrice ?? '0',
            vat: raw?.vat != null ? String(raw.vat) : '12',
            available: raw?.stock?.available,
            stock: raw?.stock?.onHand,
            reserve: raw?.stock?.reserved,
            salePrices: raw?.salePrices ?? null,
          });
        }}
      />
    </div>
  );
}
