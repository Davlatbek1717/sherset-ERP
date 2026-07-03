'use client';

import { DocumentTabs } from '@/components/document-tabs';
import { api } from '@/lib/api-client';
import { documentStateTone } from '@/lib/document-state-tone';
import { Badge, Button, Icons, formatDate, formatMoney } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams, useSearchParams } from 'next/navigation';

interface PositionDetail {
  id: string;
  position: number;
  quantity: string;
  priceMinor: string;
  discount: string;
  sumMinor: string;
  product: { id: string; name: string; code: string | null; uom: string | null } | null;
}

interface RetailSaleDetail {
  id: string;
  name: string;
  state: string;
  moment: string;
  postedAt: string | null;
  sumMinor: string;
  cashAmountMinor: string;
  cardAmountMinor: string;
  changeMinor: string;
  description: string | null;
  externalCode: string | null;
  agent: { id: string; name: string } | null;
  refundedFrom: { id: string; name: string } | null;
  session: {
    id: string;
    state: string;
    // cashDesk/store are SetNull relations — null after the desk/store is deleted.
    cashDesk: { id: string; name: string; currency: string } | null;
    cashier: { id: string; name: string };
    store: { id: string; name: string } | null;
    organization: { id: string; name: string; legalTitle: string | null };
  };
  positions: PositionDetail[];
}

