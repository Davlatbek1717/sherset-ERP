'use client';

/**
 * /purchase-returns/[id] — moysklad-parity «Возврат поставщику» detail/edit page.
 *
 * Mirrors the audited supplier-side sibling `supplies/[id]` (Приёмка ↔ Возврат
 * поставщику are the receipt/return pair) and the already-1:1 create editor
 * `purchase-returns/new`:
 *
 *   - shared standalone <DocumentHeader> (number + date + «Проведено» + custom
 *     «Статус» pill + owner popover) instead of the legacy DetailHeader.
 *   - <DocumentMetaRow fixedWidth> row-paired meta grid identical to /new:
 *       Row 1  Организация (+ «Сум» account sub-row) · Склад
 *       Row 2  Контрагент (+ «Баланс» sub-line) · Договор
 *       Row 3  Проект
 *       Row 4  Валюта документа (+ rate, CurrencyRateModal)
 *   - positions render «Ячейка» (CellPickerField) + «Остаток» columns.
 *
 * Removed vs the legacy page (grounded /new + live capture have none of these):
 * «Причина», «Счёт контрагента», «Внешний код». The custom «Статус» pill replaces
 * the built-in draft/posted/cancelled FSM dropdown (the FSM stays reachable via
 * «Проведено»). The «Создать документ» / «Печать ▾» / «Отправить ▾» dropdown menus
 * are deferred (need new BE endpoints); template print via `printEntity` is kept.
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
import { ReceiptPrintPortal } from '@/components/pick-list/receipt-print-portal';
import { usePrintTemplatesManager } from '@/components/print/print-templates-provider';
import { type KitPrintForm, KitPrintModal } from '@/components/purchase-orders/kit-print-modal';
import { SendEmailDialog } from '@/components/send-email-dialog';
import { useApiMutation } from '@/hooks/use-api-mutation';
import { useConflictReload } from '@/hooks/use-conflict-reload';
import { useDestructiveMutation } from '@/hooks/use-destructive-mutation';
import { useDetailNavigation } from '@/hooks/use-detail-navigation';
import { useDocumentEditorLabels } from '@/hooks/use-document-editor-labels';
import { usePickSheet } from '@/hooks/use-pick-sheet';
import { useSaveMutation } from '@/hooks/use-save-mutation';
import { useUnsavedGuard } from '@/hooks/use-unsaved-guard';
import { api } from '@/lib/api-client';
import { docTotals } from '@/lib/doc-totals';
import { distributeAgreementDelta } from '@/lib/position-agreement';
import {
  CatalogPicker,
  CatalogPickerField,
  type DocPositionRow,
  DocumentHeader,
  DocumentMetaField,
  DocumentMetaRow,
  NativeSelect,
  type PickerItem,
  type PositionColumnKey,
  PositionInlineAdd,
  PositionNameCell,
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
  supplyPositionId: string | null;
  quantity: string;
  priceMinor: string;
  discount: string;
  vat: number | null;
  vatEnabled: boolean;
  product: { id: string; name: string; code: string | null; uom: string | null } | null;
  // «Ячейка» — address-storage bin: `cellId` (FK, drives the picker) + `cell` (label).
  cellId: string | null;
  cell: string | null;
}

interface PurchaseReturnDetail {
  id: string;
  version: number;
  name: string;
  state: string;
  applicable: boolean;
  moment: string;
  postedAt: string | null;
  description: string | null;
  sumMinor: string;
  /** ISO currency of the document (e.g. USD), for money formatting. */
  currency: string;
  vatSumMinor: string;
  vatEnabled: boolean;
  vatIncluded: boolean;
  /** moysklad «Статус» — account-defined custom status (PurchaseReturn.statusId),
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
  supply: { id: string; name: string; state: string; purchaseOrderId: string | null } | null;
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
  /** Buy price in minor units — the return line price (NOT salePrices). */
  buyPrice: string | null;
  vat: number | null;
  // moysklad position table shows the product's live stock cluster per row.
  stock?: { onHand: string; reserved: string; inTransit: string; available: string } | null;
}

// Detail-page position row — the PositionTable row shape (keyed on `id`). Mirrors
// supplies/[id]'s DetailPositionRow minus the customs block (the return has no GTD /
// Страна columns), plus the supplyPositionId back-link traced from the source supply.
interface DetailPositionRow extends DocPositionRow {
  assortmentId: string | null;
  supplyPositionId: string | null;
}

