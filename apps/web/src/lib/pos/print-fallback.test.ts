import { describe, expect, it } from 'vitest';
import { printFollowUp } from './print-fallback';

/**
 * P7 — chek chiqmaganda NIMA qilish kerakligining qaror jadvali.
 *
 * 🔴 Jonli simptom (egasi, 2026-08-11 monoblokda): chek chiqarishda qobiq
 * ichida brauzer chek sahifasi ochilib **tasdiq so'ralardi** — avtomatik
 * chiqmasdi. Popup qobiq ichida `window.print()` chaqiradi ⇒ Chromium tasdiq
 * oynasi, ya'ni «exe chekni o'zi chiqarsin» maqsadining teskarisi.
 *
 * 2026-08-16 — YAKUNIY QAROR (egasi: «kichik oyna ochilmasligi kerak edi»):
 * qobiq ichida popup UMUMAN ochilmaydi. Sabab mexanik: qobiqda `handled:false`
 * bo'lishining YAGONA yo'li — hujjat yuklanmasligi (`load-failed`), chunki
 * `checkPrintAgent()` qobiqda doim `true`. Popup sahifasi esa AYNI so'rovni
 * qaytaradi ⇒ u ham yiqiladi. Ya'ni popup foydasiz oyna edi: prodda kassir
 * aynan shuni ko'rgan — oyna ochildi, chek chiqmadi (403).
 *
 * Oddiy brauzerda popup — YAGONA chop yo'li, shuning uchun u yerda qoladi.
 */
describe('printFollowUp — chop natijasi → keyingi qadam', () => {
  it('chop bo‘ldi ⇒ hech narsa; drayver rad etdi ⇒ xato', () => {
    expect(printFollowUp({ handled: true, ok: true }, { inShell: true })).toBe('none');
    expect(printFollowUp({ handled: true, ok: false }, { inShell: true })).toBe('error');
  });

  it('🔴 qobiqda hujjat yuklanmasa ⇒ XATO (foydasiz popup EMAS)', () => {
    expect(
      printFollowUp({ handled: false, ok: false, reason: 'load-failed' }, { inShell: true }),
    ).toBe('error');
  });

  it('oddiy brauzerda yuklanmasa ⇒ popup (yagona chop yo‘li)', () => {
    expect(
      printFollowUp({ handled: false, ok: false, reason: 'load-failed' }, { inShell: false }),
    ).toBe('popup');
  });

  it('agent yo‘q (oddiy brauzer, agent o‘rnatilmagan) ⇒ popup', () => {
    // `no-agent` qobiqda BO'LMAYDI — `checkPrintAgent()` qobiqda doim true.
    expect(
      printFollowUp({ handled: false, ok: false, reason: 'no-agent' }, { inShell: false }),
    ).toBe('popup');
  });

  it('reason yo‘q (eski chaqiruvchi) ⇒ brauzerda popup, qobiqda xato', () => {
    expect(printFollowUp({ handled: false, ok: false }, { inShell: false })).toBe('popup');
    expect(printFollowUp({ handled: false, ok: false }, { inShell: true })).toBe('error');
  });
});
