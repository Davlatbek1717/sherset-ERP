'use client';

/**
 * «SAVDO CHEKI» — retail-sale (POS) printed receipt, professional bordered
 * layout (2026-07-23 talab, foydalanuvchi namunasi):
 *   ┌──────────── markazda ────────────┐
 *   │  Tashkilot nomi (katta, qalin)   │
 *   │  telefon                         │
 *   │  SAVDO CHEKI № NNNNN (katta)     │
 *   │  Sana: DD.MM.YYYY                │
 *   └──────────────────────────────────┘
 *   Sotuvchi: …   Xaridor: …   Izoh: …
 *   № | Nomi | O'lch. birligi | Soni | Narxi | Summa   (to'liq chiziqli jadval)
 *   Chek bo'yicha umumiy summa / Chegirma / Jami summa
 *   Jami nomenklaturalar soni: N ta
 *   Raqam bilan: <so'zlar>
 *   To'lov: Naqd/Karta/Qaytim (POS — o'zgarish ko'rinsin)
 *   ─────────────
 *   Ushbu chek to'lovni tasdiqlovchi hujjat hisoblanadi.
 *   Rahmat, bizni tanlaganingiz uchun!
 */

import { ThermalShell } from '@/components/print/thermal-shell';
import { api } from '@/lib/api-client';
import { somInWords } from '@/lib/uzbek-number-words';
import { scaleMinorByQty } from '@moysklad/money';
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
    organization: { name: string; legalTitle: string | null; phone: string | null };
  };
  positions: PositionDetail[];
}

/** Tiyin → «330 250» (butun bo'lsa kasrsiz; kasr bo'lsa «,dd»). */
function fmtSom(minor: bigint): string {
  const neg = minor < 0n;
  const abs = neg ? -minor : minor;
  const som = abs / 100n;
  const tiyin = abs % 100n;
  const grouped = som.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const body = tiyin === 0n ? grouped : `${grouped},${tiyin.toString().padStart(2, '0')}`;
  return neg ? `-${body}` : body;
}

