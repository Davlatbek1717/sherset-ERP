'use client';

/**
 * /sales-returns/[id] — moysklad-parity «Возврат покупателя» detail/edit page.
 *
 * Direction-flipped mirror of the certed supplier-side sibling
 * `purchase-returns/[id]` («Возврат поставщику», rebuilt + certed 2026-06-29) and
 * the 1:1 create editor `sales-returns/new`. The customer-return flip: Контрагент =
 * the customer returning goods, Склад = the RECEIVING warehouse, the linked source
 * doc is a Demand (Отгрузка) not a Supply (Приёмка).
 *
 *   - shared standalone <DocumentHeader> (number + date + «Проведено» + custom
 *     «Статус» pill + owner popover) instead of the legacy DetailHeader.
 *   - <DocumentMetaRow fixedWidth> row-paired boxed meta grid:
 *       Row 1  Организация (+ «Счёт организации» account sub-row) · Склад
 *       Row 2  Контрагент (+ «Баланс» sub-line) · Договор
 *       Row 3  Проект · Канал продаж
 *       Row 4  Валюта документа (+ rate, CurrencyRateModal) · Счёт контрагента
 *       Row 5  Внешний код
 *   - positions render «Ячейка» (CellPickerField) + «Остаток» columns, plus the
 *     «Возврат покупателя» customs block (Себестоимость ГТД + Страна) as ⚙-toggle
 *     columns (shown by default; the customer return has no «Номер ГТД» column).
 *
 * The custom «Статус» pill replaces the built-in draft/posted/cancelled FSM dropdown
 * (the FSM stays reachable via «Проведено»). «Печать ▾» / «Отправить ▾» dropdown menus
 * mirror the supplier side (flip slugs only). The «Отгрузка» / «Заказ покупателя»
 * back-links move into «Связанные документы» (single source of truth).
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
import { CurrencyRateModal } from '@/components/document-detail/currency-rate-modal';
import { DocumentTasksSection } from '@/components/document-tasks-section';
import { CellPickerField } from '@/components/documents/cell-picker-field';
import { OwnerAccessPopover } from '@/components/documents/owner-access-popover';
import { PositionAgreementButton } from '@/components/documents/position-agreement-modal';
import { PositionColumnCustomizer } from '@/components/documents/position-column-customizer';
import { PositionDiscountMenu } from '@/components/documents/position-discount-menu';
import {
  type ReceiptData,
  ReceiptPrintPortal,
  receiptDate,
} from '@/components/pick-list/receipt-print-portal';
import { usePrintTemplatesManager } from '@/components/print/print-templates-provider';
import { type KitPrintForm, KitPrintModal } from '@/components/purchase-orders/kit-print-modal';
import { SendEmailDialog } from '@/components/send-email-dialog';
import { useApiMutation } from '@/hooks/use-api-mutation';
import { useConflictReload } from '@/hooks/use-conflict-reload';
import { useDestructiveMutation } from '@/hooks/use-destructive-mutation';
import { useDetailNavigation } from '@/hooks/use-detail-navigation';
import { useDocumentEditorLabels } from '@/hooks/use-document-editor-labels';
import { useSaveMutation } from '@/hooks/use-save-mutation';
import { useUnsavedGuard } from '@/hooks/use-unsaved-guard';
import { api } from '@/lib/api-client';
import { docTotals } from '@/lib/doc-totals';
import { distributeAgreementDelta, sumAgreementGross } from '@/lib/position-agreement';
import { resolveDefaultSalePriceOrZero } from '@/lib/sale-price';
import {
  Alert,
  CatalogPicker,
  CatalogPickerField,
  type DocPositionRow,
  DocumentHeader,
  DocumentMetaField,
  DocumentMetaRow,
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
  demandPositionId: string | null;
  quantity: string;
  priceMinor: string;
  // «Себестоимость единицы» — weighted-average carrying cost frozen at post-time
  // (tiyin); null on a draft. Distinct from priceMinor (sale price). #19.
  costMinor: string | null;
  // «Остаток» — live physical stock at the return's store, attached by findById (#18).
  stock?: { onHand: string; reserved: string; inTransit: string; available: string } | null;
  discount: string;
  vat: number | null;
  vatEnabled: boolean;
  product: { id: string; name: string; code: string | null; uom: string | null } | null;
  // «Возврат покупателя» customs block (Себестоимость ГТД + Страна). No «Номер ГТД»
  // column (outbound-origin return, live-grounded /new §45); gtdNumber round-trips
  // as invisible data only.
  gtdNumber: string | null;
  gtdSumMinor: string | null;
  countryId: string | null;
  country: { id: string; name: string; code: string | null } | null;
  // «Ячейка» — address-storage bin: `cellId` (FK, drives the picker) + `cell` (label).
  cellId: string | null;
  cell: string | null;
}

interface SalesReturnDetail {
  id: string;
  version: number;
  name: string;
  externalCode: string | null;
  state: string;
  applicable: boolean;
  moment: string;
  postedAt: string | null;
  reason: string | null;
  description: string | null;
  sumMinor: string;
  // «Прибыль» (#25) — total COGS aggregate (Σ costMinor × qty), computed by findById.
  costSumMinor: string;
  /** ISO currency of the document (e.g. USD), for money formatting. */
  currency: string;
  vatSumMinor: string;
  vatEnabled: boolean;
  vatIncluded: boolean;
  /** moysklad «Статус» — account-defined custom status (SalesReturn.statusId),
   *  shown as the header pill. Orthogonal to the FSM `state` + «Проведено». */
  status: { id: string; name: string; color: string | null } | null;
  agent: { id: string; name: string; legalTitle: string | null };
  organization: { id: string; name: string; legalTitle: string | null };
  store: { id: string; name: string };
  owner: { id: string; name: string; email: string | null } | null;
  /** «Владелец-отдел» (department) — findById ships the scalar groupId only (no
   *  resolved relation); the owner popover resolves the label when opened. */
  groupId: string | null;
  /** «Общий доступ» (shared) flag. */
  shared: boolean;
  /** The source «Отгрузка» (demand) + «Заказ покупателя» — surfaced in Связанные документы. */
  demand: { id: string; name: string; state: string } | null;
  customerOrder: { id: string; name: string; state: string } | null;
  salesChannel: { id: string; name: string } | null;
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
  /** Sale prices — the customer-return line price (NOT buyPrice; a customer return
   *  prices at the sale price). */
  salePrices: Array<{ priceTypeId: string; value: string }> | null;
  vat: number | null;
  // moysklad position table shows the product's live stock cluster per row.
  stock?: { onHand: string; reserved: string; inTransit: string; available: string } | null;
}

