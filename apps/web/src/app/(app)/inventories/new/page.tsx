'use client';

/**
 * /inventories/new — moysklad-parity «Инвентаризация» editor.
 *
 * No counterparty. Special position table: name | expected (computed) | actual (input) | surplus | shortage | menu.
 * Totals: surplus_count + shortage_count.
 */

import { useDocumentEditorLabels } from '@/hooks/use-document-editor-labels';
import { useUserDefaults } from '@/hooks/use-user-defaults';
import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';
import {
  Button,
  CatalogPicker,
  CatalogPickerField,
  DocumentDisclosurePanel,
  DocumentEditor,
  DocumentMetaField,
  DocumentMetaPanel,
  DocumentMetaRow,
  DocumentTabs,
  Icons,
  Input,
  type PickerItem,
} from '@moysklad/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
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
}

interface PositionRow {
  _uid: string;
  assortmentId: string | null;
  productLabel: string;
  productUom: string | null;
  actualQty: string;
}

function uid() {
  return Math.random().toString(36).slice(2);
}

export default function NewInventoryPage() {
  const router = useRouter();
  const { user } = useAuth();
  const t = useTranslations('pages.inventories');
  const tErrors = useTranslations('errors');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tForm = useTranslations('form');
  const tDetailForm = useTranslations('detail_form');
  const tDetailTabs = useTranslations('detail_tabs');
  const tDetailTitles = useTranslations('detail_titles');
  const tDetailHeader = useTranslations('detail_header');
  const tStates = useTranslations('states.inventory');
  const docEditorLabels = useDocumentEditorLabels();

  // moysklad inventory FSM = draft / posted / cancelled (mirrors inventories/[id]).
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

  // Meta state
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [organizationLabel, setOrganizationLabel] = useState<string>('');
  const [storeId, setStoreId] = useState<string | null>(null);
  const [storeLabel, setStoreLabel] = useState<string>('');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectLabel, setProjectLabel] = useState('');
  const [externalCode, setExternalCode] = useState('');
  const [description, setDescription] = useState('');
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [openPicker, setOpenPicker] = useState<
    null | 'org' | 'store' | 'project' | { kind: 'product'; rowUid: string }
  >(null);

  // Auto-fill from the user's «Значения по умолчанию» (moysklad applies the user
  // defaults to every new document). Inventory doc — Организация/Склад=default with
  // a first-item fallback, Проект=defaultProject (no counterparty on this doc).
  const userDefaults = useUserDefaults();
  const defaultsAppliedRef = useRef(false);
  useEffect(() => {
    if (defaultsAppliedRef.current) return;
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

  // Live expected qty from Stock
  const assortmentIds = useMemo(
    () => positions.map((p) => p.assortmentId).filter((id): id is string => !!id),
    [positions],
  );
  const { data: stockData } = useQuery<{ items: Array<{ assortmentId: string; qty: string }> }>({
    queryKey: ['stocks', storeId, assortmentIds.join(',')],
    queryFn: () =>
      api.get(
        `/stocks?storeId=${storeId}&assortmentIds=${encodeURIComponent(assortmentIds.join(','))}`,
      ),
    enabled: !!storeId && assortmentIds.length > 0,
  });
  const stockMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of stockData?.items ?? []) m.set(r.assortmentId, r.qty);
    return m;
  }, [stockData]);

  const addPosition = () => {
    setPositions((ps) => [
      ...ps,
      { _uid: uid(), assortmentId: null, productLabel: '', productUom: null, actualQty: '0' },
    ]);
  };

  const updatePosition = (rowUid: string, patch: Partial<PositionRow>) => {
    setPositions((ps) => ps.map((p) => (p._uid === rowUid ? { ...p, ...patch } : p)));
  };

  const removePosition = (rowUid: string) => {
    setPositions((ps) => ps.filter((p) => p._uid !== rowUid));
  };

  // Inventory totals: surplus (actual > expected) and shortage (actual < expected)
  const { surplusCount, shortageCount } = useMemo(() => {
    let surplus = 0;
    let shortage = 0;
    for (const p of positions) {
      const expectedQty = p.assortmentId ? stockMap.get(p.assortmentId) : undefined;
      const expectedNum = expectedQty !== undefined ? Number(expectedQty) : 0;
      const actualNum = Number(p.actualQty || '0');
      const diff = actualNum - expectedNum;
      if (diff > 0) surplus++;
      else if (diff < 0) shortage++;
    }
    return { surplusCount: surplus, shortageCount: shortage };
  }, [positions, stockMap]);

  const createMut = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error(tErrors('select_organization'));
      if (!storeId) throw new Error(tErrors('select_store'));
      if (positions.length === 0) throw new Error(tErrors('at_least_one_position'));
      for (const [i, p] of positions.entries()) {
        if (!p.assortmentId) throw new Error(tErrors('position_select_product', { n: i + 1 }));
        if (Number(p.actualQty) < 0)
          throw new Error(tErrors('position_quantity_non_negative', { n: i + 1 }));
      }
      const payload = {
        organizationId,
        storeId,
        moment: docDate ? new Date(docDate).toISOString() : undefined,
        ...(projectId ? { projectId } : {}),
        ...(externalCode ? { externalCode } : {}),
        description: description || undefined,
        positions: positions.map((p) => ({
          assortmentKind: 'product',
          // biome-ignore lint/style/noNonNullAssertion: validated non-null in the loop above before payload build
          assortmentId: p.assortmentId!,
          actualQty: p.actualQty,
        })),
      };
      return api.post<{ id: string }>('/inventories', payload);
    },
    onSuccess: (created) => router.push(`/inventories/${created.id}`),
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

  // Inventory-specific position table (no PositionTable component — custom columns)
  const positionTable = (
    <div className="space-y-3">
      {positions.length === 0 ? (
        <div className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] border-dashed py-6 text-center text-[var(--ms-text-muted)] text-sm">
          {tForm('positions_empty')}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-[var(--ms-border-default)] border-b font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                <th className="py-2 pl-2 text-left">{tFields('product')}</th>
                <th className="px-2 py-2 text-right">{t('expected_qty')}</th>
                <th className="px-2 py-2 text-right">{t('actual_qty')}</th>
                <th className="px-2 py-2 text-right">{t('surplus_qty')}</th>
                <th className="px-2 py-2 text-right">{t('shortage_qty')}</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => {
                const expectedQty = p.assortmentId ? stockMap.get(p.assortmentId) : undefined;
                const expectedNum = expectedQty !== undefined ? Number(expectedQty) : undefined;
                const actualNum = Number(p.actualQty || '0');
                const variance = expectedNum !== undefined ? actualNum - expectedNum : undefined;
                const surplus = variance !== undefined && variance > 0 ? variance : undefined;
                const shortage =
                  variance !== undefined && variance < 0 ? Math.abs(variance) : undefined;
                return (
                  <tr
                    key={p._uid}
                    className="border-[var(--ms-border-default)] border-b last:border-0"
                    data-test-id={`position-row-${p._uid}`}
                  >
                    <td className="py-2 pl-2">
                      <CatalogPickerField
                        value={
                          p.assortmentId ? { id: p.assortmentId, label: p.productLabel } : null
                        }
                        placeholder={tForm('select_product')}
                        onPick={() => setOpenPicker({ kind: 'product', rowUid: p._uid })}
                        onClear={() =>
                          updatePosition(p._uid, {
                            assortmentId: null,
                            productLabel: '',
                            productUom: null,
                          })
                        }
                      />
                    </td>
                    <td className="px-2 py-2 text-right text-[var(--ms-text-muted)] tabular-nums">
                      {expectedNum !== undefined ? `${expectedNum} ${p.productUom ?? ''}` : '—'}
                    </td>
                    <td className="px-2 py-2">
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={p.actualQty}
                        onChange={(e) => updatePosition(p._uid, { actualQty: e.target.value })}
                        className="text-right"
                        data-test-id={`actual-${p._uid}`}
                      />
                    </td>
                    <td className="px-2 py-2 text-right font-medium text-[var(--ms-text-success)] tabular-nums">
                      {surplus !== undefined ? `+${surplus} ${p.productUom ?? ''}` : '—'}
                    </td>
                    <td className="px-2 py-2 text-right font-medium text-[var(--ms-text-destructive)] tabular-nums">
                      {shortage !== undefined ? `-${shortage} ${p.productUom ?? ''}` : '—'}
                    </td>
                    <td className="py-2 pr-2">
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => removePosition(p._uid)}
                        aria-label={tCommon('delete')}
                      >
                        <Icons.close className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Button type="button" variant="secondary" onClick={addPosition} data-test-id="add-position">
        <Icons.create className="h-4 w-4" />
        {tForm('add_position')}
      </Button>
    </div>
  );

  // Inventory totals summary
  const totalsSummary = positions.length > 0 && (
    <div className="flex justify-end">
      <div className="flex gap-6 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] px-6 py-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-[var(--ms-text-muted)]">{tFields('surplus_count')}:</span>
          <span
            className="font-semibold text-[var(--ms-text-success)]"
            data-test-id="totals-surplus"
          >
            {surplusCount}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[var(--ms-text-muted)]">{tFields('shortage_count')}:</span>
          <span
            className="font-semibold text-[var(--ms-text-destructive)]"
            data-test-id="totals-shortage"
          >
            {shortageCount}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[var(--ms-text-muted)]">{tForm('section_positions')}:</span>
          <span className="font-semibold">{positions.length}</span>
        </div>
      </div>
    </div>
  );

  const tabs = [
    {
      key: 'main',
      label: tDetailTabs('main'),
      content: (
        <div className="space-y-4">
          <DocumentMetaPanel>
            <DocumentMetaRow>
              <DocumentMetaField label={tFields('store')} required>
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
              <DocumentMetaField label={tFields('description')}>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  data-test-id="field-description"
                />
              </DocumentMetaField>
            </DocumentMetaRow>

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

            <DocumentMetaRow>
              <DocumentMetaField label={tDetailForm('external_code')}>
                <Input
                  value={externalCode}
                  onChange={(e) => setExternalCode(e.target.value)}
                  data-test-id="field-external-code"
                />
              </DocumentMetaField>
            </DocumentMetaRow>
          </DocumentMetaPanel>

          {positionTable}
          {totalsSummary}

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
        testId="inventory-new-page"
        documentTypeLabel={tDetailTitles('inventory')}
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
        onClose={() => router.push('/inventories')}
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
          });
        }}
      />
    </>
  );
}
