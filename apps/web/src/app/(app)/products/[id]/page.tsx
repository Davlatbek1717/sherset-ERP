'use client';

/**
 * /products/[id] — moysklad-parity catalog editor for an existing product.
 *
 * Shares the EXACT form of /products/new (the `useProductForm` hook +
 * `ProductFormLeftCards` + `ProductPriceEditor`), so create and edit are 1:1 and
 * can't drift apart. The only differences are edit chrome (DetailHeader with
 * state/owner/archive), the save verb (PATCH + optimistic-lock `version` +
 * conflict-reload), and a LIVE right column (ProductDetailWidget — Цены editable
 * via the shared editor, plus the functional Модификации / Упаковка / Остатки /
 * История / Файлы / Аналоги tabs that need a saved product).
 */

import { DetailToolbar } from '@/components/document-detail';
import { ImageGallery } from '@/components/image-gallery';
import { type PackDraft, ProductDetailWidget } from '@/components/product-detail-widget';
import { ProductFormShell } from '@/components/product-form-layout';
import { ProductExtraLocations } from '@/components/products/product-extra-locations';
import { ProductFormLeftCards } from '@/components/products/product-form-left-cards';
import { ProductLocationSummary } from '@/components/products/product-location-summary';
import { ProductPriceEditor } from '@/components/products/product-price-editor';
import { type ProductHydrateInput, useProductForm } from '@/components/products/use-product-form';
import { useApiMutation } from '@/hooks/use-api-mutation';
import { useConflictReload } from '@/hooks/use-conflict-reload';
import { useDestructiveMutation } from '@/hooks/use-destructive-mutation';
import { useDetailNavigation } from '@/hooks/use-detail-navigation';
import { api } from '@/lib/api-client';
import { isOptimisticConflict } from '@/lib/optimistic-lock';
import { Alert, Avatar, Input, formatDate } from '@moysklad/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
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

/** Pack row as sent to PATCH /products/:id (wholesale-replace; '' → undefined). */
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
  extraLocations?: Array<{
    sklad: number;
    polka: number | null;
    qavat: number | null;
    yacheyka: number | null;
    // Per-cell qty (Phase 2) — Decimal column, serialized as a string.
    qty: string | null;
    note: string | null;
  }>;
}