function uid(): string {
  return Math.random().toString(36).slice(2);
}

/** ISO moment (UTC) → local `YYYY-MM-DDTHH:MM` — the string <DocumentHeader>
 *  expects (mirrors supplies/[id]'s momentToLocalInput so the header reads/writes
 *  the same shape). */
function momentToLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// moysklad «Возврат поставщику» position columns (live-grounded 2026-06-29, mirror
// /new): always-on = Наименование · Кол-во · Ячейка · Остаток · Цена · НДС · Сумма.
// The ⚙ on «Сумма» toggles the rest; «Цена» is a PLAIN header (no «Расценить») and
// «Скидка» is gear-toggle-off by default — the grounded return shows neither.
const OPTIONAL_POSITION_COLUMNS: { key: PositionColumnKey; labelKey: string; on: boolean }[] = [
  { key: 'image', labelKey: 'image', on: false },
  { key: 'unit', labelKey: 'unit', on: false },
  { key: 'discount', labelKey: 'discount', on: false },
  { key: 'vatAmount', labelKey: 'vatAmount', on: false },
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
  description: string;
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

function formFromData(d: PurchaseReturnDetail): FormState {
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
    description: d.description ?? '',
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
    // as the stable React key; carry supplyPositionId so save round-trips the back-link.
    positions: d.positions.map((p) => ({
      id: p.id,
      assortmentId: p.assortmentId,
      productLabel: p.product?.name ?? '—',
      productCode: p.product?.code ?? undefined,
      productUom: p.product?.uom ?? null,
      supplyPositionId: p.supplyPositionId ?? null,
      quantity: p.quantity,
      priceMinor: p.priceMinor,
      discount: p.discount,
      vat: p.vat != null ? String(p.vat) : '',
      vatEnabled: p.vatEnabled,
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
    contractId: s.contractId,
    projectId: s.projectId,
    organizationAccountId: s.organizationAccountId,
    description: s.description,
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
      cell: p.cell ?? null,
    })),
    attributes: s.attributes,
  });
}

