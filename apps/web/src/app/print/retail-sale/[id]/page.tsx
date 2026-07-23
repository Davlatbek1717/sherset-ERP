'use client';

import { PrintShell } from '@/components/print/print-shell';
import { api } from '@/lib/api-client';
import { formatMoney } from '@moysklad/ui';
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
  sumMinor: string;
  cashAmountMinor: string;
  cardAmountMinor: string;
  changeMinor: string;
  description: string | null;
  agent: { id: string; name: string; legalTitle: string | null } | null;
  session: {
    cashDesk: { name: string; currency: string };
    cashier: { name: string };
    store: { name: string };
    organization: { name: string; legalTitle: string | null };
  };
  positions: PositionDetail[];
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('uz-UZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function PrintRetailSalePage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const auto = searchParams.get('auto') === '1';
  const _t = useTranslations('pages.print');

  const { data, isLoading } = useQuery<RetailSaleDetail>({
    queryKey: ['retail-sale-print', id],
    queryFn: () => api.get<RetailSaleDetail>(`/retail-sales/${id}`),
  });

  if (isLoading) return <div style={{ padding: 24 }}>Loading...</div>;
  if (!data) return <div style={{ padding: 24 }}>Not found</div>;

  const cashAmount = BigInt(data.cashAmountMinor);
  const cardAmount = BigInt(data.cardAmountMinor);
  const change = BigInt(data.changeMinor);

  return (
    <PrintShell autoPrint={auto}>
      {/* Thermal-style receipt — narrow 58mm / 80mm style */}
      <div
        style={{
          maxWidth: 320,
          margin: '0 auto',
          fontFamily: 'monospace',
          fontSize: 13,
        }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>
            {data.session.organization.legalTitle ?? data.session.organization.name}
          </div>
          <div style={{ fontSize: 12 }}>{data.session.cashDesk.name}</div>
          <div style={{ fontSize: 11, color: '#666' }}>{data.session.store.name}</div>
        </div>

        <div
          style={{
            borderTop: '1px dashed #999',
            borderBottom: '1px dashed #999',
            paddingTop: 6,
            paddingBottom: 6,
            marginBottom: 8,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Chek №</span>
            <span style={{ fontWeight: 700 }}>{data.name}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Sana</span>
            <span>{fmtDate(data.moment)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Kassir</span>
            <span>{data.session.cashier.name}</span>
          </div>
          {data.agent && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Mijoz</span>
              <span>{data.agent.legalTitle ?? data.agent.name}</span>
            </div>
          )}
        </div>

        {/* Positions */}
        <div style={{ marginBottom: 8 }}>
          {data.positions.map((pos) => (
            <div key={pos.id} style={{ marginBottom: 4 }}>
              <div style={{ fontWeight: 500 }}>{pos.product?.name ?? '—'}</div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 12,
                  color: '#444',
                }}
              >
                <span>
                  {pos.quantity} × {formatMoney(BigInt(pos.priceMinor))}
                </span>
                <span style={{ fontWeight: 600 }}>{formatMoney(BigInt(pos.sumMinor))}</span>
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            borderTop: '1px dashed #999',
            paddingTop: 8,
            marginBottom: 8,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontWeight: 700,
              fontSize: 16,
            }}
          >
            <span>JAMI</span>
            <span>{formatMoney(BigInt(data.sumMinor))}</span>
          </div>
        </div>

        {/* Payment split */}
        <div style={{ marginBottom: 8, fontSize: 12 }}>
          {cashAmount > 0n && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Naqd</span>
              <span>{formatMoney(cashAmount)}</span>
            </div>
          )}
          {cardAmount > 0n && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Karta</span>
              <span>{formatMoney(cardAmount)}</span>
            </div>
          )}
          {change > 0n && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
              <span>Qaytim</span>
              <span>{formatMoney(change)}</span>
            </div>
          )}
        </div>

        {data.description && (
          <div style={{ fontSize: 11, color: '#666', marginBottom: 8 }}>{data.description}</div>
        )}

        <div style={{ textAlign: 'center', fontSize: 11, color: '#999', marginTop: 12 }}>
          Xarid uchun rahmat!
        </div>
      </div>
    </PrintShell>
  );
}
