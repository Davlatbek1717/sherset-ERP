'use client';

/**
 * Klaviatura navigatsiyasi (2026-07-13 talab):
 *   • BACKSPACE  → orqaga qaytish («Ro'yxatga qaytish» tugmasini bosmasdan)
 *   • ENTER      → sichqoncha turgan qatorga kirish (hover + Enter)
 *
 * XAVFSIZLIK (eng muhim qism): Backspace matn maydonlarida MATNNI O'CHIRADI.
 * Shuning uchun hook fokus qayerdaligini tekshiradi va quyidagi hollarda
 * UMUMAN aralashmaydi:
 *   - input / textarea / select ichida (matn yozilyapti)
 *   - contenteditable ichida
 *   - modal/dialog ochiq (o'zining Escape/yopish mantiqi bor)
 *   - modifikator bosilgan (Ctrl/Alt/Meta/Shift — brauzer yorliqlari)
 *
 * Shu tekshiruvlar tufayli hech qanday yozuv yo'qolmaydi.
 */

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** Fokus matn kiritish joyidami / modal ochiqmi — unda aralashmaymiz. */
function isTypingContext(e: KeyboardEvent): boolean {
  if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return true;

  const el = e.target as HTMLElement | null;
  if (el) {
    const tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (el.isContentEditable) return true;
    // Radix Modal/Dialog ochiq bo'lsa — uning o'z klaviatura mantig'i bor.
    if (el.closest('[role="dialog"], [role="alertdialog"]')) return true;
  }
  // Sahifada ochiq dialog bormi (fokus tashqarida bo'lsa ham).
  if (
    typeof document !== 'undefined' &&
    document.querySelector('[role="dialog"][data-state="open"]')
  ) {
    return true;
  }
  return false;
}

/**
 * BACKSPACE → orqaga qaytish. Matn maydonlarida va modal ochiqda ishlamaydi.
 * `enabled=false` bilan vaqtincha o'chirish mumkin.
 */
export function useBackspaceBack(enabled = true): void {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Backspace') return;
      if (isTypingContext(e)) return; // matn yozilyapti / modal ochiq → tegmaymiz
      e.preventDefault();
      router.back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, router]);
}

/**
 * ENTER → sichqoncha ustida turgan qatorga kirish.
 * Sahifa `onHoverEnter` orqali «hozir qaysi qator ustidaman» ni beradi.
 */
export function useEnterOnHover(getHref: () => string | null, enabled = true): void {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return;
      if (isTypingContext(e)) return; // formada Enter = saqlash, tegmaymiz
      const href = getHref();
      if (!href) return;
      e.preventDefault();
      router.push(href);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, getHref, router]);
}
