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
import { PresenceIndicator } from '@/components/documents/presence-indicator';
import { usePrintTemplatesManager } from '@/components/print/print-templates-provider';
import { type KitPrintForm, KitPrintModal } from '@/components/purchase-orders/kit-print-modal';
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
  receivedQty: string | number | null;
  priceMinor: string;
  discount: string;
  vat: number | null;
  vatEnabled: boolean;
  product: { id: string; name: string; code: string | null; uom: string | null } | null;
}

interface OrderDetail {
  id: string;
  version: number;
  name: string;
  externalCode: string | null;
  state: string;
  applicable: boolean;
  /** moysklad «Статус» — resolved account-defined custom status (null = grey pill). */
  status: { id: string; name: string; color: string | null } | null;
  moment: string;
  deliveryPlannedMoment: string | null;
  postedAt: string | null;
  description: string | null;
  sumMinor: string;
  vatSumMinor: string;
  payedSumMinor: string;
  invoicedSumMinor: string;
  receivedSumMinor: string;
  vatEnabled: boolean;
  vatIncluded: boolean;
  /** Document currency code (UZS / USD / EUR / RUB) — moysklad's «Валюта документа». */
  currency: string;
  /** «Ожидание» — persisted awaiting-receipt flag (settable at creation + via bulk action). */
  waiting: boolean;
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
  positions: PositionDetail[];
  createdAt: string;
  updatedAt: string;
}

interface ProductItem {
  id: string;
  name: string;
  code: string | null;
  uom: string | null;
  /** Buy price in minor units — the PO line price (NOT salePrices). */
  buyPrice: string | null;
  vat: number | null;
  // moysklad position table shows the product's live stock cluster per row.
  stock?: { onHand: string; reserved: string; inTransit: string; available: string } | null;
  salePrices?: Array<{ priceTypeId: string; value: string }> | null;
}

// Detail-page position row — the PositionTable row shape (keyed on `id`). Mirrors
// /new's NewPositionRow + CO/[id]'s DetailPositionRow: carries assortmentId + the
// product's sale-price list so «Расценить» can re-price without a re-fetch.
interface DetailPositionRow extends DocPositionRow {
  assortmentId: string | null;
  salePrices?: Array<{ priceTypeId: string; value: string }> | null;
}

function uid(): string {
  return Math.random().toString(36).slice(2);
}

/** ISO moment (UTC) → local `YYYY-MM-DDTHH:MM` — the string <DocumentHeader>
 *  expects (mirrors /new's docDate initialiser so the header reads/writes the
 *  same shape). */
function momentToLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// moysklad «Статус» on a Заказ поставщику is the ACCOUNT-DEFINED custom status
// (a State row, entityType="purchaseorder"), NOT the internal FSM `state`. The
// pill lists those statuses and shows a grey «Статус» until the admin creates
// some (user 2026-06-24: «status admin tomonidan qo'shiladi … agarda statusni
// o'zi tursa demak qo'shilmagan»). The FSM `state` (draft→confirmed→received…)
// stays internal — it's driven by «Проведено» + receipts, not a user pill.

