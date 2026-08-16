'use client';

/**
 * Chop natijasini YAKUNLASH — chek, Z-hisobot va yacheykali chek uchun bitta yo'l.
 *
 * F1 (POS redizayn): hook `page.tsx` dan XULQNI O'ZGARTIRMASDAN ko'chdi —
 * endi uni sahifa ham (chek chop, Z-hisobot), `cheklar-mode` dagi
 * ChekDetailPanel ham o'qiydi. Ikki nusxa bo'lsa biri fallback'ni unutardi.
 *
 * 🔴 P7 (2026-08-11, egasi monoblokda): har qanday `handled:false` ga
 * `?auto=1` popup'i ochilardi. Qobiq ichida o'sha popup `window.print()`
 * chaqiradi ⇒ Chromium TASDIQ oynasi — «exe chekni o'zi chiqarsin»ning
 * teskarisi. 2026-08-16 da qoida yakunlandi: **qobiqda popup umuman
 * ochilmaydi**, uzilish sababi toast bilan aytiladi; oddiy brauzerda popup
 * yagona chop yo'li bo'lgani uchun qoladi. Qaror `printFollowUp` da.
 *
 * «Printer sozlanmagan» shoxi ham o'sha kuni yo'qoldi — uchala chek ham
 * printer biriktirilmagan bo'lsa qurilmaning Windows sukut printeriga
 * bosiladi, ya'ni kassirni sozlamaga yuboradigan holat qolmadi.
 */

// Chop natijasi → keyingi qadam (qobiqda popup ochilmaydi) — izohi modulda.
import { printFollowUp } from '@/lib/pos/print-fallback';
import { type PrintIdleReason, hasNativePrinting } from '@/lib/print-agent';
import { useToast } from '@moysklad/ui';
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';

export function usePrintOutcome() {
  const t = useTranslations('pages.sotuv');
  const { toast } = useToast();
  return useCallback(
    async (
      outcome: { handled: boolean; ok: boolean; reason?: PrintIdleReason; error?: string },
      popup: { url: string; features?: string },
    ) => {
      switch (printFollowUp(outcome, { inShell: hasNativePrinting() })) {
        case 'none':
          return;
        case 'error':
          // Qobiq aniq sababni qaytaradi («Printer javob bermadi (vaqt tugadi)»,
          // «Bo'sh hujjat», «Chek shakli yuklanmadi»), lekin ilgari u shu yerda
          // TASHLAB YUBORILARDI va kassir doim bir xil umumiy matnni ko'rardi.
          // Sukut printerga o'tgach qolgan yagona nosozlik sinfi aynan shular —
          // sabab ko'rinmasa keyingi nosozlik yana taxminga aylanadi.
          // Qobiqda `handled:false` (hujjat yuklanmadi) ham shu shoxga tushadi
          // va uning `error` maydoni bo'sh — sababsiz «chek chiqmadi» esa
          // aynan o'sha «nega chiqmadi?» savolini qoldiradi.
          toast.error(t('print_error'), {
            description:
              outcome.error ?? (outcome.handled ? undefined : t('print_load_failed_hint')),
          });
          return;
        default:
          window.open(popup.url, '_blank', popup.features ?? 'width=420,height=680,noopener');
      }
    },
    [toast, t],
  );
}
