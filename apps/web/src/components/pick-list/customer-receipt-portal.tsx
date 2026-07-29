'use client';

/**
 * «Товарный чек» — the CUSTOMER-facing receipt (owner 2026-07-29, MoySklad 1:1).
 * Unlike «Лист сборки» (the warehouse picker list — products + cells, NO prices),
 * this is what the BUYER gets: a 72mm thermal receipt with prices, per-line sums,
 * totals and the amount in words. Rendered for OUR customer-orders/new + [id]
 * «Печать → Товарный чек». Print isolation mirrors ReceiptPrintPortal.
 */

import { ruAmountWords } from '@/lib/ru-amount-words';
import { useTranslations } from 'next-intl';
import { createPortal } from 'react-dom';

export interface CustomerReceiptPosition {
  name: string;
  uom?: string | null;
  qty: number | string;
  /** per-unit price, minor units (tiyin = sum×100). */
  priceMinor: string | number;
  /** line total, minor units. */
  sumMinor: string | number;
}

export interface CustomerReceiptData {
  number: string;
  /** DD.MM.YYYY */
  dateStr: string;
  /** organization (top header). */
  orgName: string | null;
  /** Продавец (the sales employee/owner). */
  sellerName: string | null;
  /** Покупатель (the counterparty). */
  buyerName: string | null;
  phone: string | null;
  comment: string | null;
  positions: CustomerReceiptPosition[];
  /** discount in minor units (default 0). */
  discountMinor?: string | number;
}

/** minor (tiyin) → «7 000» / «7 000.50» (space thousands, ru style, trim .00). */
function money(minor: string | number | bigint, alwaysCents = false): string {
  const m = BigInt(Math.round(Number(minor) || 0));
  const neg = m < 0n;
  const abs = neg ? -m : m;
  const som = abs / 100n;
  const cents = Number(abs % 100n);
  const somStr = som.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const centStr = alwaysCents || cents ? `.${String(cents).padStart(2, '0')}` : '';
  return `${neg ? '-' : ''}${somStr}${centStr}`;
}

