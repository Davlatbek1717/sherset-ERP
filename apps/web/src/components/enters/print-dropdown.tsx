'use client';

/**
 * Enter list — "Печать ▾" print-templates dropdown — moysklad parity.
 *
 * Source-of-truth: docs/moysklad-reference/enters/states/metadata.json
 * (captured 2026-05-30 via `pnpm capture-moysklad enters`).
 *
 * Authoritative moysklad item set — 4 items, no separators:
 *   1. Список оприходований    (enabled — list export)
 *   2. Оприходование            (disabled placeholder)
 *   3. Комплект...              (disabled placeholder)
 *   4. Настроить...             (enabled — settings nav)
 */

import { AccountPrintTemplateItems } from '@/components/print/account-template-items';
import { Button, DropdownMenu, Icons } from '@moysklad/ui';
import { useTranslations } from 'next-intl';

export interface EnterPrintDropdownProps {
  /** Selected row ids — feeds the account's custom print-template items. */
  selectedIds?: Set<string>;
  onExportList?: () => void;
  /** Prints the selected enters as the ОПРИХОДОВАНИЕ PDF (bulk-print). */
  onPrintEnter?: () => void;
  /** Whether ≥1 enter is selected (gates the «Оприходование» PDF item). */
  canPrintEnter?: boolean;
}

export function EnterPrintDropdown({
  onExportList,
  selectedIds,
  onPrintEnter,
  canPrintEnter,
}: EnterPrintDropdownProps) {
  const t = useTranslations('print_menu');
  const tEnter = useTranslations('print_menu_enter');

  return (
    <DropdownMenu
      trigger={
        <Button variant="secondary">
          {t('trigger')}
          <Icons.down className="h-4 w-4" />
        </Button>
      }
      testId="enter-print-dropdown"
    >
      <DropdownMenu.Item
        onSelect={() => onExportList?.()}
        disabled={!onExportList}
        testId="enter-print-list-export"
      >
        {tEnter('list_export')}
      </DropdownMenu.Item>
      <DropdownMenu.Item
        onSelect={onPrintEnter}
        disabled={!onPrintEnter || !canPrintEnter}
        testId="enter-print-oprixodovanie"
      >
        {tEnter('oprixodovanie')}
      </DropdownMenu.Item>
      <DropdownMenu.Item disabled testId="enter-print-set">
        {tEnter('set')}
      </DropdownMenu.Item>
      <AccountPrintTemplateItems entity="enter" path="enters" selectedIds={selectedIds} />
    </DropdownMenu>
  );
}
