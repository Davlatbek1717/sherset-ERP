'use client';

/**
 * /variants/[id] — inline-edit detail page (moysklad-parity).
 *
 * Mirrors /variants/new layout. State is managed manually (not via
 * react-hook-form) to match the /new page pattern — isDirty is derived
 * from comparing current state to the loaded snapshot.
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
import {
  Alert,
  Avatar,
  Button,
  CatalogPicker,
  CatalogPickerField,
  FormField,
  FormSection,
  Icons,
  Input,
  type PickerItem,
  formatDate,
} from '@moysklad/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

interface Characteristic {
  _uid: string;
  name: string;
  value: string;
}

interface ProductRef {
  id: string;
  name: string;
  code: string | null;
}

interface VariantDetail {
  id: string;
  name: string;
  code: string | null;
  externalCode: string | null;
  barcode: string | null;
  characteristics: Array<{ name: string; value: string }>;
  salePrices: Array<{ priceTypeId: string; value: string }> | null;
  buyPrice: string | null;
  archived: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  productId: string;
  product: { id: string; name: string; code: string | null } | null;
  owner?: { id: string; name: string; email: string } | null;
}

function uid() {
  return Math.random().toString(36).slice(2);
}

export default function VariantDetailPage() {
  const tCommon = useTranslations('common');
  const tDetailHeader = useTranslations('detail_header');
  const tFields = useTranslations('fields');
  const t = useTranslations('pages.variants');
  const { id } = useParams<{ id: string }>();
  const detailNav = useDetailNavigation('variants', id);
  const router = useRouter();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<VariantDetail>({
    queryKey: ['variant', id],
    queryFn: () => api.get<VariantDetail>(`/variants/${id}`),
  });

  const { defaultId } = usePriceTypeIds();
  // Valyuta kurslari — valyutali salePrices'ni baza valyutasiga o'girish uchun.
  // Erta `return`'dan OLDIN (usePriceTypeIds yonida) turishi SHART.
  const rates = useCurrencyRates();

  // Editable state
  const [code, setCode] = useState('');
  const [barcode, setBarcode] = useState('');
  const [characteristics, setCharacteristics] = useState<Characteristic[]>([]);
  const [salePrice, setSalePrice] = useState('');
  const [buyPrice, setBuyPrice] = useState('');

  // Snapshot for isDirty comparison
  const snapshot = useRef({
    code: '',
    barcode: '',
    characteristics: '[]',
    salePrice: '',
    buyPrice: '',
  });

  // `rates` ham dep: kurslar `data`dan kech kelishi mumkin va kelganda
  // valyutali narx qayta hisoblanishi kerak. `useCurrencyRates` memolangan,
  // ya'ni identifikator faqat javob o'zgarganda almashadi (`defaultId` bilan
  // bir xil rol).
  useEffect(() => {
    if (!data) return;
    const defaultValue = resolveDefaultSalePrice(data.salePrices, defaultId, rates);
    const chars: Characteristic[] = (data.characteristics ?? []).map((c) => ({
      _uid: uid(),
      name: c.name,
      value: c.value,
    }));
    const sp = defaultValue ?? '';
    const bp = data.buyPrice ?? '';
    const c = data.code ?? '';
    const b = data.barcode ?? '';
    setCode(c);
    setBarcode(b);
    setCharacteristics(chars);
    setSalePrice(sp);
    setBuyPrice(bp);
    snapshot.current = {
      code: c,
      barcode: b,
      characteristics: JSON.stringify(chars.map(({ name, value }) => ({ name, value }))),
      salePrice: sp,
      buyPrice: bp,
    };
  }, [data, defaultId, rates]);

  const isDirty =
    code !== snapshot.current.code ||
    barcode !== snapshot.current.barcode ||
    salePrice !== snapshot.current.salePrice ||
    buyPrice !== snapshot.current.buyPrice ||
    JSON.stringify(characteristics.map(({ name, value }) => ({ name, value }))) !==
      snapshot.current.characteristics;

  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const productFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: ProductRef[] }>(
      `/products?search=${encodeURIComponent(s)}&kind=product&limit=50`,
    );
    return d.items.map((p) => ({ id: p.id, primary: p.name, secondary: p.code ?? undefined }));
  };

  const addCharacteristic = () => {
    setCharacteristics((xs) => [...xs, { _uid: uid(), name: '', value: '' }]);
  };

  const updateCharacteristic = (u: string, patch: Partial<Characteristic>) => {
    setCharacteristics((xs) => xs.map((c) => (c._uid === u ? { ...c, ...patch } : c)));
  };

  const removeCharacteristic = (u: string) => {
    setCharacteristics((xs) => xs.filter((c) => c._uid !== u));
  };

  const onConflict = useConflictReload(['variant', id]);
  const updateMut = useApiMutation({
    onConflict,
    mutationFn: async () => {
      if (!data) throw new Error('not loaded');
      if (characteristics.length === 0) throw new Error(t('err_min_one_characteristic'));
      for (const c of characteristics) {
        if (!c.name.trim() || !c.value.trim()) {
          throw new Error(t('err_characteristic_fields'));
        }
      }
      return api.patch<VariantDetail>(`/variants/${id}`, {
        version: data.version,
        code: code || null,
        barcode: barcode || null,
        characteristics: characteristics.map(({ name, value }) => ({ name, value })),
        salePrices: salePrice
          ? [{ priceTypeId: defaultId ?? 'default', value: BigInt(salePrice).toString() }]
          : undefined,
        buyPrice: buyPrice ? BigInt(buyPrice).toString() : undefined,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['variant', id] });
      qc.invalidateQueries({ queryKey: ['variants'] });
      setError(null);
    },
  });

  const archiveMut = useApiMutation({
    mutationFn: (archive: boolean) =>
      api.post(`/variants/${id}/${archive ? 'archive' : 'restore'}`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['variant', id] });
      qc.invalidateQueries({ queryKey: ['variants'] });
    },
  });

  const deleteMut = useApiMutation({
    mutationFn: () => api.delete(`/variants/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['variants'] });
      router.push('/variants');
    },
  });

  const { runDestructive } = useDestructiveMutation();

  if (isLoading)
    return <div className="p-8 text-[var(--ms-text-muted)] text-sm">{tCommon('loading')}</div>;
  if (!data) return <div className="p-8 text-sm">{tCommon('not_found')}</div>;

  const handleSave = () => {
    setError(null);
    updateMut.mutate(undefined, {
      // Optimistic-lock conflicts are surfaced by the reload dialog (onConflict),
      // not the inline error banner.
      onError: (e) => {
        if (!isOptimisticConflict(e)) setError((e as Error).message);
      },
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleSave();
      }}
      className="flex min-h-screen flex-col bg-[var(--ms-bg-page)]"
      data-test-id="variant-detail-page"
    >
      <DetailToolbar
        isDirty={isDirty}
        isSaving={updateMut.isPending}
        onSave={handleSave}
        onClose={() => router.push('/variants')}
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
        {(error || updateMut.error || archiveMut.error) && (
          <Alert tone="destructive" className="mb-3">
            {error ?? ((updateMut.error ?? archiveMut.error) as Error).message}
          </Alert>
        )}

        <div className="space-y-4">
          <FormSection title={t('section_main')}>
            {/* Parent product is read-only on the detail page */}
            <FormField id="product" label={t('parent_product')} required>
              <CatalogPickerField
                value={data.product ? { id: data.product.id, label: data.product.name } : null}
                placeholder={t('select_product')}
                onPick={() => setPickerOpen(true)}
                onClear={() => {}}
                disabled
                testId="field-product"
              />
            </FormField>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField id="code" label={tFields('code')}>
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  data-test-id="field-code"
                />
              </FormField>
              <FormField id="barcode" label={t('barcode')}>
                <Input
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  data-test-id="field-barcode"
                />
              </FormField>
            </div>
          </FormSection>

          <FormSection title={t('characteristics')} description={t('characteristics_hint')}>
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr,1fr,40px] gap-2 px-2 font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                <div>{t('char_name')}</div>
                <div>{t('char_value')}</div>
                <div />
              </div>
              {characteristics.map((c) => (
                <div
                  key={c._uid}
                  className="grid grid-cols-[1fr,1fr,40px] items-center gap-2"
                  data-test-id={`char-row-${c._uid}`}
                >
                  <Input
                    value={c.name}
                    onChange={(e) => updateCharacteristic(c._uid, { name: e.target.value })}
                    placeholder={t('char_name_placeholder')}
                  />
                  <Input
                    value={c.value}
                    onChange={(e) => updateCharacteristic(c._uid, { value: e.target.value })}
                    placeholder={t('char_value_placeholder')}
                  />
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => removeCharacteristic(c._uid)}
                    aria-label={tCommon('delete_row')}
                  >
                    <Icons.close className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="secondary" onClick={addCharacteristic}>
                <Icons.create className="h-4 w-4" />
                {t('add_characteristic')}
              </Button>
            </div>
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
              <FormField id="buy-price" label={t('buy_price_label')}>
                <Input
                  value={buyPrice}
                  onChange={(e) => setBuyPrice(e.target.value)}
                  inputMode="numeric"
                  className="text-right"
                  data-test-id="field-buy-price"
                />
              </FormField>
            </div>
          </FormSection>

          <DocumentTabs auditEntity="Variant" entityId={data.id} relatedGroups={[]} />
        </div>
      </main>

      <CatalogPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title={t('select_product')}
        fetcher={productFetcher}
        onSelect={() => {
          // product reassignment not supported on edit — picker is disabled
          setPickerOpen(false);
        }}
      />
    </form>
  );
}
