'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

/**
 * Qurilma holati — kirish ekranining burchagida yoki POS headerida.
 *
 * NEGA KERAK: qobiq versiyasini bilishning yagona yo'li Windows «Приложения и
 * возможности» edi, ya'ni telefon orqali (K06). «Chek chiqmayapti» shikoyatining
 * birinchi savoli esa har doim «qaysi versiya turibdi?» — javob endi ekranda.
 *
 * Variantlar (F9, spec §3.1): `floating` (default) — kassa-kirish ekranidagi
 * fixed burchak-belgi; `header` — POS headeriga singdirilgan chip, oddiy
 * oqimda (fixed EMAS — klaviatura-evristika va header-layout sharti).
 *
 * Brauzerda (qobiqsiz) hech narsa chizilmaydi — bu POS'ning oddiy web ko'rinishi.
 */
interface ShellStatus {
  version: string;
  updateReady: boolean;
  defaultPrinter: string;
}

interface Bridge {
  isSherset?: boolean;
  version?: string;
  shellStatus?: () => Promise<ShellStatus>;
}

export function ShellVersionBadge({ variant = 'floating' }: { variant?: 'floating' | 'header' }) {
  // Repo konvensiyasi: POS matnlari `pages.pos` ostida (boshqa POS dialoglar kabi).
  const t = useTranslations('pages.pos');
  const [status, setStatus] = useState<ShellStatus | null>(null);
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    const el = (window as unknown as { electronAPI?: Bridge }).electronAPI;
    if (!el?.isSherset) return;
    setVersion(el.version ?? null);
    // Eski qobiqda (1.4.0) `shellStatus` yo'q — versiya baribir ko'rinadi.
    if (!el.shellStatus) return;
    let alive = true;
    void el
      .shellStatus()
      .then((s) => {
        if (alive) setStatus(s);
      })
      .catch(() => {
        // Holat kelmasa versiya qoladi — belgi yo'qolmasin.
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!version && !status) return null;

  return (
    <div
      data-test-id="shell-version-badge"
      className={
        variant === 'header'
          ? // Header ichida: ko'k fonda oq-shaffof chip, px-o'lchamlar (F2 qoidasi).
            'flex items-center gap-2 whitespace-nowrap rounded-md bg-white/15 px-2.5 py-1 text-[13px] text-[var(--pos-on-brand)]'
          : 'fixed right-3 bottom-3 flex items-center gap-2 rounded-md bg-slate-800/80 px-3 py-1.5 text-slate-300 text-xs'
      }
    >
      {/* «v1.5.0» — texnik belgi, tarjima qilinmaydi (jsx-text skaneridan chetda). */}
      <span>{`v${status?.version ?? version}`}</span>
      {status?.defaultPrinter ? (
        <span>· {status.defaultPrinter}</span>
      ) : status ? (
        <span data-test-id="shell-printer-missing" className="text-amber-400">
          · {t('shell_printer_missing')}
        </span>
      ) : null}
      {status?.updateReady ? (
        <span data-test-id="shell-update-ready" className="text-sky-400">
          · {t('shell_update_ready')}
        </span>
      ) : null}
    </div>
  );
}
