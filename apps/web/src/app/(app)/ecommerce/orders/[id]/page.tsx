'use client';

import { DocumentTabs } from '@/components/document-tabs';
import { api } from '@/lib/api-client';
import { documentStateTone } from '@/lib/document-state-tone';
import { Badge, Button, Container, PageHeader, formatMoney } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { useState } from 'react';

interface OnlineOrderDetail {
  id: string;
  externalOrderId: string;
  customerName: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  sumMinor: string;
  currency: string;
  items: Array<{ name?: string; qty?: number; price?: number }> | null;
  state: string;
  customerOrderId: string | null;
  receivedAt: string;
  createdAt: string;
  updatedAt: string;
  channel: { id: string; name: string; kind: string } | null;
}

type OrderState = 'pending' | 'accepted' | 'rejected' | 'converted';

export default function OnlineOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const qc = useQueryClient();
  const t = useTranslations('pages.online_orders');
  const tCommon = useTranslations('common');
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, isLoading } = useQuery<OnlineOrderDetail>({
    queryKey: ['online-order', id],
    queryFn: () => api.get<OnlineOrderDetail>(`/online-orders/${id}`),
    enabled: !!id,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['online-order', id] });
    qc.invalidateQueries({ queryKey: ['online-orders'] });
    qc.invalidateQueries({ queryKey: ['online-orders-counts'] });
  };

  const acceptMut = useMutation({
    mutationFn: () => api.post(`/online-orders/${id}/accept`, {}),
    onSuccess: invalidate,
    onError: (e: Error) => setActionError(e.message),
  });

  const rejectMut = useMutation({
    mutationFn: () => api.post(`/online-orders/${id}/reject`, {}),
    onSuccess: invalidate,
    onError: (e: Error) => setActionError(e.message),
  });

  const convertMut = useMutation({
    mutationFn: () => api.post(`/online-orders/${id}/convert`, {}),
    onSuccess: invalidate,
    onError: (e: Error) => setActionError(e.message),
  });

  if (isLoading) {
    return (
      <Container size="full" className="py-4">
        <div className="text-[var(--ms-text-muted)] text-sm">{tCommon('loading')}</div>
      </Container>
    );
  }

  if (!data) {
    return (
      <Container size="full" className="py-4">
        <div className="text-[var(--ms-text-muted)] text-sm">{tCommon('not_found')}</div>
      </Container>
    );
  }

  const state = data.state as OrderState;

  return (
    <Container size="full" className="py-4">
      <div className="mb-4 flex items-center gap-2 text-[var(--ms-text-muted)] text-sm">
        <a href="/ecommerce/orders" className="hover:underline">
          {t('title')}
        </a>
        <span>/</span>
        <span className="text-[var(--ms-text-primary)]">{data.externalOrderId}</span>
      </div>

      <div className="mb-4 flex items-start justify-between">
        <div>
          <PageHeader
            title={`${t('order_number')} ${data.externalOrderId}`}
            subtitle={new Date(data.receivedAt).toLocaleString('uz-UZ')}
          />
        </div>
        <Badge tone={documentStateTone(state)}>
          {t(`statuses.${state}` as Parameters<typeof t>[0])}
        </Badge>
      </div>

      {actionError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-600 text-sm">
          {actionError}
        </div>
      )}

      {/* Action buttons */}
      {state === 'pending' && (
        <div className="mb-6 flex gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setActionError(null);
              acceptMut.mutate();
            }}
            disabled={acceptMut.isPending}
          >
            {t('accept_button')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setActionError(null);
              rejectMut.mutate();
            }}
            disabled={rejectMut.isPending}
          >
            {t('reject_button')}
          </Button>
        </div>
      )}

      {state === 'accepted' && (
        <div className="mb-6 flex gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setActionError(null);
              convertMut.mutate();
            }}
            disabled={convertMut.isPending}
          >
            {t('convert_button')}
          </Button>
        </div>
      )}

      {/* Details */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Customer info */}
        <div className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-4">
          <h3 className="mb-3 font-semibold text-sm">{t('customer_section')}</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex gap-2">
              <dt className="w-32 shrink-0 text-[var(--ms-text-muted)]">{t('customer_name')}:</dt>
              <dd>{data.customerName ?? '—'}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-32 shrink-0 text-[var(--ms-text-muted)]">{t('customer_phone')}:</dt>
              <dd>{data.customerPhone ?? '—'}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-32 shrink-0 text-[var(--ms-text-muted)]">
                {t('customer_address')}:
              </dt>
              <dd>{data.customerAddress ?? '—'}</dd>
            </div>
          </dl>
        </div>

        {/* Order info */}
        <div className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-4">
          <h3 className="mb-3 font-semibold text-sm">{t('order_section')}</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex gap-2">
              <dt className="w-32 shrink-0 text-[var(--ms-text-muted)]">{t('channel')}:</dt>
              <dd>
                {data.channel ? (
                  <a
                    href={`/ecommerce/channels/${data.channel.id}`}
                    className="text-[var(--ms-text-brand)] hover:underline"
                  >
                    {data.channel.name}
                  </a>
                ) : (
                  '—'
                )}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-32 shrink-0 text-[var(--ms-text-muted)]">{t('sum')}:</dt>
              <dd className="font-semibold">{formatMoney(data.sumMinor, data.currency)}</dd>
            </div>
            {data.customerOrderId && (
              <div className="flex gap-2">
                <dt className="w-32 shrink-0 text-[var(--ms-text-muted)]">
                  {t('customer_order_id')}:
                </dt>
                <dd className="font-mono text-xs">{data.customerOrderId}</dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      {/* Items table */}
      {data.items && Array.isArray(data.items) && data.items.length > 0 && (
        <div className="mt-4 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-4">
          <h3 className="mb-3 font-semibold text-sm">{t('items_section')}</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-[var(--ms-border-default)] border-b text-left text-[var(--ms-text-muted)]">
                <th className="pb-2 font-medium">{t('item_name')}</th>
                <th className="w-20 pb-2 text-right font-medium">{t('item_qty')}</th>
                <th className="w-32 pb-2 text-right font-medium">{t('item_price')}</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item, idx) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: imported order lines are a static display list with no stable id
                <tr key={idx} className="border-[var(--ms-border-default)] border-b last:border-0">
                  <td className="py-2">{item.name ?? '—'}</td>
                  <td className="py-2 text-right tabular-nums">{item.qty ?? '—'}</td>
                  <td className="py-2 text-right tabular-nums">
                    {item.price !== undefined ? item.price.toLocaleString('uz-UZ') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <DocumentTabs auditEntity="online_order" entityId={data.id} relatedGroups={[]} />
    </Container>
  );
}
