'use client';

/**
 * /inventories/new — moysklad-parity «Инвентаризация» editor (owner report
 * 2026-07-14, user screenshots #inventoryaddresswarehouse/edit?new):
 *
 * - Opened from the list's «Выберите склад для инвентаризации» modal with
 *   ?warehouseId=… — the «Склад» field arrives prefilled and LOCKED (an
 *   inventory is fixed to its warehouse at creation, like moysklad).
 * - Header meta = Организация + Склад only (no Проект/Внешний код/Комментарий
 *   fields — moysklad's inventory editor doesn't show them; the Комментарий
 *   textarea lives at the bottom of the positions block).
 * - Positions block = InventoryPositionsPanel in 'new' mode: the
 *   [Остатки по складу | Остатки по ячейке] toggle, Фильтр, search and the
 *   empty grid — but NO add-position bar (moysklad shows it after first save).
 * - Toolbar dropdowns are ALIVE (band 2.2): Изменить = Удалить (grey);
 *   Создать документ = Списание · Оприходование (present in moysklad — user
 *   screenshot №6 — each saves the inventory first, then creates + opens the
 *   downstream doc); Печать = Инвентаризация · Комплект… · Настроить… ·
 *   «Запросить форму» promo; Отправить = Инвентаризация · Комплект…
 */

import { InventoryPositionsPanel } from '@/components/inventories/inventory-positions-panel';
import { usePrintTemplatesManager } from '@/components/print/print-templates-provider';
import { useDocumentEditorLabels } from '@/hooks/use-document-editor-labels';
import { defaultDocStore, useUserDefaults } from '@/hooks/use-user-defaults';
import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';
import {
  CatalogPicker,
  CatalogPickerField,
  DocumentEditor,
  DocumentMetaField,
  DocumentMetaPanel,
  DocumentMetaRow,
  DocumentTabs,
  type PickerItem,
} from '@moysklad/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

interface RefItem {
  id: string;
  name: string;
  legalTitle?: string | null;
  code?: string | null;
}

