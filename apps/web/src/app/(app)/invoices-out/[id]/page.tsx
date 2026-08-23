'use client';

/**
 * /invoices-out/[id] — moysklad-parity «Счёт покупателю» editor (existing doc).
 *
 * Rebuilt 2026-06-26 onto the SAME shell as invoices-in/[id] + purchase-orders/[id]
 * (the proven detail reference) so the edit form is 1:1 with live moysklad: DetailToolbar
 * (record-nav server-backed + owner popover + history) + the shared DocumentHeader (title ·
 * grey «Статус» · «Проведено») + INLINE type-to-search ref fields (NOT modals) + row-paired
 * metaPanel (Организация+«Сум» subRow · Контрагент+«Баланс» · План.дата оплаты · Канал продаж ·
 * Валюта документа+FX | Склад · Договор · Проект) + PositionTable (Цена▾/Наименование▾/Сумма⚙)
 * + DetailContentTabs (positions/related/files/tasks/history) + AttributesEditor.
 *
 * Sales-doc specifics vs the supplier invoice: line price = SALE price (NOT buyPrice),
 * «Канал продаж» meta field, NO «Входящий номер». moysklad's account has 0 invoice-out docs
 * so the [id] chrome is mirrored from the verified invoice-in/[id] sibling (same GWT editor).
 * A posted («Проведено») invoice stays EDITABLE — only a cancelled one locks; the BE
 * re-derives the counterparty balance + CO invoiced-total on save (update() reverse+reapply).
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
import { OwnerAccessPopover } from '@/components/documents/owner-access-popover';
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
import { isOptimisticConflict } from '@/lib/optimistic-lock';
import { distributeAgreementDelta, sumAgreementGross } from '@/lib/position-agreement';
import {
  resolveDefaultSalePriceOrZero,
  resolveSalePriceByType,
  useCurrencyRates,
  usePriceTypeIds,
} from '@/lib/sale-price';
import {
  Alert,
  CatalogPicker,
  CatalogPickerField,
  DatePicker,
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
  product: { id: string; name: string; code: string | null; uom: string | null } | null;
}

interface InvoiceDetail {
  id: string;
  version: number;
  name: string;
  externalCode: string | null;
  state: string;
  applicable: boolean;
  published: boolean;
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
  customerOrder: { id: string; name: string; state: string } | null;
  /** «Статус» — account custom status (State row), orthogonal to the FSM. */
  status: { id: string; name: string; color: string | null } | null;
  salesChannel: { id: string; name: string } | null;
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
  salesChannelId: string | null;
  salesChannelLabel: string;
  contractId: string | null;
  contractLabel: string;
  projectId: string | null;
  projectLabel: string;
  organizationAccountId: string | null;
  organizationAccountLabel: string;
  description: string;
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

