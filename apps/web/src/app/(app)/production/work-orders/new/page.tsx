'use client';

/**
 * /production/work-orders/new — moysklad-parity «Сборка / Производство» editor.
 *
 * No counterparty. MetaPanel: Технологическая карта (BOM) | Склад / Кол-во / Дата завершения.
 * Two informational tables (input materials + output products) populated from the BOM.
 */

import { useDocumentEditorLabels } from '@/hooks/use-document-editor-labels';
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
import { useState } from 'react';
interface RefItem {
  id: string;
  name: string;
}

interface BomItem {
  id: string;
  name: string;
  product: { id: string; name: string };
  materials?: Array<{ productId: string; productName: string; qty: string; uom: string | null }>;
}

export default function NewWorkOrderPage() {
  const router = useRouter();
  const { user } = useAuth();
  const t = useTranslations('pages.work_orders');
  const tFields = useTranslations('fields');
  const tForm = useTranslations('form');
  const tDetailTabs = useTranslations('detail_tabs');
  const tDetailTitles = useTranslations('detail_titles');
  const tDetailHeader = useTranslations('detail_header');
  const tStates = useTranslations('states.work_order');
  const docEditorLabels = useDocumentEditorLabels();

  // FSM mirrors work-orders/[id]; status is decorative on /new (API creates a draft).
  const STATUS_OPTIONS = [
    { value: 'draft', label: tStates('draft'), color: '#e8eef5' },
    { value: 'in_progress', label: tStates('in_progress'), color: '#fff3cd' },
    { value: 'completed', label: tStates('completed'), color: '#cfe8d3' },
    { value: 'cancelled', label: tStates('cancelled'), color: '#f4d4d4' },
  ];

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
  const [bomId, setBomId] = useState<string | null>(null);
  const [bomLabel, setBomLabel] = useState('');
  const [bomRaw, setBomRaw] = useState<BomItem | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [storeLabel, setStoreLabel] = useState('');
  const [plannedQty, setPlannedQty] = useState('1');
  const [plannedStartAt, setPlannedStartAt] = useState('');
  const [plannedEndAt, setPlannedEndAt] = useState('');
  const [openPicker, setOpenPicker] = useState<null | 'bom' | 'store'>(null);
  const [error, setError] = useState<string | null>(null);

  const bomFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: BomItem[] }>(`/boms?search=${encodeURIComponent(s)}&limit=50`);
    return d.items.map((b) => ({
      id: b.id,
      primary: b.name,
      secondary: b.product.name,
      raw: b,
    }));
  };

  const storeFetcher = async (s: string): Promise<PickerItem[]> => {
    return (storesData?.items ?? [])
      .filter((st) => st.name.toLowerCase().includes(s.toLowerCase()))
      .map((st) => ({ id: st.id, primary: st.name }));
  };

  const createMut = useMutation({
    mutationFn: async () => {
      if (!bomId) throw new Error(t('err_bom'));
      if (!storeId) throw new Error(t('err_store'));
      if (Number(plannedQty) <= 0) throw new Error(t('err_quantity'));

      const result = await api.post<{ id: string }>('/work-orders', {
        bomId,
        storeId,
        plannedQty,
        // «Дата документа» — forward the operator's chosen header date. Before
        // this the editable docDate control was bound but silently dropped here,
        // so every WO was dated server-now() regardless of what was entered.
        moment: docDate ? new Date(docDate).toISOString() : undefined,
        plannedStartAt: plannedStartAt ? new Date(plannedStartAt).toISOString() : undefined,
        plannedEndAt: plannedEndAt ? new Date(plannedEndAt).toISOString() : undefined,
      });
      return result;
    },
    onSuccess: (created) => router.push(`/production/work-orders/${created.id}`),
    onError: (e: Error) => setError(e.message),
  });

  // BOM-driven informational tables (readonly on /new — positions come from the BOM)
  const qty = Number(plannedQty) || 1;

  const materialsTable =
    bomRaw?.materials && bomRaw.materials.length > 0 ? (
      <div className="space-y-2">
        <h3 className="font-medium text-sm">{t('materials_section')}</h3>
        <div className="overflow-x-auto rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-[var(--ms-border-default)] border-b bg-[var(--ms-bg-muted)] font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                <th className="px-3 py-2 text-left">{t('col_material')}</th>
                <th className="px-3 py-2 text-right">{t('col_norm')}</th>
                <th className="px-3 py-2 text-right">{t('col_required')}</th>
                <th className="px-3 py-2 text-left">{tFields('uom')}</th>
              </tr>
            </thead>
            <tbody>
              {bomRaw.materials.map((m) => {
                const norm = Number(m.qty);
                const required = norm * qty;
                return (
                  <tr
                    key={m.productId}
                    className="border-[var(--ms-border-default)] border-b last:border-0"
                  >
                    <td className="px-3 py-2">{m.productName}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{norm}</td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">{required}</td>
                    <td className="px-3 py-2 text-[var(--ms-text-muted)]">{m.uom ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    ) : bomId ? (
      <div className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] border-dashed py-4 text-center text-[var(--ms-text-muted)] text-sm">
        {t('bom_loading')}
      </div>
    ) : null;

  const outputTable = bomRaw ? (
    <div className="space-y-2">
      <h3 className="font-medium text-sm">{t('output_section')}</h3>
      <div className="overflow-x-auto rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-[var(--ms-border-default)] border-b bg-[var(--ms-bg-muted)] font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
              <th className="px-3 py-2 text-left">{t('col_product')}</th>
              <th className="px-3 py-2 text-right">{tFields('quantity')}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="px-3 py-2">{bomRaw.product.name}</td>
              <td className="px-3 py-2 text-right font-medium tabular-nums">{qty}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  ) : null;

  const tabs = [
    {
      key: 'main',
      label: tDetailTabs('main'),
      content: (
        <div className="space-y-4">
          <DocumentMetaPanel>
            <DocumentMetaRow>
              <DocumentMetaField label={t('bom')} required>
                <CatalogPickerField
                  value={bomId ? { id: bomId, label: bomLabel } : null}
                  placeholder={t('select_bom')}
                  onPick={() => setOpenPicker('bom')}
                  onClear={() => {
                    setBomId(null);
                    setBomLabel('');
                    setBomRaw(null);
                  }}
                />
              </DocumentMetaField>
              <DocumentMetaField label={t('store')} required>
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
              <DocumentMetaField label={t('planned_qty')} required>
                <Input
                  value={plannedQty}
                  onChange={(e) => setPlannedQty(e.target.value)}
                  inputMode="decimal"
                  className="text-right"
                  data-test-id="field-planned-qty"
                />
              </DocumentMetaField>
              <DocumentMetaField label={t('planned_start_at')}>
                <Input
                  type="date"
                  value={plannedStartAt}
                  onChange={(e) => setPlannedStartAt(e.target.value)}
                  data-test-id="field-planned-start-at"
                />
              </DocumentMetaField>
              <DocumentMetaField label={t('planned_end_at')}>
                <Input
                  type="date"
                  value={plannedEndAt}
                  onChange={(e) => setPlannedEndAt(e.target.value)}
                  data-test-id="field-planned-end-at"
                />
              </DocumentMetaField>
            </DocumentMetaRow>
          </DocumentMetaPanel>

          {materialsTable}
          {outputTable}

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
        testId="work-order-new-page"
        documentTypeLabel={tDetailTitles('work_order')}
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
        onClose={() => router.push('/production/work-orders')}
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
        open={openPicker === 'bom'}
        onClose={() => setOpenPicker(null)}
        title={t('bom_picker_title')}
        fetcher={bomFetcher}
        onSelect={(item) => {
          setBomId(item.id);
          setBomLabel(String(item.primary));
          setBomRaw((item as PickerItem & { raw?: BomItem }).raw ?? null);
          setOpenPicker(null);
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
          setOpenPicker(null);
        }}
      />
    </>
  );
}
