'use client';

/**
 * /enters/[id] — moysklad-parity «Оприходование» detail editor.
 *
 * Converged onto the /enters/new document-editor SKELETON (user 2026-06-24
 * «//id xuddi //new skleti»): the same `DocumentHeader` + bare 2-column meta
 * grid + `PositionTable` (image · unit · Ячейка · Остаток · Цена ▾ · Сумма ·
 * Причина · ГТД · РНПТ · Страна + ⚙ trailing customizer) + the bottom
 * «Комментарий» / «Итого» / «Накладные расходы» band. On top of the create
 * shell it adds the DETAIL-only bits a saved document needs (mirror the
 * gold-standard purchase-orders/[id]): prev/next nav, clone/delete, the
 * owner-access popover + «Изменения» history link on the toolbar row, the
 * «Связанные документы» / «Файлы» / «Задачи» / «Изменения» tabs, the
 * attributes editor and the posted-lock banner.
 *
 * Internal stock-in: no counterparty, no VAT, no discount. A single «Склад»,
 * a per-position «Причина оприходования», customs columns (ГТД / Страна / РНПТ
 * / Ячейка, mirror SupplyPosition §41) and a «Накладные расходы» distribution.
 * Posted documents are fully read-only (the BE rejects every edit on a posted
 * enter); the cost columns are entered in «Валюта документа» (real /currencies).
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
import { OwnerAccessPopover } from '@/components/documents/owner-access-popover';
import { PositionAgreementButton } from '@/components/documents/position-agreement-modal';
import { PositionColumnCustomizer } from '@/components/documents/position-column-customizer';
import { PositionPriceMenu } from '@/components/documents/position-price-menu';
import { useApiMutation } from '@/hooks/use-api-mutation';
import { useConflictReload } from '@/hooks/use-conflict-reload';
import { useDestructiveMutation } from '@/hooks/use-destructive-mutation';
import { useDetailNavigation } from '@/hooks/use-detail-navigation';
import { useDocumentEditorLabels } from '@/hooks/use-document-editor-labels';
import { useSaveMutation } from '@/hooks/use-save-mutation';
import { useUnsavedGuard } from '@/hooks/use-unsaved-guard';
import { api } from '@/lib/api-client';
import { DOC_STATE_VERB } from '@/lib/doc-state-dropdown';
import { imageRawUrl } from '@/lib/image-url';
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

interface PositionDetail {
  id: string;
  position: number;
  assortmentKind: string;
  assortmentId: string;
  quantity: string;
  costMinor: string;
  reason: string | null;
  // «Номер ГТД» / «Сумма ГТД» / «Страна» — import/customs block (mirror supply §41).
  gtdNumber: string | null;
  gtdSumMinor: string | null;
  country: { id: string; name: string; code: string | null } | null;
  // «РНПТ» — free-text batch/bin reference (set on /new; preserved here).
  rnpt: string | null;
  // «Ячейка» — address-storage bin: `cellId` (FK, drives the picker) + `cell` (label).
  cellId: string | null;
  cell: string | null;
  // «Остаток» — current on-hand at the document's store (string «0» when none).
  stockOnHand?: string | null;
  product: {
    id: string;
    name: string;
    code: string | null;
    uom: string | null;
    // «Вес» / «Объём» read-only columns — per-unit grams / millilitres.
    weightG: number | null;
    volumeML: number | null;
    // Main image id → «Наименование» cell thumbnail (GET /images/:id/raw).
    images?: Array<{ id: string }> | null;
  } | null;
}

interface EnterDetail {
  id: string;
  version: number;
  name: string;
  externalCode: string | null;
  state: string;
  applicable: boolean;
  moment: string;
  postedAt: string | null;
  overheadSumMinor: string;
  overheadDistribution: string;
  description: string | null;
  sumMinor: string;
  /** «Валюта документа» — the doc's saved currency (real /currencies). */
  currency: string;
  /** Per-document exchange rate ×1e8 (rate = rateValue / 1e8). */
  rateValue: string;
  organization: { id: string; name: string };
  store: { id: string; name: string };
  project: { id: string; name: string } | null;
  owner: { id: string; name: string } | null;
  /** «Владелец-отдел» (department) — resolved EnterGroup, null when unset. */
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
  uom: string | null;
  // /products returns `buyPrice` (minor string) — the enter line cost basis.
  buyPrice: string | null;
  salePrices?: Array<{ priceTypeId: string; value: string }> | null;
  stock?: { onHand: string; reserved: string; inTransit: string; available: string } | null;
  productFolder?: { id: string; name: string; pathName: string } | null;
  weightG?: number | null;
  volumeML?: number | null;
  // Main image id (from /products) → «Наименование» thumbnail for newly-added rows.
  mainImageId?: string | null;
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

