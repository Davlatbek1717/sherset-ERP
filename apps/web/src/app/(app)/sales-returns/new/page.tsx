'use client';

/**
 * /sales-returns/new — moysklad-parity «Возврат покупателя» editor.
 *
 * Built on the document-editor framework. Preserves the fromDemand
 * query-param pre-fill flow (agent, org, store, positions all copied
 * from the source shipment). The demandId back-link picker is kept in
 * the MetaPanel. «Причина» lives in the comment textarea area.
 */

import { useDocumentEditorLabels } from '@/hooks/use-document-editor-labels';
import { useUserDefaults } from '@/hooks/use-user-defaults';
import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';
import { resolveDefaultSalePriceOrZero } from '@/lib/sale-price';
import { computePositionTotal } from '@moysklad/money';
import {
  Button,
  CatalogPicker,
  CatalogPickerField,
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
  NativeSelect,
  type PickerItem,
  PositionInlineAdd,
  PositionTable,
  type PositionTableColumnConfig,
  Textarea,
  formatMoney,
} from '@moysklad/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
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
  salePrices: Array<{ priceTypeId: string; value: string }> | null;
  vat: number | null;
}

interface NewPositionRow extends DocPositionRow {
  assortmentId: string | null;
  demandPositionId: string | null;
}

function uid(): string {
  return Math.random().toString(36).slice(2);
}

