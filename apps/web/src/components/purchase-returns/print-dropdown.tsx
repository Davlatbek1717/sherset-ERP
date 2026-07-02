'use client';

/**
 * Purchase-return list — "Печать ▾" print-templates dropdown.
 *
 * Item set sibling-mirrored from the document-list family; return templates
 * capture is empty (docs/moysklad-reference/print-templates/purchasereturn/
 * templates-list.json is []) — list_export label pattern-derived
 * («Список …»), confirm against a live capture before grounding-lock.
 * Only the two functional items, no disabled template placeholders:
 *   1. Список возвратов поставщикам (enabled — list export)
 *   2. Настроить...                 (enabled — settings nav)
 */

import { AccountPrintTemplateItems } from '@/components/print/account-template-items';
import { Button, DropdownMenu, Icons } from '@moysklad/ui';
import { useTranslations } from 'next-intl';

export interface PurchaseReturnPrintDropdownProps {
  /** Selected row ids — feeds the account's custom print-template items. */
  selectedIds?: Set<string>;
  /** Forwarded to the page's CSV export handler (item disabled when absent). */
  onExportList?: () => void;
}

export function PurchaseReturnPrintDropdown({
  onExportList,
  selectedIds,
}: PurchaseReturnPrintDropdownProps) {
  const t = useTranslations('print_menu');
  const tReturn = useTranslations('print_menu_purchasereturn');

  return (
    <DropdownMenu
      trigger={
        <Button variant="secondary">
          {t('trigger')}
          <Icons.down className="h-4 w-4" />
        </Button>
      }
      testId="purchase-return-print-dropdown"
    >
      <DropdownMenu.Item
        onSelect={() => onExportList?.()}
        disabled={!onExportList}
        testId="purchase-return-print-list-export"
      >
        {tReturn('list_export')}
      </DropdownMenu.Item>
      <AccountPrintTemplateItems
        entity="purchasereturn"
        path="purchase-returns"
        selectedIds={selectedIds}
      />
    </DropdownMenu>
  );
}
