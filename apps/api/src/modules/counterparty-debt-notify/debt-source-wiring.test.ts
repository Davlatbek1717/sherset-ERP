import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * WIRING QO'RIQCHISI — kod MATNINI o'qiydi, servisni ko'tarmaydi.
 *
 * Nega shunday: mijozga xabar ketishi `applyDelta(…, meta)` da `source`
 * borligiga bog'liq, va `source` OPTIONAL. Ya'ni uni unutish typecheck'dan
 * JIM o'tadi va butun funksiya o'sha oqimda jimgina o'chib qoladi — aynan
 * shu yoriq 2026-08-16 da topilgan edi (kassa oqimi hech qachon xabar
 * yubormasdi). Bu test har `docType` uchun `source` yonma-yon turishini
 * talab qiladi, shuning uchun yangi chaqiruv nuqtasi qo'shilsa ham qo'riqchi
 * ishlaydi.
 */
const MODULES = fileURLToPath(new URL('..', import.meta.url));
const read = (p: string) => readFileSync(`${MODULES}${p}`, 'utf8');

/**
 * `docType: '<name>'` ni o'z ichiga olgan BALANS meta-literallarini ajratadi.
 *
 * `organizationId` sharti MAJBURIY: aynan shu maydon balans metasini
 * (`ApplyDeltaMeta`) OMBOR deltasidan ajratadi — omborniki ham `docType:
 * 'retailsale'` yozadi, lekin uning shakli boshqa (`qtyDelta`, `reason`,
 * `assortmentKind`). Bu shartsiz qo'riqchi 5 ta mos keladi va 3 tasi
 * kontragent balansiga umuman aloqasi yo'q ombor yozuvlari bo'lardi.
 */
function metasFor(src: string, docType: string): string[] {
  const re = new RegExp(`\\{[^{}]*docType:\\s*'${docType}'[^{}]*\\}`, 'g');
  return (src.match(re) ?? []).filter((m) => m.includes('organizationId'));
}

/**
 * 🔴 QATTIQ SON EMAS, INVARIANT (2026-08-16, hodisadan keyin).
 *
 * Bu qo'riqchi `toBe(2)` bilan yozilgan edi va yashil tug'ilgan (o'sha payt
 * `retail-sale.service.ts` da rostdan 2 ta balans-metasi bor edi). Keyin
 * `c59afdcf` («to'langan chekni tahrirlash — server yo'li») uchta YANGI
 * chaqiruv nuqtasi qo'shdi ⇒ son 5 bo'ldi ⇒ test QIZARDI va shu holda
 * qoldi. Uchalasi ham `source` bilan to'g'ri yozilgan edi, ya'ni **haqiqiy
 * yoriq yo'q edi — faqat son eskirgan**.
 *
 * Qizil turgan test eng yomon holat: u har «gate yashil» da'vosini
 * kuchsizlantiradi va oxiri e'tiborsiz qolinadi. Shuning uchun endi
 * qulflanadigan narsa ANIQ INVARIANT: *har* balans-metasi `source` bilan
 * ketadi. Qonuniy o'sish (yangi chaqiruv nuqtasi) testni qizartirmaydi, lekin
 * `source`siz yangi nuqta DARHOL tutiladi.
 *
 * Pastki chegara (`>= 2`) ATAYLAB saqlanadi — regexp ishlamay qolsa (fayl
 * ko'chsa, meta shakli o'zgarsa) `for` sikli 0 ta element ustida yurib test
 * VAKUUM bo'lib yashil qolardi.
 */
describe('kassa oqimi balans hodisasiga `source` uzatadi', () => {
  it("retail-sale: HAR balans-metasi source:'retailsale' bilan", () => {
    const metas = metasFor(read('retail-sale/retail-sale.service.ts'), 'retailsale');
    // Kamida: post (+delta) va qaytarish (−delta). Chek tahriri yo'li yana
    // uchtasini qo'shdi — ro'yxat o'sishi mumkin, shart o'zgarmaydi.
    expect(metas.length).toBeGreaterThanOrEqual(2);
    for (const m of metas) expect(m).toContain("source: 'retailsale'");
  });

  it("pos-debt-payment: source:'debtpayment'", () => {
    const metas = metasFor(read('debt/pos-debt-payment.service.ts'), 'debtpayment');
    expect(metas.length).toBeGreaterThan(0);
    for (const m of metas) expect(m).toContain("source: 'debtpayment'");
  });

  it("debt.service: HAR 'debt'/'debtpayment' metasi source bilan", () => {
    const src = read('debt/debt.service.ts');
    const metas = [...metasFor(src, 'debt'), ...metasFor(src, 'debtpayment')];
    // Kamida: recalc yordamchisi + create + remove (aynan son EMAS — yuqoridagi
    // izohga qara: qattiq son qonuniy o'sishda qizarib, qo'riqchini o'ldiradi).
    expect(metas.length).toBeGreaterThanOrEqual(3);
    for (const m of metas) expect(m).toMatch(/source: '(debt|debtpayment)'/);
  });
});
