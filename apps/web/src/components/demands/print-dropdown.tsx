'use client';

/**
 * Demand list — "Печать ▾" print-templates dropdown — moysklad parity.
 *
 * Source-of-truth: docs/moysklad-reference/demands/states/metadata.json
 * (captured 2026-05-29 via `pnpm capture-moysklad demands`).
 *
 * Authoritative moysklad item set — 12 items, no separators:
 *   1.  Список отгрузок                                            (enabled)
 *   2.  Товарно-транспортная накладная (Узбекистан)                (disabled)
 *   3.  Товарно-транспортная накладная (Узбекистан, новая)         (disabled)
 *   4.  Товарно-транспортная накладная (форма № 1-Т, Узбекистан)   (disabled)
 *   5.  Товарно-транспортная накладная (форма № 1-Т, Узбекистан, новая) (disabled)
 *   6.  Акт                                                         (disabled)
 *   7.  Товарный чек                                                (disabled)
 *   8.  Расходная накладная                                         (disabled)
 *   9.  Коды маркировки: тег 1162                                   (disabled)
 *   10. Сборочный лист                                              (disabled)
 *   11. Комплект...                                                 (disabled)
 *   12. Настроить...                                                (enabled)
 *
 * Items 2-11 are placeholders — they appear in moysklad's UI but
 * require account-specific PrintTemplate rows to render. Until the
 * template pipeline binds these slugs to actual eta templates, they
 * stay disabled — clicking them is a no-op in moysklad too because
 * "no template configured" is the default account state.
 */

import { AccountPrintTemplateItems } from '@/components/print/account-template-items';
import { Button, DropdownMenu, Icons } from '@moysklad/ui';
import { useTranslations } from 'next-intl';

export interface DemandPrintDropdownProps {
  /** Selected row ids — feeds the account's custom print-template items. */
  selectedIds?: Set<string>;
  /** Forwarded to the existing CSV ExportButton handler. */
  onExportList?: () => void;
}

export function DemandPrintDropdown({ onExportList, selectedIds }: DemandPrintDropdownProps) {
  const t = useTranslations('print_menu');
  const tDemand = useTranslations('print_menu_demand');

  return (
    <DropdownMenu
      trigger={
        <Button variant="secondary">
          {t('trigger')}
          <Icons.down className="h-4 w-4" />
        </Button>
      }
      testId="demand-print-dropdown"
    >
      <DropdownMenu.Item
        onSelect={() => onExportList?.()}
        disabled={!onExportList}
        testId="demand-print-list-export"
      >
        {tDemand('list_export')}
      </DropdownMenu.Item>
      <DropdownMenu.Item disabled testId="demand-print-ttn-uz">
        {tDemand('ttn_uz')}
      </DropdownMenu.Item>
      <DropdownMenu.Item disabled testId="demand-print-ttn-uz-new">
        {tDemand('ttn_uz_new')}
      </DropdownMenu.Item>
      <DropdownMenu.Item disabled testId="demand-print-ttn-form1t-uz">
        {tDemand('ttn_form1t_uz')}
      </DropdownMenu.Item>
      <DropdownMenu.Item disabled testId="demand-print-ttn-form1t-uz-new">
        {tDemand('ttn_form1t_uz_new')}
      </DropdownMenu.Item>
      <DropdownMenu.Item disabled testId="demand-print-akt">
        {tDemand('akt')}
      </DropdownMenu.Item>
      <DropdownMenu.Item disabled testId="demand-print-tovarniy-chek">
        {tDemand('tovarniy_chek')}
      </DropdownMenu.Item>
      <DropdownMenu.Item disabled testId="demand-print-rashodnaya">
        {tDemand('rashodnaya')}
      </DropdownMenu.Item>
      <DropdownMenu.Item disabled testId="demand-print-marking-codes-1162">
        {tDemand('marking_codes_1162')}
      </DropdownMenu.Item>
      <DropdownMenu.Item disabled testId="demand-print-sborochniy-list">
        {tDemand('sborochniy_list')}
      </DropdownMenu.Item>
      <DropdownMenu.Item disabled testId="demand-print-set">
        {tDemand('set')}
      </DropdownMenu.Item>
      <AccountPrintTemplateItems entity="demand" path="demands" selectedIds={selectedIds} />
    </DropdownMenu>
  );
}
