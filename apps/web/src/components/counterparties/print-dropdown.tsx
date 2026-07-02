'use client';

/**
 * Counterparty list — "Печать ▾" print-templates dropdown — moysklad parity.
 *
 * Source-of-truth: docs/moysklad-reference/counterparties/states/metadata.json
 * (captured 2026-05-30 via `pnpm capture-moysklad counterparties`).
 *
 * Authoritative moysklad item set — 2 list-export items, no separators:
 *   1. Список контрагентов                  (enabled — generic list export)
 *   2. Список контрагентов (Узбекистан)     (enabled — UZ-specific format)
 *
 * moysklad's capture also showed a «Настроить…» item that navigated to a
 * print-template settings page. That page no longer exists (moysklad manages
 * print templates from a document's «Печать» slide-over, not Settings), and
 * counterparties are not a print-template entity, so the item is dropped here.
 * DEFERRED parity gap: counterparty-scoped list templates are unsupported.
 */

import { Button, DropdownMenu, Icons } from '@moysklad/ui';
import { useTranslations } from 'next-intl';

export interface CounterpartyPrintDropdownProps {
  onExportList?: () => void;
  /** UZ-specific list export — separate from the generic list (per moysklad).
   *  When omitted the item stays enabled but is a no-op (caller wires both). */
  onExportListUz?: () => void;
}

export function CounterpartyPrintDropdown({
  onExportList,
  onExportListUz,
}: CounterpartyPrintDropdownProps) {
  const t = useTranslations('print_menu');
  const tCp = useTranslations('print_menu_counterparty');

  return (
    <DropdownMenu
      trigger={
        <Button variant="secondary">
          {/* moysklad «Печать ▾» leads with a printer icon (live-grounded). */}
          <Icons.print className="h-4 w-4" />
          {t('trigger')}
          <Icons.down className="h-4 w-4" />
        </Button>
      }
      testId="counterparty-print-dropdown"
    >
      <DropdownMenu.Item
        onSelect={() => onExportList?.()}
        disabled={!onExportList}
        testId="counterparty-print-list-export"
      >
        {tCp('list_export')}
      </DropdownMenu.Item>
      <DropdownMenu.Item
        onSelect={() => (onExportListUz ?? onExportList)?.()}
        disabled={!(onExportListUz ?? onExportList)}
        testId="counterparty-print-list-export-uz"
      >
        {tCp('list_export_uz')}
      </DropdownMenu.Item>
    </DropdownMenu>
  );
}
