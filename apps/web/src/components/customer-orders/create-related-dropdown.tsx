'use client';

/**
 * "Создать ▾" toolbar dropdown — moysklad parity.
 *
 * Mirrors the GWT popup-button-popup-menu captured 2026-04-30 in
 * docs/moysklad-reference/visual-captures/03-module/customerorder/
 *   screenshots/i-dropdown-sozdat.dom.html
 *
 * Item state (audited 2026-05-29 — see docs/audit-customer-orders.md §Создать):
 *  - Отгрузка (demand): server-side PRE-FILL via
 *    POST /demands/from-customer-order/:id (the same proven cascade the
 *    detail page uses), enabled only for a single selected order.
 *    Multi-order merge is a deferred feature (= bulk "Объединить").
 *  - The remaining items (Заказ поставщику ×2 / Приходный ордер /
 *    Входящий платёж) have NO from-customer-order endpoint yet, so they
 *    navigate to a blank /new form — NOT moysklad-pre-filled. Quantified
 *    gap (needs a from-CO create endpoint per target doc).
 *  - Отборочный лист / Приёмка: disabled (no backing flow).
 */

import { useApiMutation } from '@/hooks/use-api-mutation';
import { api } from '@/lib/api-client';
import { Button, DropdownMenu, Icons } from '@moysklad/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

export interface CreateRelatedDropdownProps {
  selectedIds: Set<string>;
}

export function CreateRelatedDropdown({ selectedIds }: CreateRelatedDropdownProps) {
  const t = useTranslations('create_related');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const qc = useQueryClient();
  const ids = Array.from(selectedIds);
  const hasSelection = ids.length > 0;
  const isSingle = ids.length === 1;
  // Items without a from-CO endpoint still carry the source ids so a
  // future pre-fill flow can read them; today the target /new form
  // ignores the param (documented gap).
  const fromOrderQs = ids.length > 0 ? `fromOrder=${ids.join(',')}` : '';

  // Append fromOrder with the correct separator — a route that already carries
  // a query (e.g. `?availability=1`) needs `&`, not a second `?` (which would
  // swallow fromOrder into the first param's value).
  const goTo = (route: string) => () => {
    if (!fromOrderQs) return router.push(route);
    const sep = route.includes('?') ? '&' : '?';
    router.push(`${route}${sep}${fromOrderQs}`);
  };

  // Отгрузка — real server-side pre-fill from the single selected order,
  // identical to the detail page's "Отгрузить" flow.
  const shipMut = useApiMutation({
    mutationFn: (orderId: string) =>
      api.post<{ id: string }>(`/demands/from-customer-order/${orderId}`, {}),
    onSuccess: (demand) => {
      qc.invalidateQueries({ queryKey: ['customer-orders'] });
      router.push(`/demands/${demand.id}`);
    },
  });

  return (
    <DropdownMenu
      trigger={
        <Button variant="secondary" disabled={!hasSelection || shipMut.isPending}>
          {t('trigger')}
          <Icons.down className="h-4 w-4" />
        </Button>
      }
      testId="create-related-dropdown"
    >
      <DropdownMenu.Item
        onSelect={goTo('/purchase-orders/new')}
        testId="create-related-purchase-order"
      >
        {t('purchase_order')}
      </DropdownMenu.Item>
      <DropdownMenu.Item
        onSelect={goTo('/purchase-orders/new?availability=1')}
        testId="create-related-purchase-order-available"
      >
        {t('purchase_order_with_available')}
      </DropdownMenu.Item>
      <DropdownMenu.Item disabled testId="create-related-picking-wave">
        {t('picking_wave')}
      </DropdownMenu.Item>
      <DropdownMenu.Item
        onSelect={
          isSingle
            ? () => {
                const orderId = ids[0];
                if (orderId) shipMut.mutate(orderId);
              }
            : undefined
        }
        disabled={!isSingle || shipMut.isPending}
        testId="create-related-demand"
      >
        {t('demand')}
        {hasSelection && !isSingle ? (
          <span className="ml-1 text-[var(--ms-text-muted)] text-xs">
            ({tCommon('coming_soon')})
          </span>
        ) : null}
      </DropdownMenu.Item>
      <DropdownMenu.Item onSelect={goTo('/cash-in/new')} testId="create-related-cash-in">
        {t('cash_in')}
      </DropdownMenu.Item>
      <DropdownMenu.Item onSelect={goTo('/payments-in/new')} testId="create-related-payment-in">
        {t('payment_in')}
      </DropdownMenu.Item>
      <DropdownMenu.Item disabled testId="create-related-supply">
        {t('supply')}
      </DropdownMenu.Item>
    </DropdownMenu>
  );
}