export default function RetailSaleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const _searchParams = useSearchParams();
  const tCommon = useTranslations('common');
  const t = useTranslations('pages.retail_sales');
  const tFields = useTranslations('fields');
  const tPay = useTranslations('pages.payment_dialog');
  // Sherset custom — «Yig'ishga yuborish» (picking) labels.
  const tPicking = useTranslations('picking');

  const { data: sale, isLoading } = useQuery<RetailSaleDetail>({
    queryKey: ['retail-sale', id],
    queryFn: () => api.get<RetailSaleDetail>(`/retail-sales/${id}`),
  });

  if (isLoading) {
    return <div className="p-6 text-[var(--ms-text-muted)] text-sm">{tCommon('loading')}</div>;
  }

  if (!sale) {
    return <div className="p-6 text-[var(--ms-text-muted)] text-sm">{tCommon('not_found')}</div>;
  }

  const cashAmount = BigInt(sale.cashAmountMinor);
  const cardAmount = BigInt(sale.cardAmountMinor);
  const change = BigInt(sale.changeMinor);
  // Money on a receipt is in the till's currency, not the UZS default. (2026-06-03h)
  const currency = sale.session.cashDesk?.currency ?? 'UZS';

  return (
    <div className="max-w-2xl p-4">
      <div className="mb-4 flex items-center gap-3">
        <a
          href={`/retail/sessions/${sale.session.id}`}
          className="text-[var(--ms-text-brand)] text-sm hover:underline"
        >
          ← {t('shift')}
        </a>
      </div>

      <div className="mb-4 flex items-center gap-3">
        <h1 className="font-bold text-[var(--ms-text-primary)] text-xl">{sale.name}</h1>
        <Badge tone={documentStateTone(sale.state)}>
          {t(
            `statuses.${sale.state}` as
              | 'statuses.draft'
              | 'statuses.posted'
              | 'statuses.refunded'
              | 'statuses.cancelled',
          )}
        </Badge>
      </div>

      {/* Meta */}
      <div className="mb-4 grid grid-cols-2 gap-3 rounded-xl border border-[var(--ms-border)] bg-[var(--ms-bg-surface)] p-4 text-sm">
        <div>
          <div className="mb-0.5 text-[var(--ms-text-muted)] text-xs">{t('moment')}</div>
          <div>{formatDate(sale.moment)}</div>
        </div>
        <div>
          <div className="mb-0.5 text-[var(--ms-text-muted)] text-xs">{t('cash_desk')}</div>
          <div>{sale.session.cashDesk?.name ?? '—'}</div>
        </div>
        <div>
          <div className="mb-0.5 text-[var(--ms-text-muted)] text-xs">{t('cashier')}</div>
          <div>{sale.session.cashier.name}</div>
        </div>
        {sale.agent && (
          <div>
            <div className="mb-0.5 text-[var(--ms-text-muted)] text-xs">{t('agent')}</div>
            <div>{sale.agent.name}</div>
          </div>
        )}
        {sale.refundedFrom && (
          <div>
            <div className="mb-0.5 text-[var(--ms-text-muted)] text-xs">{t('refund_basis')}</div>
            <a
              href={`/retail/sales/${sale.refundedFrom.id}`}
              className="text-[var(--ms-text-brand)] hover:underline"
            >
              {sale.refundedFrom.name}
            </a>
          </div>
        )}
        {sale.externalCode && (
          <div>
            <div className="mb-0.5 text-[var(--ms-text-muted)] text-xs">
              {tFields('external_code')}
            </div>
            <div className="tabular-nums">{sale.externalCode}</div>
          </div>
        )}
      </div>

      {/* Positions */}
      <div className="mb-4 overflow-hidden rounded-xl border border-[var(--ms-border)] bg-[var(--ms-bg-surface)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-[var(--ms-border)] border-b bg-[var(--ms-bg-app)]">
              <th className="px-3 py-2 text-left font-medium text-[var(--ms-text-muted)] text-xs">
                {tFields('product')}
              </th>
              <th className="w-20 px-3 py-2 text-right font-medium text-[var(--ms-text-muted)] text-xs">
                {tFields('quantity')}
              </th>
              <th className="w-28 px-3 py-2 text-right font-medium text-[var(--ms-text-muted)] text-xs">
                {tFields('price')}
              </th>
              <th className="w-28 px-3 py-2 text-right font-medium text-[var(--ms-text-muted)] text-xs">
                {tFields('sum')}
              </th>
            </tr>
          </thead>
          <tbody>
            {sale.positions.map((pos) => (
              <tr key={pos.id} className="border-[var(--ms-border)] border-b last:border-0">
                <td className="px-3 py-2">
                  <div className="font-medium">{pos.product?.name ?? '—'}</div>
                  {pos.product?.code && (
                    <div className="text-[var(--ms-text-muted)] text-xs">{pos.product.code}</div>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{pos.quantity}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatMoney(BigInt(pos.priceMinor), currency)}
                </td>
                <td className="px-3 py-2 text-right font-medium tabular-nums">
                  {formatMoney(BigInt(pos.sumMinor), currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Payment summary */}
      <div className="mb-4 rounded-xl border border-[var(--ms-border)] bg-[var(--ms-bg-surface)] p-4">
        <div className="mb-1 flex justify-between text-sm">
          <span className="text-[var(--ms-text-muted)]">{t('total')}</span>
          <span className="font-bold text-xl tabular-nums">
            {formatMoney(BigInt(sale.sumMinor), currency)}
          </span>
        </div>
        {cashAmount > 0n && (
          <div className="flex justify-between text-sm">
            <span className="text-[var(--ms-text-muted)]">{tPay('cash')}</span>
            <span className="tabular-nums">{formatMoney(cashAmount, currency)}</span>
          </div>
        )}
        {cardAmount > 0n && (
          <div className="flex justify-between text-sm">
            <span className="text-[var(--ms-text-muted)]">{tPay('card')}</span>
            <span className="tabular-nums">{formatMoney(cardAmount, currency)}</span>
          </div>
        )}
        {change > 0n && (
          <div className="flex justify-between text-green-700 text-sm">
            <span>{tPay('change')}</span>
            <span className="tabular-nums">{formatMoney(change, currency)}</span>
          </div>
        )}
      </div>

      {/* Actions — mijoz cheki (print) + Sherset «Yig'ishga yuborish» (picking,
          posted sales only): per-sklad omborchi sheets + in-app tasks. */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" asChild>
          <a href={`/print/retail-sale/${sale.id}`} target="_blank" rel="noopener noreferrer">
            <Icons.print className="h-4 w-4" aria-hidden />
            {tCommon('print')}
          </a>
        </Button>
        {sale.state === 'posted' && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              window.open(
                `/print/picking/${sale.id}?source=retailsale&auto=1`,
                '_blank',
                'width=900,height=1100',
              )
            }
            data-test-id="retail-send-to-picking"
          >
            {tPicking('send_to_picking')}
          </Button>
        )}
      </div>

      <DocumentTabs auditEntity="retail_sale" entityId={sale.id} relatedGroups={[]} />
    </div>
  );
}
