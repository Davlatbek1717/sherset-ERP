'use client';

import type { DocumentTotalsLabels } from '@moysklad/ui';
import { useTranslations } from 'next-intl';

/**
 * Captions for `<DocumentTotalsPanel>`.
 *
 * The design-system carries no i18n, so before this the totals block rendered
 * hardcoded Russian in EVERY locale — the uz UI showed «Промежуточный итог /
 * НДС / Итого / Прибыль / Кол-во» (found on prod 2026-07-31). One hook keeps
 * all 15 call sites on the same `detail_totals` namespace.
 */
export function useTotalsLabels(): DocumentTotalsLabels {
  const t = useTranslations('detail_totals');
  return {
    subtotal: t('subtotal'),
    vat: t('vat'),
    vatIncluded: t('vat_included'),
    total: t('total'),
    profit: t('profit'),
    commission: t('commission'),
    commitent: t('commitent'),
    weight: t('weight'),
    volume: t('volume'),
    // moysklad's «Кол-во» — the key predates this hook, hence the short name.
    quantity: t('qty'),
  };
}