export default function PurchaseReturnDetailPage() {
  const { id } = useParams<{ id: string }>();
  const detailNav = useDetailNavigation('purchase-returns', id);
  const docEditorLabels = useDocumentEditorLabels();
  const router = useRouter();
  const qc = useQueryClient();
  const t = useTranslations('pages.purchase_returns');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tDetailTitles = useTranslations('detail_titles');
  const tDetailForm = useTranslations('detail_form');
  const tDetailTabs = useTranslations('detail_tabs');
  const tForm = useTranslations('form');
  const tPos = useTranslations('position_editor');
  const tCols = useTranslations('position_cols');
  const tPrint = useTranslations('print_menu');
  const tSheet = useTranslations('pages.pickLists');
  // Omborchi varag'i (yacheykali, narxsiz) — `hooks/use-pick-sheet.ts`.
  const { sheet, openSheet, closeSheet } = usePickSheet();
  const tCreate = useTranslations('create_related');

  const { data, isLoading } = useQuery<PurchaseReturnDetail>({
    queryKey: ['purchase-return', id],
    queryFn: () => api.get(`/purchase-returns/${id}`),
  });

  // moysklad «Статус» — the account's custom return statuses (State rows,
  // entityType="purchasereturn"); drives the header pill options. Mirror /new.
  const { data: statusData } = useQuery<{
    items: Array<{ id: string; name: string; color: string | null }>;
  }>({
    queryKey: ['states', 'purchasereturn'],
    queryFn: () => api.get('/states?entityType=purchasereturn&archived=false&limit=250'),
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

  // moysklad «Печать» / «Отправить» — the account's own «Возврат поставщику» print
  // forms (PDF), listed by name. Mirror supplies/[id]. The settings-gated template
  // CRUD lives behind «Настроить…»; this read is view-permission only.
  const { data: printForms } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ['purchase-return-print-forms'],
    queryFn: () => api.get<Array<{ id: string; name: string }>>('/purchase-returns/print-forms'),
    staleTime: 60_000,
  });
  const { openTemplates } = usePrintTemplatesManager();

  const [form, setForm] = useState<FormState | null>(null);
  const [original, setOriginal] = useState<string>('');
  const [openPicker, setOpenPicker] = useState<
    null | 'agent' | 'org' | 'store' | 'contract' | 'project' | 'organizationAccount'
  >(null);
  const [openCatalogPicker, setOpenCatalogPicker] = useState(false);
  const [productRowId, setProductRowId] = useState<string | null>(null);
  const [colVisible, setColVisible] = useState<Record<string, boolean>>(DEFAULT_COL_VISIBLE);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
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
  // «Курс валюты документа» override — the account's currency-справочник rate edited
  // via the ✎ → CurrencyRateModal (mirror /new). Not persisted on a posted return.
  const [rateOverride, setRateOverride] = useState<string | null>(null);
  const [rateModalOpen, setRateModalOpen] = useState(false);
  // «Отправить» email composer + «Печать ▸ Комплект…» dialog (mirror supplies/[id]).
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailAttachments, setEmailAttachments] = useState<{ id: string; filename: string }[]>([]);
  const [kitPrintOpen, setKitPrintOpen] = useState(false);
  const onConflict = useConflictReload(['purchase-return', id], () => setForm(null));

  useEffect(() => {
    if (data && !form) {
      const initial = formFromData(data);
      setForm(initial);
      setOriginal(snapshot(initial));
    }
  }, [data, form]);

  const isDirty = useMemo(() => (form ? snapshot(form) !== original : false), [form, original]);
  useUnsavedGuard(isDirty);

  // ── Position table callbacks (mirror supplies/[id]) — all mutate form.positions ──
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
    mutationFn: (target: string) => api.post(`/purchase-returns/${id}/transitions/${target}`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-return', id] });
      qc.invalidateQueries({ queryKey: ['purchase-returns'] });
      if (data?.supply) qc.invalidateQueries({ queryKey: ['supply', data.supply.id] });
    },
  });

  // moysklad «Статус» — set the account custom status (PurchaseReturn.statusId) on
  // the header pill. Applied IMMEDIATELY via its own endpoint, so it stays editable
  // even on a posted return (status is orthogonal to «Проведено»). Mirror /new + PO.
  const setStatusMut = useApiMutation({
    mutationFn: (statusId: string) => api.patch(`/purchase-returns/${id}/status`, { statusId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-return', id] });
      qc.invalidateQueries({ queryKey: ['purchase-returns'] });
    },
  });

  const deleteMut = useApiMutation({
    mutationFn: () => api.delete(`/purchase-returns/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-returns'] });
      router.push('/purchase-returns');
    },
  });

  const cloneMut = useApiMutation({
    mutationFn: () => api.post<{ id: string }>(`/purchase-returns/${id}/clone`, {}),
    onSuccess: (clone) => {
      qc.invalidateQueries({ queryKey: ['purchase-returns'] });
      router.push(`/purchase-returns/${clone.id}`);
    },
  });

  // moysklad «Создать документ → Счёт-фактура выданный» — §66 backend generates (or
  // reuses) the outgoing facture for this return, then opens it. Входящий платёж /
  // Приходный ордер (money returned by the supplier) aren't wired yet — shown greyed
  // as label-parity placeholders, mirroring how demands/[id] lists its unbuilt docs.
  const createFactureMut = useApiMutation({
    mutationFn: () =>
      api.post<{ id: string }>('/factures-out/generate/from-purchase-return', {
        purchaseReturnId: id,
      }),
    onSuccess: (facture) => {
      qc.invalidateQueries({ queryKey: ['purchase-return', id] });
      router.push(`/factures-out/${facture.id}`);
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
        vatEnabled: form.vatEnabled,
        vatIncluded: form.vatIncluded,
        // moysklad parity — Договор / Проект are document metadata.
        contractId: form.contractId,
        projectId: form.projectId,
        organizationAccountId: form.organizationAccountId,
        // «Владелец» / «Владелец-отдел» / «Общий доступ» — metadata, editable on a
        // draft (the backend rejects ANY edit on a posted return before applying).
        ownerId: form.ownerId,
        groupId: form.groupId,
        shared: form.shared,
      };
      // moysklad parity: send the full editable set (agent / org / store / currency /
      // positions) whether the return is a DRAFT or ПРОВЕДЁН — the backend re-posts a
      // posted return on save (unpost → edit → re-post). Only a cancelled doc is locked.
      if (data.state !== 'cancelled') {
        if (form.moment) payload.moment = new Date(form.moment).toISOString();
        payload.agentId = form.agentId;
        payload.organizationId = form.organizationId;
        payload.storeId = form.storeId;
        payload.currency = form.currency;
        payload.positions = form.positions.map((p) => ({
          assortmentKind: 'product',
          // biome-ignore lint/style/noNonNullAssertion: a product is always picked before save
          assortmentId: p.assortmentId!,
          // Pass quantity/discount as RAW Decimal strings — a Number() round-trip
          // loses precision (the money helper warns about this) and diverges from
          // /new; the Zod schema coerces the string.
          quantity: p.quantity,
          priceMinor: p.priceMinor,
          discount: p.discount || '0',
          vat: p.vat ? Number(p.vat) : undefined,
          vatEnabled: p.vatEnabled,
          // «Ячейка» — address-storage bin (cellId drives per-cell stock on post).
          ...(p.cellId ? { cellId: p.cellId } : {}),
          ...(p.cell ? { cell: p.cell } : {}),
        }));
      }
      payload.attributes = form.attributes;
      return api.patch(`/purchase-returns/${id}`, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-return', id] });
      qc.invalidateQueries({ queryKey: ['purchase-returns'] });
      if (form) setOriginal(snapshot(form));
    },
    // A posted-return edit re-posts (unpost → edit → re-post); if the re-post step
    // fails (e.g. the edit oversells the store) the document is left as a DRAFT with
    // stock restored. Refetch so `data.state` reflects that (the «Проведено» toggle
    // flips to draft); the form keeps the user's edits so they can fix + re-save.
    onError: () => {
      qc.invalidateQueries({ queryKey: ['purchase-return', id] });
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

  // moysklad «Возврат поставщику» position columns (fixed + optional, customizer).
  // Mirror /new's positionColumns; the customizer is disabled when posted.
  const editableCols = data?.state !== 'cancelled';
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
    applyDiscountMarkup,
    selectedRowIds.size,
  ]);

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

  // moysklad parity: a saved «Возврат поставщику» is fully editable whether it's a
  // DRAFT or ПРОВЕДЁН (posted) — only a cancelled document is read-only. Saving a
  // posted return re-books stock server-side (unpost → edit → re-post). Kept locked
  // only for a cancelled doc.
  const editableLines = data.state !== 'cancelled';
  // «Валюта документа» rate helper — moysklad shows «1 USD = N UZS» next to a
  // non-base currency, sourced from the account's currency rate (mirror /new).
  const selectedCurrency = currencies.find((c) => c.isoCode === form.currency);
  const isBaseCurrency = (form.currency ?? 'UZS') === 'UZS';
  const adminRate = selectedCurrency?.rate;
  const effectiveRate = rateOverride ?? adminRate ?? '1';
  const sumBig = BigInt(data.sumMinor || '0');
  const vatBig = BigInt(data.vatSumMinor || '0');
  const { subtotal, total } = docTotals(sumBig, vatBig);
  const totalQty = form.positions.reduce((acc, p) => acc + Number(p.quantity || 0), 0);

  // moysklad «Статус» pill — the account's custom return statuses (grey «Статус»
  // when none configured). FSM post/unpost lives on «Проведено» (orthogonal), exactly
  // like /new + PO. Applied immediately via setStatusMut.
  const statusOptions = customStatuses.map((s) => ({
    value: s.id,
    label: s.name,
    color: s.color ?? undefined,
  }));
  const onApplicableChange =
    data.state === 'cancelled'
      ? undefined
      : (next: boolean) => transitionMut.mutate(next ? 'post' : 'unpost');

  // ----- «Печать» menu (moysklad parity, mirror supplies/[id]) -------------
  // This detail page is a single record → every print acts on THIS return
  // (ids = [data.id]). A custom form downloads via bulk-print(templateId); the
  // built-in «Возврат поставщику» form also goes through bulk-print (no HTML
  // print view exists for the return). Each download flips the printed flag
  // server-side, so we refetch after.
  const printForm = (templateId?: string) => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    void api
      .postDownload(
        '/purchase-returns/bulk-print',
        { ids: [data.id], ...(templateId ? { templateId } : {}) },
        `purchase-return-${data.name}-${stamp}.pdf`,
      )
      .then(() => qc.invalidateQueries({ queryKey: ['purchase-return', id] }));
  };
  const kitPrint = (templateIds: Array<string | null>) => {
    if (templateIds.length === 0) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    void api
      .postDownload(
        '/purchase-returns/kit-print',
        { ids: [data.id], templateIds },
        `purchase-return-${data.name}-kit-${stamp}.pdf`,
      )
      .then(() => qc.invalidateQueries({ queryKey: ['purchase-return', id] }));
  };
  const kitForms: KitPrintForm[] = [
    { id: null, name: tDetailTitles('purchase_return') },
    ...(printForms ?? []).map((f) => ({ id: f.id, name: f.name })),
  ];
  const printMenuItems: CreateMenuItem[] = [
    // The account's own custom «Возврат поставщику» forms (bulk-print via templateId).
    ...(printForms ?? []).map((f) => ({
      id: `form-${f.id}`,
      label: f.name,
      onSelect: () => printForm(f.id),
    })),
    // The standard built-in «Возврат поставщику» form — downloads via bulk-print
    // (the return has no HTML print view, unlike the supply).
    { id: 'standard', label: tDetailTitles('purchase_return'), onSelect: () => printForm() },
    // Omborchi varag'i — yacheyka bo'yicha, NARXSIZ (qaytarish: javondan OLISH).
    {
      id: 'spiska',
      label: tSheet('spiska_form'),
      onSelect: () =>
        void openSheet({
          title: tSheet('sheet_title_pick'),
          number: data.name,
          moment: form.moment,
          agentName: form.agentLabel || null,
          ownerName: form.ownerLabel || null,
          description: form.description || null,
          rows: form.positions,
        }),
    },
    // «Комплект…» — bundle several forms into one PDF.
    { id: 'set', label: tPrint('set'), onSelect: () => setKitPrintOpen(true) },
    // «Настроить…» — right-side «Настройка шаблонов» slide-over for the return.
    {
      id: 'configure',
      label: tPrint('configure'),
      onSelect: () => openTemplates('purchasereturn'),
    },
  ];

  // ----- «Отправить» menu (moysklad parity) --------------------------------
  // Lists the SAME forms as «Печать» to email: clicking a form renders THIS
  // return through it, stores the PDF as an attachment and opens the composer
  // with it pre-attached (POST :id/print-attachment → {attachmentId}). Sending
  // also flips the doc's published flag (list «Отправлено» pill).
  const sendForm = async (templateId?: string) => {
    const att = await api.post<{ attachmentId: string; filename: string }>(
      `/purchase-returns/${data.id}/print-attachment`,
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
      label: tDetailTitles('purchase_return'),
      onSelect: () => void sendForm(),
    },
  ];

  // ----- «Создать документ» menu (moysklad parity) -------------------------
  // Счёт-фактура выданный is wired (§66 from-purchase-return backend). Входящий
  // платёж / Приходный ордер (the supplier's refund) have no create-from-return
  // backend yet → rendered disabled (label-parity placeholders, like demands/[id]).
  const createMenuItems: CreateMenuItem[] = [
    {
      id: 'facture-out',
      label: tCreate('facture_out'),
      onSelect: () => createFactureMut.mutate(),
    },
    { id: 'payment-in', label: tCreate('payment_in_single'), disabled: true },
    { id: 'cash-in', label: tCreate('cash_in_single'), disabled: true },
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

  // «Ячейка» — address-storage cell picker (mirror /new + supplies/[id]). The closure
  // carries form.storeId + the row's product so the picker can filter «С этим товаром».
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

  return (
    <div
      className="flex min-h-screen flex-col bg-[var(--ms-bg-page)]"
      data-test-id="purchase-return-detail-page"
    >
      <DetailToolbar
        isDirty={isDirty}
        isSaving={saveMut.isPending}
        onSave={() => saveMut.mutate()}
        onClose={() => router.push('/purchase-returns')}
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
        printEntity="purchasereturn"
      />

      {/* Editable shared <DocumentHeader> (mirrors supplies/[id]), rendered standalone
          below the toolbar. № is auto-assigned (no editable name field) so it stays
          read-only; date is editable on a draft. «Проведено» drives the server-side
          FSM via the transition mutation. The custom «Статус» pill + owner popover sit
          top-right (editable while the return is a draft). */}
      <DocumentHeader
        {...docEditorLabels}
        documentTypeLabel={tDetailTitles('purchase_return')}
        number={data.name}
        date={form.moment}
        onDateChange={editableLines ? (v) => setForm((f) => f && { ...f, moment: v }) : undefined}
        status={data.status?.id ?? ''}
        statusOptions={statusOptions}
        onStatusChange={(sid) => setStatusMut.mutate(sid)}
        onConfigureStatuses={() => router.push('/settings/purchase-return-statuses')}
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
            <DocumentHistoryLink auditEntity="PurchaseReturn" entityId={data.id} />
          </div>
        }
      />

      <main className="flex-1 px-4 py-4">
        {/* Errors surface as toasts (save / transition mutations auto-toast); the
            optimistic-lock 409 is handled by onConflict. Only the posted-lock notice
            stays as an inline banner. */}
        {/* moysklad parity: a posted «Возврат» is editable (no read-only banner). Saving
            re-books stock server-side. The «Проведено» checkbox stays the post/unpost
            toggle; a cancelled doc is the only read-only state. */}

        {/* moysklad b-operation-form-top — ROW-PAIRED meta grid identical to /new:
            Организация(+«Сум» account subRow)‖Склад · Контрагент(+Баланс)‖Договор ·
            Проект‖∅ · Валюта документа(+rate)‖∅. Posted returns stay read-only. */}
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
                disabledHint={tForm('select_supplier_first')}
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
          </DocumentMetaRow>
        </div>

        <div className="mt-4">
          <DetailContentTabs
            auditEntity="PurchaseReturn"
            entityId={data.id}
            relatedGroups={[]}
            positionsLabel={tDetailTabs('positions')}
            filesSlot={<AttachmentsSection entity="PurchaseReturn" entityId={data.id} />}
            tasksSlot={<DocumentTasksSection entity="PurchaseReturn" entityId={data.id} />}
            historyInline={false}
            relatedSlot={
              <RelatedDocsTab
                current={{
                  id: data.id,
                  name: data.name,
                  moment: data.moment,
                  state: data.state,
                  sumMinor: data.sumMinor,
                  kind: 'purchase-return',
                }}
                // «Привязать документ» — the tab owns the «Привязка документа»
                // modal (pre-scoped to this return's refs) + manual links +
                // unlink + the «?link=new» auto-open hand-off.
                linkable={{
                  entityType: 'PurchaseReturn',
                  agent: data.agent,
                  organization: data.organization,
                  storeTo: data.store,
                }}
                // The source «Приёмка» (linked supply) — straight from findById, no
                // extra fetch (no /purchase-returns/:id/related endpoint exists yet).
                linked={
                  data.supply
                    ? [
                        {
                          id: data.supply.id,
                          name: data.supply.name,
                          moment: data.moment,
                          state: data.supply.state,
                          sumMinor: '0',
                          kind: 'supply' as const,
                        },
                      ]
                    : []
                }
              />
            }
          >
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="min-w-0">
                {/* Owner 2026-07-23: «Договорная цена» — blue, at the table's OUTER
                    top-right corner (same spot in every section). */}
                <div className="-mb-2.5 flex justify-end">
                  <PositionAgreementButton
                    totalMinor={total}
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
                              // Pick modal (owner 2026-07-18): reference «Цена» = the same
                              // default the row would get (buy price on purchase docs).
                              priceMinor: p.buyPrice ?? '0',
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
                        // owner 2026-07-18: qty/price modal on EVERY product-add search
                        // (was sales-only). No price-scope checkboxes here — writing a
                        // permanent SALE price from a purchase price would be wrong.
                        pickModal={{
                          currency: form.currency,
                          permanentPriceOption: false,
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
                                      supplyPositionId: null,
                                      quantity: entry?.quantity ?? '1',
                                      priceMinor: entry?.priceMinor ?? raw?.buyPrice ?? '0',
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
                                        supplyPositionId: null,
                                        quantity: Number(quantity) > 0 ? quantity : '1',
                                        priceMinor: raw?.buyPrice ?? '0',
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

                {/* «Комментарий» — moysklad places it below the positions (mirror
                    supplies/[id]). The return has no «Внешний код» field. */}
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
            entity="PurchaseReturn"
            values={form.attributes}
            onChange={(next) => setForm((f) => f && { ...f, attributes: next })}
            disabled={!editableLines}
            testIdPrefix="purchase-return"
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
            supplyPositionId: null,
            quantity: '1',
            priceMinor: raw?.buyPrice ?? '0',
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
            priceMinor: raw?.buyPrice ?? '0',
            vat: raw?.vat != null ? String(raw.vat) : '12',
            stock: raw?.stock?.onHand,
            available: raw?.stock?.available,
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
        entity="PurchaseReturn"
        entityId={data.id}
        defaultSubject={`${tDetailTitles('purchase_return')} ${data.name}`}
        defaultBodyHtml={`<p>${tDetailTitles('purchase_return')} ${data.name}</p>`}
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
      {sheet && <ReceiptPrintPortal data={sheet} onClose={closeSheet} />}
    </div>
  );
}
