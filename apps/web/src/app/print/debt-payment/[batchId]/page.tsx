'use client';

import { PrintShell } from '@/components/print/print-shell';
import { api } from '@/lib/api-client';
import {
  RECEIPT_PAYMENT_LABELS,
  formatForeignMajor,
  formatFrozenRate,
} from '@/lib/pos/receipt-payments';
import { formatMoney } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'next/navigation';

interface ReceiptLine {
  debtId: string;
  debtName: string;
  amountMinor: string;
  reversed: boolean;
}

interface DebtReceipt {
  batchId: string;
  counterparty: { id: string; name: string; phone: string | null } | null;
  organization: { name: string; legalTitle: string | null } | null;
  cashier: { id: string; name: string } | null;
  paidAt: string | null;
  method: string;
  currency: string;
  /** F6 — mijoz bergan ASL summa (USD → sent); so'm to'lovda `null`. */
  originalMinor: string | null;
  /** F6 — muzlatilgan kurs, kanonik ×10^8; so'm to'lovda `null`. */
  exchangeRate: string | null;
  paidMinor: string;
  outstandingAfterMinor: string;
  lines: ReceiptLine[];
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('uz-UZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const ROW: React.CSSProperties = { display: 'flex', justifyContent: 'space-between' };

/**
 * PKO — qarz to'lovi cheki (kassa TZ §7.2/5-qadam).
 *
 * Mijoz bitta summa to'laydi, u FIFO bo'yicha bir necha qarzga bo'linadi —
 * chekda har qaysi qarzga qancha tushgani ALOHIDA ko'rinadi. Faqat umumiy
 * summani chop etish mijoz uchun tekshirib bo'lmaydigan chek bo'lardi.
 *
 * Eng muhim qatori — **«Qolgan qarz»**: mijoz to'lovdan keyin qancha
 * qarzi qolganini shu yerdan biladi, keyingi safar bahslashmaydi.
 *
 * `batchId` bo'yicha ochiladi ⇒ chek istalgan vaqtda qayta chop etiladi
 * (kassir yo'qotdi / printer tiqildi) va AYNAN o'sha summalarni ko'rsatadi.
 */
export default function PrintDebtPaymentPage() {
  const { batchId } = useParams<{ batchId: string }>();
  const searchParams = useSearchParams();
  const auto = searchParams.get('auto') === '1';

  const { data, isLoading } = useQuery<DebtReceipt>({
    queryKey: ['debt-payment-receipt', batchId],
    queryFn: () => api.get<DebtReceipt>(`/debts/pos/receipt/${batchId}`),
  });

  if (isLoading) return <div style={{ padding: 24 }}>Loading...</div>;
  if (!data) return <div style={{ padding: 24 }}>Not found</div>;

  const paid = BigInt(data.paidMinor);
  const after = BigInt(data.outstandingAfterMinor);
  const hasReversed = data.lines.some((l) => l.reversed);

  /**
   * F6 — DOLLAR qatori. Chek MOLIYAVIY hujjat: mijoz $100 berganini va
   * qaysi KURS bo'yicha hisoblanganini ko'rishi shart, aks holda ertaga
   * «qarzim nega shuncha kamaydi» degan bahsni yechib bo'lmaydi.
   *
   * Yorliq va formatlar `receipt-payments.ts` dan — savdo cheki bilan BITTA
   * lug'at (xotira: «ombor cheki uch renderer» — nusxa jimgina eskiradi).
   */
  const foreign =
    data.currency !== 'UZS' && data.originalMinor != null && data.exchangeRate != null
      ? {
          amountMinor: BigInt(data.originalMinor),
          rateMinor: BigInt(data.exchangeRate),
          currency: data.currency,
        }
      : null;

  return (
    <PrintShell autoPrint={auto}>
      <div style={{ maxWidth: 320, margin: '0 auto', fontFamily: 'monospace', fontSize: 13 }}>
        <div style={{ textAlign: 'center', marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>
            {data.organization?.legalTitle ?? data.organization?.name ?? '—'}
          </div>
          <div style={{ fontSize: 12, marginTop: 4 }}>QARZ TO'LOVI</div>
          <div style={{ fontSize: 11, color: '#666' }}>Kirim kassa orderi (PKO)</div>
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
          <div style={ROW}>
            <span>Sana</span>
            <span>{fmtDate(data.paidAt)}</span>
          </div>
          <div style={ROW}>
            <span>Kassir</span>
            <span>{data.cashier?.name ?? '—'}</span>
          </div>
          <div style={ROW}>
            <span>Mijoz</span>
            <span style={{ fontWeight: 700 }}>{data.counterparty?.name ?? '—'}</span>
          </div>
          {data.counterparty?.phone && (
            <div style={ROW}>
              <span>Telefon</span>
              <span>{data.counterparty.phone}</span>
            </div>
          )}
          <div style={ROW}>
            <span>To'lov turi</span>
            <span>{data.method === 'cash' ? 'Naqd' : 'Terminal'}</span>
          </div>
        </div>

        {/* Qaysi qarzga qancha tushgani — mijoz chekni tekshira olishi uchun. */}
        <div style={{ marginBottom: 8 }}>
          {data.lines.map((line) => (
            <div key={line.debtId} style={{ ...ROW, marginBottom: 3 }}>
              <span
                style={{
                  color: line.reversed ? '#999' : undefined,
                  textDecoration: line.reversed ? 'line-through' : undefined,
                }}
              >
                {line.debtName}
              </span>
              <span style={{ fontWeight: 600 }}>{formatMoney(BigInt(line.amountMinor))}</span>
            </div>
          ))}
        </div>

        <div style={{ borderTop: '1px dashed #999', paddingTop: 6, marginBottom: 6 }}>
          {/* Dollar qatori — TO'LANDI dan OLDIN: mijoz avval nima berganini,
              keyin qarzdan qancha yopilganini o'qiydi. */}
          {foreign && (
            <div style={{ ...ROW, marginBottom: 3 }} data-test-id="pko-usd-line">
              <span>{RECEIPT_PAYMENT_LABELS.cashUsd}</span>
              <span style={{ fontWeight: 600 }}>
                {formatForeignMajor(foreign.amountMinor, foreign.currency)} ×{' '}
                {formatFrozenRate(foreign.rateMinor)}
              </span>
            </div>
          )}
          <div style={{ ...ROW, fontWeight: 700, fontSize: 15 }}>
            <span>TO'LANDI</span>
            <span>{formatMoney(paid)}</span>
          </div>
        </div>

        {/* Chekning eng muhim qatori — keyingi safar bahs chiqmasin. */}
        <div
          style={{
            border: '1px solid #333',
            padding: '6px 8px',
            marginBottom: 10,
            ...ROW,
            fontWeight: 700,
          }}
        >
          <span>Qolgan qarz</span>
          <span>{formatMoney(after)}</span>
        </div>

        {hasReversed && (
          <div style={{ fontSize: 11, color: '#999', marginBottom: 8 }}>
            * Chizilgan qatorlar qaytarilgan (storno) — jami summaga kirmaydi.
          </div>
        )}

        <div style={{ textAlign: 'center', fontSize: 11, color: '#666' }}>
          <div>№ {data.batchId.slice(0, 8).toUpperCase()}</div>
          <div style={{ marginTop: 6 }}>Rahmat!</div>
        </div>
      </div>
    </PrintShell>
  );
}
