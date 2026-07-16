'use client';

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
import {
  Alert,
  CatalogPicker,
  CatalogPickerField,
  DatePicker,
  type DocPositionRow,
  DocumentHeader,
  DocumentMetaField,
  DocumentMetaRow,
  FormField,
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
  remainingQty: string;
  priceMinor: string;
  discount: string;
  vat: number | null;
  vatEnabled: boolean;
  costMinor: string | null;
  product: { id: string; name: string; code: string | null; uom: string | null } | null;
  gtdNumber: string | null;
  gtdSumMinor: string | null;
  countryId: string | null;
  country: { id: string; name: string; code: string | null } | null;
}

interface SupplyDetail {
  id: string;
  version: number;
  name: string;
  externalCode: string | null;
  state: string;
  applicable: boolean;
  moment: string;
  incomingDate: string | null;
  incomingNumber: string | null;
  postedAt: string | null;
  description: string | null;
  sumMinor: string;
  /** ISO currency of the document (e.g. USD), for money formatting. */
  currency: string;
  vatSumMinor: string;
  costSumMinor: string;
  overheadSumMinor: string;
  overheadDistribution: string;
  vatEnabled: boolean;
  vatIncluded: boolean;
  agent: { id: string; name: string; legalTitle: string | null; companyType: string };
  organization: { id: string; name: string; legalTitle: string | null };
  store: { id: string; name: string };
  owner: { id: string; name: string } | null;
  /** «Владелец-отдел» (department) — resolved by the service (scalar groupId only,
   *  no Prisma relation), null when unset. */
  group: { id: string; name: string } | null;
  /** «Общий доступ» (shared) flag. */
  shared: boolean;
  contract: { id: string; name: string } | null;
  project: { id: string; name: string } | null;
  organizationAccount: { id: string; name: string; accountNumber: string | null } | null;
  agentAccount: { id: string; accountNumber: string } | null;
  positions: PositionDetail[];
  createdAt: string;
  updatedAt: string;
}

interface ProductItem {
  id: string;
  name: string;
  code: string | null;
  uom: string | null;
  /** Buy price in minor units — the receipt line price (NOT salePrices). */
  buyPrice: string | null;
  vat: number | null;
  // moysklad position table shows the product's live stock cluster per row.
  stock?: { onHand: string; reserved: string; inTransit: string; available: string } | null;
  salePrices?: Array<{ priceTypeId: string; value: string }> | null;
}

// Detail-page position row — the PositionTable row shape (keyed on `id`). Mirrors
// PO/[id]'s DetailPositionRow + the supply customs block (gtdNumber/gtdSumMinor/
// countryId/countryLabel) so save round-trips the import columns.
interface DetailPositionRow extends DocPositionRow {
  assortmentId: string | null;
  salePrices?: Array<{ priceTypeId: string; value: string }> | null;
}

function uid(): string {
  return Math.random().toString(36).slice(2);
}

/** ISO moment (UTC) → local `YYYY-MM-DDTHH:MM` — the string <DocumentHeader>
 *  expects (mirrors PO/[id]'s momentToLocalInput so the header reads/writes the
 *  same shape). */
function momentToLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// moysklad parity: inline state dropdown — supply FSM verbs + pill colours.
const SUPPLY_STATE_COLOR: Record<string, string> = {
  draft: '#9ca3af',
  posted: '#16a34a',
  cancelled: '#e92919',
};
const SUPPLY_STATE_VERB: Record<string, string> = {
  draft: 'unpost',
  posted: 'post',
  cancelled: 'cancel',
};
const SUPPLY_MANUAL_STATES = ['draft', 'posted', 'cancelled'] as const;

const OVERHEAD_METHODS = ['WEIGHT', 'PRICE', 'VOLUME', 'QUANTITY'] as const;

