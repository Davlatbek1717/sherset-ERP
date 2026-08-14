'use client';

/**
 * «Navbat» rejimi — omborchi zanjiridagi cheklar: «Jarayonda» (picking) va
 * «Tayyor» (ready) bloklari. F1 da ikkalasi BITTA faylda, lekin hali ikki
 * alohida tab sifatida chiziladi — F4 ularni ikki ustunli kanban qilib
 * birlashtiradi (spec §5.2).
 *
 * F1 (POS redizayn, 2026-08-14): JSX `page.tsx` dan XULQNI O'ZGARTIRMASDAN
 * ko'chirildi. Polling-so'rovlar va amallar (bekor qilish, tayyor deb
 * belgilash, to'lovga tortish) sahifada QOLADI — bekor/tayyor tasdiq
 * dialoglari va savatga yuklash savat holatiga bog'liq.
 */

import { formatMoney } from '@moysklad/ui';
import { CheckCircle, Clock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { SaleRow } from './pos-types';

interface NavbatModeProps {
  /** Qaysi blok chizilsin — F1 da tab'lar hali alohida ('jarayonda' | 'tayyor'). */
  which: 'jarayonda' | 'tayyor';
  pickingSales: SaleRow[];
  readySales: SaleRow[];
  /** Yig'ilayotgan/yig'ilgan chekni bekor qilish (tasdiq sahifada). */
  cancelSale: (saleId: string, saleName: string) => void | Promise<void>;
  /** «Jarayonda» chekni kassir o'zi `ready` ga o'tkazishi (tasdiq sahifada). */
  markReady: (saleId: string, saleName: string) => void | Promise<void>;
  /** «Tayyor» chekni savatga tortib to'lov oynasini ochish. */
  loadReadyToCart: (saleId: string) => void | Promise<void>;
}

export function NavbatMode({
  which,
  pickingSales,
  readySales,
  cancelSale,
  markReady,
  loadReadyToCart,
}: NavbatModeProps) {
  const t = useTranslations('pages.sotuv');

  if (which === 'jarayonda') {
    return (
      <div className="flex-1 overflow-y-auto p-3">
        {pickingSales.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-[var(--ms-text-muted)]">
            <Clock className="h-10 w-10 opacity-30" />
            <p className="text-sm">{t('picking_empty_title')}</p>
            <p className="text-xs">{t('picking_empty_hint')}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Yig'ilmoqda (picking) */}
            {pickingSales.length > 0 && (
              <div>
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-amber-600">
                  {t('picking_section_title')}
                </p>
                <div className="flex flex-col gap-1.5">
                  {pickingSales.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2"
                    >
                      <Clock className="h-4 w-4 shrink-0 animate-pulse text-amber-500" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-[var(--ms-text-primary)]">
                          {s.name}
                        </div>
                        <div className="text-xs text-[var(--ms-text-muted)]">
                          {formatMoney(BigInt(s.sumMinor))}
                          {s._count?.positions != null &&
                            ` · ${t('positions_count', { n: s._count.positions })}`}
                        </div>
                      </div>
                      <span className="shrink-0 rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                        {t('picker_collecting')}
                      </span>
                      <button
                        type="button"
                        onClick={() => cancelSale(s.id, s.name)}
                        className="flex h-8 shrink-0 items-center rounded-lg border border-amber-300 px-3 text-xs font-semibold text-amber-800 transition-all hover:bg-amber-100 active:scale-95"
                      >
                        {t('cancel_sale')}
                      </button>
                      <button
                        type="button"
                        onClick={() => markReady(s.id, s.name)}
                        className="flex h-8 shrink-0 items-center gap-1 rounded-lg bg-amber-500 px-3 text-xs font-bold text-white transition-all hover:bg-amber-600 active:scale-95"
                      >
                        <CheckCircle className="h-3.5 w-3.5" />
                        {t('mark_ready')}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-3">
      {readySales.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-[var(--ms-text-muted)]">
          <CheckCircle className="h-10 w-10 opacity-30" />
          <p className="text-sm">{t('ready_empty_title')}</p>
          <p className="text-xs">{t('ready_empty_hint')}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {readySales.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2.5"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100">
                <CheckCircle className="h-4 w-4 text-emerald-600" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-[var(--ms-text-primary)]">
                  {s.name}
                </div>
                <div className="text-xs text-[var(--ms-text-muted)]">
                  {formatMoney(BigInt(s.sumMinor))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => cancelSale(s.id, s.name)}
                className="flex h-9 shrink-0 items-center rounded-lg border border-emerald-300 px-3 text-xs font-semibold text-emerald-800 transition-all hover:bg-emerald-100 active:scale-95"
              >
                {t('cancel_sale')}
              </button>
              <button
                type="button"
                onClick={() => loadReadyToCart(s.id)}
                className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-emerald-500 px-4 text-sm font-bold text-white transition-all hover:bg-emerald-600 active:scale-95"
              >
                💳 {t('pay')}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
