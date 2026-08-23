'use client';

/**
 * /products/new — moysklad-parity catalog editor for a brand-new product.
 *
 * Shares the EXACT form of /products/[id] (the `useProductForm` hook +
 * `ProductFormLeftCards` + `ProductPriceEditor`), so create and edit are 1:1 and
 * can't drift apart. The create-only bits live here: the Сохранить/Закрыть
 * toolbar (no Изменить/Отправить on an unsaved product), the full-width name
 * title input, the INERT right-column tabs (moysklad shows the real ➕ Модификация
 * / Аналог / Упаковка / Файл buttons, each of which saves first — Остатки/История
 * are greyed pre-save), the POST + best-effort image upload, and the
 * «+ Модификация» → open «Создание модификаций» in place on the just-saved product.
 */

import { DetailToolbar } from '@/components/document-detail';
import { ProductFormShell } from '@/components/product-form-layout';
import { CreateModificationsModal } from '@/components/products/create-modifications-modal';
import { ProductFormLeftCards } from '@/components/products/product-form-left-cards';
import { ProductPriceEditor } from '@/components/products/product-price-editor';
import { useProductForm } from '@/components/products/use-product-form';
import { useApiMutation } from '@/hooks/use-api-mutation';
import { usePermissions } from '@/hooks/use-permissions';
import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';
import { uploadStagedImages } from '@/lib/staged-image-upload';
import {
  Alert,
  Button,
  Input,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useToast,
} from '@moysklad/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

