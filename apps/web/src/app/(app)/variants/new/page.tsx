'use client';

import { DetailHeader, DetailToolbar } from '@/components/document-detail';
import { api } from '@/lib/api-client';
import { usePriceTypeIds } from '@/lib/sale-price';
import {
  Button,
  CatalogPicker,
  CatalogPickerField,
  FormField,
  FormSection,
  Icons,
  Input,
  type PickerItem,
} from '@moysklad/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

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

function uid() {
  return Math.random().toString(36).slice(2);
}

export default function NewVariantPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations('pages.variants');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');

  const { defaultId } = usePriceTypeIds();

  const fromProductId = searchParams.get('productId');

  const [productId, setProductId] = useState<string | null>(fromProductId);
  const [productLabel, setProductLabel] = useState('');
  const [code, setCode] = useState('');
  const [barcode, setBarcode] = useState('');
  const [characteristics, setCharacteristics] = useState<Characteristic[]>([
    { _uid: uid(), name: 'Color', value: '' },
  ]);
  const [salePrice, setSalePrice] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prefill product label if ?productId= provided
  const { data: fromProduct } = useQuery<ProductRef>({
    queryKey: ['product', fromProductId],
    queryFn: () => api.get(`/products/${fromProductId}`),
    enabled: !!fromProductId,
  });
  useEffect(() => {
    if (fromProduct && !productLabel) {
      setProductLabel(fromProduct.name);
    }
  }, [fromProduct, productLabel]);

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

  const createMut = useMutation({
    mutationFn: async () => {
      if (!productId) throw new Error(t('err_product_required'));
      if (characteristics.length === 0) throw new Error(t('err_min_one_characteristic'));
      for (const c of characteristics) {
        if (!c.name.trim() || !c.value.trim()) {
          throw new Error(t('err_characteristic_fields'));
        }
      }
      return api.post<{ id: string }>('/variants', {
        productId,
        code: code || undefined,
        barcode: barcode || undefined,
        characteristics: characteristics.map(({ name, value }) => ({ name, value })),
        salePrices: salePrice
          ? [{ priceTypeId: defaultId ?? 'default', value: BigInt(salePrice).toString() }]
          : undefined,
        buyPrice: buyPrice ? BigInt(buyPrice).toString() : undefined,
      });
    },
    onSuccess: (created) => router.push(`/variants/${created.id}`),
    onError: (e: Error) => setError(e.message),
  });

  const handleSave = () => {
    setError(null);
    createMut.mutate();
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleSave();
      }}
      className="flex min-h-screen flex-col bg-[var(--ms-bg-page)]"
      data-test-id="variant-new-page"
    >
      <DetailToolbar
        isDirty={!!(productId || code || barcode || salePrice || buyPrice)}
        isSaving={createMut.isPending}
        onSave={handleSave}
        onClose={() => router.push('/variants')}
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
      {error && (
        <div className="border-[var(--ms-destructive-100)] border-b bg-[var(--ms-destructive-50)] px-4 py-2 text-[var(--ms-text-destructive)] text-sm">
          {error}
        </div>
      )}
      <main className="flex-1 px-4 py-4">
        <div className="space-y-4">
          <FormSection title={t('section_main')}>
            <FormField id="product" label={t('parent_product')} required>
              <CatalogPickerField
                value={productId ? { id: productId, label: productLabel } : null}
                placeholder={t('select_product')}
                onPick={() => setPickerOpen(true)}
                onClear={() => {
                  setProductId(null);
                  setProductLabel('');
                }}
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

          <CatalogPicker
            open={pickerOpen}
            onClose={() => setPickerOpen(false)}
            title={t('select_product')}
            fetcher={productFetcher}
            onSelect={(item) => {
              setProductId(item.id);
              setProductLabel(String(item.primary));
            }}
          />
        </div>
      </main>
    </form>
  );
}
