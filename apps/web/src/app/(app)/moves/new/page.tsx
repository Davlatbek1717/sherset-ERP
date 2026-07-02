'use client';

/**
 * /moves/new — moysklad-parity «Перемещение» editor.
 *
 * Built on the document-editor framework. Warehouse-internal doc: no
 * counterparty, no Ожидание, no VAT columns. Has Склад-источник and
 * Склад-получатель (both required). Shows live stock for source store.
 */

import { useDocumentEditorLabels } from '@/hooks/use-document-editor-labels';
import { useUserDefaults } from '@/hooks/use-user-defaults';
import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';
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
  Icons,
  Input,
  NativeSelect,
  type PickerItem,
  PositionTable,
  type PositionTableColumnConfig,
  Textarea,
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
}

interface NewPositionRow extends DocPositionRow {
  assortmentId: string | null;
}

function uid(): string {
  return Math.random().toString(36).slice(2);
}

const POSITION_COLUMNS: PositionTableColumnConfig[] = [
  { key: 'dragarea' },
  { key: 'select' },
  { key: 'index' },
  { key: 'image' },
  { key: 'name' },
  { key: 'quantity' },
  { key: 'goodPack' },
  { key: 'amount' },
  { key: 'menu' },
];

export default function NewMovePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const t = useTranslations('pages.moves');
  const tErrors = useTranslations('errors');
  const tFields = useTranslations('fields');
  const tForm = useTranslations('form');
  const tDetailForm = useTranslations('detail_form');
  const tDetailTabs = useTranslations('detail_tabs');
  const tDetailTitles = useTranslations('detail_titles');
  const tDetailHeader = useTranslations('detail_header');
  const tStates = useTranslations('states.move');
  const docEditorLabels = useDocumentEditorLabels();

  // moysklad move FSM = draft / posted / cancelled (mirrors moves/[id]).
  // Status is decorative on /new (not sent on create — API always creates a draft).
  const STATUS_OPTIONS = [
    { value: 'draft', label: tStates('draft'), color: '#e8eef5' },
    { value: 'posted', label: tStates('posted'), color: '#cfe8d3' },
    { value: 'cancelled', label: tStates('cancelled'), color: '#f4d4d4' },
  ];

  const fromOrderId = searchParams.get('fromOrder');

  const { data: orgsData } = useQuery<{ items: RefItem[] }>({
    queryKey: ['organizations'],
    queryFn: () => api.get('/organizations'),
  });

  // Optional pre-fill from a customer order — «Перемещение» of the ordered
  // goods. Mirrors the sales-returns ?fromDemand flow: copy the order's
  // organization, store (the "from" warehouse) and positions; the user picks
  // the destination store. The order's currency/totals/VAT are irrelevant to a
  // warehouse-internal move, so only org/source-store/positions are consumed.
  const { data: fromOrder } = useQuery<{
    id: string;
    organization: { id: string; name: string };
    store: { id: string; name: string } | null;
    positions: Array<{
      id: string;
      assortmentId: string;
      assortmentKind: string;
      quantity: string;
      product: { id: string; name: string; code: string | null; uom: string | null } | null;
    }>;
  }>({
    queryKey: ['customer-order', fromOrderId],
    queryFn: () => api.get(`/customer-orders/${fromOrderId}`),
    enabled: !!fromOrderId,
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
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [organizationLabel, setOrganizationLabel] = useState<string>('');
  const [sourceStoreId, setSourceStoreId] = useState<string | null>(null);
  const [sourceStoreLabel, setSourceStoreLabel] = useState<string>('');
  const [destinationStoreId, setDestinationStoreId] = useState<string | null>(null);
  const [destinationStoreLabel, setDestinationStoreLabel] = useState<string>('');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectLabel, setProjectLabel] = useState('');
  const [externalCode, setExternalCode] = useState('');
  const [description, setDescription] = useState('');
  // «Накладные расходы» — inter-warehouse transfer cost capitalised into
  // the destination landed cost (§65, mirrors Приёмка/Оприходование).
  const [overheadMajor, setOverheadMajor] = useState('');
  const [overheadDistribution, setOverheadDistribution] = useState<
    'WEIGHT' | 'PRICE' | 'VOLUME' | 'QUANTITY'
  >('WEIGHT');

  // Positions
  const [positions, setPositions] = useState<NewPositionRow[]>([]);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());

  // Pickers + error
  const [openPicker, setOpenPicker] = useState<
    null | 'org' | 'sourceStore' | 'destStore' | 'project' | { kind: 'product'; rowUid: string }
  >(null);
  const [error, setError] = useState<string | null>(null);

  // Auto-fill from the user's «Значения по умолчанию» (moysklad applies the user
  // defaults to every new document). Организация=default with a first-item
  // fallback; Склад-откуда=defaultStore (the "from" store, inline-fetch picker so
  // default-only); Проект=defaultProject. The destination store is left for the
  // user to choose. Skipped when pre-filling from a customer order — the order's
  // own values win (mirrors the sales-returns ?fromDemand skip).
  const userDefaults = useUserDefaults();
  const defaultsAppliedRef = useRef(false);
  useEffect(() => {
    if (defaultsAppliedRef.current || fromOrderId) return;
    if (!orgsData || userDefaults.isLoading) return;
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
    if (!sourceStoreId && us?.defaultStore) {
      setSourceStoreId(us.defaultStore.id);
      setSourceStoreLabel(us.defaultStore.name);
    }
    if (!projectId && us?.defaultProject) {
      setProjectId(us.defaultProject.id);
      setProjectLabel(us.defaultProject.name);
    }
  }, [
    orgsData,
    userDefaults.data,
    userDefaults.isLoading,
    organizationId,
    sourceStoreId,
    projectId,
    fromOrderId,
  ]);

  // Pre-fill from a customer order when loaded (applied once via a ref guard).
  // A move FROM a customer order = move the ordered goods: org + source store
  // come from the order; positions copy assortment/label/uom/quantity. The
  // destination store is left for the user.
  const fromOrderAppliedRef = useRef(false);
  useEffect(() => {
    if (fromOrderAppliedRef.current || !fromOrder) return;
    fromOrderAppliedRef.current = true;
    setOrganizationId(fromOrder.organization.id);
    setOrganizationLabel(fromOrder.organization.name);
    if (fromOrder.store) {
      setSourceStoreId(fromOrder.store.id);
      setSourceStoreLabel(fromOrder.store.name);
    }
    setPositions(
      fromOrder.positions.map((p) => ({
        id: uid(),
        assortmentId: p.assortmentId,
        productLabel: p.product?.name ?? '',
        productUom: p.product?.uom ?? null,
        quantity: p.quantity,
        priceMinor: '0',
        discount: '0',
        vat: '0',
        vatEnabled: false,
      })),
    );
  }, [fromOrder]);

  // Live stock for source store to warn shortages
  const assortmentIds = useMemo(
    () => positions.map((p) => p.assortmentId).filter((id): id is string => !!id),
    [positions],
  );
  const { data: stockData } = useQuery<{ items: Array<{ assortmentId: string; qty: string }> }>({
    queryKey: ['stocks', sourceStoreId, assortmentIds.join(',')],
    queryFn: () =>
      api.get(
        `/stocks?storeId=${sourceStoreId}&assortmentIds=${encodeURIComponent(assortmentIds.join(','))}`,
      ),
    enabled: !!sourceStoreId && assortmentIds.length > 0,
  });
  const stockMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of stockData?.items ?? []) m.set(r.assortmentId, r.qty);
    return m;
  }, [stockData]);

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
        vat: '0',
        vatEnabled: false,
      },
    ]);
  };
  const updatePosition = (id: string, patch: Partial<NewPositionRow>) => {
    setPositions((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };
  const removePosition = (id: string) => {
    setPositions((ps) => ps.filter((p) => p.id !== id));
  };

  const createMut = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error(tErrors('select_organization'));
      if (!sourceStoreId) throw new Error(tErrors('select_store'));
      if (!destinationStoreId) throw new Error(tErrors('select_store'));
      if (sourceStoreId === destinationStoreId) throw new Error(t('same_store_error'));
      if (positions.length === 0) throw new Error(tErrors('at_least_one_position'));
      for (const [i, p] of positions.entries()) {
        if (!p.assortmentId) throw new Error(tErrors('position_select_product', { n: i + 1 }));
        if (Number(p.quantity) <= 0)
          throw new Error(tErrors('position_quantity_positive', { n: i + 1 }));
      }
      const payload = {
        organizationId,
        sourceStoreId,
        destinationStoreId,
        ...(projectId ? { projectId } : {}),
        // Link back to the source order («Создать документ → Перемещение») so it
        // appears in that order's «Связанные документы».
        ...(fromOrderId ? { customerOrderId: fromOrderId } : {}),
        ...(externalCode ? { externalCode } : {}),
        description: description || undefined,
        ...(docNumber ? { name: docNumber } : {}),
        moment: docDate ? new Date(docDate).toISOString() : undefined,
        applicable,
        ...(Number(overheadMajor) > 0
          ? {
              overheadSumMinor: String(BigInt(Math.round(Number(overheadMajor) * 100))),
              overheadDistribution,
              overheadCurrency: 'UZS',
            }
          : {}),
        positions: positions.map((p) => ({
          assortmentKind: 'product',
          // biome-ignore lint/style/noNonNullAssertion: validated non-null in the loop above before payload build
          assortmentId: p.assortmentId!,
          quantity: p.quantity,
        })),
      };
      return api.post<{ id: string }>('/moves', payload);
    },
    onSuccess: (created) => router.push(`/moves/${created.id}`),
    onError: (err: Error) => setError(err.message),
  });

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
  const projectFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: Array<{ id: string; name: string }> }>(
      `/projects?search=${encodeURIComponent(s)}&limit=50`,
    );
    return d.items.map((x) => ({ id: x.id, primary: x.name }));
  };

  const renderPositionNameCell = (row: DocPositionRow) => {
    const p = row as NewPositionRow;
    const stockQty = p.assortmentId ? stockMap.get(p.assortmentId) : undefined;
    const wantQty = Number(p.quantity || '0');
    const stockNum = stockQty !== undefined ? Number(stockQty) : undefined;
    const isInsufficient = stockNum !== undefined && wantQty > stockNum;
    return (
      <div className="flex flex-col gap-0.5">
        <CatalogPickerField
          value={p.assortmentId ? { id: p.assortmentId, label: p.productLabel } : null}
          placeholder={tForm('select_product')}
          onPick={() => setOpenPicker({ kind: 'product', rowUid: p.id })}
          onClear={() =>
            updatePosition(p.id, {
              assortmentId: null,
              productLabel: '',
              productUom: null,
            })
          }
        />
        {stockQty !== undefined && (
          <span
            className={`text-xs tabular-nums ${isInsufficient ? 'font-medium text-[var(--ms-text-destructive)]' : 'text-[var(--ms-text-muted)]'}`}
          >
            {tFields('balance')}: {stockNum} {p.productUom ?? ''}
          </span>
        )}
      </div>
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
              <DocumentMetaField label={tFields('organization')} required>
                <CatalogPickerField
                  value={organizationId ? { id: organizationId, label: organizationLabel } : null}
                  onPick={() => setOpenPicker('org')}
                  inlineFetcher={orgFetcher}
                  onInlineSelect={(item) => {
                    setOrganizationId(item.id);
                    setOrganizationLabel(String(item.primary));
                  }}
                  onClear={() => {
                    setOrganizationId(null);
                    setOrganizationLabel('');
                  }}
                />
              </DocumentMetaField>
            </DocumentMetaRow>

            <DocumentMetaRow>
              <DocumentMetaField label={tFields('store_from')} required>
                <CatalogPickerField
                  value={sourceStoreId ? { id: sourceStoreId, label: sourceStoreLabel } : null}
                  onPick={() => setOpenPicker('sourceStore')}
                  inlineFetcher={storeFetcher}
                  onInlineSelect={(item) => {
                    setSourceStoreId(item.id);
                    setSourceStoreLabel(String(item.primary));
                  }}
                  onClear={() => {
                    setSourceStoreId(null);
                    setSourceStoreLabel('');
                  }}
                />
              </DocumentMetaField>
              <DocumentMetaField label={tFields('store_to')} required>
                <CatalogPickerField
                  value={
                    destinationStoreId
                      ? { id: destinationStoreId, label: destinationStoreLabel }
                      : null
                  }
                  onPick={() => setOpenPicker('destStore')}
                  inlineFetcher={storeFetcher}
                  onInlineSelect={(item) => {
                    setDestinationStoreId(item.id);
                    setDestinationStoreLabel(String(item.primary));
                  }}
                  onClear={() => {
                    setDestinationStoreId(null);
                    setDestinationStoreLabel('');
                  }}
                />
              </DocumentMetaField>
            </DocumentMetaRow>
            <DocumentMetaRow>
              <DocumentMetaField label={tFields('project')}>
                <CatalogPickerField
                  value={projectId ? { id: projectId, label: projectLabel } : null}
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
              <DocumentMetaField label={tDetailForm('overhead_sum')}>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={overheadMajor}
                  placeholder="0"
                  onChange={(e) => setOverheadMajor(e.target.value)}
                  data-test-id="field-overhead-sum"
                />
              </DocumentMetaField>
              <DocumentMetaField label={tDetailForm('overhead_distribution')}>
                <NativeSelect
                  value={overheadDistribution}
                  onChange={(e) =>
                    setOverheadDistribution(
                      e.target.value as 'WEIGHT' | 'PRICE' | 'VOLUME' | 'QUANTITY',
                    )
                  }
                  data-test-id="field-overhead-distribution"
                  disabled={!(Number(overheadMajor) > 0)}
                >
                  <option value="WEIGHT">{tDetailForm('overhead_by_weight')}</option>
                  <option value="PRICE">{tDetailForm('overhead_by_price')}</option>
                  <option value="VOLUME">{tDetailForm('overhead_by_volume')}</option>
                  <option value="QUANTITY">{tDetailForm('overhead_by_quantity')}</option>
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
            onAdd={addPosition}
            renderNameCell={renderPositionNameCell}
            selectedIds={selectedRowIds}
            onSelectionChange={setSelectedRowIds}
          />

          <div>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={tFields('description')}
              rows={3}
              data-test-id="field-description"
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
        testId="move-new-page"
        documentTypeLabel={tDetailTitles('move')}
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
        onSave={() => {
          setError(null);
          createMut.mutate();
        }}
        saving={createMut.isPending}
        onClose={() => router.push('/moves')}
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
        open={openPicker === 'sourceStore'}
        onClose={() => setOpenPicker(null)}
        title={tFields('store_from')}
        fetcher={storeFetcher}
        onSelect={(item) => {
          setSourceStoreId(item.id);
          setSourceStoreLabel(String(item.primary));
        }}
      />
      <CatalogPicker
        open={openPicker === 'destStore'}
        onClose={() => setOpenPicker(null)}
        title={tFields('store_to')}
        fetcher={storeFetcher}
        onSelect={(item) => {
          setDestinationStoreId(item.id);
          setDestinationStoreLabel(String(item.primary));
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
          });
        }}
      />
    </>
  );
}
