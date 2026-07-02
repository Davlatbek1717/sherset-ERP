'use client';

import { DocumentTabs } from '@/components/document-tabs';
import { useApiMutation } from '@/hooks/use-api-mutation';
import { useConflictReload } from '@/hooks/use-conflict-reload';
import { useEditFormLabels } from '@/hooks/use-edit-form-labels';
import { api } from '@/lib/api-client';
import { archivedTone } from '@/lib/archived-tone';
import { isOptimisticConflict } from '@/lib/optimistic-lock';
import {
  Badge,
  Button,
  CatalogPicker,
  CatalogPickerField,
  EditForm,
  FormField,
  FormSection,
  Icons,
  Input,
  type PickerItem,
  formatMoney,
} from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface ProductRef {
  id: string;
  name: string;
  code: string | null;
  uom: string | null;
  buyPrice?: string | null;
}

interface BomComponent {
  id: string;
  productId: string;
  qty: string;
  position: number;
  product: ProductRef;
}

interface BomDetail {
  id: string;
  version: number;
  name: string;
  productId: string;
  outputQty: string;
  standardCostMinor: string;
  archived: boolean;
  description: string | null;
  externalCode: string | null;
  product: ProductRef;
  components: BomComponent[];
  _count: { components: number };
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

export default function BomDetailPage() {
  const params = useParams<{ id: string }>();
  const _router = useRouter();
  const qc = useQueryClient();
  const t = useTranslations('pages.boms');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const editFormLabels = useEditFormLabels();

  const { data: bom, isLoading } = useQuery<BomDetail>({
    queryKey: ['bom', params.id],
    queryFn: () => api.get<BomDetail>(`/boms/${params.id}`),
  });

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

  useEffect(() => {
    if (!bom) return;
    setName(bom.name);
    setDescription(bom.description ?? '');
    setExternalCode(bom.externalCode ?? '');
    setOutputQty(bom.outputQty);
    setOutputProduct(bom.product);
    setComponents(
      bom.components.map((c) => ({
        _uid: uid(),
        productId: c.productId,
        label: c.product.name,
        uom: c.product.uom,
        qty: c.qty,
      })),
    );
  }, [bom]);

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

  // Re-hydration is automatic here: the form mirrors `bom` into local state via
  // useEffect([bom]), so invalidating the detail query re-seeds every field — no
  // 2nd arg needed (unlike the hydrate-once `if (data && !form)` document forms).
  const onConflict = useConflictReload(['bom', params.id]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!bom) throw new Error(tCommon('not_found'));
      if (!name.trim()) throw new Error(tCommon('field_required', { field: tFields('name') }));
      if (!outputProduct)
        throw new Error(tCommon('field_required', { field: t('output_product') }));
      if (Number(outputQty) <= 0) throw new Error(t('err_qty_positive'));
      for (const c of components) {
        if (!c.productId) throw new Error(t('err_no_product'));
        if (Number(c.qty) <= 0) throw new Error(t('err_qty_positive'));
      }

      await api.patch(`/boms/${params.id}`, {
        version: bom.version,
        name,
        productId: outputProduct.id,
        outputQty,
        // null (not undefined) so emptying a field persists the clear.
        description: description || null,
        externalCode: externalCode || null,
        components: components.map((c, i) => ({
          productId: c.productId,
          qty: c.qty,
          position: i,
        })),
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['bom', params.id] });
      void qc.invalidateQueries({ queryKey: ['boms'] });
    },
    onError: (e: Error) => {
      if (isOptimisticConflict(e)) {
        onConflict();
        return;
      }
      setError(e.message);
    },
  });

  const archiveMut = useApiMutation({
    mutationFn: () =>
      bom?.archived
        ? api.post(`/boms/${params.id}/restore`, {})
        : api.delete(`/boms/${params.id}/archive`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['bom', params.id] });
      void qc.invalidateQueries({ queryKey: ['boms'] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8 text-[var(--ms-text-muted)] text-sm">
        {tCommon('loading')}
      </div>
    );
  }
  if (!bom) {
    return (
      <div className="flex items-center justify-center p-8 text-[var(--ms-text-muted)] text-sm">
        {tCommon('not_found')}
      </div>
    );
  }

  return (
    <EditForm
      {...editFormLabels}
      testId="bom-detail-page"
      title={
        <span className="flex items-center gap-2">
          {bom.name}
          {bom.archived && <Badge tone={archivedTone(bom.archived)}>{tCommon('archived')}</Badge>}
        </span>
      }
      breadcrumbs={[{ label: t('title'), href: '/production/boms' }, { label: bom.name }]}
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        saveMut.mutate();
      }}
      cancelHref="/production/boms"
      saving={saveMut.isPending}
      error={error}
    >
      {/* Archive / Restore action */}
      <div className="flex justify-end">
        <Button
          type="button"
          variant="secondary"
          onClick={() => archiveMut.mutate()}
          disabled={archiveMut.isPending}
        >
          {bom.archived ? tCommon('restore') : tCommon('archive')}
        </Button>
      </div>

      <FormSection title={t('section_main')}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField id="name" label={tFields('name')} required>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
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
        {bom.standardCostMinor !== '0' && (
          <div className="text-[var(--ms-text-muted)] text-sm">
            {t('standard_cost')}: <strong>{formatMoney(bom.standardCostMinor)}</strong>
          </div>
        )}
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

      <DocumentTabs auditEntity="bom" entityId={bom.id} relatedGroups={[]} />

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
