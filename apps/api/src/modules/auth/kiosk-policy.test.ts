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
    // F5 — smena yopishdan oldin yakunlanmagan cheklar ro'yxati. Alohida
    // qoida YO'Q: `/cashier-sessions` `['*']` prefiks-qoidasi qamraydi —
    // bu test o'sha qamrovni QULFLAYDI (qoida toraytirilsa kassir smenani
    // yopa olmay qolardi).
    ['GET', '/cashier-sessions/abc/unresolved'],
    // `/sotuv` smenani AYNAN shu ikki yo'l orqali ochadi (controller —
    // `@Controller('admin/smenas')`). Ilgari ro'yxatda mavjud bo'lmagan
    // `/smena/mine` turardi: kiosk-kassir smena ocholmay 403 olardi.
    ['GET', '/admin/smenas/mine'],
    ['POST', '/admin/smenas/open-session'],
    // 🔴 Omborga chiqadigan chekning MAZMUNI shu yerdan o'qiladi. Ro'yxatda
    // yo'q edi ⇒ kiosk-kassir 403 olardi (prodda 28 marta o'lchandi,
    // 2026-08-16) ⇒ «Omborchiga yuborish» dan keyin chek chiqmasdi, uning
    // o'rniga zaxira popup ochilardi — u ham AYNI endpointni so'raydi, ya'ni
    // ikkinchi 403. Printer marshruti (`/sklad-keepers`) ochiq bo'lgani holda
    // varaqning o'zi yopiq qolgan edi — ro'yxat yarim to'ldirilgan.
    ['GET', '/restock-tasks/picking-sheets/retailsale/8f7d1c22-0000-4000-8000-000000000001'],
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
    // 🔴 `/admin/smenas` ostidan FAQAT ikki aniq yo'l ochilgan — butun
    // `/admin` emas. Bu qatorlar ro'yxat kengayib ketmasligini qo'riqlaydi.
    ['GET', '/admin/smenas'],
    ['POST', '/admin/smenas'],
    ['DELETE', '/admin/smenas/abc'],
    ['GET', '/admin/users'],
    ['POST', '/admin/smenas/mine'],
    // 🔴 Printer marshruti bekor qilindi (2026-08-16) ⇒ kassa `/sklad-keepers`
    // ni chaqirmaydi va ruxsat ham qolmadi. Bu qator ro'yxat «ehtiyot uchun»
    // kengayib ketmasligini qo'riqlaydi.
    ['GET', '/sklad-keepers'],
    // 🔴 `/restock-tasks` ostidan FAQAT chop-varag'i ochilgan. Omborchi
    // navbati, vazifa detali va qator-tasdiqlash kassirga TEGISHLI EMAS —
    // bitta keng prefiks qoidasi ularni jimgina ochib yuborardi.
    ['GET', '/restock-tasks'],
    ['GET', '/restock-tasks/8f7d1c22-0000-4000-8000-000000000001'],
    ['POST', '/restock-tasks/from-sales-return'],
    ['POST', '/restock-tasks/8f7d1c22-0000-4000-8000-000000000001/lines/l-1/confirm'],
    // Metod ham tor: varaq faqat O'QILADI.
    ['POST', '/restock-tasks/picking-sheets/retailsale/8f7d1c22-0000-4000-8000-000000000001'],
    // Chuqurroq yo'l `exact` bilan yopiq qoladi.
    ['GET', '/restock-tasks/picking-sheets/retailsale/8f7d1c22-0000-4000-8000-000000000001/lines'],
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

/**
 * F7 — zakazlar POS'da. Kassir zakazni **ko'radi va tasdiqlaydi**, boshqa
 * hech narsa qilmaydi.
 *
 * Nega `*` EMAS: `/customer-orders` ostida o'chirish, ommaviy o'chirish,
 * birlashtirish, mass-edit, rezervni tozalash bor. Bitta `methods: ['*']`
 * qatori ularning HAMMASINI kassirga ochib yuborardi — va bu jimgina
 * bo'lardi, chunki hech bir test «nima OCHILDI» ni tekshirmaydi. Shuning
 * uchun quyidagi negativ blok — ro'yxatning haqiqiy qulfi.
 */
