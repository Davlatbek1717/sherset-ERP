'use client';

/**
 * ProductEditModal — the moysklad «Редактирование товара» card, opened as an
 * OVERLAY from anywhere a product is referenced (a document position's name,
 * a catalog row, …) so the user edits the product WITHOUT leaving the page they
 * are on (e.g. an unsaved receipt draft).
 *
 * It reuses the EXACT building blocks of /products/[id] — `useProductForm` +
 * `ProductFormLeftCards` + `ProductDetailWidget` + `ProductPriceEditor` — so the
 * modal and the full page can't drift apart. It does NOT import the page (no
 * routing coupling); it only shares the leaf components + the save contract
 * (PATCH + optimistic-lock `version` + packs wholesale-replace).
 *
 * Mount it CONDITIONALLY (`{id && <ProductEditModal .../>}`) so every open starts
 * from a fresh form instance — no stale state carried between products.
 */

import { ImageGallery } from '@/components/image-gallery';
import { type PackDraft, ProductDetailWidget } from '@/components/product-detail-widget';
import { ProductFormShell } from '@/components/product-form-layout';
import { ProductFormLeftCards } from '@/components/products/product-form-left-cards';
import { ProductPriceEditor } from '@/components/products/product-price-editor';
import { type ProductHydrateInput, useProductForm } from '@/components/products/use-product-form';
import { useApiMutation } from '@/hooks/use-api-mutation';
import { useConflictReload } from '@/hooks/use-conflict-reload';
import { api } from '@/lib/api-client';
import { Button, Input, Modal } from '@moysklad/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

interface ProductPack {
  id: string;
  name: string;
  uomCode: string;
  multiplier: string;
  barcode: string | null;
  codeType: string | null;
  tasnifCode: string | null;
  position: number;
}

type PackPayload = {
  name: string;
  uomCode: string;
  multiplier: string;
  barcode: string | undefined;
  codeType: string | undefined;
  tasnifCode: string | undefined;
  position: number;
};

interface ProductDetail extends ProductHydrateInput {
  id: string;
  kind: string;
  vatEnabled: boolean;
  partialDisposal: boolean;
  archived: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  owner: { id: string; name: string; email: string } | null;
  packs: ProductPack[];
}

