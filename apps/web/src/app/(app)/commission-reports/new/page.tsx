'use client';

/**
 * /commission-reports/new — moysklad-parity «Выданный отчёт комиссионера» editor
 * (the «+ Отчёт комиссионера → Выданный» create form). We are the commissioner:
 * we sold the consigner's goods and report back the volume + our commission.
 *
 * Built on the shared document-editor framework (DocumentEditor + DocumentMetaPanel
 * + PositionTable + DocumentTotalsPanel), mirroring supplies/customer-orders/new.
 * Commission-specific bits vs a plain sales doc: the «Период» (reporting range),
 * the «Комиссия» mode, the per-line «Комиссия» column, and the «Комиссия» / «Сумма
 * комитента» footer rows.
 *
 * Phase-1: the model is header-only, so the server computes the document totals
 * from the posted positions and stores the header + sums as a draft. Position rows
 * + the «Период» / «Проект» / «Канал продаж» / «Комиссия»-mode persistence + the
 * «Полученный» (in) editor join the next focused session (no migration here).
 */

import {
  AttachmentsSection,
  type StagedFile,
  readFileAsBase64,
} from '@/components/attachments-section';
import { CurrencyRateModal } from '@/components/document-detail/currency-rate-modal';
import { PositionAgreementButton } from '@/components/documents/position-agreement-modal';
import { useDocumentEditorLabels } from '@/hooks/use-document-editor-labels';
import { useTotalsLabels } from '@/hooks/use-totals-labels';
import { useUserDefaults } from '@/hooks/use-user-defaults';
import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';
import { distributeAgreementDelta } from '@/lib/position-agreement';
import { computePositionTotal } from '@moysklad/money';
import {
  Button,
  CatalogPicker,
  CatalogPickerField,
  DatePicker,
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
  Modal,
  NativeSelect,
  type PickerItem,
  type PositionColumnKey,
  PositionInlineAdd,
  PositionTable,
  type PositionTableColumnConfig,
  Textarea,
  useConfirm,
} from '@moysklad/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
  salePriceMinor?: string | null;
  buyPriceMinor?: string | null;
  vat: number | null;
}

interface NewPositionRow extends DocPositionRow {
  assortmentId: string | null;
  // Both product price types kept on the row so «Цена ▾ → Расценить» can re-fill the
  // grid from either without re-fetching (moysklad parity).
  salePriceMinor?: string | null;
  buyPriceMinor?: string | null;
}

function uid(): string {
  return Math.random().toString(36).slice(2);
}

/**
 * Per-line totals — delegates to the SAME `computePositionTotal` the API posts
 * with (single-round, micro-tiyin), so the «Итого» footer agrees with the per-row
 * «Сумма» cells exactly (no FE↔BE rounding drift; a fractional «НДС» like 7.5 no
 * longer throws a BigInt RangeError mid-edit).
 */
