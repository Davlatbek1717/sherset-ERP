'use client';

/**
 * /losses/[id] — moysklad-parity «Списание» (write-off) detail editor.
 *
 * Converged onto the /losses/new document-editor SKELETON (and the proven
 * /enters/[id] detail shell): the same `DocumentHeader` + bare 2-column meta
 * grid (Организация‖Склад · Проект‖Статья расходов · Валюта документа) +
 * `PositionTable` (image · Ячейка · Остаток · Цена ▾ · Сумма · Причина списания
 * + ⚙ trailing customizer) + the bottom «Комментарий» / «Итого» band. On top of
 * the create shell it adds the DETAIL-only bits a saved document needs (mirror
 * the gold-standard purchase-orders/[id] / enters/[id]): prev/next nav,
 * clone/delete, the owner label + «Изменения» history link on the toolbar row,
 * the «Связанные документы» / «Файлы» / «Задачи» / «Изменения» tabs, the
 * attributes editor and the posted-lock banner.
 *
 * Internal stock-OUT: no counterparty, no VAT, no discount. A single «Склад», a
 * required «Статья расходов» + «Валюта документа», a per-line «Причина списания»
 * / «Ячейка», and READ-ONLY «Цена»/«Сумма» previews of the себестоимость. The cost
 * is a PRODUCT property, NOT tied to «Остаток»: a POSTED line shows its frozen
 * costMinor; a DRAFT line shows the store weighted-average when stocked, else the
 * product cost (buyPrice) — never empty even at 0/negative stock. The form never
 * enters a per-line cost.
 *
 * POSTED-LOCK: unlike an enter, a POSTED Списание is fully read-only — the BE
 * `LossService.update()` rejects every edit on a posted doc ("Provedeno loss'ni
 * o'zgartirib bo'lmaydi"). So `editable = !data.applicable`: the meta + positions
 * are editable only while the doc is a draft. (This is a deliberate difference
 * from enters/[id], which keeps a posted enter editable.)
 */

import { AttachmentsSection } from '@/components/attachments-section';
import { AttributesEditor } from '@/components/attributes-editor';
import { RelatedDocsTab } from '@/components/customer-orders/related-docs-tab';
import {
  DetailContentTabs,
  DetailToolbar,
  DocumentHistoryLink,
} from '@/components/document-detail';
import { CurrencyRateModal } from '@/components/document-detail/currency-rate-modal';
import { DocumentTasksSection } from '@/components/document-tasks-section';
import { CellPickerField } from '@/components/documents/cell-picker-field';
import { PositionAgreementButton } from '@/components/documents/position-agreement-modal';
import { PositionColumnCustomizer } from '@/components/documents/position-column-customizer';
import { ReceiptPrintPortal } from '@/components/pick-list/receipt-print-portal';
import { usePrintTemplatesManager } from '@/components/print/print-templates-provider';
import { useApiMutation } from '@/hooks/use-api-mutation';
import { useConflictReload } from '@/hooks/use-conflict-reload';
import { useDestructiveMutation } from '@/hooks/use-destructive-mutation';
import { useDetailNavigation } from '@/hooks/use-detail-navigation';
import { useDocumentEditorLabels } from '@/hooks/use-document-editor-labels';
import { usePickSheet } from '@/hooks/use-pick-sheet';
import { useSaveMutation } from '@/hooks/use-save-mutation';
import { useUnsavedGuard } from '@/hooks/use-unsaved-guard';
import { api } from '@/lib/api-client';
import { DOC_STATE_VERB } from '@/lib/doc-state-dropdown';
import { DEFAULT_LOSS_EXPENSE_ITEM_NAME } from '@/lib/expense-items';
import { imageRawUrl } from '@/lib/image-url';
import { isOptimisticConflict } from '@/lib/optimistic-lock';
import { distributeAgreementDelta } from '@/lib/position-agreement';
import { scaleMinorByQty } from '@moysklad/money';
import {
  Alert,
  Button,
  CatalogPicker,
  CatalogPickerField,
  type DocPositionRow,
  DocumentHeader,
  DocumentMetaField,
  DocumentMetaRow,
  Icons,
  Input,
  NativeSelect,
  type PickerItem,
  type PositionColumnKey,
  PositionInlineAdd,
  PositionNameCell,
  PositionTable,
  type PositionTableColumnConfig,
  Textarea,
  formatMoney,
} from '@moysklad/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

type LossReason = 'damaged' | 'expired' | 'theft' | 'quality' | 'other';

interface PositionDetail {
  id: string;
  position: number;
  assortmentKind: string;
  assortmentId: string;
  quantity: string;
  // «Себестоимость списания» — frozen at post (NULL on a draft); the read-only
  // «Цена»/«Сумма» preview basis (066d55fb valuation parity).
  costMinor: string | null;
  // moysklad «Причина списания» / «Ячейка» — per-line free text (round-tripped
  // so an edit-save doesn't wipe what /losses/new set).
  reason: string | null;
  // «Ячейка» (address-storage cell) — the picked cell id + its «Зона / Ячейка» label.
  cellId: string | null;
  cell: string | null;
  product: {
    id: string;
    name: string;
    code: string | null;
    uom: string | null;
    // «Цена» basis for a DRAFT line with no frozen costMinor (себестоимость is a
    // product property, NOT derived from «Остаток»).
    buyPrice: string | null;
  } | null;
}

interface LossDetail {
  id: string;
  version: number;
  name: string;
  externalCode: string | null;
  state: string;
  applicable: boolean;
  moment: string;
  postedAt: string | null;
  // doc-level write-off reason enum (no UI here — round-tripped on save so the BE
  // default isn't lost; the per-line «Причина списания» lives on each position).
  reason: LossReason;
  description: string | null;
  sumMinor: string;
  /** «Статья расходов» — stored as the ExpenseItem NAME (free-form string). */
  expenseItem: string | null;
  /** «Валюта документа» — the doc's saved currency (real /currencies). */
  currency: string;
  /** Per-document exchange rate ×1e8 (rate = rateValue / 1e8). */
  rateValue: string;
  organization: { id: string; name: string };
  store: { id: string; name: string };
  project: { id: string; name: string } | null;
  owner: { id: string; name: string } | null;
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
  uom: string | null;
  // «Цена» = product cost (себестоимость) by default — shown independent of «Остаток».
  buyPrice: string | null;
  mainImageId?: string | null;
  stock?: { onHand: string; reserved: string; inTransit: string; available: string } | null;
  productFolder?: { id: string; name: string; pathName: string } | null;
}

