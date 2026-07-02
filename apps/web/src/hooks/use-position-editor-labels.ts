'use client';

import type { PositionEditorLabels } from '@moysklad/ui';
import { useTranslations } from 'next-intl';

/**
 * Locale-aware labels for the shared <PositionEditor>.
 *
 * The design-system <PositionEditor> lives in `@moysklad/ui` and is
 * intentionally locale-agnostic, so its `DEFAULT_LABELS` are a hardcoded
 * Uzbek fallback. Detail pages that don't pass a `labels` prop therefore
 * render the position table in Uzbek even when the active locale is
 * Russian — a parity/i18n leak the customer-order detail audit surfaced
 * (2026-06-01). This hook resolves the labels from the active locale's
 * `position_editor` namespace so every document detail page can pass them
 * with a single `labels={usePositionEditorLabels()}`.
 */
export function usePositionEditorLabels(): PositionEditorLabels {
  const t = useTranslations('position_editor');
  return {
    empty: t('empty'),
    number: t('number'),
    product: t('product'),
    quantity: t('quantity'),
    pricePerUnit: t('pricePerUnit'),
    costPerUnit: t('costPerUnit'),
    discount: t('discount'),
    vat: t('vat'),
    lineTotal: t('lineTotal'),
    addPosition: t('addPosition'),
    pickProduct: t('pickProduct'),
    productPickerTitle: t('productPickerTitle'),
    subtotal: t('subtotal'),
    vatRow: t('vatRow'),
    total: t('total'),
    createProduct: t('createProduct'),
  };
}
