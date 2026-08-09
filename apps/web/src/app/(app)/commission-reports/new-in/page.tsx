'use client';

/**
 * /commission-reports/new-in — moysklad-parity «Полученный отчёт комиссионера» editor
 * (the «+ Отчёт комиссионера → Полученный» create form). We are the CONSIGNER: someone
 * else (the commissioner) sold OUR goods and reports back the volume + our commission.
 *
 * Distinct from the «Выданный» (out) editor (commission-reports/new): the meta labels
 * are «Организация-продавец» / «Контрагент-комиссионер»; it adds «Входящий номер» + its
 * date and «Прочие услуги»; the position area has TWO grids («Реализовано комиссионером»
 * + «Возврат на склад комиссионера») with an «Остаток у комиссионера» column; and the
 * totals are a bespoke two-section block («Выручка от реализации» + «Комиссия») instead
 * of the shared DocumentTotalsPanel. Live-grounded #commissionreportin/edit?new.
 *
 * Phase-1: header-only model — the server computes totals from the «Реализовано»
 * positions and stores the header + sums as a draft (rows + the return grid are not
 * persisted yet; they render for parity + drive the live totals).
 */

import {
  AttachmentsSection,
  type StagedFile,
  readFileAsBase64,
} from '@/components/attachments-section';
import { CurrencyRateModal } from '@/components/document-detail/currency-rate-modal';
import { PositionAgreementButton } from '@/components/documents/position-agreement-modal';
import { useDocumentEditorLabels } from '@/hooks/use-document-editor-labels';
import { useUserDefaults } from '@/hooks/use-user-defaults';
import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';
import { computeLineTotalSafe } from '@/lib/doc-totals';
import { distributeAgreementDelta } from '@/lib/position-agreement';
import {
  Button,
  CatalogPicker,
  CatalogPickerField,
  Checkbox,
  DatePicker,
  type DocPositionRow,
  DocumentDisclosurePanel,
  DocumentEditor,
  DocumentMetaField,
  DocumentMetaPanel,
  DocumentMetaRow,
  DocumentTabs,
  Icons,
  Input,
  Modal,
  MoneyInput,
  NativeSelect,
  type PickerItem,
  type PositionColumnKey,
  PositionInlineAdd,
  PositionTable,
  type PositionTableColumnConfig,
  Textarea,
  formatMoney,
  useConfirm,
} from '@moysklad/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
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
  salePriceMinor?: string | null;
  buyPriceMinor?: string | null;
  vat: number | null;
}

interface NewPositionRow extends DocPositionRow {
  assortmentId: string | null;
  salePriceMinor?: string | null;
  buyPriceMinor?: string | null;
}

function uid(): string {
  return Math.random().toString(36).slice(2);
}

/** Sum a position set into {gross, vat, reward, qty} for the totals sections. */
function sumSet(rows: NewPositionRow[], vatIncluded: boolean) {
  let gross = 0n;
  let vat = 0n;
  let reward = 0n;
  let qty = 0;
  for (const p of rows) {
    const t = computeLineTotalSafe(p, vatIncluded);
    gross += t.gross;
    vat += t.vat;
    reward += BigInt(p.commissionMinor || '0');
    qty += Number(p.quantity || '0');
  }
  if (reward > gross) reward = gross;
  return { gross, vat, reward, qty };
}