// Detail-page position row — the PositionTable row shape (keyed on `id`). Mirrors
// purchase-returns/[id]'s DetailPositionRow with the demandPositionId back-link (traced
// from the source demand) instead of supplyPositionId; the customs fields (gtd/country)
// live on DocPositionRow and are kept for the customer-return direction.
interface DetailPositionRow extends DocPositionRow {
  assortmentId: string | null;
  demandPositionId: string | null;
}

function uid(): string {
  return Math.random().toString(36).slice(2);
}

/** ISO moment (UTC) → local `YYYY-MM-DDTHH:MM` — the string <DocumentHeader>
 *  expects (mirrors purchase-returns/[id]'s momentToLocalInput so the header
 *  reads/writes the same shape). */
function momentToLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// moysklad «Возврат покупателя» position columns (live-grounded /new): always-on =
// Наименование · Кол-во · Ячейка · Остаток · Цена · НДС · Сумма. The ⚙ on «Сумма»
// toggles the rest. `image`/`unit`/`discount`/`vatAmount` default OFF (mirror PR).
const OPTIONAL_POSITION_COLUMNS: { key: PositionColumnKey; labelKey: string; on: boolean }[] = [
  { key: 'image', labelKey: 'image', on: false },
  { key: 'unit', labelKey: 'unit', on: false },
  { key: 'discount', labelKey: 'discount', on: false },
  { key: 'vatAmount', labelKey: 'vatAmount', on: false },
];
// The «Возврат покупателя» customs columns (Себестоимость ГТД + Страна, live-grounded
// /new §45) are ⚙-toggle columns too, but shown by DEFAULT (they carry existing per-line
// data). Their labels live in `fields`, not `position_cols`, so they're kept separate.
const CUSTOMS_POSITION_COLUMNS: { key: PositionColumnKey; on: boolean }[] = [
  { key: 'gtdSumMinor', on: true },
  { key: 'country', on: true },
];
const DEFAULT_COL_VISIBLE: Record<string, boolean> = {
  ...Object.fromEntries(OPTIONAL_POSITION_COLUMNS.map((c) => [c.key, c.on])),
  ...Object.fromEntries(CUSTOMS_POSITION_COLUMNS.map((c) => [c.key, c.on])),
  // «Себест. единицы» (#19) — moysklad shows unit carrying cost by default.
  costPerUnit: true,
};

interface FormState {
  /** «от» — editable document moment, as the local `YYYY-MM-DDTHH:MM` string. */
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
  agentAccountId: string | null;
  agentAccountLabel: string;
  externalCode: string;
  description: string;
  reason: string;
  /** «Валюта документа» — moysklad lets you change it while the return is a draft. */
  currency: string;
  vatEnabled: boolean;
  vatIncluded: boolean;
  /** «Владелец» / «Владелец-отдел» / «Общий доступ» — editable via the header
   *  owner popover (mirror PO). Persisted on save while the return is a draft. */
  ownerId: string | null;
  ownerLabel: string;
  groupId: string | null;
  groupLabel: string;
  shared: boolean;
  positions: DetailPositionRow[];
  attributes: Record<string, unknown>;
}

function formFromData(d: SalesReturnDetail): FormState {
  return {
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
    // moysklad shows the account NAME («Сум»), falling back to the number.
    organizationAccountLabel:
      d.organizationAccount?.name || d.organizationAccount?.accountNumber || '',
    agentAccountId: d.agentAccount?.id ?? null,
    agentAccountLabel: d.agentAccount?.accountNumber ?? '',
    externalCode: d.externalCode ?? '',
    description: d.description ?? '',
    reason: d.reason ?? '',
    currency: d.currency,
    vatEnabled: d.vatEnabled,
    vatIncluded: d.vatIncluded,
    ownerId: d.owner?.id ?? null,
    ownerLabel: d.owner?.name ?? '',
    // findById ships the scalar groupId only; the popover resolves the label.
    groupId: d.groupId ?? null,
    groupLabel: '',
    shared: d.shared ?? false,
    // PositionTable keys on `id` (DocPositionRow.id). Use the persisted position id
    // as the stable React key; carry demandPositionId so save round-trips the back-link.
    positions: d.positions.map((p) => ({
      id: p.id,
      assortmentId: p.assortmentId,
      productLabel: p.product?.name ?? '—',
      productCode: p.product?.code ?? undefined,
      productUom: p.product?.uom ?? null,
      demandPositionId: p.demandPositionId ?? null,
      quantity: p.quantity,
      priceMinor: p.priceMinor,
      // «Себест. единицы» (#19) — carrying cost for the costPerUnit column; null→undefined.
      costMinor: p.costMinor ?? undefined,
      // «Остаток» (#18) — live physical on-hand from findById (PositionTable reads
      // `stock` as the display string).
      stock: p.stock?.onHand ?? undefined,
      discount: p.discount,
      vat: p.vat != null ? String(p.vat) : '',
      vatEnabled: p.vatEnabled,
      // Customs — gtdNumber round-trips invisibly (no column); gtdSum + country show.
      gtdNumber: p.gtdNumber ?? '',
      gtdSumMinor: p.gtdSumMinor ?? '',
      countryId: p.countryId ?? null,
      countryLabel: p.country?.name ?? '',
      cellId: p.cellId ?? null,
      cell: p.cell ?? undefined,
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
    salesChannelId: s.salesChannelId,
    contractId: s.contractId,
    projectId: s.projectId,
    organizationAccountId: s.organizationAccountId,
    agentAccountId: s.agentAccountId,
    externalCode: s.externalCode,
    description: s.description,
    reason: s.reason,
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
      cell: p.cell ?? null,
    })),
    attributes: s.attributes,
  });
}

