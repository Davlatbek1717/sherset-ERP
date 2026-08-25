import { describe, expect, it } from 'vitest';
import { KIOSK_ALLOWED, isKioskAllowed, normalizePath } from './kiosk-policy.js';

/**
 * A1 — kassada MIJOZ AVANSINI qabul qilish: allowlist auditi.
 *
 * Reja aniq talab qo'ygan: «kiosk allowlist (`/cash-in` prefiksini OCHMA)».
 * Bu fayl ikkala tomonni ham qulflaydi:
 *
 *  1. avans marshruti kioskda ISHLAYDI — u `/cashier-sessions` prefiksi
 *     ostida (`methods: ['*']`), ya'ni YANGI QATOR KERAK EMAS;
 *  2. 🔴 `/cash-in` (ПКО moduli) YOPIQ QOLADI. Uni ochish butun ПКО
 *     daraxtini — allokatsiyalar, bekor qilish, BOSHQA mijozlarning
 *     to'lovlari — kioskka ochardi. `kiosk-policy.ts` dagi «to'rt aniq
 *     qator» saboqi (`/counterparties` prefiksi butun daraxtni ochib
 *     yuborgani) aynan shu haqda.
 */

const SESSION = '8f2f0a9e-0000-0000-0000-000000000001';
const DOC = '8f2f0a9e-0000-0000-0000-000000000002';

describe('A1 — kiosk allowlist: avans yo`li (musbat)', () => {
  it.each([
    // Avansni qabul qilish — A1 ning asosiy marshruti.
    ['POST', `/cashier-sessions/${SESSION}/customer-prepay`],
    // PKO cheki mazmuni (chop etish sahifasi shundan o'qiydi).
    ['GET', `/cashier-sessions/cash-in/${DOC}`],
    // Z-hisobotdagi avans qatori.
    ['GET', `/cashier-sessions/${SESSION}/cash-in-summary`],
    // Mijozni tanlash va uning qoldig'ini ko'rish — mavjud yo'llar.
    ['GET', '/counterparties'],
    ['GET', `/debts/pos/summary/${SESSION}`],
  ])('%s %s — ochiq', (method, path) => {
    expect(isKioskAllowed(method, path)).toBe(true);
  });

  it('global `/api/v1` prefiksi bilan ham ochiq (guard normalizePath qiladi)', () => {
    expect(
      isKioskAllowed('POST', normalizePath(`/api/v1/cashier-sessions/${SESSION}/customer-prepay`)),
    ).toBe(true);
  });

  it('YANGI QATOR QO`SHILMAGAN — marshrut mavjud `/cashier-sessions` prefiksidan keladi', () => {
    // Ro'yxatning o'sishi = kiosk qamrovining o'sishi. A1 uni bir zarra ham
    // kengaytirmagani shu yerda o'lchanadi.
    const prepayRules = KIOSK_ALLOWED.filter((r) => r.prefix.includes('prepay'));
    expect(prepayRules).toEqual([]);

    const sessionRule = KIOSK_ALLOWED.find((r) => r.prefix === '/cashier-sessions');
    expect(sessionRule).toBeDefined();
    expect(sessionRule?.methods).toEqual(['*']);
  });
});

describe('A1 — kiosk allowlist: `/cash-in` YOPIQ (NEGATIV)', () => {
  it.each([
    ['GET', '/cash-in'],
    ['POST', '/cash-in'],
    ['GET', `/cash-in/${DOC}`],
    ['PATCH', `/cash-in/${DOC}`],
    ['DELETE', `/cash-in/${DOC}`],
    ['POST', `/cash-in/${DOC}/post`],
    ['POST', `/cash-in/${DOC}/unpost`],
    ['POST', '/cash-in/bulk-delete'],
    // ПКО ga yaqin qolgan pul modullari ham yopiq.
    ['POST', '/payment-in'],
    ['POST', '/prepayments'],
    ['GET', '/prepayments'],
  ])('%s %s — YOPIQ', (method, path) => {
    expect(isKioskAllowed(method, path)).toBe(false);
  });

  it('ro`yxatda `/cash-in` bilan boshlanadigan qoida UMUMAN yo`q', () => {
    // 🔴 `/cash-out` BOR (xarajat, Q10) — u bilan chalkashmasin: tekshiruv
    // segment-chegarasi bilan, `startsWith` bilan EMAS.
    const cashInRules = KIOSK_ALLOWED.filter(
      (r) => r.prefix === '/cash-in' || r.prefix.startsWith('/cash-in/'),
    );
    expect(cashInRules).toEqual([]);
    expect(KIOSK_ALLOWED.some((r) => r.prefix === '/cash-out')).toBe(true);
  });
});
