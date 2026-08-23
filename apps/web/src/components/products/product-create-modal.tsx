'use client';

/**
 * ProductCreateModal — the moysklad «Новый товар» card as an OVERLAY, opened from
 * a document's «Создать новый товар "<query>"» footer link so a product can be
 * created WITHOUT leaving the (unsaved) document. On success it hands the created
 * product back to the caller (`onCreated`) which appends it as a position.
 *
 * Reuses the EXACT create logic of /products/new — `useProductForm` +
 * `ProductFormLeftCards` + `ProductPriceEditor` + the allocate-code / owner init
 * + POST /products (+ staged image upload) — so the modal and the full page can't
 * drift. It shows the left cards + the «Цены» editor; the create page's inert
 * «add later» tabs (Модификации/Упаковка…) are omitted — those are edited by
 * REOPENING the saved product (which now has an id) in ProductEditModal.
 *
 * Mount CONDITIONALLY so every open starts from a fresh form + a fresh «Код».
 */

import { ProductFormShell } from '@/components/product-form-layout';
import { ProductFormLeftCards } from '@/components/products/product-form-left-cards';
import { ProductPriceEditor } from '@/components/products/product-price-editor';
import { useProductForm } from '@/components/products/use-product-form';
import { useApiMutation } from '@/hooks/use-api-mutation';
import { usePermissions } from '@/hooks/use-permissions';
import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';
import { uploadStagedImages } from '@/lib/staged-image-upload';
import { Alert, Button, Input, Modal, useToast } from '@moysklad/ui';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';

/** What `POST /products` returns — the row a document position is built from. */
export interface CreatedProduct {
  id: string;
  name: string;
  uom: string | null;
  buyPrice: string | null;
  vat?: number | null;
  salePrices?: Array<{ priceTypeId: string; value: string }> | null;
}