function computeLineTotal(
  p: NewPositionRow,
  vatIncluded: boolean,
): { net: bigint; vat: bigint; gross: bigint } {
  // Delegates to the shared `computePositionTotal` — the SAME single-round,
  // micro-tiyin discipline the API posts with — so the «Итого» footer agrees
  // with the per-row «Сумма» cells (PositionTable) and the stored document
  // total exactly (no FE↔BE rounding drift; a fractional «НДС» like 7.5 no
  // longer throws a BigInt RangeError mid-edit).
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

export default function NewSalesReturnPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations('pages.sales_returns');
  const tFields = useTranslations('fields');
  const tForm = useTranslations('form');
  const tDetailForm = useTranslations('detail_form');
  const tDetailTabs = useTranslations('detail_tabs');
  const tDetailTitles = useTranslations('detail_titles');
  const tDetailHeader = useTranslations('detail_header');
  const tStates = useTranslations('states.sales_return');
  const docEditorLabels = useDocumentEditorLabels();
  const { user } = useAuth();

  // moysklad sales-return FSM = draft / posted / cancelled (mirrors
  // sales-returns/[id]). Status is decorative on /new (not sent on create).
  const STATUS_OPTIONS = [
    { value: 'draft', label: tStates('draft'), color: '#e8eef5' },
    { value: 'posted', label: tStates('posted'), color: '#cfe8d3' },
    { value: 'cancelled', label: tStates('cancelled'), color: '#f4d4d4' },
  ];

  const POSITION_COLUMNS: PositionTableColumnConfig[] = [
    { key: 'dragarea' },
    { key: 'select' },
    { key: 'index' },
    { key: 'image' },
    { key: 'name' },
    { key: 'quantity' },
    { key: 'goodPack' },
    { key: 'price' },
    { key: 'vat' },
    { key: 'vatAmount' },
    { key: 'discount' },
    { key: 'amount' },
    // moysklad «Возврат покупателя» customs block (§45): Себестоимость ГТД
    // + Страна only (no «Номер ГТД» column — outbound-origin return).
    { key: 'gtdSumMinor', label: tFields('gtd_cost') },
    { key: 'country' },
    { key: 'menu' },
  ];

  const fromDemandId = searchParams.get('fromDemand');

  const { data: orgsData } = useQuery<{ items: RefItem[] }>({
    queryKey: ['organizations'],
    queryFn: () => api.get('/organizations'),
  });
  const { data: storesData } = useQuery<{ items: RefItem[] }>({
    queryKey: ['stores'],
    queryFn: () => api.get('/stores'),
  });

  // Optional pre-fill from Demand
  const { data: fromDemand } = useQuery<{
    id: string;
    name: string;
    agent: { id: string; name: string };
    organization: { id: string; name: string };
    store: { id: string; name: string };
    customerOrder: { id: string; name: string } | null;
    vatEnabled: boolean;
    vatIncluded: boolean;
    positions: Array<{
      id: string;
      assortmentId: string;
      quantity: string;
      priceMinor: string;
      discount: string;
      vat: number | null;
      vatEnabled: boolean;
      product: { id: string; name: string; code: string | null; uom: string | null } | null;
    }>;
  }>({
    queryKey: ['demand', fromDemandId],
    queryFn: () => api.get(`/demands/${fromDemandId}`),
    enabled: !!fromDemandId,
  });

  // Header state
  const [docNumber, setDocNumber] = useState('');
  const [docDate, setDocDate] = useState(() => {
    const d = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const [status, setStatus] = useState<string>('draft');
  const [applicable, setApplicable] = useState(false);

  // Meta state
  const [agentId, setAgentId] = useState<string | null>(null);
  const [agentLabel, setAgentLabel] = useState('');
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [organizationLabel, setOrganizationLabel] = useState('');
  const [storeId, setStoreId] = useState<string | null>(null);
  const [storeLabel, setStoreLabel] = useState('');
  const [demandId, setDemandId] = useState<string | null>(null);
  const [demandLabel, setDemandLabel] = useState('');
  const [customerOrderId, setCustomerOrderId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectLabel, setProjectLabel] = useState('');
  const [contractId, setContractId] = useState<string | null>(null);
  const [contractLabel, setContractLabel] = useState('');
  const [salesChannelId, setSalesChannelId] = useState<string | null>(null);
  const [salesChannelLabel, setSalesChannelLabel] = useState('');
  const [currency, setCurrency] = useState<string>('UZS');
  const [rateOverride, setRateOverride] = useState<string | null>(null);
  const [rateEditing, setRateEditing] = useState(false);
  const [bankAccountId, setBankAccountId] = useState<string | null>(null);
  const [bankAccountLabel, setBankAccountLabel] = useState('');
  const [agentAccountId, setAgentAccountId] = useState<string | null>(null);
  const [agentAccountLabel, setAgentAccountLabel] = useState('');
  const [externalCode, setExternalCode] = useState('');
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');

  // VAT toggles
  const [vatEnabled, setVatEnabled] = useState(true);
  const [vatIncluded, setVatIncluded] = useState(false);

  // Positions
  const [positions, setPositions] = useState<NewPositionRow[]>([]);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());

  // Pickers + error
  const [openPicker, setOpenPicker] = useState<
    | null
    | 'agent'
    | 'org'
    | 'store'
    | 'demand'
    | 'project'
    | 'contract'
    | 'salesChannel'
    | 'bankAccount'
    | 'agentAccount'
    | { kind: 'product'; rowUid: string }
    | { kind: 'country'; rowUid: string }
  >(null);
  const [error, setError] = useState<string | null>(null);

  // «Курс валюты документа» — the rate is the account's currency-справочник rate
  // (Настройки → Валюты), the SAME admin-set value moysklad books documents at.
  // NOT a live CB feed: that drifts from the admin rate (e.g. 11 990 vs 12 200),
  // so USD docs were stored at the wrong base-currency value. One source of
  // truth → GET /currencies (mirror enters / losses / payments-in).
  const { data: currenciesData } = useQuery<{ items: Array<{ isoCode: string; rate: string }> }>({
    queryKey: ['currencies'],
    queryFn: () => api.get('/currencies'),
    staleTime: 60_000,
  });
  const adminRate = (currenciesData?.items ?? []).find((c) => c.isoCode === currency)?.rate;
  const effectiveRate = rateOverride ?? adminRate ?? '1';

  // Auto-fill from the user's «Значения по умолчанию» (moysklad applies the user
  // defaults to every new document). Sales doc — Организация/Склад=default with a
  // first-item fallback, Контрагент=defaultCustomer, Проект=defaultProject. Skipped
  // when pre-filling from a demand — the demand's own values win.
  const userDefaults = useUserDefaults();
  const defaultsAppliedRef = useRef(false);
  useEffect(() => {
    if (defaultsAppliedRef.current || fromDemandId) return;
    if (!orgsData || !storesData || userDefaults.isLoading) return;
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
    if (!storeId) {
      if (us?.defaultStore) {
        setStoreId(us.defaultStore.id);
        setStoreLabel(us.defaultStore.name);
      } else if (storesData.items[0]) {
        setStoreId(storesData.items[0].id);
        setStoreLabel(storesData.items[0].name);
      }
    }
    if (!agentId && us?.defaultCustomer) {
      setAgentId(us.defaultCustomer.id);
      setAgentLabel(us.defaultCustomer.name);
    }
    if (!projectId && us?.defaultProject) {
      setProjectId(us.defaultProject.id);
      setProjectLabel(us.defaultProject.name);
    }
  }, [
    orgsData,
    storesData,
    userDefaults.data,
    userDefaults.isLoading,
    organizationId,
    storeId,
    agentId,
    projectId,
    fromDemandId,
  ]);

  // Pre-fill from Demand when loaded
  useEffect(() => {
    if (!fromDemand) return;
    setAgentId(fromDemand.agent.id);
    setAgentLabel(fromDemand.agent.name);
    setOrganizationId(fromDemand.organization.id);
    setOrganizationLabel(fromDemand.organization.name);
    setStoreId(fromDemand.store.id);
    setStoreLabel(fromDemand.store.name);
    setDemandId(fromDemand.id);
    setDemandLabel(fromDemand.name);
    if (fromDemand.customerOrder) setCustomerOrderId(fromDemand.customerOrder.id);
    setVatEnabled(fromDemand.vatEnabled);
    setVatIncluded(fromDemand.vatIncluded);
    setPositions(
      fromDemand.positions.map((p) => ({
        id: uid(),
        assortmentId: p.assortmentId,
        productLabel: p.product?.name ?? '',
        productUom: p.product?.uom ?? null,
        demandPositionId: p.id,
        quantity: p.quantity,
        priceMinor: p.priceMinor,
        discount: p.discount,
        vat: p.vat != null ? String(p.vat) : '0',
        vatEnabled: p.vatEnabled,
      })),
    );
  }, [fromDemand]);

  const addPosition = () => {
    setPositions((ps) => [
      ...ps,
      {
        id: uid(),
        assortmentId: null,
        productLabel: '',
        productUom: null,
        demandPositionId: null,
        quantity: '1',
        priceMinor: '0',
        discount: '0',
        vat: '0',
        vatEnabled: true,
        gtdSumMinor: '',
        countryId: null,
        countryLabel: '',
      },
    ]);
  };
  const updatePosition = (rowId: string, patch: Partial<NewPositionRow>) => {
    setPositions((ps) => ps.map((p) => (p.id === rowId ? { ...p, ...patch } : p)));
  };
  const removePosition = (rowId: string) => {
    setPositions((ps) => ps.filter((p) => p.id !== rowId));
  };

  // Totals — BigInt-safe reduce.
  const totals = useMemo(
    () =>
      positions.reduce(
        (acc, p) => {
          const t = computeLineTotal(p, vatIncluded);
          return { net: acc.net + t.net, vat: acc.vat + t.vat, gross: acc.gross + t.gross };
        },
        { net: 0n, vat: 0n, gross: 0n },
      ),
    [positions, vatIncluded],
  );

  const createMut = useMutation({
    mutationFn: async () => {
      if (!agentId) throw new Error(tForm('select_customer'));
      if (!organizationId) throw new Error(tForm('select_organization'));
      if (!storeId) throw new Error(tForm('select_store'));
      if (positions.length === 0) throw new Error(tForm('add_at_least_one_position'));
      for (const [i, p] of positions.entries()) {
        if (!p.assortmentId) throw new Error(tForm('position_select_product', { n: i + 1 }));
        if (Number(p.quantity) <= 0)
          throw new Error(tForm('position_quantity_positive', { n: i + 1 }));
      }
      const payload = {
        agentId,
        organizationId,
        storeId,
        ...(bankAccountId ? { organizationAccountId: bankAccountId } : {}),
        ...(agentAccountId ? { agentAccountId } : {}),
        ...(externalCode ? { externalCode } : {}),
        demandId: demandId ?? undefined,
        customerOrderId: customerOrderId ?? undefined,
        ...(projectId ? { projectId } : {}),
        ...(contractId ? { contractId } : {}),
        ...(salesChannelId ? { salesChannelId } : {}),
        ...(docNumber ? { name: docNumber } : {}),
        moment: docDate ? new Date(docDate).toISOString() : undefined,
        applicable,
        currency,
        rateValue:
          currency === 'UZS'
            ? '100000000'
            : BigInt(Math.round(Number(effectiveRate) * 100000000)).toString(),
        reason: reason || undefined,
        description: description || undefined,
        vatEnabled,
        vatIncluded,
        positions: positions.map((p) => ({
          assortmentKind: 'product' as const,
          // biome-ignore lint/style/noNonNullAssertion: validated non-null in the loop above before payload build
          assortmentId: p.assortmentId!,
          demandPositionId: p.demandPositionId ?? undefined,
          quantity: p.quantity,
          priceMinor: p.priceMinor,
          discount: p.discount || '0',
          vat: p.vat ? Number(p.vat) : undefined,
          vatEnabled: p.vatEnabled,
          gtdSumMinor: p.gtdSumMinor || undefined,
          countryId: p.countryId || undefined,
        })),
      };
      return api.post<{ id: string }>('/sales-returns', payload);
    },
    onSuccess: (created) => router.push(`/sales-returns/${created.id}`),
    onError: (err: Error) => setError(err.message),
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
  const orgFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: RefItem[] }>(`/organizations?search=${encodeURIComponent(s)}`);
    return d.items.map((o) => ({
      id: o.id,
      primary: o.name,
      secondary: o.legalTitle ?? undefined,
    }));
  };
  const storeFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: RefItem[] }>(`/stores?search=${encodeURIComponent(s)}`);
    return d.items.map((st) => ({ id: st.id, primary: st.name, secondary: st.code ?? undefined }));
  };
  const demandFetcher = async (s: string): Promise<PickerItem[]> => {
    const filters = new URLSearchParams();
    filters.set('limit', '50');
    if (s) filters.set('search', s);
    if (agentId) filters.set('agentId', agentId);
    filters.set('state', 'posted');
    const d = await api.get<{
      items: Array<{
        id: string;
        name: string;
        agent: { name: string };
        state: string;
        sumMinor: string;
      }>;
    }>(`/demands?${filters.toString()}`);
    return d.items.map((r) => ({
      id: r.id,
      primary: r.name,
      secondary: r.agent.name,
      meta: formatMoney(r.sumMinor),
    }));
  };
  const projectFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: RefItem[] }>(`/projects?search=${encodeURIComponent(s)}`);
    return d.items.map((p) => ({ id: p.id, primary: p.name }));
  };
  const contractFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: RefItem[] }>(
      `/contracts?search=${encodeURIComponent(s)}&limit=50`,
    );
    return d.items.map((c) => ({ id: c.id, primary: c.name }));
  };
  const salesChannelFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: RefItem[] }>(
      `/sales-channels?search=${encodeURIComponent(s)}&limit=50`,
    );
    return d.items.map((c) => ({ id: c.id, primary: c.name }));
  };
  const countryFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: Array<{ id: string; name: string; code: string | null }> }>(
      `/countries?search=${encodeURIComponent(s)}&limit=100`,
    );
    return d.items.map((c) => ({ id: c.id, primary: c.name, secondary: c.code ?? undefined }));
  };

  const bankAccountFetcher = async (s: string): Promise<PickerItem[]> => {
    if (!organizationId) return [];
    const d = await api.get<{
      items: Array<{
        id: string;
        bankName: string | null;
        accountNumber: string;
        currency: string;
      }>;
    }>(`/bank-accounts?organizationId=${organizationId}&search=${encodeURIComponent(s)}`);
    return d.items
      .filter((a) => a.currency === currency)
      .map((a) => ({
        id: a.id,
        primary: a.accountNumber,
        secondary: a.bankName ?? undefined,
      }));
  };

  // moysklad parity — counterparty bank accounts have no flat list endpoint;
  // the only route is the nested /counterparties/:id/bank-accounts (same as
  // the contract picker is gated on the chosen agent). Client-filter by
  // search since the nested endpoint takes no search param.
  const agentAccountFetcher = async (s: string): Promise<PickerItem[]> => {
    if (!agentId) return [];
    const d = await api.get<Array<{ id: string; accountNumber: string; bankName: string | null }>>(
      `/counterparties/${agentId}/bank-accounts`,
    );
    const q = s.trim().toLowerCase();
    return d
      .filter(
        (a) =>
          !q ||
          a.accountNumber.toLowerCase().includes(q) ||
          (a.bankName ?? '').toLowerCase().includes(q),
      )
      .map((a) => ({ id: a.id, primary: a.accountNumber, secondary: a.bankName ?? undefined }));
  };

  const renderPositionNameCell = (row: DocPositionRow) => {
    const p = row as NewPositionRow;
    return (
      <CatalogPickerField
        value={p.assortmentId ? { id: p.assortmentId, label: p.productLabel } : null}
        placeholder={tForm('select_product')}
        onPick={() => setOpenPicker({ kind: 'product', rowUid: p.id })}
        onClear={() =>
          updatePosition(p.id, {
            assortmentId: null,
            productLabel: '',
            productUom: null,
            demandPositionId: null,
          })
        }
      />
    );
  };

  const renderPositionCountryCell = (row: DocPositionRow) => (
    <CatalogPickerField
      value={row.countryId ? { id: row.countryId, label: row.countryLabel ?? '' } : null}
      placeholder={tFields('country')}
      onPick={() => setOpenPicker({ kind: 'country', rowUid: row.id })}
      onClear={() => updatePosition(row.id, { countryId: null, countryLabel: '' })}
    />
  );

  const tabs = [
    {
      key: 'main',
      label: tDetailTabs('main'),
      content: (
        <div className="space-y-4">
          <DocumentMetaPanel>
            <DocumentMetaRow>
              <DocumentMetaField label={tFields('agent')} required>
                <CatalogPickerField
                  value={agentId ? { id: agentId, label: agentLabel } : null}
                  placeholder={tFields('agent')}
                  onPick={() => setOpenPicker('agent')}
                  onClear={() => {
                    setAgentId(null);
                    setAgentLabel('');
                    setDemandId(null);
                    setDemandLabel('');
                  }}
                  onCreate={() => router.push('/counterparties/new')}
                  createLabel={tForm('create_new_counterparty')}
                />
              </DocumentMetaField>
              <DocumentMetaField label={tFields('store')}>
                <CatalogPickerField
                  value={storeId ? { id: storeId, label: storeLabel } : null}
                  placeholder={tFields('store')}
                  onPick={() => setOpenPicker('store')}
                  onClear={() => {
                    setStoreId(null);
                    setStoreLabel('');
                  }}
                />
              </DocumentMetaField>
            </DocumentMetaRow>

            <DocumentMetaRow>
              <DocumentMetaField
                label={tFields('organization')}
                required
                helper={
                  organizationId ? (
                    <CatalogPickerField
                      value={bankAccountId ? { id: bankAccountId, label: bankAccountLabel } : null}
                      placeholder={tForm('select_bank_account', { currency })}
                      onPick={() => setOpenPicker('bankAccount')}
                      onClear={() => {
                        setBankAccountId(null);
                        setBankAccountLabel('');
                      }}
                    />
                  ) : undefined
                }
              >
                <CatalogPickerField
                  value={organizationId ? { id: organizationId, label: organizationLabel } : null}
                  placeholder={tFields('organization')}
                  onPick={() => setOpenPicker('org')}
                  onClear={() => {
                    setOrganizationId(null);
                    setOrganizationLabel('');
                    setBankAccountId(null);
                    setBankAccountLabel('');
                  }}
                />
              </DocumentMetaField>
              <DocumentMetaField label={tFields('linked_demand')}>
                <CatalogPickerField
                  value={demandId ? { id: demandId, label: demandLabel } : null}
                  placeholder={agentId ? tFields('linked_demand') : tForm('select_customer_first')}
                  onPick={() => agentId && setOpenPicker('demand')}
                  onClear={() => {
                    setDemandId(null);
                    setDemandLabel('');
                    setCustomerOrderId(null);
                  }}
                  disabled={!agentId}
                />
              </DocumentMetaField>
            </DocumentMetaRow>

            <DocumentMetaRow>
              <DocumentMetaField label={tFields('project')}>
                <CatalogPickerField
                  value={projectId ? { id: projectId, label: projectLabel } : null}
                  placeholder={tFields('project')}
                  onPick={() => setOpenPicker('project')}
                  onClear={() => {
                    setProjectId(null);
                    setProjectLabel('');
                  }}
                  onCreate={() => router.push('/projects/new')}
                  createLabel={tForm('create_new_project')}
                />
              </DocumentMetaField>
              <DocumentMetaField
                label={tDetailForm('currency')}
                required
                helper={
                  currency !== 'UZS' ? (
                    <span className="inline-flex items-center gap-2">
                      <span>1 {currency} =</span>
                      {rateEditing ? (
                        <>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={rateOverride ?? effectiveRate}
                            onChange={(e) => setRateOverride(e.target.value)}
                            onBlur={() => setRateEditing(false)}
                            className="h-6 w-24 rounded-[var(--ms-radius-sm)] border border-[var(--ms-border-default)] px-1 text-right text-xs tabular-nums focus:outline-none focus:ring-1 focus:ring-[var(--ms-text-brand)]"
                            data-test-id="rate-input"
                          />
                          <span>UZS</span>
                        </>
                      ) : (
                        <>
                          <span className="font-medium tabular-nums">
                            {Number(effectiveRate).toLocaleString('ru-RU')}
                          </span>
                          <span>UZS</span>
                          <button
                            type="button"
                            onClick={() => setRateEditing(true)}
                            className="text-[var(--ms-text-brand)] hover:underline"
                            aria-label={tForm('rate_edit')}
                          >
                            ✎
                          </button>
                          {rateOverride && (
                            <button
                              type="button"
                              onClick={() => setRateOverride(null)}
                              className="text-[var(--ms-text-muted)] hover:underline"
                              title={tForm('rate_auto_reset')}
                            >
                              ↺
                            </button>
                          )}
                        </>
                      )}
                    </span>
                  ) : undefined
                }
              >
                <NativeSelect
                  value={currency}
                  onChange={(e) => {
                    setCurrency(e.target.value);
                    setRateOverride(null);
                  }}
                  data-test-id="field-currency"
                >
                  <option value="UZS">{tForm('currency_uzs')}</option>
                  <option value="USD">{tForm('currency_usd')}</option>
                  <option value="EUR">{tForm('currency_eur')}</option>
                  <option value="RUB">{tForm('currency_rub')}</option>
                </NativeSelect>
              </DocumentMetaField>
            </DocumentMetaRow>

            <DocumentMetaRow>
              <DocumentMetaField label={tFields('contract')}>
                <CatalogPickerField
                  value={contractId ? { id: contractId, label: contractLabel } : null}
                  placeholder={tFields('contract')}
                  onPick={() => setOpenPicker('contract')}
                  onClear={() => {
                    setContractId(null);
                    setContractLabel('');
                  }}
                />
              </DocumentMetaField>
              <DocumentMetaField label={tFields('sales_channel')}>
                <CatalogPickerField
                  value={salesChannelId ? { id: salesChannelId, label: salesChannelLabel } : null}
                  placeholder={tFields('sales_channel')}
                  onPick={() => setOpenPicker('salesChannel')}
                  onClear={() => {
                    setSalesChannelId(null);
                    setSalesChannelLabel('');
                  }}
                />
              </DocumentMetaField>
            </DocumentMetaRow>

            <DocumentMetaRow>
              <DocumentMetaField label={tFields('agent_account')}>
                <CatalogPickerField
                  value={agentAccountId ? { id: agentAccountId, label: agentAccountLabel } : null}
                  placeholder={
                    agentId ? tForm('select_agent_account') : tForm('select_customer_first')
                  }
                  onPick={() => agentId && setOpenPicker('agentAccount')}
                  onClear={() => {
                    setAgentAccountId(null);
                    setAgentAccountLabel('');
                  }}
                />
              </DocumentMetaField>
              <DocumentMetaField label={tDetailForm('external_code')}>
                <Input
                  value={externalCode}
                  onChange={(e) => setExternalCode(e.target.value)}
                  data-test-id="field-external-code"
                />
              </DocumentMetaField>
            </DocumentMetaRow>
          </DocumentMetaPanel>

          <PositionTable
            columns={POSITION_COLUMNS}
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
            renderCountryCell={renderPositionCountryCell}
            vatIncluded={vatIncluded}
            selectedIds={selectedRowIds}
            onSelectionChange={setSelectedRowIds}
            footerToolbar={
              <PositionInlineAdd
                onSearch={async (q) => {
                  const r = await api.get<{ items: ProductItem[] }>(
                    `/products?search=${encodeURIComponent(q)}&limit=20`,
                  );
                  return r.items.map((p) => ({
                    id: p.id,
                    primary: p.name,
                    secondary: p.code ?? undefined,
                    raw: p,
                  }));
                }}
                onPick={(item) => {
                  const raw = item.raw as ProductItem | undefined;
                  const defaultPrice = resolveDefaultSalePriceOrZero(raw?.salePrices);
                  setPositions((ps) => [
                    ...ps,
                    {
                      id: uid(),
                      assortmentId: item.id,
                      productLabel: item.primary,
                      productUom: raw?.uom ?? null,
                      demandPositionId: null,
                      quantity: '1',
                      priceMinor: defaultPrice,
                      discount: '0',
                      vat: raw?.vat != null ? String(raw.vat) : '0',
                      vatEnabled: true,
                    },
                  ]);
                }}
                onAddFromCatalog={addPosition}
                onCheckCompleteness={() => {
                  if (!storeId) {
                    setError(t('select_store_first'));
                    return;
                  }
                  if (positions.length === 0) {
                    setError(t('add_position_first'));
                    return;
                  }
                  setError(null);
                }}
                onImportPositions={(rows) => {
                  setPositions((ps) => [
                    ...ps,
                    ...rows.map(({ item, quantity }) => {
                      const raw = item.raw as ProductItem | undefined;
                      const defaultPrice = resolveDefaultSalePriceOrZero(raw?.salePrices);
                      return {
                        id: uid(),
                        assortmentId: item.id,
                        productLabel: item.primary,
                        productUom: raw?.uom ?? null,
                        demandPositionId: null,
                        quantity: Number(quantity) > 0 ? quantity : '1',
                        priceMinor: defaultPrice,
                        discount: '0',
                        vat: raw?.vat != null ? String(raw.vat) : '0',
                        vatEnabled: true,
                      };
                    }),
                  ]);
                }}
              />
            }
          />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto]">
            <div className="space-y-2">
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t('reason_placeholder')}
                data-test-id="field-reason"
              />
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={tFields('description')}
                rows={3}
                data-test-id="field-description"
              />
            </div>
            <DocumentTotalsPanel
              subtotalMinor={totals.net}
              vatMinor={totals.vat}
              totalMinor={totals.gross}
              currency={currency}
              vatEnabled={vatEnabled}
              onVatEnabledChange={setVatEnabled}
              vatIncluded={vatIncluded}
              onVatIncludedChange={setVatIncluded}
              quantity={positions.reduce((acc, p) => acc + Number(p.quantity || '0'), 0)}
            />
          </div>

          <DocumentDisclosurePanel
            title={tForm('tasks_section')}
            headerAction={
              <Button type="button" variant="secondary" disabled>
                <Icons.create className="h-4 w-4" />
                {tForm('add_task')}
              </Button>
            }
            defaultOpen={false}
          >
            <p className="text-[var(--ms-text-muted)] text-sm">{tForm('tasks_after_save_hint')}</p>
          </DocumentDisclosurePanel>

          <DocumentDisclosurePanel
            title={tForm('files_section')}
            headerAction={
              <Button type="button" variant="secondary" disabled>
                <Icons.create className="h-4 w-4" />
                {tForm('add_file')}
              </Button>
            }
            defaultOpen={false}
          >
            <p className="text-[var(--ms-text-muted)] text-sm">{tForm('files_after_save_hint')}</p>
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
        testId="sales-return-new-page"
        documentTypeLabel={tDetailTitles('sales_return')}
        number={docNumber}
        onNumberChange={setDocNumber}
        date={docDate}
        onDateChange={setDocDate}
        status={status}
        statusOptions={STATUS_OPTIONS}
        onStatusChange={setStatus}
        applicable={applicable}
        onApplicableChange={setApplicable}
        applicableHelp={t('applicable_help')}
        waiting={undefined}
        onSave={() => {
          setError(null);
          createMut.mutate();
        }}
        saving={createMut.isPending}
        onClose={() => router.push('/sales-returns')}
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
        <DocumentTabs tabs={tabs} defaultActiveKey="main" />
      </DocumentEditor>

      <CatalogPicker
        open={openPicker === 'agent'}
        onClose={() => setOpenPicker(null)}
        title={tFields('agent')}
        fetcher={agentFetcher}
        onSelect={(item) => {
          setAgentId(item.id);
          setAgentLabel(String(item.primary));
        }}
        createLabel={tForm('create_new_counterparty')}
        onCreate={() => router.push('/counterparties/new')}
      />
      <CatalogPicker
        open={openPicker === 'org'}
        onClose={() => setOpenPicker(null)}
        title={tFields('organization')}
        fetcher={orgFetcher}
        onSelect={(item) => {
          setOrganizationId(item.id);
          setOrganizationLabel(String(item.primary));
        }}
      />
      <CatalogPicker
        open={openPicker === 'store'}
        onClose={() => setOpenPicker(null)}
        title={tFields('store')}
        fetcher={storeFetcher}
        onSelect={(item) => {
          setStoreId(item.id);
          setStoreLabel(String(item.primary));
        }}
      />
      <CatalogPicker
        open={openPicker === 'demand'}
        onClose={() => setOpenPicker(null)}
        title={tFields('linked_demand')}
        fetcher={demandFetcher}
        onSelect={(item) => {
          setDemandId(item.id);
          setDemandLabel(String(item.primary));
        }}
      />
      <CatalogPicker
        open={openPicker === 'project'}
        onClose={() => setOpenPicker(null)}
        title={tFields('project')}
        fetcher={projectFetcher}
        onSelect={(item) => {
          setProjectId(item.id);
          setProjectLabel(String(item.primary));
        }}
      />
      <CatalogPicker
        open={openPicker === 'contract'}
        onClose={() => setOpenPicker(null)}
        title={tFields('contract')}
        fetcher={contractFetcher}
        onSelect={(item) => {
          setContractId(item.id);
          setContractLabel(String(item.primary));
        }}
      />
      <CatalogPicker
        open={openPicker === 'salesChannel'}
        onClose={() => setOpenPicker(null)}
        title={tFields('sales_channel')}
        fetcher={salesChannelFetcher}
        onSelect={(item) => {
          setSalesChannelId(item.id);
          setSalesChannelLabel(String(item.primary));
        }}
      />
      <CatalogPicker
        open={openPicker === 'bankAccount'}
        onClose={() => setOpenPicker(null)}
        title={tFields('organization_account')}
        fetcher={bankAccountFetcher}
        onSelect={(item) => {
          setBankAccountId(item.id);
          setBankAccountLabel(String(item.primary));
        }}
      />
      <CatalogPicker
        open={openPicker === 'agentAccount'}
        onClose={() => setOpenPicker(null)}
        title={tFields('agent_account')}
        fetcher={agentAccountFetcher}
        onSelect={(item) => {
          setAgentAccountId(item.id);
          setAgentAccountLabel(String(item.primary));
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
          const defaultPrice = resolveDefaultSalePriceOrZero(raw?.salePrices);
          updatePosition(openPicker.rowUid, {
            assortmentId: item.id,
            productLabel: String(item.primary),
            productUom: raw?.uom ?? null,
            priceMinor: defaultPrice,
            vat: raw?.vat != null ? String(raw.vat) : '0',
          });
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
    </>
  );
}
