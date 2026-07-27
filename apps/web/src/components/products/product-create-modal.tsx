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
import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';
import { Button, Input, Modal } from '@moysklad/ui';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';

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
  /** Fired with the created product so the caller can append it as a position. */
  onCreated: (created: { id: string }) => void;
}) {
  const pf = useProductForm();
  const { t, form } = pf;
  const tCommon = useTranslations('common');
  const { user } = useAuth();

  // One-time init (mirror /products/new): a barcode row, a fresh sequential «Код»,
  // and the typed query as the name.
  const initedRef = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: one-time mount init; pf.addBarcode/form.setValue are stable.
  useEffect(() => {
    if (initedRef.current) return;
    initedRef.current = true;
    pf.addBarcode();
    if (initialName) form.setValue('name', initialName);
    api
      .post<{ code: string }>('/products/allocate-code', {})
      .then((r) => form.setValue('code', r.code))
      .catch(() => {});
  }, []);

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
    mutationFn: async () => {
      const v = form.getValues();
      const created = await api.post<{ id: string }>('/products', {
        ...pf.buildPayload('create'),
        packs: pf.baseTasnifPack(v.uom || 'шт'),
      });
      // Staged images — best-effort (the product already exists; a failed image
      // must not fail the create). Mirrors /products/new.
      for (const img of pf.stagedImages) {
        try {
          await api.post(`/products/${created.id}/images`, {
            filename: img.name,
            mime: img.mime,
            dataBase64: img.dataUrl,
          });
        } catch {
          // best-effort
        }
      }
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
      widthClass="w-[1160px] max-w-[96vw]"
    >
      <form onSubmit={handleSave} data-test-id="product-create-modal-form">
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
    </Modal>
  );
}