// Detail-page position row — the PositionTable row shape (keyed on `id`). Mirrors
// /new's NewPositionRow: carries assortmentId + the product's sale-price list so
// «Расценить» can re-price, and folderPath for «Наименование ▾ → С учётом групп».
interface DetailPositionRow extends DocPositionRow {
  assortmentId: string | null;
  salePrices?: Array<{ priceTypeId: string; value: string }> | null;
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

// moysklad #enter «⚙» customizer — the FULL live-capture option list (mirror /new):
// Изображение · Единица измерения · Ячейка · Остаток · Вес · Объём · Причина
// оприходования · Себест. единицы · Себестоимость · ГТД · РНПТ · Страна. Always-on
// frame: Наименование · Кол-во · Цена · Сумма. Defaults match the visible moysklad grid.
const OPTIONAL_POSITION_COLUMNS: { key: PositionColumnKey; labelKey: string; on: boolean }[] = [
  // moysklad enter grid shows NO «Изображение» column by default (real capture
  // enters-live-2026-06-21/21-create-full: checkbox → «Наименование»); it stays a
  // ⚙-toggle option, default OFF.
  { key: 'image', labelKey: 'image', on: false },
  { key: 'unit', labelKey: 'unit', on: true },
  { key: 'cell', labelKey: 'cell', on: true },
  { key: 'stock', labelKey: 'stock', on: true },
  { key: 'weight', labelKey: 'weight', on: false },
  { key: 'volume', labelKey: 'volume', on: false },
  { key: 'reason', labelKey: 'reason', on: true },
  { key: 'costPerUnit', labelKey: 'costPerUnit', on: false },
  { key: 'costTotal', labelKey: 'costTotal', on: false },
  { key: 'gtdNumber', labelKey: 'gtd', on: true },
  { key: 'rnpt', labelKey: 'rnpt', on: true },
  { key: 'country', labelKey: 'country', on: true },
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
  externalCode: string;
  description: string;
  /** «Валюта документа» — editable while the enter is a draft. */
  currency: string;
  /** Per-document exchange rate in MAJOR units (e.g. «12200» for 1 USD = 12 200 UZS),
   *  editable via the «1 USD = N UZS ✎». Stored as rateValue = rate × 1e8. */
  rate: string;
  /** «Накладные расходы» — major-unit string + distribution method. */
  overheadMajor: string;
  overheadDistribution: 'WEIGHT' | 'PRICE' | 'VOLUME' | 'QUANTITY';
  /** «Владелец» / «Владелец-отдел» / «Общий доступ» — owner-access popover. */
  ownerId: string | null;
  ownerLabel: string;
  groupId: string | null;
  groupLabel: string;
  shared: boolean;
  positions: DetailPositionRow[];
  attributes: Record<string, unknown>;
}

function formFromData(d: EnterDetail): FormState {
  return {
    moment: momentToLocalInput(d.moment),
    organizationId: d.organization.id,
    organizationLabel: d.organization.name,
    storeId: d.store.id,
    storeLabel: d.store.name,
    projectId: d.project?.id ?? null,
    projectLabel: d.project?.name ?? '',
    externalCode: d.externalCode ?? '',
    description: d.description ?? '',
    currency: d.currency || 'UZS',
    // doc's stored rate → major units (rateValue / 1e8). UZS ⇒ «1».
    rate: d.rateValue ? String(Number(d.rateValue) / 1e8) : '1',
    overheadMajor:
      d.overheadSumMinor && d.overheadSumMinor !== '0'
        ? (Number(d.overheadSumMinor) / 100).toString()
        : '',
    // moysklad enter defaults «Распределить по цене» (PRICE). Only honour the stored
    // method when there's actual overhead to distribute; otherwise show the «по цене»
    // default (the select is disabled at overhead 0 anyway). Real capture: «Распределить по цене».
    overheadDistribution:
      d.overheadSumMinor &&
      d.overheadSumMinor !== '0' &&
      (['WEIGHT', 'PRICE', 'VOLUME', 'QUANTITY'] as const).includes(
        d.overheadDistribution as FormState['overheadDistribution'],
      )
        ? (d.overheadDistribution as FormState['overheadDistribution'])
        : 'PRICE',
    ownerId: d.owner?.id ?? null,
    ownerLabel: d.owner?.name ?? '',
    groupId: d.group?.id ?? null,
    groupLabel: d.group?.name ?? '',
    shared: d.shared ?? false,
    // PositionTable keys on `id` (DocPositionRow.id) — use the persisted position
    // id as the stable React key. Carry every customs/reason field through the
    // round-trip so a save can't wipe data set on /new.
    positions: d.positions.map((p) => ({
      id: p.id,
      assortmentId: p.assortmentId,
      productLabel: p.product?.name ?? '—',
      productCode: p.product?.code ?? undefined,
      productUom: p.product?.uom ?? null,
      quantity: p.quantity,
      priceMinor: p.costMinor,
      discount: '0',
      vat: '',
      vatEnabled: false,
      reason: p.reason ?? undefined,
      gtdNumber: p.gtdNumber ?? undefined,
      gtdSumMinor: p.gtdSumMinor ?? undefined,
      countryId: p.country?.id ?? null,
      countryLabel: p.country?.name ?? undefined,
      rnpt: p.rnpt ?? undefined,
      cellId: p.cellId ?? null,
      cell: p.cell ?? undefined,
      // «Вес» / «Объём» read-only line totals (per-unit grams / ml × Кол-во).
      weightG: p.product?.weightG ?? undefined,
      volumeML: p.product?.volumeML ?? undefined,
      // «Наименование» cell thumbnail (moysklad shows the product image inline).
      imageUrl: p.product?.images?.[0]?.id ? imageRawUrl(p.product.images[0].id) : undefined,
      // «Остаток» — on-hand at the doc store (moysklad shows «0», not «—»).
      stock: p.stockOnHand ?? '0',
      salePrices: null,
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
    externalCode: s.externalCode,
    description: s.description,
    currency: s.currency,
    rate: s.rate,
    overheadMajor: s.overheadMajor,
    overheadDistribution: s.overheadDistribution,
    ownerId: s.ownerId,
    groupId: s.groupId,
    shared: s.shared,
    positions: s.positions.map((p) => ({
      assortmentId: p.assortmentId,
      quantity: p.quantity,
      costMinor: p.priceMinor,
      reason: p.reason ?? null,
      gtdNumber: p.gtdNumber ?? null,
      gtdSumMinor: p.gtdSumMinor ?? null,
      countryId: p.countryId ?? null,
      rnpt: p.rnpt ?? null,
      cell: p.cell ?? null,
    })),
    attributes: s.attributes,
  });
}

export default function EnterDetailPage() {
  const { id } = useParams<{ id: string }>();
  // moysklad toolbar «N из 956 ‹ ›» — server-backed so the REAL total shows even on
  // a direct URL + the arrows walk the whole list (mirror CO/PO `{ server: true }`).
  const detailNav = useDetailNavigation('enters', id, { server: true });
  const docEditorLabels = useDocumentEditorLabels();
  const router = useRouter();
  const qc = useQueryClient();
  const t = useTranslations('pages.enters');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tForm = useTranslations('form');
  const tDetailTitles = useTranslations('detail_titles');
  const tDetailForm = useTranslations('detail_form');
  const tStates = useTranslations('states.enter');
  const tDetailTabs = useTranslations('detail_tabs');
  const tPos = useTranslations('position_editor');
  const tCols = useTranslations('position_cols');

  const { data, isLoading } = useQuery<EnterDetail>({
    queryKey: ['enter', id],
    queryFn: () => api.get(`/enters/${id}`),
  });

  // Price types for the «Цена ▾» → «Расценить» (re-price by type) menu.
  const { data: priceTypesData } = useQuery<{ items: Array<{ id: string; name: string }> }>({
    queryKey: ['price-types'],
    queryFn: () => api.get('/price-types'),
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

  const [form, setForm] = useState<FormState | null>(null);
  const [original, setOriginal] = useState<string>('');
  const [openPicker, setOpenPicker] = useState<
    | null
    | 'org'
    | 'store'
    | 'project'
    | { kind: 'product'; rowUid: string }
    | { kind: 'country'; rowUid: string }
  >(null);
  const [colVisible, setColVisible] = useState<Record<string, boolean>>(DEFAULT_COL_VISIBLE);
  const [withGroups, setWithGroups] = useState(false);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [externalCodeVisible, setExternalCodeVisible] = useState(false);
  // «1 USD = N UZS ✎» — opens the «Курс валюты документа» rate-override modal.
  const [rateDialogOpen, setRateDialogOpen] = useState(false);
  const onConflict = useConflictReload(['enter', id], () => setForm(null));

  useEffect(() => {
    if (data && !form) {
      const initial = formFromData(data);
      setForm(initial);
      setOriginal(snapshot(initial));
      setExternalCodeVisible(Boolean(data.externalCode));
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
  // «Kelishuv» — spread the negotiated delta across the lines (owner 2026-07-17).
  // An enter has no VAT, so the delta distributes over the bare line costs.
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
  // «Сохранить цены» — push each line's price back onto its product. On an enter
  // the line price IS the buy/cost basis, so save to Product.buyPrice (mirror /new).
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

  const transitionMut = useApiMutation({
    mutationFn: (target: string) => api.post(`/enters/${id}/transitions/${target}`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['enter', id] });
      qc.invalidateQueries({ queryKey: ['enters'] });
    },
  });

  const deleteMut = useApiMutation({
    mutationFn: () => api.delete(`/enters/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['enters'] });
      router.push('/enters');
    },
  });

  const cloneMut = useApiMutation({
    mutationFn: () => api.post<{ id: string }>(`/enters/${id}/clone`, {}),
    onSuccess: (clone) => {
      qc.invalidateQueries({ queryKey: ['enters'] });
      router.push(`/enters/${clone.id}`);
    },
  });

  const { runDestructive } = useDestructiveMutation();

  const saveMut = useSaveMutation({
    mutationFn: async () => {
      if (!form || !data) throw new Error('Form not ready');
      const overheadSumMinor =
        Number(form.overheadMajor) > 0
          ? String(BigInt(Math.round(Number(form.overheadMajor) * 100)))
          : '0';
      const selected = currencies.find((c) => c.isoCode === form.currency);
      const isBase = selected?.default ?? form.currency === 'UZS';
      const payload: Record<string, unknown> = {
        version: data.version,
        description: form.description || null,
        projectId: form.projectId,
        externalCode: form.externalCode || null,
        overheadSumMinor,
        overheadDistribution: form.overheadDistribution,
        // «Владелец» / «Владелец-отдел» / «Общий доступ» — owner-access popover.
        ownerId: form.ownerId,
        groupId: form.groupId,
        shared: form.shared,
      };
      // moysklad parity: a posted Оприходование is editable too — send the full
      // header + positions whenever the doc is NOT cancelled. On a posted doc the BE
      // re-applies stock (reverse old → apply new) in one transaction.
      if (data.state !== 'cancelled') {
        if (form.moment) payload.moment = new Date(form.moment).toISOString();
        payload.organizationId = form.organizationId;
        payload.storeId = form.storeId;
        // «Валюта документа» + rate — both from the selected account currency.
        payload.currency = form.currency;
        // per-document rate (form.rate, major) → rateValue = rate × 1e8.
        payload.rateValue = isBase
          ? '100000000'
          : Number(form.rate) > 0
            ? String(BigInt(Math.round(Number(form.rate) * 1e8)))
            : (selected?.rateValue ?? '100000000');
        payload.positions = form.positions.map((p) => ({
          assortmentKind: 'product',
          // biome-ignore lint/style/noNonNullAssertion: a product is always picked before save
          assortmentId: p.assortmentId!,
          quantity: p.quantity,
          costMinor: p.priceMinor,
          ...(p.reason ? { reason: p.reason } : {}),
          ...(p.gtdNumber ? { gtdNumber: p.gtdNumber } : {}),
          ...(p.gtdSumMinor ? { gtdSumMinor: p.gtdSumMinor } : {}),
          ...(p.countryId ? { countryId: p.countryId } : {}),
          ...(p.rnpt ? { rnpt: p.rnpt } : {}),
          ...(p.cellId ? { cellId: p.cellId } : {}),
          ...(p.cell ? { cell: p.cell } : {}),
        }));
      }
      payload.attributes = form.attributes;
      return api.patch(`/enters/${id}`, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['enter', id] });
      qc.invalidateQueries({ queryKey: ['enters'] });
      if (form) setOriginal(snapshot(form));
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
  // «Страна» picker (mirror supply §41) — feeds the position country cell.
  const countryFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: Array<{ id: string; name: string; code?: string | null }> }>(
      `/countries?search=${encodeURIComponent(s)}&limit=50`,
    );
    return d.items.map((c) => ({ id: c.id, primary: c.name, secondary: c.code ?? undefined }));
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
      priceMinor: raw?.buyPrice ?? '0',
      stock: raw?.stock?.onHand,
      available: raw?.stock?.available,
      salePrices: raw?.salePrices ?? null,
      folderPath: raw?.productFolder?.pathName ?? undefined,
      weightG: raw?.weightG ?? undefined,
      volumeML: raw?.volumeML ?? undefined,
      imageUrl: raw?.mainImageId ? imageRawUrl(raw.mainImageId) : undefined,
    });
  };

  // Enter line cost = «Цена» (priceMinor) — no VAT, no discount. Live total so
  // the «Итого» footer agrees with each row's «Сумма» exactly (mirror /new).
  const totals = useMemo(
    () =>
      (form?.positions ?? []).reduce((acc, p) => {
        const cost = BigInt(p.priceMinor || '0');
        return acc + scaleMinorByQty(cost, p.quantity || '0');
      }, 0n),
    [form?.positions],
  );

  // moysklad parity: a POSTED Оприходование stays editable (the BE re-applies stock
  // on save); only a CANCELLED document is locked.
  const editable = data?.state !== 'cancelled';

  // moysklad #enter position columns — built from the ⚙ customizer (mirror /new).
  // Grid order: Изобр · Наименование ▾ · Кол-во(+unit inline) · Ячейка · Остаток ·
  // Цена ▾ · Сумма · Причина · ГТД · РНПТ · Страна · ⚙. The «Цена ▾» reprice menu is
  // gated to a draft; the ⚙ column toggle is a pure view op (always available).
  const positionColumns = useMemo<PositionTableColumnConfig[]>(() => {
    const cols: PositionTableColumnConfig[] = [
      { key: 'dragarea' },
      { key: 'select' },
      // moysklad shows the row number «1,2,3…» (becomes a checkbox on hover) with an
      // EMPTY header — mirror CO/[id]. The image lives INSIDE the «Наименование» cell
      // (PositionNameCell), so there's no standalone image column by default.
      { key: 'index', label: '' },
    ];
    if (colVisible.image) cols.push({ key: 'image' });
    cols.push({ key: 'name', label: tCols('name') });
    cols.push({ key: 'quantity', label: tPos('quantity') });
    if (colVisible.unit) cols.push({ key: 'unit', label: tCols('unit') });
    if (colVisible.cell)
      cols.push({ key: 'cell', label: tCols('cell'), placeholder: tCols('cell_unset') });
    if (colVisible.stock) cols.push({ key: 'stock', label: tCols('stock') });
    if (colVisible.weight) cols.push({ key: 'weight', label: tCols('weight') });
    if (colVisible.volume) cols.push({ key: 'volume', label: tCols('volume') });
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
    if (colVisible.costPerUnit) cols.push({ key: 'costPerUnit', label: tCols('costPerUnit') });
    cols.push({ key: 'amount', label: tCols('amount') });
    if (colVisible.costTotal) cols.push({ key: 'costTotal', label: tCols('costTotal') });
    if (colVisible.reason) cols.push({ key: 'reason', label: tCols('reason') });
    if (colVisible.gtdNumber) cols.push({ key: 'gtdNumber', label: tCols('gtd') });
    if (colVisible.rnpt) cols.push({ key: 'rnpt', label: tCols('rnpt') });
    if (colVisible.country) cols.push({ key: 'country', label: tCols('country') });
    // moysklad places the «⚙» customizer in its OWN trailing column at the far
    // right (after «Страна»), NOT on the «Сумма» header — mirror /new.
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
  }, [colVisible, editable, tCols, tPos, priceTypesData, repricePositions, saveProductPrices]);

  if (isLoading || !form)
    return <div className="p-8 text-[var(--ms-text-muted)] text-sm">{tCommon('loading')}</div>;
  if (!data) return <div className="p-8 text-sm">{tCommon('not_found')}</div>;

  const editableLines = data.state !== 'cancelled';
  const selectedCurrency = currencies.find((c) => c.isoCode === form.currency);
  const isBaseCurrency = selectedCurrency?.default ?? form.currency === 'UZS';
  // moysklad «1 USD = N UZS ✎» — the rate is the DOCUMENT's own (form.rate); the ✎
  // opens «Курс валюты документа» (CurrencyRateModal) to override it.
  const effectiveRate = form.rate;
  const baseCode = currencies.find((c) => c.default)?.isoCode ?? 'UZS';
  const docGlobalRate = selectedCurrency?.rate ?? '1';

  // moysklad «Статус» pill — the built-in draft/posted/cancelled FSM, bound to the
  // REAL state (decorative on /new, functional here). Picking a status fires the
  // matching transition; «Проведено» drives post/unpost too (moysklad parity).
  const STATUS_OPTIONS = [
    { value: 'draft', label: tStates('draft'), color: '#e8eef5' },
    { value: 'posted', label: tStates('posted'), color: '#cfe8d3' },
    { value: 'cancelled', label: tStates('cancelled'), color: '#f4d4d4' },
  ];
  const onApplicableChange =
    data.state === 'cancelled'
      ? undefined
      : (next: boolean) => transitionMut.mutate(next ? 'post' : 'unpost');

  // Position «Наименование» cell — moysklad-parity borderless [img] + bold code +
  // name (PositionNameCell, mirror CO/[id]); clicking re-opens the per-row product
  // picker. Read-only on a posted enter.
  const renderPositionNameCell = (row: DocPositionRow) => {
    const p = row as DetailPositionRow;
    // moysklad parity: a PICKED product's name is a blue LINK to its product card
    // (where the «Аналоги» tab lives); falls back to the picker when unset/read-only.
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
  const renderPositionCountryCell = (row: DocPositionRow) => (
    <CatalogPickerField
      value={row.countryId ? { id: row.countryId, label: row.countryLabel ?? '' } : null}
      placeholder={tFields('country')}
      onPick={() => editableLines && setOpenPicker({ kind: 'country', rowUid: row.id })}
      onClear={() => editableLines && updatePosition(row.id, { countryId: null, countryLabel: '' })}
      disabled={!editableLines}
      // moysklad parity: borderless «Страна» cell — box appears on hover (mirror the grid inputs).
      fieldClassName="h-7 border-transparent bg-transparent hover:border-[var(--ms-border-input)] hover:bg-[var(--ms-bg-surface)]"
    />
  );

  // «Ячейка» — address-storage cell picker (mirror /new). Closure has form.storeId
  // (page state) + the row's product (assortmentId), so the picker can show «Все
  // ячейки» / «С этим товаром». Stores cellId (drives per-cell stock) + the «Зона /
  // Ячейка» label in `cell`. Read-only when the doc is not editable (cancelled) —
  // the picker then renders a plain label.
  const renderPositionCellCell = (row: DocPositionRow) => {
    const p = row as DetailPositionRow;
    return (
      <CellPickerField
        storeId={form.storeId || null}
        assortmentId={p.assortmentId}
        label={p.cell}
        readOnly={!editableLines}
        // Оприходование stores goods: picking a cell for a cell-less product binds
        // it as that product's home cell (never overwrites an existing binding).
        bindProductCell
        onSelect={(cellId, label) => updatePosition(row.id, { cellId, cell: label })}
        onClear={() => updatePosition(row.id, { cellId: null, cell: '' })}
      />
    );
  };

  return (
    <div
      // moysklad parity: the document sits on a WHITE content area, left-aligned
      // and capped at ~1300px — it does NOT stretch edge-to-edge on wide screens.
      className="flex min-h-screen flex-col bg-[var(--ms-bg-surface)]"
      data-test-id="enter-detail-page"
    >
      <div className="w-full max-w-[1300px]">
        <DetailToolbar
          isDirty={isDirty}
          isSaving={saveMut.isPending}
          onSave={() => saveMut.mutate()}
          onClose={() => router.push('/enters')}
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
          onPrintList={() =>
            window.open(`/print/enter/${data.id}?auto=1`, '_blank', 'width=820,height=1100')
          }
          printEntity="enter"
          rightSlot={
            // moysklad top-right cluster on the TOOLBAR row: «Владелец» (owner) +
            // «Изменения» (last-modified) link. Owner is editable while the enter is
            // a draft; on a posted doc it's a read-only label. («Смотрит» presence
            // needs WS infra we don't have yet — intentionally omitted, not faked.)
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
              <DocumentHistoryLink auditEntity="Enter" entityId={data.id} />
            </>
          }
        />

        {/* Editable shared <DocumentHeader> (mirrors /new). № is auto-assigned so it
          stays read-only; date is editable on a draft. «Статус» is the built-in
          draft/posted/cancelled FSM (bound to the real state); «Проведено» drives
          post/unpost. The owner popover + «Изменения» link live on the TOOLBAR row. */}
        <DocumentHeader
          {...docEditorLabels}
          documentTypeLabel={tDetailTitles('enter')}
          number={data.name}
          date={form.moment}
          onDateChange={editableLines ? (v) => setForm((f) => f && { ...f, moment: v }) : undefined}
          // moysklad enter header shows a grey «Статус» pill (custom statuses, none
          // defined → empty) — NOT the FSM state; the draft/posted state is conveyed
          // by «Проведено» (real capture 21-create-full). Keep the pill empty (mirror
          // /new); the 3 FSM options stay clickable so state changes remain possible.
          status=""
          statusOptions={STATUS_OPTIONS}
          onStatusChange={(slug) => transitionMut.mutate(DOC_STATE_VERB[slug] ?? slug)}
          applicable={data.applicable}
          onApplicableChange={onApplicableChange}
          // moysklad «(?) Проведено» — help tooltip icon before the checkbox.
          applicableHelp={t('applicable_help')}
        />

        <main className="px-4 py-4">
          {/* moysklad parity: a POSTED doc is editable (no lock banner) — saving it
            re-applies stock on the BE. Only a CANCELLED document is read-only. */}
          {data.state === 'cancelled' && (
            <Alert tone="info" className="mb-3">
              {tCommon('locked_when_cancelled')}
            </Alert>
          )}

          {/* moysklad b-operation-form-top — bare 2-column meta grid (mirror /new):
            Организация‖Склад · Проект‖∅ · Валюта‖∅. */}
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
              auditEntity="Enter"
              entityId={data.id}
              relatedGroups={[]}
              positionsLabel={tDetailTabs('positions')}
              filesSlot={<AttachmentsSection entity="Enter" entityId={data.id} />}
              tasksSlot={<DocumentTasksSection entity="Enter" entityId={data.id} />}
              historyInline={false}
              relatedSlot={
                <RelatedDocsTab
                  current={{
                    id: data.id,
                    name: data.name,
                    moment: data.moment,
                    state: data.state,
                    sumMinor: String(totals),
                    kind: 'enter',
                  }}
                />
              }
            >
              <div>
                {/* moysklad position table — full column set + ⚙ customizer + «Цена ▾»
                  menu + inline «Добавить позицию» bar. Posted docs are read-only. */}
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
                    renderCountryCell={renderPositionCountryCell}
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
                                        quantity: entry?.quantity ?? '1',
                                        priceMinor: entry?.priceMinor ?? raw?.buyPrice ?? '0',
                                        discount: '0',
                                        vat: '',
                                        vatEnabled: false,
                                        stock: raw?.stock?.onHand,
                                        available: raw?.stock?.available,
                                        salePrices: raw?.salePrices ?? null,
                                        folderPath: raw?.productFolder?.pathName ?? undefined,
                                        weightG: raw?.weightG ?? undefined,
                                        volumeML: raw?.volumeML ?? undefined,
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

                {/* Bottom — moysklad: «Комментарий» (left, FIXED ~600px) + a right
                  column with «Итого», a divider, and «Накладные расходы … Распределить».
                  Left-aligned, content-sized — does NOT stretch to the screen edge. */}
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
                  <div className="min-w-[300px] space-y-3">
                    <div className="flex justify-between gap-8 font-semibold text-base">
                      <dt>{tFields('sum_total')}:</dt>
                      <dd className="tabular-nums" data-test-id="enter-total">
                        {formatMoney(String(totals), 'UZS', { displayAs: 'none' })}
                      </dd>
                    </div>
                    <hr className="border-[var(--ms-border-default)]" />
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="text-[var(--ms-text-muted)]">
                        {tDetailForm('overhead_sum')}
                      </span>
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
                        disabled={!editableLines}
                        data-test-id="field-overhead-sum"
                        className="w-24"
                      />
                      <span className="text-[var(--ms-text-muted)]">
                        {tDetailForm('overhead_distribution')}
                      </span>
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
                        disabled={!editableLines || !(Number(form.overheadMajor) > 0)}
                        className="w-32"
                      >
                        <option value="PRICE">{tDetailForm('overhead_by_price')}</option>
                        <option value="WEIGHT">{tDetailForm('overhead_by_weight')}</option>
                        <option value="VOLUME">{tDetailForm('overhead_by_volume')}</option>
                      </NativeSelect>
                    </div>
                  </div>
                </div>
              </div>
            </DetailContentTabs>
          </div>

          <div className="mt-4">
            <AttributesEditor
              entity="Enter"
              values={form.attributes}
              onChange={(next) => setForm((f) => f && { ...f, attributes: next })}
              disabled={!editableLines}
              testIdPrefix="enter"
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
      <CatalogPicker
        open={
          typeof openPicker === 'object' && openPicker !== null && openPicker.kind === 'country'
        }
        onClose={() => setOpenPicker(null)}
        title={tFields('country')}
        fetcher={countryFetcher}
        onSelect={(item) => {
          if (typeof openPicker !== 'object' || openPicker === null) return;
          updatePosition(openPicker.rowUid, {
            countryId: item.id,
            countryLabel: String(item.primary),
          });
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
    </div>
  );
}
