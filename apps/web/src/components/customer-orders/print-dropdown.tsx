'use client';

/**
 * "Печать ▾" toolbar dropdown — moysklad parity.
 *
 * Source-of-truth: `docs/moysklad-reference/customer-orders/states/metadata.json`
 * (captured 2026-05-29 via `pnpm capture-moysklad customer-orders`).
 *
 * moysklad item set:
 *   1. Список заказов     — server-side list export (CSV/XLSX)
 *   2. Заказ              — disabled when no row selected; otherwise
 *                            renders the per-order ЗАКАЗ PDF (bulk-print)
 *   3. Комплект...        — disabled placeholder (set/bundle template)
 *   4. [account forms]    — the account's uploaded custom templates
 *   5. Настроить...       — opens the right-side «Настройка шаблонов» slide-over
 *   + «Запросить форму»   — a promo footer (header + subtitle + «Как запросить»
 *                            button) to request a custom print form from support.
 *
 * NB: the «Запросить форму» footer was wrongly removed 2026-05-29 (the
 * states/metadata.json dump is entity-STATE data, not the print MENU). Re-added
 * 2026-07-06 after a live #customerorder screenshot confirmed it is real.
 */

import { AccountPrintTemplateItems } from '@/components/print/account-template-items';
import { Button, DropdownMenu, Icons } from '@moysklad/ui';
import { useTranslations } from 'next-intl';

export interface PrintDropdownProps {
  /** Optional: forwarded to the existing ExportButton's handler. */
  onExportList?: () => void;
  /** Prints the selected orders as the ЗАКАЗ PDF (bulk-print). */
  onPrintOrder?: () => void;
  /** Whether ≥1 order is selected (gates the «Заказ» PDF item). */
  canPrintOrder?: boolean;
  /** Selected order ids — feeds the account's custom print-template items. */
  selectedIds?: Set<string>;
}

export function PrintDropdown({
  onExportList,
  onPrintOrder,
  canPrintOrder,
  selectedIds,
}: PrintDropdownProps) {
  const t = useTranslations('print_menu');

  return (
    <DropdownMenu
      trigger={
        <Button variant="secondary">
          {t('trigger')}
          <Icons.down className="h-4 w-4" />
        </Button>
      }
      testId="print-dropdown"
    >
      <DropdownMenu.Item
        onSelect={() => onExportList?.()}
        disabled={!onExportList}
        testId="print-list-export"
      >
        {t('list_export')}
      </DropdownMenu.Item>
      {/* «Заказ» — the ЗАКАЗ PDF form. The Chrome HTML→PDF engine landed
          (commit 12117c4c), so this is now wired to bulk-print the selected
          orders. «Комплект…» (set/bundle template) stays a placeholder. */}
      <DropdownMenu.Item
        onSelect={onPrintOrder}
        disabled={!onPrintOrder || !canPrintOrder}
        testId="print-order-form"
      >
        {t('order_form')}
      </DropdownMenu.Item>
      <DropdownMenu.Item disabled testId="print-set">
        {t('set')}
      </DropdownMenu.Item>
      {/* The account's own uploaded customer-order print templates. */}
      <AccountPrintTemplateItems
        entity="customerorder"
        path="customer-orders"
        selectedIds={selectedIds}
      />
      {/* moysklad «Запросить форму» promo footer — request a custom print form
          from support. Plain (non-DM.Item) content so it isn't a keyboard-
          navigable menu row, matching moysklad's promo block. */}
      <div
        className="mt-1 border-[var(--ms-border-default)] border-t px-2 pt-2 pb-1"
        data-test-id="print-request-form"
      >
        <div className="font-semibold text-[13px] text-[var(--ms-text-primary)]">
          {t('request_form')}
        </div>
        <p className="mt-0.5 max-w-[230px] text-[11px] text-[var(--ms-text-muted)] leading-snug">
          {t('request_form_description')}
        </p>
        <button
          type="button"
          onClick={() => window.open('/help/customer-orders', '_blank')}
          className="mt-2 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] px-3 py-1 text-[11px] text-[var(--ms-text-primary)] hover:bg-[var(--ms-bg-muted)]"
          data-test-id="print-request-form-btn"
        >
          {t('request_form_cta')}
        </button>
      </div>
    </DropdownMenu>
  );
}
