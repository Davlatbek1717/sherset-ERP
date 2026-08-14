'use client';

/**
 * F2 (POS redizayn) — 64px ko'k header (spec §3.1).
 *
 * Chapda SHERSET matn-logotipi (public/ da tayyor asset YO'Q — tekshirildi,
 * matn-logotip qalin oq, keng kerning bilan), o'rtada smena-chip (eski
 * «session strip» ma'lumotlari: kassir · yosh · savdo jami; `stale` → sariq),
 * o'ngda soat · aloqa indikatori · `children` sloti (F6 oyna-tugmalari).
 *
 * `position: fixed` ATAYLAB ishlatilmaydi — desktop klaviatura-evristikasi
 * (`keyboardRoot`) «fixed ichida button»ni klaviatura ildizi deb qidiradi;
 * header oddiy flex-oqimda turadi (reja «Global cheklovlar»).
 *
 * Soat minutlik interval bilan yangilanadi; sekundlar ko'rsatilmaydi —
 * kassirga kerak emas, interval esa arzon qoladi.
 */

import type { CurrentSession } from '@moysklad/contracts';
import { formatMoney } from '@moysklad/ui';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useState } from 'react';

export interface PosHeaderProps {
  session: CurrentSession;
  /** P4 — server bergan `openMinutes`dan sahifa hisoblagan matn (`formatShiftAge`). */
  shiftAge: string;
  /** `useServerLink()` — oxirgi so'rov network-darajada muvaffaqiyatlimi. */
  connectionOk: boolean;
  /** O'ng chet sloti — F6 oyna-tugmalari (va sahifaning CFD tugmasi) shu yerga. */
  children?: ReactNode;
}

/** «HH:MM» — lokal vaqt. Matn emas, raqam — i18n talab qilinmaydi. */
function clockText(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function useMinuteClock(): string {
  const [now, setNow] = useState(() => clockText(new Date()));
  useEffect(() => {
    // Minut boshiga tekislamaymiz — 30s qadam bilan eng ko'p yarim minut
    // kechikadi, kod esa sodda qoladi (drift-tekislash mantiqsiz murakkablik).
    const id = setInterval(() => setNow(clockText(new Date())), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function PosHeader({ session, shiftAge, connectionOk, children }: PosHeaderProps) {
  const t = useTranslations('pages.pos');
  const now = useMinuteClock();

  return (
    <header
      data-test-id="pos-header"
      className="flex h-16 shrink-0 items-center gap-4 bg-[var(--pos-brand)] px-4 text-[var(--pos-on-brand)]"
    >
      {/* SHERSET — matn-logotip (brend nomi, tarjima qilinmaydi — POS_ALLOWED). */}
      <span
        data-test-id="pos-header-logo"
        className="select-none font-extrabold text-[22px] tracking-[0.22em]"
      >
        SHERSET
      </span>

      {/* Smena-chip — eski «session strip» o'rnini bosadi (spec §3.1). */}
      <div
        data-test-id="pos-header-shift-chip"
        data-stale={session.stale ? 'true' : 'false'}
        className={`flex min-w-0 items-center gap-2.5 rounded-full px-4 py-2 text-[15px] ${
          session.stale
            ? 'bg-amber-400 font-semibold text-amber-950'
            : 'bg-white/15 text-[var(--pos-on-brand)]'
        }`}
      >
        <span className="truncate font-semibold">{session.cashier.name}</span>
        <span className="opacity-70">·</span>
        <span className="whitespace-nowrap">{t('header_shift_age', { age: shiftAge })}</span>
        <span className="opacity-70">·</span>
        <span className="whitespace-nowrap font-semibold tabular-nums">
          {t('header_sales', {
            n: session.salesCount,
            sum: formatMoney(BigInt(session.salesSumMinor)),
          })}
        </span>
      </div>

      <div className="ml-auto flex items-center gap-4">
        {/* Aloqa indikatori — nuqta doim turadi, matn faqat uzilganda
            (spec §3.1: «uzilsa qizil nuqta + banner»). */}
        <div
          data-test-id="pos-header-conn"
          data-ok={connectionOk ? 'true' : 'false'}
          title={connectionOk ? t('header_conn_ok') : t('header_conn_lost')}
          className="flex items-center gap-2"
        >
          <span
            className={`h-3 w-3 rounded-full ${
              connectionOk ? 'bg-emerald-400' : 'animate-pulse bg-red-500'
            }`}
          />
          {!connectionOk && (
            <span className="whitespace-nowrap rounded-md bg-red-500 px-2.5 py-1 font-bold text-[13px] text-white">
              {t('header_conn_lost')}
            </span>
          )}
        </div>

        {/* Soat — testda assert YO'Q (flaky), faqat ko'rinish. */}
        <span
          data-test-id="pos-header-clock"
          className="font-semibold text-[20px] tabular-nums tracking-wide"
        >
          {now}
        </span>

        {/* F6 sloti — oyna-tugmalari / sahifaning CFD tugmasi. */}
        {children}
      </div>
    </header>
  );
}
