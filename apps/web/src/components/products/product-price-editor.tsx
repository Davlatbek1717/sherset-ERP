'use client';

/**
 * ProductPriceEditor — the editable «Цены» content shared by the create form
 * (/products/new right column) and the edit form (/products/[id] right column,
 * via ProductDetailWidget's `pricesEditor` slot). moysklad shows the SAME price
 * editor on create and edit, so it lives here once: «Минимальная» / «Закупочная»
 * (MoneyInput + currency combo + ✏ rate), then one row per account price type,
 * and «Запретить скидки».
 *
 * All state comes from `useProductForm` (the `pf` object) so both pages stay 1:1.
 * Non-RHF changes (sale prices, currencies) call `pf.markAuxDirty()` so the edit
 * page's Save button lights up (buy/min are RHF fields → covered by form dirty).
 */

import { PriceRateDialog } from '@/components/products/price-rate-dialog';
import type { ProductFormApi } from '@/components/products/use-product-form';
import { Checkbox, Combobox, Icons, MoneyInput } from '@moysklad/ui';
import { Controller } from 'react-hook-form';

export function ProductPriceEditor({ pf }: { pf: ProductFormApi }) {
  const {
    t,
    tCommon,
    form,
    priceTypes,
    currencyItems,
    baseCurrencyCode,
    rateForCode,
    salePrices,
    setSalePrices,
    setSalePriceCurrencies,
    salePriceRates,
    setSalePriceRates,
    minPriceCurrency,
    setMinPriceCurrency,
    buyPriceCurrency,
    setBuyPriceCurrency,
    rateDialogFor,
    setRateDialogFor,
    rateDialogCode,
    saleCurrencyOf,
    markAuxDirty,
  } = pf;

  return (
    <>
      <div className="space-y-2.5">
        <div className="grid grid-cols-[150px_minmax(0,1fr)] items-center gap-x-3">
          <label
            htmlFor="minPrice"
            className="inline-flex items-center gap-1 text-[var(--ms-text-muted)] text-sm"
          >
            {t('min_price_label')}
            <Icons.help className="size-3.5 text-[var(--ms-text-brand)]" aria-hidden />
          </label>
          <div className="flex items-center gap-1.5">
            <Controller
              control={form.control}
              name="minPrice"
              render={({ field }) => (
                <MoneyInput
                  id="minPrice"
                  data-test-id="field-minPrice"
                  allowEmpty
                  displayFormatted
                  valueMinor={field.value ?? ''}
                  onChangeMinor={field.onChange}
                  className="max-w-[220px] text-right tabular-nums"
                />
              )}
            />
            <Combobox
              ariaLabel={t('currency_label')}
              items={currencyItems}
              value={minPriceCurrency || baseCurrencyCode}
              onChange={(c) => {
                setMinPriceCurrency(c ?? '');
                markAuxDirty();
              }}
              clearable={false}
              searchPlaceholder={tCommon('search')}
              testId="field-minPrice-currency"
              className="w-36 shrink-0"
            />
            <button
              type="button"
              onClick={() => setRateDialogFor('min')}
              aria-label={t('currency_label')}
              className="shrink-0 px-1 text-[var(--ms-text-brand)] hover:opacity-80"
              data-test-id="price-rate-edit-min"
            >
              <Icons.edit className="size-3.5" aria-hidden />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-[150px_minmax(0,1fr)] items-center gap-x-3">
          <label
            htmlFor="buyPrice"
            className="inline-flex items-center gap-1 text-[var(--ms-text-muted)] text-sm"
          >
            {t('buy_price_label')}
            <Icons.help className="size-3.5 text-[var(--ms-text-brand)]" aria-hidden />
          </label>
          <div className="flex items-center gap-1.5">
            <Controller
              control={form.control}
              name="buyPrice"
              render={({ field }) => (
                <MoneyInput
                  id="buyPrice"
                  data-test-id="field-buyPrice"
                  allowEmpty
                  displayFormatted
                  valueMinor={field.value ?? ''}
                  onChangeMinor={field.onChange}
                  className="max-w-[220px] text-right tabular-nums"
                />
              )}
            />
            <Combobox
              ariaLabel={t('currency_label')}
              items={currencyItems}
              value={buyPriceCurrency || baseCurrencyCode}
              onChange={(c) => {
                setBuyPriceCurrency(c ?? '');
                markAuxDirty();
              }}
              clearable={false}
              searchPlaceholder={tCommon('search')}
              testId="field-buyPrice-currency"
              className="w-36 shrink-0"
            />
            <button
              type="button"
              onClick={() => setRateDialogFor('buy')}
              aria-label={t('currency_label')}
              className="shrink-0 px-1 text-[var(--ms-text-brand)] hover:opacity-80"
              data-test-id="price-rate-edit-buy"
            >
              <Icons.edit className="size-3.5" aria-hidden />
            </button>
          </div>
        </div>
      </div>

      {/* «Цены продажи»: one row per account price type. */}
      {priceTypes.length > 0 && (
        <div className="mt-4">
          {/* moysklad parity: «Цены продажи» is a MUTED heading (not bold black) +
            a blue «?» help icon. */}
          <h3 className="mb-2 inline-flex items-center gap-1 text-[var(--ms-text-muted)] text-sm">
            {t('sale_prices_heading')}
            <Icons.help className="size-3.5 text-[var(--ms-text-brand)]" aria-hidden />
          </h3>
          <div className="space-y-2.5">
            {priceTypes.map((pt) => (
              <div
                key={pt.id}
                className="grid grid-cols-[150px_minmax(0,1fr)] items-center gap-x-3"
              >
                <label htmlFor={`price-${pt.id}`} className="text-[var(--ms-text-muted)] text-sm">
                  {pt.name}
                </label>
                <div className="flex items-center gap-1.5">
                  <MoneyInput
                    id={`price-${pt.id}`}
                    data-test-id={`field-price-${pt.id}`}
                    allowEmpty
                    displayFormatted
                    valueMinor={salePrices[pt.id] ?? ''}
                    onChangeMinor={(m) => {
                      setSalePrices((prev) => ({ ...prev, [pt.id]: m }));
                      markAuxDirty();
                    }}
                    className="max-w-[220px] text-right tabular-nums"
                  />
                  <Combobox
                    ariaLabel={t('currency_label')}
                    items={currencyItems}
                    // moysklad parity: defaults to «сум (UZS)» (saleCurrencyOf).
                    value={saleCurrencyOf(pt)}
                    onChange={(c) => {
                      setSalePriceCurrencies((prev) => ({ ...prev, [pt.id]: c ?? '' }));
                      markAuxDirty();
                    }}
                    clearable={false}
                    searchPlaceholder={tCommon('search')}
                    testId={`field-price-currency-${pt.id}`}
                    className="w-36 shrink-0"
                  />
                  <button
                    type="button"
                    onClick={() => setRateDialogFor(pt.id)}
                    aria-label={t('currency_label')}
                    className="shrink-0 px-1 text-[var(--ms-text-brand)] hover:opacity-80"
                    data-test-id={`price-rate-edit-${pt.id}`}
                  >
                    <Icons.edit className="size-3.5" aria-hidden />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {rateDialogFor && (
        <PriceRateDialog
          open
          onClose={() => setRateDialogFor(null)}
          currencyCode={rateDialogCode}
          baseCode={baseCurrencyCode}
          referenceRate={rateForCode(rateDialogCode)}
          customRate={salePriceRates[rateDialogFor] ?? null}
          onApply={(rate) => {
            const id = rateDialogFor;
            if (!id) return;
            setSalePriceRates((prev) => {
              const next = { ...prev };
              if (rate == null) delete next[id];
              else next[id] = rate;
              return next;
            });
            markAuxDirty();
          }}
        />
      )}

      {/* moysklad parity: a faint divider separates the prices from the checkbox. */}
      <div className="mt-4 border-[var(--ms-border-default)] border-t" />
      <div className="mt-3 flex w-fit items-center gap-2 text-sm">
        <Controller
          control={form.control}
          name="discountProhibited"
          render={({ field }) => (
            <Checkbox
              id="discountProhibited"
              checked={!!field.value}
              onCheckedChange={(c) => field.onChange(c === true)}
              data-test-id="field-discountProhibited"
            />
          )}
        />
        <label htmlFor="discountProhibited">{t('discount_prohibited_label')}</label>
      </div>
    </>
  );
}