// moysklad «Приёмка» position columns. Always-on: name · Кол-во · Остаток · Цена ·
// НДС · Скидка · Сумма. Optional (⚙, default mirrors moysklad supply): image/unit/
// available ON; the import/customs cols (Номер ГТД, Страна) DEFAULT OFF — moysklad
// hides them unless the user enables customs editing.
const OPTIONAL_POSITION_COLUMNS: { key: PositionColumnKey; labelKey: string; on: boolean }[] = [
  { key: 'image', labelKey: 'image', on: true },
  { key: 'unit', labelKey: 'unit', on: true },
  { key: 'available', labelKey: 'available', on: true },
  { key: 'stock', labelKey: 'stock', on: true },
  { key: 'reserve', labelKey: 'reserve', on: false },
  { key: 'weight', labelKey: 'weight', on: false },
  { key: 'volume', labelKey: 'volume', on: false },
  { key: 'vatAmount', labelKey: 'vatAmount', on: false },
  // Import/customs block — editable when toggled on (default OFF, moysklad parity).
  { key: 'gtdNumber', labelKey: 'gtd', on: false },
  { key: 'country', labelKey: 'country', on: false },
];
const DEFAULT_COL_VISIBLE: Record<string, boolean> = Object.fromEntries(
  OPTIONAL_POSITION_COLUMNS.map((c) => [c.key, c.on]),
);

interface FormState {
  /** «от» — editable document moment, as the local `YYYY-MM-DDTHH:MM` string. */
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
  organizationAccountId: string | null;
  organizationAccountLabel: string;
  agentAccountId: string | null;
  agentAccountLabel: string;
  externalCode: string;
  description: string;
  incomingNumber: string;
  incomingDate: string;
  overheadMajor: string;
  overheadDistribution: 'WEIGHT' | 'PRICE' | 'VOLUME' | 'QUANTITY';
  /** «Валюта документа» — moysklad lets you change it while the receipt is a draft. */
  currency: string;
  vatEnabled: boolean;
  vatIncluded: boolean;
  /** «Владелец» / «Владелец-отдел» / «Общий доступ» — editable via the header
   *  owner popover (mirrors PO). Persisted on save while the receipt is a draft. */
  ownerId: string | null;
  ownerLabel: string;
  groupId: string | null;
  groupLabel: string;
  shared: boolean;
  positions: DetailPositionRow[];
  attributes: Record<string, unknown>;
}

/** API ships overheadSumMinor as a tiyin string; '0'/'' → empty input. */
function overheadToMajor(minor: string | null | undefined): string {
  if (!minor || minor === '0') return '';
  return (Number(minor) / 100).toString();
}

function formFromData(d: SupplyDetail): FormState {
  return {
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
    organizationAccountId: d.organizationAccount?.id ?? null,
    // moysklad shows the account NAME («Сум»), not the (often blank) number.
    organizationAccountLabel:
      d.organizationAccount?.name || d.organizationAccount?.accountNumber || '',
    agentAccountId: d.agentAccount?.id ?? null,
    agentAccountLabel: d.agentAccount?.accountNumber ?? '',
    externalCode: d.externalCode ?? '',
    description: d.description ?? '',
    incomingNumber: d.incomingNumber ?? '',
    incomingDate: d.incomingDate ? d.incomingDate.slice(0, 10) : '',
    overheadMajor: overheadToMajor(d.overheadSumMinor),
    overheadDistribution: (OVERHEAD_METHODS as readonly string[]).includes(d.overheadDistribution)
      ? (d.overheadDistribution as FormState['overheadDistribution'])
      : 'WEIGHT',
    currency: d.currency,
    vatEnabled: d.vatEnabled,
    vatIncluded: d.vatIncluded,
    ownerId: d.owner?.id ?? null,
    ownerLabel: d.owner?.name ?? '',
    groupId: d.group?.id ?? null,
    groupLabel: d.group?.name ?? '',
    shared: d.shared ?? false,
    // PositionTable keys on `id` (DocPositionRow.id). Use the persisted position
    // id as the stable React key; carry the customs block so save round-trips it.
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
      gtdNumber: p.gtdNumber ?? '',
      gtdSumMinor: p.gtdSumMinor ?? '',
      countryId: p.countryId ?? null,
      countryLabel: p.country?.name ?? '',
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
    agentAccountId: s.agentAccountId,
    externalCode: s.externalCode,
    description: s.description,
    incomingNumber: s.incomingNumber,
    incomingDate: s.incomingDate,
    overheadMajor: s.overheadMajor,
    overheadDistribution: s.overheadDistribution,
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
      gtdNumber: p.gtdNumber ?? '',
      gtdSumMinor: p.gtdSumMinor ?? '',
      countryId: p.countryId ?? null,
    })),
    attributes: s.attributes,
  });
}