export default function SalesReturnDetailPage() {
  const { id } = useParams<{ id: string }>();
  const detailNav = useDetailNavigation('sales-returns', id);
  const docEditorLabels = useDocumentEditorLabels();
  const router = useRouter();
  const qc = useQueryClient();
  const t = useTranslations('pages.sales_returns');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tDetailTitles = useTranslations('detail_titles');
  const tDetailForm = useTranslations('detail_form');
  const tDetailTabs = useTranslations('detail_tabs');
  const tForm = useTranslations('form');
  const tDetailHeader = useTranslations('detail_header');
  const tCurShort = useTranslations('currency_short');
  const tPos = useTranslations('position_editor');
  const { toast } = useToast();
  const tCols = useTranslations('position_cols');
  const tPrint = useTranslations('print_menu');
  const tSpiska = useTranslations('pages.pickLists');
  const tCreate = useTranslations('create_related');

  const { data, isLoading } = useQuery<SalesReturnDetail>({
    queryKey: ['sales-return', id],
    queryFn: () => api.get(`/sales-returns/${id}`),
  });

  // moysklad «Статус» — the account's custom return statuses (State rows,
  // entityType="salesreturn"); drives the header pill options. Mirror /new + PR.
  const { data: statusData } = useQuery<{
    items: Array<{ id: string; name: string; color: string | null }>;
  }>({
    queryKey: ['states', 'salesreturn'],
    queryFn: () => api.get('/states?entityType=salesreturn&archived=false&limit=250'),
    staleTime: 60_000,
  });
  const customStatuses = statusData?.items ?? [];

  // «Валюта документа» options — the account's REAL currencies (Настройки → Валюты),
  // never a hardcoded list (a phantom EUR/RUB the account doesn't have must not appear).
  const { data: currenciesData } = useQuery<{
    items: Array<{ id: string; isoCode: string; name: string; rate: string }>;
  }>({
    queryKey: ['currencies'],
    queryFn: () => api.get('/currencies'),
  });
  const currencies = currenciesData?.items ?? [];

  // moysklad «Печать» / «Отправить» — the account's own «Возврат покупателя» print
  // forms (PDF), listed by name. Mirror PR. The settings-gated template CRUD lives
  // behind «Настроить…»; this read is view-permission only.
  const { data: printForms } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ['sales-return-print-forms'],
    queryFn: () => api.get<Array<{ id: string; name: string }>>('/sales-returns/print-forms'),
    staleTime: 60_000,
  });
  const { openTemplates } = usePrintTemplatesManager();

  const [form, setForm] = useState<FormState | null>(null);
  // moysklad parity (#16/D1): «Баланс (нам должны): …» caption under Контрагент —
  // the counterparty balance ledger (per currency). Consolidated to base сум below.
  const { data: agentBalanceData } = useQuery<{
    items: Array<{ currency: string; balanceMinor: string }>;
  }>({
    queryKey: ['counterparty-balance', form?.agentId],
    queryFn: () => api.get(`/counterparty-balances/${form?.agentId}`),
    enabled: !!form?.agentId,
  });
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
    | 'agentAccount'
  >(null);
  const [openCatalogPicker, setOpenCatalogPicker] = useState(false);
  const [productRowId, setProductRowId] = useState<string | null>(null);
  const [countryRowId, setCountryRowId] = useState<string | null>(null);
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
  // «Курс валюты документа» override — the account's currency-справочник rate edited
  // via the ✎ → CurrencyRateModal (mirror /new). Not persisted on a posted return.
  const [rateOverride, setRateOverride] = useState<string | null>(null);
  const [rateModalOpen, setRateModalOpen] = useState(false);
  // «Отправить» email composer + «Печать ▸ Комплект…» dialog (mirror PR).
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailAttachments, setEmailAttachments] = useState<{ id: string; filename: string }[]>([]);
  const [kitPrintOpen, setKitPrintOpen] = useState(false);
  const onConflict = useConflictReload(['sales-return', id], () => setForm(null));

  useEffect(() => {
    if (data && !form) {
      const initial = formFromData(data);
      setForm(initial);
      setOriginal(snapshot(initial));
    }
  }, [data, form]);

  const isDirty = useMemo(() => (form ? snapshot(form) !== original : false), [form, original]);
  useUnsavedGuard(isDirty);

  // ── Position table callbacks (mirror PR) — all mutate form.positions ──
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

  const transitionMut = useApiMutation({
    mutationFn: (target: string) => api.post(`/sales-returns/${id}/transitions/${target}`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales-return', id] });
      qc.invalidateQueries({ queryKey: ['sales-returns'] });
      if (data?.demand) qc.invalidateQueries({ queryKey: ['demand', data.demand.id] });
      if (data?.customerOrder)
        qc.invalidateQueries({ queryKey: ['customer-order', data.customerOrder.id] });
    },
  });

  // moysklad «Статус» — set the account custom status (SalesReturn.statusId) on the
  // header pill. Applied IMMEDIATELY via its own endpoint, so it stays editable even
  // on a posted return (status is orthogonal to «Проведено»). Mirror /new + PR.
  const setStatusMut = useApiMutation({
    mutationFn: (statusId: string) => api.patch(`/sales-returns/${id}/status`, { statusId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales-return', id] });
      qc.invalidateQueries({ queryKey: ['sales-returns'] });
    },
  });

  const deleteMut = useApiMutation({
    mutationFn: () => api.delete(`/sales-returns/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales-returns'] });
      router.push('/sales-returns');
    },
  });

  const cloneMut = useApiMutation({
    mutationFn: () => api.post<{ id: string }>(`/sales-returns/${id}/clone`, {}),
    onSuccess: (clone) => {
      qc.invalidateQueries({ queryKey: ['sales-returns'] });
      router.push(`/sales-returns/${clone.id}`);
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
        reason: form.reason || null,
        vatEnabled: form.vatEnabled,
        vatIncluded: form.vatIncluded,
        // moysklad parity — Канал продаж / Договор / Проект / accounts / Внешний код
        // are document metadata, editable any time.
        salesChannelId: form.salesChannelId,
        contractId: form.contractId,
        projectId: form.projectId,
        organizationAccountId: form.organizationAccountId,
        agentAccountId: form.agentAccountId,
        externalCode: form.externalCode || null,
        // «Владелец» / «Владелец-отдел» / «Общий доступ» — metadata, editable on a
        // draft (the backend rejects ANY edit on a posted return before applying).
        ownerId: form.ownerId,
        groupId: form.groupId,
        shared: form.shared,
      };
      if (!data.applicable) {
        if (form.moment) payload.moment = new Date(form.moment).toISOString();
        payload.agentId = form.agentId;
        payload.organizationId = form.organizationId;
        payload.storeId = form.storeId;
        // moysklad allows changing the document currency only while the return is a
        // draft (the backend persists it — sales-return.service.ts update()).
        payload.currency = form.currency;
        payload.positions = form.positions.map((p) => ({
          assortmentKind: 'product',
          // biome-ignore lint/style/noNonNullAssertion: a product is always picked before save
          assortmentId: p.assortmentId!,
          demandPositionId: p.demandPositionId ?? undefined,
          // Pass quantity/discount as RAW Decimal strings — a Number() round-trip
          // loses precision (the money helper warns about this) and diverges from
          // /new; the Zod schema coerces the string.
          quantity: p.quantity,
          priceMinor: p.priceMinor,
          discount: p.discount || '0',
          vat: p.vat ? Number(p.vat) : undefined,
          vatEnabled: p.vatEnabled,
          // Customs — gtdNumber round-trips (no column); gtdSum + country editable.
          gtdNumber: p.gtdNumber || undefined,
          gtdSumMinor: p.gtdSumMinor || undefined,
          countryId: p.countryId || undefined,
          // «Ячейка» — address-storage bin (cellId drives per-cell stock on post).
          ...(p.cellId ? { cellId: p.cellId } : {}),
          ...(p.cell ? { cell: p.cell } : {}),
        }));
      }
      payload.attributes = form.attributes;
      return api.patch(`/sales-returns/${id}`, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales-return', id] });
      qc.invalidateQueries({ queryKey: ['sales-returns'] });
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
    // moysklad scopes «Договор» to the return's counterparty.
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
  const salesChannelFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: Array<{ id: string; name: string }> }>(
      `/sales-channels?search=${encodeURIComponent(s)}&limit=50`,
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
  // moysklad parity — counterparty bank accounts have no flat list endpoint; the
  // only route is the nested /counterparties/:id/bank-accounts (like the contract
  // picker is gated on the chosen agent). Client-filter by search.
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
  const countryFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: Array<{ id: string; name: string; code: string | null }> }>(
      `/countries?search=${encodeURIComponent(s)}&limit=100`,
    );
    return d.items.map((c) => ({ id: c.id, primary: c.name, secondary: c.code ?? undefined }));
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

  // moysklad «Возврат покупателя» position columns (fixed + optional, customizer).
  // Mirror /new's columns; the customizer is disabled when posted.
  const editableCols = !data?.applicable;
  const positionColumns = useMemo<PositionTableColumnConfig[]>(() => {
    // moysklad has NO «#» row-number column — the select checkbox sits beside «Наименование».
    const cols: PositionTableColumnConfig[] = [{ key: 'dragarea' }, { key: 'select' }];
    if (colVisible.image) cols.push({ key: 'image' });
    cols.push({ key: 'name', label: tCols('name') });
    cols.push({ key: 'quantity', label: tPos('quantity') });
    if (colVisible.unit) cols.push({ key: 'unit', label: tCols('unit') });
    // «Ячейка» — address-storage bin; PositionTable supplies the default header.
    cols.push({ key: 'cell', label: tCols('cell'), placeholder: tCols('cell_unset') });
    // «Остаток» — the line product's live stock at the store.
    cols.push({ key: 'stock', label: tCols('stock') });
    cols.push({ key: 'price', label: tCols('price') });
    if (form?.vatEnabled) {
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
          {editableCols && (
            <PositionColumnCustomizer
              options={[
                ...OPTIONAL_POSITION_COLUMNS.map((c) => ({
                  key: c.key,
                  label: tCols(c.labelKey),
                })),
                // «Себест. единицы» (#19) — carrying-cost column, ⚙-toggleable.
                { key: 'costPerUnit', label: tCols('costPerUnit') },
                // SR customs — labels live in `fields`, appended to the ⚙ list.
                { key: 'gtdSumMinor', label: tFields('gtd_cost') },
                { key: 'country', label: tFields('country') },
              ]}
              visible={colVisible}
              onToggle={(key, next) => setColVisible((v) => ({ ...v, [key]: next }))}
              ariaLabel={tCols('configure')}
            />
          )}
        </span>
      ),
    });
    // «Себест. единицы» (#19) — unit carrying cost (costMinor; ≠ price). Post-time
    // only (null on draft → renders 0). ⚙-toggleable, default-visible (moysklad).
    if (colVisible.costPerUnit) cols.push({ key: 'costPerUnit', label: tCols('costPerUnit') });
    // «Возврат покупателя» customs — Себестоимость ГТД + Страна (after «Сумма», before
    // the row ⋮). Gear-toggleable but shown by default.
    if (colVisible.gtdSumMinor) cols.push({ key: 'gtdSumMinor', label: tFields('gtd_cost') });
    if (colVisible.country) cols.push({ key: 'country', label: tFields('country') });
    cols.push({ key: 'menu' });
    return cols;
  }, [
    colVisible,
    editableCols,
    form?.vatEnabled,
    tCols,
    tPos,
    tFields,
    applyDiscountMarkup,
    selectedRowIds.size,
  ]);

  if (isLoading || !form)
    return <div className="p-8 text-[var(--ms-text-muted)] text-sm">{tCommon('loading')}</div>;
  // «Печать → Лист сборки» (climart port 2026-07-28): qaytarilgan tovarni
  // yacheykasiga QAYTA JOYLASH varag'i (posted return'da ham read-only print).
  // Hook-tartib barqarorligi uchun `if (!data)` early-return'dan OLDIN e'lon.
  const [spiska, setSpiska] = useState<ReceiptData | null>(null);
  const openSpiska = useCallback(async () => {
    if (!form || !data) return;
    const rows = form.positions.filter((p) => p.assortmentId);
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
      number: data.name,
      dateStr: receiptDate(new Date(form.moment)),
      agentName: form.agentLabel || null,
      agentPhone: null,
      ownerName: form.ownerLabel || null,
      description: form.description || null,
      positions: rows.map((r) => ({
        name: r.productLabel,
        qty: r.quantity,
        uom: r.productUom ?? null,
        cell: res.cells[r.assortmentId as string] ?? null,
      })),
    });
  }, [form, data, tSpiska]);

  if (!data) return <div className="p-8 text-sm">{tCommon('not_found')}</div>;

  const editableLines = !data.applicable;
  // «Валюта документа» rate helper — moysklad shows «1 USD = N UZS» next to a
  // non-base currency, sourced from the account's currency rate (mirror /new).
  const selectedCurrency = currencies.find((c) => c.isoCode === form.currency);
  const isBaseCurrency = (form.currency ?? 'UZS') === 'UZS';
  const adminRate = selectedCurrency?.rate;
  const effectiveRate = rateOverride ?? adminRate ?? '1';
  // moysklad «Баланс» — consolidate per-currency balances to base сум (UZS as-is;
  // doc-currency × rate). Sign: + ⇒ «нам должны», − ⇒ «мы должны». Mirror customer-order.
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
  const sumBig = BigInt(data.sumMinor || '0');
  const vatBig = BigInt(data.vatSumMinor || '0');
  const { subtotal, total } = docTotals(sumBig, vatBig);
  const totalQty = form.positions.reduce((acc, p) => acc + Number(p.quantity || 0), 0);
  // «Прибыль» (#25) — revenue − COGS. Gated on cost>0: costSumMinor is post-time only
  // (0 on a draft), and `sum − 0` would present full revenue as profit (mirror demand
  // §S5). Paired with the SAVED sum, not the live editor total.
  const costSumBig = BigInt(data.costSumMinor || '0');
  const profitMinor = costSumBig > 0n ? (sumBig - costSumBig).toString() : undefined;

  // moysklad «Статус» pill — the account's custom return statuses (grey «Статус»
  // when none configured). FSM post/unpost lives on «Проведено» (orthogonal), exactly
  // like /new + PR. Applied immediately via setStatusMut.
  const statusOptions = customStatuses.map((s) => ({
    value: s.id,
    label: s.name,
    color: s.color ?? undefined,
  }));
  const onApplicableChange =
    data.state === 'cancelled'
      ? undefined
      : (next: boolean) => transitionMut.mutate(next ? 'post' : 'unpost');

  // ----- «Печать» menu (moysklad parity, mirror PR) ------------------------
  // This detail page is a single record → every print acts on THIS return
  // (ids = [data.id]). A custom form downloads via bulk-print(templateId); the
  // built-in «Возврат покупателя» form also goes through bulk-print. Each download
  // flips the printed flag server-side, so we refetch after.
  const printForm = (templateId?: string) => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    void api
      .postDownload(
        '/sales-returns/bulk-print',
        { ids: [data.id], ...(templateId ? { templateId } : {}) },
        `sales-return-${data.name}-${stamp}.pdf`,
      )
      .then(() => qc.invalidateQueries({ queryKey: ['sales-return', id] }));
  };
  const kitPrint = (templateIds: Array<string | null>) => {
    if (templateIds.length === 0) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    void api
      .postDownload(
        '/sales-returns/kit-print',
        { ids: [data.id], templateIds },
        `sales-return-${data.name}-kit-${stamp}.pdf`,
      )
      .then(() => qc.invalidateQueries({ queryKey: ['sales-return', id] }));
  };
  const kitForms: KitPrintForm[] = [
    { id: null, name: tDetailTitles('sales_return') },
    ...(printForms ?? []).map((f) => ({ id: f.id, name: f.name })),
  ];
  const printMenuItems: CreateMenuItem[] = [
    // The account's own custom «Возврат покупателя» forms (bulk-print via templateId).
    ...(printForms ?? []).map((f) => ({
      id: `form-${f.id}`,
      label: f.name,
      onSelect: () => printForm(f.id),
    })),
    // The standard built-in «Возврат покупателя» form — downloads via bulk-print.
    { id: 'standard', label: tDetailTitles('sales_return'), onSelect: () => printForm() },
    // «Лист сборки» — qaytarilgan tovarni yacheykaga qayta joylash varag'i.
    { id: 'spiska', label: tSpiska('spiska_form'), onSelect: () => void openSpiska() },
    // «Комплект…» — bundle several forms into one PDF.
    { id: 'set', label: tPrint('set'), onSelect: () => setKitPrintOpen(true) },
    // «Настроить…» — right-side «Настройка шаблонов» slide-over for the return.
    {
      id: 'configure',
      label: tPrint('configure'),
      onSelect: () => openTemplates('salesreturn'),
    },
  ];

  // ----- «Отправить» menu (moysklad parity) --------------------------------
  // Lists the SAME forms as «Печать» to email: clicking a form renders THIS
  // return through it, stores the PDF as an attachment and opens the composer
  // with it pre-attached (POST :id/print-attachment → {attachmentId}). Sending
  // also flips the doc's published flag (list «Отправлено» pill).
  const sendForm = async (templateId?: string) => {
    const att = await api.post<{ attachmentId: string; filename: string }>(
      `/sales-returns/${data.id}/print-attachment`,
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
      label: tDetailTitles('sales_return'),
      onSelect: () => void sendForm(),
    },
  ];

  // ----- «Создать документ» menu (moysklad parity) -------------------------
  // A customer return refunds the customer (money OUT), so the downstream docs are
  // the outgoing/refund set (mirror of purchase-return's incoming set, direction-
  // flipped). Rendered as label-parity placeholders (greyed) until the from-sales-
  // return backend flows are built — the same honest stub purchase-return/[id] uses
  // for its unbuilt money docs. Exact item set pending moysklad grounding.
  const createMenuItems: CreateMenuItem[] = [
    { id: 'facture-out', label: tCreate('facture_out'), disabled: true },
    { id: 'payment-out', label: tCreate('payment_out_single'), disabled: true },
    { id: 'cash-out', label: tCreate('cash_out_single'), disabled: true },
  ];

  // Position «Наименование» cell — moysklad parity: a picked product's name is a
  // BORDERLESS LINK to its product card; swapping the line's product moves to the
  // row ⋮ «Заменить» (onReplace below). Read-only on a posted return.
  const renderPositionNameCell = (row: DocPositionRow) => {
    const p = row as DetailPositionRow;
    const href = p.assortmentId ? `/products/${p.assortmentId}` : undefined;
    return (
      <PositionNameCell
        code={p.productCode}
        label={p.productLabel}
        placeholder={tForm('select_product')}
        onPick={() => editableLines && setProductRowId(p.id)}
        productHref={href}
        onNavigate={href ? () => router.push(href) : undefined}
        disabled={!editableLines}
        testId={`pos-${p.id}-name`}
      />
    );
  };

  // «Ячейка» — address-storage cell picker (mirror /new + PR). The closure carries
  // form.storeId + the row's product so the picker can filter «С этим товаром».
  // Stores cellId (drives per-cell stock) + the «Зона / Ячейка» label in `cell`.
  // Read-only on a posted return (renders a label).
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

  // «Страна» — country-of-origin picker for the customs block (mirror /new). Opens
  // the per-row country picker modal (countryRowId). Read-only on a posted return.
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
      data-test-id="sales-return-detail-page"
    >
      <DetailToolbar
        isDirty={isDirty}
        isSaving={saveMut.isPending}
        onSave={() => saveMut.mutate()}
        onClose={() => router.push('/sales-returns')}
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
        printMenuItems={printMenuItems}
        sendMenuItems={sendMenuItems}
        printEntity="salesreturn"
      />

      {/* Editable shared <DocumentHeader> (mirrors PR), rendered standalone below the
          toolbar. № is auto-assigned (no editable name field) so it stays read-only;
          date is editable on a draft. «Проведено» drives the server-side FSM via the
          transition mutation. The custom «Статус» pill + owner popover sit top-right
          (editable while the return is a draft). */}
      <DocumentHeader
        {...docEditorLabels}
        documentTypeLabel={tDetailTitles('sales_return')}
        number={data.name}
        date={form.moment}
        onDateChange={editableLines ? (v) => setForm((f) => f && { ...f, moment: v }) : undefined}
        status={data.status?.id ?? ''}
        statusOptions={statusOptions}
        onStatusChange={(sid) => setStatusMut.mutate(sid)}
        onConfigureStatuses={() => router.push('/settings/sales-return-statuses')}
        configureStatusesLabel={tForm('configure_statuses')}
        applicable={data.applicable}
        onApplicableChange={onApplicableChange}
        applicableHelp={t('applicable_help')}
        rightSlot={
          // moysklad top-right cluster: «Владелец» (owner) + «Изменения» (history)
          // link. «Владелец» is editable while the return is a draft (the backend
          // rejects edits on a posted return); on a posted one it's a read-only label.
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
            <DocumentHistoryLink auditEntity="SalesReturn" entityId={data.id} />
          </div>
        }
      />

      <main className="flex-1 px-4 py-4">
        {/* Errors surface as toasts (save / transition mutations auto-toast); the
            optimistic-lock 409 is handled by onConflict. Only the posted-lock notice
            stays as an inline banner. */}
        {data.applicable && (
          <Alert tone="info" className="mb-3">
            {tCommon('locked_when_posted')}
          </Alert>
        )}

        {/* moysklad b-operation-form-top — ROW-PAIRED boxed meta grid:
            Организация(+«Сум» account subRow)‖Склад · Контрагент(+Баланс)‖Договор ·
            Проект‖Канал продаж · Валюта документа(+rate)‖Счёт контрагента ·
            Внешний код. Posted returns stay read-only. */}
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
            <DocumentMetaField
              label={tFields('agent')}
              required
              helper={
                form.agentId ? (
                  // moysklad: «Баланс (нам должны): 300 000,00 сум (24,5902 доллар)» —
                  // base-сум amount + qualifier + doc-currency equivalent, red when nonzero.
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
                        // Changing the customer invalidates its contract + bank account.
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
                disabledHint={tForm('select_customer_first')}
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
                onCreate={editableLines ? () => router.push('/settings/projects/new') : undefined}
                createLabel={tForm('create_new_project')}
                disabled={!editableLines}
                testId="field-project"
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
                disabled={!editableLines}
                testId="field-sales-channel"
              />
            </DocumentMetaField>
          </DocumentMetaRow>

          <DocumentMetaRow fixedWidth>
            <DocumentMetaField
              label={tDetailForm('currency')}
              required
              helper={
                !isBaseCurrency && selectedCurrency ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="tabular-nums">
                      1 {form.currency} ={' '}
                      {Number(effectiveRate).toLocaleString('ru-RU', { maximumFractionDigits: 4 })}{' '}
                      UZS
                    </span>
                    <button
                      type="button"
                      onClick={() => editableLines && setRateModalOpen(true)}
                      className="px-1 text-[var(--ms-text-muted)] text-sm hover:text-[var(--ms-text-primary)]"
                      aria-label={tForm('rate_edit')}
                      data-test-id="rate-edit"
                    >
                      ✎
                    </button>
                  </span>
                ) : undefined
              }
            >
              <NativeSelect
                value={form.currency}
                onChange={(e) => {
                  setForm((s) => s && { ...s, currency: e.target.value });
                  setRateOverride(null);
                }}
                disabled={!editableLines}
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
            <DocumentMetaField label={tFields('agent_account')}>
              <CatalogPickerField
                value={
                  form.agentAccountId
                    ? { id: form.agentAccountId, label: form.agentAccountLabel }
                    : null
                }
                placeholder={tFields('agent_account')}
                onPick={() => editableLines && form.agentId && setOpenPicker('agentAccount')}
                inlineFetcher={agentAccountFetcher}
                onInlineSelect={(item) =>
                  setForm(
                    (s) =>
                      s && {
                        ...s,
                        agentAccountId: item.id,
                        agentAccountLabel: String(item.primary),
                      },
                  )
                }
                onClear={() =>
                  editableLines &&
                  setForm((s) => s && { ...s, agentAccountId: null, agentAccountLabel: '' })
                }
                disabled={!editableLines || !form.agentId}
                disabledHint={tForm('select_customer_first')}
                testId="field-agent-account"
              />
            </DocumentMetaField>
          </DocumentMetaRow>

          <DocumentMetaRow fixedWidth>
            <DocumentMetaField label={tDetailForm('external_code')}>
              <Input
                value={form.externalCode}
                onChange={(e) => setForm((s) => s && { ...s, externalCode: e.target.value })}
                disabled={!editableLines}
                data-test-id="field-external-code"
              />
            </DocumentMetaField>
          </DocumentMetaRow>
        </div>

        <div className="mt-4">
          <DetailContentTabs
            auditEntity="SalesReturn"
            entityId={data.id}
            relatedGroups={[]}
            positionsLabel={tDetailTabs('positions')}
            filesSlot={<AttachmentsSection entity="SalesReturn" entityId={data.id} />}
            tasksSlot={<DocumentTasksSection entity="SalesReturn" entityId={data.id} />}
            historyInline={false}
            relatedSlot={
              <RelatedDocsTab
                current={{
                  id: data.id,
                  name: data.name,
                  moment: data.moment,
                  state: data.state,
                  sumMinor: data.sumMinor,
                  kind: 'sales-return',
                }}
                // «Привязать документ» — the tab owns the «Привязка документа»
                // modal (pre-scoped to this return's refs) + manual links +
                // unlink + the «?link=new» auto-open hand-off.
                linkable={{
                  entityType: 'SalesReturn',
                  agent: data.agent,
                  organization: data.organization,
                  storeTo: data.store,
                }}
                // The source «Отгрузка» (demand) + «Заказ покупателя» — straight from
                // findById, no extra fetch (no /sales-returns/:id/related endpoint yet).
                linked={[
                  ...(data.demand
                    ? [
                        {
                          id: data.demand.id,
                          name: data.demand.name,
                          moment: data.moment,
                          state: data.demand.state,
                          sumMinor: '0',
                          kind: 'demand' as const,
                        },
                      ]
                    : []),
                  ...(data.customerOrder
                    ? [
                        {
                          id: data.customerOrder.id,
                          name: data.customerOrder.name,
                          moment: data.moment,
                          state: data.customerOrder.state,
                          sumMinor: '0',
                          kind: 'customer-order' as const,
                        },
                      ]
                    : []),
                ]}
              />
            }
          >
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="min-w-0">
                {/* Owner 2026-07-23: «Договорная цена» — blue, at the table's OUTER
                    top-right corner (same spot in every section). */}
                {editableLines && (
                  <div className="-mb-2.5 flex justify-end">
                    <PositionAgreementButton
                      totalMinor={sumAgreementGross(form.positions, form.vatIncluded)}
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
                {/* moysklad position table = column set + ⚙ customizer + inline
                    «Добавить позицию» search bar. Posted returns are read-only (table,
                    inline-add, customizer all disabled). */}
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
                  // moysklad row ⋮ «Заменить» — swap the line's product (the name is now
                  // a card link, so swapping moves here). Opens the per-row product picker.
                  onReplace={(rowId) => editableLines && setProductRowId(rowId)}
                  renderCellCell={renderPositionCellCell}
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
                              priceMinor: resolveDefaultSalePriceOrZero(p.salePrices),
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
                          currency: form.currency,
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
                        onPick={(item, entry) => {
                          if (entry?.permanent) {
                            // «Doimiy narx» — persist to the product card (owner 2026-07-17).
                            api
                              .post(`/products/${item.id}/sale-price`, {
                                priceMinor: entry.priceMinor,
                              })
                              .then(() => toast.success(tPos('pick_modal_price_saved')))
                              .catch(() => toast.error(tPos('pick_modal_price_save_failed')));
                          }
                          const raw = item.raw as ProductItem | undefined;
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
                                      productUom: raw?.uom ?? null,
                                      demandPositionId: null,
                                      quantity: entry?.quantity ?? '1',
                                      priceMinor:
                                        entry?.priceMinor ??
                                        resolveDefaultSalePriceOrZero(raw?.salePrices),
                                      discount: '0',
                                      vat: raw?.vat != null ? String(raw.vat) : '12',
                                      vatEnabled: s.vatEnabled,
                                      stock: raw?.stock?.onHand,
                                      available: raw?.stock?.available,
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
                                        demandPositionId: null,
                                        quantity: Number(quantity) > 0 ? quantity : '1',
                                        priceMinor: resolveDefaultSalePriceOrZero(raw?.salePrices),
                                        discount: '0',
                                        vat: raw?.vat != null ? String(raw.vat) : '12',
                                        vatEnabled: s.vatEnabled,
                                        stock: raw?.stock?.onHand,
                                        available: raw?.stock?.available,
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

                {/* «Причина» + «Комментарий» — moysklad places them below the positions
                    (mirror /new): a single-line reason on top, the multiline comment below. */}
                <div className="mt-3 space-y-2">
                  <Input
                    value={form.reason}
                    onChange={(e) => setForm((s) => s && { ...s, reason: e.target.value })}
                    placeholder={tFields('reason')}
                    aria-label={tFields('reason')}
                    disabled={!editableLines}
                    data-test-id="field-reason"
                  />
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
              </div>

              <DetailTotalsSidebar
                subtotalMinor={subtotal.toString()}
                currency={data.currency}
                vatMinor={data.vatSumMinor}
                vatEnabled={form.vatEnabled}
                vatIncluded={form.vatIncluded}
                totalMinor={total.toString()}
                totalQty={totalQty}
                profitMinor={profitMinor}
                readOnly={!editableLines}
                onToggleVatEnabled={(v) => setForm((s) => s && { ...s, vatEnabled: v })}
                onToggleVatIncluded={(v) => setForm((s) => s && { ...s, vatIncluded: v })}
              />
            </div>
          </DetailContentTabs>
        </div>

        <div className="mt-4">
          <AttributesEditor
            entity="SalesReturn"
            values={form.attributes}
            onChange={(next) => setForm((f) => f && { ...f, attributes: next })}
            disabled={!editableLines}
            testIdPrefix="sales-return"
          />
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
          setForm(
            (s) =>
              s && {
                ...s,
                agentId: item.id,
                agentLabel: String(item.primary),
                contractId: null,
                contractLabel: '',
                agentAccountId: null,
                agentAccountLabel: '',
              },
          )
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
            demandPositionId: null,
            quantity: '1',
            priceMinor: resolveDefaultSalePriceOrZero(raw?.salePrices),
            discount: '0',
            vat: raw?.vat != null ? String(raw.vat) : '12',
            vatEnabled: form.vatEnabled,
            stock: raw?.stock?.onHand,
            available: raw?.stock?.available,
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
            priceMinor: resolveDefaultSalePriceOrZero(raw?.salePrices),
            vat: raw?.vat != null ? String(raw.vat) : '12',
            stock: raw?.stock?.onHand,
            available: raw?.stock?.available,
          });
        }}
      />

      {/* Per-row «Страна» picker for the customs block. */}
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

      {/* «Курс валюты документа» — admin currency-справочник rate editor (mirror /new). */}
      {form.currency !== 'UZS' && (
        <CurrencyRateModal
          open={rateModalOpen}
          onOpenChange={setRateModalOpen}
          currency={form.currency}
          referenceRate={adminRate ?? '1'}
          currentOverride={rateOverride}
          onApply={setRateOverride}
        />
      )}

      {/* «Отправить» — email this return with the chosen print form pre-attached. */}
      <SendEmailDialog
        open={emailOpen}
        onClose={() => {
          setEmailOpen(false);
          setEmailAttachments([]);
        }}
        entity="SalesReturn"
        entityId={data.id}
        defaultSubject={`${tDetailTitles('sales_return')} ${data.name}`}
        defaultBodyHtml={`<p>${tDetailTitles('sales_return')} ${data.name}</p>`}
        initialAttachments={emailAttachments}
      />

      {/* «Печать ▸ Комплект…» — bundle several forms into one PDF for this return. */}
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
      {spiska && <ReceiptPrintPortal data={spiska} onClose={() => setSpiska(null)} />}
    </div>
  );
}