export default function NewProductPage() {
  const pf = useProductForm();
  const { t, form } = pf;
  const { toast } = useToast();
  // Right-column tab labels reuse the detail widget's grounded tab set.
  const tw = useTranslations('product_detail_widget');
  const router = useRouter();

  // When a right-column ➕ (Модификация/Аналог/Упаковка/Файл) triggers the save,
  // remember which tab to land on so /products/[id] opens it in place (moysklad
  // continuity). A ref (not state) so createMut.onSuccess reads the latest value.
  const openTabRef = useRef<string | null>(null);
  // After «+ Модификация» saves the product, the «Создание модификаций» modal
  // opens right here (the product now exists) — no cross-page navigation.
  const [modModalId, setModModalId] = useState<string | null>(null);

  // moysklad pre-fills several fields on a NEW product form: a sequential «Код»
  // (consumed on open), one auto-generated EAN13 barcode row, and «Сотрудник» =
  // the current user. Run once on mount (ref-guarded against StrictMode double-run).
  const { user } = useAuth();
  // Without `product.create` the server rejects BOTH calls this page makes, and
  // the old page swallowed the first one: `/products/allocate-code` 403'd into an
  // empty `.catch()`, so «Код» silently stayed blank, the user filled the whole
  // form, and only «Сохранить» revealed the 403 (measured in prod 2026-08-22 —
  // four such allocate-code 403s from Kassir/B2B accounts). Gate the page instead.
  // Fail-open while the matrix loads, like every other FE gate; the real lock is
  // `@RequirePermission({ entity: 'product', action: 'create' })` on the handlers.
  const { can } = usePermissions();
  const allowedToCreate = can('product', 'create');
  const initedRef = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: one-time mount init; pf.addBarcode/form.setValue are stable (adding pf/form would re-run and double-allocate the code)
  useEffect(() => {
    if (initedRef.current || !allowedToCreate) return;
    initedRef.current = true;
    pf.addBarcode();
    api
      .post<{ code: string }>('/products/allocate-code', {})
      // Faqat maydon hamon BO'SH bo'lsa yoziladi — kechikkan javob
      // foydalanuvchi kiritgan kodni bosib ketmasin (2026-08-23 auditi).
      .then((r) => {
        if (!form.getValues('code')) form.setValue('code', r.code);
      })
      .catch(() => {});
  }, [allowedToCreate]);
  // «Сотрудник» (owner) = current user, set once the auth user resolves.
  const ownerSetRef = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: do-once when user resolves; pf.setOwnerLabel/form.setValue are stable
  useEffect(() => {
    if (ownerSetRef.current || !user) return;
    ownerSetRef.current = true;
    form.setValue('ownerId', user.id);
    pf.setOwnerLabel(user.name);
  }, [user]);

  const createMut = useApiMutation({
    // The catalog list caches for 30s and never refetches on focus, so without
    // this the just-created product was missing when the user went back to
    // /products (2026-08-23 audit).
    invalidateKeys: [['products']],
    mutationFn: async () => {
      const v = form.getValues();
      const payload = {
        ...pf.buildPayload('create'),
        // «Код упаковки ТАСНИф» / «Штрихкод ТАСНИф» persist on a base unit pack.
        packs: pf.baseTasnifPack(v.uom || 'шт'),
      };
      const created = await api.post<{ id: string }>('/products', payload);
      // Staged images are best-effort — the product already exists, so a failed
      // image must not fail the create — but the failure is REPORTED: uploads
      // need `attachment.create`, a different permission box from the one that
      // let the user get this far, and the old empty `catch {}` dropped every
      // picture without a word (2026-08-23 audit).
      const { failed } = await uploadStagedImages(created.id, pf.stagedImages);
      if (failed > 0) toast.warning(t('images_upload_failed', { count: failed }));
      return created;
    },
    onSuccess: (created) => {
      const tab = openTabRef.current;
      openTabRef.current = null;
      // «+ Модификация»: open «Создание модификаций» in place on the just-saved
      // product (reliable — no route/searchParams timing). Other ➕ tabs land on
      // the detail page with that tab pre-selected.
      if (tab === 'variants') {
        setModModalId(created.id);
        return;
      }
      router.push(`/products/${created.id}${tab ? `?open=${tab}` : ''}`);
    },
  });

  const handleSave = form.handleSubmit(() => {
    // A marked product («Тип продукции» ≠ Не маркируется) requires a GTIN — the BE
    // enforces it too, but guard here for an inline error instead of a 400 banner.
    if (pf.markingType !== 'none' && !(form.getValues('gtin') ?? '').trim()) {
      form.setError('gtin', { message: t('gtin_required') });
      return;
    }
    createMut.mutate();
  });

  // Right-column tabs other than Цены, on an UNSAVED product. moysklad shows the
  // REAL per-tab UI (➕ Модификация / ➕ Аналог / ➕ Упаковка, and a files table +
  // ➕ Файл) — clicking an add button triggers a SAVE (which fails validation
  // until the product has a name, same save-gate as moysklad). Остатки/История
  // are greyed (disabled) pre-save.
  const inertAddTab = (testId: string, label: string, tab: string, hint?: string) => (
    <div className="space-y-3 py-2" data-test-id={testId}>
      {hint ? <p className="max-w-2xl text-[var(--ms-text-muted)] text-sm">{hint}</p> : null}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => {
          openTabRef.current = tab;
          void handleSave();
        }}
        data-test-id={`${testId}-add`}
      >
        + {label}
      </Button>
    </div>
  );
  const filesInertTab = () => (
    <div className="space-y-3 py-2" data-test-id="files-inert">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-[var(--ms-border-default)] border-b text-left text-[var(--ms-text-muted)]">
            <th className="py-2 font-medium">{t('file_col_name')}</th>
            <th className="py-2 font-medium">{t('file_col_size')}</th>
            <th className="py-2 font-medium">{t('file_col_date')}</th>
            <th className="py-2 font-medium">{t('file_col_employee')}</th>
          </tr>
        </thead>
      </table>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => {
          openTabRef.current = 'files';
          void handleSave();
        }}
        data-test-id="files-inert-add"
      >
        + {t('add_file')}
      </Button>
    </div>
  );
  const inertTab = (testId: string) => (
    <div className="py-10 text-center text-[var(--ms-text-muted)] text-sm" data-test-id={testId}>
      {t('tab_inert_hint')}
    </div>
  );

  if (!allowedToCreate) {
    return (
      <div className="px-8 py-6" data-test-id="product-new-forbidden">
        <Alert tone="destructive" title={t('no_permission_title')}>
          {t('no_permission_desc')}
        </Alert>
      </div>
    );
  }

  return (
    <>
      <form
        onSubmit={handleSave}
        className="flex min-h-screen flex-col bg-[var(--ms-bg-page)]"
        data-test-id="product-new-page"
      >
        <DetailToolbar
          isDirty={form.formState.isDirty}
          isSaving={createMut.isPending}
          onSave={() => handleSave()}
          onClose={() => router.push('/products')}
          // moysklad's create form shows only Сохранить/Закрыть + Печать — an unsaved
          // product has nothing to copy/delete/email.
          createMenuItems={[]}
          hideEditMenu
          hideSendMenu
        />

        {/* moysklad promotes the product name to a full-width title input above
          the columns (no «Новый товар» heading / state pill on the create form). */}
        <div className="border-[var(--ms-border-default)] border-b bg-[var(--ms-bg-surface)] px-4 py-3">
          <label htmlFor="name" className="mb-1 block text-[var(--ms-text-muted)] text-xs">
            <span className="text-[var(--ms-text-destructive)]">*</span> {t('name_label')}
          </label>
          <Input
            id="name"
            data-test-id="field-name"
            invalid={!!form.formState.errors.name}
            className="w-full"
            {...form.register('name')}
          />
          {form.formState.errors.name && (
            <p className="mt-1 text-[var(--ms-text-destructive)] text-xs">
              {form.formState.errors.name.message}
            </p>
          )}
        </div>

        {createMut.error && (
          <div className="border-[var(--ms-destructive-100)] border-b bg-[var(--ms-destructive-50)] px-4 py-2 text-[var(--ms-text-destructive)] text-sm">
            {(createMut.error as Error).message}
          </div>
        )}

        <main className="flex-1 px-4 py-4">
          <ProductFormShell
            left={<ProductFormLeftCards pf={pf} />}
            right={
              <Tabs defaultValue="prices" data-test-id="product-new-tabs">
                {/* moysklad product-card tabs = equal-width grey segmented pills,
                  active filled brand-blue (the DS `boxed` variant) — must match the
                  /[id] ProductDetailWidget tabs (which use variant="boxed"); without
                  it /new fell back to the underline style = a parity gap. */}
                <TabsList variant="boxed">
                  <TabsTrigger value="prices" data-test-id="tab-prices">
                    {tw('tab_prices')}
                  </TabsTrigger>
                  <TabsTrigger value="variants" data-test-id="tab-variants">
                    {tw('tab_variants')} (0)
                  </TabsTrigger>
                  <TabsTrigger value="analogs" data-test-id="tab-analogs">
                    {tw('tab_analogs')}
                  </TabsTrigger>
                  <TabsTrigger value="packaging" data-test-id="tab-packaging">
                    {tw('tab_packaging')} (0)
                  </TabsTrigger>
                  <TabsTrigger value="stock" data-test-id="tab-stock" disabled>
                    {tw('tab_stock')}
                  </TabsTrigger>
                  <TabsTrigger value="history" data-test-id="tab-history" disabled>
                    {tw('tab_history')}
                  </TabsTrigger>
                  <TabsTrigger value="files" data-test-id="tab-files">
                    {tw('tab_files')} (0)
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="prices">
                  <ProductPriceEditor pf={pf} />
                </TabsContent>

                <TabsContent value="variants">
                  {inertAddTab('variants-inert', t('add_modification'), 'variants')}
                </TabsContent>
                <TabsContent value="analogs">
                  {inertAddTab('analogs-inert', t('add_analog'), 'analogs', t('analogs_hint'))}
                </TabsContent>
                <TabsContent value="packaging">
                  {inertAddTab('packaging-inert', t('add_packaging'), 'packaging')}
                </TabsContent>
                <TabsContent value="stock">{inertTab('stock-inert')}</TabsContent>
                <TabsContent value="history">{inertTab('history-inert')}</TabsContent>
                <TabsContent value="files">{filesInertTab()}</TabsContent>
              </Tabs>
            }
          />
        </main>
      </form>
      {modModalId && (
        <CreateModificationsModal
          productId={modModalId}
          open={!!modModalId}
          onClose={() => router.push(`/products/${modModalId}`)}
          onCreated={() => router.push(`/products/${modModalId}?tab=variants`)}
        />
      )}
    </>
  );
}
