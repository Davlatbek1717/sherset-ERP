'use client';

import { useEditFormLabels } from '@/hooks/use-edit-form-labels';
import { api } from '@/lib/api-client';
import {
  Button,
  CatalogPicker,
  CatalogPickerField,
  EditForm,
  FormField,
  FormSection,
  Icons,
  Input,
  type PickerItem,
} from '@moysklad/ui';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface ProductRef {
  id: string;
  name: string;
  code: string | null;
  uom: string | null;
}

interface ComponentRow {
  _uid: string;
  productId: string | null;
  label: string;
  uom: string | null;
  qty: string;
}

function uid() {
  return Math.random().toString(36).slice(2);
}

export default function NewBomPage() {
  const router = useRouter();
  const t = useTranslations('pages.boms');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const editFormLabels = useEditFormLabels();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [externalCode, setExternalCode] = useState('');
  const [outputQty, setOutputQty] = useState('1');
  const [outputProduct, setOutputProduct] = useState<ProductRef | null>(null);
  const [components, setComponents] = useState<ComponentRow[]>([]);
  const [openPicker, setOpenPicker] = useState<null | {
    kind: 'output' | 'component';
    rowUid?: string;
  }>(null);
  const [error, setError] = useState<string | null>(null);

  const addComponent = () => {
    setComponents((xs) => [
      ...xs,
      { _uid: uid(), productId: null, label: '', uom: null, qty: '1' },
    ]);
  };

  const updateComponent = (u: string, patch: Partial<ComponentRow>) => {
    setComponents((xs) => xs.map((c) => (c._uid === u ? { ...c, ...patch } : c)));
  };

  const removeComponent = (u: string) => {
    setComponents((xs) => xs.filter((c) => c._uid !== u));
  };

  const productFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: ProductRef[] }>(
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

  const createMut = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error(tCommon('field_required', { field: tFields('name') }));
      if (!outputProduct)
        throw new Error(tCommon('field_required', { field: t('output_product') }));
      if (Number(outputQty) <= 0) throw new Error(t('err_qty_positive'));

      for (const c of components) {
        if (!c.productId) throw new Error(t('err_no_product'));
        if (Number(c.qty) <= 0) throw new Error(t('err_qty_positive'));
      }

      const result = await api.post<{ id: string }>('/boms', {
        name,
        productId: outputProduct.id,
        outputQty,
        description: description || undefined,
        externalCode: externalCode || undefined,
        components: components.map((c, i) => ({
          productId: c.productId,
          qty: c.qty,
          position: i,
        })),
      });
      return result;
    },
    onSuccess: (created) => router.push(`/production/boms/${created.id}`),
    onError: (e: Error) => setError(e.message),
  });

  return (
    <EditForm
      {...editFormLabels}
      testId="bom-new-page"
      title={t('new_title')}
      breadcrumbs={[{ label: t('title'), href: '/production/boms' }, { label: t('new_title') }]}
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        createMut.mutate();
      }}
      cancelHref="/production/boms"
      saving={createMut.isPending}
      error={error}
    >
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
          <FormField id="output-qty" label={t('output_qty')}>
            <Input
              value={outputQty}
              onChange={(e) => setOutputQty(e.target.value)}
              inputMode="decimal"
              className="text-right"
              data-test-id="field-output-qty"
            />
          </FormField>
        </div>
        <FormField id="output-product" label={t('output_product')} required>
          <CatalogPickerField
            value={outputProduct ? { id: outputProduct.id, label: outputProduct.name } : null}
            placeholder={t('output_product')}
            onPick={() => setOpenPicker({ kind: 'output' })}
            onClear={() => setOutputProduct(null)}
          />
        </FormField>
        <FormField id="description" label={tFields('description')}>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            data-test-id="field-description"
          />
        </FormField>
        <FormField id="external-code" label={tFields('external_code')}>
          <Input
            value={externalCode}
            onChange={(e) => setExternalCode(e.target.value)}
            data-test-id="field-external-code"
          />
        </FormField>
      </FormSection>

      <FormSection
        title={t('section_components')}
        description={t('components_count', { count: components.length })}
      >
        {components.length === 0 ? (
          <div className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] border-dashed py-6 text-center text-[var(--ms-text-muted)] text-sm">
            {tCommon('no_records')}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr,100px,40px] gap-2 px-2 font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
              <div>{tFields('product')}</div>
              <div className="text-right">{t('component_qty')}</div>
              <div />
            </div>
            {components.map((c) => (
              <div
                key={c._uid}
                className="grid grid-cols-[1fr,100px,40px] items-center gap-2"
                data-test-id={`component-row-${c._uid}`}
              >
                <CatalogPickerField
                  value={c.productId ? { id: c.productId, label: c.label } : null}
                  placeholder={tFields('product')}
                  onPick={() => setOpenPicker({ kind: 'component', rowUid: c._uid })}
                  onClear={() => updateComponent(c._uid, { productId: null, label: '', uom: null })}
                />
                <Input
                  type="text"
                  inputMode="decimal"
                  value={c.qty}
                  onChange={(e) => updateComponent(c._uid, { qty: e.target.value })}
                  className="text-right"
                  data-test-id={`qty-${c._uid}`}
                />
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => removeComponent(c._uid)}
                  aria-label={tCommon('delete')}
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

      {/* Output product picker */}
      <CatalogPicker
        open={openPicker?.kind === 'output'}
        onClose={() => setOpenPicker(null)}
        title={t('output_product')}
        fetcher={productFetcher}
        onSelect={(item) => {
          const raw = (item as PickerItem & { raw?: ProductRef }).raw;
          setOutputProduct({
            id: item.id,
            name: String(item.primary),
            code: raw?.code ?? null,
            uom: raw?.uom ?? null,
          });
          setOpenPicker(null);
        }}
      />

      {/* Component product picker */}
      <CatalogPicker
        open={openPicker?.kind === 'component'}
        onClose={() => setOpenPicker(null)}
        title={tFields('product')}
        fetcher={productFetcher}
        onSelect={(item) => {
          if (!openPicker?.rowUid) return;
          const raw = (item as PickerItem & { raw?: ProductRef }).raw;
          updateComponent(openPicker.rowUid, {
            productId: item.id,
            label: String(item.primary),
            uom: raw?.uom ?? null,
          });
          setOpenPicker(null);
        }}
      />
    </EditForm>
  );
}
