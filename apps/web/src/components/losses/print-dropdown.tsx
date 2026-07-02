'use client';

/**
 * Loss list — "Печать ▾" print-templates dropdown — moysklad parity.
 *
 * Source-of-truth: docs/moysklad-reference/losses/states/metadata.json
 * (captured 2026-05-30 via `pnpm capture-moysklad losses`).
 *
 * Authoritative moysklad item set — 5 items, no separators:
 *   1. Список списаний          (enabled — list export)
 *   2. ТОРГ-16                  (disabled placeholder)
 *   3. МБ-8                     (disabled placeholder)
 *   4. Комплект...              (disabled placeholder)
 *   5. Настроить...             (enabled — settings nav)
 */

import { AccountPrintTemplateItems } from '@/components/print/account-template-items';
import { Button, DropdownMenu, Icons } from '@moysklad/ui';
import { useTranslations } from 'next-intl';

export interface LossPrintDropdownProps {
  /** Selected row ids — feeds the account's custom print-template items. */
  selectedIds?: Set<string>;
  onExportList?: () => void;
}

export function LossPrintDropdown({ onExportList, selectedIds }: LossPrintDropdownProps) {
  const t = useTranslations('print_menu');
  const tLoss = useTranslations('print_menu_loss');

  return (
    <DropdownMenu
      trigger={
        <Button variant="secondary">
          {t('trigger')}
          <Icons.down className="h-4 w-4" />
        </Button>
      }
      testId="loss-print-dropdown"
    >
      <DropdownMenu.Item
        onSelect={() => onExportList?.()}
        disabled={!onExportList}
        testId="loss-print-list-export"
      >
        {tLoss('list_export')}
      </DropdownMenu.Item>
      <DropdownMenu.Item disabled testId="loss-print-torg16">
        {tLoss('torg16')}
      </DropdownMenu.Item>
      <DropdownMenu.Item disabled testId="loss-print-mb8">
        {tLoss('mb8')}
      </DropdownMenu.Item>
      <DropdownMenu.Item disabled testId="loss-print-set">
        {tLoss('set')}
      </DropdownMenu.Item>
      <AccountPrintTemplateItems entity="loss" path="losses" selectedIds={selectedIds} />
    </DropdownMenu>
  );
}
