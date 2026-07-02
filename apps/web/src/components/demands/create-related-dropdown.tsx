'use client';

/**
 * Demand list — "Создать ▾" create-related-document dropdown.
 *
 * Source: docs/moysklad-reference/visual-captures/03-module/
 *   demand/screenshots/i-dropdown-sozdat.dom.html
 *
 * 4 menu items (per the captured GWT popup):
 *   1. Приходные ордеры     → /cash-in/new
 *   2. Входящие платежи     → /payments-in/new
 *   3. Счет покупателю      → /invoices-out/new
 *   4. Счет-фактура выданный → /factures-out/new
 *
 * Each item carries `?fromDemand=<comma-separated ids>` so the
 * destination form can pre-fill from the source demand(s) once
 * those flows land.
 */

import { Button, DropdownMenu, Icons } from '@moysklad/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

export interface DemandCreateRelatedDropdownProps {
  selectedIds: Set<string>;
}

export function DemandCreateRelatedDropdown({ selectedIds }: DemandCreateRelatedDropdownProps) {
  const t = useTranslations('create_related');
  const router = useRouter();
  const ids = Array.from(selectedIds);
  const hasSelection = ids.length > 0;
  const fromDemandParam = ids.length > 0 ? `?fromDemand=${ids.join(',')}` : '';

  const goTo = (route: string) => () => router.push(`${route}${fromDemandParam}`);

  return (
    <DropdownMenu
      trigger={
        <Button variant="secondary" disabled={!hasSelection}>
          {t('trigger')}
          <Icons.down className="h-4 w-4" />
        </Button>
      }
      testId="demand-create-related-dropdown"
    >
      <DropdownMenu.Item onSelect={goTo('/cash-in/new')} testId="demand-create-related-cash-in">
        {t('cash_in')}
      </DropdownMenu.Item>
      <DropdownMenu.Item
        onSelect={goTo('/payments-in/new')}
        testId="demand-create-related-payment-in"
      >
        {t('payment_in')}
      </DropdownMenu.Item>
      <DropdownMenu.Item
        onSelect={goTo('/invoices-out/new')}
        testId="demand-create-related-invoice-out"
      >
        {t('invoice_out')}
      </DropdownMenu.Item>
      <DropdownMenu.Item disabled testId="demand-create-related-facture-out">
        {t('facture_out')}
      </DropdownMenu.Item>
    </DropdownMenu>
  );
}
