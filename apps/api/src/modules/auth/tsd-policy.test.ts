import { describe, expect, it } from 'vitest';
import { normalizePath } from './route-allowlist.js';
import { DEVICE_MODE_TSD, TSD_ALLOWED, isTsdAllowed } from './tsd-policy.js';

/**
 * TSD siyosati — sof qoidalar testi (G-reja G5).
 *
 * Qulflanadigan shartnomalar (buzilsa xavfsizlik teshigi ochiladi):
 *   1. **default-deny** — ro'yxatda yo'q endpoint TSD uchun YOPIQ;
 *   2. **narx YO'Q** — narx qaytaradigan biror marshrut ro'yxatga tushmasin;
 *   3. **kassa YO'Q** — terminal sotuv/smena/pul yo'llariga yetmasin;
 *   4. prefiks **segment chegarasida** mos keladi.
 */

describe('isTsdAllowed — omborchi ishi OCHIQ', () => {
  it('o`z topshiriqlari ro`yxati va detali', () => {
    expect(isTsdAllowed('GET', '/restock-tasks')).toBe(true);
    expect(isTsdAllowed('GET', '/restock-tasks/abc')).toBe(true);
  });

  it('qator tasdiqlash — qo`lda va skaner bilan', () => {
    expect(isTsdAllowed('POST', '/restock-tasks/t1/lines/l1/confirm')).toBe(true);
    expect(isTsdAllowed('POST', '/restock-tasks/t1/confirm-scan')).toBe(true);
  });

  it('narxsiz skan-qidiruv va yacheyka yorlig`i', () => {
    expect(isTsdAllowed('GET', '/tsd/scan')).toBe(true);
    expect(isTsdAllowed('GET', '/admin/stores/cells/by-barcode')).toBe(true);
  });

  it('yacheykaga joylashtirish / ko`chirish', () => {
    expect(isTsdAllowed('POST', '/products/p1/cell-move')).toBe(true);
    expect(isTsdAllowed('POST', '/products/p1/cell-place')).toBe(true);
  });

  it('yacheyka sanash — o`qish va yozish', () => {
    expect(isTsdAllowed('GET', '/admin/stores/s1/cells/c1/stock')).toBe(true);
    expect(isTsdAllowed('PUT', '/admin/stores/s1/cells/c1/stock')).toBe(true);
  });

  it('bildirishnoma oqimi va minimum', () => {
    expect(isTsdAllowed('GET', '/notifications/stream')).toBe(true);
    expect(isTsdAllowed('POST', '/auth/refresh')).toBe(true);
    expect(isTsdAllowed('GET', '/permissions/me')).toBe(true);
  });
});

describe('isTsdAllowed — NARX hech qayerdan chiqmaydi', () => {
  /**
   * Egasining qoidasi: «Ombor xodimlari narx ko'rmaydi; kirim narxi faqat
   * katta omborchiga». `GET /products` to'liq qatorni (`buyPrice`,
   * `minPrice`, `salePrices`) qaytaradi — shuning uchun u ro'yxatda YO'Q,
   * o'rniga `/tsd/scan` bor.
   */
  it('tovar ro`yxati va tovar kartasi YOPIQ', () => {
    expect(isTsdAllowed('GET', '/products')).toBe(false);
    expect(isTsdAllowed('GET', '/products/p1')).toBe(false);
    expect(isTsdAllowed('GET', '/products/p1/scan')).toBe(false);
    expect(isTsdAllowed('GET', '/products/p1/cell-stock')).toBe(false);
  });

  it('narx modullari YOPIQ', () => {
    expect(isTsdAllowed('GET', '/price-types')).toBe(false);
    expect(isTsdAllowed('GET', '/price-list')).toBe(false);
    expect(isTsdAllowed('GET', '/supply')).toBe(false);
    expect(isTsdAllowed('GET', '/report/profitability')).toBe(false);
  });

  it('ro`yxatda narx-nomli prefiks umuman yo`q', () => {
    // Qo'riqchi: kelajakda kimdir «bir qatorgina» qo'shsa test qizaradi.
    const priceish = /price|supply|profit|cost|margin|retail-sale|demand|invoice/i;
    const offenders = TSD_ALLOWED.filter((r) => priceish.test(r.prefix));
    expect(offenders.map((r) => r.prefix)).toEqual([]);
  });
});

describe('isTsdAllowed — KASSA va boshqaruv YOPIQ', () => {
  it('sotuv/smena/pul yo`llari', () => {
    expect(isTsdAllowed('POST', '/retail-sales')).toBe(false);
    expect(isTsdAllowed('GET', '/cashier-sessions')).toBe(false);
    expect(isTsdAllowed('POST', '/cash-out')).toBe(false);
    expect(isTsdAllowed('GET', '/debts')).toBe(false);
  });

  it('mijoz/hisobot/xodim yo`llari', () => {
    expect(isTsdAllowed('GET', '/counterparties')).toBe(false);
    expect(isTsdAllowed('GET', '/hr/employees')).toBe(false);
    expect(isTsdAllowed('GET', '/analitika/staff')).toBe(false);
  });

  it('topshiriq OCHISH va chop etish YOPIQ (terminal bajaruvchi, boshlovchi emas)', () => {
    expect(isTsdAllowed('POST', '/restock-tasks/from-sales-return')).toBe(false);
    expect(isTsdAllowed('GET', '/print/picking/1')).toBe(false);
  });

  it('tovar kartasini tahrirlash YOPIQ', () => {
    // `cell-rebind` uy-yacheykani o'zgartiradi — bu tovar kartasi tahriri.
    expect(isTsdAllowed('POST', '/products/p1/cell-rebind')).toBe(false);
    expect(isTsdAllowed('PATCH', '/products/p1')).toBe(false);
  });
});

describe('isTsdAllowed — default-deny va segment chegarasi', () => {
  it('ro`yxatda yo`q yo`l YOPIQ', () => {
    expect(isTsdAllowed('GET', '/kelajakdagi-modul')).toBe(false);
  });

  it('o`xshash nomli modul jimgina ochilmaydi', () => {
    expect(isTsdAllowed('GET', '/tsd-secret/scan')).toBe(false);
    expect(isTsdAllowed('GET', '/notifications-admin')).toBe(false);
  });

  it('`exact` qoidaning ichki yo`llari ochilmaydi', () => {
    expect(isTsdAllowed('GET', '/tsd/scan/history')).toBe(false);
    expect(isTsdAllowed('POST', '/products/p1/cell-move/undo')).toBe(false);
    expect(isTsdAllowed('PUT', '/admin/stores/s1/cells/c1/stock/history')).toBe(false);
  });

  it('metod ham tekshiriladi', () => {
    expect(isTsdAllowed('DELETE', '/restock-tasks/t1')).toBe(false);
    expect(isTsdAllowed('DELETE', '/admin/stores/s1/cells/c1/stock')).toBe(false);
  });

  it('so`rov qatori qaror o`zgartirmaydi', () => {
    expect(isTsdAllowed('GET', normalizePath('/api/v1/tsd/scan?code=4780'))).toBe(true);
    expect(isTsdAllowed('GET', normalizePath('/api/v1/products?search=x'))).toBe(false);
  });
});

describe('ro`yxat intizomi', () => {
  it('har qatorda SABAB yozilgan', () => {
    for (const rule of TSD_ALLOWED) {
      expect(rule.why.length).toBeGreaterThan(0);
    }
  });

  it('DEVICE_MODE_TSD — token da`vosining yagona manbai', () => {
    expect(DEVICE_MODE_TSD).toBe('tsd');
  });
});
