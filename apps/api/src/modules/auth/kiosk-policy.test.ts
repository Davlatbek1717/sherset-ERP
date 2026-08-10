import { describe, expect, it } from 'vitest';
import {
  KIOSK_ALLOWED,
  POS_PIN_MAX_ATTEMPTS,
  UI_MODE,
  isKioskAllowed,
  isValidPosPin,
  normalizePath,
  resolveUiMode,
} from './kiosk-policy.js';

/**
 * Kiosk siyosati — sof qoidalar testi (kassa TZ §3.1, §3.2).
 *
 * Qulflanadigan shartnomalar (buzilsa xavfsizlik teshigi ochiladi):
 *   1. **`full` yutadi** — kassirlik roli qo'shilgan menejer cheklanmaydi;
 *   2. **default-deny** — ro'yxatda yo'q endpoint kiosk uchun YOPIQ;
 *   3. prefiks **segment chegarasida** mos keladi (`/products-secret` ochilmaydi);
 *   4. kiosk **opt-in** — rolsiz xodim cheklanmaydi.
 */

describe('resolveUiMode — `full` YUTADI', () => {
  it('rol umuman yo`q → full (kiosk opt-in)', () => {
    // Migratsiyadan keyin hech kim jimgina cheklanmasligi kerak.
    expect(resolveUiMode([])).toBe(UI_MODE.full);
  });

  it('hamma rol kiosk → kiosk', () => {
    expect(resolveUiMode([{ uiMode: 'kiosk' }, { uiMode: 'kiosk' }])).toBe(UI_MODE.kiosk);
  });

  it('bitta rol full bo`lsa → full', () => {
    // Kassirlik roli qo'shilgan menejer to'satdan ERP'dan chiqib qolmasin.
    expect(resolveUiMode([{ uiMode: 'kiosk' }, { uiMode: 'full' }])).toBe(UI_MODE.full);
  });

  it('noma`lum/bo`sh qiymat kiosk deb hisoblanmaydi', () => {
    // `null`/`undefined` — eski qatorlar; ular full bo'lib qolishi kerak.
    expect(resolveUiMode([{ uiMode: null }])).toBe(UI_MODE.full);
    expect(resolveUiMode([{ uiMode: undefined }])).toBe(UI_MODE.full);
    expect(resolveUiMode([{}])).toBe(UI_MODE.full);
  });
});

describe('normalizePath', () => {
  it('global prefiksni olib tashlaydi', () => {
    expect(normalizePath('/api/v1/products/123')).toBe('/products/123');
  });
  it('so`rov qatorini kesadi', () => {
    expect(normalizePath('/api/v1/retail-sales?state=ready')).toBe('/retail-sales');
  });
  it('oxirgi slashni kesadi', () => {
    expect(normalizePath('/api/v1/products/')).toBe('/products');
  });
  it('prefikssiz yo`l ham ishlaydi', () => {
    expect(normalizePath('/products')).toBe('/products');
  });
});

describe('isKioskAllowed — RUXSAT ETILGANLAR', () => {
  it.each([
    ['GET', '/retail-sales'],
    ['POST', '/retail-sales'],
    ['POST', '/retail-sales/abc/post'],
    ['GET', '/cashier-sessions/current'],
    ['GET', '/smena/mine'],
    ['GET', '/products?q=viko'],
    ['GET', '/counterparties'],
    ['POST', '/counterparties'],
    ['GET', '/debts'],
    ['POST', '/debts/pay'],
    ['POST', '/cash-out'],
    ['POST', '/print/receipt'],
    ['POST', '/auth/refresh'],
    ['GET', '/exchange-rates'],
  ])('%s %s → ruxsat', (method, path) => {
    expect(isKioskAllowed(method, normalizePath(path))).toBe(true);
  });
});