describe('F7 — zakazlar: FAQAT ro`yxat + detal + tasdiqlash', () => {
  it.each([
    ['GET', '/customer-orders'],
    ['GET', '/customer-orders?state=draft&limit=50'],
    ['GET', '/customer-orders/8f7d1c22-0000-4000-8000-000000000001'],
    // `draft → confirmed` — rezerv shu o'tishda avtomatik tushadi
    // (`customer-order.service.ts`), ya'ni POS'ga kerak bo'lgan YAGONA POST.
    ['POST', '/customer-orders/8f7d1c22-0000-4000-8000-000000000001/transitions/confirmed'],
  ])('%s %s → ruxsat', (method, path) => {
    expect(isKioskAllowed(method, normalizePath(path))).toBe(true);
  });

  it.each([
    // Zakaz YARATISH/TAHRIRLASH — kassa ishi emas (savdo menejeri qiladi).
    ['POST', '/customer-orders'],
    ['PATCH', '/customer-orders/8f7d1c22-0000-4000-8000-000000000001'],
    ['DELETE', '/customer-orders/8f7d1c22-0000-4000-8000-000000000001'],
    ['POST', '/customer-orders/8f7d1c22-0000-4000-8000-000000000001/clone'],
    // Ommaviy amallar — bittasi ham kassirga ochilmaydi.
    ['POST', '/customer-orders/bulk-delete'],
    ['POST', '/customer-orders/bulk-transition'],
    ['POST', '/customer-orders/bulk-set-status'],
    ['POST', '/customer-orders/bulk-reserve'],
    ['POST', '/customer-orders/bulk-clear-reserve'],
    ['POST', '/customer-orders/bulk-mark-printed'],
    ['POST', '/customer-orders/merge'],
    ['POST', '/customer-orders/mass-edit'],
    ['POST', '/customer-orders/bulk-print'],
    // 🔴 Boshqa FSM nishonlari — F7 doirasi FAQAT `confirmed`. `cancelled`
    // rezervni bo'shatadi, `paid` esa F8 ishi (to'lov). Ikkalasi ham shu
    // yerdan ochilib ketmasin.
    ['POST', '/customer-orders/8f7d1c22-0000-4000-8000-000000000001/transitions/cancelled'],
    ['POST', '/customer-orders/8f7d1c22-0000-4000-8000-000000000001/transitions/paid'],
    ['POST', '/customer-orders/8f7d1c22-0000-4000-8000-000000000001/transitions/closed'],
    // Chuqurroq GET'lar — POS'ga kerak emas, demak yopiq.
    ['GET', '/customer-orders/8f7d1c22-0000-4000-8000-000000000001/related'],
    ['GET', '/customer-orders/8f7d1c22-0000-4000-8000-000000000001/supply-shortfall'],
    ['GET', '/customer-orders/8f7d1c22-0000-4000-8000-000000000001/position'],
    // Segment chegarasi — o'xshash nomli modul ochilmaydi.
    ['GET', '/customer-orders-archive'],
  ])('%s %s → RAD', (method, path) => {
    expect(isKioskAllowed(method, normalizePath(path))).toBe(false);
  });

  it('`:id` shakli bir SEGMENTNI oladi — statik GET yo`llar ham tushadi', () => {
    // `/customer-orders/kanban` va `/customer-orders/print-forms` shaklan
    // `:id` ga mos keladi. Bu ATAYLAB qoldirilgan: ikkalasi ham ro'yxat
    // bilan bir xil `customerorder.view` ruxsatiga bog'langan va yangi
    // ma'lumot ochmaydi. Yozadigan hech narsa yo'q.
    expect(isKioskAllowed('GET', '/customer-orders/kanban')).toBe(true);
    expect(isKioskAllowed('POST', '/customer-orders/kanban')).toBe(false);
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
  it.each(['1234', '0000', '9999'])('%s — to`g`ri (AYNAN 4 raqam)', (pin) => {
    expect(isValidPosPin(pin)).toBe(true);
  });

  // 🔴 2026-08-12: 5 va 6 raqam ENDI RAD ETILADI. Egasi jonli qurilmada
  // 5-raqamni bosib ko'rdi va u kiritildi — «4 tadan oshmasligi kerak».
  // Uzunlik butun zanjirda AYNAN 4: server RE + admin PIN qo'yishi + kirish
  // klaviaturasi + qulf ekrani. Biri qolib ketsa shartnoma ikkiga bo'linadi
  // (admin 6 raqamli PIN qo'yadi, kassir uni kirita olmaydi).
  it.each(['123', '12345', '123456', '1234567', '', 'abcd', '12a4', '12 34', '１２３４'])(
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

  /**
   * F7 — kassir almashtirish yo'llari (spec §8). Rejadagi «kiosk-allowlist +
   * testlari» sharti F5 pretsedenti bilan hal: YANGI qoida KERAK EMAS
   * (`/auth` qoidasi `['*']`), lekin shu fakt testsiz qolsa kimdir `/auth`
   * qoidasini toraytirganda kassir almashtirish jimgina o'lardi.
   */
  it('/auth/pos-pin/candidates kiosk uchun ochiq (F7 — kassir-tanlash)', () => {
    expect(isKioskAllowed('GET', '/auth/pos-pin/candidates')).toBe(true);
  });

  it('/auth/pos-pin/switch kiosk uchun ochiq (F7 — PIN bilan almashinuv)', () => {
    expect(isKioskAllowed('POST', '/auth/pos-pin/switch')).toBe(true);
  });
});

/**
 * F8 — zakazni POS'dan to'lash yo'li allowlist bilan mos.
 *
 * 🔴 F8 kiosk allowlist'ga YANGI QATOR QO'SHMADI va bu ataylab: to'lov
 * `/retail-sales` orqali ketadi (chek yaratiladi → `post`), zakaz holati esa
 * SERVER TOMONDA, chek tranzaksiyasi ichida o'zgaradi
 * (`CustomerOrderService.applyPayment`). Ya'ni kassirga zakaz holatini
 * TO'G'RIDAN-TO'G'RI o'zgartirish huquqi berilmadi.
 *
 * Bu testlar aynan shu qarorni qulflaydi — kelajakda kimdir «POS zakazni
 * to'lay olsin» deb `/customer-orders/:id/transitions/paid` ni ochib
 * yuborsa DARHOL qizaradi. O'sha yo'l ochilsa kassir chek YOZMASDAN,
 * pul OLMASDAN zakazni «to'langan» qilib qo'ya olardi.
 */
describe('F8 — zakaz to`lovi yo`llari', () => {
  const ORDER = '/customer-orders/8f7d1c22-0000-4000-8000-000000000001';

  it('chek yaratish va rasmiylashtirish kiosk uchun ochiq (to`lov shu yerdan ketadi)', () => {
    expect(isKioskAllowed('POST', '/retail-sales')).toBe(true);
    expect(isKioskAllowed('POST', '/retail-sales/8f7d1c22-0000-4000-8000-000000000002/post')).toBe(
      true,
    );
  });

  it('zakaz detali o`qiladi (savatga yuklash uchun)', () => {
    expect(isKioskAllowed('GET', ORDER)).toBe(true);
  });

  it('🔴 `transitions/paid` HAMON YOPIQ — holatni faqat server chek orqali qo`yadi', () => {
    expect(isKioskAllowed('POST', `${ORDER}/transitions/paid`)).toBe(false);
  });

  it('🔴 rezervni bo`shatish/o`chirish ham yopiq qoladi', () => {
    expect(isKioskAllowed('POST', '/customer-orders/bulk-clear-reserve')).toBe(false);
    expect(isKioskAllowed('DELETE', ORDER)).toBe(false);
  });
});