export default function SupplyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const detailNav = useDetailNavigation('supplies', id);
  const docEditorLabels = useDocumentEditorLabels();
  const router = useRouter();
  const qc = useQueryClient();
  const t = useTranslations('pages.supplies');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tDetailHeader = useTranslations('detail_header');
  const tDetailTitles = useTranslations('detail_titles');
  const tDetailForm = useTranslations('detail_form');
  const tStates = useTranslations('states.supply');
  const tCreate = useTranslations('create_related');
  const tDetailTabs = useTranslations('detail_tabs');
  const tForm = useTranslations('form');
  const tPos = useTranslations('position_editor');
  const tCols = useTranslations('position_cols');

  const { data, isLoading } = useQuery<SupplyDetail>({
    queryKey: ['supply', id],
    queryFn: () => api.get(`/supplies/${id}`),
  });

  // moysklad «Связанные документы» — documents linked to this receipt. Fetched for
  // the related-docs tab diagram (source Заказ поставщику + Возвраты поставщику).
  interface RelatedDoc {
    id: string;
    name: string;
    moment: string;
    state: string;
    sumMinor: string;
  }
  const { data: related } = useQuery<{
    purchaseReturns: RelatedDoc[];
    purchaseOrder: RelatedDoc[];
    paymentsOut: RelatedDoc[];
    invoicesIn: RelatedDoc[];
  }>({
    queryKey: ['supply-related', id],
    queryFn: () => api.get(`/supplies/${id}/related`),
  });

  // Price types for the «Цена ▾» → «Расценить» (re-price by type) menu.
  const { data: priceTypesData } = useQuery<{ items: Array<{ id: string; name: string }> }>({
    queryKey: ['price-types'],
    queryFn: () => api.get('/price-types'),
    staleTime: 60_000,
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
    | 'organizationAccount'
    | 'agentAccount'
  >(null);
  const [openCatalogPicker, setOpenCatalogPicker] = useState(false);
  const [productRowId, setProductRowId] = useState<string | null>(null);
  const [countryRowId, setCountryRowId] = useState<string | null>(null);
  const [colVisible, setColVisible] = useState<Record<string, boolean>>(DEFAULT_COL_VISIBLE);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const onConflict = useConflictReload(['supply', id], () => setForm(null));

  useEffect(() => {
    if (data && !form) {
      const initial = formFromData(data);
      setForm(initial);
      setOriginal(snapshot(initial));
    }
  }, [data, form]);

  const isDirty = useMemo(() => (form ? snapshot(form) !== original : false), [form, original]);
  useUnsavedGuard(isDirty);

  // ── Position table callbacks (mirror PO/[id]) — all mutate form.positions ──
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
  // «Расценить» — re-price every row by the chosen price-type (from each product's
  // carried salePrices). Loaded rows have no salePrices until the product is
  // re-picked, so they keep their current price (same limitation as PO/[id]).
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
  // «Сохранить цены» — push each line's price back onto its product. On a receipt
  // the line price is the BUY price, so save to Product.buyPrice (mirror PO/[id]).
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
        // skip products that can't be updated (e.g. concurrent edit); others proceed
      }
    }
  }, [form]);
  // «Скидка ▾» → «Скидка/наценка» — a discount % sets each line's `discount`; a
  // markup % raises the unit price. Targets selected rows, or ALL when none selected.
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
    mutationFn: (target: string) => api.post(`/supplies/${id}/transitions/${target}`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supply', id] });
      qc.invalidateQueries({ queryKey: ['supplies'] });
    },
  });

  const deleteMut = useApiMutation({
    mutationFn: () => api.delete(`/supplies/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supplies'] });
      router.push('/supplies');
    },
  });

  const cloneMut = useApiMutation({
    mutationFn: () => api.post<{ id: string }>(`/supplies/${id}/clone`, {}),
    onSuccess: (clone) => {
      qc.invalidateQueries({ queryKey: ['supplies'] });
      router.push(`/supplies/${clone.id}`);
    },
  });

  const { runDestructive } = useDestructiveMutation();

  const saveMut = useSaveMutation({
    mutationFn: async () => {
      if (!form || !data) throw new Error('Form not ready');
      const payload: Record<string, unknown> = {
        // Optimistic-lock — the version the form loaded (from the server query).
        version: data.version,
        description: form.description || null,
        incomingNumber: form.incomingNumber || null,
        incomingDate: form.incomingDate || null,
        vatEnabled: form.vatEnabled,
        vatIncluded: form.vatIncluded,
        // moysklad parity — Договор / Проект are document metadata.
        contractId: form.contractId,
        projectId: form.projectId,
        // Keep org-/agent-account in the payload so the data isn't lost even
        // though moysklad's supply form omits them as visible fields.
        organizationAccountId: form.organizationAccountId,
        agentAccountId: form.agentAccountId,
        externalCode: form.externalCode || null,
        // «Накладные расходы» — tiyin; '' → 0 (no-op at post). Distribution
        // only matters when a positive overhead is set.
        overheadSumMinor:
          Number(form.overheadMajor) > 0
            ? String(BigInt(Math.round(Number(form.overheadMajor) * 100)))
            : '0',
        overheadDistribution: form.overheadDistribution,
        // «Владелец» / «Владелец-отдел» / «Общий доступ» — metadata, editable on a
        // draft (the backend rejects ANY edit on a posted supply before applying).
        ownerId: form.ownerId,
        groupId: form.groupId,
        shared: form.shared,
      };
      if (!data.applicable) {
        if (form.moment) payload.moment = new Date(form.moment).toISOString();
        payload.agentId = form.agentId;
        payload.organizationId = form.organizationId;
        payload.storeId = form.storeId;
        // moysklad allows changing the document currency only while the receipt is
        // a draft (backend persists it — supply.service.ts update()).
        payload.currency = form.currency;
        payload.positions = form.positions.map((p) => ({
          assortmentKind: 'product',
          // biome-ignore lint/style/noNonNullAssertion: a product is always picked before save
          assortmentId: p.assortmentId!,
          // Pass quantity/discount as raw strings (backend z.coerce.string()) — a
          // Number() round-trip loses precision and diverges from /new.
          quantity: p.quantity,
          priceMinor: p.priceMinor,
          discount: p.discount || '0',
          vat: p.vat ? Number(p.vat) : undefined,
          vatEnabled: p.vatEnabled,
          // Customs block — round-trip the import columns (preserved from current page).
          gtdNumber: p.gtdNumber || undefined,
          gtdSumMinor: p.gtdSumMinor || undefined,
          countryId: p.countryId || undefined,
        }));
      }
      payload.attributes = form.attributes;
      return api.patch(`/supplies/${id}`, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supply', id] });
      qc.invalidateQueries({ queryKey: ['supplies'] });
      if (form) setOriginal(snapshot(form));
    },
    // useSaveMutation toasts non-conflict failures; the 409 routes to onConflict.
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
    // moysklad scopes «Договор» to the receipt's counterparty.
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
  const countryFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: Array<{ id: string; name: string; code: string | null }> }>(
      `/countries?search=${encodeURIComponent(s)}&limit=100`,
    );
    return d.items.map((c) => ({ id: c.id, primary: c.name, secondary: c.code ?? undefined }));
  };
  const organizationAccountFetcher = async (s: string): Promise<PickerItem[]> => {
    // moysklad scopes «Счёт организации» to the chosen organization.
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
  // moysklad parity — counterparty bank accounts have no flat list endpoint;
  // the only route is the nested /counterparties/:id/bank-accounts.
  const agentAccountFetcher = async (s: string): Promise<PickerItem[]> => {
    if (!form?.agentId) return [];
    const d = await api.get<Array<{ id: string; accountNumber: string; bankName: string | null }>>(
      `/counterparties/${form.agentId}/bank-accounts`,
    );
    const q = s.trim().toLowerCase();
    return d
      .filter(
        (x) =>
          !q ||
          x.accountNumber.toLowerCase().includes(q) ||
          (x.bankName ?? '').toLowerCase().includes(q),
      )
      .map((x) => ({ id: x.id, primary: x.accountNumber, secondary: x.bankName ?? undefined }));
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

  // moysklad position table columns (fixed + optional, customizer + price/discount
  // menus). Mirrors PO/[id]'s positionColumns; menus disabled when posted.
  const editableCols = !data?.applicable;
  const positionColumns = useMemo<PositionTableColumnConfig[]>(() => {
    // moysklad has NO «#» row-number column — the select checkbox sits beside «Наименование».
    const cols: PositionTableColumnConfig[] = [{ key: 'dragarea' }, { key: 'select' }];
    if (colVisible.image) cols.push({ key: 'image' });
    cols.push({ key: 'name', label: tCols('name') });
    cols.push({ key: 'quantity', label: tPos('quantity') });
    if (colVisible.unit) cols.push({ key: 'unit', label: tCols('unit') });
    if (colVisible.stock) cols.push({ key: 'stock', label: tCols('stock') });
    if (colVisible.reserve) cols.push({ key: 'reserve', label: tCols('reserve') });
    if (colVisible.available) cols.push({ key: 'available', label: tCols('available') });
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
    cols.push({
      key: 'discount',
      label: editableCols ? (
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
    // moysklad «Приёмка» import/customs columns — editable when toggled on (⚙).
    if (colVisible.gtdNumber) cols.push({ key: 'gtdNumber', label: tCols('gtd') });
    if (colVisible.country) cols.push({ key: 'country', label: tCols('country') });
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
    editableCols,
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

  const editableLines = !data.applicable;
  const sumBig = BigInt(data.sumMinor || '0');
  const vatBig = BigInt(data.vatSumMinor || '0');
  const { subtotal, total } = docTotals(sumBig, vatBig);
  const totalQty = form.positions.reduce((acc, p) => acc + Number(p.quantity || 0), 0);

  const canCreateReturn = data.state === 'posted';

  // moysklad «Создать документ» for a Приёмка lists 7 downstream docs in this
  // order (live capture supplies/detail/edit-dropdown-sozdat). Two are wired
  // (Исходящий платёж, Возврат поставщику — their from-supply routes exist); the
  // other five are disabled label-parity placeholders pending backend, same
  // convention as the demand page.
  const createMenuItems: CreateMenuItem[] = [
    { id: 'invoice-in', label: tDetailTitles('invoice_in'), disabled: true },
    { id: 'facture-in', label: tCreate('facture_in'), disabled: true },
    {
      id: 'payment-out',
      label: tDetailTitles('payment_out'),
      onSelect: () => router.push(`/payments-out/new?fromSupply=${data.id}`),
    },
    { id: 'cash-out', label: tDetailTitles('cash_out'), disabled: true },
    {
      id: 'purchase-return',
      label: tDetailTitles('purchase_return'),
      onSelect: canCreateReturn
        ? () => router.push(`/purchase-returns/new?fromSupply=${data.id}`)
        : undefined,
      disabled: !canCreateReturn,
    },
    { id: 'demand', label: tDetailTitles('demand'), disabled: true },
    { id: 'move', label: tDetailTitles('move'), disabled: true },
  ];

  // moysklad «Статус» pill — supply has no account-defined custom statuses, so the
  // dropdown drives the FSM directly via the 3 verbs. The pill always DISPLAYS the
  // real current state. «Проведено» stays separate (no «Ожидание» on a receipt).
  const stateOptionSlugs = (SUPPLY_MANUAL_STATES as readonly string[]).includes(data.state)
    ? [...SUPPLY_MANUAL_STATES]
    : [data.state, ...SUPPLY_MANUAL_STATES];
  const statusOptions = stateOptionSlugs.map((slug) => ({
    value: slug,
    label: tStates(slug as 'draft' | 'posted' | 'cancelled'),
    color: SUPPLY_STATE_COLOR[slug],
  }));
  const onApplicableChange =
    data.state === 'cancelled'
      ? undefined
      : (next: boolean) => transitionMut.mutate(next ? 'post' : 'unpost');

  // Position «Наименование» cell — opens the per-row product picker (reusing
  // productFetcher). Read-only on a posted receipt. Mirrors PO/[id].
  const renderPositionNameCell = (row: DocPositionRow) => {
    const p = row as DetailPositionRow;
    return (
      <CatalogPickerField
        value={p.assortmentId ? { id: p.assortmentId, label: p.productLabel } : null}
        placeholder={tForm('select_product')}
        onPick={() => editableLines && setProductRowId(p.id)}
        onClear={() =>
          editableLines &&
          updatePosition(p.id, { assortmentId: null, productLabel: '', productUom: null })
        }
        disabled={!editableLines}
      />
    );
  };

  // Position «Страна» cell — opens the per-row country picker.
  const renderPositionCountryCell = (row: DocPositionRow) => (
    <CatalogPickerField
      value={row.countryId ? { id: row.countryId, label: row.countryLabel ?? '' } : null}
      placeholder={tFields('country')}
      onPick={() => editableLines && setCountryRowId(row.id)}
      onClear={() => editableLines && updatePosition(row.id, { countryId: null, countryLabel: '' })}
      disabled={!editableLines}
    />
  );

  return (
    <div
      className="flex min-h-screen flex-col bg-[var(--ms-bg-page)]"
      data-test-id="supply-detail-page"
    >
      <DetailToolbar
        isDirty={isDirty}
        isSaving={saveMut.isPending}
        onSave={() => saveMut.mutate()}
        onClose={() => router.push('/supplies')}
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
        onPrintList={() =>
          window.open(`/print/supply/${data.id}?auto=1`, '_blank', 'width=820,height=1100')
        }
        printEntity="supply"
      />

      {/* Editable shared <DocumentHeader> (mirrors PO/[id]), rendered standalone
          below the toolbar. № is auto-assigned (no editable name field) so it stays
          read-only; date is editable on a draft. «Проведено» drives the server-side
          FSM via the transition mutation. The owner popover sits top-right (editable
          while the receipt is a draft). */}
      <DocumentHeader
        {...docEditorLabels}
        documentTypeLabel={tDetailTitles('supply')}
        number={data.name}
        date={form.moment}
        onDateChange={editableLines ? (v) => setForm((f) => f && { ...f, moment: v }) : undefined}
        status={data.state}
        statusOptions={statusOptions}
        onStatusChange={
          editableLines
            ? (slug) => {
                const verb = SUPPLY_STATE_VERB[slug];
                if (verb) transitionMut.mutate(verb);
              }
            : undefined
        }
        applicable={data.applicable}
        onApplicableChange={onApplicableChange}
        applicableHelp={t('applicable_help')}
        rightSlot={
          // moysklad top-right cluster: «Владелец» (owner) + «Изменения» (history)
          // link. «Владелец» is editable while the receipt is a draft (the backend
          // rejects edits on a posted supply); on a posted one it's a read-only label.
          <div className="flex items-start gap-4">
            {editableLines ? (
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
            <DocumentHistoryLink auditEntity="Supply" entityId={data.id} />
          </div>
        }
      />

      <main className="flex-1 px-4 py-4">
        {/* Errors surface as toasts (save / transition / create mutations all
            auto-toast); the optimistic-lock 409 is handled by onConflict. Only the
            posted-lock notice stays as an inline banner. */}
        {data.applicable && (
          <Alert tone="info" className="mb-3">
            {tCommon('locked_when_posted')}
          </Alert>
        )}

        {/* moysklad b-operation-form-top — 2-column meta grid (supply-detail-live-
            2026-06-24/01b-meta-clip): Организация(+«Сум» account subrow)‖Склад ·
            Контрагент(+Баланс)‖Договор · Проект‖Входящий номер+от+дата · Валюта‖∅.
            Mirrors PO/[id]'s metaPanel; posted receipts stay read-only. */}
        <div className="max-w-[860px] space-y-2 bg-[var(--ms-bg-surface)] px-4 py-3">
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
                          s && { ...s, organizationAccountId: null, organizationAccountLabel: '' },
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
                        // Changing the org invalidates its scoped account.
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
                        organizationAccountId: null,
                        organizationAccountLabel: '',
                      },
                  )
                }
                disabled={!editableLines}
                testId="field-organization"
              />
            </DocumentMetaField>
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
          </DocumentMetaRow>

          <DocumentMetaRow fixedWidth>
            <DocumentMetaField label={tFields('agent')} required>
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
                        // Changing the agent invalidates its contract + account.
                        contractId: null,
                        contractLabel: '',
                        agentAccountId: null,
                        agentAccountLabel: '',
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
                        agentAccountId: null,
                        agentAccountLabel: '',
                      },
                  )
                }
                onCreate={editableLines ? () => router.push('/counterparties/new') : undefined}
                createLabel={tForm('create_new_counterparty')}
                disabled={!editableLines}
                testId="field-agent"
              />
              <CounterpartyBalanceInline counterpartyId={form.agentId || null} />
            </DocumentMetaField>
            <DocumentMetaField label={tFields('contract')}>
              <CatalogPickerField
                value={form.contractId ? { id: form.contractId, label: form.contractLabel } : null}
                placeholder={tFields('contract')}
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
                disabled={!editableLines || !form.agentId}
                testId="field-contract"
              />
            </DocumentMetaField>
          </DocumentMetaRow>

          <DocumentMetaRow fixedWidth>
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
            <DocumentMetaField label={tFields('incoming_number')}>
              {/* moysklad «Входящий номер» + «от» «Входящая дата» together in one
                  field (supplier's document number + its date). */}
              <div className="flex items-center gap-2">
                <Input
                  value={form.incomingNumber}
                  onChange={(e) => setForm((s) => s && { ...s, incomingNumber: e.target.value })}
                  disabled={!editableLines}
                  className="min-w-0 flex-1"
                  data-test-id="field-incoming-number"
                />
                <span className="shrink-0 text-[var(--ms-text-muted)] text-xs">
                  {tDetailHeader('from')}
                </span>
                <div className="shrink-0">
                  <DatePicker
                    value={form.incomingDate || null}
                    onChange={(d) => setForm((s) => s && { ...s, incomingDate: d ?? '' })}
                    locale="ru-RU"
                    disabled={!editableLines}
                    testId="field-incoming-date"
                  />
                </div>
              </div>
            </DocumentMetaField>
          </DocumentMetaRow>

          <DocumentMetaRow fixedWidth>
            <DocumentMetaField label={tDetailForm('currency')} required>
              <NativeSelect
                value={form.currency}
                onChange={(e) => setForm((s) => s && { ...s, currency: e.target.value })}
                disabled={!editableLines}
                data-test-id="field-currency"
              >
                <option value="UZS">{tForm('currency_uzs')}</option>
                <option value="USD">{tForm('currency_usd')}</option>
                <option value="EUR">{tForm('currency_eur')}</option>
                <option value="RUB">{tForm('currency_rub')}</option>
              </NativeSelect>
            </DocumentMetaField>
          </DocumentMetaRow>
        </div>

        <div className="mt-4">
          <DetailContentTabs
            auditEntity="Supply"
            entityId={data.id}
            relatedGroups={[]}
            positionsLabel={tDetailTabs('main')}
            filesSlot={<AttachmentsSection entity="Supply" entityId={data.id} />}
            tasksSlot={<DocumentTasksSection entity="Supply" entityId={data.id} />}
            historyInline={false}
            relatedSlot={
              <RelatedDocsTab
                current={{
                  id: data.id,
                  name: data.name,
                  moment: data.moment,
                  state: data.state,
                  sumMinor: data.sumMinor,
                  kind: 'supply',
                }}
                linked={[
                  ...(related?.purchaseOrder ?? []).map((d) => ({
                    ...d,
                    kind: 'purchase-order' as const,
                  })),
                  ...(related?.purchaseReturns ?? []).map((d) => ({
                    ...d,
                    kind: 'purchase-return' as const,
                  })),
                  ...(related?.paymentsOut ?? []).map((d) => ({
                    ...d,
                    kind: 'payment-out' as const,
                  })),
                  ...(related?.invoicesIn ?? []).map((d) => ({
                    ...d,
                    kind: 'invoice-in' as const,
                  })),
                ]}
              />
            }
          >
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="min-w-0">
                {/* moysklad position table = full column set + ⚙ customizer + «Цена ▾»
                    / «Скидка ▾» menus + inline «Добавить позицию» search bar. Posted
                    receipts are read-only (table, inline-add, customizer all disabled). */}
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
                  renderCountryCell={renderPositionCountryCell}
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
                                      vat: raw?.vat != null ? String(raw.vat) : '0',
                                      vatEnabled: s.vatEnabled,
                                      stock: raw?.stock?.onHand,
                                      reserve: raw?.stock?.reserved,
                                      available: raw?.stock?.available,
                                      gtdNumber: '',
                                      gtdSumMinor: '',
                                      countryId: null,
                                      countryLabel: '',
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
                            return;
                          }
                        }}
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
                                        vat: raw?.vat != null ? String(raw.vat) : '0',
                                        vatEnabled: s.vatEnabled,
                                        stock: raw?.stock?.onHand,
                                        reserve: raw?.stock?.reserved,
                                        available: raw?.stock?.available,
                                        gtdNumber: '',
                                        gtdSumMinor: '',
                                        countryId: null,
                                        countryLabel: '',
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

                {/* «Накладные расходы» + «Распределять по» — supply-specific cost
                    block (preserved from the prior page; moved below the positions
                    per moysklad's layout). */}
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <FormField id="overhead-sum" label={tDetailForm('overhead_sum')}>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={form.overheadMajor}
                      placeholder="0"
                      onChange={(e) => setForm((s) => s && { ...s, overheadMajor: e.target.value })}
                      disabled={!editableLines}
                      data-test-id="field-overhead-sum"
                    />
                  </FormField>
                  <FormField
                    id="overhead-distribution"
                    label={tDetailForm('overhead_distribution')}
                  >
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
                      disabled={!editableLines || !(Number(form.overheadMajor) > 0)}
                      data-test-id="field-overhead-distribution"
                    >
                      <option value="WEIGHT">{tDetailForm('overhead_by_weight')}</option>
                      <option value="PRICE">{tDetailForm('overhead_by_price')}</option>
                      <option value="VOLUME">{tDetailForm('overhead_by_volume')}</option>
                      <option value="QUANTITY">{tDetailForm('overhead_by_quantity')}</option>
                    </NativeSelect>
                  </FormField>
                </div>

                {/* «Комментарий» + «Внешний код» — moysklad places them below the
                    positions (mirror PO/[id]). */}
                <div className="mt-3">
                  <Textarea
                    value={form.description}
                    onChange={(e) => setForm((s) => s && { ...s, description: e.target.value })}
                    placeholder={tFields('description')}
                    aria-label={tFields('description')}
                    rows={2}
                    disabled={!editableLines}
                    data-test-id="field-description"
                  />
                </div>
                <div className="mt-3">
                  <FormField id="external-code" label={tDetailForm('external_code')}>
                    <Input
                      value={form.externalCode}
                      onChange={(e) => setForm((s) => s && { ...s, externalCode: e.target.value })}
                      disabled={!editableLines}
                      maxLength={50}
                      data-test-id="field-external-code"
                    />
                  </FormField>
                </div>
              </div>

              <DetailTotalsSidebar
                subtotalMinor={subtotal.toString()}
                currency={data.currency}
                vatMinor={data.vatSumMinor}
                vatEnabled={form.vatEnabled}
                vatIncluded={form.vatIncluded}
                totalMinor={total.toString()}
                totalQty={totalQty}
                readOnly={!editableLines}
                onToggleVatEnabled={(v) => setForm((s) => s && { ...s, vatEnabled: v })}
                onToggleVatIncluded={(v) => setForm((s) => s && { ...s, vatIncluded: v })}
              />
            </div>
          </DetailContentTabs>
        </div>

        <div className="mt-4">
          <AttributesEditor
            entity="Supply"
            values={form.attributes}
            onChange={(next) => setForm((f) => f && { ...f, attributes: next })}
            disabled={!editableLines}
            testIdPrefix="supply"
          />
        </div>
        {/* Задачи / Файлы / Изменения now render as inline bottom sections INSIDE
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
        open={openPicker === 'agentAccount'}
        onClose={() => setOpenPicker(null)}
        title={tFields('agent_account')}
        fetcher={agentAccountFetcher}
        onSelect={(item) =>
          setForm(
            (s) => s && { ...s, agentAccountId: item.id, agentAccountLabel: String(item.primary) },
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
            vat: raw?.vat != null ? String(raw.vat) : '0',
            vatEnabled: form.vatEnabled,
            stock: raw?.stock?.onHand,
            reserve: raw?.stock?.reserved,
            available: raw?.stock?.available,
            gtdNumber: '',
            gtdSumMinor: '',
            countryId: null,
            countryLabel: '',
            salePrices: raw?.salePrices ?? null,
          };
          setForm((s) => s && { ...s, positions: [...s.positions, newPos] });
        }}
      />

      {/* Per-row product picker for the position «Наименование» cell. */}
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
            vat: raw?.vat != null ? String(raw.vat) : '0',
            stock: raw?.stock?.onHand,
            reserve: raw?.stock?.reserved,
            available: raw?.stock?.available,
            salePrices: raw?.salePrices ?? null,
          });
        }}
      />

      {/* Per-row country picker for the position «Страна» (customs) cell. */}
      <CatalogPicker
        open={countryRowId !== null}
        onClose={() => setCountryRowId(null)}
        title={tFields('country')}
        fetcher={countryFetcher}
        onSelect={(item) => {
          if (!countryRowId) return;
          updatePosition(countryRowId, {
            countryId: item.id,
            countryLabel: String(item.primary),
          });
        }}
      />
    </div>
  );
}
