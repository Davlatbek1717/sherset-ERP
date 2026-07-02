'use client';

/**
 * Move list — "Печать ▾" dropdown — moysklad parity.
 *
 * «Список перемещений» (CSV export) first, then the account's own uploaded move
 * print templates + «Настроить…» via the shared <AccountPrintTemplateItems>
 * (which also shows the «Создание печатной формы» dialog and opens the in-document
 * «Настройка шаблонов» panel). Templates print via /moves/bulk-print.
 */

import { AccountPrintTemplateItems } from '@/components/print/account-template-items';
import { Button, DropdownMenu, Icons } from '@moysklad/ui';
import { useTranslations } from 'next-intl';

export interface MovePrintDropdownProps {
  onExportList?: () => void;
  /** Selected move ids — feed the account's custom print-template items. */
  selectedIds?: Set<string>;
}

export function MovePrintDropdown({ onExportList, selectedIds }: MovePrintDropdownProps) {
  const t = useTranslations('print_menu');
  const tMove = useTranslations('print_menu_move');

  return (
    <DropdownMenu
      trigger={
        <Button variant="secondary">
          {t('trigger')}
          <Icons.down className="h-4 w-4" />
        </Button>
      }
      testId="move-print-dropdown"
    >
      <DropdownMenu.Item
        onSelect={() => onExportList?.()}
        disabled={!onExportList}
        testId="move-print-list-export"
      >
        {tMove('list_export')}
      </DropdownMenu.Item>
      <AccountPrintTemplateItems entity="move" path="moves" selectedIds={selectedIds} />
    </DropdownMenu>
  );
}
