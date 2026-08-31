import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Manba-skan qo'riqchisi: mahsulot rasmi marshrutlarining RUXSATI.
 *
 * ── Nega bu test bor ────────────────────────────────────────────────────────
 * O'qish marshrutlari `attachment:view` talab qilardi. Kassa rollarida
 * (`Kassir`, `PointOfSale`) bu ruxsat yo'q, `customer-display/page.tsx` dagi
 * `fetchMainImageUrl` esa 403 ni `return null` bilan JIM yutadi — natijada
 * mijoz-ekran rasmni hech qachon ko'rsatmasdi va hech qayerda xato
 * ko'rinmasdi. Buni hech bir test ushlamagan, chunki ruxsat bayrog'ini
 * tekshiradigan test umuman yo'q edi.
 *
 * «Kassirga `attachment:view` beramiz» yechim EMAS: o'sha bayroq bir qatorda
 * `GET /attachments/all` — butun akkaunt fayl arxivini ochadi (Telegram
 * suhbat media'si, ovozli xabarlar, qarz kvitansiyalari). Shuning uchun
 * O'QISH marshrutlari `product:view` ga o'tkazildi, YOZISH esa ataylab
 * `attachment:*` da qoldirildi.
 *
 * Test manba matnini o'qiydi (Nest metadata'sini ko'tarmaydi) — bu uni
 * tez va DB'siz qiladi, `electron-bridge-contract.test.ts` bilan bir naqsh.
 */
const SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'image.controller.ts'),
  'utf8',
);

/** `@Get('...')` dan keyingi birinchi `@RequirePermission({...})` ni qaytaradi. */
function permissionAfter(route: string): string {
  const at = SRC.indexOf(`'${route}'`);
  expect(at, `marshrut topilmadi: ${route}`).toBeGreaterThan(-1);
  const rest = SRC.slice(at);
  const m = rest.match(/@RequirePermission\(\{[^}]*\}\)/);
  expect(m, `${route} uchun @RequirePermission yo'q`).not.toBeNull();
  return m?.[0] ?? '';
}

describe('image.controller — ruxsat bayroqlari', () => {
  it("ro'yxat marshruti `product:view` bilan qo'riqlanadi", () => {
    const p = permissionAfter('products/:productId/images');
    expect(p).toContain("entity: 'product'");
    expect(p).toContain("action: 'view'");
  });

  it('xom rasm marshruti `product:view` bilan qo’riqlanadi', () => {
    const p = permissionAfter('images/:imageId/raw');
    expect(p).toContain("entity: 'product'");
    expect(p).toContain("action: 'view'");
  });

  // Asosiy qo'riqchi: `attachment:view` qaytib kelsa mijoz-ekran yana
  // jimgina bo'shab qoladi. Shuning uchun butun faylda taqiqlanadi.
  it('faylda `attachment:view` umuman qolmagan', () => {
    expect(SRC).not.toMatch(/entity:\s*'attachment',\s*action:\s*'view'/);
  });

  // Teskari yo'nalish: yozish yo'llari kengayib ketmasin. Rasm yuklash/
  // o'chirish kim uchun ochiqligi bu o'zgarishning mavzusi EMAS edi.
  it('yozish yo’llari `attachment:*` da qoladi', () => {
    for (const action of ['create', 'update', 'delete']) {
      expect(SRC).toContain(`entity: 'attachment', action: '${action}'`);
    }
  });
});