// Account currency (Настройки → Валюты) — mirror /new: `isoCode` = UZS/USD…,
// `default` = base, `rateValue` (×1e8) / `rate` = value vs the base currency.
interface CurrencyItem {
  id: string;
  isoCode: string;
  name: string;
  default: boolean;
  rateValue: string;
  rate: string;
}

// Live store stock + weighted-average cost preview (GET /stocks) — drives the
// «Остаток» (qty) and read-only «Цена»/«Сумма» (себестоимость) columns.
interface StockItem {
  assortmentId: string;
  qty: string;
  costBalanceMinor: string;
}

// Detail-page position row — the PositionTable row shape (keyed on `id`). Mirrors
// /new's NewPositionRow: carries assortmentId + folderPath for «Наименование ▾ →
// С учётом групп».
interface DetailPositionRow extends DocPositionRow {
  assortmentId: string | null;
  folderPath?: string;
}

function uid(): string {
  return Math.random().toString(36).slice(2);
}

/** ISO moment (UTC) → local `YYYY-MM-DDTHH:MM` — the string <DocumentHeader>
 *  expects (mirrors /new's docDate initialiser). */
function momentToLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// moysklad #loss «⚙» customizer — the optional position columns. The grounded
// default grid (docs/audits/losses-new-2026-06-25/10-editor-full.png) shows:
// Наименование · Кол-во · Ячейка · Остаток · Цена · Сумма · Причина списания.
// «Цена»/«Сумма» (себестоимость) are always-on; these toggle the rest.
const OPTIONAL_POSITION_COLUMNS: { key: PositionColumnKey; labelKey: string; on: boolean }[] = [
  { key: 'image', labelKey: 'image', on: false },
  { key: 'unit', labelKey: 'unit', on: true },
  { key: 'cell', labelKey: 'cell', on: true },
  { key: 'stock', labelKey: 'stock', on: true },
  { key: 'reason', labelKey: 'write_off_reason', on: true },
];
const DEFAULT_COL_VISIBLE: Record<string, boolean> = Object.fromEntries(
  OPTIONAL_POSITION_COLUMNS.map((c) => [c.key, c.on]),
);

interface FormState {
  /** «от» — editable document moment, as the local `YYYY-MM-DDTHH:MM` string. */
  moment: string;
  organizationId: string;
  organizationLabel: string;
  storeId: string;
  storeLabel: string;
  projectId: string | null;
  projectLabel: string;
  /** «Статья расходов» — the ExpenseItem NAME (default «Списания»). */
  expenseItem: string;
  /** Resolved ExpenseItem id (from /expense-items by name), optional. */
  expenseItemId: string | null;
  externalCode: string;
  description: string;
  /** doc-level write-off reason enum — round-tripped (no UI), preserves the BE value. */
  reason: LossReason;
  /** «Валюта документа» — editable while the loss is a draft. */
  currency: string;
  /** Per-document exchange rate in MAJOR units (e.g. «12200» for 1 USD = 12 200 UZS),
   *  editable via the «1 USD = N UZS ✎». Stored as rateValue = rate × 1e8. */
  rate: string;
  /** «Владелец» / «Общий доступ» — read-only here (the BE update can't persist them). */
  ownerLabel: string;
  shared: boolean;
  positions: DetailPositionRow[];
  attributes: Record<string, unknown>;
}

function formFromData(d: LossDetail): FormState {
  return {
    moment: momentToLocalInput(d.moment),
    organizationId: d.organization.id,
    organizationLabel: d.organization.name,
    storeId: d.store.id,
    storeLabel: d.store.name,
    projectId: d.project?.id ?? null,
    projectLabel: d.project?.name ?? '',
    expenseItem: d.expenseItem ?? DEFAULT_LOSS_EXPENSE_ITEM_NAME,
    expenseItemId: null,
    externalCode: d.externalCode ?? '',
    description: d.description ?? '',
    reason: d.reason,
    currency: d.currency || 'UZS',
    // doc's stored rate → major units (rateValue / 1e8). UZS ⇒ «1».
    rate: d.rateValue ? String(Number(d.rateValue) / 1e8) : '1',
    ownerLabel: d.owner?.name ?? '',
    shared: d.shared ?? false,
    // PositionTable keys on `id` (DocPositionRow.id) — use the persisted position
    // id as the stable React key. priceMinor = the frozen себестоимость on a posted
    // doc; on a draft it's re-synced from /stocks (avg unit cost) by the effect below.
    positions: d.positions.map((p) => ({
      id: p.id,
      assortmentId: p.assortmentId,
      productLabel: p.product?.name ?? '—',
      productCode: p.product?.code ?? undefined,
      productUom: p.product?.uom ?? null,
      quantity: p.quantity,
      // «Цена»: a POSTED line shows its frozen себестоимость (costMinor); a DRAFT
      // line (costMinor NULL) shows the product cost (buyPrice) — never empty.
      priceMinor: p.costMinor ?? p.product?.buyPrice ?? '0',
      discount: '0',
      vat: '',
      vatEnabled: false,
      reason: p.reason ?? undefined,
      // «Ячейка» — pre-fill a previously-picked cell so the picker round-trips.
      cellId: p.cellId ?? null,
      cell: p.cell ?? undefined,
    })),
    attributes: (d as { attributes?: Record<string, unknown> }).attributes ?? {},
  };
}

function snapshot(s: FormState): string {
  return JSON.stringify({
    moment: s.moment,
    organizationId: s.organizationId,
    storeId: s.storeId,
    projectId: s.projectId,
    expenseItem: s.expenseItem,
    externalCode: s.externalCode,
    description: s.description,
    reason: s.reason,
    currency: s.currency,
    rate: s.rate,
    positions: s.positions.map((p) => ({
      assortmentId: p.assortmentId,
      quantity: p.quantity,
      reason: p.reason ?? null,
      cell: p.cell ?? null,
    })),
    attributes: s.attributes,
  });
}