export function ProductEditModal({
  productId,
  open,
  onClose,
  onSaved,
}: {
  productId: string;
  open: boolean;
  onClose: () => void;
  /** Fired after a successful save (the parent can refresh the product's price/name). */
  onSaved?: () => void;
}) {
  const t = useTranslations('pages.product_new');
  const tCommon = useTranslations('common');
  const qc = useQueryClient();
  const pf = useProductForm();

  const { data } = useQuery<ProductDetail>({
    queryKey: ['product', productId],
    queryFn: () => api.get<ProductDetail>(`/products/${productId}`),
    enabled: open && !!productId,
  });

  const [packs, setPacks] = useState<PackDraft[]>([]);
  const [packsChanged, setPacksChanged] = useState(false);
  const onPacksChange = (next: PackDraft[]) => {
    setPacks(next);
    setPacksChanged(true);
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-hydrate ONLY when the loaded product changes (pf uses stable setters; adding pf would wipe edits every render).
  useEffect(() => {
    if (!data) return;
    pf.hydrate(data);
    setPacks(
      (data.packs ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        uomCode: p.uomCode,
        multiplier: p.multiplier,
        barcode: p.barcode ?? '',
        codeType: p.codeType ?? 'ean13',
        tasnifCode: p.tasnifCode ?? '',
      })),
    );
    setPacksChanged(false);
  }, [data]);

  // Packs payload — identical contract to /products/[id]: the base unit's ТАСНИф
  // codes (from the «Особенности учёта» card) overlay onto pack position 0.
  const buildEditPacks = (): PackPayload[] => {
    const rows: PackPayload[] = packs
      .filter((p) => p.name.trim() !== '')
      .map((p, idx) => ({
        name: p.name.trim(),
        uomCode: p.uomCode.trim() || 'шт',
        multiplier: p.multiplier,
        barcode: p.barcode.trim() || undefined,
        codeType: p.codeType.trim() || undefined,
        tasnifCode: p.tasnifCode.trim() || undefined,
        position: idx,
      }));
    const tas = pf.packTasnif.trim();
    const bar = pf.barcodeTasnif.trim();
    if (tas || bar) {
      const uom = pf.form.getValues('uom') || 'шт';
      const base = rows[0];
      if (!base) {
        rows.push({
          name: uom.slice(0, 255),
          uomCode: uom.slice(0, 20),
          multiplier: '1000',
          barcode: bar || undefined,
          codeType: undefined,
          tasnifCode: tas || undefined,
          position: 0,
        });
      } else {
        rows[0] = { ...base, tasnifCode: tas || base.tasnifCode, barcode: bar || base.barcode };
      }
    }
    return rows;
  };

  const onConflict = useConflictReload(['product', productId]);
  const updateMut = useApiMutation({
    onConflict,
    mutationFn: async () => {
      if (!data) throw new Error('not loaded');
      return api.patch<ProductDetail>(`/products/${productId}`, {
        ...pf.buildPayload('edit'),
        version: data.version,
        packs: buildEditPacks(),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['product', productId] });
      qc.invalidateQueries({ queryKey: ['products'] });
      pf.setAuxDirty(false);
      setPacksChanged(false);
      onSaved?.();
      onClose();
    },
  });

  const isDirty = pf.form.formState.isDirty || pf.auxDirty || packsChanged;
  const handleSave = pf.form.handleSubmit(() => {
    if (pf.markingType !== 'none' && !(pf.form.getValues('gtin') ?? '').trim()) {
      pf.form.setError('gtin', { message: t('gtin_required') });
      return;
    }
    updateMut.mutate();
  });

  return (
    <Modal
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={t('modal_title_edit')}
      widthClass="w-[1160px] max-w-[96vw]"
    >
      {!data ? (
        <div className="p-8 text-[var(--ms-text-muted)] text-sm">{tCommon('loading')}</div>
      ) : (
        <form onSubmit={handleSave} data-test-id="product-edit-modal-form">
          <div className="mb-3">
            <label htmlFor="pem-name" className="mb-1 block text-[var(--ms-text-muted)] text-xs">
              <span className="text-[var(--ms-text-destructive)]">*</span> {t('name_label')}
            </label>
            <Input
              id="pem-name"
              data-test-id="field-name"
              invalid={!!pf.form.formState.errors.name}
              className="h-9 w-full font-semibold text-[15px]"
              {...pf.form.register('name')}
            />
            {pf.form.formState.errors.name && (
              <p className="mt-1 text-[var(--ms-text-destructive)] text-xs">
                {pf.form.formState.errors.name.message}
              </p>
            )}
          </div>

          {/* The full 2-column form scrolls inside the modal body. */}
          <div className="max-h-[68vh] overflow-y-auto pr-1">
            <ProductFormShell
              left={
                <ProductFormLeftCards
                  pf={pf}
                  imagesSlot={<ImageGallery productId={data.id} />}
                  productId={data.id}
                />
              }
              right={
                <ProductDetailWidget
                  productId={data.id}
                  buyPrice={data.buyPrice}
                  minPrice={data.minPrice}
                  salePrices={data.salePrices}
                  packs={packs}
                  onPacksChange={onPacksChange}
                  uomItems={pf.uomItems}
                  pricesEditor={<ProductPriceEditor pf={pf} />}
                />
              }
            />
          </div>

          <div className="mt-3 flex justify-end gap-2 border-[var(--ms-border-default)] border-t pt-3">
            <Button type="button" variant="secondary" onClick={onClose}>
              {tCommon('cancel')}
            </Button>
            <Button
              type="submit"
              disabled={updateMut.isPending || !isDirty}
              data-test-id="product-edit-modal-save"
            >
              {tCommon('save')}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
