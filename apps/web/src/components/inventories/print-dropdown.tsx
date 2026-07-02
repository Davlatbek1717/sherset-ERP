'use client';

/**
 * Inventory list — "Печать ▾" print-templates dropdown — moysklad parity.
 *
 * Source-of-truth: docs/moysklad-reference/inventories/states/metadata.json
 * (captured 2026-05-30 via `pnpm capture-moysklad inventories`).
 *
 * Authoritative moysklad item set — 4 items, no separators:
 *   1. Список инвентаризаций     (enabled — list export)
 *   2. Инвентаризация            (disabled placeholder)
 *   3. Комплект...               (disabled placeholder)
 *   4. Настроить...              (enabled — settings nav)
 */

import { AccountPrintTemplateItems } from '@/components/print/account-template-items';
import { Button, DropdownMenu, Icons } from '@moysklad/ui';
import { useTranslations } from 'next-intl';

export interface InventoryPrintDropdownProps {
  /** Selected row ids — feeds the account's custom print-template items. */
  selectedIds?: Set<string>;
  onExportList?: () => void;
}

export function InventoryPrintDropdown({ onExportList, selectedIds }: InventoryPrintDropdownProps) {
  const t = useTranslations('print_menu');
  const tInv = useTranslations('print_menu_inventory');

  return (
    <DropdownMenu
      trigger={
        <Button variant="secondary">
          {t('trigger')}
          <Icons.down className="h-4 w-4" />
        </Button>
      }
      testId="inventory-print-dropdown"
    >
      <DropdownMenu.Item
        onSelect={() => onExportList?.()}
        disabled={!onExportList}
        testId="inventory-print-list-export"
      >
        {tInv('list_export')}
      </DropdownMenu.Item>
      <DropdownMenu.Item disabled testId="inventory-print-inventarizatsiya">
        {tInv('inventarizatsiya')}
      </DropdownMenu.Item>
      <DropdownMenu.Item disabled testId="inventory-print-set">
        {tInv('set')}
      </DropdownMenu.Item>
      <AccountPrintTemplateItems entity="inventory" path="inventories" selectedIds={selectedIds} />
    </DropdownMenu>
  );
}