export default function ProductDetailPage() {
  const tCommon = useTranslations('common');
  const tDetailHeader = useTranslations('detail_header');
  const t = useTranslations('pages.product_new');
  const { id } = useParams<{ id: string }>();
  const detailNav = useDetailNavigation('products', id);
  const router = useRouter();
  // moysklad continuity: /new's ➕ buttons land here with a tab hint.
  //   ?open=<tab>  → select that tab AND (for variants) open «Создание модификаций»
  //   ?tab=<tab>   → just select that tab (e.g. after modifications are created)
  const searchParams = useSearchParams();
  const openTab = searchParams.get('open') ?? undefined;
  const initialTab = openTab ?? searchParams.get('tab') ?? undefined;
  const qc = useQueryClient();

  const pf = useProductForm();

  const { data, isLoading } = useQuery<ProductDetail>({
    queryKey: ['product', id],
    queryFn: () => api.get<ProductDetail>(`/products/${id}`),
  });

  // Packs (Упаковка tab) are edited in the widget but owned here so the card's
  // single Save button persists them through the same PATCH; like the form's
  // aux state they live outside RHF, so a dirty flag keeps Save live on edits.
  const [packs, setPacks] = useState<PackDraft[]>([]);
  const [packsChanged, setPacksChanged] = useState(false);
  const onPacksChange = (next: PackDraft[]) => {
    setPacks(next);
    setPacksChanged(true);
  };

  // Hydrate the form + every aux state + packs once the API response lands.
  // `reset` (inside hydrate) marks the form pristine so Save stays disabled
  // until the user edits. Re-runs after a save (invalidate → refetch).
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-hydrate ONLY when the loaded product changes; pf.hydrate uses stable setters/form.reset, and adding the unstable `pf` would reset the form every render (wiping edits).
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

  // Packs payload: the Упаковка tab (packDrafts) is the source of truth; the
  // «Особенности учёта» card's «Код упаковки ТАСНИф» / «Штрихкод ТАСНИф» are the
  // base unit's codes (moysklad's home for them, identical to the create form),
  // overlaid onto the base pack (position 0) — a unit pack is created if none.
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
        rows[0] = {
          ...base,
          tasnifCode: tas || base.tasnifCode,
          barcode: bar || base.barcode,
        };
      }
    }
    return rows;
  };

  const onConflict = useConflictReload(['product', id]);
  const updateMut = useApiMutation({
    onConflict,
    mutationFn: async () => {
      // `data` is always loaded here (the form renders only after the early
      // return below); narrow it for TS + carry the optimistic-lock version.
      if (!data) throw new Error('not loaded');
      const payload = {
        ...pf.buildPayload('edit'),
        version: data.version,
        packs: buildEditPacks(),
      };
      return api.patch<ProductDetail>(`/products/${id}`, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['product', id] });
      qc.invalidateQueries({ queryKey: ['products'] });
      pf.setAuxDirty(false);
      setPacksChanged(false);
    },
  });

  const archiveMut = useApiMutation({
    mutationFn: (archive: boolean) =>
      api.post(`/products/${id}/${archive ? 'archive' : 'restore'}`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['product', id] });
      qc.invalidateQueries({ queryKey: ['products'] });
    },
  });

  const deleteMut = useApiMutation({
    mutationFn: () => api.delete(`/products/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      router.push('/products');
    },
  });

  // «Копировать» — duplicate this product (BE clears code/externalCode/barcodes)
  // and open the new copy, mirroring moysklad's «...» → Копировать.
  const cloneMut = useApiMutation({
    mutationFn: () => api.post<{ id: string }>(`/products/${id}/clone`, {}),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['products'] });
      router.push(`/products/${created.id}`);
    },
  });

  const { runDestructive } = useDestructiveMutation();

  if (isLoading)
    return <div className="p-8 text-[var(--ms-text-muted)] text-sm">{tCommon('loading')}</div>;
  if (!data) return <div className="p-8 text-sm">{tCommon('not_found')}</div>;

  // A marked product («Тип продукции» ≠ Не маркируется) requires a GTIN — the BE
  // enforces it too, but guard here for an inline error instead of a 400 banner.
  const handleSave = pf.form.handleSubmit(() => {
    if (pf.markingType !== 'none' && !(pf.form.getValues('gtin') ?? '').trim()) {
      pf.form.setError('gtin', { message: t('gtin_required') });
      return;
    }
    updateMut.mutate();
  });

  const isDirty = pf.form.formState.isDirty || pf.auxDirty || packsChanged;

  return (
    <form
      onSubmit={handleSave}
      className="flex min-h-screen flex-col bg-[var(--ms-bg-page)]"
      data-test-id="product-detail-page"
    >
      <DetailToolbar
        isDirty={isDirty}
        isSaving={updateMut.isPending}
        onSave={() => handleSave()}
        onClose={() => router.push('/products')}
        position={detailNav.position}
        onPrev={detailNav.onPrev}
        onNext={detailNav.onNext}
        // moysklad product card: the «...» (three-dot) menu holds Копировать /
        // Поместить в архив / Удалить — no «Открыть в API», no «Отправить», and
        // archive lives in the menu (not a header pill).
        editMenuStyle="dots"
        // moysklad product card: «Изменения+avatar» leads the right cluster, then
        // Печать, then the «...» overflow — so the rightSlot comes before the menus.
        rightSlotFirst
        hideOpenApi
        hideSendMenu
        onClone={() => cloneMut.mutate()}
        archived={data.archived}
        onArchive={() => archiveMut.mutate(true)}
        onRestore={() => archiveMut.mutate(false)}
        onDelete={() =>
          runDestructive({
            title: tCommon('delete_confirm', { name: data.name }),
            run: () => deleteMut.mutateAsync(),
            successMessage: tCommon('saved'),
          })
        }
        printMenuItems={[
          {
            id: 'senik',
            label: t('print_senik'),
            onSelect: () => router.push(`/labels/print?productId=${id}`),
          },
          {
            id: 'configure',
            label: t('print_configure'),
            onSelect: () => router.push('/settings/label-templates'),
          },
        ]}
        // moysklad product editor has NO title band — the «Изменения: <name>
        // <datetime>» + author avatar live on the TOOLBAR's right edge (next to
        // Печать), not in a separate header row. (No «Владелец»/«Основной» here —
        // owner/group are edited in the «Доступ» left card, like moysklad.)
        rightSlot={
          <div className="flex items-center gap-2 text-xs" data-test-id="detail-header-updated">
            <div className="flex flex-col items-end leading-tight">
              <span className="text-[var(--ms-text-muted)]">
                {tDetailHeader('changed')}:{' '}
                <span className="text-[var(--ms-text-brand)]">{data.owner?.name ?? '—'}</span>
              </span>
              <span className="text-[var(--ms-text-muted)]">{formatDate(data.updatedAt)}</span>
            </div>
            <Avatar
              name={data.owner?.name ?? '—'}
              size="md"
              data-test-id="detail-header-author-avatar"
            />
          </div>
        }
      />

      {/* moysklad goes straight from the toolbar to the product name — a BOLD,
        title-sized input (no «<name> · Код» heading band above it). */}
      <div className="border-[var(--ms-border-default)] border-b bg-[var(--ms-bg-surface)] px-4 py-3">
        <label htmlFor="name" className="mb-1 block text-[var(--ms-text-muted)] text-xs">
          <span className="text-[var(--ms-text-destructive)]">*</span> {t('name_label')}
        </label>
        <Input
          id="name"
          data-test-id="field-name"
          invalid={!!pf.form.formState.errors.name}
          // moysklad name = title field: taller, larger, bold value.
          className="h-9 w-full font-semibold text-[15px]"
          {...pf.form.register('name')}
        />
        {pf.form.formState.errors.name && (
          <p className="mt-1 text-[var(--ms-text-destructive)] text-xs">
            {pf.form.formState.errors.name.message}
          </p>
        )}
      </div>

      <main className="flex-1 px-4 py-4">
        {/* Optimistic-lock conflicts are handled by the reload dialog (onConflict),
            so keep them out of the inline error banner. */}
        {((updateMut.error && !isOptimisticConflict(updateMut.error)) || archiveMut.error) && (
          <Alert tone="destructive" className="mb-3">
            {((updateMut.error ?? archiveMut.error) as Error).message}
          </Alert>
        )}

        <ProductFormShell
          left={
            <ProductFormLeftCards
              pf={pf}
              imagesSlot={<ImageGallery productId={data.id} />}
              extraLocationsSlot={
                <div className="flex flex-col gap-3">
                  {/* «Qayerda qanchadan turibdi» — o'qish paneli (2026-07-12) */}
                  <ProductLocationSummary
                    productId={data.id}
                    locSklad={data.locSklad}
                    locPolka={data.locPolka}
                    locQavat={data.locQavat}
                    locYacheyka={data.locYacheyka}
                    locQty={data.locQty ?? null}
                    extraLocations={data.extraLocations ?? []}
                  />
                  <ProductExtraLocations productId={data.id} initial={data.extraLocations ?? []} />
                </div>
              }
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
              initialTab={initialTab}
              autoOpenModifications={openTab === 'variants'}
              pricesEditor={<ProductPriceEditor pf={pf} />}
            />
          }
        />
      </main>
    </form>
  );
}
