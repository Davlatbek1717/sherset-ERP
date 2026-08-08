import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  API_SRC_ROOT,
  DECLARED_BALANCE_WRITERS,
  SCRIPT_SOURCES,
  assertCounterpartyBalanceCoverage,
  scanBalanceWriters,
} from './counterparty-balance-sources.js';

/**
 * DUP-02 qamrov-qulfi (audit 2026-08-08, CRITICAL).
 *
 * `recompute-counterparty-balances.ts` materialized `CounterpartyBalance` ni
 * hujjatlardan QAYTA QURADI: manbalarda ko'rinmagan kontragentning nishoni 0
 * bo'ladi va `APPLY=1` uni jimgina 0 ga yozadi. Ya'ni skript qamramagan har
 * bir `applyDelta` yozuvchisi — pul-ma'lumot yo'qolishi.
 *
 * Non-vakuum: bu test yozilgan paytda `debt/debt.service.ts` (QRZ- qarz
 * ochilishi, 2026-08-05) va `retail-sale/retail-sale.service.ts` (POS qarzga
 * sotuv + qarz-qaytarish) balansga yozardi-yu skript ularni BILMASDI —
 * `assertCounterpartyBalanceCoverage()` aynan shu ikkovini QAMROVSIZ deb
 * yiqitgan.
 */

const SCRIPT_PATH = join(API_SRC_ROOT, 'scripts', 'recompute-counterparty-balances.ts');
const SCRIPT_SRC = readFileSync(SCRIPT_PATH, 'utf8');

describe('counterparty-balance qamrov reyestri (DUP-02)', () => {
  it("skanner manba-daraxtdan yozuvchilarni topadi (skanner o'zi ishlaydi)", () => {
    const found = scanBalanceWriters();
    // Non-vakuum: skanner haqiqatan ishlayotganini ko'rsatadigan lang'ar.
    expect(found.length).toBeGreaterThanOrEqual(12);
    expect(found).toContain('modules/invoice-out/invoice-out.service.ts');
    expect(found).toContain('modules/debt/debt-recalc.ts');
  });

  it("applyDelta E'LONI va testlar yozuvchi deb sanalmaydi", () => {
    const found = scanBalanceWriters();
    expect(found).not.toContain('modules/counterparty-balance/counterparty-balance.service.ts');
    expect(found.filter((f) => f.endsWith('.test.ts'))).toEqual([]);
  });

  it('izohdagi «applyDelta» eslatmasi yozuvchi deb sanalmaydi', () => {
    // Bu ikki fayl `applyDelta` ni faqat premise-izohida tilga oladi.
    const found = scanBalanceWriters();
    expect(found).not.toContain('modules/counterparty-settlement/counterparty-settlement.util.ts');
    expect(found).not.toContain('modules/counterparty-statement/counterparty-statement.service.ts');
  });

  it("HAR yozuvchi reyestrda e'lon qilingan (yangi yozuvchi → shu test yiqiladi)", () => {
    expect(() => assertCounterpartyBalanceCoverage()).not.toThrow();
  });

  it("reyestrda yangi yozuvchi paydo bo'lsa QAMROVSIZ deb yiqiladi", () => {
    const withNewWriter = [...scanBalanceWriters(), 'modules/loyalty/loyalty.service.ts'];
    expect(() => assertCounterpartyBalanceCoverage(withNewWriter)).toThrow(
      /QAMROVSIZ[\s\S]*modules\/loyalty\/loyalty\.service\.ts/,
    );
  });

  it('reyestrda eskirgan yozuv qolsa ham yiqiladi', () => {
    const withoutOne = scanBalanceWriters().filter((f) => f !== 'modules/debt/debt-recalc.ts');
    expect(() => assertCounterpartyBalanceCoverage(withoutOne)).toThrow(
      /ESKIRGAN[\s\S]*modules\/debt\/debt-recalc\.ts/,
    );
  });
});

describe("reyestr ↔ skript bog'lanishi", () => {
  it('reyestrdagi har manba skriptda `SOURCE:` markeri bilan mavjud', () => {
    for (const source of new Set(DECLARED_BALANCE_WRITERS.flatMap((w) => w.sources))) {
      expect(SCRIPT_SRC, `skriptda «SOURCE: ${source}» bloki yo'q`).toContain(`SOURCE: ${source}`);
    }
  });

  it("e'lon qilingan manbalar SCRIPT_SOURCES ro'yxatidan olinadi", () => {
    for (const w of DECLARED_BALANCE_WRITERS) {
      for (const s of w.sources) expect(SCRIPT_SOURCES).toContain(s);
    }
  });

  it('skript birinchi yozuvdan OLDIN qamrovni tekshiradi', () => {
    // Faqat import qilib qo'yish yetarli emas — chaqirilishi ham kerak.
    expect(SCRIPT_SRC).toMatch(/assertCounterpartyBalanceCoverage\(\)/);
    const guardAt = SCRIPT_SRC.indexOf('assertCounterpartyBalanceCoverage()');
    const firstWriteAt = SCRIPT_SRC.indexOf('counterpartyBalance.upsert');
    expect(guardAt).toBeGreaterThan(-1);
    expect(firstWriteAt).toBeGreaterThan(guardAt);
  });
});

describe('skript manbalari yozuvchilar semantikasiga mos (DUP-02 fix)', () => {
  it('QRZ- qarz ochilishi (debt-issue) Σ totalMinor bilan qayta quriladi', () => {
    expect(SCRIPT_SRC).toContain('SOURCE: debt-issue');
    expect(SCRIPT_SRC).toMatch(/prisma\.debt\.groupBy/);
    expect(SCRIPT_SRC).toMatch(/_sum:\s*\{\s*totalMinor:\s*true\s*\}/);
  });

  it('POS qarzga sotuv DEBT tender qatorlaridan qayta quriladi', () => {
    expect(SCRIPT_SRC).toContain('SOURCE: retail-credit');
    expect(SCRIPT_SRC).toMatch(/prisma\.retailSalePayment\.findMany/);
    expect(SCRIPT_SRC).toMatch(/TENDER\.debt/);
  });

  it('POS qarz-qaytarish (debtReturnMinor) teskari ishora bilan qayta quriladi', () => {
    expect(SCRIPT_SRC).toContain('SOURCE: retail-credit-refund');
    expect(SCRIPT_SRC).toMatch(/debtReturnMinor/);
  });

  /**
   * Skriptning debt-issue manbasi soft-delete qilingan qarzlarni HAM
   * qo'shadi — chunki `DebtService.remove()` create'ning +totalMinor deltasini
   * QAYTARMAYDI (DUP-03, Faza 12'ga qoldirilgan). Faza 12 reversal qo'shsa bu
   * test yiqiladi va skriptga `deletedAt: null` filtri qo'yish kerak bo'ladi —
   * aks holda o'chirilgan qarz balansga qaytib kelardi.
   */
  it("premise: debt.remove() hali balansni qaytarmaydi (Faza 12 bilan bog'lanish)", () => {
    const debtSrc = readFileSync(join(API_SRC_ROOT, 'modules', 'debt', 'debt.service.ts'), 'utf8');
    const removeBody = debtSrc.slice(debtSrc.indexOf('async remove('));
    expect(removeBody).not.toMatch(/applyDelta\s*\(/);
  });
});
