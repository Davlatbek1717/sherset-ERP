'use client';

/**
 * F6 (POS redizayn) — headerga singdirilgan oyna-tugmalari (spec §7).
 *
 * — ❐ ✕ uchligi endi ko'k headerning eng o'ng chetida, tekis tugmalar bo'lib
 * turadi (✕ hover qizil). FAQAT yangi qobiqda (exe 1.7.0+, `electronAPI.
 * minimize` mavjud) chiziladi; oddiy brauzerda va eski exe'da hech narsa
 * chizilmaydi — u yerda preload'ning suzuvchi uchligi o'zi turadi. Chizilganda
 * <html> ga `data-sherset-window-controls="page"` markeri qo'yiladi va yangi
 * preload shu markerni ko'rib o'z uchligini bostiradi; unmount'da marker olib
 * tashlanadi (suzuvchi uchlik qaytadi). Hech qaysi versiya-kombinatsiyada
 * tugmalar ikkilanmaydi ham, yo'qolmaydi ham.
 *
 * ✕ `requestQuit` chaqiradi — tasdiq dialogi main.js tomonda (E1), tasodifiy
 * bosish savdoni yo'qotmaydi. `position: fixed` ATAYLAB yo'q — desktop
 * klaviatura-evristikasi «fixed ichida button»ni klaviatura ildizi deb qidiradi.
 *
 * Bridge aniqlash `useEffect`da (shell-version-badge naqshi): SSR/hydration'da
 * server ham, brauzer ham avval null chizadi — mismatch bo'lmaydi.
 */

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

/** Preload bilan BIR XIL literal (tether: `window-controls.test.tsx`). */
const MARKER_ATTR = 'data-sherset-window-controls';

interface WindowBridge {
  minimize?: () => void;
  toggleWindowed?: () => void;
  requestQuit?: () => void;
}

const BTN =
  'flex w-[56px] items-center justify-center self-stretch text-[20px] ' +
  'text-[var(--pos-on-brand)] transition-colors';

export function WindowControls() {
  const t = useTranslations('pages.pos');
  const [api, setApi] = useState<WindowBridge | null>(null);

  useEffect(() => {
    const el = (window as unknown as { electronAPI?: WindowBridge }).electronAPI;
    // Versiya-moslik matritsasi (spec §7): `minimize` yo'q = eski exe yoki
    // brauzer — chizilmaydi, marker ham qo'yilmaydi.
    if (typeof el?.minimize !== 'function') return;
    setApi(el);
    document.documentElement.setAttribute(MARKER_ATTR, 'page');
    return () => {
      document.documentElement.removeAttribute(MARKER_ATTR);
    };
  }, []);

  if (!api) return null;

  return (
    // `-mr-4` header'ning px-4 ichki bo'shlig'ini yutadi — ✕ ekranning eng
    // o'ng chetiga yopishadi (burchakka «otish» sensorli ekranda qulay).
    <div data-test-id="pos-window-controls" className="-mr-4 flex self-stretch">
      <button
        type="button"
        data-test-id="pos-win-minimize"
        title={t('win_minimize')}
        aria-label={t('win_minimize')}
        onClick={() => api.minimize?.()}
        className={`${BTN} hover:bg-white/20`}
      >
        —
      </button>
      <button
        type="button"
        data-test-id="pos-win-toggle"
        title={t('win_toggle')}
        aria-label={t('win_toggle')}
        onClick={() => api.toggleWindowed?.()}
        className={`${BTN} hover:bg-white/20`}
      >
        ❐
      </button>
      <button
        type="button"
        data-test-id="pos-win-close"
        title={t('win_close')}
        aria-label={t('win_close')}
        onClick={() => api.requestQuit?.()}
        className={`${BTN} hover:bg-red-600`}
      >
        ✕
      </button>
    </div>
  );
}