export function ProductCreateModal({
  open,
  initialName,
  onClose,
  onCreated,
}: {
  open: boolean;
  /** Pre-fill the name (the text the user had typed in the inline-add search). */
  initialName?: string;
  onClose: () => void;
  /**
   * Fired with the FULL created product so the caller can append it as a
   * position straight away.
   *
   * It used to hand over only `{ id }`, which forced every caller to re-read the
   * product with `GET /products/:id` — inside an empty catch, while this modal
   * closed without awaiting. When that read failed the product existed but no
   * row appeared and nothing was said, so the user created it a second time
   * (2026-08-23 audit). `POST /products` already returns the whole row, so the
   * second request is unnecessary — and with it the failure mode is gone.
   */
  onCreated: (created: CreatedProduct) => void;
}) {
  const pf = useProductForm();
  const { t, form } = pf;
  const tCommon = useTranslations('common');
  const { toast } = useToast();
  const { user } = useAuth();

  // Same gate as /products/new: without `product.create` the server rejects BOTH
  // calls this form makes, and the doomed `allocate-code` 403 used to vanish into
  // an empty `.catch()` — «Код» stayed blank, the user filled the whole card, and
  // only «Сохранить» revealed it. The page was fixed on 2026-08-22 (d7937657);
  // this modal is the SECOND entry point and was left behind, even though it is
  // the one B2B flows open («Создать новый товар "…"» from supplies/demands).
  // Fail-open while the matrix loads; the real lock is the server's
  // @RequirePermission({ entity: 'product', action: 'create' }).
  const { can } = usePermissions();
  const allowedToCreate = can('product', 'create');

  // One-time init (mirror /products/new): a barcode row, a fresh sequential «Код»,
  // and the typed query as the name.
  const initedRef = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: one-time mount init; pf.addBarcode/form.setValue are stable.
  useEffect(() => {
    if (initedRef.current || !allowedToCreate) return;
    initedRef.current = true;
    pf.addBarcode();
    if (initialName) form.setValue('name', initialName);
    api
      .post<{ code: string }>('/products/allocate-code', {})
      .then((r) => form.setValue('code', r.code))
      // Non-permission failures (network) stay silent on purpose — the server
      // allocates the code itself when the field is submitted empty, so a blank
      // «Код» is recoverable. The 403 case is handled by the gate above.
      .catch(() => {});
    // `allowedToCreate` flips false→true when the permission matrix resolves;
    // without it in deps the init would never run on a cold session.
  }, [allowedToCreate]);

  // «Сотрудник» (owner) = current user, once auth resolves.
  const ownerSetRef = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: do-once when user resolves; pf setters are stable.
  useEffect(() => {
    if (ownerSetRef.current || !user) return;
    ownerSetRef.current = true;
    form.setValue('ownerId', user.id);
    pf.setOwnerLabel(user.name);
  }, [user]);

  const createMut = useApiMutation({
    // Mirror /products/new: the catalog list caches for 30s, so a product
    // created from a document must not be missing from it afterwards.
    invalidateKeys: [['products']],
    mutationFn: async () => {
      const v = form.getValues();
      const created = await api.post<CreatedProduct>('/products', {
        ...pf.buildPayload('create'),
        packs: pf.baseTasnifPack(v.uom || 'шт'),
      });
      // Staged images — best-effort but REPORTED (mirror /products/new): they
      // need `attachment.create`, a different permission box, and the modal
      // closes right after, so a silent drop was invisible twice over.
      const { failed } = await uploadStagedImages(created.id, pf.stagedImages);
      if (failed > 0) toast.warning(t('images_upload_failed', { count: failed }));
      return created;
    },
    onSuccess: (created) => {
      onCreated(created);
      onClose();
    },
  });

  const handleSave = form.handleSubmit(() => {
    if (pf.markingType !== 'none' && !(form.getValues('gtin') ?? '').trim()) {
      form.setError('gtin', { message: t('gtin_required') });
      return;
    }
    createMut.mutate();
  });

  return (
    <Modal
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={t('modal_title_create')}
      widthClass={allowedToCreate ? 'w-[1160px] max-w-[96vw]' : 'w-[520px] max-w-[92vw]'}
    >
      {!allowedToCreate ? (
        <div className="px-4 py-4" data-test-id="product-create-modal-forbidden">
          <Alert tone="destructive" title={t('no_permission_title')}>
            {t('no_permission_desc')}
          </Alert>
        </div>
      ) : (
        <form
          onSubmit={handleSave}
          // A barcode scanner ends its read with Enter. With a submit button in
          // the form and the name pre-filled from the typed query, that Enter
          // used to save immediately — creating a product with no price and no
          // group, and appending it to the document (2026-08-23 audit). Saving
          // is the button's job; `<textarea>` newlines and a focused button's
          // own Enter are left alone.
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || e.defaultPrevented) return;
            const tag = (e.target as HTMLElement).tagName;
            if (tag === 'TEXTAREA' || tag === 'BUTTON') return;
            e.preventDefault();
          }}
          data-test-id="product-create-modal-form"
        >
          <div className="mb-3">
            <label htmlFor="pcm-name" className="mb-1 block text-[var(--ms-text-muted)] text-xs">
              <span className="text-[var(--ms-text-destructive)]">*</span> {t('name_label')}
            </label>
            <Input
              id="pcm-name"
              data-test-id="field-name"
              invalid={!!form.formState.errors.name}
              className="h-9 w-full font-semibold text-[15px]"
              {...form.register('name')}
            />
            {form.formState.errors.name && (
              <p className="mt-1 text-[var(--ms-text-destructive)] text-xs">
                {form.formState.errors.name.message}
              </p>
            )}
          </div>

          <div className="max-h-[68vh] overflow-y-auto pr-1">
            <ProductFormShell
              left={<ProductFormLeftCards pf={pf} />}
              right={<ProductPriceEditor pf={pf} />}
            />
          </div>

          <div className="mt-3 flex justify-end gap-2 border-[var(--ms-border-default)] border-t pt-3">
            <Button type="button" variant="secondary" onClick={onClose}>
              {tCommon('cancel')}
            </Button>
            <Button
              type="submit"
              disabled={createMut.isPending}
              data-test-id="product-create-modal-save"
            >
              {tCommon('save')}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
