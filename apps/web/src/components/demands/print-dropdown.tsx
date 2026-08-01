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
 *   7.  Товарный чек                          ✅ LIVE (1 qator tanlansa)
 *   8.  Расходная накладная                   ✅ LIVE (1 qator tanlansa)
 *   9.  Коды маркировки: тег 1162                                   (disabled)
 *   10. Сборочный лист                                              (disabled)
 *   11. Комплект...                                                 (disabled)
 *   12. Настроить...                                                (enabled)
 *
 * 2026-08-01: 7 va 8 JONLANTIRILDI — o'sha shakllar endi haqiqatan bor
 * (`/print/demand/:id` A4 blankasi va `?form=chek` termal cheki). Ular
 * per-HUJJAT bo'lgani uchun aynan BITTA qator tanlanishini talab qiladi;
 * moysklad ham tanlov bitta hujjatni ko'rsatmaguncha ularni so'ndiradi.
 *
 * Qolgan o'chirilganlar (2-6, 9-11) — bu shakllar HALI YO'Q: TTN'lar va
 * «Акт» O'zbekiston davlat shakllari (rasmiy maket kerak), «Коды маркировки»
 * Честный знак quyi-tizimini talab qiladi, «Сборочный лист» esa detal
 * sahifasidagi portal (ro'yxatdan URL bilan ochib bo'lmaydi).
 * O'chirilgan qoldirish — soxta ishlaydigan tugmadan halolroq.
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

  // «Расходная накладная» / «Товарный чек» are per-DOCUMENT forms, so they need
  // exactly one row picked. moysklad greys them out the same way until the
  // selection identifies a single document. The other placeholders below stay
  // disabled because those forms genuinely do not exist yet — see the header.
  const ids = selectedIds ? Array.from(selectedIds) : [];
  const oneId = ids.length === 1 ? ids[0] : null;
  const openForm = (query: string) => {
    if (!oneId) return;
    window.open(`/print/demand/${oneId}${query}`, '_blank', 'noopener');
  };

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
      <DropdownMenu.Item
        onSelect={() => openForm('?form=chek')}
        disabled={!oneId}
        testId="demand-print-tovarniy-chek"
      >
        {tDemand('tovarniy_chek')}
      </DropdownMenu.Item>
      <DropdownMenu.Item
        onSelect={() => openForm('')}
        disabled={!oneId}
        testId="demand-print-rashodnaya"
      >
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
