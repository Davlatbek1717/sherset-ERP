'use client';

/**
 * USB/Bluetooth keyboard-wedge shtrix-kod skaneri — global keydown tinglaydi va
 * TEZ ketma-ket kelgan belgilar (odam yozishidan tezroq) + yakuniy `Enter` ni
 * bitta «skan» deb ajratadi. Odam qo'lda yozganda belgilar sekin keladi
 * (> maxGapMs) — u hech qachon skan sifatida qabul qilinmaydi, shuning uchun
 * qidiruv maydoniga oddiy yozish buzilmaydi.
 *
 * Nega `isTypingContext` (use-keyboard-nav.ts) qo'llanmaydi: u INPUT fokusda
 * bo'lsa bail qiladi — lekin skaner aynan qidiruv maydoniga «yozadi». Ajratish
 * vaqt bo'yicha bo'ladi (tez burst), fokus bo'yicha emas. Faqat modal/dialog
 * ochiq bo'lsa aralashmaymiz (checkout modalining o'z klaviatura mantig'i bor).
 *
 * Yadro (`feedKey`) — SOF funksiya (`now` tashqaridan uzatiladi) — birlik-test
 * qilinadi; React hook faqat uni window keydown'ga ulaydi.
 */

import { useEffect, useRef } from 'react';

export interface WedgeState {
  /** Hozirgacha yig'ilgan belgilar. */
  buffer: string;
  /** Oxirgi qabul qilingan belgi vaqti (ms), yoki null (bo'sh). */
  lastAt: number | null;
}

export interface WedgeOpts {
  /** Belgilar orasidagi maksimal oraliq (ms) — undan katta = odam yozishi. */
  maxGapMs?: number;
  /** Skan deb hisoblash uchun minimal uzunlik (qisqa tasodifiy kirishni rad etadi). */
  minLength?: number;
}

const DEFAULT_MAX_GAP_MS = 50;
const DEFAULT_MIN_LENGTH = 6;

export const EMPTY_WEDGE_STATE: WedgeState = { buffer: '', lastAt: null };

/**
 * Bitta klaviatura hodisasini qayta ishlaydi. `Enter` kelganda — bufer yetarli
 * uzun VA tez yig'ilgan bo'lsa `scan` qaytaradi; aks holda faqat holatni
 * yangilaydi (odatiy `Enter` chaqiruvchida davom etadi).
 */
export function feedKey(
  state: WedgeState,
  input: { key: string; now: number },
  opts: WedgeOpts = {},
): { state: WedgeState; scan?: string } {
  const maxGap = opts.maxGapMs ?? DEFAULT_MAX_GAP_MS;
  const minLen = opts.minLength ?? DEFAULT_MIN_LENGTH;
  const { key, now } = input;

  if (key === 'Enter') {
    const fastEnough = state.lastAt !== null && now - state.lastAt <= maxGap;
    const isScan = fastEnough && state.buffer.length >= minLen;
    return isScan ? { state: EMPTY_WEDGE_STATE, scan: state.buffer } : { state: EMPTY_WEDGE_STATE };
  }

  // Faqat bitta bosiladigan belgi (raqam/harf/simvol). Shift/Tab/Arrow/... = uzun key.
  if (key.length === 1) {
    const continues = state.lastAt !== null && now - state.lastAt <= maxGap;
    const buffer = continues ? state.buffer + key : key;
    return { state: { buffer, lastAt: now } };
  }

  // Boshqa (modifikator/navigatsiya) tugmalar — e'tiborsiz, holat o'zgarmaydi.
  return { state };
}

function isDialogOpen(): boolean {
  return (
    typeof document !== 'undefined' &&
    document.querySelector(
      '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
    ) !== null
  );
}

export interface UseBarcodeScannerOpts extends WedgeOpts {
  /** false bo'lsa listener ulanmaydi (masalan smena yopiq). */
  enabled?: boolean;
  /** Bir xil kodni shu oraliqda (ms) takroran o'qishni tashlab yuboradi. */
  dedupeMs?: number;
}

const DEFAULT_DEDUPE_MS = 1000;

/**
 * Global keyboard-wedge skanerni ulaydi. `onScan(code)` — skan aniqlanganda
 * chaqiriladi (faqat modal yopiq bo'lganda). Dubl-skan `dedupeMs` bilan filtrlanadi.
 */
export function useBarcodeScanner(
  onScan: (code: string) => void,
  opts: UseBarcodeScannerOpts = {},
): void {
  const { enabled = true, maxGapMs, minLength, dedupeMs = DEFAULT_DEDUPE_MS } = opts;
  const stateRef = useRef<WedgeState>(EMPTY_WEDGE_STATE);
  const lastScanRef = useRef<{ code: string; at: number }>({ code: '', at: 0 });
  // onScan har render'da o'zgarishi mumkin — listenerni qayta ulamaslik uchun ref.
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (isDialogOpen()) return;
      const now = Date.now();
      const { state, scan } = feedKey(
        stateRef.current,
        { key: e.key, now },
        { maxGapMs, minLength },
      );
      stateRef.current = state;
      if (!scan) return;
      // Dubl-skan himoyasi (skaner ikki marta yuborishi mumkin).
      if (scan === lastScanRef.current.code && now - lastScanRef.current.at < dedupeMs) return;
      lastScanRef.current = { code: scan, at: now };
      e.preventDefault();
      onScanRef.current(scan);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled, maxGapMs, minLength, dedupeMs]);
}
