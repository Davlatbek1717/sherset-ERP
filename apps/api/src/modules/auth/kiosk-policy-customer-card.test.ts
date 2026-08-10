import { describe, expect, it } from 'vitest';
import { isKioskAllowed, normalizePath } from './kiosk-policy.js';

/**
 * F9 — mijoz kartasi POS'da: allowlist auditi.
 *
 * Kassirga mijoz kartasi uchun kerak bo'ladigan yo'llar **aynan** ochiladi.
 * Bu fayl ikki tomonni ham qulflaydi: ochilishi kerak bo'lgan yo'l ochiq,
 * qolgan hamma narsa YOPIQ. `*` ishlatilmaydi.
 *
 * 🔴 Ilgari `/counterparties` qoidasi PREFIKS edi (`GET`+`POST`, `exact`siz).
 * Bu bitta qator butun daraxtni ochardi: `POST /counterparties/bulk-delete`,
 * `POST /counterparties/bulk-update`, `POST /counterparties/:id/archive`,
 * `POST /counterparties/:id/bank-accounts` — hammasi kioskka yetib borardi.
 * Ularni faqat IKKINCHI qatlam (ruxsat matritsasi) to'xtatardi; kiosk
 * ro'yxati esa aynan «URL bilan kirish bloklansin» uchun bor (TZ §3.1).
 */
describe('F9 — kiosk allowlist: mijoz kartasi (musbat)', () => {
  it.each([
    ['GET', '/counterparties'],
    ['POST', '/counterparties'],
    ['GET', '/counterparties/8f2f0a9e-0000-0000-0000-000000000001'],
    // Telefon/izohni POS'dan tahrirlash — TOR yo'l (to'liq karta EMAS).
    ['PATCH', '/counterparties/8f2f0a9e-0000-0000-0000-000000000001/pos-contact'],
    // Panel bloklari mavjud yo'llardan o'qiydi.
    ['GET', '/debts/pos/summary/8f2f0a9e-0000-0000-0000-000000000001'],
    ['GET', '/retail-sales'],
    ['GET', '/customer-orders'],
  ])('%s %s — ochiq', (method, path) => {
    expect(isKioskAllowed(method, path)).toBe(true);
  });

  it('`exact` qoidalar global prefiks bilan ham ishlaydi (guard normalizePath qiladi)', () => {
    // 🔴 `exact` qoidada segment SONI tekshiriladi, ya'ni `/api/v1` prefiksi
    // olib tashlanmasa yo'l JIMGINA 403 bo'lardi. Guard (`kiosk.guard.ts:55`)
    // `normalizePath` chaqiradi — shartnoma shu yerda qulflanadi.
    expect(isKioskAllowed('GET', normalizePath('/api/v1/counterparties?search=901'))).toBe(true);
    expect(
      isKioskAllowed(
        'PATCH',
        normalizePath('/api/v1/counterparties/8f2f0a9e-0000-0000-0000-000000000001/pos-contact'),
      ),
    ).toBe(true);
  });
});

describe('F9 — kiosk allowlist: mijoz kartasi (NEGATIV)', () => {
  const ID = '8f2f0a9e-0000-0000-0000-000000000001';

  it.each([
    // To'liq kartani tahrirlash — nom, narx turi, egasi, teglar. YOPIQ.
    ['PATCH', `/counterparties/${ID}`],
    ['PUT', `/counterparties/${ID}`],
    ['DELETE', `/counterparties/${ID}`],
    // Ommaviy amallar — bitta kassirning bir bosishi butun bazani buzardi.
    ['POST', '/counterparties/bulk-delete'],
    ['POST', '/counterparties/bulk-update'],
    ['POST', '/counterparties/bulk-archive'],
    ['POST', '/counterparties/bulk-import'],
    ['POST', '/counterparties/bulk-set-state'],
    ['POST', `/counterparties/${ID}/archive`],
    ['POST', `/counterparties/${ID}/clone`],
    // Bank rekvizitlari — kassaning ishi emas.
    ['POST', `/counterparties/${ID}/bank-accounts`],
    ['PATCH', `/counterparties/${ID}/bank-accounts/b1`],
    ['DELETE', `/counterparties/${ID}/bank-accounts/b1`],
    // Analitika — «Показатели» paneli (foyda/marja) kassirga yopiq.
    ['GET', `/counterparties/${ID}/metrics`],
    ['GET', `/counterparties/${ID}/position`],
    // Yangi tor yo'lning atrofi: metod ham, chuqurlik ham aynan.
    ['POST', `/counterparties/${ID}/pos-contact`],
    ['DELETE', `/counterparties/${ID}/pos-contact`],
    ['PATCH', `/counterparties/${ID}/pos-contact/extra`],
    ['PATCH', '/counterparties/pos-contact'],
    // O'xshash nomli modul jimgina ochilmasin.
    ['GET', '/counterparty-groups'],
  ])('%s %s — YOPIQ', (method, path) => {
    expect(isKioskAllowed(method, path)).toBe(false);
  });
});
