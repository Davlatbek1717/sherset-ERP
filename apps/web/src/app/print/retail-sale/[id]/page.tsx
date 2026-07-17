'use client';

import { ThermalShell } from '@/components/print/thermal-shell';
import { api } from '@/lib/api-client';
import { scaleMinorByQty } from '@moysklad/money';
import { formatMoney } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
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
  terminalAmountMinor: string;
  advancePaymentSumMinor: string;
  changeMinor: string;
  description: string | null;
  agent: { id: string; name: string; legalTitle: string | null } | null;
  session: {
    cashDesk: { name: string; currency: string } | null;
    cashier: { name: string };
    store: { name: string } | null;
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

const row: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 6 };
const dash: React.CSSProperties = { borderTop: '1px dashed #000', margin: '6px 0' };

export default function PrintRetailSalePage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const auto = searchParams.get('auto') === '1';
  // Xprinter width — default 80mm, `?w=58` for the compact printer.
  const widthMm = searchParams.get('w') === '58' ? 58 : 80;

  const { data, isLoading } = useQuery<RetailSaleDetail>({
    queryKey: ['retail-sale-print', id],
    queryFn: () => api.get<RetailSaleDetail>(`/retail-sales/${id}`),
  });

  if (isLoading) return <div style={{ padding: 24 }}>Loading...</div>;
  if (!data) return <div style={{ padding: 24 }}>Not found</div>;

  const cur = data.session.cashDesk?.currency ?? 'UZS';
  const cashAmount = BigInt(data.cashAmountMinor);
  const cardAmount = BigInt(data.cardAmountMinor);
  const terminalAmount = BigInt(data.terminalAmountMinor ?? '0');
  const debtAmount = BigInt(data.advancePaymentSumMinor ?? '0');
  const change = BigInt(data.changeMinor);
  // Chegirma: chegirmasiz yalpi (narx × miqdor) bilan yakuniy summa farqi.
  // Musbat bo'lsagina «Chegirma» qatori chiqadi (narx qo'lda tushirilganda
  // farq bo'lmaydi — bu chegirma emas, boshqa narx). scaleMinorByQty backend
  // (compute-positions) bilan bir xil yaxlitlashni ishlatadi.
  const grossMinor = data.positions.reduce(
    (sum, p) => sum + scaleMinorByQty(BigInt(p.priceMinor), p.quantity),
    0n,
  );
  const discountMinor = grossMinor - BigInt(data.sumMinor);
  const hasDiscount = discountMinor > 0n;
  // Body font scales down a touch on the 58mm strip.
  const fs = widthMm === 58 ? 10 : 12;

  return (
    <ThermalShell widthMm={widthMm} autoPrint={auto}>
      <div style={{ padding: '4mm 3mm', fontSize: fs, lineHeight: 1.35 }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 6 }}>
          <div style={{ fontWeight: 700, fontSize: fs + 3 }}>
            {data.session.organization.legalTitle ?? data.session.organization.name}
          </div>
          {data.session.cashDesk && <div>{data.session.cashDesk.name}</div>}
          {data.session.store && <div style={{ color: '#333' }}>{data.session.store.name}</div>}
        </div>

        <div style={dash} />
        <div style={row}>
          <span>Chek №</span>
          <span style={{ fontWeight: 700 }}>{data.name}</span>
        </div>
        <div style={row}>
          <span>Sana</span>
          <span>{fmtDate(data.moment)}</span>
        </div>
        <div style={row}>
          <span>Kassir</span>
          <span>{data.session.cashier.name}</span>
        </div>
        {data.agent && (
          <div style={row}>
            <span>Mijoz</span>
            <span>{data.agent.legalTitle ?? data.agent.name}</span>
          </div>
        )}
        <div style={dash} />

        {/* Positions */}
        {data.positions.map((pos) => (
          <div key={pos.id} style={{ marginBottom: 4 }}>
            <div style={{ fontWeight: 600 }}>{pos.product?.name ?? '—'}</div>
            <div style={{ ...row, color: '#222' }}>
              <span>
                {Number(pos.quantity)} × {formatMoney(BigInt(pos.priceMinor), cur)}
              </span>
              <span style={{ fontWeight: 700 }}>{formatMoney(BigInt(pos.sumMinor), cur)}</span>
            </div>
          </div>
        ))}

        <div style={dash} />
        {hasDiscount && (
          <>
            <div style={row}>
              <span>Summa</span>
              <span>{formatMoney(grossMinor, cur)}</span>
            </div>
            <div style={{ ...row, color: '#c00' }}>
              <span>Chegirma</span>
              <span>−{formatMoney(discountMinor, cur)}</span>
            </div>
          </>
        )}
        <div style={{ ...row, fontWeight: 700, fontSize: fs + 3 }}>
          <span>JAMI</span>
          <span>{formatMoney(BigInt(data.sumMinor), cur)}</span>
        </div>
        <div style={dash} />

        {/* Payment split */}
        {cashAmount > 0n && (
          <div style={row}>
            <span>Naqd</span>
            <span>{formatMoney(cashAmount, cur)}</span>
          </div>
        )}
        {cardAmount > 0n && (
          <div style={row}>
            <span>Karta</span>
            <span>{formatMoney(cardAmount, cur)}</span>
          </div>
        )}
        {terminalAmount > 0n && (
          <div style={row}>
            <span>Terminal</span>
            <span>{formatMoney(terminalAmount, cur)}</span>
          </div>
        )}
        {debtAmount > 0n && (
          <div style={{ ...row, fontWeight: 700, color: '#c00' }}>
            <span>Qarz</span>
            <span>{formatMoney(debtAmount, cur)}</span>
          </div>
        )}
        {change > 0n && (
          <div style={{ ...row, fontWeight: 700 }}>
            <span>Qaytim</span>
            <span>{formatMoney(change, cur)}</span>
          </div>
        )}

        {data.description && <div style={{ marginTop: 6, color: '#333' }}>{data.description}</div>}

        <div style={{ textAlign: 'center', color: '#333', marginTop: 10 }}>Xarid uchun rahmat!</div>
      </div>
    </ThermalShell>
  );
}