/** «36.5» → «36,5», «2» → «2» (namuna: Soni ru-RU formatida). */
function fmtQty(q: string): string {
  const n = Number(q);
  if (!Number.isFinite(n)) return q;
  return n.toLocaleString('ru-RU', { maximumFractionDigits: 3 });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

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

  const total = BigInt(data.sumMinor);
  // Chegirmasiz yalpi (narx × miqdor). Backend (compute-positions) bilan bir xil
  // yaxlitlash — «Chek bo'yicha umumiy summa» shu, «Chegirma» = yalpi − yakuniy.
  const grossMinor = data.positions.reduce(
    (sum, p) => sum + scaleMinorByQty(BigInt(p.priceMinor), p.quantity),
    0n,
  );
  const discountMinor = grossMinor > total ? grossMinor - total : 0n;

  const cashAmount = BigInt(data.cashAmountMinor);
  const cardAmount = BigInt(data.cardAmountMinor);
  const terminalAmount = BigInt(data.terminalAmountMinor ?? '0');
  const debtAmount = BigInt(data.advancePaymentSumMinor ?? '0');
  const change = BigInt(data.changeMinor);

  // 58mm tor lentada bir pog'ona kichikroq shrift.
  const fs = widthMm === 58 ? 9 : 12;
  const orgName = data.session.organization.legalTitle ?? data.session.organization.name;

  const cell: React.CSSProperties = {
    border: '1px solid #000',
    padding: '3px 4px',
    verticalAlign: 'top',
  };
  const num: React.CSSProperties = { ...cell, textAlign: 'right', whiteSpace: 'nowrap' };
  const payRow: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 8 };

  return (
    <ThermalShell widthMm={widthMm} autoPrint={auto}>
      <div
        style={{
          padding: '4mm 3mm',
          fontSize: fs,
          lineHeight: 1.3,
          color: '#000',
          fontFamily: '"Times New Roman", Times, serif',
        }}
        data-test-id="savdo-chek"
      >
        {/* ── Sarlavha ── */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: 700, fontSize: fs + 8, lineHeight: 1.15 }}>{orgName}</div>
          {data.session.organization.phone && (
            <div style={{ fontWeight: 700, fontSize: fs + 1 }}>
              {data.session.organization.phone}
            </div>
          )}
          <div style={{ fontWeight: 700, fontSize: fs + 6, marginTop: 4 }}>
            SAVDO CHEKI № {data.name}
          </div>
          <div style={{ fontWeight: 700, marginTop: 1 }}>Sana: {fmtDate(data.moment)}</div>
        </div>

        {/* ── Rekvizitlar ── */}
        <div style={{ marginTop: 8 }}>
          <div>Sotuvchi: {data.session.cashier.name}</div>
          <div>Xaridor: {data.agent ? (data.agent.legalTitle ?? data.agent.name) : '—'}</div>
          <div>Izoh: {data.description ?? ''}</div>
        </div>

        {/* ── Pozitsiyalar jadvali ── */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8, fontSize: fs }}>
          <thead>
            <tr style={{ fontWeight: 700, textAlign: 'center' }}>
              <td style={{ ...cell, width: 18, textAlign: 'center' }}>№</td>
              <td style={cell}>Nomi</td>
              <td style={{ ...cell, width: 34, textAlign: 'center' }}>O'lch. birligi</td>
              <td style={{ ...cell, width: 34, textAlign: 'center' }}>Soni</td>
              <td style={{ ...num, width: 54 }}>Narxi</td>
              <td style={{ ...num, width: 60 }}>Summa</td>
            </tr>
          </thead>
          <tbody>
            {data.positions.map((p, i) => (
              <tr key={p.id}>
                <td style={{ ...cell, textAlign: 'center' }}>{i + 1}</td>
                <td style={cell}>{p.product?.name ?? '—'}</td>
                <td style={{ ...cell, textAlign: 'center' }}>{p.product?.uom ?? '—'}</td>
                <td style={{ ...cell, textAlign: 'center' }}>{fmtQty(p.quantity)}</td>
                <td style={num}>{fmtSom(BigInt(p.priceMinor))}</td>
                <td style={num}>{fmtSom(BigInt(p.sumMinor))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5} style={{ ...cell, textAlign: 'center' }}>
                Chek bo'yicha umumiy summa:
              </td>
              <td style={num}>{fmtSom(grossMinor)}</td>
            </tr>
            <tr>
              <td colSpan={5} style={{ ...cell, textAlign: 'center' }}>
                Chegirma:
              </td>
              <td style={num} data-test-id="chek-discount">
                {fmtSom(discountMinor)}
              </td>
            </tr>
            <tr style={{ fontWeight: 700, fontSize: fs + 2 }}>
              <td colSpan={5} style={{ ...cell, textAlign: 'center' }}>
                Jami summa:
              </td>
              <td style={num}>{fmtSom(total)}</td>
            </tr>
          </tfoot>
        </table>

        {/* ── Nomenklatura soni + so'z bilan ── */}
        <div style={{ marginTop: 8 }}>
          Jami nomenklaturalar soni: <b>{data.positions.length} ta</b>
        </div>
        <div style={{ marginTop: 2 }}>
          Raqam bilan: <b>{somInWords(total)}</b>
        </div>

        {/* ── To'lov taqsimoti (POS — qaytim ko'rinsin) ── */}
        {(cashAmount > 0n ||
          cardAmount > 0n ||
          terminalAmount > 0n ||
          debtAmount > 0n ||
          change > 0n) && (
          <div style={{ marginTop: 8 }}>
            {cashAmount > 0n && (
              <div style={payRow}>
                <span>Naqd:</span>
                <span>{fmtSom(cashAmount)}</span>
              </div>
            )}
            {cardAmount > 0n && (
              <div style={payRow}>
                <span>Karta:</span>
                <span>{fmtSom(cardAmount)}</span>
              </div>
            )}
            {terminalAmount > 0n && (
              <div style={payRow}>
                <span>Terminal:</span>
                <span>{fmtSom(terminalAmount)}</span>
              </div>
            )}
            {debtAmount > 0n && (
              <div style={{ ...payRow, fontWeight: 700 }}>
                <span>Qarz:</span>
                <span>{fmtSom(debtAmount)}</span>
              </div>
            )}
            {change > 0n && (
              <div style={{ ...payRow, fontWeight: 700 }}>
                <span>Qaytim:</span>
                <span>{fmtSom(change)}</span>
              </div>
            )}
          </div>
        )}

        {/* ── Pastki matn ── */}
        <div style={{ borderTop: '1px solid #000', margin: '10px 0 6px' }} />
        <div style={{ textAlign: 'center' }}>
          Ushbu chek to'lovni tasdiqlovchi hujjat hisoblanadi.
        </div>
        <div style={{ textAlign: 'center', fontWeight: 700 }}>
          Rahmat, bizni tanlaganingiz uchun!
        </div>
      </div>
    </ThermalShell>
  );
}