export default function NewCommissionReportInPage() {
  const router = useRouter();
  const { user } = useAuth();
  const t = useTranslations('pages.commission_reports');
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

  // «⚙» column-config gear — moysklad's commission grid defaults.
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

  // «Товары» columns — moysklad IN order adds «Остаток у комиссионера» (read-only
  // stock) between «Кол-во» and «Цена».
  const positionColumns: PositionTableColumnConfig[] = [
    { key: 'dragarea' },
    { key: 'select' },
    { key: 'index', label: '' },
    ...(optionalCols.has('image') ? [{ key: 'image' as const }] : []),
    { key: 'name' },
    { key: 'quantity', label: tPos('quantity') },
    ...(optionalCols.has('unit') ? [{ key: 'unit' as const }] : []),
    { key: 'stock', label: t('stock_at_commissioner'), width: '150px' },
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

  // «Статус» — the account's own IN commission-report statuses.
  const { data: statusData } = useQuery<{
    items: Array<{ id: string; name: string; color: string | null }>;
  }>({
    queryKey: ['states', 'commissionreportin'],
    queryFn: () => api.get('/states?entityType=commissionreportin&archived=false&limit=250'),
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
  const [statusId, setStatusId] = useState<string>('');
  const [applicable, setApplicable] = useState(true);

  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');

  // Meta refs — organizationId = «Организация-продавец», agentId = «Контрагент-комиссионер».
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [organizationLabel, setOrganizationLabel] = useState('');
  const [agentId, setAgentId] = useState<string | null>(null);
  const [agentLabel, setAgentLabel] = useState('');
  const [contractId, setContractId] = useState<string | null>(null);
  const [contractLabel, setContractLabel] = useState('');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectLabel, setProjectLabel] = useState('');
  const [salesChannelId, setSalesChannelId] = useState<string | null>(null);
  const [salesChannelLabel, setSalesChannelLabel] = useState('');
  const [commissionMode, setCommissionMode] = useState<'none' | 'percent'>('none');
  const [commissionPercent, setCommissionPercent] = useState('');
  // IN-only header fields.
  const [incomingNumber, setIncomingNumber] = useState('');
  const [incomingDate, setIncomingDate] = useState('');
  const [otherServices, setOtherServices] = useState('0'); // «Прочие услуги» (minor)
  const [currency, setCurrency] = useState('UZS');
  const [rateOverride, setRateOverride] = useState<string | null>(null);
  const [rateModalOpen, setRateModalOpen] = useState(false);
  const [description, setDescription] = useState('');

  const [vatEnabled, setVatEnabled] = useState(true);
  const [vatIncluded, setVatIncluded] = useState(true);

  // Two position sets: «Реализовано комиссионером» + «Возврат на склад комиссионера».
  const [positions, setPositions] = useState<NewPositionRow[]>([]);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [returnPositions, setReturnPositions] = useState<NewPositionRow[]>([]);
  const [returnSelectedIds, setReturnSelectedIds] = useState<Set<string>>(new Set());
  // «Цена ▾ → Расценить» modal — targets the currently-active grid.
  const [repriceTarget, setRepriceTarget] = useState<null | 'realized' | 'returned'>(null);
  const [savingPrices, setSavingPrices] = useState(false);
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);

  const [openPicker, setOpenPicker] = useState<
    | null
    | 'org'
    | 'agent'
    | 'contract'
    | 'project'
    | 'salesChannel'
    | { kind: 'product'; grid: 'realized' | 'returned'; rowUid: string }
  >(null);
  const [error, setError] = useState<string | null>(null);
  // moysklad marks a required-but-empty «Контрагент» RED on a failed save.
  const [agentInvalid, setAgentInvalid] = useState(false);

  const { data: currenciesData } = useQuery<{
    items: Array<{ id: string; isoCode: string; name: string; rate: string }>;
  }>({
    queryKey: ['currencies'],
    queryFn: () => api.get('/currencies'),
    staleTime: 60_000,
  });
  const currencies = currenciesData?.items ?? [];
  const adminRate = currencies.find((c) => c.isoCode === currency)?.rate;
  // moysklad shows the currency NAME («сум») next to money fields, not the ISO code.
  const currencyName = currencies.find((c) => c.isoCode === currency)?.name ?? currency;
  const effectiveRate = rateOverride ?? adminRate ?? '1';

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

  // ---- shared grid handlers (parameterised by which set) --------------------
  const makeSetter =
    (grid: 'realized' | 'returned') => (updater: (ps: NewPositionRow[]) => NewPositionRow[]) =>
      grid === 'realized' ? setPositions(updater) : setReturnPositions(updater);
  const emptyRow = (): NewPositionRow => ({
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
  });
  const applyReprice = (type: 'sale' | 'buy') => {
    const grid = repriceTarget;
    if (!grid) return;
    makeSetter(grid)((ps) =>
      ps.map((p) => {
        const price = type === 'sale' ? p.salePriceMinor : p.buyPriceMinor;
        return price != null && price !== '' ? { ...p, priceMinor: price } : p;
      }),
    );
    setRepriceTarget(null);
  };
  // «Договорная цена» — spread the negotiated delta across the REALIZED lines only.
  const applyAgreement = (deltaMinor: bigint) => {
    setPositions((ps) => {
      const patch = distributeAgreementDelta(ps, deltaMinor, vatIncluded);
      if (patch.size === 0) return ps;
      return ps.map((p) => {
        const next = patch.get(p.id);
        return next != null ? { ...p, priceMinor: next } : p;
      });
    });
  };
  const recalcCommission = (grid: 'realized' | 'returned') => {
    if (commissionMode !== 'percent' || !commissionPercent) return;
    const pct = Number(commissionPercent);
    if (!Number.isFinite(pct) || pct <= 0) return;
    const pctScaled = BigInt(Math.round(pct * 100));
    makeSetter(grid)((ps) =>
      ps.map((p) => {
        const { gross } = computeLineTotalSafe(p, vatIncluded);
        return { ...p, commissionMinor: ((gross * pctScaled) / 10000n).toString() };
      }),
    );
  };
  const savePricesToProducts = async (rows: NewPositionRow[]) => {
    if (savingPrices) return;
    const items = rows
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

  // ---- totals ---------------------------------------------------------------
  const realized = useMemo(() => sumSet(positions, vatIncluded), [positions, vatIncluded]);
  const returned = useMemo(
    () => sumSet(returnPositions, vatIncluded),
    [returnPositions, vatIncluded],
  );
  const otherServicesMinor = useMemo(() => {
    try {
      return BigInt(otherServices || '0');
    } catch {
      return 0n;
    }
  }, [otherServices]);
  // «Выручка от реализации» = Реализовано − Возврат; «Комиссия» = reward + Прочие услуги
  // − возврат комиссии.
  const revenue = realized.gross - returned.gross;
  const commissionTotal = realized.reward + otherServicesMinor - returned.reward;
  const fmt = (v: bigint) => formatMoney(v, currency, { displayAs: 'none' });

  const createMut = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error(tForm('select_organization'));
      if (!agentId) throw new Error(tForm('select_counterparty'));
      if (positions.length === 0) throw new Error(tForm('add_at_least_one_position'));
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
        ...(incomingNumber ? { incomingNumber } : {}),
        ...(incomingDate ? { incomingDate } : {}),
        otherServicesMinor: otherServices || '0',
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
      return api.post<{ id: string }>('/commission-reports-in', payload);
    },
    onSuccess: async (created) => {
      if (stagedFiles.length > 0) {
        await Promise.allSettled(
          stagedFiles.map(async (s) =>
            api.post('/attachments', {
              entity: 'CommissionReportIn',
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

  // ---- fetchers -------------------------------------------------------------
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

  // ---- a full PositionTable for one grid ------------------------------------
  const renderGrid = (
    grid: 'realized' | 'returned',
    rows: NewPositionRow[],
    selected: Set<string>,
    setSelected: (s: Set<string>) => void,
  ) => {
    const set = makeSetter(grid);
    const renderName = (row: DocPositionRow) => {
      const p = row as NewPositionRow;
      return (
        <button
          type="button"
          onClick={() => setOpenPicker({ kind: 'product', grid, rowUid: row.id })}
          className="w-full truncate text-left text-[var(--ms-text-brand)] hover:underline"
          data-test-id={`pos-${row.id}-name`}
        >
          {p.productLabel || tForm('select_product_placeholder')}
        </button>
      );
    };
    return (
      <PositionTable
        columns={positionColumns}
        rows={rows}
        onUpdate={(id, patch) =>
          set((ps) =>
            ps.map((p) => (p.id === id ? { ...p, ...(patch as Partial<NewPositionRow>) } : p)),
          )
        }
        onRemove={(id) => {
          set((ps) => ps.filter((p) => p.id !== id));
          const next = new Set(selected);
          next.delete(id);
          setSelected(next);
        }}
        onDuplicate={(id) => {
          const source = rows.find((p) => p.id === id);
          if (source) set((ps) => [...ps, { ...source, id: uid() }]);
        }}
        onReorder={(from, to) =>
          set((ps) => {
            const next = ps.slice();
            const [moved] = next.splice(from, 1);
            if (moved) next.splice(to, 0, moved);
            return next;
          })
        }
        renderNameCell={renderName}
        onReplace={(id) => setOpenPicker({ kind: 'product', grid, rowUid: id })}
        vatIncluded={vatIncluded}
        selectedIds={selected}
        onSelectionChange={setSelected}
        emptyText=""
        onSortPositions={(by) =>
          set((ps) =>
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
          action === 'reprice' ? setRepriceTarget(grid) : savePricesToProducts(rows)
        }
        repriceLabel={tPos('reprice')}
        savePricesLabel={tPos('save_prices')}
        onCommissionRecalc={() => recalcCommission(grid)}
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
                // default the row would get.
                priceMinor: p.salePriceMinor ?? p.buyPriceMinor ?? '0',
                uomLabel: p.uom ?? undefined,
                raw: p,
              }));
            }}
            // owner 2026-07-18: qty/price modal on EVERY product-add search
            // (was sales-only). No price-scope checkboxes here — writing a
            // permanent SALE price from a purchase price would be wrong.
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
              set((ps) => [
                ...ps,
                {
                  id: newId,
                  assortmentId: item.id,
                  productLabel: item.primary,
                  productUom: raw?.uom ?? null,
                  quantity: entry?.quantity ?? '1',
                  priceMinor: entry?.priceMinor ?? raw?.salePriceMinor ?? raw?.buyPriceMinor ?? '0',
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
            onAddFromCatalog={() => set((ps) => [...ps, emptyRow()])}
          />
        }
      />
    );
  };

  // ---- «Выручка от реализации» + «Комиссия» custom totals -------------------
  const totalsBlock = (
    <div className="min-w-[320px] space-y-4 text-sm" data-test-id="in-totals">
      <div>
        <div className="flex justify-between font-semibold text-base">
          <span>{t('rev_section')}</span>
          <span className="tabular-nums" data-test-id="rev-total">
            {fmt(revenue)}
          </span>
        </div>
        <div className="mt-1 space-y-1">
          <div className="flex justify-between">
            <span className="text-[var(--ms-text-primary)]">{t('rev_realized')}</span>
            <span className="tabular-nums" data-test-id="rev-realized">
              {fmt(realized.gross)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <label className="inline-flex cursor-pointer items-center gap-2">
              <Checkbox
                checked={vatEnabled}
                onCheckedChange={(v) => setVatEnabled(Boolean(v))}
                data-test-id="in-vat-enabled"
              />
              {tFields('vat')}:
            </label>
            <span className="tabular-nums">{vatEnabled ? fmt(realized.vat) : '—'}</span>
          </div>
          <div className="flex justify-between text-[var(--ms-text-muted)] text-xs">
            <span>{t('rev_quantity')}</span>
            <span className="tabular-nums">{realized.qty.toLocaleString('ru-RU')}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--ms-text-primary)]">{t('rev_returned')}</span>
            <span className="tabular-nums" data-test-id="rev-returned">
              {fmt(returned.gross)}
            </span>
          </div>
          {vatEnabled && (
            <div className="flex justify-between">
              <span className="pl-6">{tFields('vat')}:</span>
              <span className="tabular-nums">{fmt(returned.vat)}</span>
            </div>
          )}
          <div className="flex justify-between text-[var(--ms-text-muted)] text-xs">
            <span>{t('rev_quantity')}</span>
            <span className="tabular-nums">{returned.qty.toLocaleString('ru-RU')}</span>
          </div>
          {vatEnabled && (
            <label className="flex cursor-pointer items-center gap-2">
              <Checkbox
                checked={vatIncluded}
                onCheckedChange={(v) => setVatIncluded(Boolean(v))}
                data-test-id="in-vat-included"
              />
              {t('rev_price_incl_vat')}
            </label>
          )}
        </div>
      </div>

      <div>
        <div className="flex justify-between font-semibold text-base">
          <span>{t('comm_section')}</span>
          <span className="tabular-nums" data-test-id="comm-total">
            {fmt(commissionTotal)}
          </span>
        </div>
        <div className="mt-1 space-y-1">
          <div className="flex justify-between">
            <span className="text-[var(--ms-text-primary)]">{t('comm_for_realization')}</span>
            <span className="tabular-nums" data-test-id="comm-realization">
              {fmt(realized.reward)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--ms-text-primary)]">{t('comm_other_services')}</span>
            <span className="tabular-nums" data-test-id="comm-other">
              {fmt(otherServicesMinor)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--ms-text-primary)]">{t('comm_return')}</span>
            <span className="tabular-nums">{fmt(returned.reward)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--ms-text-primary)]">{t('comm_to_warehouse')}</span>
            <span className="tabular-nums">{fmt(returned.gross)}</span>
          </div>
        </div>
      </div>
    </div>
  );

  const tabs = [
    {
      key: 'realized',
      label: t('tab_realized'),
      content: (
        <div className="space-y-4">
          {/* Owner 2026-07-23: «Договорная цена» — blue, at the table's OUTER
              top-right corner (same spot in every section). */}
          <div className="-mb-2.5 flex justify-end">
            <PositionAgreementButton
              totalMinor={realized.gross}
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
          {renderGrid('realized', positions, selectedRowIds, setSelectedRowIds)}
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-12">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={tFields('description')}
              rows={5}
              className="lg:w-[515px] lg:shrink-0"
              data-test-id="field-description"
            />
            {totalsBlock}
          </div>

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
              entity="CommissionReportIn"
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
      key: 'returned',
      label: t('tab_returned'),
      content: (
        <div className="space-y-4">
          {renderGrid('returned', returnPositions, returnSelectedIds, setReturnSelectedIds)}
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
        testId="commission-report-new-in-page"
        documentTypeLabel={t('type_in')}
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
        <DocumentMetaPanel className="max-w-[745px]">
          <DocumentMetaRow fixedWidth>
            <DocumentMetaField
              label={t('org_seller')}
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
              label={t('agent_commissioner')}
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
            <DocumentMetaField label={t('incoming_number')} startRow>
              <div className="flex items-center gap-1.5">
                <Input
                  value={incomingNumber}
                  onChange={(e) => setIncomingNumber(e.target.value)}
                  className="w-[110px]"
                  data-test-id="field-incoming-number"
                />
                <span className="text-[var(--ms-text-muted)] text-xs">{t('date_at')}</span>
                <DatePicker
                  value={incomingDate || null}
                  onChange={(v) => setIncomingDate(v ?? '')}
                  locale={locale}
                  testId="field-incoming-date"
                  ariaLabel={t('incoming_number')}
                />
              </div>
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
            <DocumentMetaField label={t('other_services')}>
              <div className="flex items-center gap-1.5">
                <MoneyInput
                  valueMinor={otherServices}
                  onChangeMinor={(v) => setOtherServices(v || '0')}
                  data-test-id="field-other-services"
                />
                <span className="text-[var(--ms-text-muted)] text-xs">{currencyName}</span>
              </div>
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

        <DocumentTabs tabs={tabs} defaultActiveKey="realized" />
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
          setAgentInvalid(false);
          setError(null);
          setAgentId(item.id);
          setAgentLabel(String(item.primary));
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
          makeSetter(openPicker.grid)((ps) =>
            ps.map((p) =>
              p.id === openPicker.rowUid
                ? {
                    ...p,
                    assortmentId: item.id,
                    productLabel: String(item.primary),
                    productUom: raw?.uom ?? null,
                    priceMinor: raw?.salePriceMinor ?? raw?.buyPriceMinor ?? '0',
                    salePriceMinor: raw?.salePriceMinor ?? null,
                    buyPriceMinor: raw?.buyPriceMinor ?? null,
                    vat: raw?.vat != null ? String(raw.vat) : '12',
                  }
                : p,
            ),
          );
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

      <Modal
        open={repriceTarget !== null}
        onOpenChange={(o) => !o && setRepriceTarget(null)}
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
