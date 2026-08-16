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

describe('kassa oqimi balans hodisasiga `source` uzatadi', () => {
  it("retail-sale: qarzga savdo va qaytarish — ikkalasi ham source:'retailsale'", () => {
    const metas = metasFor(read('retail-sale/retail-sale.service.ts'), 'retailsale');
    expect(metas.length).toBe(2); // post (+delta) va refund (−delta)
    for (const m of metas) expect(m).toContain("source: 'retailsale'");
  });

  it("pos-debt-payment: source:'debtpayment'", () => {
    const metas = metasFor(read('debt/pos-debt-payment.service.ts'), 'debtpayment');
    expect(metas.length).toBeGreaterThan(0);
    for (const m of metas) expect(m).toContain("source: 'debtpayment'");
  });

  it("debt.service: 'debt' va 'debtpayment' metalari source bilan", () => {
    const src = read('debt/debt.service.ts');
    const metas = [...metasFor(src, 'debt'), ...metasFor(src, 'debtpayment')];
    expect(metas.length).toBe(3); // recalc yordamchisi + create + remove
    for (const m of metas) expect(m).toMatch(/source: '(debt|debtpayment)'/);
  });
});