export default function NewInventoryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const t = useTranslations('pages.inventories');
  const tErrors = useTranslations('errors');
  const tFields = useTranslations('fields');
  const tForm = useTranslations('form');
  const tDetailTabs = useTranslations('detail_tabs');
  const tDetailTitles = useTranslations('detail_titles');
  const tDetailHeader = useTranslations('detail_header');
  const tStates = useTranslations('states.inventory');
  const tBulk = useTranslations('bulk_actions');
  const tPrint = useTranslations('print_menu');
  const docEditorLabels = useDocumentEditorLabels();
  const { openTemplates } = usePrintTemplatesManager();

  // «Выберите склад для инвентаризации» modal passes the picked warehouse —
  // the Склад field is then LOCKED (moysklad: the editor shows it greyed).
  const warehouseParam = searchParams.get('warehouseId');

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
  const [applicable, setApplicable] = useState(true);

  // Meta state
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [organizationLabel, setOrganizationLabel] = useState<string>('');
  const [storeId, setStoreId] = useState<string | null>(null);
  const [storeLabel, setStoreLabel] = useState<string>('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [openPicker, setOpenPicker] = useState<null | 'org' | 'store'>(null);

  const storeLocked = !!warehouseParam;

  // Auto-fill: Организация from user defaults (first-item fallback); Склад from
  // the ?warehouseId param (the list modal), else defaults/first store.
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
      const fromParam = warehouseParam
        ? storesData.items.find((s) => s.id === warehouseParam)
        : undefined;
      if (fromParam) {
        setStoreId(fromParam.id);
        setStoreLabel(fromParam.name);
      } else {
        const store = defaultDocStore(us, storesData.items);
        if (store) {
          setStoreId(store.id);
          setStoreLabel(store.name);
        }
      }
    }
  }, [
    orgsData,
    storesData,
    userDefaults.data,
    userDefaults.isLoading,
    organizationId,
    storeId,
    warehouseParam,
  ]);

  // moysklad «Печать»/«Создать документ» on a NEW doc: silently save first,
  // then act — the intent lives on a ref so createMut.onSuccess knows what
  // triggered the save (mirrors enters/new 5fb75461 · moves b91610e1).
  const afterSaveRef = useRef<'view' | 'print' | 'loss' | 'enter'>('view');
  const createMut = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error(tErrors('select_organization'));
      if (!storeId) throw new Error(tErrors('select_store'));
      const payload = {
        organizationId,
        storeId,
        moment: docDate ? new Date(docDate).toISOString() : undefined,
        description: description || undefined,
        // moysklad: positions are added on the SAVED editor (the /new grid has
        // no add bar) — a new inventory is always created empty.
        positions: [],
      };
      return api.post<{ id: string }>('/inventories', payload);
    },
    onSuccess: async (created) => {
      const intent = afterSaveRef.current;
      afterSaveRef.current = 'view';
      if (intent === 'print') {
        window.open(`/print/inventory/${created.id}`, '_blank');
      }
      if (intent === 'loss' || intent === 'enter') {
        // «Создать документ» → Списание / Оприходование: create the (empty)
        // downstream doc for the same org+store and open ITS editor.
        try {
          const downstream = await api.post<{ id: string }>(
            intent === 'loss' ? '/losses' : '/enters',
            { organizationId, storeId, positions: [] },
          );
          router.push(intent === 'loss' ? `/losses/${downstream.id}` : `/enters/${downstream.id}`);
          return;
        } catch {
          // Fall through to the inventory detail page — the inventory itself
          // was saved; the user can retry from there.
        }
      }
      router.push(`/inventories/${created.id}`);
    },
    onError: (err: Error) => {
      afterSaveRef.current = 'view';
      setError(err.message);
    },
  });

  const saveWithIntent = (intent: 'view' | 'print' | 'loss' | 'enter') => {
    setError(null);
    afterSaveRef.current = intent;
    createMut.mutate();
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

  const tabs = [
    {
      key: 'main',
      label: tDetailTabs('main'),
      content: (
        <div className="space-y-4">
          <DocumentMetaPanel compact>
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
                  testId="field-organization"
                />
              </DocumentMetaField>
              <DocumentMetaField label={tFields('store')} required>
                <CatalogPickerField
                  value={storeId ? { id: storeId, label: storeLabel } : null}
                  onPick={() => !storeLocked && setOpenPicker('store')}
                  inlineFetcher={storeLocked ? undefined : storeFetcher}
                  onInlineSelect={(item) => {
                    setStoreId(item.id);
                    setStoreLabel(String(item.primary));
                  }}
                  onClear={
                    storeLocked
                      ? undefined
                      : () => {
                          setStoreId(null);
                          setStoreLabel('');
                        }
                  }
                  disabled={storeLocked}
                  testId="field-store"
                />
              </DocumentMetaField>
            </DocumentMetaRow>
          </DocumentMetaPanel>

          {/* Band 3 — the moysklad positions block: [Остатки по складу | Остатки
              по ячейке] toggle · Фильтр · search · grid · Комментарий · Итого.
              'new' mode = no add bar (moysklad shows it only after save). */}
          <InventoryPositionsPanel
            mode="new"
            storeId={storeId}
            rows={[]}
            description={description}
            onDescriptionChange={setDescription}
            testId="inventory-new-positions"
          />
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
        onSave={() => saveWithIntent('view')}
        saving={createMut.isPending}
        onClose={() => router.push('/inventories')}
        // moysklad-parity toolbar on a NEW «Инвентаризация» (owner screenshots
        // 2026-07-14): every dropdown OPENS with its items; actionable items
        // save the doc first. «Удалить» is greyed (nothing to delete yet).
        modifyMenu={[{ label: tBulk('delete'), disabled: true, destructive: true }]}
        // «Создать документ» = Списание · Оприходование (user screenshot №6 —
        // moysklad DOES show it on the inventory editor; the owner report's
        // band 2.3 asked to drop it, but the ground-truth screenshot wins).
        createDocMenu={[
          { label: tDetailTitles('loss'), onClick: () => saveWithIntent('loss') },
          { label: tDetailTitles('enter'), onClick: () => saveWithIntent('enter') },
        ]}
        printMenu={[
          {
            // «Инвентаризация» — silently save, then open the print form in a
            // NEW TAB (user presses «Печать» there; no auto-print).
            label: tDetailTitles('inventory'),
            onClick: () => saveWithIntent('print'),
          },
          {
            label: tPrint('set'),
            onClick: () => saveWithIntent('view'),
          },
          {
            // «Настроить…» — open the print-template manager slide-over (no save).
            label: tPrint('configure'),
            onClick: () => openTemplates('inventory'),
          },
          {
            // «Запросить форму» — moysklad's non-interactive promo footer.
            testId: 'print-request-form',
            content: (
              <div className="mt-1 border-[var(--ms-border-default)] border-t px-2 pt-2 pb-1">
                <div className="font-semibold text-[13px] text-[var(--ms-text-primary)]">
                  {tPrint('request_form')}
                </div>
                <p className="mt-0.5 max-w-[230px] text-[11px] text-[var(--ms-text-muted)] leading-snug">
                  {tPrint('request_form_description')}
                </p>
                <button
                  type="button"
                  onClick={() => window.open('/help/inventories', '_blank')}
                  className="mt-2 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] px-3 py-1 text-[11px] text-[var(--ms-text-primary)] hover:bg-[var(--ms-bg-muted)]"
                  data-test-id="print-request-form-btn"
                >
                  {tPrint('request_form_cta')}
                </button>
              </div>
            ),
          },
        ]}
        // «Отправить» = Инвентаризация · Комплект… (save → detail).
        sendMenu={[tDetailTitles('inventory'), tPrint('set')].map((label) => ({
          label,
          onClick: () => saveWithIntent('view'),
        }))}
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
    </>
  );
}
