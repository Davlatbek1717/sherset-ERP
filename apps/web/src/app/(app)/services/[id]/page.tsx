'use client';

/**
 * /services/[id] — inline-edit detail page (moysklad-parity).
 *
 * Mirrors /services/new layout. Same Zod schema, same FormSection sections
 * + fields; difference is useQuery hydration + PATCH /products/:id mutation
 * (services are products with kind='service').
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
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Alert,
  Avatar,
  CatalogPicker,
  CatalogPickerField,
  FormField,
  FormSection,
  Input,
  type PickerItem,
  formatDate,
} from '@moysklad/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

/** Schema factory so Zod validation messages localize via next-intl (t).
 *  Reuses the product_new validation keys (services are kind='service' products). */
const makeServiceFormSchema = (tProduct: (key: string) => string) =>
  z.object({
    name: z.string().min(1, tProduct('name_required')).max(255),
    code: z.string().max(50).optional(),
    description: z.string().optional(),
    productFolderId: z.string().uuid().nullable().optional(),
    uom: z.string().max(20).optional(),
    salePriceDefault: z.string().regex(/^\d*$/, tProduct('number_invalid')).optional(),
    vat: z.string().regex(/^\d*$/, tProduct('number_invalid')).optional(),
    mxikCode: z
      .string()
      .regex(/^$|^\d{17}$/, tProduct('mxik_invalid'))
      .optional(),
  });

type ServiceFormValues = z.infer<ReturnType<typeof makeServiceFormSchema>>;

interface FolderTreeItem {
  id: string;
  name: string;
  pathName: string | null;
  parentId: string | null;
}

interface ServiceDetail {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  uom: string | null;
  vat: number | null;
  mxikCode: string | null;
  salePrices: Array<{ priceTypeId: string; value: string }> | null;
  productFolder: { id: string; name: string; pathName: string | null } | null;
  archived: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  owner: { id: string; name: string; email: string } | null;
}

