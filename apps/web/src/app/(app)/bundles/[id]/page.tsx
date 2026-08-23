'use client';

/**
 * /bundles/[id] — inline-edit detail page (moysklad-parity).
 *
 * Mirrors /bundles/new layout. The bundle Product (name, code, description,
 * vat, salePrice) is updated via PATCH /products/:id; the component list is
 * replaced atomically via PUT /bundles/:id/components.
 */

import { DetailHeader, DetailToolbar } from '@/components/document-detail';
import { DocumentTabs } from '@/components/document-tabs';
import { useApiMutation } from '@/hooks/use-api-mutation';
import { useConflictReload } from '@/hooks/use-conflict-reload';
import { useDestructiveMutation } from '@/hooks/use-destructive-mutation';
import { useDetailNavigation } from '@/hooks/use-detail-navigation';
import { api } from '@/lib/api-client';
import { archivedTone } from '@/lib/archived-tone';
import { isOptimisticConflict } from '@/lib/optimistic-lock';
import { resolveDefaultSalePrice, useCurrencyRates, usePriceTypeIds } from '@/lib/sale-price';
import {
  Alert,
  Avatar,
  Button,
  CatalogPicker,
  CatalogPickerField,
  FormField,
  FormSection,
  Icons,
  Input,
  type PickerItem,
  formatDate,
} from '@moysklad/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

interface ProductRef {
  id: string;
  name: string;
  code: string | null;
  kind: string;
  uom: string | null;
  salePrices?: Array<{ priceTypeId: string; value: string }> | null;
}

interface ComponentRow {
  _uid: string;
  componentProductId: string | null;
  componentVariantId: string | null;
  label: string;
  uom: string | null;
  quantity: string;
}

interface BundleDetail {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  vat: number | null;
  mxikCode: string | null;
  salePrices: Array<{ priceTypeId: string; value: string }> | null;
  archived: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  owner?: { id: string; name: string; email: string } | null;
}

interface BundleComponentItem {
  id: string;
  componentProductId: string;
  componentVariantId: string | null;
  quantity: string;
  position: number;
  componentProduct: { id: string; name: string; code: string | null; uom: string | null } | null;
}

function uid() {
  return Math.random().toString(36).slice(2);
}