export function CustomerReceiptPortal({
  data,
  onPrint,
  onClose,
}: {
  data: CustomerReceiptData | null;
  onPrint?: () => void;
  onClose?: () => void;
}) {
  const t = useTranslations('pages.pickLists');
  if (typeof document === 'undefined' || !data) return null;

  const doPrint = () => {
    onPrint?.();
    window.print();
  };

  const totalMinor = data.positions.reduce(
    (acc, p) => acc + BigInt(Math.round(Number(p.sumMinor) || 0)),
    0n,
  );
  const discountMinor = BigInt(Math.round(Number(data.discountMinor) || 0));
  const itogoMinor = totalMinor - discountMinor;
  const th = 'border border-black px-1 py-0.5 text-center font-bold';
  const td = 'border border-black px-1 py-0.5 align-top';

  return createPortal(
    <div
      data-pick-print-root=""
      data-test-id="customer-receipt-print-page"
      className="fixed inset-0 z-[200] overflow-auto bg-slate-100"
    >
      <style>{`
        .rcpt table th, .rcpt table td { border: 1.5px solid #000; }
        .rcpt, .rcpt table { font-weight: 600; }
        .rcpt td.rcpt-name { font-weight: 700; }
        @media print {
          @page { size: auto; margin: 3mm; }
          html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; overflow: visible !important; }
          body > *:not([data-pick-print-root]) { display: none !important; }
          [data-pick-print-root] { position: static !important; overflow: visible !important; background: #fff !important; }
          .no-print { display: none !important; }
        }
      `}</style>
      <div className="no-print sticky top-0 z-10 flex items-center justify-center gap-3 border-slate-300 border-b bg-white px-4 py-2 shadow-sm">
        <button
          type="button"
          className="rounded bg-[#186999] px-5 py-1.5 font-medium text-sm text-white hover:brightness-110"
          onClick={doPrint}
          data-test-id="customer-receipt-print-btn"
        >
          🖨 {t('print')}
        </button>
        <button
          type="button"
          className="rounded border border-slate-300 px-4 py-1.5 text-slate-600 text-sm hover:bg-slate-50"
          onClick={onClose ?? (() => window.close())}
          data-test-id="customer-receipt-print-close"
        >
          ✕
        </button>
      </div>

      <div
        className="rcpt mx-auto bg-white p-2 text-black"
        style={{ fontFamily: 'Arial, Helvetica, sans-serif', width: '72mm' }}
      >
        <div className="font-bold text-[14px]" data-test-id="creceipt-org">
          {data.orgName ?? ''}
        </div>
        <div className="mt-1 text-center font-bold text-[16px]" data-test-id="creceipt-title">
          {t('receipt_title_customer')} № {data.number}
        </div>
        <div className="text-center text-[11px]">
          {t('receipt_from')} {data.dateStr}
        </div>
        <div className="mt-1 font-bold text-[11px] leading-tight">
          <div>
            {t('receipt_seller')}: {data.sellerName ?? ''}
          </div>
          <div>
            {t('receipt_buyer')}: {data.buyerName ?? ''}
          </div>
          <div>
            {t('receipt_phone')}: {data.phone ?? ''}
          </div>
          <div>
            {t('receipt_comment')}: {data.comment ?? ''}
          </div>
        </div>

        <table className="mt-2 w-full table-fixed border-collapse text-[10px]">
          <thead>
            <tr>
              <th className={`${th} w-[5mm]`}>№</th>
              <th className={th}>{t('receipt_col_name')}</th>
              <th className={`${th} w-[7mm]`}>{t('receipt_col_uom')}</th>
              <th className={`${th} w-[8mm]`}>{t('receipt_col_qty')}</th>
              <th className={`${th} w-[13mm]`}>{t('receipt_col_price')}</th>
              <th className={`${th} w-[14mm]`}>{t('receipt_col_sum')}</th>
            </tr>
          </thead>
          <tbody>
            {data.positions.map((p, i) => (
              <tr key={`${p.name}-${i}`}>
                <td className={`${td} text-center`}>{i + 1}</td>
                <td className={`${td} rcpt-name break-words text-[11px]`}>{p.name}</td>
                <td className={`${td} text-center`}>{p.uom ?? t('receipt_uom_default')}</td>
                <td className={`${td} text-center font-bold text-[11px]`}>{p.qty}</td>
                <td className={`${td} whitespace-nowrap text-right tabular-nums`}>
                  {money(p.priceMinor)}
                </td>
                <td className={`${td} whitespace-nowrap text-right font-bold tabular-nums`}>
                  {money(p.sumMinor)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-1 space-y-0.5 text-[12px]">
          <div className="flex justify-between">
            <span>{t('receipt_sum_total')}:</span>
            <span className="tabular-nums" data-test-id="creceipt-sum">
              {money(totalMinor)}
            </span>
          </div>
          <div className="flex justify-between">
            <span>{t('receipt_discount')}:</span>
            <span className="tabular-nums">{money(discountMinor)}</span>
          </div>
          <div className="flex justify-between font-bold">
            <span>{t('receipt_itogo')}:</span>
            <span className="tabular-nums" data-test-id="creceipt-itogo">
              {money(itogoMinor)}
            </span>
          </div>
        </div>

        <div className="mt-1 text-[11px]" data-test-id="creceipt-items-line">
          {t('receipt_items_sum', { n: data.positions.length, sum: money(itogoMinor, true) })}
        </div>
        <div className="font-bold text-[11px]" data-test-id="creceipt-words">
          {ruAmountWords(itogoMinor)}
        </div>

        <div className="mt-4 border-black border-t pt-1 font-bold text-[11px] italic">
          {t('receipt_footer')}
        </div>

        <button
          type="button"
          className="no-print mt-4 rounded border border-slate-400 px-4 py-2 text-sm"
          onClick={doPrint}
          data-test-id="customer-receipt-print-again"
        >
          🖨 {t('print')}
        </button>
      </div>
    </div>,
    document.body,
  );
}
