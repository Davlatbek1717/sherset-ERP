'use client';

/**
 * "Создать ▾" toolbar dropdown for Приёмки (supplies) — moysklad parity.
 *
 * moysklad list toolbar is Изменить · Статус · Создать · Печать; this fills
 * the missing «Создать» slot: bulk-creates related documents from the
 * selected receipts (disabled with no selection, like Статус). Mirrors the
 * purchase-orders createDocMenu behavior — fire the bulk endpoint, then
 * navigate to the created documents' list.
 *
 * Items (handoff docs/handoff/supplies-pixel-parity.md #3):
 *   Исходящие платежи   → POST /supplies/bulk-create-payment-out
 *   Расходные ордера    → POST /supplies/bulk-create-cash-out
 *   Возвраты поставщикам → POST /supplies/bulk-create-purchase-return
 *   Счета-фактуры       → POST /factures-in/generate/from-supplies
 *                          (ONE facture linking all selected supplies — §66)
 */

import { useApiMutation } from '@/hooks/use-api-mutation';
import { api } from '@/lib/api-client';
import { Button, DropdownMenu, Icons } from '@moysklad/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

interface BulkResult {
  total: number;
  succeeded: string[];
  failed: Array<{ id: string; error: string }>;
}

export interface SupplyCreateDocDropdownProps {
  selectedIds: Set<string>;
  listQueryKey: readonly unknown[];
  onClearSelection: () => void;
}

export function SupplyCreateDocDropdown({
  selectedIds,
  listQueryKey,
  onClearSelection,
}: SupplyCreateDocDropdownProps) {
  const t = useTranslations('pages.supplies');
  const router = useRouter();
  const qc = useQueryClient();
  const ids = Array.from(selectedIds);
  const hasSelection = ids.length > 0;

  const afterCreate = (href: string) => () => {
    qc.invalidateQueries({ queryKey: listQueryKey });
    onClearSelection();
    router.push(href);
  };

  const createPaymentOut = useApiMutation({
    mutationFn: (input: { ids: string[] }) =>
      api.post<BulkResult>('/supplies/bulk-create-payment-out', input),
    onSuccess: afterCreate('/payments-out'),
  });
  const createCashOut = useApiMutation({
    mutationFn: (input: { ids: string[] }) =>
      api.post<BulkResult>('/supplies/bulk-create-cash-out', input),
    onSuccess: afterCreate('/cash-out'),
  });
  const createPurchaseReturn = useApiMutation({
    mutationFn: (input: { ids: string[] }) =>
      api.post<BulkResult>('/supplies/bulk-create-purchase-return', input),
    onSuccess: afterCreate('/purchase-returns'),
  });
  const createFactureIn = useApiMutation({
    mutationFn: (input: { supplyIds: string[] }) =>
      api.post('/factures-in/generate/from-supplies', input),
    onSuccess: afterCreate('/factures-in'),
  });

  const isPending =
    createPaymentOut.isPending ||
    createCashOut.isPending ||
    createPurchaseReturn.isPending ||
    createFactureIn.isPending;
  const itemDisabled = !hasSelection || isPending;

  return (
    <DropdownMenu
      trigger={
        <Button variant="secondary" disabled={itemDisabled}>
          {t('bulk_create')}
          <Icons.down className="h-4 w-4" />
        </Button>
      }
      testId="supply-create-doc-dropdown"
    >
      <DropdownMenu.Item
        onSelect={() => createPaymentOut.mutate({ ids })}
        disabled={itemDisabled}
        testId="supply-create-payment-out"
      >
        {t('bulk_create_payment_out')}
      </DropdownMenu.Item>
      <DropdownMenu.Item
        onSelect={() => createCashOut.mutate({ ids })}
        disabled={itemDisabled}
        testId="supply-create-cash-out"
      >
        {t('bulk_create_cash_out')}
      </DropdownMenu.Item>
      <DropdownMenu.Item
        onSelect={() => createPurchaseReturn.mutate({ ids })}
        disabled={itemDisabled}
        testId="supply-create-purchase-return"
      >
        {t('bulk_create_purchase_return')}
      </DropdownMenu.Item>
      <DropdownMenu.Item
        onSelect={() => createFactureIn.mutate({ supplyIds: ids })}
        disabled={itemDisabled}
        testId="supply-create-facture-in"
      >
        {t('bulk_create_facture_in')}
      </DropdownMenu.Item>
    </DropdownMenu>
  );
}