function computeLineTotal(
  p: NewPositionRow,
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

export default function NewCommissionReportOutPage() {
  const router = useRouter();
  const { user } = useAuth();
  const t = useTranslations('pages.commission_reports');
  const totalsLabels = useTotalsLabels();
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tForm = useTranslations('form');
  const tDetailForm = useTranslations('detail_form');
  const tDetailTabs = useTranslations('detail_tabs');
  const tDetailHeader = useTranslations('detail_header');
  const tPos = useTranslations('position_editor');
  const locale = useLocale();
  const docEditorLabels = useDocumentEditorLabels();
  const { confirm } = useConfirm();

  // «⚙» column-config gear — moysklad's commission grid defaults (live-grounded
  // 2026-06-29): Изображение + Единица измерения ON; Вес / Объём / Сумма НДС OFF.
  const [optionalCols, setOptionalCols] = useState<Set<PositionColumnKey>>(
    () => new Set<PositionColumnKey>(['image', 'unit']),
  );
  const toggleOptionalCol = (key: PositionColumnKey, checked: boolean) =>
    setOptionalCols((s) => {
      const next = new Set(s);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  const gearColumns: { key: PositionColumnKey; label: string; checked: boolean }[] = [
    { key: 'image', label: tPos('col_image'), checked: optionalCols.has('image') },
    { key: 'unit', label: tPos('col_unit'), checked: optionalCols.has('unit') },
    { key: 'weight', label: tPos('col_weight'), checked: optionalCols.has('weight') },
    { key: 'volume', label: tPos('col_volume'), checked: optionalCols.has('volume') },
    { key: 'vatAmount', label: tPos('col_vat_amount'), checked: optionalCols.has('vatAmount') },
  ];

  // «Товары» columns — built here so «Кол-во» (NOT the «Кол-во б. ед.» default) + the
  // inline-add labels localise, and the «⚙» gear can show/hide optional columns.
  // moysklad order: [Изображение]·Наименование·Кол-во([Ед.изм inline])·Цена·НДС·
  // [Сумма НДС]·Сумма·Комиссия·[Вес]·[Объём].
  const positionColumns: PositionTableColumnConfig[] = [
    { key: 'dragarea' },
    { key: 'select' },
    // moysklad's grid numbers rows under a BLANK header (no «#» text) — blank the label.
    { key: 'index', label: '' },
    ...(optionalCols.has('image') ? [{ key: 'image' as const }] : []),
    { key: 'name' },
    { key: 'quantity', label: tPos('quantity') },
    ...(optionalCols.has('unit') ? [{ key: 'unit' as const }] : []),
    { key: 'price' },
    { key: 'vat' },
    ...(optionalCols.has('vatAmount') ? [{ key: 'vatAmount' as const }] : []),
    { key: 'amount' },
    { key: 'commission' },
    ...(optionalCols.has('weight') ? [{ key: 'weight' as const }] : []),
    ...(optionalCols.has('volume') ? [{ key: 'volume' as const }] : []),
    { key: 'menu' },
  ];

  const { data: orgsData } = useQuery<{ items: RefItem[] }>({
    queryKey: ['organizations'],
    queryFn: () => api.get('/organizations'),
  });

  // «Статус» — the account's own commission-report statuses (State rows,
  // entityType="commissionreportout"). moysklad shows a grey «Статус» pill until the
  // admin defines some via «Настроить...» → /settings/commission-report-statuses.
  // This is the account custom status, NOT the FSM `state` (draft/posted) — that is
  // the «Проведено» checkbox's job.
  const { data: statusData } = useQuery<{
    items: Array<{ id: string; name: string; color: string | null }>;
  }>({
    queryKey: ['states', 'commissionreportout'],
    queryFn: () => api.get('/states?entityType=commissionreportout&archived=false&limit=250'),
    staleTime: 60_000,
  });
  const statusOptions = (statusData?.items ?? []).map((s) => ({
    value: s.id,
    label: s.name,
    color: s.color ?? undefined,
  }));

  // Header
  const [docNumber, setDocNumber] = useState('');
  const [docDate, setDocDate] = useState(() => {
    const d = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  // «Статус» — selected account custom-status id ('' ⇒ the grey «Статус» pill).
  // «Проведено» defaults checked (moysklad parity — a new report posts on save).
  const [statusId, setStatusId] = useState<string>('');
  const [applicable, setApplicable] = useState(true);

  // «Период» — the reporting range. moysklad shows two date inputs. Phase-1 the
  // model has no period column → rendered for parity, not persisted.
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');

  // Meta refs
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [organizationLabel, setOrganizationLabel] = useState('');
  const [agentId, setAgentId] = useState<string | null>(null);
  const [agentLabel, setAgentLabel] = useState('');
  // moysklad marks a required-but-empty «Контрагент» RED on a failed «Сохранить».
  const [agentInvalid, setAgentInvalid] = useState(false);
  const [contractId, setContractId] = useState<string | null>(null);
  const [contractLabel, setContractLabel] = useState('');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectLabel, setProjectLabel] = useState('');
  const [salesChannelId, setSalesChannelId] = useState<string | null>(null);
  const [salesChannelLabel, setSalesChannelLabel] = useState('');
  // «Комиссия» mode. moysklad default = «Не рассчитывать» (manual per-line reward).
  const [commissionMode, setCommissionMode] = useState<'none' | 'percent'>('none');
  const [commissionPercent, setCommissionPercent] = useState('');
  const [currency, setCurrency] = useState('UZS');
  // «Курс валюты документа» override (the ✎ next to Валюта opens CurrencyRateModal,
  // mirroring supplies/customer-orders); null ⇒ use the account admin rate.
  const [rateOverride, setRateOverride] = useState<string | null>(null);
  const [rateModalOpen, setRateModalOpen] = useState(false);
  const [description, setDescription] = useState('');

  // VAT toggles. moysklad defaults BOTH «НДС» and «Цена включает НДС» ON for a new
  // commission report (grounded out-01-full + side-by-side).
  const [vatEnabled, setVatEnabled] = useState(true);
  const [vatIncluded, setVatIncluded] = useState(true);

  // Positions
  const [positions, setPositions] = useState<NewPositionRow[]>([]);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  // «Цена ▾ → Расценить» — pick which product price type re-fills the grid.
  const [repriceOpen, setRepriceOpen] = useState(false);
  const [savingPrices, setSavingPrices] = useState(false);
  // «Файлы» — staged before save (no doc id yet); uploaded once the report is created.
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);

  const [openPicker, setOpenPicker] = useState<
    | null
    | 'org'
    | 'agent'
    | 'contract'
    | 'project'
    | 'salesChannel'
    | { kind: 'product'; rowUid: string }
  >(null);
  const [error, setError] = useState<string | null>(null);

  const { data: currenciesData } = useQuery<{
    items: Array<{ id: string; isoCode: string; name: string; rate: string }>;
  }>({
    queryKey: ['currencies'],
    queryFn: () => api.get('/currencies'),
    staleTime: 60_000,
  });
  const currencies = currenciesData?.items ?? [];
  const adminRate = currencies.find((c) => c.isoCode === currency)?.rate;
  const effectiveRate = rateOverride ?? adminRate ?? '1';

  // Pre-fill «Организация» from the user defaults (moysklad applies them to every
  // new document); fall back to the first org.
  const userDefaults = useUserDefaults();
  const defaultsAppliedRef = useRef(false);
  useEffect(() => {
    if (defaultsAppliedRef.current) return;
    if (!orgsData) return;
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
    if (!projectId && us?.defaultProject) {
      setProjectId(us.defaultProject.id);
      setProjectLabel(us.defaultProject.name);
    }
  }, [orgsData, userDefaults.data, userDefaults.isLoading, organizationId, projectId]);

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
        vat: '12',
        vatEnabled: true,
        commissionMinor: '0',
      },
    ]);
  };
  const updatePosition = (id: string, patch: Partial<NewPositionRow>) => {
    setPositions((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };
  const removePosition = (id: string) => {
    setPositions((ps) => ps.filter((p) => p.id !== id));
    setSelectedRowIds((s) => {
      const next = new Set(s);
      next.delete(id);
      return next;
    });
  };

  // «Kelishuv» — spread the negotiated delta across the lines (owner 2026-07-17).
  const applyAgreement = useCallback(
    (deltaMinor: bigint) => {
      setPositions((ps) => {
        const patch = distributeAgreementDelta(ps, deltaMinor, vatIncluded);
        if (patch.size === 0) return ps;
        return ps.map((p) => {
          const next = patch.get(p.id);
          return next != null ? { ...p, priceMinor: next } : p;
        });
      });
    },
    [vatIncluded],
  );

  // «Цена ▾ → Расценить» — re-fill every line's «Цена» from the chosen product price
  // type (sale or buy), using the prices captured on the row at add-time. moysklad
  // opens a price-type picker; with our two price types we surface both.
  const applyReprice = (type: 'sale' | 'buy') => {
    setPositions((ps) =>
      ps.map((p) => {
        const price = type === 'sale' ? p.salePriceMinor : p.buyPriceMinor;
        return price != null && price !== '' ? { ...p, priceMinor: price } : p;
      }),
    );
    setRepriceOpen(false);
  };

  // «Комиссия ▾ → Пересчитать» — recompute every line's «Комиссия» from the document
  // «Комиссия» mode. Only «Процент» yields a calculable reward (line gross × %);
  // «Не рассчитывать» (manual) leaves the entered values untouched (moysklad parity).
  const recalcCommission = () => {
    if (commissionMode !== 'percent' || !commissionPercent) return;
    const pct = Number(commissionPercent);
    if (!Number.isFinite(pct) || pct <= 0) return;
    const pctScaled = BigInt(Math.round(pct * 100)); // 2-dp percent
    setPositions((ps) =>
      ps.map((p) => {
        const { gross } = computeLineTotal(p, vatIncluded);
        return { ...p, commissionMinor: ((gross * pctScaled) / 10000n).toString() };
      }),
    );
  };

  // «Цена ▾ → Сохранить цены» — write the grid's line prices back to the products'
  // DEFAULT sale price type (moysklad parity). Server resolves the default PriceType +
  // merges each product's salePrices. Guarded by a confirm (it mutates the catalogue).
  const savePricesToProducts = async () => {
    if (savingPrices) return;
    const items = positions
      .filter((p) => p.assortmentId && p.priceMinor)
      .map((p) => ({ productId: p.assortmentId as string, priceMinor: p.priceMinor }));
    if (items.length === 0) return;
    const ok = await confirm({
      title: tPos('save_prices_confirm', { count: items.length }),
      confirmLabel: tPos('save_prices'),
    });
    if (!ok) return;
    setSavingPrices(true);
    try {
      await api.post('/products/save-line-prices', { items });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingPrices(false);
    }
  };

  // Document totals. «Сумма» (gross) and «НДС» mirror the position grid; «Комиссия»
  // = Σ per-line reward; «Сумма комитента» = Сумма − Комиссия (owed to consigner).
  const totals = useMemo(() => {
    let net = 0n;
    let vat = 0n;
    let gross = 0n;
    let reward = 0n;
    for (const p of positions) {
      const t = computeLineTotal(p, vatIncluded);
      net += t.net;
      vat += t.vat;
      gross += t.gross;
      reward += BigInt(p.commissionMinor || '0');
    }
    if (reward > gross) reward = gross;
    return { net, vat, gross, reward, commitent: gross - reward };
  }, [positions, vatIncluded]);

  const createMut = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error(tForm('select_organization'));
      if (!agentId) throw new Error(tForm('select_counterparty'));
      // Owner 2026-07-08: «Проведено» has NO position precondition — an empty document may be saved/posted (BE allows it: 0 positions ⇒ 0 stock delta).
      for (const [i, p] of positions.entries()) {
        if (!p.assortmentId) throw new Error(tForm('position_select_product', { n: i + 1 }));
        if (Number(p.quantity) <= 0)
          throw new Error(tForm('position_quantity_positive', { n: i + 1 }));
      }
      const payload = {
        organizationId,
        agentId,
        ...(contractId ? { contractId } : {}),
        ...(statusId ? { statusId } : {}),
        applicable,
        currency,
        rateValue:
          currency === 'UZS'
            ? '100000000'
            : BigInt(Math.round(Number(effectiveRate) * 100000000)).toString(),
        vatEnabled,
        vatIncluded,
        description: description || undefined,
        moment: docDate ? new Date(docDate).toISOString() : undefined,
        positions: positions.map((p) => ({
          // biome-ignore lint/style/noNonNullAssertion: validated non-null in the loop above
          assortmentId: p.assortmentId!,
          quantity: p.quantity,
          priceMinor: p.priceMinor,
          discount: p.discount || '0',
          vat: p.vat ? Number(p.vat) : null,
          vatEnabled: p.vatEnabled,
          commissionMinor: p.commissionMinor || '0',
        })),
      };
      return api.post<{ id: string }>('/commission-reports', payload);
    },
    onSuccess: async (created) => {
      // «Файлы» staged before save → upload now that the report exists.
      if (stagedFiles.length > 0) {
        await Promise.allSettled(
          stagedFiles.map(async (s) =>
            api.post('/attachments', {
              entity: 'CommissionReportOut',
              entityId: created.id,
              filename: s.file.name,
              mime: s.file.type || 'application/octet-stream',
              dataBase64: await readFileAsBase64(s.file),
            }),
          ),
        );
      }
      router.push('/commission-reports');
    },
    onError: (err: Error) => setError(err.message),
  });

  // Fetchers
  const orgFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: RefItem[] }>(`/organizations?search=${encodeURIComponent(s)}`);
    return d.items.map((o) => ({
      id: o.id,
      primary: o.name,
      secondary: o.legalTitle ?? undefined,
    }));
  };
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
  const contractFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: RefItem[] }>(
      `/contracts?search=${encodeURIComponent(s)}&limit=50`,
    );
    return d.items.map((c) => ({ id: c.id, primary: c.name }));
  };
  const projectFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: RefItem[] }>(
      `/projects?search=${encodeURIComponent(s)}&limit=50`,
    );
    return d.items.map((p) => ({ id: p.id, primary: p.name }));
  };
  const salesChannelFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: RefItem[] }>(
      `/sales-channels?search=${encodeURIComponent(s)}&limit=50`,
    );
    return d.items.map((c) => ({ id: c.id, primary: c.name }));
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

  const renderPositionNameCell = (row: DocPositionRow) => {
    const p = row as NewPositionRow;
    return (
      <button
        type="button"
        onClick={() => setOpenPicker({ kind: 'product', rowUid: row.id })}
        className="w-full truncate text-left text-[var(--ms-text-brand)] hover:underline"
        data-test-id={`pos-${row.id}-name`}
      >
        {p.productLabel || tForm('select_product_placeholder')}
      </button>
    );
  };

  const tabs = [
    {
      key: 'main',
      label: tDetailTabs('main'),
      content: (
        <div className="space-y-4">
          {/* Owner 2026-07-23: «Договорная цена» — blue, at the table's OUTER
              top-right corner (same spot in every section). */}
          <div className="-mb-2.5 flex justify-end">
            <PositionAgreementButton
              totalMinor={totals.gross}
              currency={currency}
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
          <PositionTable
            columns={positionColumns}
            rows={positions}
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
            onReplace={(id) => setOpenPicker({ kind: 'product', rowUid: id })}
            vatIncluded={vatIncluded}
            selectedIds={selectedRowIds}
            onSelectionChange={setSelectedRowIds}
            emptyText=""
            onSortPositions={(by) =>
              setPositions((ps) =>
                [...ps].sort((a, b) =>
                  (by === 'name' ? (a.productLabel ?? '') : (a.productCode ?? '')).localeCompare(
                    by === 'name' ? (b.productLabel ?? '') : (b.productCode ?? ''),
                    'ru',
                  ),
                ),
              )
            }
            sortByNameLabel={tPos('sort_by_name')}
            sortByCodeLabel={tPos('sort_by_code')}
            columnConfig={gearColumns}
            onColumnToggle={toggleOptionalCol}
            columnConfigLabel={tPos('column_config')}
            onPriceAction={(action) =>
              action === 'reprice' ? setRepriceOpen(true) : savePricesToProducts()
            }
            repriceLabel={tPos('reprice')}
            savePricesLabel={tPos('save_prices')}
            onCommissionRecalc={recalcCommission}
            commissionRecalcLabel={tPos('recalc_commission')}
            footerToolbar={
              <PositionInlineAdd
                placeholder={tPos('addPositionPlaceholder')}
                addFromCatalogLabel={tPos('addFromCatalog')}
                onSearch={async (q) => {
                  const r = await api.get<{ items: ProductItem[] }>(
                    `/products?search=${encodeURIComponent(q)}&limit=20`,
                  );
                  return r.items.map((p) => ({
                    id: p.id,
                    primary: p.name,
                    secondary: p.code ?? undefined,
                    // Pick modal (owner 2026-07-18): reference «Цена» = the same
                    // default the row would get (sale price, falling back to buy).
                    priceMinor: p.salePriceMinor ?? p.buyPriceMinor ?? '0',
                    uomLabel: p.uom ?? undefined,
                    raw: p,
                  }));
                }}
                // owner 2026-07-18: qty/price modal on EVERY product-add search
                // (was sales-only). No price-scope checkboxes here — a commission
                // report is not a plain sales doc.
                pickModal={{
                  currency,
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
                  setPositions((ps) => [
                    ...ps,
                    {
                      id: newId,
                      assortmentId: item.id,
                      productLabel: item.primary,
                      productUom: raw?.uom ?? null,
                      quantity: entry?.quantity ?? '1',
                      priceMinor:
                        entry?.priceMinor ?? raw?.salePriceMinor ?? raw?.buyPriceMinor ?? '0',
                      salePriceMinor: raw?.salePriceMinor ?? null,
                      buyPriceMinor: raw?.buyPriceMinor ?? null,
                      discount: '0',
                      vat: raw?.vat != null ? String(raw.vat) : '12',
                      vatEnabled: true,
                      commissionMinor: '0',
                    },
                  ]);
                  // owner 2026-07-18: returning the id hands focus to the new
                  // row's «Кол-во» (modal → table entry chain).
                  return newId;
                }}
                onAddFromCatalog={addPosition}
              />
            }
          />

          {/* moysklad parity: «Комментарий» is a FIXED-width box on the left (~515px)
              with the totals block sitting immediately to its right — NOT a full-width
              comment + a far-right totals rail. */}
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-12">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={tFields('description')}
              rows={5}
              className="lg:w-[515px] lg:shrink-0"
              data-test-id="field-description"
            />
            <DocumentTotalsPanel
              labels={totalsLabels}
              subtotalMinor={totals.net}
              vatMinor={totals.vat}
              totalMinor={totals.gross}
              commissionMinor={totals.reward}
              commitentMinor={totals.commitent}
              currency={currency}
              vatEnabled={vatEnabled}
              onVatEnabledChange={setVatEnabled}
              vatIncluded={vatIncluded}
              onVatIncludedChange={setVatIncluded}
            />
          </div>

          {/* moysklad keeps «Задачи» / «Файлы» EXPANDED on a new document. «Задачи»
              shows «Нет задач» (tasks attach after save). «Файлы» is the full staged
              file table (Наименование·Размер, МБ·Дата добавления·Сотрудник + «⊕ Файл»)
              — files are held locally and uploaded once the report is created. */}
          <DocumentDisclosurePanel
            title={tForm('tasks_section')}
            headerAction={
              <Button type="button" variant="secondary" disabled>
                <Icons.create className="h-4 w-4" />
                {tForm('add_task')}
              </Button>
            }
            defaultOpen
          >
            <p className="text-[var(--ms-text-muted)] text-sm">{tDetailTabs('no_tasks')}</p>
          </DocumentDisclosurePanel>

          <DocumentDisclosurePanel title={tForm('files_section')} defaultOpen>
            <AttachmentsSection
              entity="CommissionReportOut"
              entityId=""
              hideTitle
              staged={{
                files: stagedFiles,
                onAdd: (files) =>
                  setStagedFiles((prev) => [
                    ...prev,
                    ...files.map((file) => ({
                      key: crypto.randomUUID(),
                      file,
                      addedAt: new Date().toISOString(),
                      previewUrl: URL.createObjectURL(file),
                    })),
                  ]),
                onRemove: (key) =>
                  setStagedFiles((prev) => {
                    const gone = prev.find((s) => s.key === key);
                    if (gone?.previewUrl) URL.revokeObjectURL(gone.previewUrl);
                    return prev.filter((s) => s.key !== key);
                  }),
              }}
            />
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
        testId="commission-report-new-page"
        documentTypeLabel={t('type_out')}
        number={docNumber}
        onNumberChange={setDocNumber}
        date={docDate}
        onDateChange={setDocDate}
        status={statusId}
        statusOptions={statusOptions}
        onStatusChange={setStatusId}
        onConfigureStatuses={() => router.push('/settings/commission-report-statuses')}
        configureStatusesLabel={tForm('configure_statuses')}
        applicable={applicable}
        onApplicableChange={setApplicable}
        applicableHelp={t('applicable_help')}
        onSave={() => {
          // moysklad-style validation (owner 2026-07-11): mark the missing
          // FIELD red + short text under it, echo the same short message
          // under the toolbar — never a page-wide banner.
          if (!agentId) {
            setAgentInvalid(true);
            setError(tCommon('must_fill'));
            return;
          }
          setError(null);
          createMut.mutate();
        }}
        saving={createMut.isPending}
        onClose={() => router.push('/commission-reports')}
        modifyMenu={[]}
        createDocMenu={[]}
        printMenu={[]}
        sendMenu={[]}
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
        {/* moysklad parity: the meta is a COMPACT two-column block (~705px), NOT
            stretched across the viewport — cap the panel so the 1fr field columns stay
            tight (left col x≈125, right col x≈500) instead of spreading edge-to-edge. */}
        <DocumentMetaPanel className="max-w-[745px]" compact>
          <DocumentMetaRow fixedWidth>
            <DocumentMetaField
              label={tFields('organization')}
              required
              startRow
              subRow={
                <NativeSelect
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  data-test-id="field-org-account"
                  aria-label={tFields('organization_account')}
                >
                  {currencies.length === 0 && <option value={currency}>{currency}</option>}
                  {currencies.map((c) => (
                    <option key={c.id} value={c.isoCode}>
                      {c.name}
                    </option>
                  ))}
                </NativeSelect>
              }
            >
              <CatalogPickerField
                value={organizationId ? { id: organizationId, label: organizationLabel } : null}
                placeholder={tForm('select_organization')}
                onPick={() => setOpenPicker('org')}
                inlineFetcher={orgFetcher}
                onInlineSelect={(item) => {
                  setOrganizationId(item.id);
                  setOrganizationLabel(String(item.primary));
                }}
                onEdit={
                  organizationId
                    ? () => window.open(`/organizations/${organizationId}`, '_blank', 'noopener')
                    : undefined
                }
                editLabel={tCommon('edit')}
                onClear={() => {
                  setOrganizationId(null);
                  setOrganizationLabel('');
                }}
              />
            </DocumentMetaField>
            <DocumentMetaField label={t('flt_period')} required>
              <div className="flex items-center gap-2">
                <DatePicker
                  value={periodFrom || null}
                  onChange={(v) => setPeriodFrom(v ?? '')}
                  locale={locale}
                  testId="field-period-from"
                  ariaLabel={`${t('flt_period')} — ${tCommon('from')}`}
                />
                <DatePicker
                  value={periodTo || null}
                  onChange={(v) => setPeriodTo(v ?? '')}
                  locale={locale}
                  testId="field-period-to"
                  ariaLabel={`${t('flt_period')} — ${tCommon('to')}`}
                />
              </div>
            </DocumentMetaField>
          </DocumentMetaRow>

          <DocumentMetaRow fixedWidth>
            <DocumentMetaField
              label={tFields('agent')}
              required
              startRow
              error={agentInvalid ? tCommon('must_fill') : undefined}
            >
              <CatalogPickerField
                value={agentId ? { id: agentId, label: agentLabel } : null}
                placeholder={tForm('select_counterparty')}
                invalid={agentInvalid}
                onPick={() => setOpenPicker('agent')}
                inlineFetcher={agentFetcher}
                onInlineSelect={(item) => {
                  setAgentId(item.id);
                  setAgentLabel(String(item.primary));
                  // Picking an agent resolves the moysklad-style field error.
                  setAgentInvalid(false);
                  setError(null);
                }}
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
            <DocumentMetaField label={tFields('contract')} required>
              <CatalogPickerField
                value={contractId ? { id: contractId, label: contractLabel } : null}
                placeholder={
                  agentId ? tForm('select_contract') : tForm('select_counterparty_first')
                }
                onPick={() => agentId && setOpenPicker('contract')}
                inlineFetcher={contractFetcher}
                onInlineSelect={(item) => {
                  setContractId(item.id);
                  setContractLabel(String(item.primary));
                }}
                onClear={() => {
                  setContractId(null);
                  setContractLabel('');
                }}
                disabled={!agentId}
              />
            </DocumentMetaField>
          </DocumentMetaRow>

          <DocumentMetaRow fixedWidth>
            <DocumentMetaField label={tFields('project')} startRow>
              <CatalogPickerField
                value={projectId ? { id: projectId, label: projectLabel } : null}
                placeholder={tForm('select_project')}
                onPick={() => setOpenPicker('project')}
                inlineFetcher={projectFetcher}
                onInlineSelect={(item) => {
                  setProjectId(item.id);
                  setProjectLabel(String(item.primary));
                }}
                onClear={() => {
                  setProjectId(null);
                  setProjectLabel('');
                }}
                onCreate={() => router.push('/settings/projects')}
                createLabel={tForm('create_new')}
              />
            </DocumentMetaField>
            <DocumentMetaField label={t('commission_field')}>
              <NativeSelect
                value={commissionMode}
                onChange={(e) => setCommissionMode(e.target.value as 'none' | 'percent')}
                data-test-id="field-commission-mode"
              >
                <option value="none">{t('commission_mode_none')}</option>
                <option value="percent">{t('commission_mode_percent')}</option>
              </NativeSelect>
              {commissionMode === 'percent' && (
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  inputMode="decimal"
                  value={commissionPercent}
                  placeholder="%"
                  onChange={(e) => setCommissionPercent(e.target.value)}
                  className="mt-1.5"
                  data-test-id="field-commission-percent"
                />
              )}
            </DocumentMetaField>
          </DocumentMetaRow>

          <DocumentMetaRow fixedWidth>
            <DocumentMetaField label={t('flt_sales_channel')} startRow>
              <CatalogPickerField
                value={salesChannelId ? { id: salesChannelId, label: salesChannelLabel } : null}
                placeholder={tForm('select_sales_channel')}
                onPick={() => setOpenPicker('salesChannel')}
                inlineFetcher={salesChannelFetcher}
                onInlineSelect={(item) => {
                  setSalesChannelId(item.id);
                  setSalesChannelLabel(String(item.primary));
                }}
                onClear={() => {
                  setSalesChannelId(null);
                  setSalesChannelLabel('');
                }}
                onCreate={() => router.push('/ecommerce/channels/new')}
                createLabel={tForm('create_new')}
              />
            </DocumentMetaField>
          </DocumentMetaRow>

          <DocumentMetaRow fixedWidth>
            <DocumentMetaField
              label={tDetailForm('currency')}
              required
              startRow
              helper={
                currency !== 'UZS' ? (
                  <span className="tabular-nums">
                    1 {currency} ={' '}
                    {Number(effectiveRate).toLocaleString('ru-RU', { maximumFractionDigits: 4 })}{' '}
                    UZS
                  </span>
                ) : undefined
              }
            >
              <div className="flex items-center gap-1.5">
                <NativeSelect
                  value={currency}
                  onChange={(e) => {
                    setCurrency(e.target.value);
                    setRateOverride(null);
                  }}
                  data-test-id="field-currency"
                >
                  {currencies.length === 0 && <option value={currency}>{currency}</option>}
                  {currencies.map((c) => (
                    <option key={c.id} value={c.isoCode}>
                      {c.name} ({c.isoCode})
                    </option>
                  ))}
                </NativeSelect>
                {/* «Курс» — moysklad's ✎ right of «Валюта документа» opens the rate
                    editor (only meaningful for a non-base currency). */}
                <button
                  type="button"
                  onClick={() => currency !== 'UZS' && setRateModalOpen(true)}
                  disabled={currency === 'UZS'}
                  className="text-[var(--ms-text-brand)] hover:underline disabled:cursor-default disabled:text-[var(--ms-text-disabled)]"
                  aria-label={tForm('rate_edit')}
                  data-test-id="currency-rate-edit"
                >
                  ✎
                </button>
              </div>
            </DocumentMetaField>
          </DocumentMetaRow>
        </DocumentMetaPanel>

        <DocumentTabs tabs={tabs} defaultActiveKey="main" />
      </DocumentEditor>

      <CatalogPicker
        open={openPicker === 'org'}
        onClose={() => setOpenPicker(null)}
        title={tForm('organization_picker_title')}
        fetcher={orgFetcher}
        onSelect={(item) => {
          setOrganizationId(item.id);
          setOrganizationLabel(String(item.primary));
        }}
      />
      <CatalogPicker
        open={openPicker === 'agent'}
        onClose={() => setOpenPicker(null)}
        title={tForm('counterparty_picker_title')}
        fetcher={agentFetcher}
        onSelect={(item) => {
          setAgentId(item.id);
          setAgentLabel(String(item.primary));
          // Picking an agent resolves the moysklad-style field error.
          setAgentInvalid(false);
          setError(null);
        }}
        createLabel={tForm('create_new_counterparty')}
        onCreate={() => router.push('/counterparties/new')}
      />
      <CatalogPicker
        open={openPicker === 'contract'}
        onClose={() => setOpenPicker(null)}
        title={tForm('contract_picker_title')}
        fetcher={contractFetcher}
        onSelect={(item) => {
          setContractId(item.id);
          setContractLabel(String(item.primary));
        }}
      />
      <CatalogPicker
        open={openPicker === 'project'}
        onClose={() => setOpenPicker(null)}
        title={tForm('project_picker_title')}
        fetcher={projectFetcher}
        onSelect={(item) => {
          setProjectId(item.id);
          setProjectLabel(String(item.primary));
        }}
      />
      <CatalogPicker
        open={openPicker === 'salesChannel'}
        onClose={() => setOpenPicker(null)}
        title={tForm('sales_channel_picker_title')}
        fetcher={salesChannelFetcher}
        onSelect={(item) => {
          setSalesChannelId(item.id);
          setSalesChannelLabel(String(item.primary));
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
          updatePosition(openPicker.rowUid, {
            assortmentId: item.id,
            productLabel: String(item.primary),
            productUom: raw?.uom ?? null,
            priceMinor: raw?.salePriceMinor ?? raw?.buyPriceMinor ?? '0',
            salePriceMinor: raw?.salePriceMinor ?? null,
            buyPriceMinor: raw?.buyPriceMinor ?? null,
            vat: raw?.vat != null ? String(raw.vat) : '12',
          });
        }}
      />
      {currency !== 'UZS' && (
        <CurrencyRateModal
          open={rateModalOpen}
          onOpenChange={setRateModalOpen}
          currency={currency}
          referenceRate={adminRate ?? '1'}
          currentOverride={rateOverride}
          onApply={setRateOverride}
        />
      )}

      {/* «Цена ▾ → Расценить» — pick the product price type to re-fill the grid. */}
      <Modal
        open={repriceOpen}
        onOpenChange={setRepriceOpen}
        title={tPos('reprice_title')}
        widthClass="w-[360px]"
        testId="commission-reprice-modal"
      >
        <div className="flex flex-col gap-2">
          <Button
            variant="secondary"
            onClick={() => applyReprice('sale')}
            data-test-id="reprice-sale"
          >
            {tPos('price_type_sale')}
          </Button>
          <Button
            variant="secondary"
            onClick={() => applyReprice('buy')}
            data-test-id="reprice-buy"
          >
            {tPos('price_type_buy')}
          </Button>
        </div>
      </Modal>
    </>
  );
}
