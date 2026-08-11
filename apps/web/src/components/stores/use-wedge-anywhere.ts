'use client';

/**
 * useWedgeAnywhere — «kursor QAYERDA bo'lishidan qat'i nazar skan» (TZ v3 §3,
 * kirish yo'li 1).
 *
 * USB/Bluetooth wedge skaner — bu shunchaki juda tez klaviatura: u fokusda
 * turgan elementga «yozadi» va oxirida Enter bosadi. Skan-maydon fokusni
 * yo'qotgan zahoti (✕ / «Kamera» / checkbox bosilgach fokus TUGMADA qoladi)
 * kod hech qayerga tushmaydi — omborchi uchun skaner «o'ldi». Shuning uchun
 * document darajasida CAPTURE fazasida tinglaymiz va burst'ni O'ZIMIZ yig'amiz.
 *
 * Xulq (2026-07-26 dagi «Scan» oynasi tutqichidan AYNAN ko'chirilgan — endi
 * ikkala oyna bitta manbadan yuradi, review 2026-08-10 I3):
 *   · `inputRef` fokusda bo'lsa — chetlab o'tamiz (maydon o'zi uddalaydi);
 *   · `INPUT` / `TEXTAREA` / `contentEditable` — chetlab o'tamiz (son-maydoni,
 *     qidiruv maydoni… ularning o'z tutqichi bor: «Sanash» dagi `wedgeGuard`);
 *   · bosiladigan (printable) klavishlar YUTILADI (`preventDefault`) — aks
 *     holda skanerning Enter'i fokusdagi tugmani «bosib» yuborardi va terilgan
 *     harflar tasodifiy hotkey'larni uchirardi;
 *   · burst oynasi 900ms: oxirgi klavishdan keyin shundan ko'p vaqt o'tsa,
 *     yig'ilgani CHALA deb tashlanadi va yangi burst boshlanadi;
 *   · Enter — bufer bo'sh bo'lmasa `onCode(bufer)`; bo'sh bo'lsa hech narsa
 *     (oddiy Enter o'z yo'lida ketaveradi).
 *
 * `onCode` va `isBlocked` ref'ga «qadaladi» — ular har render'da yangilansa
 * ham listener QAYTA ULANMAYDI, ya'ni yarim yig'ilgan burst yo'qolmaydi.
 */

import { type RefObject, useEffect, useRef } from 'react';

export interface WedgeAnywhereOptions {
  /** Odatda modal `open` — yopiq oynada tinglash mumkin emas. */
  enabled: boolean;
  /** To'liq o'qilgan kod (Enter bilan yakunlangan burst). */
  onCode: (code: string) => void;
  /**
   * `true` qaytarsa — klavishlar UMUMAN ishlanmaydi va yarim burst tashlanadi
   * (masalan modal-ustidagi savol ochiq va javob berilmaguncha skan mantiqsiz).
   * Ataylab funksiya: tutqich ref'lar orqali ishlagani uchun qiymat emas,
   * HOZIRGI holat kerak.
   */
  isBlocked?: () => boolean;
  /** Skan-maydonning o'zi — fokusda bo'lsa tutqich aralashmaydi. */
  inputRef?: RefObject<HTMLInputElement | null>;
}

/** Burst oynasi (ms): undan uzoq tanaffus = yig'ilgani chala, tashlanadi. */
const BURST_WINDOW_MS = 900;

export function useWedgeAnywhere({ enabled, onCode, isBlocked, inputRef }: WedgeAnywhereOptions) {
  const onCodeRef = useRef(onCode);
  const isBlockedRef = useRef(isBlocked);
  useEffect(() => {
    onCodeRef.current = onCode;
    isBlockedRef.current = isBlocked;
  }, [onCode, isBlocked]);

  useEffect(() => {
    if (!enabled) return;
    const buf = { s: '', at: 0 };
    const onKey = (e: KeyboardEvent) => {
      if (isBlockedRef.current?.()) {
        // Bloklangan payt yig'ilgan yarim burst keyinchalik YANGI kodga
        // yopishib qolmasligi kerak — bufer darhol tozalanadi.
        buf.s = '';
        return;
      }
      if (inputRef?.current && document.activeElement === inputRef.current) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable))
        return;
      const now = Date.now();
      if (now - buf.at > BURST_WINDOW_MS) buf.s = '';
      buf.at = now;
      if (e.key === 'Enter') {
        if (buf.s) {
          e.preventDefault();
          e.stopPropagation();
          const v = buf.s;
          buf.s = '';
          onCodeRef.current(v);
        }
        return;
      }
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        buf.s += e.key;
        e.preventDefault();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [enabled, inputRef]);
}
