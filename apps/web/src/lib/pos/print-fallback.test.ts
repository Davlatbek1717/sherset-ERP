import { describe, expect, it } from 'vitest';
import { printFollowUp } from './print-fallback';

/**
 * P7 — chek chiqmaganda NIMA qilish kerakligining qaror jadvali.
 *
 * 🔴 Jonli simptom (egasi, 2026-08-11 monoblokda): chek chiqarishda qobiq
 * ichida brauzer chek sahifasi ochilib **tasdiq so'ralardi** — avtomatik
 * chiqmasdi. Sabab qavat-2: `CompanySettings.receiptPrinterName` = NULL
 * (prodda `company_settings` **0 qator**), shuning uchun `handled:false`
 * qaytardi va chaqiruvchi `?auto=1` popup'ini ochardi. Popup esa qobiq
 * ichida `window.print()` chaqiradi ⇒ Chromium tasdiq oynasi.
 *
 * Qaror: QOBIQ ichida «printer sozlanmagan» shoxi popup OCHMAYDI —
 * kassirga aniq ogohlantirish chiqadi. Oddiy brauzerda popup — YAGONA
 * chop yo'li, shuning uchun u yerda o'zgarmaydi.
 *
 * B3 (2026-08-12): chek va Z-hisobotdagi `printer-not-set` sababi butunlay
 * yo'qoldi — ular qurilmaning Windows sukut printeriga bosiladi. Sozlama
 * bo'shlig'i endi YAGONA: `no-printer-mapped` (ombor→printer, yig'ish varag'i).
 */
describe('printFollowUp — chop natijasi → keyingi qadam', () => {
  it('chop bo‘ldi ⇒ hech narsa', () => {
    expect(printFollowUp({ handled: true, ok: true }, { inShell: true })).toBe('none');
    expect(printFollowUp({ handled: true, ok: false }, { inShell: true })).toBe('error');
  });

  it('qobiqda omborga printer biriktirilmagan ⇒ ogohlantirish (popup EMAS)', () => {
    // Yacheykali chek (yig'ish varag'i) — B3'dan keyin YAGONA sozlama shoxi.
    expect(
      printFollowUp({ handled: false, ok: false, reason: 'no-printer-mapped' }, { inShell: true }),
    ).toBe('configure-printer');
  });

  it('oddiy brauzerda biriktirilmagan ⇒ popup (yagona chop yo‘li)', () => {
    expect(
      printFollowUp({ handled: false, ok: false, reason: 'no-printer-mapped' }, { inShell: false }),
    ).toBe('popup');
  });

  it('agent yo‘q / ma’lumot yuklanmadi ⇒ popup (qobiqda ham)', () => {
    // Bu ikkisi sozlama muammosi EMAS — ogohlantirish noto'g'ri manzil
    // ko'rsatardi, popup esa hech bo'lmasa chekni ekranga chiqaradi.
    expect(
      printFollowUp({ handled: false, ok: false, reason: 'no-agent' }, { inShell: true }),
    ).toBe('popup');
    expect(
      printFollowUp({ handled: false, ok: false, reason: 'load-failed' }, { inShell: true }),
    ).toBe('popup');
  });

  it('reason yo‘q (eski chaqiruvchi) ⇒ popup — xulq o‘zgarmaydi', () => {
    expect(printFollowUp({ handled: false, ok: false }, { inShell: true })).toBe('popup');
  });
});
