'use client';

/**
 * /internal-orders/new — Yangi ichki buyurtma editor.
 *
 * Key differences vs. purchase-orders/new:
 *  - No agent (counterparty) — purely internal document
 *  - No bank account sub-line
 *  - No currency rate adjustment — fixed UZS
 *  - No discount column on positions
 *  - movedQuantity (fulfilled qty) is a read-only server field; irrelevant on create
 *  - deliveryPlannedMoment is date-only (no time component)
 *  - Positions: replace-all semantics on POST
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
  type PickerItem,
  PositionInlineAdd,
  PositionTable,
  type PositionTableColumnConfig,
  Textarea,
} from '@moysklad/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
interface RefItem {
  id: string;
  name: string;
  code?: string | null;
}

interface ProductItem {
  id: string;
  name: string;
  code: string | null;
  uom: string | null;
  /** sellPrice for reference only; InternalOrder uses priceMinor as indicative */
  sellPrice?: { value: string } | null;
  vat: number | null;
}

interface NewPositionRow extends DocPositionRow {
  assortmentId: string | null;
}

function uid(): string {
  return Math.random().toString(36).slice(2);
}

/**
 * Per-line totals. No discount on InternalOrder — purely quantity × price.
 * BigInt-safe so page-level reduce stays exact.
 */
