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
 */
describe('printFollowUp — chop natijasi → keyingi qadam', () => {
  it('chop bo‘ldi ⇒ hech narsa', () => {
    expect(printFollowUp({ handled: true, ok: true }, { inShell: true })).toBe('none');
    expect(printFollowUp({ handled: true, ok: false }, { inShell: true })).toBe('error');
  });

  it('qobiqda printer sozlanmagan ⇒ ogohlantirish (popup EMAS)', () => {
    expect(
      printFollowUp({ handled: false, ok: false, reason: 'printer-not-set' }, { inShell: true }),
    ).toBe('configure-printer');
    // Yacheykali chek — ayni sinf: hech bir sklad'ga printer biriktirilmagan.
    expect(
      printFollowUp({ handled: false, ok: false, reason: 'no-printer-mapped' }, { inShell: true }),
    ).toBe('configure-printer');
  });

  it('oddiy brauzerda printer sozlanmagan ⇒ popup (yagona chop yo‘li)', () => {
    expect(
      printFollowUp({ handled: false, ok: false, reason: 'printer-not-set' }, { inShell: false }),
    ).toBe('popup');
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
