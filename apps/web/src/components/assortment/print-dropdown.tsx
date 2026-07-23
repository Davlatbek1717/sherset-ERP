'use client';

/**
 * Assortment list — "Печать ▾" print-templates dropdown — moysklad parity
 * for the menu STRUCTURE, custom behavior for the two label items.
 *
 * Shared across Товары / Услуги / Комплекты (see bulk-actions-dropdown.tsx for
 * why services and bundles inherit the products/assortment menus).
 *
 * Source-of-truth: docs/moysklad-reference/products/states/metadata.json
 * (captured 2026-05-30 via `pnpm capture-moysklad products`).
 *
 * Authoritative moysklad item set:
 *   1. Ценник (70x49,5мм)
 *   2. Термоэтикетка (58х40мм)
 *   3. Настроить...               (enabled — label-template settings nav)
 *   4. «Запросить форму» promo footer (persistent upsell, grounded live
 *      2026-06-17 on online.moysklad.uz).
 *
 * USER-DIRECTED divergence (2026-07-03): in moysklad items 1–2 stay disabled
 * until a template is configured. Here, when the caller passes a non-empty
 * `selectedIds`, both items are ENABLED and open the custom QR price-tag
 * print flow (qr-price-tag-print.tsx) — the user explicitly requested QR
 * codes (not barcodes) on the printed tags, with the tag's own visual design.
 * Callers that don't pass a selection (services / bundles / serial numbers)
 * keep the moysklad-parity disabled state.
 */

import { Button, DropdownMenu, Icons } from '@moysklad/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { QrPriceTagPrintOverlay, type QrTagFormat } from './qr-price-tag-print';

export function AssortmentPrintDropdown({
  triggerClassName,
  selectedIds,
}: { triggerClassName?: string; selectedIds?: ReadonlySet<string> } = {}) {
  const t = useTranslations('print_menu');
  const tProd = useTranslations('print_menu_products');
  const router = useRouter();
  const [printFormat, setPrintFormat] = useState<QrTagFormat | null>(null);
  const hasSelection = (selectedIds?.size ?? 0) > 0;

  return (
    <>
      <DropdownMenu
        trigger={
          // moysklad parity: «🖨 Печать ▾» — printer icon before the label.
          <Button variant="secondary" className={triggerClassName}>
            <Icons.print className="h-4 w-4" />
            {t('trigger')}
            <Icons.down className="h-4 w-4" />
          </Button>
        }
        testId="assortment-print-dropdown"
      >
        <DropdownMenu.Item
          disabled={!hasSelection}
          onSelect={() => setPrintFormat('tsennik')}
          testId="assortment-print-price-tag"
        >
          {tProd('price_tag')}
        </DropdownMenu.Item>
        <DropdownMenu.Item
          disabled={!hasSelection}
          onSelect={() => setPrintFormat('thermal')}
          testId="assortment-print-thermal-label"
        >
          {tProd('thermal_label')}
        </DropdownMenu.Item>
        {/* «Печать» (user 2026-07-04): ONE click straight to the label print
            page — selected rows ride along as ?productIds so they arrive
            pre-filled. «Настроить...» below stays for template management. */}
        <DropdownMenu.Item
          onSelect={() =>
            router.push(
              hasSelection && selectedIds
                ? `/labels/print?productIds=${[...selectedIds].join(',')}`
                : '/labels/print',
            )
          }
          testId="assortment-print-labels"
        >
          {t('print_labels')}
        </DropdownMenu.Item>
        <DropdownMenu.Item
          onSelect={() => router.push('/settings/label-templates')}
          testId="assortment-print-configure"
        >
          {t('configure')}
        </DropdownMenu.Item>
        <DropdownMenu.Separator />
        {/* «Запросить форму» promo footer — matches moysklad's persistent
            custom-form upsell at the bottom of the Печать menu. */}
        <div
          className="px-2 py-1.5 text-[var(--ms-text-muted)] text-xs"
          data-test-id="assortment-print-request-form"
        >
          <p className="font-medium text-[var(--ms-text-default)]">{t('request_form')}</p>
          <p className="mt-0.5 leading-snug">{t('request_form_description')}</p>
          <button
            type="button"
            className="mt-1 text-[var(--ms-text-link,#186999)] hover:underline"
            onClick={() => router.push('/settings/label-templates')}
            data-test-id="assortment-print-request-form-cta"
          >
            {t('request_form_cta')}
          </button>
        </div>
      </DropdownMenu>
      {printFormat && hasSelection && selectedIds && (
        <QrPriceTagPrintOverlay
          productIds={[...selectedIds]}
          format={printFormat}
          onClose={() => setPrintFormat(null)}
        />
      )}
    </>
  );
}
