'use client';

import { DetailHeader, DetailToolbar } from '@/components/document-detail';
import { api } from '@/lib/api-client';
import { usePriceTypeIds } from '@/lib/sale-price';
import {
  Button,
  CatalogPicker,
  CatalogPickerField,
  FormField,
  FormSection,
  Icons,
  Input,
  type PickerItem,
} from '@moysklad/ui';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

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

function uid() {
  return Math.random().toString(36).slice(2);
}

export default function NewBundlePage() {
  const router = useRouter();
  const { defaultId } = usePriceTypeIds();
  const t = useTranslations('pages.bundles');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  // Reused for the shared numeric/MXIK validation messages + placeholder.
  const tProduct = useTranslations('pages.product_new');

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [vat, setVat] = useState('');
  const [mxikCode, setMxikCode] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [components, setComponents] = useState<ComponentRow[]>([]);
  const [openPicker, setOpenPicker] = useState<null | { kind: 'component'; rowUid: string }>(null);
  const [error, setError] = useState<string | null>(null);

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

  const productFetcher = async (s: string): Promise<PickerItem[]> => {
    // Only non-bundle products can be components (avoid nesting for MVP).
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

  const createMut = useMutation({
    mutationFn: async () => {
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

      // 1. Create the bundle-kind Product.
      const created = await api.post<{ id: string }>('/products', {
        name,
        kind: 'bundle',
        code: code || undefined,
        description: description || undefined,
        vat: vat ? Number(vat) : undefined,
        mxikCode: mxikCode || undefined,
        salePrices: salePrice
          ? [{ priceTypeId: defaultId ?? 'default', value: BigInt(salePrice).toString() }]
          : undefined,
      });

      // 2. Write the component list in one shot.
      await api.put(`/bundles/${created.id}/components`, {
        components: components.map((c, i) => ({
          componentProductId: c.componentProductId,
          componentVariantId: c.componentVariantId,
          quantity: c.quantity,
          position: i,
        })),
      });

      return created;
    },
    onSuccess: (created) => router.push(`/bundles/${created.id}`),
    onError: (e: Error) => setError(e.message),
  });

  const total = useMemo(() => components.length, [components]);

  const handleSave = () => {
    setError(null);
    createMut.mutate();
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleSave();
      }}
      className="flex min-h-screen flex-col bg-[var(--ms-bg-page)]"
      data-test-id="bundle-new-page"
    >
      <DetailToolbar
        isDirty={!!(name || code || components.length > 0)}
        isSaving={createMut.isPending}
        onSave={handleSave}
        onClose={() => router.push('/bundles')}
        createMenuItems={[]}
      />
      <DetailHeader
        // titlePrefix is unused when customTitle is set (detail-header.tsx
        // renders `customTitle ?? titlePrefix …`); kept i18n'd so it can never
        // leak a Latin-uz literal into the RU locale if customTitle is removed.
        titlePrefix={t('new_title')}
        name=""
        moment={new Date().toISOString()}
        stateLabel={tCommon('new_state')}
        stateTone="neutral"
        stateSlug="new"
        applicable={false}
        hideApplicable
        customTitle={t('new_title')}
      />
      {error && (
        <div className="border-[var(--ms-destructive-100)] border-b bg-[var(--ms-destructive-50)] px-4 py-2 text-[var(--ms-text-destructive)] text-sm">
          {error}
        </div>
      )}
      <main className="flex-1 px-4 py-4">
        <div className="space-y-4">
          <FormSection title={t('section_main')}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField id="name" label={tFields('name')} required>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
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

          <CatalogPicker
            open={
              typeof openPicker === 'object' &&
              openPicker !== null &&
              openPicker.kind === 'component'
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
            }}
          />
        </div>
      </main>
    </form>
  );
}