export default function BundleDetailPage() {
  const tCommon = useTranslations('common');
  const tDetailHeader = useTranslations('detail_header');
  const tFields = useTranslations('fields');
  const t = useTranslations('pages.bundles');
  // Reused for the shared numeric/MXIK validation messages + placeholder.
  const tProduct = useTranslations('pages.product_new');
  const { id } = useParams<{ id: string }>();
  const detailNav = useDetailNavigation('bundles', id);
  const router = useRouter();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<BundleDetail>({
    queryKey: ['bundle', id],
    queryFn: () => api.get<BundleDetail>(`/products/${id}`),
  });

  const { data: componentsData } = useQuery<{ items: BundleComponentItem[] }>({
    queryKey: ['bundle-components', id],
    queryFn: () => api.get(`/bundles/${id}/components`),
    enabled: !!id,
  });

  const { defaultId } = usePriceTypeIds();
  // Valyuta kurslari — valyutali salePrices'ni baza valyutasiga o'girish uchun.
  // Erta `return`'dan OLDIN (usePriceTypeIds yonida) turishi SHART.
  const rates = useCurrencyRates();

  // Editable state
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [vat, setVat] = useState('');
  const [mxikCode, setMxikCode] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [components, setComponents] = useState<ComponentRow[]>([]);
  const [openPicker, setOpenPicker] = useState<null | { kind: 'component'; rowUid: string }>(null);
  const [error, setError] = useState<string | null>(null);

  // Snapshot for isDirty
  const snapshot = useRef({
    name: '',
    code: '',
    description: '',
    vat: '',
    mxik: '',
    salePrice: '',
    components: '[]',
  });

  // `rates` ham dep: kurslar `data`dan kech kelishi mumkin va kelganda
  // valyutali narx qayta hisoblanishi kerak. `useCurrencyRates` memolangan,
  // ya'ni identifikator faqat javob o'zgarganda almashadi (`defaultId` bilan
  // bir xil rol).
  useEffect(() => {
    if (!data) return;
    const defaultValue = resolveDefaultSalePrice(data.salePrices, defaultId, rates);
    const n = data.name;
    const c = data.code ?? '';
    const d = data.description ?? '';
    const v = data.vat != null ? String(data.vat) : '';
    const mx = data.mxikCode ?? '';
    const sp = defaultValue ?? '';
    setName(n);
    setCode(c);
    setDescription(d);
    setVat(v);
    setMxikCode(mx);
    setSalePrice(sp);
    snapshot.current = {
      name: n,
      code: c,
      description: d,
      vat: v,
      mxik: mx,
      salePrice: sp,
      components: snapshot.current.components,
    };
  }, [data, defaultId, rates]);

  useEffect(() => {
    if (!componentsData) return;
    const rows: ComponentRow[] = componentsData.items.map((item) => ({
      _uid: uid(),
      componentProductId: item.componentProductId,
      componentVariantId: item.componentVariantId,
      label: item.componentProduct?.name ?? item.componentProductId,
      uom: item.componentProduct?.uom ?? null,
      quantity: item.quantity,
    }));
    setComponents(rows);
    snapshot.current = {
      ...snapshot.current,
      components: JSON.stringify(
        rows.map(({ componentProductId, componentVariantId, quantity }) => ({
          componentProductId,
          componentVariantId,
          quantity,
        })),
      ),
    };
  }, [componentsData]);

  const isDirty =
    name !== snapshot.current.name ||
    code !== snapshot.current.code ||
    description !== snapshot.current.description ||
    vat !== snapshot.current.vat ||
    mxikCode !== snapshot.current.mxik ||
    salePrice !== snapshot.current.salePrice ||
    JSON.stringify(
      components.map(({ componentProductId, componentVariantId, quantity }) => ({
        componentProductId,
        componentVariantId,
        quantity,
      })),
    ) !== snapshot.current.components;

  const productFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: ProductRef[] }>(
      `/products?search=${encodeURIComponent(s)}&kind=product&limit=50`,
    );
    return d.items.map((p) => ({
      id: p.id,
      primary: p.name,
      secondary: p.code ?? undefined,
      meta: p.uom ?? undefined,
      raw: p,
    }));
  };

  const addComponent = () => {
    setComponents((xs) => [
      ...xs,
      {
        _uid: uid(),
        componentProductId: null,
        componentVariantId: null,
        label: '',
        uom: null,
        quantity: '1',
      },
    ]);
  };

  const updateComponent = (u: string, patch: Partial<ComponentRow>) => {
    setComponents((xs) => xs.map((c) => (c._uid === u ? { ...c, ...patch } : c)));
  };

  const removeComponent = (u: string) => {
    setComponents((xs) => xs.filter((c) => c._uid !== u));
  };

  const onConflict = useConflictReload(['bundle', id]);
  const updateMut = useApiMutation({
    onConflict,
    mutationFn: async () => {
      if (!data) throw new Error('not loaded');
      if (!name.trim()) throw new Error(tCommon('field_required', { field: tFields('name') }));
      if (components.length === 0) throw new Error(t('err_components_required'));
      for (const c of components) {
        if (!c.componentProductId) throw new Error(t('err_component_product_required'));
        if (Number(c.quantity) <= 0) throw new Error(t('err_qty_positive'));
      }
      // Guard money/MXIK inputs before BigInt()/Number() coercion (mirrors the
      // products zod schema) so a non-integer never throws a raw JS SyntaxError.
      if (salePrice && !/^\d*$/.test(salePrice)) throw new Error(tProduct('number_invalid'));
      if (vat && !/^\d*$/.test(vat)) throw new Error(tProduct('number_invalid'));
      if (mxikCode && !/^\d{17}$/.test(mxikCode)) throw new Error(tProduct('mxik_invalid'));

      await api.patch(`/products/${id}`, {
        name,
        version: data.version,
        code: code || null,
        description: description || null,
        vat: vat ? Number(vat) : null,
        mxikCode: mxikCode || null,
        salePrices: salePrice
          ? [{ priceTypeId: defaultId ?? 'default', value: BigInt(salePrice).toString() }]
          : undefined,
      });

      await api.put(`/bundles/${id}/components`, {
        components: components.map((c, i) => ({
          componentProductId: c.componentProductId,
          componentVariantId: c.componentVariantId,
          quantity: c.quantity,
          position: i,
        })),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bundle', id] });
      qc.invalidateQueries({ queryKey: ['bundle-components', id] });
      qc.invalidateQueries({ queryKey: ['products'] });
      setError(null);
    },
  });

  const archiveMut = useApiMutation({
    mutationFn: (archive: boolean) =>
      api.post(`/products/${id}/${archive ? 'archive' : 'restore'}`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bundle', id] });
      qc.invalidateQueries({ queryKey: ['products'] });
    },
  });

  const deleteMut = useApiMutation({
    mutationFn: () => api.delete(`/products/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      router.push('/bundles');
    },
  });

  const { runDestructive } = useDestructiveMutation();

  const total = useMemo(() => components.length, [components]);

  if (isLoading)
    return <div className="p-8 text-[var(--ms-text-muted)] text-sm">{tCommon('loading')}</div>;
  if (!data) return <div className="p-8 text-sm">{tCommon('not_found')}</div>;

  const handleSave = () => {
    setError(null);
    updateMut.mutate(undefined, {
      // Optimistic-lock conflicts are surfaced by the reload dialog (onConflict).
      onError: (e) => {
        if (!isOptimisticConflict(e)) setError((e as Error).message);
      },
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleSave();
      }}
      className="flex min-h-screen flex-col bg-[var(--ms-bg-page)]"
      data-test-id="bundle-detail-page"
    >
      <DetailToolbar
        isDirty={isDirty}
        isSaving={updateMut.isPending}
        onSave={handleSave}
        onClose={() => router.push('/bundles')}
        position={detailNav.position}
        onPrev={detailNav.onPrev}
        onNext={detailNav.onNext}
        apiData={data}
        onDelete={
          !data.archived
            ? () =>
                runDestructive({
                  title: tCommon('delete_confirm', { name: data.name }),
                  run: () => deleteMut.mutateAsync(),
                  successMessage: tCommon('saved'),
                })
            : undefined
        }
        onPrintConfigure={() => router.push('/settings/label-templates')}
      />
      <DetailHeader
        titlePrefix=""
        name={data.name}
        moment={data.createdAt}
        stateLabel={data.archived ? tCommon('archived') : tCommon('active')}
        stateTone={archivedTone(data.archived)}
        stateSlug={data.archived ? 'archived' : 'active'}
        applicable={false}
        hideApplicable
        customTitle={
          <span data-test-id="detail-header-title-text">
            {data.name}
            {data.code && (
              <span className="ml-2 font-normal text-[var(--ms-text-muted)] text-sm">
                · {tFields('code')}: {data.code}
              </span>
            )}
          </span>
        }
        pillsSlot={
          data.archived ? (
            <button
              type="button"
              onClick={() => archiveMut.mutate(false)}
              disabled={archiveMut.isPending}
              className="rounded-[var(--ms-radius-sm)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] px-2 py-0.5 text-[var(--ms-text-primary)] text-xs hover:bg-[var(--ms-bg-muted)] disabled:opacity-50"
              data-test-id="detail-header-restore"
            >
              {tCommon('restore')}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => archiveMut.mutate(true)}
              disabled={archiveMut.isPending}
              className="rounded-[var(--ms-radius-sm)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] px-2 py-0.5 text-[var(--ms-text-primary)] text-xs hover:bg-[var(--ms-bg-muted)] disabled:opacity-50"
              data-test-id="detail-header-archive"
            >
              {tCommon('archive')}
            </button>
          )
        }
        authorSlot={
          <div className="flex flex-col items-end gap-1 text-xs">
            <div className="flex items-center gap-2">
              <Avatar
                name={data.owner?.name ?? '—'}
                size="md"
                data-test-id="detail-header-author-avatar"
              />
              <div className="flex flex-col leading-tight">
                <div
                  className="font-medium text-[var(--ms-text-primary)]"
                  data-test-id="detail-header-owner"
                >
                  {data.owner?.name ?? '—'}
                </div>
                <div
                  className="text-[var(--ms-text-muted)]"
                  data-test-id="detail-header-owner-role"
                >
                  {tDetailHeader('role_primary')}
                </div>
              </div>
            </div>
            <div className="text-[var(--ms-text-muted)]" data-test-id="detail-header-updated">
              {tDetailHeader('changed')}: {data.owner?.name ?? '—'} {formatDate(data.updatedAt)}
            </div>
          </div>
        }
      />

      <main className="flex-1 px-4 py-4">
        {(error || updateMut.error || archiveMut.error) && (
          <Alert tone="destructive" className="mb-3">
            {error ?? ((updateMut.error ?? archiveMut.error) as Error).message}
          </Alert>
        )}

        <div className="space-y-4">
          <FormSection title={t('section_main')}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField id="name" label={tFields('name')} required>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  data-test-id="field-name"
                />
              </FormField>
              <FormField id="code" label={tFields('code')}>
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  data-test-id="field-code"
                />
              </FormField>
            </div>
            <FormField id="description" label={tFields('description')}>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                data-test-id="field-description"
              />
            </FormField>
          </FormSection>

          <FormSection
            title={t('components_title')}
            description={t('components_count', { count: total })}
          >
            {components.length === 0 ? (
              <div className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] border-dashed py-6 text-center text-[var(--ms-text-muted)] text-sm">
                {t('components_empty')}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-[1fr,100px,40px] gap-2 px-2 font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                  <div>{tFields('product')}</div>
                  <div className="text-right">{tFields('quantity')}</div>
                  <div />
                </div>
                {components.map((c) => (
                  <div
                    key={c._uid}
                    className="grid grid-cols-[1fr,100px,40px] items-center gap-2"
                    data-test-id={`component-row-${c._uid}`}
                  >
                    <CatalogPickerField
                      value={
                        c.componentProductId ? { id: c.componentProductId, label: c.label } : null
                      }
                      placeholder={t('select_component')}
                      onPick={() => setOpenPicker({ kind: 'component', rowUid: c._uid })}
                      onClear={() =>
                        updateComponent(c._uid, { componentProductId: null, label: '', uom: null })
                      }
                    />
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={c.quantity}
                      onChange={(e) => updateComponent(c._uid, { quantity: e.target.value })}
                      className="text-right"
                      data-test-id={`qty-${c._uid}`}
                    />
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => removeComponent(c._uid)}
                      aria-label={tCommon('delete_row')}
                    >
                      <Icons.close className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <Button
              type="button"
              variant="secondary"
              onClick={addComponent}
              data-test-id="add-component"
            >
              <Icons.create className="h-4 w-4" />
              {t('add_component')}
            </Button>
          </FormSection>

          <FormSection title={t('section_pricing')}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField id="sale-price" label={tFields('price')}>
                <Input
                  value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value)}
                  inputMode="numeric"
                  className="text-right"
                  data-test-id="field-price"
                />
              </FormField>
              <FormField id="vat" label={tFields('vat')}>
                <Input
                  value={vat}
                  onChange={(e) => setVat(e.target.value)}
                  inputMode="numeric"
                  className="text-right"
                  data-test-id="field-vat"
                />
              </FormField>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField id="mxik" label={t('mxik_label')} hint={t('mxik_hint')}>
                <Input
                  value={mxikCode}
                  onChange={(e) => setMxikCode(e.target.value)}
                  inputMode="numeric"
                  placeholder={tProduct('mxik_placeholder')}
                  data-test-id="field-mxik"
                />
              </FormField>
            </div>
          </FormSection>

          {/* Bundles are kind='bundle' Products edited via PATCH /products/:id; the
              backend logs audit rows under entity='Product' (product.service.ts).
              Querying 'Bundle' matched nothing → History tab was permanently empty.
              (Component-list changes are not yet audited — separate BE feature-gap.) */}
          <DocumentTabs auditEntity="Product" entityId={data.id} relatedGroups={[]} />
        </div>
      </main>

      <CatalogPicker
        open={
          typeof openPicker === 'object' && openPicker !== null && openPicker.kind === 'component'
        }
        onClose={() => setOpenPicker(null)}
        title={t('select_component')}
        fetcher={productFetcher}
        onSelect={(item) => {
          if (typeof openPicker !== 'object' || openPicker === null) return;
          const raw = (item as PickerItem & { raw?: ProductRef }).raw;
          updateComponent(openPicker.rowUid, {
            componentProductId: item.id,
            componentVariantId: null,
            label: String(item.primary),
            uom: raw?.uom ?? null,
          });
          setOpenPicker(null);
        }}
      />
    </form>
  );
}