// moysklad «Заказ поставщику» position columns — DEFAULT-visible per the live ⚙
// customizer (po-new-live-groundtruth-2026-06-20): Изображение · Единица измерения ·
// Принято · Доступно ON; Остаток · Резерв · Ожидание · Вес · Объём · Сумма НДС OFF.
// `shipped` = moysklad «Принято» (received qty) on inbound docs. Mirrors /new.
const OPTIONAL_POSITION_COLUMNS: { key: PositionColumnKey; labelKey: string; on: boolean }[] = [
  { key: 'image', labelKey: 'image', on: true },
  { key: 'unit', labelKey: 'unit', on: true },
  { key: 'shipped', labelKey: 'received', on: true },
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

// Account currency (Настройки → Валюты). `isoCode` = UZS/USD…, `default` = base,
// `rate` = value vs the base currency (drives the «1 USD = N UZS» rate helper).
interface CurrencyItem {
  id: string;
  isoCode: string;
  name: string;
  default: boolean;
  rateValue: string;
  rate: string;
}

interface FormState {
  /** Editable document «№». Blank is rejected by the backend (autogen on create),
   *  so only a non-empty change is persisted. */
  name: string;
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
  externalCode: string;
  description: string;
  deliveryPlannedMoment: string;
  /** «Валюта документа» — moysklad lets you change it while the order is a draft. */
  currency: string;
  /** «Ожидание» — manual awaiting flag. */
  waiting: boolean;
  vatEnabled: boolean;
  vatIncluded: boolean;
  /** «Владелец» / «Владелец-отдел» / «Общий доступ» — editable via the header
   *  owner popover (mirrors /new). Persisted on save while the order is a draft. */
  ownerId: string | null;
  ownerLabel: string;
  groupId: string | null;
  groupLabel: string;
  shared: boolean;
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
    organizationAccountId: d.organizationAccount?.id ?? null,
    // moysklad shows the account NAME («Сум»), not the (often blank) number.
    organizationAccountLabel:
      d.organizationAccount?.name || d.organizationAccount?.accountNumber || '',
    externalCode: d.externalCode ?? '',
    description: d.description ?? '',
    deliveryPlannedMoment: d.deliveryPlannedMoment ? d.deliveryPlannedMoment.slice(0, 10) : '',
    currency: d.currency,
    waiting: d.waiting,
    vatEnabled: d.vatEnabled,
    vatIncluded: d.vatIncluded,
    ownerId: d.owner?.id ?? null,
    ownerLabel: d.owner?.name ?? '',
    groupId: d.group?.id ?? null,
    groupLabel: d.group?.name ?? '',
    shared: d.shared ?? false,
    // PositionTable keys on `id` (DocPositionRow.id). Use the persisted position
    // id as the stable React key; map receivedQty → «Принято» (read-only `shipped`).
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
      shipped: p.receivedQty != null ? String(p.receivedQty) : '0',
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
    deliveryPlannedMoment: s.deliveryPlannedMoment,
    currency: s.currency,
    waiting: s.waiting,
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

export default function PurchaseOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  // moysklad «N из ВСЕГО ‹ ›» — server-backed so the toolbar shows the REAL total
  // and the arrows walk the whole ordered set even on a direct-URL visit (no list
  // cache). Backed by GET /purchase-orders/:id/position. Mirrors customer-orders.
  const detailNav = useDetailNavigation('purchase-orders', id, { server: true });
  const docEditorLabels = useDocumentEditorLabels();
  const router = useRouter();
  const qc = useQueryClient();
  const t = useTranslations('pages.purchase_orders');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tDetailTitles = useTranslations('detail_titles');
  const tDetailHeader = useTranslations('detail_header');
  const tDetailForm = useTranslations('detail_form');
  const tDetailTabs = useTranslations('detail_tabs');
  const tForm = useTranslations('form');
  const tPos = useTranslations('position_editor');
  const tCols = useTranslations('position_cols');
  const tEmail = useTranslations('email_template');
  const tPrint = useTranslations('print_menu');
  const { toast } = useToast();

  const { data, isLoading } = useQuery<OrderDetail>({
    queryKey: ['purchase-order', id],
    queryFn: () => api.get(`/purchase-orders/${id}`),
  });

  // moysklad «Смотрит» — OTHER employees currently viewing THIS saved order
  // (heartbeat presence). Empty (indicator hidden) when you're the only viewer.
  const presenceViewers = usePresence('PurchaseOrder', id);

  // moysklad keeps a POSTED («Проведено») order fully editable — posting a PO is
  // a flag flip (no stock). We lock only a cancelled order, or one that already
  // has Приёмки (`receivedSumMinor>0`): positions are delete+recreated on save and
  // SupplyPosition links to the position id + per-position receivedQty, so editing
  // a partly-received order would orphan that tracking (separate task).
  const editable = !!data && data.state !== 'cancelled' && Number(data.receivedSumMinor) === 0;

  // moysklad «Связанные документы» — documents created from this PO. Fetched for
  // the related-docs tab diagram (Приёмки / Счета поставщиков / Платежи / Возвраты).
  interface RelatedDoc {
    id: string;
    name: string;
    moment: string;
    state: string;
    sumMinor: string;
  }
  const { data: related } = useQuery<{
    supplies: RelatedDoc[];
    invoicesIn: RelatedDoc[];
    paymentsOut: RelatedDoc[];
    purchaseReturns: RelatedDoc[];
  }>({
    queryKey: ['purchase-order-related', id],
    queryFn: () => api.get(`/purchase-orders/${id}/related`),
  });

  // Price types for the «Цена ▾» → «Расценить» (re-price by type) menu.
  const { data: priceTypesData } = useQuery<{ items: Array<{ id: string; name: string }> }>({
    queryKey: ['price-types'],
    queryFn: () => api.get('/price-types'),
    staleTime: 60_000,
  });

  // moysklad «Статус» — the account's custom statuses for purchase orders. When
  // none are defined the pill stays a grey «Статус» (no FSM fallback — that's
  // the «Проведено» flag's job); the admin adds them via «Настроить...» →
  // /settings/purchase-order-statuses. /states returns {items, nextCursor}.
  const { data: statusData } = useQuery<{
    items: Array<{ id: string; name: string; color: string | null }>;
  }>({
    queryKey: ['states', 'purchaseorder'],
    queryFn: () => api.get('/states?entityType=purchaseorder'),
    staleTime: 60_000,
  });
  const customStatuses = statusData?.items ?? [];

  // moysklad-parity: the account's own «Заказ поставщику» print forms, listed by
  // name in the «Печать» menu (doc-scoped purchaseorder:view, NOT settings). Empty
  // for accounts with no custom templates → menu shows only the standard form.
  const { data: printForms } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ['purchase-order-print-forms'],
    queryFn: () => api.get<Array<{ id: string; name: string }>>('/purchase-orders/print-forms'),
    staleTime: 60_000,
  });
  const { openTemplates } = usePrintTemplatesManager();

  // «Валюта документа» options + rates — the account's REAL currencies (GET
  // /currencies, Настройки → Валюты), NEVER a hardcoded list (mirror enters/[id]).
  // `default` = base (UZS), `rate` = value vs base → drives the «1 USD = N UZS» helper.
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
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailAttachments, setEmailAttachments] = useState<{ id: string; filename: string }[]>([]);
  const [kitPrintOpen, setKitPrintOpen] = useState(false);
  const onConflict = useConflictReload(['purchase-order', id], () => setForm(null));

  useEffect(() => {
    if (data && !form) {
      const initial = formFromData(data);
      setForm(initial);
      setOriginal(snapshot(initial));
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
  // «Расценить» — re-price every row by the chosen price-type (from each product's
  // carried salePrices). Loaded rows have no salePrices until the product is
  // re-picked, so they keep their current price (same limitation as CO/[id]).
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
  // «Сохранить цены» — push each line's price back onto its product. On a PURCHASE
  // order the line price is the BUY price, so save to Product.buyPrice (mirror /new).
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
    mutationFn: (target: string) => api.post(`/purchase-orders/${id}/transitions/${target}`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-order', id] });
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
    },
  });

  // moysklad «Статус» — assign the custom status IMMEDIATELY (own endpoint, not
  // the form save) so it works even on a posted order (status is orthogonal to
  // «Проведено»; the backend setStatus skips the applicable guard). Mirrors
  // moysklad applying the status the moment you pick it.
  const setStatusMut = useApiMutation({
    mutationFn: (statusId: string) => api.patch(`/purchase-orders/${id}/status`, { statusId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-order', id] });
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
    },
  });

  const deleteMut = useApiMutation({
    mutationFn: () => api.delete(`/purchase-orders/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      router.push('/purchase-orders');
    },
  });

  const cloneMut = useApiMutation({
    mutationFn: () => api.post<{ id: string }>(`/purchase-orders/${id}/clone`, {}),
    onSuccess: (clone) => {
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      router.push(`/purchase-orders/${clone.id}`);
    },
  });

  const { runDestructive } = useDestructiveMutation();

  const createInvoiceMut = useApiMutation({
    mutationFn: () => api.post<{ id: string }>(`/invoices-in/from-purchase-order/${id}`, {}),
    onSuccess: (invoice) => {
      qc.invalidateQueries({ queryKey: ['purchase-order', id] });
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      router.push(`/invoices-in/${invoice.id}`);
    },
  });

  const createAdvanceMut = useApiMutation({
    mutationFn: () => {
      if (!data) throw new Error(tCommon('loading'));
      const remaining = (BigInt(data.sumMinor) - BigInt(data.payedSumMinor)).toString();
      return api.post<{ id: string }>(`/payments-out/from-purchase-order/${id}`, {
        sumMinor: remaining,
      });
    },
    onSuccess: (payment) => {
      qc.invalidateQueries({ queryKey: ['purchase-order', id] });
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      router.push(`/payments-out/${payment.id}`);
    },
  });

  const createSupplyMut = useApiMutation({
    mutationFn: () => api.post<{ id: string }>(`/supplies/from-purchase-order/${id}`, {}),
    onSuccess: (supply) => {
      qc.invalidateQueries({ queryKey: ['purchase-order', id] });
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      router.push(`/supplies/${supply.id}`);
    },
  });

  // moysklad «Создать документ → Расходный ордер» (РКО for the unpaid balance).
  const createCashOutMut = useApiMutation({
    mutationFn: () => api.post<{ id: string }>(`/purchase-orders/${id}/create-cash-out`, {}),
    onSuccess: (cashOut) => {
      qc.invalidateQueries({ queryKey: ['purchase-order', id] });
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      router.push(`/cash-out/${cashOut.id}`);
    },
  });

  const saveMut = useSaveMutation({
    mutationFn: async () => {
      if (!form || !data) throw new Error('Form not ready');
      const payload: Record<string, unknown> = {
        // Optimistic-lock — the version the form loaded (from the server query).
        version: data.version,
        description: form.description || null,
        deliveryPlannedMoment: form.deliveryPlannedMoment || null,
        vatEnabled: form.vatEnabled,
        vatIncluded: form.vatIncluded,
        contractId: form.contractId,
        projectId: form.projectId,
        organizationAccountId: form.organizationAccountId,
        externalCode: form.externalCode || null,
        // «Владелец» / «Владелец-отдел» / «Общий доступ» — metadata, sent whenever
        // the order is editable (moysklad keeps posted orders editable too).
        ownerId: form.ownerId,
        groupId: form.groupId,
        shared: form.shared,
      };
      if (editable) {
        // Editable «№» — backend ignores a blank value (autogenerated column).
        payload.name = form.name;
        if (form.moment) payload.moment = new Date(form.moment).toISOString();
        payload.agentId = form.agentId;
        payload.organizationId = form.organizationId;
        payload.storeId = form.storeId;
        // moysklad keeps the document currency editable on a posted order too (only
        // a cancelled / partly-received order is locked — see `editable`). The rate
        // snapshots the selected currency's value vs the base (base → 1.0×1e8).
        payload.currency = form.currency;
        const sel = currencies.find((c) => c.isoCode === form.currency);
        const isBase = sel?.default ?? form.currency === 'UZS';
        payload.rateValue = isBase ? '100000000' : (sel?.rateValue ?? '100000000');
        payload.waiting = form.waiting;
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
        }));
      }
      payload.attributes = form.attributes;
      return api.patch(`/purchase-orders/${id}`, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-order', id] });
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
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
    // moysklad scopes «Договор» to the order's counterparty.
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
  // menus). Mirrors /new/page.tsx positionColumns; menus disabled when posted.
  const editableCols = editable;
  const positionColumns = useMemo<PositionTableColumnConfig[]>(() => {
    // moysklad has NO «#» row-number column — the select checkbox sits beside «Наименование».
    const cols: PositionTableColumnConfig[] = [{ key: 'dragarea' }, { key: 'select' }];
    if (colVisible.image) cols.push({ key: 'image' });
    cols.push({ key: 'name', label: tCols('name') });
    cols.push({ key: 'quantity', label: tPos('quantity') });
    if (colVisible.unit) cols.push({ key: 'unit', label: tCols('unit') });
    // `shipped` = moysklad «Принято» (received qty) on inbound purchase docs.
    if (colVisible.shipped) cols.push({ key: 'shipped', label: tCols('received') });
    if (colVisible.stock) cols.push({ key: 'stock', label: tCols('stock') });
    if (colVisible.reserve) cols.push({ key: 'reserve', label: tCols('reserve') });
    if (colVisible.available) cols.push({ key: 'available', label: tCols('available') });
    if (colVisible.waiting) cols.push({ key: 'waiting', label: tCols('waiting') });
    cols.push({
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
    });
    // moysklad shows the «НДС» / «Сумма НДС» columns ONLY while НДС is enabled on
    // the document (live ref: a PO with НДС off has neither column). With VAT off
    // we drop both so the position table reads exactly like moysklad's.
    if (form?.vatEnabled) {
      cols.push({ key: 'vat', label: tCols('vat') });
      if (colVisible.vatAmount) cols.push({ key: 'vatAmount', label: tCols('vatAmount') });
    }
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

  const editableLines = editable;
  const sumBig = BigInt(data.sumMinor || '0');
  const vatBig = BigInt(data.vatSumMinor || '0');
  const { subtotal, total } = docTotals(sumBig, vatBig);
  const totalQty = form.positions.reduce((acc, p) => acc + Number(p.quantity || 0), 0);

  const canCreateSupply =
    (['confirmed', 'partially_received'] as const).includes(data.state as never) &&
    BigInt(data.sumMinor) > BigInt(data.receivedSumMinor);
  const canCreateInvoice =
    (['confirmed', 'partially_received', 'fully_received'] as const).includes(
      data.state as never,
    ) && BigInt(data.sumMinor) > BigInt(data.invoicedSumMinor);
  const canCreateAdvance =
    (['confirmed', 'partially_received', 'fully_received'] as const).includes(
      data.state as never,
    ) && BigInt(data.sumMinor) > BigInt(data.payedSumMinor);
  // «Расходный ордер» (РКО) pays the unpaid balance — same gate as «Исходящий платёж».
  const canCreateCashOut = canCreateAdvance;

  // moysklad «Создать документ» order (live ref): Счёт поставщика · Приёмка ·
  // Исходящий платёж · Расходный ордер. Labels = singular detail_titles names.
  const createMenuItems: CreateMenuItem[] = [
    {
      id: 'invoice-in',
      label: tDetailTitles('invoice_in'),
      onSelect: canCreateInvoice ? () => createInvoiceMut.mutate() : undefined,
      disabled: !canCreateInvoice,
    },
    {
      id: 'supply',
      label: tDetailTitles('supply'),
      onSelect: canCreateSupply ? () => createSupplyMut.mutate() : undefined,
      disabled: !canCreateSupply,
    },
    {
      id: 'payment-out',
      label: tDetailTitles('payment_out'),
      onSelect: canCreateAdvance ? () => createAdvanceMut.mutate() : undefined,
      disabled: !canCreateAdvance,
    },
    {
      id: 'cash-out',
      label: tDetailTitles('cash_out'),
      onSelect: canCreateCashOut ? () => createCashOutMut.mutate() : undefined,
      disabled: !canCreateCashOut,
    },
  ];

  // ----- «Печать» menu (moysklad parity) -----------------------------------
  // Live-grounded #purchaseorder detail: the «Печать» menu lists the account's
  // own forms by name, then the standard «Заказ поставщику» form, then «Комплект…»
  // (bundle several forms into one PDF) and «Настроить…». Identical to the list
  // page's dynamic menu minus «Список заказов» (a list-only export). The doc here
  // is a single record, so every item prints THIS order (ids = [data.id]).
  const printForm = (templateId?: string) => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    void api
      .postDownload(
        '/purchase-orders/bulk-print',
        { ids: [data.id], ...(templateId ? { templateId } : {}) },
        `purchase-order-${data.name}-${stamp}.pdf`,
      )
      .then(() => qc.invalidateQueries({ queryKey: ['purchase-order', id] }));
  };
  // «Комплект…» bundles the ticked forms into one combined PDF for this order.
  const kitPrint = (templateIds: Array<string | null>) => {
    if (templateIds.length === 0) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    void api
      .postDownload(
        '/purchase-orders/kit-print',
        { ids: [data.id], templateIds },
        `purchase-order-${data.name}-kit-${stamp}.pdf`,
      )
      .then(() => qc.invalidateQueries({ queryKey: ['purchase-order', id] }));
  };
  // The «Комплект…» dialog lists the same forms: standard (id null) first, then
  // the account's own custom templates.
  const kitForms: KitPrintForm[] = [
    { id: null, name: tDetailTitles('purchase_order') },
    ...(printForms ?? []).map((f) => ({ id: f.id, name: f.name })),
  ];
  const printMenuItems: CreateMenuItem[] = [
    // The account's own custom «Заказ поставщику» forms (bulk-print via templateId).
    ...(printForms ?? []).map((f) => ({
      id: `form-${f.id}`,
      label: f.name,
      onSelect: () => printForm(f.id),
    })),
    // The standard built-in «Заказ поставщику» form — opens the HTML print view.
    {
      id: 'standard',
      label: tDetailTitles('purchase_order'),
      onSelect: () =>
        window.open(`/print/purchase-order/${data.id}?auto=1`, '_blank', 'width=820,height=1100'),
    },
    // «Комплект…» — bundle several forms into one PDF.
    { id: 'set', label: tPrint('set'), onSelect: () => setKitPrintOpen(true) },
    // «Настроить…» — right-side «Настройка шаблонов» slide-over for purchaseorder.
    { id: 'configure', label: tPrint('configure'), onSelect: () => openTemplates('purchaseorder') },
  ];

  // ----- «Отправить» menu (moysklad parity) --------------------------------
  // moysklad lists the SAME forms as «Печать» to email: clicking a form renders
  // the order through it, stores the PDF as an attachment and opens the email
  // composer with it pre-attached (POST :id/print-attachment → {attachmentId}).
  const sendForm = async (templateId?: string) => {
    const att = await api.post<{ attachmentId: string; filename: string }>(
      `/purchase-orders/${id}/print-attachment`,
      templateId ? { templateId } : {},
    );
    setEmailAttachments([{ id: att.attachmentId, filename: att.filename }]);
    setEmailOpen(true);
  };
  const sendMenuItems: CreateMenuItem[] = [
    ...(printForms ?? []).map((f) => ({
      id: `form-${f.id}`,
      label: f.name,
      onSelect: () => void sendForm(f.id),
    })),
    {
      id: 'standard',
      label: tDetailTitles('purchase_order'),
      onSelect: () => void sendForm(),
    },
  ];

  // «Валюта документа» rate helper — moysklad shows «1 USD = N UZS» next to the
  // currency when it is NOT the base currency, sourced from the account's currency
  // rate (mirror enters/[id]).
  const selectedCurrency = currencies.find((c) => c.isoCode === form.currency);
  const isBaseCurrency = selectedCurrency?.default ?? form.currency === 'UZS';
  const effectiveRate = selectedCurrency?.rate ?? '1';

  // moysklad «Статус» pill — the account's custom statuses (State rows,
  // entityType="purchaseorder"). Grey «Статус» until the admin defines some;
  // picking one applies it immediately (setStatusMut), even on a posted order.
  // The FSM `state` is NOT shown here — «Проведено» drives confirm/unconfirm.
  const statusOptions = customStatuses.map((s) => ({
    value: s.id,
    label: s.name,
    color: s.color ?? undefined,
  }));
  // moysklad still SHOWS «Проведено» on a terminal (cancelled/closed) order — it's
  // just not toggleable. Keep the handler live and disable via `applicableDisabled`
  // so the checkbox renders (greyed) instead of vanishing. (A live-but-undefined
  // handler hides the whole control, DocumentHeader `{onApplicableChange && …}`.)
  const applicableLocked = (['cancelled', 'closed'] as readonly string[]).includes(data.state);
  const onApplicableChange = (next: boolean) =>
    transitionMut.mutate(next ? 'confirm' : 'unconfirm');

  // Position «Наименование» cell — opens the per-row product picker (reusing
  // productFetcher). Read-only on a posted order. Mirrors /new's renderPositionNameCell.
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

  return (
    <div
      // moysklad parity: the document sits on a WHITE content area, left-aligned
      // and capped at ~1300px — it does NOT stretch edge-to-edge on wide screens
      // (user 2026-06-24 «to'liq ekranni egallash kerak emas»). The inner wrapper
      // caps the toolbar + header + body together so the owner cluster, totals and
      // positions all share moysklad's content width instead of spreading to the
      // screen edge.
      className="flex min-h-screen flex-col bg-[var(--ms-bg-surface)]"
      data-test-id="purchase-order-detail-page"
    >
      <div className="w-full max-w-[1300px]">
        <DetailToolbar
          isDirty={isDirty}
          isSaving={saveMut.isPending}
          onSave={() => saveMut.mutate()}
          onClose={() => router.push('/purchase-orders')}
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
          // moysklad «Изменить» = Удалить · Копировать only (no «Открыть в API»).
          hideOpenApi
          // moysklad-parity «Печать» menu: account forms · standard «Заказ
          // поставщику» · «Комплект…» · «Настроить…» (the page owns every handler).
          printMenuItems={printMenuItems}
          // moysklad-parity «Отправить» menu: the same forms, emailed with the
          // rendered PDF attached (each item renders + attaches, then opens the composer).
          sendMenuItems={sendMenuItems}
          rightSlot={
            // moysklad top-right cluster on the TOOLBAR row: «Владелец» (owner) +
            // «Смотрит» (who-is-viewing) + «Изменения» (last-modified) link.
            // «Владелец» is editable while the order is a draft (the backend rejects
            // edits on a posted PO); on a posted order it's a read-only label.
            // «Смотрит» renders only when another employee is viewing this order.
            <>
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
              {/* «Смотрит» — sits between the owner block and «Изменения» (moysklad
                  header order); renders only when another employee is viewing. */}
              <PresenceIndicator viewers={presenceViewers} label={tDetailHeader('viewing')} />
              <DocumentHistoryLink auditEntity="PurchaseOrder" entityId={data.id} />
            </>
          }
        />

        {/* Editable shared <DocumentHeader> (mirrors /new), rendered standalone below
          the toolbar. № is auto-assigned (no schema field) so it stays read-only;
          date is editable on a draft. «Проведено» drives the server-side FSM via the
          transition mutation; «Ожидание» is a form field. The owner popover +
          «Изменения» link live on the TOOLBAR row's right edge (moysklad parity),
          NOT here on the header row — passed to <DetailToolbar rightSlot>. */}
        <DocumentHeader
          {...docEditorLabels}
          documentTypeLabel={tDetailTitles('purchase_order')}
          number={form.name}
          // Editable «№» while the order is editable (draft/posted, no receipts).
          // A blank value is ignored by the backend (autogenerated column).
          onNumberChange={editableLines ? (v) => setForm((f) => f && { ...f, name: v }) : undefined}
          date={form.moment}
          onDateChange={editableLines ? (v) => setForm((f) => f && { ...f, moment: v }) : undefined}
          // moysklad «Статус» — account custom statuses; grey «Статус» when none.
          // Applied immediately (own endpoint), so it stays editable even on a
          // posted order (status is orthogonal to «Проведено»). «Настроить...»
          // opens the status-management settings.
          status={data.status?.id ?? ''}
          statusOptions={statusOptions}
          onStatusChange={(sid) => setStatusMut.mutate(sid)}
          onConfigureStatuses={() => router.push('/settings/purchase-order-statuses')}
          configureStatusesLabel={tForm('configure_statuses')}
          applicable={data.applicable}
          onApplicableChange={onApplicableChange}
          applicableDisabled={applicableLocked}
          applicableHelp={t('applicable_help')}
          waiting={form.waiting}
          onWaitingChange={(v) => setForm((f) => f && { ...f, waiting: v })}
          waitingDisabled={!editableLines}
          waitingHelp={t('waiting_help')}
        />

        <main className="px-4 py-4">
          {/* moysklad keeps a posted order editable, so there's NO posted-lock
            banner. The only inline lock notice is when Приёмки already exist —
            then positions can't be re-linked, so the order is read-only. */}
          {Number(data.receivedSumMinor) > 0 && (
            <Alert tone="info" className="mb-3">
              {tCommon('locked_when_received')}
            </Alert>
          )}

          {/* moysklad b-operation-form-top — 2-column meta grid (po-new-live-
            groundtruth-2026-06-20): Организация(+«Сум» account subrow)‖Склад ·
            Контрагент(+Баланс)‖Договор · План.дата приёмки‖Проект · Валюта‖∅.
            No «Счёт контрагента» (moysklad doesn't collect it on the PO form).
            Mirrors /new's metaPanel; posted orders stay read-only.
            moysklad parity: the meta block is BARE (no surface card / no extra
            indent) — it sits directly on the white form, left-aligned with the
            position table below. */}
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
                          // Changing the agent invalidates its contract.
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
                  onCreate={editableLines ? () => router.push('/counterparties/new') : undefined}
                  createLabel={tForm('create_new_counterparty')}
                  disabled={!editableLines}
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
                  onPick={() => editableLines && form.agentId && setOpenPicker('contract')}
                  inlineFetcher={contractFetcher}
                  onInlineSelect={(item) =>
                    setForm(
                      (s) =>
                        s && { ...s, contractId: item.id, contractLabel: String(item.primary) },
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
              <DocumentMetaField label={tDetailForm('delivery_planned_receipt')}>
                {/* moysklad PO = «План. дата приёмки» = DD.MM.YYYY via DatePicker. */}
                <DatePicker
                  value={form.deliveryPlannedMoment || null}
                  onChange={(d) => setForm((s) => s && { ...s, deliveryPlannedMoment: d ?? '' })}
                  locale="ru-RU"
                  disabled={!editableLines}
                  testId="field-delivery-planned"
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
                    editableLines &&
                    setForm((s) => s && { ...s, projectId: null, projectLabel: '' })
                  }
                  onCreate={editableLines ? () => router.push('/projects/new') : undefined}
                  createLabel={tForm('create_new_project')}
                  disabled={!editableLines}
                  testId="field-project"
                />
              </DocumentMetaField>
            </DocumentMetaRow>

            {/* «Валюта документа» — real /currencies. The ✎ opens the currency
                settings; the rate helper «1 USD = N UZS» shows when not the base
                currency (moysklad parity, live-grounded #purchaseorder USD order). */}
            <DocumentMetaRow fixedWidth>
              <DocumentMetaField
                label={tDetailForm('currency')}
                required
                helper={
                  !isBaseCurrency && selectedCurrency ? (
                    <span className="inline-flex items-center gap-1 tabular-nums">
                      1 {form.currency} = {Number(effectiveRate).toLocaleString('ru-RU')} UZS
                    </span>
                  ) : undefined
                }
              >
                <div className="flex items-center gap-1">
                  <div className="min-w-0 flex-1">
                    <NativeSelect
                      value={form.currency}
                      onChange={(e) => setForm((s) => s && { ...s, currency: e.target.value })}
                      disabled={!editableLines}
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
                </div>
              </DocumentMetaField>
            </DocumentMetaRow>
          </div>

          <div className="mt-4">
            <DetailContentTabs
              auditEntity="PurchaseOrder"
              entityId={data.id}
              relatedGroups={[]}
              positionsLabel={tDetailTabs('main')}
              filesSlot={<AttachmentsSection entity="PurchaseOrder" entityId={data.id} />}
              tasksSlot={<DocumentTasksSection entity="PurchaseOrder" entityId={data.id} />}
              historyInline={false}
              relatedSlot={
                <RelatedDocsTab
                  current={{
                    id: data.id,
                    name: data.name,
                    moment: data.moment,
                    state: data.state,
                    sumMinor: data.sumMinor,
                    kind: 'purchase-order',
                  }}
                  linked={[
                    ...(related?.supplies ?? []).map((d) => ({ ...d, kind: 'supply' as const })),
                    ...(related?.invoicesIn ?? []).map((d) => ({
                      ...d,
                      kind: 'invoice-in' as const,
                    })),
                    ...(related?.paymentsOut ?? []).map((d) => ({
                      ...d,
                      kind: 'payment-out' as const,
                    })),
                    ...(related?.purchaseReturns ?? []).map((d) => ({
                      ...d,
                      kind: 'purchase-return' as const,
                    })),
                  ]}
                />
              }
            >
              <div>
                {/* moysklad position table = full column set + ⚙ customizer + «Цена ▾»
                  / «Скидка ▾» menus + inline «Добавить позицию» search bar. Posted
                  orders are read-only (table, inline-add, customizer all disabled).
                  moysklad parity: the table is FULL content-width on TOP; the
                  «Комментарий» + «Внешний код» (left) and the bare totals (right)
                  sit in a row BELOW it — not in a side-by-side column with the
                  totals pinned to the screen edge. */}
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
                                        vat: raw?.vat != null ? String(raw.vat) : '0',
                                        vatEnabled: s.vatEnabled,
                                        // «Принято» stays blank until linked receipts post.
                                        shipped: '0',
                                        stock: raw?.stock?.onHand,
                                        reserve: raw?.stock?.reserved,
                                        available: raw?.stock?.available,
                                        waiting: raw?.stock?.inTransit,
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
                              toast.error(t('select_store_first'));
                              return;
                            }
                            if (form.positions.length === 0) {
                              toast.error(t('add_position_first'));
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
                                          shipped: '0',
                                          stock: raw?.stock?.onHand,
                                          reserve: raw?.stock?.reserved,
                                          available: raw?.stock?.available,
                                          waiting: raw?.stock?.inTransit,
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

                {/* «Комментарий» + «Внешний код» (left) + the bare totals (right) —
                  the moysklad row BELOW the positions table (not a side column with
                  the totals pinned to the screen edge). */}
                <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
                  <div className="min-w-0 max-w-[840px]">
                    <Textarea
                      value={form.description}
                      onChange={(e) => setForm((s) => s && { ...s, description: e.target.value })}
                      placeholder={tFields('description')}
                      aria-label={tFields('description')}
                      rows={2}
                      disabled={!editableLines}
                      data-test-id="field-description"
                    />
                    <div className="mt-3">
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
                    </div>
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
                    readOnly={!editableLines}
                    onToggleVatEnabled={(v) => setForm((s) => s && { ...s, vatEnabled: v })}
                    onToggleVatIncluded={(v) => setForm((s) => s && { ...s, vatIncluded: v })}
                  />
                </div>
              </div>
            </DetailContentTabs>
          </div>

          <div className="mt-4">
            <AttributesEditor
              entity="PurchaseOrder"
              values={form.attributes}
              onChange={(next) => setForm((f) => f && { ...f, attributes: next })}
              disabled={!editableLines}
              testIdPrefix="purchase-order"
            />
          </div>
          {/* Задачи / Файлы / Изменения now render as inline bottom sections INSIDE
            DetailContentTabs (moysklad-grounded layout) — see tasksSlot/filesSlot. */}
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
            vat: raw?.vat != null ? String(raw.vat) : '0',
            vatEnabled: form.vatEnabled,
            shipped: '0',
            stock: raw?.stock?.onHand,
            reserve: raw?.stock?.reserved,
            available: raw?.stock?.available,
            waiting: raw?.stock?.inTransit,
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
            waiting: raw?.stock?.inTransit,
            salePrices: raw?.salePrices ?? null,
          });
        }}
      />

      <SendEmailDialog
        open={emailOpen}
        onClose={() => {
          setEmailOpen(false);
          setEmailAttachments([]);
        }}
        entity="PurchaseOrder"
        entityId={data.id}
        defaultSubject={tEmail('subject_order', { name: data.name })}
        defaultBodyHtml={tEmail.raw('body_order')}
        initialAttachments={emailAttachments}
      />

      {/* «Печать ▸ Комплект…» — bundle several forms into one PDF for this order. */}
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
        onConfirm={kitPrint}
      />
    </div>
  );
}
