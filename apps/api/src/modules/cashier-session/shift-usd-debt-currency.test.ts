import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { expectedUsdCashMinor } from './cashier-session-reconciliation.js';

/**
 * F6 §6 — AUDIT TOPILMASI: naqd qarz to'lovi VALYUTA bo'yicha ajratilmagan.
 *
 * TUZATISHDAN OLDINGI holat (o'lchangan, reja §F6.6):
 *   · `collectCashInputs` naqd qarz to'lovlarini `method:'cash'` bo'yicha
 *     sanaydi, VALYUTA filtri yo'q;
 *   · `DebtPayment.amountMinor` esa HAR DOIM so'm ekvivalentida;
 *   · `collectUsdCashInputs` faqat `RetailSalePayment CASH_USD` ni o'qiydi.
 *
 * ⇒ USD qarz to'lovida yashiqqa DOLLAR tushadi, so'm-kutilgani esa dollarning
 * so'm ekvivalentiga OSHADI, USD-kutilgani esa uni umuman ko'rmaydi. Natija —
 * **soxta so'm kamomadi + hisobga olinmagan dollar**: kassir o'zi qabul
 * qilmagan so'mga javob beradi.
 *
 * F6'gacha bu **uxlab yotgan mina** edi (FE `currency` yubormasdi) — F6 uni
 * uyg'otadi, shuning uchun ajratma shu fazada yopiladi.
 *
 * Qulf ikki qatlamli: (1) sof formulada dollar qarz a'zosi bor,
 * (2) manba matnida so'rovlar valyuta bo'yicha ajratilgan (typecheck va sof
 * testlar bu ulanishni KO'RMAYDI — `DocumentEditor` prop-drop klassi).
 */
const SERVICE = readFileSync(join(import.meta.dirname, 'cashier-session.service.ts'), 'utf8');

function methodBody(name: string): string {
  const start = SERVICE.indexOf(`private async ${name}`);
  expect(start, `${name} topilmadi`).toBeGreaterThan(-1);
  const end = SERVICE.indexOf('\n  /**', start);
  return SERVICE.slice(start, end === -1 ? SERVICE.length : end);
}

describe('F6 §6 — so`m kutilgani DOLLAR qarz to`lovini yutmaydi', () => {
  it('so`m qarz agregati VALYUTA bo`yicha filtrlanadi', () => {
    const body = methodBody('collectCashInputs');
    const agg = body.slice(body.indexOf('debtPayment.aggregate'));
    expect(agg.slice(0, 400)).toContain('currency: BASE_CURRENCY');
  });

  it('BASE_CURRENCY hamon so`m (konstanta jimgina o`zgarib ketmasin)', () => {
    expect(SERVICE).toMatch(/const BASE_CURRENCY = 'UZS'/);
  });

  it('dollar qarz to`lovi ALOHIDA agregatdan, `amountOriginalMinor` bo`yicha', () => {
    // 🔴 `amountMinor` EMAS: u so'm ekvivalenti. Yashiqqa esa sent tushgan.
    const body = methodBody('collectUsdCashInputs');
    const agg = body.slice(body.indexOf('debtPayment.aggregate'));
    expect(agg, 'collectUsdCashInputs da debtPayment.aggregate yo`q').not.toBe('');
    expect(agg.slice(0, 500)).toContain("currency: 'USD'");
    expect(agg.slice(0, 500)).toContain("method: 'cash'");
    expect(agg.slice(0, 500)).toContain('retailShiftId: sessionId');
    expect(agg.slice(0, 500)).toContain('reversedAt: null');
    expect(agg.slice(0, 600)).toContain('amountOriginalMinor: true');
  });

  it('dollar qarz summasi `debtUsdMinor` bo`lib formulaga uzatiladi', () => {
    const body = methodBody('collectUsdCashInputs');
    expect(body).toMatch(/debtUsdMinor:/);
  });
});

describe('F6 §6 — expectedUsdCashMinor formulasi', () => {
  const base = { openingUsdMinor: 0n, salesUsdMinor: 0n, returnsUsdMinor: 0n };

  it('dollar qarz to`lovi kutilgan dollarni AYNAN o`sha summaga oshiradi', () => {
    expect(expectedUsdCashMinor({ ...base, debtUsdMinor: 10_000n })).toBe(10_000n);
    expect(
      expectedUsdCashMinor({ openingUsdMinor: 500n, salesUsdMinor: 200n, returnsUsdMinor: 100n }),
    ).toBe(600n);
    expect(
      expectedUsdCashMinor({
        openingUsdMinor: 500n,
        salesUsdMinor: 200n,
        returnsUsdMinor: 100n,
        debtUsdMinor: 10_000n,
      }),
    ).toBe(10_600n);
  });

  it('berilmasa 0 — eski chaqiruvchilar uchun regressiya yo`q', () => {
    expect(expectedUsdCashMinor({ ...base, salesUsdMinor: 777n })).toBe(777n);
  });
});
