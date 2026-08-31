'use client';

/**
 * Mijoz havolani bosganda ko'radigan CHEK (egasi, 2026-08-16: «linkga bosib
 * mijozlar kirib ko'rsin o'zini chekini»).
 *
 * 🔴 MODEL QAYTA ISHLATILADI, chizilmaydi: qatorlar, jamilar, to'lov qatorlari
 * va «Sizning qarzingiz» `lib/pos/receipt-model.ts` dan keladi — qog'oz chek,
 * Electron chop etish va ESC/POS ham AYNAN shundan oziqlanadi (uch renderer,
 * bitta manba). Bu faylda hech qanday summa HISOBLANMAYDI; bu yerda faqat
 * MOBIL ko'rinish: mijoz telefonda ochadi, shuning uchun 72mm lenta emas,
 * ekran kengligidagi karta va o'qiladigan raqamlar.
 */

import {
  RECEIPT_LABELS,
  type ReceiptSaleInput,
  buildReceiptModel,
  fmtSom,
} from '@/lib/pos/receipt-model';

export type PublicReceiptSale = ReceiptSaleInput;

export function PublicReceipt({ sale }: { sale: PublicReceiptSale }) {
  const m = buildReceiptModel(sale);
  // Chop etuvchi renderer bilan AYNI shart (`buildReceiptHtml`): qarz qatori
  // faqat qarz bo'lganda, qarz to'lovi chekida esa 0 bo'lsa ham chiziladi.
  const showDebt = m.debtAfterMinor != null && (m.debtAfterMinor > 0n || m.showZeroDebt);

  return (
    <div
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
      data-test-id="public-receipt"
    >
      <div className="border-slate-200 border-b bg-slate-50 px-5 py-4 text-center">
        <div className="font-semibold text-base text-slate-900">{m.orgName}</div>
        {m.orgPhone && <div className="mt-0.5 text-slate-500 text-xs">{m.orgPhone}</div>}
        <div className="mt-2 font-bold text-lg text-slate-900">
          {m.title} № {m.docNumber}
        </div>
        <div className="mt-0.5 text-slate-500 text-xs">{m.dateLabel}</div>
      </div>

      <div className="space-y-1 px-5 py-3 text-slate-600 text-xs">
        <div>
          <span className="text-slate-400">{RECEIPT_LABELS.seller}:</span> {m.sellerName}
        </div>
        <div>
          <span className="text-slate-400">{RECEIPT_LABELS.buyer}:</span> {m.buyerName}
        </div>
        {m.buyerPhone && (
          <div>
            <span className="text-slate-400">{RECEIPT_LABELS.phone}:</span> {m.buyerPhone}
          </div>
        )}
        {m.comment && (
          <div>
            <span className="text-slate-400">{RECEIPT_LABELS.comment}:</span> {m.comment}
          </div>
        )}
      </div>

      {/* Tovarlar — telefonda 6 ustunli jadval siqilib ketadi, shuning uchun
          har qator KARTA: nomi, «soni × narxi» va o'ngda summa. */}
      <div className="divide-y divide-slate-100 border-slate-200 border-t">
        {m.rows.map((r) => (
          <div key={`${r.index}-${r.name}`} className="flex items-start gap-3 px-5 py-3">
            <span className="mt-0.5 w-5 shrink-0 text-right text-slate-400 text-xs tabular-nums">
              {r.index}
            </span>
            <div className="min-w-0 flex-1">
              <div className="break-words font-medium text-slate-800 text-sm">{r.name}</div>
              <div className="mt-0.5 text-slate-500 text-xs">
                {r.qty} {r.uom} × {r.price}
              </div>
            </div>
            <div className="shrink-0 whitespace-nowrap font-semibold text-slate-900 text-sm tabular-nums">
              {r.sum}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-1.5 border-slate-200 border-t bg-slate-50 px-5 py-4 text-sm">
        <Line label={RECEIPT_LABELS.subtotal} value={m.subtotal} />
        <Line label={RECEIPT_LABELS.discount} value={m.discount} />
        <Line label={RECEIPT_LABELS.total} value={m.total} strong />
        {m.payments.map((p) => (
          <div key={p.label}>
            <Line label={p.label} value={p.value} />
            {p.note && (
              <div className="flex items-baseline justify-between gap-3 text-[11px] text-slate-400">
                <span>{p.note.left}</span>
                <span className="tabular-nums">{p.note.right}</span>
              </div>
            )}
          </div>
        ))}
        {/* Mijoz uchun eng muhim qator — ajratib ko'rsatiladi. */}
        {showDebt && (
          <div className="mt-2 flex items-baseline justify-between gap-3 border-slate-200 border-t pt-2">
            <span className="font-semibold text-slate-900">{RECEIPT_LABELS.debtAfter}</span>
            <span className="font-bold text-amber-700 text-base tabular-nums">
              {fmtSom(m.debtAfterMinor as bigint)}
            </span>
          </div>
        )}
      </div>

      <div className="space-y-1 px-5 py-4 text-center text-slate-500 text-xs">
        <div>
          {RECEIPT_LABELS.itemsCount}: <b>{m.itemsCount}</b> {RECEIPT_LABELS.itemsUnit}
        </div>
        <div>
          {RECEIPT_LABELS.inWords}: {m.inWords}
        </div>
        <div className="pt-1">{RECEIPT_LABELS.footerLegal}</div>
        <div className="font-medium text-slate-600">{RECEIPT_LABELS.footerThanks}</div>
      </div>
    </div>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={strong ? 'font-semibold text-slate-900' : 'text-slate-500'}>{label}</span>
      <span
        className={`tabular-nums ${strong ? 'font-bold text-base text-slate-900' : 'text-slate-700'}`}
      >
        {value}
      </span>
    </div>
  );
}
