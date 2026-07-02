'use client';

/**
 * /purchase-returns/new — moysklad-parity «Возврат поставщику» editor.
 *
 * Built on the document-editor framework. Procurement doc: has Поставщик,
 * Склад, Ожидание checkbox, VAT totals panel. Supports fromSupply query
 * param to pre-fill from an existing Приёмка.
 */

import { useDocumentEditorLabels } from '@/hooks/use-document-editor-labels';
import { useUserDefaults } from '@/hooks/use-user-defaults';
import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';
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
  buyPrice: string | null;
  vat: number | null;
}

interface NewPositionRow extends DocPositionRow {
  assortmentId: string | null;
  supplyPositionId: string | null;
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
  { key: 'menu' },
];

export default function NewPurchaseReturnPage() {
  const router = useRouter();
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const t = useTranslations('pages.purchase_returns');
  const tFields = useTranslations('fields');
  const tForm = useTranslations('form');
  const tDetailForm = useTranslations('detail_form');
  const tDetailTabs = useTranslations('detail_tabs');
  const tDetailTitles = useTranslations('detail_titles');
  const tDetailHeader = useTranslations('detail_header');
  const tStates = useTranslations('states.purchase_return');
  const docEditorLabels = useDocumentEditorLabels();

  // moysklad purchase-return FSM = draft / posted / cancelled (mirrors
  // purchase-returns/[id]). The status field is decorative on /new (not sent
  // on create — the API always creates a draft), so we surface the same three
  // real states.
  const STATUS_OPTIONS = [
    { value: 'draft', label: tStates('draft'), color: '#e8eef5' },
    { value: 'posted', label: tStates('posted'), color: '#cfe8d3' },
    { value: 'cancelled', label: tStates('cancelled'), color: '#f4d4d4' },
  ];

  const fromSupplyId = searchParams.get('fromSupply');

  const { data: orgsData } = useQuery<{ items: RefItem[] }>({
    queryKey: ['organizations'],
    queryFn: () => api.get('/organizations'),
  });
  const { data: storesData } = useQuery<{ items: RefItem[] }>({
    queryKey: ['stores'],
    queryFn: () => api.get('/stores'),
  });

  const { data: fromSupply } = useQuery<{
    id: string;
    name: string;
    agent: { id: string; name: string };
    organization: { id: string; name: string };
    store: { id: string; name: string };
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
    queryKey: ['supply', fromSupplyId],
    queryFn: () => api.get(`/supplies/${fromSupplyId}`),
    enabled: !!fromSupplyId,
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
  const [waiting, setWaiting] = useState(false);

  // Meta state
  const [agentId, setAgentId] = useState<string | null>(null);
  const [agentLabel, setAgentLabel] = useState<string>('');
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [organizationLabel, setOrganizationLabel] = useState<string>('');
  const [storeId, setStoreId] = useState<string | null>(null);
  const [storeLabel, setStoreLabel] = useState<string>('');
  const [supplyId, setSupplyId] = useState<string | null>(null);
  const [supplyLabel, setSupplyLabel] = useState<string>('');
  const [contractId, setContractId] = useState<string | null>(null);
  const [contractLabel, setContractLabel] = useState('');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectLabel, setProjectLabel] = useState('');
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
    | 'supply'
    | 'contract'
    | 'project'
    | 'bankAccount'
    | 'agentAccount'
    | { kind: 'product'; rowUid: string }
  >(null);
  const [error, setError] = useState<string | null>(null);

  // «Курс валюты документа» — rate from the account currency-справочник (Настройки
  // → Валюты), the admin-set value moysklad books documents at — NOT a live CB
  // feed (drifts e.g. 11 990 vs 12 200, storing USD docs at the wrong base value).
  // One source of truth → GET /currencies (mirror enters / losses / payments-in).
  const { data: currenciesData } = useQuery<{ items: Array<{ isoCode: string; rate: string }> }>({
    queryKey: ['currencies'],
    queryFn: () => api.get('/currencies'),
    staleTime: 60_000,
  });
  const adminRate = (currenciesData?.items ?? []).find((c) => c.isoCode === currency)?.rate;
  const effectiveRate = rateOverride ?? adminRate ?? '1';

  // Auto-fill from the user's «Значения по умолчанию» (moysklad applies the user
  // defaults to every new document). Procurement doc — Организация/Склад=default
  // with a first-item fallback, Поставщик=defaultSupplier, Проект=defaultProject.
  // Skipped when pre-filling from a supply — the supply's own values win.
  const userDefaults = useUserDefaults();
  const defaultsAppliedRef = useRef(false);
  useEffect(() => {
    if (defaultsAppliedRef.current || fromSupplyId) return;
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
    if (!agentId && us?.defaultSupplier) {
      setAgentId(us.defaultSupplier.id);
      setAgentLabel(us.defaultSupplier.name);
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
    fromSupplyId,
  ]);

  useEffect(() => {
    if (!fromSupply) return;
    setAgentId(fromSupply.agent.id);
    setAgentLabel(fromSupply.agent.name);
    setOrganizationId(fromSupply.organization.id);
    setOrganizationLabel(fromSupply.organization.name);
    setStoreId(fromSupply.store.id);
    setStoreLabel(fromSupply.store.name);
    setSupplyId(fromSupply.id);
    setSupplyLabel(fromSupply.name);
    setVatEnabled(fromSupply.vatEnabled);
    setVatIncluded(fromSupply.vatIncluded);
    setPositions(
      fromSupply.positions.map((p) => ({
        id: uid(),
        assortmentId: p.assortmentId,
        productLabel: p.product?.name ?? '',
        productUom: p.product?.uom ?? null,
        supplyPositionId: p.id,
        quantity: p.quantity,
        priceMinor: p.priceMinor,
        discount: p.discount,
        vat: p.vat != null ? String(p.vat) : '12',
        vatEnabled: p.vatEnabled,
      })),
    );
  }, [fromSupply]);

  const addPosition = () => {
    setPositions((ps) => [
      ...ps,
      {
        id: uid(),
        assortmentId: null,
        productLabel: '',
        productUom: null,
        supplyPositionId: null,
        quantity: '1',
        priceMinor: '0',
        discount: '0',
        vat: '12',
        vatEnabled: true,
      },
    ]);
  };
  const updatePosition = (id: string, patch: Partial<NewPositionRow>) => {
    setPositions((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };
  const removePosition = (id: string) => {
    setPositions((ps) => ps.filter((p) => p.id !== id));
  };

  const totals = useMemo(
    () =>
      positions.reduce(
        (acc, p) => {
          const lt = computeLineTotal(p, vatIncluded);
          return { net: acc.net + lt.net, vat: acc.vat + lt.vat, gross: acc.gross + lt.gross };
        },
        { net: 0n, vat: 0n, gross: 0n },
      ),
    [positions, vatIncluded],
  );

  const createMut = useMutation({
    mutationFn: async () => {
      if (!agentId) throw new Error(tForm('select_supplier'));
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
        supplyId: supplyId ?? undefined,
        ...(contractId ? { contractId } : {}),
        ...(projectId ? { projectId } : {}),
        reason: reason || undefined,
        description: description || undefined,
        ...(docNumber ? { name: docNumber } : {}),
        moment: docDate ? new Date(docDate).toISOString() : undefined,
        applicable,
        waiting,
        currency,
        rateValue:
          currency === 'UZS'
            ? '100000000'
            : BigInt(Math.round(Number(effectiveRate) * 100000000)).toString(),
        vatEnabled,
        vatIncluded,
        positions: positions.map((p) => ({
          assortmentKind: 'product',
          // biome-ignore lint/style/noNonNullAssertion: validated non-null in the loop above before payload build
          assortmentId: p.assortmentId!,
          supplyPositionId: p.supplyPositionId ?? undefined,
          quantity: p.quantity,
          priceMinor: p.priceMinor,
          discount: p.discount || '0',
          vat: p.vat ? Number(p.vat) : undefined,
          vatEnabled: p.vatEnabled,
        })),
      };
      return api.post<{ id: string }>('/purchase-returns', payload);
    },
    onSuccess: (created) => router.push(`/purchase-returns/${created.id}`),
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
  const supplyFetcher = async (s: string): Promise<PickerItem[]> => {
    const filters = new URLSearchParams();
    filters.set('limit', '50');
    if (s) filters.set('search', s);
    if (agentId) filters.set('agentId', agentId);
    filters.set('state', 'posted');
    const d = await api.get<{
      items: Array<{ id: string; name: string; agent: { name: string }; sumMinor: string }>;
    }>(`/supplies?${filters.toString()}`);
    return d.items.map((r) => ({
      id: r.id,
      primary: r.name,
      secondary: r.agent.name,
      meta: formatMoney(r.sumMinor),
    }));
  };
  const contractFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: Array<{ id: string; name: string }> }>(
      `/contracts?search=${encodeURIComponent(s)}&limit=50`,
    );
    return d.items.map((x) => ({ id: x.id, primary: x.name }));
  };
  const projectFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: Array<{ id: string; name: string }> }>(
      `/projects?search=${encodeURIComponent(s)}&limit=50`,
    );
    return d.items.map((x) => ({ id: x.id, primary: x.name }));
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
            supplyPositionId: null,
          })
        }
      />
    );
  };

  const tabs = [
    {
      key: 'main',
      label: tDetailTabs('main'),
      content: (
        <div className="space-y-4">
          <DocumentMetaPanel>
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
                  placeholder={tForm('select_organization')}
                  onPick={() => setOpenPicker('org')}
                  onClear={() => {
                    setOrganizationId(null);
                    setOrganizationLabel('');
                    setBankAccountId(null);
                    setBankAccountLabel('');
                  }}
                />
              </DocumentMetaField>
              <DocumentMetaField label={tFields('store')} required>
                <CatalogPickerField
                  value={storeId ? { id: storeId, label: storeLabel } : null}
                  placeholder={tForm('select_store')}
                  onPick={() => setOpenPicker('store')}
                  onClear={() => {
                    setStoreId(null);
                    setStoreLabel('');
                  }}
                />
              </DocumentMetaField>
            </DocumentMetaRow>

            <DocumentMetaRow>
              <DocumentMetaField label={tFields('agent')} required>
                <CatalogPickerField
                  value={agentId ? { id: agentId, label: agentLabel } : null}
                  placeholder={tForm('select_supplier')}
                  onPick={() => setOpenPicker('agent')}
                  onClear={() => {
                    setAgentId(null);
                    setAgentLabel('');
                    setSupplyId(null);
                    setSupplyLabel('');
                  }}
                  onCreate={() => router.push('/counterparties/new')}
                  createLabel={tForm('create_new_counterparty')}
                />
              </DocumentMetaField>
              <DocumentMetaField label={tFields('linked_supply')}>
                <CatalogPickerField
                  value={supplyId ? { id: supplyId, label: supplyLabel } : null}
                  placeholder={agentId ? tForm('select_supply') : tForm('select_supplier_first')}
                  onPick={() => agentId && setOpenPicker('supply')}
                  onClear={() => {
                    setSupplyId(null);
                    setSupplyLabel('');
                  }}
                  disabled={!agentId}
                />
              </DocumentMetaField>
            </DocumentMetaRow>

            <DocumentMetaRow>
              <DocumentMetaField label={tFields('contract')}>
                <CatalogPickerField
                  value={contractId ? { id: contractId, label: contractLabel } : null}
                  placeholder={tForm('select_contract')}
                  onPick={() => setOpenPicker('contract')}
                  onClear={() => {
                    setContractId(null);
                    setContractLabel('');
                  }}
                />
              </DocumentMetaField>
              <DocumentMetaField label={tFields('project')}>
                <CatalogPickerField
                  value={projectId ? { id: projectId, label: projectLabel } : null}
                  placeholder={tForm('select_project')}
                  onPick={() => setOpenPicker('project')}
                  onClear={() => {
                    setProjectId(null);
                    setProjectLabel('');
                  }}
                />
              </DocumentMetaField>
            </DocumentMetaRow>

            <DocumentMetaRow>
              <DocumentMetaField label={tFields('reason')}>
                <Input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={t('reason_placeholder')}
                  data-test-id="field-reason"
                />
              </DocumentMetaField>
            </DocumentMetaRow>

            <DocumentMetaRow>
              <DocumentMetaField label={tFields('agent_account')}>
                <CatalogPickerField
                  value={agentAccountId ? { id: agentAccountId, label: agentAccountLabel } : null}
                  placeholder={
                    agentId ? tForm('select_agent_account') : tForm('select_supplier_first')
                  }
                  onPick={() => agentId && setOpenPicker('agentAccount')}
                  onClear={() => {
                    setAgentAccountId(null);
                    setAgentAccountLabel('');
                  }}
                  disabled={!agentId}
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

            <DocumentMetaRow>
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
                          <Button
                            type="button"
                            variant="link"
                            onClick={() => setRateEditing(true)}
                            className="h-auto px-0 font-normal text-xs"
                            aria-label={tForm('rate_edit')}
                          >
                            ✎
                          </Button>
                          {rateOverride && (
                            <Button
                              type="button"
                              variant="link"
                              onClick={() => setRateOverride(null)}
                              className="h-auto px-0 font-normal text-[var(--ms-text-muted)] text-xs"
                              title={tForm('rate_auto_reset')}
                            >
                              ↺
                            </Button>
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
                  setPositions((ps) => [
                    ...ps,
                    {
                      id: uid(),
                      assortmentId: item.id,
                      productLabel: item.primary,
                      productUom: raw?.uom ?? null,
                      supplyPositionId: null,
                      quantity: '1',
                      priceMinor: raw?.buyPrice ?? '0',
                      discount: '0',
                      vat: raw?.vat != null ? String(raw.vat) : '12',
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
                      return {
                        id: uid(),
                        assortmentId: item.id,
                        productLabel: item.primary,
                        productUom: raw?.uom ?? null,
                        supplyPositionId: null,
                        quantity: Number(quantity) > 0 ? quantity : '1',
                        priceMinor: raw?.buyPrice ?? '0',
                        discount: '0',
                        vat: raw?.vat != null ? String(raw.vat) : '12',
                        vatEnabled: true,
                      };
                    }),
                  ]);
                }}
              />
            }
          />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto]">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={tFields('description')}
              rows={3}
              data-test-id="field-description"
            />
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
        testId="purchase-return-new-page"
        documentTypeLabel={tDetailTitles('purchase_return')}
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
        waiting={waiting}
        onWaitingChange={setWaiting}
        waitingHelp={t('waiting_help')}
        onSave={() => {
          setError(null);
          createMut.mutate();
        }}
        saving={createMut.isPending}
        onClose={() => router.push('/purchase-returns')}
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
        title={tForm('supplier_picker_title')}
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
        title={tForm('organization_picker_title')}
        fetcher={orgFetcher}
        onSelect={(item) => {
          setOrganizationId(item.id);
          setOrganizationLabel(String(item.primary));
        }}
      />
      <CatalogPicker
        open={openPicker === 'store'}
        onClose={() => setOpenPicker(null)}
        title={tForm('store_picker_title')}
        fetcher={storeFetcher}
        onSelect={(item) => {
          setStoreId(item.id);
          setStoreLabel(String(item.primary));
        }}
      />
      <CatalogPicker
        open={openPicker === 'supply'}
        onClose={() => setOpenPicker(null)}
        title={tForm('supply_picker_title')}
        fetcher={supplyFetcher}
        onSelect={(item) => {
          setSupplyId(item.id);
          setSupplyLabel(String(item.primary));
        }}
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
        open={openPicker === 'bankAccount'}
        onClose={() => setOpenPicker(null)}
        title={tForm('bank_account_picker_title')}
        fetcher={bankAccountFetcher}
        onSelect={(item) => {
          setBankAccountId(item.id);
          setBankAccountLabel(String(item.primary));
        }}
      />
      <CatalogPicker
        open={openPicker === 'agentAccount'}
        onClose={() => setOpenPicker(null)}
        title={tForm('agent_account_picker_title')}
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
          updatePosition(openPicker.rowUid, {
            assortmentId: item.id,
            productLabel: String(item.primary),
            productUom: raw?.uom ?? null,
            priceMinor: raw?.buyPrice ?? '0',
            vat: raw?.vat != null ? String(raw.vat) : '12',
          });
        }}
      />
    </>
  );
}