export default function LossDetailPage() {
  const { id } = useParams<{ id: string }>();
  // moysklad toolbar «N из ВСЕГО ‹ ›» — server-backed so the REAL total shows even
  // on a direct URL + the arrows walk the whole list (mirror enters/[id]).
  const detailNav = useDetailNavigation('losses', id, { server: true });
  const docEditorLabels = useDocumentEditorLabels();
  const router = useRouter();
  const qc = useQueryClient();
  const t = useTranslations('pages.losses');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tForm = useTranslations('form');
  const tDetailTitles = useTranslations('detail_titles');
  const tDetailForm = useTranslations('detail_form');
  const tStates = useTranslations('states.loss');
  const tDetailTabs = useTranslations('detail_tabs');
  const tDetailHeader = useTranslations('detail_header');
  const tPos = useTranslations('position_editor');
  const tCols = useTranslations('position_cols');
  const tPrint = useTranslations('print_menu');
  const tSheet = useTranslations('pages.pickLists');
  // Omborchi varag'i (yacheykali, narxsiz) — `hooks/use-pick-sheet.ts`.
  const { sheet, openSheet, closeSheet } = usePickSheet();
  const tPrintLoss = useTranslations('print_menu_loss');

  const { data, isLoading } = useQuery<LossDetail>({
    queryKey: ['loss', id],
    queryFn: () => api.get(`/losses/${id}`),
  });

  // «Печать» — account print forms for Списание (user-created via Настроить…),
  // listed between МБ-8 and Комплект… (mirror the list dropdown + /new).
  const { openTemplates } = usePrintTemplatesManager();
  const { data: printTemplatesData } = useQuery<{ items: Array<{ id: string; name: string }> }>({
    queryKey: ['print-templates-menu', 'loss'],
    queryFn: () => api.get('/print-templates?entity=loss&enabled=true&limit=100'),
    staleTime: 60_000,
  });

  // «Валюта документа» options + rates — the account's REAL currencies (GET
  // /currencies, Настройки → Валюты), NEVER a hardcoded list (mirror /new).
  const { data: currenciesData } = useQuery<{ items: CurrencyItem[] }>({
    queryKey: ['currencies'],
    queryFn: () => api.get('/currencies'),
    staleTime: 60_000,
  });
  const currencies = useMemo(() => currenciesData?.items ?? [], [currenciesData]);

  // «Статья расходов» — the account's expense items (GET /expense-items); used to
  // resolve the loaded expenseItem NAME back to an id for the picker field.
  const { data: expenseItemsData } = useQuery<{ items: Array<{ id: string; name: string }> }>({
    queryKey: ['expense-items'],
    queryFn: () => api.get('/expense-items'),
    staleTime: 60_000,
  });

  const [form, setForm] = useState<FormState | null>(null);
  const [original, setOriginal] = useState<string>('');
  const [openPicker, setOpenPicker] = useState<
    null | 'org' | 'store' | 'project' | 'expense' | { kind: 'product'; rowUid: string }
  >(null);
  const [colVisible, setColVisible] = useState<Record<string, boolean>>(DEFAULT_COL_VISIBLE);
  const [withGroups, setWithGroups] = useState(false);
  const [priceSortDir, setPriceSortDir] = useState<'asc' | 'desc' | null>(null);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [externalCodeVisible, setExternalCodeVisible] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // «1 USD = N UZS ✎» — opens the «Курс валюты документа» rate-override modal.
  const [rateDialogOpen, setRateDialogOpen] = useState(false);
  const onConflict = useConflictReload(['loss', id], () => setForm(null));

  useEffect(() => {
    if (data && !form) {
      const initial = formFromData(data);
      setForm(initial);
      setOriginal(snapshot(initial));
      setExternalCodeVisible(Boolean(data.externalCode));
    }
  }, [data, form]);

  // Resolve the loaded «Статья расходов» NAME → ExpenseItem id once both settle
  // (so the picker field can deep-link/edit). NAME stays the source of truth.
  useEffect(() => {
    if (!form || form.expenseItemId || !expenseItemsData || !form.expenseItem) return;
    const match = expenseItemsData.items.find(
      (e) => e.name.toLowerCase() === form.expenseItem.toLowerCase(),
    );
    if (match) setForm((s) => (s ? { ...s, expenseItemId: match.id } : s));
  }, [form, expenseItemsData]);

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
  // «Договорная цена» — distribute the delta across line costs (no VAT here).
  const applyAgreement = useCallback((deltaMinor: bigint) => {
    setForm((s) => {
      if (!s) return s;
      const patch = distributeAgreementDelta(s.positions, deltaMinor, false);
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

  // Store stock + weighted-average cost preview — drives «Остаток» (qty) and the
  // read-only «Цена»/«Сумма» (себестоимость) columns. On a DRAFT only (a posted
  // loss is locked and carries its frozen costMinor, which we must not overwrite).
  // Editable ONLY as a genuine draft — a POSTED loss (applicable) AND a CANCELLED
  // (voided) loss are both terminal/read-only (the BE rejects updating either; a
  // voided write-off must keep its frozen costMinor, not a live-recomputed avg).
  const editable = data ? !data.applicable && data.state !== 'cancelled' : false;
  const storeId = form?.storeId ?? null;
  const assortmentIds = useMemo(
    () => (form?.positions ?? []).map((p) => p.assortmentId).filter((x): x is string => !!x),
    [form?.positions],
  );
  const { data: stockData } = useQuery<{ items: StockItem[] }>({
    queryKey: ['stocks', storeId, assortmentIds.join(',')],
    queryFn: () =>
      api.get(
        `/stocks?storeId=${storeId}&assortmentIds=${encodeURIComponent(assortmentIds.join(','))}`,
      ),
    // Always fetch the live store stock so «Остаток» renders on a posted/cancelled
    // doc too (moysklad parity); only a DRAFT re-prices «Цена» from it (below).
    enabled: !!storeId && assortmentIds.length > 0,
  });
  const stockMap = useMemo(() => {
    const m = new Map<string, StockItem>();
    for (const r of stockData?.items ?? []) m.set(r.assortmentId, r);
    return m;
  }, [stockData]);
  // Sync the live «Остаток» + «Цена» (avg unit cost = costBalanceMinor ÷ qty) onto
  // each row when the stock query settles. Only patches changed rows (no loop).
  useEffect(() => {
    if (stockMap.size === 0) return;
    setForm((s) => {
      if (!s) return s;
      let changed = false;
      const next = s.positions.map((p) => {
        if (!p.assortmentId) return p;
        const st = stockMap.get(p.assortmentId);
        if (!st) return p;
        const q = Number(st.qty);
        // Always reflect the live «Остаток». «Цена»: a DRAFT re-prices from the
        // store avg ONLY when there IS stock (q>0); with 0/negative stock the avg
        // is undefined, so it KEEPS the product cost (buyPrice). A posted/cancelled
        // doc keeps its frozen costMinor (no drift). себестоимость ≠ «Остаток».
        const nextPrice =
          editable && q > 0 ? String(Math.round(Number(st.costBalanceMinor) / q)) : p.priceMinor;
        if (p.stock === st.qty && p.priceMinor === nextPrice) return p;
        changed = true;
        return { ...p, stock: st.qty, priceMinor: nextPrice };
      });
      return changed ? { ...s, positions: next } : s;
    });
  }, [stockMap, editable]);

  const transitionMut = useApiMutation({
    mutationFn: (target: string) => api.post(`/losses/${id}/transitions/${target}`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loss', id] });
      qc.invalidateQueries({ queryKey: ['losses'] });
    },
  });

  const deleteMut = useApiMutation({
    mutationFn: () => api.delete(`/losses/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['losses'] });
      router.push('/losses');
    },
  });

  const cloneMut = useApiMutation({
    mutationFn: () => api.post<{ id: string }>(`/losses/${id}/clone`, {}),
    onSuccess: (clone) => {
      qc.invalidateQueries({ queryKey: ['losses'] });
      router.push(`/losses/${clone.id}`);
    },
  });

  const { runDestructive } = useDestructiveMutation();

  const saveMut = useSaveMutation({
    mutationFn: async () => {
      if (!form || !data) throw new Error('Form not ready');
      const selected = currencies.find((c) => c.isoCode === form.currency);
      const isBase = selected?.default ?? form.currency === 'UZS';
      const payload: Record<string, unknown> = {
        version: data.version,
        description: form.description || null,
        // round-trip the doc-level reason enum (no UI) so the BE value isn't lost.
        reason: form.reason,
        projectId: form.projectId,
        externalCode: form.externalCode || null,
        // moysklad «Статья расходов» — stored as the item NAME.
        expenseItem: form.expenseItem || null,
        // «Валюта документа» + rate.
        currency: form.currency,
        rateValue: isBase
          ? '100000000'
          : Number(form.rate) > 0
            ? String(BigInt(Math.round(Number(form.rate) * 1e8)))
            : (selected?.rateValue ?? '100000000'),
      };
      // A POSTED loss is read-only (the BE rejects editing one) — only send the
      // header refs + positions when the doc is still a draft (mirror the current
      // file's `!data.applicable` guard).
      if (!data.applicable) {
        if (form.moment) payload.moment = new Date(form.moment).toISOString();
        payload.organizationId = form.organizationId;
        payload.storeId = form.storeId;
        payload.positions = form.positions.map((p) => ({
          assortmentKind: 'product',
          // biome-ignore lint/style/noNonNullAssertion: a product is always picked before save
          assortmentId: p.assortmentId!,
          quantity: p.quantity,
          // «Цена» — the entered себестоимость the write-off books at.
          ...(p.priceMinor && p.priceMinor !== '0' ? { costMinor: p.priceMinor } : {}),
          // round-trip «Причина списания» / «Ячейка» — the BE delete+recreate
          // would otherwise wipe them on every edit-save.
          ...(p.reason ? { reason: p.reason } : {}),
          ...(p.cellId ? { cellId: p.cellId } : {}),
          ...(p.cell ? { cell: p.cell } : {}),
        }));
      }
      payload.attributes = form.attributes;
      return api.patch(`/losses/${id}`, payload);
    },
    onSuccess: () => {
      setSaveError(null);
      qc.invalidateQueries({ queryKey: ['loss', id] });
      qc.invalidateQueries({ queryKey: ['losses'] });
      if (form) setOriginal(snapshot(form));
    },
    onError: (err: Error) => {
      if (isOptimisticConflict(err)) return;
      setSaveError(err.message);
    },
    onConflict,
  });

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
  const projectFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: Array<{ id: string; name: string }> }>(
      `/projects?search=${encodeURIComponent(s)}&limit=50`,
    );
    return d.items.map((x) => ({ id: x.id, primary: x.name }));
  };
  const expenseFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: Array<{ id: string; name: string }> }>(
      `/expense-items?search=${encodeURIComponent(s)}`,
    );
    return d.items.map((x) => ({ id: x.id, primary: x.name }));
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

  // Apply a chosen product onto a position row (mirror /new applyProductToRow).
  const applyProductToRow = (rowUid: string, item: PickerItem) => {
    const raw = (item as PickerItem & { raw?: ProductItem }).raw;
    updatePosition(rowUid, {
      assortmentId: item.id,
      productLabel: String(item.primary),
      productCode: raw?.code ?? undefined,
      productUom: raw?.uom ?? null,
      // «Цена» = product cost (себестоимость) by default — shown independent of
      // «Остаток»; the store avg overrides it only when stock>0.
      priceMinor: raw?.buyPrice ?? '0',
      stock: raw?.stock?.onHand,
      available: raw?.stock?.available,
      folderPath: raw?.productFolder?.pathName ?? undefined,
      imageUrl: raw?.mainImageId ? imageRawUrl(raw.mainImageId) : undefined,
    });
  };

  // Loss line cost = «Цена» (себестоимость preview) — no VAT, no discount. Live
  // total so the «Итого» footer agrees with each row's «Сумма» exactly (mirror /new).
  const totals = useMemo(
    () =>
      (form?.positions ?? []).reduce((acc, p) => {
        const cost = BigInt(p.priceMinor || '0');
        return acc + scaleMinorByQty(cost, p.quantity || '0');
      }, 0n),
    [form?.positions],
  );
  const totalQty = useMemo(
    () => (form?.positions ?? []).reduce((acc, p) => acc + (Number(p.quantity) || 0), 0),
    [form?.positions],
  );

  // moysklad #loss position columns — built from the ⚙ customizer (mirror /new).
  // Grid order: Изобр · Наименование ▾ · Кол-во(+unit inline) · Ячейка · Остаток ·
  // Цена(▾ clickable sort) · Сумма · Причина списания · ⚙. «Цена»/«Сумма» are
  // read-only себестоимость; NO overhead, NO customs (gtd/rnpt/country).
  const positionColumns = useMemo<PositionTableColumnConfig[]>(() => {
    const cols: PositionTableColumnConfig[] = [
      { key: 'dragarea' },
      { key: 'select' },
      // moysklad shows the row number «1,2,3…» (becomes a checkbox on hover) with an
      // EMPTY header. The image lives INSIDE «Наименование» (PositionNameCell).
      { key: 'index', label: '' },
    ];
    if (colVisible.image) cols.push({ key: 'image' });
    cols.push({ key: 'name', label: tCols('name') });
    cols.push({ key: 'quantity', label: tPos('quantity') });
    if (colVisible.unit) cols.push({ key: 'unit', label: tCols('unit') });
    if (colVisible.cell)
      cols.push({ key: 'cell', label: tCols('cell'), placeholder: tCols('cell_unset') });
    if (colVisible.stock) cols.push({ key: 'stock', label: tCols('stock') });
    // «Цена» = EDITABLE себестоимость input (moysklad parity; default = product
    // buyPrice; read-only when the doc is posted/cancelled via PositionTable's
    // readOnly). «Сумма» = Цена × Кол-во. The «Цена ▾» header button sorts by cost.
    cols.push({
      key: 'price',
      label: (
        <button
          type="button"
          className="ml-auto inline-flex items-center gap-0.5 text-[var(--ms-text-brand)] hover:underline focus:outline-none"
          onClick={() => {
            const dir = priceSortDir === 'asc' ? 'desc' : 'asc';
            setPriceSortDir(dir);
            setForm((s) =>
              s
                ? {
                    ...s,
                    positions: [...s.positions].sort((a, b) => {
                      const av = Number(a.priceMinor || '0');
                      const bv = Number(b.priceMinor || '0');
                      return dir === 'asc' ? av - bv : bv - av;
                    }),
                  }
                : s,
            );
          }}
          data-test-id="position-price-sort"
        >
          {tCols('price')}
          <Icons.down
            className={`h-3 w-3 transition-transform ${priceSortDir === 'asc' ? 'rotate-180' : ''}`}
            aria-hidden
          />
        </button>
      ),
    });
    cols.push({ key: 'amount', label: tCols('amount') });
    if (colVisible.reason) cols.push({ key: 'reason', label: tCols('write_off_reason') });
    // moysklad places the «⚙» customizer in its OWN trailing column at the far
    // right (after «Причина списания») — mirror /new.
    cols.push({
      key: 'menu',
      label: (
        <PositionColumnCustomizer
          options={OPTIONAL_POSITION_COLUMNS.map((c) => ({
            key: c.key,
            label: tCols(c.labelKey),
          }))}
          visible={colVisible}
          onToggle={(key, next) => setColVisible((v) => ({ ...v, [key]: next }))}
          ariaLabel={tCols('configure')}
        />
      ),
    });
    return cols;
  }, [colVisible, priceSortDir, tCols, tPos]);

  if (isLoading || !form)
    return <div className="p-8 text-[var(--ms-text-muted)] text-sm">{tCommon('loading')}</div>;
  if (!data) return <div className="p-8 text-sm">{tCommon('not_found')}</div>;

  // POSTED/CANCELLED-lock: a posted (applicable) OR cancelled (voided) loss is
  // fully read-only — the BE rejects editing either. Editable only as a draft.
  const editableLines = !data.applicable && data.state !== 'cancelled';
  const selectedCurrency = currencies.find((c) => c.isoCode === form.currency);
  const isBaseCurrency = selectedCurrency?.default ?? form.currency === 'UZS';
  const effectiveRate = form.rate;
  const baseCode = currencies.find((c) => c.default)?.isoCode ?? 'UZS';
  const docGlobalRate = selectedCurrency?.rate ?? '1';

  // moysklad «Статус» pill — the built-in draft/posted/cancelled FSM, bound to the
  // REAL state. Picking a status fires the matching transition; «Проведено» drives
  // post/unpost too (moysklad parity).
  const STATUS_OPTIONS = [
    { value: 'draft', label: tStates('draft'), color: '#e8eef5' },
    { value: 'posted', label: tStates('posted'), color: '#cfe8d3' },
    { value: 'cancelled', label: tStates('cancelled'), color: '#f4d4d4' },
  ];
  // moysklad SHOWS «Проведено» in every state (it reflects the posted flag); a
  // cancelled doc keeps the checkbox but DISABLED (can't toggle). So always pass
  // the handler + disable it when cancelled (a disabled input never fires onChange).
  const onApplicableChange = (next: boolean) => transitionMut.mutate(next ? 'post' : 'unpost');

  // «Ячейка» — address-storage cell picker (mirror /losses/new + /enters/new).
  // Closure has storeId (form state) + the row's product (assortmentId), so the
  // picker can show «Все ячейки» and «С этим товаром». Stores cellId (per-cell
  // stock) + the «Зона / Ячейка» label in `cell`. A posted/cancelled loss is
  // read-only — the picker then shows a plain label (no picker button).
  const renderPositionCellCell = (row: DocPositionRow) => {
    const p = row as DetailPositionRow;
    return (
      <CellPickerField
        storeId={storeId}
        assortmentId={p.assortmentId}
        label={p.cell}
        readOnly={!editableLines}
        onSelect={(cellId, label) => updatePosition(row.id, { cellId, cell: label })}
        onClear={() => updatePosition(row.id, { cellId: null, cell: '' })}
      />
    );
  };

  // Position «Наименование» cell — moysklad-parity borderless [img] + bold code +
  // name (PositionNameCell, mirror CO/[id]); clicking re-opens the per-row product
  // picker. Read-only on a posted loss.
  const renderPositionNameCell = (row: DocPositionRow) => {
    const p = row as DetailPositionRow;
    // A PICKED product's name links to its product card (where «Аналоги» lives);
    // an unpicked / read-only row falls back to the picker button (mirror CO/new).
    const href = p.assortmentId ? `/products/${p.assortmentId}` : undefined;
    return (
      <PositionNameCell
        imageUrl={p.imageUrl}
        code={p.productCode}
        label={p.productLabel}
        placeholder={tForm('select_product')}
        onPick={() => editableLines && setOpenPicker({ kind: 'product', rowUid: p.id })}
        productHref={href}
        onNavigate={href ? () => router.push(href) : undefined}
        disabled={!editableLines}
        testId={`pos-${p.id}-name`}
      />
    );
  };

  return (
    <div
      // moysklad parity: the document sits on a WHITE content area, left-aligned
      // and capped at ~1300px — it does NOT stretch edge-to-edge on wide screens.
      className="flex min-h-screen flex-col bg-[var(--ms-bg-surface)]"
      data-test-id="loss-detail-page"
    >
      <div className="w-full max-w-[1300px]">
        <DetailToolbar
          isDirty={isDirty}
          isSaving={saveMut.isPending}
          onSave={() => saveMut.mutate()}
          onClose={() => router.push('/losses')}
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
          // moysklad «Печать» on a saved Списание: ТОРГ-16 · МБ-8 · [account
          // forms] · Комплект… · Настроить… — the built-in forms open our loss
          // print form in a new tab; account forms render through bulk-print
          // (was the default dead «Бланк документа» item — no route existed).
          printMenuItems={[
            {
              id: 'torg16',
              label: tPrintLoss('torg16'),
              onSelect: () => window.open(`/print/loss/${data.id}`, '_blank'),
            },
            {
              id: 'mb8',
              label: tPrintLoss('mb8'),
              onSelect: () => window.open(`/print/loss/${data.id}`, '_blank'),
            },
            ...(printTemplatesData?.items ?? []).map((tpl) => ({
              id: `tpl-${tpl.id}`,
              label: tpl.name,
              onSelect: () =>
                void api.postOpenInBrowser('/losses/bulk-print', {
                  ids: [data.id],
                  templateId: tpl.id,
                }),
            })),
            // Omborchi varag'i — yacheyka bo'yicha, NARXSIZ (chiqim: javondan OLISH).
            {
              id: 'spiska',
              label: tSheet('spiska_form'),
              onSelect: () =>
                void openSheet({
                  title: tSheet('sheet_title_pick'),
                  number: data.name,
                  moment: form.moment,
                  agentName: null,
                  ownerName: form.ownerLabel || null,
                  description: form.description || null,
                  rows: form.positions,
                }),
            },
            // «Комплект…» — disabled placeholder (mirror the list dropdown).
            { id: 'set', label: tPrint('set') },
            {
              id: 'configure',
              label: tPrint('configure'),
              onSelect: () => openTemplates('loss'),
            },
          ]}
          rightSlot={
            // moysklad top-right cluster on the TOOLBAR row: «Владелец» (owner) +
            // «Изменения» (last-modified) link. The loss BE `update()` doesn't accept
            // ownerId/groupId/shared, so the owner is shown as a READ-ONLY label (no
            // editable popover that couldn't persist). («Смотрит» presence needs WS
            // infra we don't have yet — intentionally omitted, not faked.)
            <>
              <div
                className="flex flex-col items-end text-right text-xs leading-tight"
                data-test-id="doc-owner-readonly"
              >
                <span className="font-medium text-[var(--ms-text-brand)]">
                  {form.ownerLabel || '—'}
                </span>
                {/* moysklad shows the owner's access role («Основной») under the name. */}
                <span className="text-[var(--ms-text-muted)]">{tDetailHeader('role_primary')}</span>
              </div>
              <DocumentHistoryLink auditEntity="Loss" entityId={data.id} />
            </>
          }
        />

        {/* Editable shared <DocumentHeader> (mirrors /new). № is auto-assigned so it
          stays read-only; date is editable on a draft. «Статус» is the built-in
          draft/posted/cancelled FSM (bound to the real state); «Проведено» drives
          post/unpost. The owner label + «Изменения» link live on the TOOLBAR row. */}
        <DocumentHeader
          {...docEditorLabels}
          documentTypeLabel={tDetailTitles('loss')}
          number={data.name}
          date={form.moment}
          onDateChange={editableLines ? (v) => setForm((f) => f && { ...f, moment: v }) : undefined}
          // moysklad loss header shows a grey «Статус» pill (custom statuses, none
          // defined → empty) — NOT the FSM state; the draft/posted state is conveyed
          // by «Проведено». Keep the pill empty (mirror /new); the 3 FSM options stay
          // clickable so state changes remain possible.
          status=""
          statusOptions={STATUS_OPTIONS}
          // A cancelled (voided) loss is terminal — every transition the BE would
          // accept is gone (post needs draft, cancel rejects already-cancelled), so
          // offering the dropdown would only surface a raw error. Disable it.
          onStatusChange={
            data.state === 'cancelled'
              ? undefined
              : (slug) => transitionMut.mutate(DOC_STATE_VERB[slug] ?? slug)
          }
          applicable={data.applicable}
          onApplicableChange={onApplicableChange}
          applicableDisabled={data.state === 'cancelled'}
          // moysklad «(?) Проведено» — help tooltip icon before the checkbox.
          applicableHelp={t('applicable_help')}
        />

        <main className="px-4 py-4">
          {transitionMut.error && (
            <Alert tone="destructive" className="mb-3">
              {(transitionMut.error as Error).message}
            </Alert>
          )}
          {saveError && (
            <Alert tone="destructive" className="mb-3">
              {saveError}
            </Alert>
          )}
          {/* moysklad parity: a POSTED Списание is read-only — the BE rejects
            editing it. Show the posted-lock banner (mirror the current file). */}
          {data.applicable && (
            <Alert tone="info" className="mb-3">
              {tCommon('locked_when_posted')}
            </Alert>
          )}
          {data.state === 'cancelled' && (
            <Alert tone="info" className="mb-3">
              {tCommon('locked_when_cancelled')}
            </Alert>
          )}

          {/* moysklad b-operation-form-top — bare 2-column meta grid (mirror /new):
            Организация‖Склад · Проект‖Статья расходов · Валюта‖∅. */}
          <div className="max-w-[860px] space-y-2">
            <DocumentMetaRow fixedWidth>
              <DocumentMetaField label={tFields('organization')} required>
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
                    setForm((s) => s && { ...s, organizationId: '', organizationLabel: '' })
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
                  onCreate={editableLines ? () => router.push('/settings/projects/new') : undefined}
                  createLabel={tForm('create_new_project')}
                  disabled={!editableLines}
                  testId="field-project"
                />
              </DocumentMetaField>
              <DocumentMetaField label={tFields('expense_item')} required>
                <CatalogPickerField
                  value={
                    form.expenseItem
                      ? { id: form.expenseItemId ?? 'spis', label: form.expenseItem }
                      : null
                  }
                  placeholder={tFields('expense_item')}
                  onPick={() => editableLines && setOpenPicker('expense')}
                  inlineFetcher={expenseFetcher}
                  onInlineSelect={(item) =>
                    setForm(
                      (s) =>
                        s && {
                          ...s,
                          expenseItemId: item.id,
                          expenseItem: String(item.primary),
                        },
                    )
                  }
                  onClear={() =>
                    editableLines &&
                    setForm((s) => s && { ...s, expenseItemId: null, expenseItem: '' })
                  }
                  disabled={!editableLines}
                  testId="field-expense-item"
                />
              </DocumentMetaField>
            </DocumentMetaRow>

            {/* «Валюта документа» — moysklad: COMPACT select + INLINE «1 USD = N UZS ✎»
                on the SAME row (the ✎ overrides the rate for THIS document, inline). */}
            <DocumentMetaRow>
              <DocumentMetaField label={tFields('currency_document')} required fullWidth>
                <div className="flex items-center gap-2">
                  <div className="w-[180px] shrink-0">
                    <NativeSelect
                      value={form.currency}
                      onChange={(e) => {
                        const next = e.target.value;
                        const gc = currencies.find((c) => c.isoCode === next);
                        // a new currency resets the per-doc rate to that currency's rate.
                        setForm((s) => s && { ...s, currency: next, rate: gc?.rate ?? '1' });
                        setRateDialogOpen(false);
                      }}
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
                  {!isBaseCurrency && selectedCurrency && (
                    <span className="inline-flex items-center gap-1 whitespace-nowrap text-[var(--ms-text-muted)] text-[12px] tabular-nums">
                      1 {form.currency} = {Number(effectiveRate).toLocaleString('ru-RU')} {baseCode}
                      {editableLines && (
                        // moysklad ✎ — opens «Курс валюты документа» to override the rate.
                        <button
                          type="button"
                          onClick={() => setRateDialogOpen(true)}
                          className="text-[var(--ms-text-muted)] hover:text-[var(--ms-text-primary)]"
                          aria-label={tCommon('edit')}
                          data-test-id="currency-rate-edit"
                        >
                          ✎
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
              auditEntity="Loss"
              entityId={data.id}
              relatedGroups={[]}
              positionsLabel={tDetailTabs('positions')}
              filesSlot={<AttachmentsSection entity="Loss" entityId={data.id} />}
              tasksSlot={<DocumentTasksSection entity="Loss" entityId={data.id} />}
              historyInline={false}
              relatedSlot={
                <RelatedDocsTab
                  current={{
                    id: data.id,
                    name: data.name,
                    moment: data.moment,
                    state: data.state,
                    sumMinor: String(totals),
                    kind: 'loss',
                  }}
                />
              }
            >
              <div>
                {/* moysklad position table — full column set + ⚙ customizer + inline
                  «Добавить позицию» bar. Posted docs are read-only. */}
                <div className="min-w-0">
                  {/* Owner 2026-07-23: «Договорная цена» — blue, at the table's OUTER
                      top-right corner (same spot in every section). */}
                  {editableLines && (
                    <div className="-mb-2.5 flex justify-end">
                      <PositionAgreementButton
                        totalMinor={totals}
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
                    emptyText={tPos('empty')}
                    rows={form.positions}
                    onUpdate={(rowId, patch) =>
                      updatePosition(rowId, patch as Partial<DetailPositionRow>)
                    }
                    onRemove={removePosition}
                    onDuplicate={duplicatePosition}
                    onReplace={(id) => setOpenPicker({ kind: 'product', rowUid: id })}
                    onReorder={reorderPositions}
                    onSortPositions={
                      editableLines
                        ? (by) =>
                            setForm((f) => {
                              if (!f) return f;
                              const key = (p: DetailPositionRow) =>
                                by === 'name' ? (p.productLabel ?? '') : (p.productCode ?? '');
                              return {
                                ...f,
                                positions: [...f.positions].sort((a, b) => {
                                  if (withGroups) {
                                    const g = (a.folderPath ?? '').localeCompare(
                                      b.folderPath ?? '',
                                      'ru',
                                    );
                                    if (g !== 0) return g;
                                  }
                                  return key(a).localeCompare(key(b), 'ru');
                                }),
                              };
                            })
                        : undefined
                    }
                    sortByNameLabel={tPos('sort_by_name')}
                    sortByCodeLabel={tPos('sort_by_code')}
                    withGroups={withGroups}
                    onWithGroupsChange={setWithGroups}
                    withGroupsLabel={tPos('sort_with_groups')}
                    renderNameCell={renderPositionNameCell}
                    renderCellCell={renderPositionCellCell}
                    selectedIds={selectedRowIds}
                    onSelectionChange={setSelectedRowIds}
                    readOnly={!editableLines}
                    footerToolbar={
                      editableLines ? (
                        <PositionInlineAdd
                          placeholder={tPos('addPositionPlaceholder')}
                          addFromCatalogLabel={tPos('addFromCatalog')}
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
                                // Pick modal (owner 2026-07-18): reference «Цена» = the same
                                // default the row would get (product cost / buyPrice here).
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
                          // permanent SALE price from a write-off cost would be wrong.
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
                                        quantity: entry?.quantity ?? '1',
                                        // «Цена» = product cost (себестоимость) —
                                        // shown independent of «Остаток».
                                        priceMinor: entry?.priceMinor ?? raw?.buyPrice ?? '0',
                                        discount: '0',
                                        vat: '',
                                        vatEnabled: false,
                                        stock: raw?.stock?.onHand,
                                        available: raw?.stock?.available,
                                        folderPath: raw?.productFolder?.pathName ?? undefined,
                                        imageUrl: raw?.mainImageId
                                          ? imageRawUrl(raw.mainImageId)
                                          : undefined,
                                      },
                                    ],
                                  }
                                : s,
                            );
                            // owner 2026-07-18: returning the id hands focus to the new
                            // row's «Кол-во» (modal → table entry chain).
                            return newId;
                          }}
                          onAddFromCatalog={() =>
                            setForm((s) =>
                              s
                                ? {
                                    ...s,
                                    positions: [
                                      ...s.positions,
                                      {
                                        id: uid(),
                                        assortmentId: null,
                                        productLabel: '',
                                        productUom: null,
                                        quantity: '1',
                                        priceMinor: '0',
                                        discount: '0',
                                        vat: '',
                                        vatEnabled: false,
                                      },
                                    ],
                                  }
                                : s,
                            )
                          }
                        />
                      ) : undefined
                    }
                  />
                </div>

                {/* Bottom — moysklad: «Комментарий» (left, ~600px) + «Итого» / «Кол-во»
                  (right). LEFT-aligned, content-sized — no edge-to-edge stretch. */}
                <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-12">
                  <div className="space-y-2 lg:w-[600px]">
                    <Textarea
                      value={form.description}
                      onChange={(e) => setForm((s) => s && { ...s, description: e.target.value })}
                      placeholder={tFields('description')}
                      aria-label={tFields('description')}
                      rows={3}
                      disabled={!editableLines}
                      data-test-id="field-description"
                    />
                    {externalCodeVisible ? (
                      <div className="flex items-center gap-2">
                        <label
                          htmlFor="external-code"
                          className="text-[var(--ms-text-muted)] text-sm"
                        >
                          {tDetailForm('external_code')}:
                        </label>
                        <Input
                          id="external-code"
                          type="text"
                          value={form.externalCode}
                          onChange={(e) =>
                            setForm((s) => s && { ...s, externalCode: e.target.value })
                          }
                          className="flex-1"
                          disabled={!editableLines}
                          maxLength={50}
                          data-test-id="field-external-code"
                        />
                      </div>
                    ) : (
                      <Button
                        type="button"
                        variant="link"
                        onClick={() => setExternalCodeVisible(true)}
                        className="h-auto px-0 text-xs"
                        data-test-id="show-external-code"
                      >
                        {tDetailForm('external_code')}
                      </Button>
                    )}
                  </div>
                  <div className="min-w-[260px] space-y-2">
                    <div className="flex justify-between gap-8 font-semibold text-base">
                      <dt>{tFields('sum_total')}:</dt>
                      <dd className="tabular-nums" data-test-id="loss-total">
                        {formatMoney(String(totals), 'UZS', { displayAs: 'none' })}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-8 text-[var(--ms-text-muted)] text-sm">
                      <dt>{tPos('quantity')}:</dt>
                      <dd className="tabular-nums" data-test-id="loss-total-qty">
                        {totalQty.toLocaleString('ru-RU')}
                      </dd>
                    </div>
                  </div>
                </div>
              </div>
            </DetailContentTabs>
          </div>

          <div className="mt-4">
            <AttributesEditor
              entity="Loss"
              values={form.attributes}
              onChange={(next) => setForm((f) => f && { ...f, attributes: next })}
              disabled={!editableLines}
              testIdPrefix="loss"
            />
          </div>
        </main>
      </div>

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
        open={openPicker === 'project'}
        onClose={() => setOpenPicker(null)}
        title={tFields('project')}
        fetcher={projectFetcher}
        onSelect={(item) =>
          setForm((s) => s && { ...s, projectId: item.id, projectLabel: String(item.primary) })
        }
      />
      <CatalogPicker
        open={openPicker === 'expense'}
        onClose={() => setOpenPicker(null)}
        title={tFields('expense_item')}
        fetcher={expenseFetcher}
        onSelect={(item) =>
          setForm((s) => s && { ...s, expenseItemId: item.id, expenseItem: String(item.primary) })
        }
      />
      <CatalogPicker
        open={
          typeof openPicker === 'object' && openPicker !== null && openPicker.kind === 'product'
        }
        onClose={() => setOpenPicker(null)}
        title={tForm('select_product')}
        fetcher={productFetcher}
        onSelect={(item) => {
          if (typeof openPicker !== 'object' || openPicker === null) return;
          applyProductToRow(openPicker.rowUid, item);
        }}
      />

      {/* «Курс валюты документа» — moysklad rate-override modal (the currency ✎). */}
      <CurrencyRateModal
        open={rateDialogOpen}
        onOpenChange={setRateDialogOpen}
        currency={form.currency}
        referenceRate={docGlobalRate}
        currentOverride={form.rate === docGlobalRate ? null : form.rate}
        onApply={(r) => setForm((s) => (s ? { ...s, rate: r ?? docGlobalRate } : s))}
      />
      {sheet && <ReceiptPrintPortal data={sheet} onClose={closeSheet} />}
    </div>
  );
}