export default function ServiceDetailPage() {
  const tCommon = useTranslations('common');
  const tDetailHeader = useTranslations('detail_header');
  const tFields = useTranslations('fields');
  const t = useTranslations('pages.services');
  // Validation messages reuse the product_new keys (services are products).
  const tProduct = useTranslations('pages.product_new');
  const { id } = useParams<{ id: string }>();
  const detailNav = useDetailNavigation('services', id);
  const router = useRouter();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<ServiceDetail>({
    queryKey: ['service', id],
    queryFn: () => api.get<ServiceDetail>(`/products/${id}`),
  });

  const { defaultId } = usePriceTypeIds();
  // Valyuta kurslari — valyutali salePrices'ni baza valyutasiga o'girish uchun.
  // Erta `return`'dan OLDIN (usePriceTypeIds yonida) turishi SHART.
  const rates = useCurrencyRates();

  const schema = useMemo(() => makeServiceFormSchema(tProduct), [tProduct]);
  const form = useForm<ServiceFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', productFolderId: null },
  });

  const [pickerOpen, setPickerOpen] = useState(false);
  const [folderLabel, setFolderLabel] = useState<string | null>(null);

  // `rates` ham dep: kurslar `data`dan kech kelishi mumkin va kelganda
  // valyutali narx qayta hisoblanishi kerak. `useCurrencyRates` memolangan,
  // ya'ni identifikator faqat javob o'zgarganda almashadi (`defaultId` bilan
  // bir xil rol).
  useEffect(() => {
    if (!data) return;
    const defaultValue = resolveDefaultSalePrice(data.salePrices, defaultId, rates);
    form.reset({
      name: data.name,
      code: data.code ?? '',
      description: data.description ?? '',
      productFolderId: data.productFolder?.id ?? null,
      uom: data.uom ?? '',
      salePriceDefault: defaultValue ?? '',
      vat: data.vat != null ? String(data.vat) : '',
      mxikCode: data.mxikCode ?? '',
    });
    setFolderLabel(
      data.productFolder?.pathName && data.productFolder.pathName !== data.productFolder.name
        ? data.productFolder.pathName
        : (data.productFolder?.name ?? null),
    );
  }, [data, form, defaultId, rates]);

  const folderFetcher = async (search: string): Promise<PickerItem[]> => {
    const res = await api.get<{ items: FolderTreeItem[] }>(
      `/product-folders?search=${encodeURIComponent(search)}&limit=50`,
    );
    return res.items.map((f) => ({
      id: f.id,
      primary: f.name,
      secondary: f.pathName && f.pathName !== f.name ? f.pathName : undefined,
    }));
  };

  const onConflict = useConflictReload(['service', id]);
  const updateMut = useApiMutation({
    onConflict,
    mutationFn: async (values: ServiceFormValues) => {
      if (!data) throw new Error('not loaded');
      const payload = {
        name: values.name,
        version: data.version,
        code: values.code || null,
        description: values.description || null,
        productFolderId: values.productFolderId || null,
        uom: values.uom || null,
        salePrices: values.salePriceDefault
          ? [
              {
                priceTypeId: defaultId ?? 'default',
                value: BigInt(values.salePriceDefault).toString(),
              },
            ]
          : undefined,
        vat: values.vat ? Number(values.vat) : null,
        mxikCode: values.mxikCode || null,
      };
      return api.patch<ServiceDetail>(`/products/${id}`, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['service', id] });
      qc.invalidateQueries({ queryKey: ['products'] });
    },
  });

  const archiveMut = useApiMutation({
    mutationFn: (archive: boolean) =>
      api.post(`/products/${id}/${archive ? 'archive' : 'restore'}`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['service', id] });
      qc.invalidateQueries({ queryKey: ['products'] });
    },
  });

  const deleteMut = useApiMutation({
    mutationFn: () => api.delete(`/products/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      router.push('/services');
    },
  });

  const { runDestructive } = useDestructiveMutation();

  if (isLoading)
    return <div className="p-8 text-[var(--ms-text-muted)] text-sm">{tCommon('loading')}</div>;
  if (!data) return <div className="p-8 text-sm">{tCommon('not_found')}</div>;

  const handleSave = form.handleSubmit((values) => updateMut.mutate(values));

  return (
    <form
      onSubmit={handleSave}
      className="flex min-h-screen flex-col bg-[var(--ms-bg-page)]"
      data-test-id="service-detail-page"
    >
      <DetailToolbar
        isDirty={form.formState.isDirty}
        isSaving={updateMut.isPending}
        onSave={() => handleSave()}
        onClose={() => router.push('/services')}
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
        {/* Optimistic-lock conflicts are handled by the reload dialog (onConflict). */}
        {((updateMut.error && !isOptimisticConflict(updateMut.error)) || archiveMut.error) && (
          <Alert tone="destructive" className="mb-3">
            {((updateMut.error ?? archiveMut.error) as Error).message}
          </Alert>
        )}

        <div className="space-y-4">
          <FormSection title={t('section_main')}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField
                id="name"
                label={tFields('name')}
                required
                error={form.formState.errors.name?.message}
              >
                <Input
                  {...form.register('name')}
                  invalid={!!form.formState.errors.name}
                  data-test-id="field-name"
                />
              </FormField>
              <FormField id="code" label={tFields('code')}>
                <Input {...form.register('code')} data-test-id="field-code" />
              </FormField>
            </div>

            <FormField id="folder" label={t('folder')}>
              <Controller
                control={form.control}
                name="productFolderId"
                render={({ field }) => (
                  <CatalogPickerField
                    value={field.value ? { id: field.value, label: folderLabel ?? '—' } : null}
                    placeholder={t('folder_placeholder')}
                    onPick={() => setPickerOpen(true)}
                    onClear={() => {
                      field.onChange(null);
                      setFolderLabel(null);
                    }}
                    testId="field-folder"
                  />
                )}
              />
            </FormField>

            <FormField id="description" label={tFields('description')}>
              <Input {...form.register('description')} data-test-id="field-description" />
            </FormField>
          </FormSection>

          <FormSection title={t('section_pricing')}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField
                id="sale-price"
                label={tFields('price')}
                error={form.formState.errors.salePriceDefault?.message}
              >
                <Input
                  {...form.register('salePriceDefault')}
                  inputMode="numeric"
                  className="text-right"
                  data-test-id="field-price"
                />
              </FormField>
              <FormField id="vat" label={tFields('vat')} error={form.formState.errors.vat?.message}>
                <Input
                  {...form.register('vat')}
                  inputMode="numeric"
                  className="text-right"
                  data-test-id="field-vat"
                />
              </FormField>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField id="uom" label={tFields('uom')}>
                <Input
                  {...form.register('uom')}
                  placeholder={t('uom_placeholder')}
                  data-test-id="field-uom"
                />
              </FormField>
              <FormField
                id="mxik"
                label={t('mxik_label')}
                hint={t('mxik_hint')}
                error={form.formState.errors.mxikCode?.message}
              >
                <Input
                  {...form.register('mxikCode')}
                  inputMode="numeric"
                  placeholder={tProduct('mxik_placeholder')}
                  data-test-id="field-mxik"
                />
              </FormField>
            </div>
          </FormSection>

          {/* Services are kind='service' Products edited via PATCH /products/:id; the
              backend logs audit rows under entity='Product' (product.service.ts).
              Querying 'Service' matched nothing → History tab was permanently empty. */}
          <DocumentTabs auditEntity="Product" entityId={data.id} relatedGroups={[]} />
        </div>
      </main>

      <CatalogPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title={t('folder_picker_title')}
        fetcher={folderFetcher}
        onSelect={(item) => {
          form.setValue('productFolderId', item.id);
          setFolderLabel(String(item.primary));
          setPickerOpen(false);
        }}
      />
    </form>
  );
}