// moysklad «Счёт покупателю» optional position columns (sibling parity, 2026-06-26):
// Доступно ON, Единица ON; Изображение · Отгружено · Остаток · Резерв · Вес · Объём ·
// Сумма НДС OFF. Toggle via «Сумма ⚙». Mirrors /invoices-out/new.
const OPTIONAL_POSITION_COLUMNS: { key: PositionColumnKey; labelKey: string; on: boolean }[] = [
  { key: 'image', labelKey: 'image', on: false },
  { key: 'unit', labelKey: 'unit', on: true },
  { key: 'shipped', labelKey: 'shipped', on: false },
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
    salesChannelId: d.salesChannel?.id ?? null,
    salesChannelLabel: d.salesChannel?.name ?? '',
    contractId: d.contract?.id ?? null,
    contractLabel: d.contract?.name ?? '',
    projectId: d.project?.id ?? null,
    projectLabel: d.project?.name ?? '',
    organizationAccountId: d.organizationAccount?.id ?? null,
    organizationAccountLabel:
      d.organizationAccount?.name || d.organizationAccount?.accountNumber || '',
    description: d.description ?? '',
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
    salesChannelId: s.salesChannelId,
    contractId: s.contractId,
    projectId: s.projectId,
    organizationAccountId: s.organizationAccountId,
    description: s.description,
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

export default function InvoiceOutDetailPage() {
  const { id } = useParams<{ id: string }>();
  // moysklad «N из ВСЕГО ‹ ›» — server-backed (GET /invoices-out/:id/position).
  const detailNav = useDetailNavigation('invoices-out', id, { server: true });
  const docEditorLabels = useDocumentEditorLabels();
  const router = useRouter();
  const qc = useQueryClient();
  const t = useTranslations('pages.invoices_out');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tDetailTitles = useTranslations('detail_titles');
  const tDetailForm = useTranslations('detail_form');
  const tDetailTabs = useTranslations('detail_tabs');
  const tForm = useTranslations('form');
  const tPos = useTranslations('position_editor');
  const { toast } = useToast();
  const tCols = useTranslations('position_cols');
  const tPrint = useTranslations('print_menu');
  const tMoneyMenu = useTranslations('money_docs_menu');
  const tSpiska = useTranslations('pages.pickLists');
  const tEmail = useTranslations('email_template');

  const { data, isLoading } = useQuery<InvoiceDetail>({
    queryKey: ['invoice-out', id],
    queryFn: () => api.get(`/invoices-out/${id}`),
  });

  const { priceTypes, defaultId: defaultPriceTypeId } = usePriceTypeIds();
  // Valyuta kurslari — valyutali salePrices'ni baza valyutasiga o'girish uchun.
  // Hujjat yuklanmaguncha bo'ladigan erta `return`'dan (826/832) OLDIN turishi SHART.
  const rates = useCurrencyRates();

  // moysklad «Статус» — the account's custom invoice-out statuses (State rows,
  // entityType="invoiceout"); drives the header pill options. Mirror supply/[id].
  const { data: statusData } = useQuery<{
    items: Array<{ id: string; name: string; color: string | null }>;
  }>({
    queryKey: ['states', 'invoiceout'],
    queryFn: () => api.get('/states?entityType=invoiceout'),
    staleTime: 60_000,
  });
  const customStatuses = statusData?.items ?? [];

  // moysklad «Печать» / «Отправить» — the account's own «Счёт покупателю» print
  // forms (PDF), listed by name. Mirror supply/[id].
  const { data: printForms } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ['invoice-out-print-forms'],
    queryFn: () => api.get<Array<{ id: string; name: string }>>('/invoices-out/print-forms'),
    staleTime: 60_000,
  });
  const { openTemplates } = usePrintTemplatesManager();

  // «Валюта документа» options + rates — the account's REAL currencies (Настройки → Валюты).
  const { data: currenciesData } = useQuery<{ items: CurrencyItem[] }>({
    queryKey: ['currencies'],
    queryFn: () => api.get('/currencies'),
    staleTime: 60_000,
  });
  const currencies = useMemo(() => currenciesData?.items ?? [], [currenciesData]);

  const [form, setForm] = useState<FormState | null>(null);
  // «Печать → Лист сборки» / «Товарный чек» (climart 2026-07-29): ikkala 72mm termal
  // chekni AYNAN SHU HISOBVARAQDAN chop etish (invoices-out = foydalanuvchining savdosi).
  // Varaq mantiqi umumiy hook'da (`hooks/use-pick-sheet.ts`): bu yerdagi nusxa
  // qatorning O'Z yacheykasini e'tiborsiz qoldirib, har safar tovarning standart
  // yacheykasini so'rardi — omborchi noto'g'ri javonga yuborilishi mumkin edi.
  const { sheet: spiska, openSheet, closeSheet } = usePickSheet();
  const openSpiska = useCallback(() => {
    if (!form || !data) return;
    // hisobvaraq bo'yicha tovar javondan OLINADI. Sarlavha «Tovar cheki» EMAS — u xaridor chekining nomi.
    return openSheet({
      title: tSpiska('sheet_title_pick'),
      number: data.name,
      moment: form.moment,
      agentName: form.agentLabel || null,
      ownerName: form.ownerLabel || null,
      description: form.description || null,
      rows: form.positions,
    });
  }, [form, data, tSpiska, openSheet]);
  const [creceipt, setCreceipt] = useState<CustomerReceiptData | null>(null);
  const openCustomerReceipt = useCallback(() => {
    if (!form || !data) return;
    const rows = form.positions.filter((p) => p.assortmentId && Number(p.quantity) > 0);
    setCreceipt({
      number: data.name,
      dateStr: receiptDate(new Date(form.moment)),
      orgName: form.organizationLabel || null,
      sellerName: form.ownerLabel || null,
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
  const [original, setOriginal] = useState<string>('');
  const [openPicker, setOpenPicker] = useState<
    | null
    | 'agent'
    | 'org'
    | 'store'
    | 'salesChannel'
    | 'contract'
    | 'project'
    | 'organizationAccount'
  >(null);
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
  // «Валюта документа» FX — moysklad shows «1 USD = N UZS» INLINE + a ✎ to override.
  const [rateOverride, setRateOverride] = useState<string | null>(null);
  const [rateModalOpen, setRateModalOpen] = useState(false);
  // «Отправить» email composer + «Печать ▸ Комплект…» dialog (mirror supply/[id]).
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailAttachments, setEmailAttachments] = useState<{ id: string; filename: string }[]>([]);
  const [kitPrintOpen, setKitPrintOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const onConflict = useConflictReload(['invoice-out', id], () => setForm(null));

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
  const repricePositions = useCallback(
    (priceTypeId: string) => {
      setForm((s) =>
        s
          ? {
              ...s,
              positions: s.positions.map((p) => {
                // «Расценить» — qavat valyutada bo'lsa JORIY kurs bilan bazaga o'giriladi;
                // kursi noma'lum bo'lsa qator narxi TEGILMAYDI (xom son yozishdan ko'ra
                // eskisi qolgani xavfsizroq — 2026-08-23 auditi).
                const next = resolveSalePriceByType(p.salePrices, priceTypeId, rates);
                return next != null ? { ...p, priceMinor: next } : p;
              }),
            }
          : s,
      );
    },
    [rates],
  );
  // «Сохранить цены» — sales invoice line price is the SALE price → save to the
  // product's salePrices under the DEFAULT price type (preserving other tiers).
  const saveProductPrices = useCallback(async () => {
    if (!defaultPriceTypeId) return;
    const positions = form?.positions ?? [];
    const seen = new Set<string>();
    for (const p of positions) {
      if (!p.assortmentId || seen.has(p.assortmentId)) continue;
      seen.add(p.assortmentId);
      try {
        const prod = await api.get<{
          version: number;
          salePrices: Array<{ priceTypeId: string; value: string; currencyCode?: string }> | null;
        }>(`/products/${p.assortmentId}`);
        const existing = prod.salePrices ?? [];
        const merged = existing.some((sp) => sp.priceTypeId === defaultPriceTypeId)
          ? existing.map((sp) =>
              sp.priceTypeId === defaultPriceTypeId
                ? { ...sp, value: p.priceMinor, currencyCode: rates.base ?? undefined }
                : sp,
            )
          : [...existing, { priceTypeId: defaultPriceTypeId, value: p.priceMinor }];
        await api.patch(`/products/${p.assortmentId}`, {
          version: prod.version,
          salePrices: merged,
        });
      } catch {
        // skip products that can't be updated; others proceed
      }
    }
  }, [form, defaultPriceTypeId]);
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
    mutationFn: (target: string) => api.post(`/invoices-out/${id}/transitions/${target}`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoice-out', id] });
      qc.invalidateQueries({ queryKey: ['invoices-out'] });
      if (data?.customerOrder) {
        qc.invalidateQueries({ queryKey: ['customer-order', data.customerOrder.id] });
        qc.invalidateQueries({ queryKey: ['customer-orders'] });
      }
    },
  });

  // moysklad «Статус» — set the account custom status (InvoiceOut.statusId) on
  // the header pill. Applied IMMEDIATELY via its own endpoint (status is
  // orthogonal to «Проведено»). Mirror supply/[id].
  const setStatusMut = useApiMutation({
    mutationFn: (statusId: string) => api.patch(`/invoices-out/${id}/status`, { statusId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoice-out', id] });
      qc.invalidateQueries({ queryKey: ['invoices-out'] });
    },
  });

  const deleteMut = useApiMutation({
    mutationFn: () => api.delete(`/invoices-out/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices-out'] });
      router.push('/invoices-out');
    },
  });

  const cloneMut = useApiMutation({
    mutationFn: () => api.post<{ id: string }>(`/invoices-out/${id}/clone`, {}),
    onSuccess: (clone) => {
      qc.invalidateQueries({ queryKey: ['invoices-out'] });
      router.push(`/invoices-out/${clone.id}`);
    },
  });

  const { runDestructive } = useDestructiveMutation();

  // moysklad «Создать документ → Входящий платёж» for the unpaid balance.
  const createPaymentMut = useApiMutation({
    mutationFn: () => api.post<{ id: string }>(`/payments-in/from-invoice-out/${id}`, {}),
    onSuccess: (payment) => {
      qc.invalidateQueries({ queryKey: ['invoice-out', id] });
      qc.invalidateQueries({ queryKey: ['invoices-out'] });
      router.push(`/payments-in/${payment.id}`);
    },
  });

  // moysklad «Создать документ → Приходный ордер» — a draft ПКО for the unpaid
  // balance, linked via operations (pays the invoice down when posted).
  const createCashInMut = useApiMutation({
    mutationFn: () => api.post<{ id: string }>(`/cash-in/from-invoice-out/${id}`, {}),
    onSuccess: (cashIn) => {
      qc.invalidateQueries({ queryKey: ['invoice-out', id] });
      qc.invalidateQueries({ queryKey: ['invoices-out'] });
      router.push(`/cash-in/${cashIn.id}`);
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
        paymentPlannedMoment: form.paymentPlannedMoment || null,
        vatEnabled: form.vatEnabled,
        vatIncluded: form.vatIncluded,
        salesChannelId: form.salesChannelId,
        contractId: form.contractId,
        projectId: form.projectId,
        storeId: form.storeId,
        organizationAccountId: form.organizationAccountId,
        // «Владелец» / «Владелец-отдел» / «Общий доступ».
        ownerId: form.ownerId,
        groupId: form.groupId,
        shared: form.shared,
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
      return api.patch(`/invoices-out/${id}`, payload);
    },
    onSuccess: () => {
      setSaveError(null);
      qc.invalidateQueries({ queryKey: ['invoice-out', id] });
      qc.invalidateQueries({ queryKey: ['invoices-out'] });
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
  const salesChannelFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: Array<{ id: string; name: string }> }>(
      `/sales-channels?search=${encodeURIComponent(s)}&limit=50`,
    );
    return d.items.map((c) => ({ id: c.id, primary: c.name }));
  };
  const contractFetcher = async (s: string): Promise<PickerItem[]> => {
    const params = new URLSearchParams({ search: s, limit: '50' });
    if (form?.agentId) params.set('counterpartyId', form.agentId);
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
    }>(`/bank-accounts?${params.toString()}`);
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

  // ── Position columns (mirror /invoices-out/new; menus disabled when not editable) ──
  // moysklad keeps a POSTED («Проведено») invoice editable — only a cancelled one is
  // locked (the BE re-derives balance + CO invoiced-total on save). Mirrors invoice-in/[id].
  const editable = !!data && data.state !== 'cancelled';
  const positionColumns = useMemo<PositionTableColumnConfig[]>(() => {
    const cols: PositionTableColumnConfig[] = [{ key: 'dragarea' }, { key: 'select' }];
    if (colVisible.image) cols.push({ key: 'image' });
    cols.push({ key: 'name', label: tCols('name') });
    cols.push({ key: 'quantity', label: tPos('quantity') });
    if (colVisible.unit) cols.push({ key: 'unit', label: tCols('unit') });
    if (colVisible.shipped) cols.push({ key: 'shipped', label: tCols('shipped') });
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
          priceTypes={priceTypes.map((pt) => ({ id: pt.id, name: pt.name }))}
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
    priceTypes,
    repricePositions,
    saveProductPrices,
    applyDiscountMarkup,
    selectedRowIds,
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

  const sumBig = BigInt(data.sumMinor || '0');
  const vatBig = BigInt(data.vatSumMinor || '0');
  const paidBig = BigInt(data.payedSumMinor || '0');
  const { subtotal, total } = docTotals(sumBig, vatBig);
  const totalQty = form.positions.reduce((acc, p) => acc + Number(p.quantity || 0), 0);
  const isPaid = sumBig > 0n && paidBig >= sumBig;

  const canCreatePayment =
    (['posted', 'sent', 'partially_paid', 'overdue'] as const).includes(data.state as never) &&
    !isPaid;

  // moysklad «Создать документ» for a customer invoice — the invoice basis set
  // (Отгрузка · Возврат покупателя · Счёт-фактура выданный · Входящий платёж ·
  // Приходный ордер). The two payment flows are wired (BE from-invoice-out);
  // the other three stay disabled label-parity placeholders until their
  // from-invoice flows exist (same convention as supplies/[id]).
  const createMenuItems: CreateMenuItem[] = [
    { id: 'demand', label: tDetailTitles('demand'), disabled: true },
    { id: 'sales-return', label: tDetailTitles('sales_return'), disabled: true },
    { id: 'facture-out', label: tDetailTitles('facture_out'), disabled: true },
    {
      id: 'payment-in',
      label: tDetailTitles('payment_in'),
      onSelect: canCreatePayment ? () => createPaymentMut.mutate() : undefined,
      disabled: !canCreatePayment,
    },
    {
      id: 'cash-in',
      label: tDetailTitles('cash_in'),
      onSelect: canCreatePayment ? () => createCashInMut.mutate() : undefined,
      disabled: !canCreatePayment,
    },
  ];

  // ----- «Печать» menu (moysklad parity, mirror supply/[id]) ----------------
  // Single record → every print acts on THIS invoice (ids = [data.id]). A custom
  // form downloads via bulk-print(templateId); the standard «Счет покупателю»
  // opens the HTML print view. Each download flips the printed flag server-side.
  const printForm = (templateId?: string) => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    void api
      .postDownload(
        '/invoices-out/bulk-print',
        { ids: [data.id], ...(templateId ? { templateId } : {}) },
        `invoice-out-${data.name}-${stamp}.pdf`,
      )
      .then(() => qc.invalidateQueries({ queryKey: ['invoice-out', id] }));
  };
  const kitPrint = (templateIds: Array<string | null>) => {
    if (templateIds.length === 0) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    void api
      .postDownload(
        '/invoices-out/kit-print',
        { ids: [data.id], templateIds },
        `invoice-out-${data.name}-kit-${stamp}.pdf`,
      )
      .then(() => qc.invalidateQueries({ queryKey: ['invoice-out', id] }));
  };
  const kitForms: KitPrintForm[] = [
    { id: null, name: tMoneyMenu('inv_out_plain') },
    ...(printForms ?? []).map((f) => ({ id: f.id, name: f.name })),
  ];
  const printMenuItems: CreateMenuItem[] = [
    // The account's own «Счёт покупателю» forms (bulk-print via templateId).
    ...(printForms ?? []).map((f) => ({
      id: `form-${f.id}`,
      label: f.name,
      onSelect: () => printForm(f.id),
    })),
    // The standard built-in «Счет покупателю» form — opens the HTML print view.
    {
      id: 'standard',
      label: tMoneyMenu('inv_out_plain'),
      onSelect: () =>
        window.open(`/print/invoice-out/${data.id}?auto=1`, '_blank', 'width=820,height=1100'),
    },
    // «Лист сборки» + «Товарный чек» — 72mm termal cheklar (climart), shu hisobvaraqdan.
    { id: 'spiska', label: tSpiska('spiska_form'), onSelect: () => void openSpiska() },
    {
      id: 'creceipt',
      label: tSpiska('receipt_title_customer'),
      onSelect: () => openCustomerReceipt(),
    },
    // «Комплект…» — bundle several forms into one PDF.
    { id: 'set', label: tPrint('set'), onSelect: () => setKitPrintOpen(true) },
    // «Настроить…» — right-side «Настройка шаблонов» slide-over for invoiceout.
    { id: 'configure', label: tPrint('configure'), onSelect: () => openTemplates('invoiceout') },
  ];

  // ----- «Отправить» menu (moysklad parity) ---------------------------------
  // Lists the SAME forms as «Печать» to email: render THIS invoice through the
  // form, store the PDF as an attachment and open the composer with it attached.
  const sendForm = async (templateId?: string) => {
    const att = await api.post<{ attachmentId: string; filename: string }>(
      `/invoices-out/${data.id}/print-attachment`,
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
      label: tMoneyMenu('inv_out_plain'),
      onSelect: () => void sendForm(),
    },
  ];

  // moysklad «Статус» pill — the account's custom invoice-out statuses (grey
  // «Статус» when none configured). FSM lifecycle stays on «Проведено».
  const statusOptions = customStatuses.map((s) => ({
    value: s.id,
    label: s.name,
    color: s.color ?? undefined,
  }));

  // moysklad «Проведено» drives the FSM (post/unpost). A cancelled invoice can't toggle.
  const onApplicableChange = (['cancelled'] as readonly string[]).includes(data.state)
    ? undefined
    : (next: boolean) => transitionMut.mutate(next ? 'post' : 'unpost');

  // «Валюта документа» rate helper «1 USD = N UZS» (when not the base currency).
  const selectedCurrency = currencies.find((c) => c.isoCode === form.currency);
  const isBaseCurrency = selectedCurrency?.default ?? form.currency === 'UZS';
  const effectiveRate = rateOverride ?? selectedCurrency?.rate ?? '1';

  // moysklad green-check notice (below the toolbar): «Позиции документа содержат
  // повторяющиеся товары» — when the same product appears on more than one line.
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
      priceMinor: resolveDefaultSalePriceOrZero(raw?.salePrices, defaultPriceTypeId, rates),
      vat: raw?.vat != null ? String(raw.vat) : '12',
      available: raw?.stock?.available,
      stock: raw?.stock?.onHand,
      reserve: raw?.stock?.reserved,
      salePrices: raw?.salePrices ?? null,
    });
  };
  const renderPositionNameCell = (row: DocPositionRow) => {
    const p = row as DetailPositionRow;
    // moysklad parity: a picked product's name LINKS to its product card (where the
    // «Аналоги» tab lives). Swapping moves to the row ⋮ «Заменить» (onReplace below).
    const href = p.assortmentId ? `/products/${p.assortmentId}` : undefined;
    return (
      <PositionNameCell
        imageUrl={p.imageUrl}
        code={p.productCode}
        label={p.productLabel}
        placeholder={tForm('select_product')}
        onPick={() => editable && setProductRowId(p.id)}
        productHref={href}
        onNavigate={href ? () => router.push(href) : undefined}
        disabled={!editable}
        testId={`pos-${p.id}-name`}
      />
    );
  };

  return (
    <div
      className="flex min-h-screen flex-col bg-[var(--ms-bg-surface)]"
      data-test-id="invoice-out-detail-page"
    >
      <div className="w-full max-w-[1300px]">
        <DetailToolbar
          isDirty={isDirty}
          isSaving={saveMut.isPending}
          onSave={() => saveMut.mutate()}
          onClose={() => router.push('/invoices-out')}
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
          printMenuItems={printMenuItems}
          sendMenuItems={sendMenuItems}
          printEntity="invoiceout"
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
              <DocumentHistoryLink auditEntity="InvoiceOut" entityId={data.id} />
            </>
          }
        />

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
          documentTypeLabel={tDetailTitles('invoice_out')}
          number={data.name}
          date={form.moment}
          onDateChange={editable ? (v) => setForm((f) => f && { ...f, moment: v }) : undefined}
          // moysklad «Статус» — the account's custom invoice-out statuses (grey
          // «Статус» until configured via «Настроить…»). Applied immediately.
          status={data.status?.id ?? ''}
          statusOptions={statusOptions}
          onStatusChange={(sid) => setStatusMut.mutate(sid)}
          onConfigureStatuses={() => router.push('/settings/invoice-out-statuses')}
          configureStatusesLabel={tForm('configure_statuses')}
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
          {createCashInMut.error && (
            <Alert tone="destructive" className="mb-3">
              {(createCashInMut.error as Error).message}
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
                  onCreate={editable ? () => router.push('/settings/projects/new') : undefined}
                  createLabel={tForm('create_new_project')}
                  disabled={!editable}
                  testId="field-project"
                />
              </DocumentMetaField>
            </DocumentMetaRow>

            {/* «Канал продаж» — left-only row (sales-doc specific). */}
            <DocumentMetaRow fixedWidth>
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
            </DocumentMetaRow>

            {/* moysklad: [валюта ▾] ✎ 1 USD = N UZS ✎ — the rate sits INLINE with the picker. */}
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
                    <span className="ml-1 inline-flex items-center gap-1 text-[var(--ms-text-muted)] text-[12px] tabular-nums">
                      <span>
                        1 {form.currency} ={' '}
                        {Number(effectiveRate).toLocaleString('ru-RU', {
                          maximumFractionDigits: 4,
                        })}{' '}
                        UZS
                      </span>
                      {editable && (
                        <button
                          type="button"
                          onClick={() => setRateModalOpen(true)}
                          className="px-0.5 text-[var(--ms-text-brand)] hover:opacity-80"
                          aria-label={tCommon('edit')}
                          data-test-id="rate-edit"
                        >
                          ✎
                        </button>
                      )}
                    </span>
                  )}
                </div>
              </DocumentMetaField>
            </DocumentMetaRow>
            {!isBaseCurrency && selectedCurrency && (
              <CurrencyRateModal
                open={rateModalOpen}
                onOpenChange={setRateModalOpen}
                currency={form.currency}
                referenceRate={selectedCurrency.rate ?? '1'}
                currentOverride={rateOverride}
                onApply={setRateOverride}
                disabled={!editable}
              />
            )}
          </div>

          <div className="mt-4">
            <DetailContentTabs
              auditEntity="InvoiceOut"
              entityId={data.id}
              relatedGroups={[]}
              positionsLabel={tDetailTabs('positions')}
              filesSlot={<AttachmentsSection entity="InvoiceOut" entityId={data.id} />}
              tasksSlot={<DocumentTasksSection entity="InvoiceOut" entityId={data.id} />}
              historyInline={false}
              relatedSlot={
                <RelatedDocsTab
                  current={{
                    id: data.id,
                    name: data.name,
                    moment: data.moment,
                    state: data.state,
                    sumMinor: data.sumMinor,
                    kind: 'invoice-out',
                  }}
                  // «Привязать документ» — the tab owns the «Привязка документа»
                  // modal (pre-scoped to this invoice's refs) + manual links +
                  // unlink + the «?link=new» auto-open hand-off.
                  linkable={{
                    entityType: 'InvoiceOut',
                    agent: data.agent,
                    organization: data.organization,
                    storeTo: data.store,
                  }}
                />
              }
            >
              <div>
                <div className="min-w-0">
                  {/* Owner 2026-07-23: «Договорная цена» — blue, at the table's OUTER
                      top-right corner (same spot in every section). */}
                  {editable && (
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
                    // moysklad row ⋮ «Заменить» — swap the line's product (the name is now a
                    // card link, so swapping moves here). Opens the per-row product picker.
                    onReplace={editable ? (id) => setProductRowId(id) : undefined}
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
                                priceMinor: resolveDefaultSalePriceOrZero(
                                  p.salePrices,
                                  defaultPriceTypeId,
                                  rates,
                                ),
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
                                        quantity: entry?.quantity ?? '1',
                                        priceMinor:
                                          entry?.priceMinor ??
                                          resolveDefaultSalePriceOrZero(
                                            raw?.salePrices,
                                            defaultPriceTypeId,
                                            rates,
                                          ),
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
                            // owner 2026-07-18: returning the id hands focus to the new
                            // row's «Кол-во» (modal → table entry chain).
                            return newId;
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
                                          priceMinor: resolveDefaultSalePriceOrZero(
                                            raw?.salePrices,
                                            defaultPriceTypeId,
                                            rates,
                                          ),
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
              entity="InvoiceOut"
              values={form.attributes}
              onChange={(next) => setForm((f) => f && { ...f, attributes: next })}
              disabled={!editable}
              testIdPrefix="invoice-out"
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
            priceMinor: resolveDefaultSalePriceOrZero(raw?.salePrices, defaultPriceTypeId, rates),
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
          applyProductToRow(productRowId, item);
        }}
      />

      {/* «Отправить» — email this invoice with the chosen print form pre-attached. */}
      <SendEmailDialog
        open={emailOpen}
        onClose={() => {
          setEmailOpen(false);
          setEmailAttachments([]);
        }}
        entity="InvoiceOut"
        entityId={data.id}
        defaultSubject={tEmail('subject_invoice', { name: data.name })}
        defaultBodyHtml={tEmail.raw('body_invoice')}
        initialAttachments={emailAttachments}
      />

      {/* «Печать ▸ Комплект…» — bundle several forms into one PDF for this invoice. */}
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
      {spiska && <ReceiptPrintPortal data={spiska} onClose={closeSheet} />}
      {creceipt && <CustomerReceiptPortal data={creceipt} onClose={() => setCreceipt(null)} />}
    </div>
  );
}