function computeLineTotal(
  p: NewPositionRow,
  vatIncluded: boolean,
): { net: bigint; vat: bigint; gross: bigint } {
  // Internal orders carry no discount — delegate to the shared canonical
  // `computePositionTotal` (discount fixed to 0) so the «Итого» footer agrees
  // with the per-row PositionTable cells + the stored total, and a fractional
  // «НДС» no longer throws a BigInt RangeError (the old `BigInt(Number(p.vat))`).
  try {
    const { totalMinor, vatAmountMinor, baseMinor } = computePositionTotal(
      {
        quantity: p.quantity || '0',
        priceMinor: p.priceMinor || '0',
        discount: '0',
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

/**
 * Minimal column set for InternalOrder — no discount, no vat column (still
 * tracked in data but not shown per task spec). movedQuantity is shown
 * only on the detail page (it's server-derived from linked Move docs).
 */
const POSITION_COLUMNS: PositionTableColumnConfig[] = [
  { key: 'select' },
  { key: 'index' },
  { key: 'name' },
  { key: 'quantity' },
  { key: 'price' },
  { key: 'amount' },
  { key: 'menu' },
];

export default function NewInternalOrderPage() {
  const router = useRouter();
  const { user } = useAuth();
  const t = useTranslations('pages.internal_order');
  const tErrors = useTranslations('errors');
  const tFields = useTranslations('fields');
  const tForm = useTranslations('form');
  const tDetailForm = useTranslations('detail_form');
  const tDetailTabs = useTranslations('detail_tabs');
  const tDetailTitles = useTranslations('detail_titles');
  const tDetailHeader = useTranslations('detail_header');
  const tStates = useTranslations('states.internal_order');
  const docEditorLabels = useDocumentEditorLabels();

  // moysklad internal-order FSM = draft / posted / cancelled (mirrors internal-orders/[id]).
  // Status is decorative on /new (not sent on create — API always creates a draft).
  const STATUS_OPTIONS = [
    { value: 'draft', label: tStates('draft'), color: '#e8eef5' },
    { value: 'posted', label: tStates('posted'), color: '#cfe8d3' },
    { value: 'cancelled', label: tStates('cancelled'), color: '#f4d4d4' },
  ];

  const { data: orgsData } = useQuery<{ items: RefItem[] }>({
    queryKey: ['organizations'],
    queryFn: () => api.get('/organizations'),
  });
  const { data: storesData } = useQuery<{ items: RefItem[] }>({
    queryKey: ['stores'],
    queryFn: () => api.get('/stores'),
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

  // Meta state — no agent, no contract, no bank account
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [organizationLabel, setOrganizationLabel] = useState('');
  const [storeId, setStoreId] = useState<string | null>(null);
  const [storeLabel, setStoreLabel] = useState('');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectLabel, setProjectLabel] = useState('');
  // deliveryPlannedMoment: date-only (no time), nullable
  const [deliveryDate, setDeliveryDate] = useState('');
  const [description, setDescription] = useState('');
  const [externalCode, setExternalCode] = useState('');
  const [externalCodeVisible, setExternalCodeVisible] = useState(false);

  // VAT toggles
  const [vatEnabled, setVatEnabled] = useState(true);
  const [vatIncluded, setVatIncluded] = useState(false);

  // Positions
  const [positions, setPositions] = useState<NewPositionRow[]>([]);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());

  const [openPicker, setOpenPicker] = useState<
    null | 'org' | 'store' | 'project' | { kind: 'product'; rowUid: string }
  >(null);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill from the user's «Значения по умолчанию» once the reference lists +
  // settings settle (moysklad applies the user defaults to EVERY new document).
  // Stock doc — no counterparty; Организация/Склад fall back to the first list
  // item, Проект only from an explicit default.
  const userDefaults = useUserDefaults();
  const defaultsAppliedRef = useRef(false);
  useEffect(() => {
    if (defaultsAppliedRef.current) return;
    if (!orgsData || !storesData) return;
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
    if (!storeId) {
      if (us?.defaultStore) {
        setStoreId(us.defaultStore.id);
        setStoreLabel(us.defaultStore.name);
      } else if (storesData.items[0]) {
        setStoreId(storesData.items[0].id);
        setStoreLabel(storesData.items[0].name);
      }
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
    projectId,
  ]);

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
      if (!organizationId) throw new Error(tErrors('select_organization'));
      if (!storeId) throw new Error(tErrors('select_store'));
      if (positions.length === 0) throw new Error(tErrors('at_least_one_position'));
      for (const [i, p] of positions.entries()) {
        if (!p.assortmentId) throw new Error(tErrors('position_select_product', { n: i + 1 }));
        if (Number(p.quantity) <= 0)
          throw new Error(tErrors('position_quantity_positive', { n: i + 1 }));
      }
      const payload = {
        organizationId,
        storeId,
        ...(projectId ? { projectId } : {}),
        moment: docDate ? new Date(docDate).toISOString() : undefined,
        ...(deliveryDate ? { deliveryPlannedMoment: deliveryDate } : {}),
        ...(docNumber ? { name: docNumber } : {}),
        applicable,
        currency: 'UZS',
        rateValue: '100000000',
        vatEnabled,
        vatIncluded,
        description: description || undefined,
        externalCode: externalCode || undefined,
        positions: positions.map((p, idx) => ({
          assortmentKind: 'product' as const,
          // biome-ignore lint/style/noNonNullAssertion: validated above — positions with no assortmentId throw before this
          assortmentId: p.assortmentId!,
          quantity: p.quantity,
          priceMinor: p.priceMinor || undefined,
          vat: p.vat ? Number(p.vat) : undefined,
          vatEnabled: p.vatEnabled,
          // position index — 1-based, in submission order
          position: idx + 1,
        })),
      };
      return api.post<{ id: string }>('/internal-orders', payload);
    },
    onSuccess: (created) => router.push(`/internal-orders/${created.id}`),
    onError: (err: Error) => setError(err.message),
  });

  // Fetchers
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
    return d.items.map((o) => ({ id: o.id, primary: o.name }));
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
              <DocumentMetaField label={t('destination_store')} required>
                <CatalogPickerField
                  value={storeId ? { id: storeId, label: storeLabel } : null}
                  onPick={() => setOpenPicker('store')}
                  inlineFetcher={storeFetcher}
                  onInlineSelect={(item) => {
                    setStoreId(item.id);
                    setStoreLabel(String(item.primary));
                  }}
                  onClear={() => {
                    setStoreId(null);
                    setStoreLabel('');
                  }}
                />
              </DocumentMetaField>
            </DocumentMetaRow>

            <DocumentMetaRow>
              <DocumentMetaField label={t('delivery_planned')}>
                <Input
                  type="date"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                  data-test-id="field-delivery-date"
                />
              </DocumentMetaField>
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
                      quantity: '1',
                      priceMinor: '0',
                      discount: '0',
                      vat: raw?.vat != null ? String(raw.vat) : '0',
                      vatEnabled: false,
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
              />
            }
          />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto]">
            <div className="space-y-2">
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={tFields('description')}
                rows={3}
                data-test-id="field-description"
              />
              {externalCodeVisible ? (
                <div className="flex items-center gap-2">
                  <label htmlFor="external-code" className="text-[var(--ms-text-muted)] text-sm">
                    {tDetailForm('external_code')}:
                  </label>
                  <Input
                    id="external-code"
                    type="text"
                    value={externalCode}
                    onChange={(e) => setExternalCode(e.target.value)}
                    className="flex-1"
                    data-test-id="field-external-code"
                  />
                </div>
              ) : (
                <Button
                  type="button"
                  variant="link"
                  onClick={() => setExternalCodeVisible(true)}
                  className="h-auto px-0 font-normal text-xs"
                  data-test-id="show-external-code"
                >
                  {tDetailForm('external_code')}
                </Button>
              )}
            </div>
            <DocumentTotalsPanel
              subtotalMinor={totals.net}
              vatMinor={totals.vat}
              totalMinor={totals.gross}
              currency="UZS"
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
        testId="internal-order-new-page"
        documentTypeLabel={tDetailTitles('internal_order')}
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
        onClose={() => router.push('/internal-orders')}
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
            priceMinor: '0',
            vat: raw?.vat != null ? String(raw.vat) : '0',
          });
        }}
      />
    </>
  );
}
