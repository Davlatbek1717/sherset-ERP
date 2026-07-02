'use client';

import { DetailHeader, DetailToolbar } from '@/components/document-detail';
import { useApiMutation } from '@/hooks/use-api-mutation';
import { api } from '@/lib/api-client';
import { usePriceTypeIds } from '@/lib/sale-price';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  CatalogPicker,
  CatalogPickerField,
  FormField,
  FormSection,
  Input,
  type PickerItem,
} from '@moysklad/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
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

export default function NewServicePage() {
  const router = useRouter();
  const t = useTranslations('pages.services');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  // Validation messages reuse the product_new keys (services are products).
  const tProduct = useTranslations('pages.product_new');
  const { defaultId } = usePriceTypeIds();
  const schema = useMemo(() => makeServiceFormSchema(tProduct), [tProduct]);
  const form = useForm<ServiceFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', productFolderId: null },
  });

  const [pickerOpen, setPickerOpen] = useState(false);
  const [folderLabel, setFolderLabel] = useState<string | null>(null);

  const folderFetcher = async (search: string): Promise<PickerItem[]> => {
    const data = await api.get<{ items: FolderTreeItem[] }>(
      `/product-folders?search=${encodeURIComponent(search)}&limit=50`,
    );
    return data.items.map((f) => ({
      id: f.id,
      primary: f.name,
      secondary: f.pathName && f.pathName !== f.name ? f.pathName : undefined,
    }));
  };

  const createMut = useApiMutation({
    mutationFn: async (values: ServiceFormValues) => {
      const payload = {
        name: values.name,
        kind: 'service' as const,
        code: values.code || undefined,
        description: values.description || undefined,
        productFolderId: values.productFolderId || undefined,
        uom: values.uom || undefined,
        salePrices: values.salePriceDefault
          ? [
              {
                priceTypeId: defaultId ?? 'default',
                value: BigInt(values.salePriceDefault).toString(),
              },
            ]
          : undefined,
        vat: values.vat ? Number(values.vat) : undefined,
        mxikCode: values.mxikCode || undefined,
      };
      return api.post<{ id: string }>('/products', payload);
    },
    onSuccess: (created) => router.push(`/services/${created.id}`),
  });

  const handleSave = form.handleSubmit((values) => createMut.mutate(values));

  return (
    <form
      onSubmit={handleSave}
      className="flex min-h-screen flex-col bg-[var(--ms-bg-page)]"
      data-test-id="service-new-page"
    >
      <DetailToolbar
        isDirty={form.formState.isDirty}
        isSaving={createMut.isPending}
        onSave={() => handleSave()}
        onClose={() => router.push('/services')}
        createMenuItems={[]}
      />
      <DetailHeader
        // titlePrefix is unused when customTitle is set; kept i18n'd so it can
        // never leak a Latin-uz literal into the RU locale.
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
      {createMut.error && (
        <div className="border-[var(--ms-destructive-100)] border-b bg-[var(--ms-destructive-50)] px-4 py-2 text-[var(--ms-text-destructive)] text-sm">
          {(createMut.error as Error).message}
        </div>
      )}
      <main className="flex-1 px-4 py-4">
        <div className="space-y-4">
          <FormSection title={t('section_main')}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField
                id="name"
                label={tFields('name')}
                required
                error={form.formState.errors.name?.message}
              >
                <Input {...form.register('name')} autoFocus data-test-id="field-name" />
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
              <FormField id="sale-price" label={tFields('price')}>
                <Input
                  {...form.register('salePriceDefault')}
                  inputMode="numeric"
                  className="text-right"
                  data-test-id="field-price"
                />
              </FormField>
              <FormField id="vat" label={tFields('vat')}>
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
              <FormField id="mxik" label={t('mxik_label')} hint={t('mxik_hint')}>
                <Input
                  {...form.register('mxikCode')}
                  inputMode="numeric"
                  placeholder={tProduct('mxik_placeholder')}
                  data-test-id="field-mxik"
                />
              </FormField>
            </div>
          </FormSection>

          <CatalogPicker
            open={pickerOpen}
            onClose={() => setPickerOpen(false)}
            title={t('folder_picker_title')}
            fetcher={folderFetcher}
            onSelect={(item) => {
              form.setValue('productFolderId', item.id);
              setFolderLabel(String(item.primary));
            }}
          />
        </div>
      </main>
    </form>
  );
}
