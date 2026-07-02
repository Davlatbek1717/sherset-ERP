'use client';

/**
 * Supply list — "Печать ▾" print-templates dropdown — moysklad parity.
 *
 * Source-of-truth: docs/moysklad-reference/supplies/states/metadata.json
 * (captured 2026-05-29 via `pnpm capture-moysklad supplies`).
 *
 * Authoritative moysklad item set — 4 items, no separators:
 *   1. Список приемок          (enabled — list export)
 *   2. Приходная накладная     (disabled placeholder — pending template)
 *   3. Комплект...             (disabled placeholder)
 *   4. Настроить...            (enabled — settings nav)
 */

import { AccountPrintTemplateItems } from '@/components/print/account-template-items';
import { Button, DropdownMenu, Icons } from '@moysklad/ui';
import { useTranslations } from 'next-intl';

export interface SupplyPrintDropdownProps {
  /** Selected row ids — feeds the account's custom print-template items. */
  selectedIds?: Set<string>;
  /** Forwarded to the existing CSV ExportButton handler. */
  onExportList?: () => void;
}

export function SupplyPrintDropdown({ onExportList, selectedIds }: SupplyPrintDropdownProps) {
  const t = useTranslations('print_menu');
  const tSupply = useTranslations('print_menu_supply');

  return (
    <DropdownMenu
      trigger={
        <Button variant="secondary">
          {t('trigger')}
          <Icons.down className="h-4 w-4" />
        </Button>
      }
      testId="supply-print-dropdown"
    >
      <DropdownMenu.Item
        onSelect={() => onExportList?.()}
        disabled={!onExportList}
        testId="supply-print-list-export"
      >
        {tSupply('list_export')}
      </DropdownMenu.Item>
      <DropdownMenu.Item disabled testId="supply-print-prixodnaya">
        {tSupply('prixodnaya')}
      </DropdownMenu.Item>
      <DropdownMenu.Item disabled testId="supply-print-set">
        {tSupply('set')}
      </DropdownMenu.Item>
      <AccountPrintTemplateItems entity="supply" path="supplies" selectedIds={selectedIds} />
    </DropdownMenu>
  );
}
