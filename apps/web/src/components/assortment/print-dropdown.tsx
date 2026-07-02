'use client';

/**
 * Assortment list — "Печать ▾" print-templates dropdown — moysklad parity.
 *
 * Shared across Товары / Услуги / Комплекты (see bulk-actions-dropdown.tsx for
 * why services and bundles inherit the products/assortment menus).
 *
 * Source-of-truth: docs/moysklad-reference/products/states/metadata.json
 * (captured 2026-05-30 via `pnpm capture-moysklad products`).
 *
 * Authoritative moysklad item set:
 *   1. Ценник (70x49,5мм)        (disabled — no label template configured)
 *   2. Термоэтикетка (58х40мм)   (disabled — no thermal template configured)
 *   3. Настроить...               (enabled — label-template settings nav)
 *   4. «Запросить форму» promo footer (persistent upsell, grounded live
 *      2026-06-17 on online.moysklad.uz: a bold title + explanatory text +
 *      «Как запросить» CTA). moysklad routes the CTA to a support article to
 *      request a custom print form; a self-hosted clone has no such service,
 *      so the CTA navigates to the print-template settings — the real place a
 *      custom form is configured here.
 *
 * The two label templates are disabled in moysklad until a template is set up,
 * so they ship as disabled label-parity items here; "Настроить..." navigates
 * to the LABEL-template settings (products print labels, not document forms —
 * document print templates are managed from each document's «Печать» slide-over).
 */

import { Button, DropdownMenu, Icons } from '@moysklad/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

export function AssortmentPrintDropdown({
  triggerClassName,
  selectedIds,
}: { triggerClassName?: string; selectedIds?: string[] } = {}) {
  const t = useTranslations('print_menu');
  const tProd = useTranslations('print_menu_products');
  const router = useRouter();
  // Sherset: «Ценник» prints senik (name + location + QR) for the SELECTED
  // products via /labels/print. Disabled (moysklad parity) until rows are picked.
  const hasSelection = (selectedIds?.length ?? 0) > 0;

  return (
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
        onSelect={
          hasSelection
            ? () => router.push(`/labels/print?productIds=${(selectedIds ?? []).join(',')}`)
            : undefined
        }
        testId="assortment-print-price-tag"
      >
        {tProd('price_tag')}
      </DropdownMenu.Item>
      <DropdownMenu.Item disabled testId="assortment-print-thermal-label">
        {tProd('thermal_label')}
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
          className="mt-1 text-[var(--ms-text-link,#0652ff)] hover:underline"
          onClick={() => router.push('/settings/label-templates')}
          data-test-id="assortment-print-request-form-cta"
        >
          {t('request_form_cta')}
        </button>
      </div>
    </DropdownMenu>
  );
}
