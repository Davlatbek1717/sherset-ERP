'use client';

/**
 * "Печать ▾" toolbar dropdown — moysklad parity.
 *
 * Source-of-truth: `docs/moysklad-reference/customer-orders/states/metadata.json`
 * (captured 2026-05-29 via `pnpm capture-moysklad customer-orders`).
 *
 * Authoritative moysklad item set (4 items, no separators, no info card):
 *   1. Список заказов     — server-side list export (CSV/XLSX)
 *   2. Заказ              — disabled when no row selected; otherwise
 *                            renders the per-order ЗАКАЗ PDF (bulk-print)
 *   3. Комплект...        — disabled placeholder (set/bundle template)
 *   4. Настроить...       — opens the right-side «Настройка шаблонов» slide-over
 *
 * The earlier "Запросить форму" info card + grouping separators were
 * audit drift — moysklad's metadata dump shows none of those. Removed
 * 2026-05-29 per Phase 2 audit.
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
    </DropdownMenu>
  );
}