describe('isKioskAllowed — DEFAULT DENY', () => {
  it.each([
    ['GET', '/reports/profitability'],
    ['GET', '/analitika/xodimlar'],
    ['GET', '/hr/employees'],
    ['GET', '/manager/kpi/days'],
    ['GET', '/settings/organizations'],
    ['GET', '/demands'],
    ['GET', '/supplies'],
    ['GET', '/payments-in'],
    ['GET', '/stores'],
  ])('%s %s → RAD (UI yashirish yetarli emas)', (method, path) => {
    expect(isKioskAllowed(method, normalizePath(path))).toBe(false);
  });

  it('o`qishga ochiq resursga YOZISH rad etiladi', () => {
    // `products` faqat GET — kassir tovar kartasini o'zgartira olmaydi.
    expect(isKioskAllowed('GET', '/products')).toBe(true);
    expect(isKioskAllowed('POST', '/products')).toBe(false);
    expect(isKioskAllowed('PATCH', '/products/1')).toBe(false);
    expect(isKioskAllowed('DELETE', '/products/1')).toBe(false);
  });

  it('mijozni O`CHIRA olmaydi (faqat GET + POST)', () => {
    expect(isKioskAllowed('POST', '/counterparties')).toBe(true);
    expect(isKioskAllowed('DELETE', '/counterparties/1')).toBe(false);
    expect(isKioskAllowed('PATCH', '/counterparties/1')).toBe(false);
  });
});

describe('prefiks SEGMENT chegarasida mos keladi', () => {
  it('o`xshash nomli modul jimgina ochilmaydi', () => {
    // `/products` qoidasi `/products-secret` ni ochib yubormasligi kerak.
    expect(isKioskAllowed('GET', '/products-secret')).toBe(false);
    expect(isKioskAllowed('GET', '/print-jobs')).toBe(false);
    expect(isKioskAllowed('GET', '/debts-report')).toBe(false);
  });

  it('lekin ichki yo`l ochiq qoladi', () => {
    expect(isKioskAllowed('GET', '/products/123/prices')).toBe(true);
  });
});

describe('ro`yxat sog`ligi', () => {
  it('har qoidada SABAB yozilgan', () => {
    // «Nega bu ochiq?» savoliga javob kodda tursin — aks holda ro'yxat
    // vaqt o'tib nazoratsiz kengayadi.
    for (const rule of KIOSK_ALLOWED) {
      expect(rule.why.length, rule.prefix).toBeGreaterThan(5);
    }
  });

  it('har prefiks `/` bilan boshlanadi va ikki marta yozilmagan', () => {
    const seen = new Set<string>();
    for (const rule of KIOSK_ALLOWED) {
      expect(rule.prefix.startsWith('/'), rule.prefix).toBe(true);
      expect(seen.has(rule.prefix), `takror: ${rule.prefix}`).toBe(false);
      seen.add(rule.prefix);
    }
  });
});

describe('POS PIN', () => {
  it.each(['1234', '12345', '123456'])('%s — to`g`ri (4–6 raqam)', (pin) => {
    expect(isValidPosPin(pin)).toBe(true);
  });

  it.each(['123', '1234567', '', 'abcd', '12a4', '12 34', '１２３４'])(
    '%s — rad etiladi',
    (pin) => {
      expect(isValidPosPin(pin)).toBe(false);
    },
  );

  it('urinish chegarasi 5', () => {
    expect(POS_PIN_MAX_ATTEMPTS).toBe(5);
  });
});

/**
 * PIN-kirish yo'llari (kassa .exe) allowlist bilan mos kelishi hujjatlanadi.
 *
 * Bu test bugun «bepul» yashil (`/auth` qoidasi `methods: ['*']`), lekin
 * kelajakda kimdir o'sha qoidani torroq qilsa DARHOL qizaradi — aks holda
 * kassa jimgina kirolmay qolardi va sabab uzoq qidirilardi.
 */
describe('PIN-kirish yo`llari kiosk allowlist bilan mos', () => {
  it('/auth/pos-login kiosk uchun ochiq', () => {
    expect(isKioskAllowed('POST', '/auth/pos-login')).toBe(true);
  });

  it('/auth/pos-device/pair ham /auth qoidasiga tushadi', () => {
    // Bu endpoint JWT + hr `employees:full` talab qiladi, ya'ni kiosk kassiri
    // baribir o'tolmaydi — allowlist ochiqligi teshik EMAS.
    expect(isKioskAllowed('POST', '/auth/pos-device/pair')).toBe(true);
  });

  it('nazorat: kassaga aloqasiz yo`l HAMON yopiq', () => {
    expect(isKioskAllowed('GET', '/reports/profitability')).toBe(false);
  });
});
