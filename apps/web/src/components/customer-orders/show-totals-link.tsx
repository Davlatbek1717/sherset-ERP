'use client';

/**
 * "Σ Показать итоги" link that appears at the bottom-right of the
 * customer-orders list. Clicking it fetches /aggregate/totals with
 * the active filter set and renders the sums in a slide-down panel.
 *
 * Source: docs/moysklad-reference/visual-captures/03-module/
 *   customerorder/screenshots/i-default.png — bottom-right link
 *   "Σ Показать итоги" sits flush against the pagination footer.
 */

import { api } from '@/lib/api-client';
import { Button, Icons, formatMoney } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface AggregateTotals {
  count: number;
  sumMinor: string;
  vatSumMinor: string;
  payedSumMinor: string;
  invoicedSumMinor: string;
  shippedSumMinor: string;
  reservedSumMinor: string;
}

export interface ShowTotalsLinkProps {
  /** The same query string the list view sent (for filter parity). */
  queryString: string;
}

export function ShowTotalsLink({ queryString }: ShowTotalsLinkProps) {
  const t = useTranslations('list_totals');
  const tFields = useTranslations('fields');
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useQuery<AggregateTotals>({
    queryKey: ['customer-order-totals', queryString],
    queryFn: () =>
      api.get<AggregateTotals>(
        `/customer-orders/aggregate/totals${queryString ? `?${queryString}` : ''}`,
      ),
    enabled: open,
    staleTime: 30_000,
  });

  return (
    <div className="text-right" data-test-id="show-totals-link-wrap">
      <Button
        type="button"
        variant="link"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        className="h-auto gap-1 px-0"
        data-test-id="show-totals-link"
      >
        <span aria-hidden>Σ</span>
        {open ? t('hide') : t('show')}
      </Button>
      {open && (
        <div
          className="mt-2 inline-block rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-3 text-left text-sm shadow-[var(--ms-shadow-elevated)]"
          data-test-id="show-totals-panel"
        >
          {isLoading || !data ? (
            <div className="flex items-center gap-2 text-[var(--ms-text-muted)]">
              <Icons.loading className="h-4 w-4 animate-spin" />
              {t('loading')}
            </div>
          ) : (
            <table className="text-xs tabular-nums">
              <tbody>
                <Row label={t('count')} value={String(data.count)} />
                <Row label={tFields('sum')} value={formatMoney(data.sumMinor)} />
                <Row label={tFields('invoiced_sum')} value={formatMoney(data.invoicedSumMinor)} />
                <Row label={tFields('payed_sum')} value={formatMoney(data.payedSumMinor)} />
                <Row label={tFields('shipped_sum')} value={formatMoney(data.shippedSumMinor)} />
                <Row label={tFields('reserved_sum')} value={formatMoney(data.reservedSumMinor)} />
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td className="pr-4 text-[var(--ms-text-muted)]">{label}:</td>
      <td className="text-right font-medium text-[var(--ms-text-primary)]">{value}</td>
    </tr>
  );
}
