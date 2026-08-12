import { describe, expect, it, vi } from 'vitest';
import { PnlService } from './pnl.service.js';

/**
 * P14 / `H3` — POS YASHIG'IDAN CHIQQAN XARAJAT P&L GA TUSHADI.
 *
 * TUZATISHDAN OLDINGI nosozlik (`expense-budget/expense-fact.ts:34-39` da
 * ATAYLAB hujjatlangan qarz sifatida yozib qo'yilgan edi): `pnl.service.ts`
 * xarajat qatorini FAQAT `payments_out` + `cash_out` dan yig'ardi. Kassir
 * yashiqdan to'lagan xarajat esa uchinchi jadvalga —
 * `retail_drawer_cash_out` ga — yoziladi (`cashier-session.service.ts#posCashOut`),
 * ya'ni kassadan to'langan ijara/yuk haqi foyda-zarar hisobotida
 * KO'RINMASDI: sof foyda doimo haqiqatdan YUQORI chiqardi. Byudjet ekrani
 * (MK12) uni allaqachon ko'rsatardi — ikki ekran ikki xil raqam berardi.
 *
 * 🔴 IKKI-KARRA SANOQ CHEGARASI (`expense-budget-fact-sources` xotirasi):
 * yashiq jadvali UCH xil pul chiqishini bitta qator-fazoda saqlaydi
 * (`kind`: `expense` · `collection` · `other`). **Инкассация xarajat EMAS** —
 * u kassadan bankka KO'CHIRISH, va o'sha pul keyin bankdan `PaymentOut` bilan
 * chiqqanda P&L allaqachon sanaydi. Filtrsiz yig'indi shu pulni ikki marta
 * hisoblardi. Shuning uchun chegara sharti YAGONA manbadan olinadi —
 * `drawerExpenseWhereKind()` (byudjet moduli bilan bir xil sof funksiya),
 * ikkinchi literal YARATILMAYDI.
 *
 * NON-VACUOUS: tuzatishdan oldin 5/5 yiqilgan (drawer so'rovi umuman
 * yuborilmasdi ⇒ `expensesMinor` faqat payments_out + cash_out edi).
 */

const E8 = 100_000_000n;

function currencyRows() {
  return [
    { code: 'UZS', default: true, rateValue: E8, multiplicity: 1, indirect: false },
    { code: 'USD', default: false, rateValue: 12_000n * E8, multiplicity: 1, indirect: false },
  ];
}

type Row = {
  currency: string;
  rate_value?: bigint;
  sum_minor: bigint | null;
  cost_minor?: bigint | null;
  bucket?: Date;
};

interface TableRows {
  demands?: Row[];
  sales_returns?: Row[];
  payments_out?: Row[];
  cash_out?: Row[];
  retail_drawer_cash_out?: Row[];
}

/**
 * `$queryRaw` dublini jadval nomi bo'yicha marshrutlaydi va HAR so'rovning
 * matni + parametrlarini yozib boradi (chegara sharti aynan shu yerdan
 * o'lchanadi).
 *
 * ⚠️ Marshrutlash tartibi: `'FROM retail_drawer_cash_out'` matni
 * `'FROM cash_out'` ni O'Z ICHIGA OLMAYDI (prefiks tufayli), shuning uchun
 * ikkalasi chalkashmaydi — lekin drawer sharti AVVAL tekshiriladi.
 */
function makeService(tables: TableRows) {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const client = {
    currency: { findMany: vi.fn(async () => currencyRows()) },
    $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join(' ');
      calls.push({ sql, values });
      if (sql.includes('FROM retail_drawer_cash_out')) return tables.retail_drawer_cash_out ?? [];
      if (sql.includes('FROM demands')) return tables.demands ?? [];
      if (sql.includes('FROM sales_returns')) return tables.sales_returns ?? [];
      if (sql.includes('FROM payments_out')) return tables.payments_out ?? [];
      if (sql.includes('FROM cash_out')) return tables.cash_out ?? [];
      return [];
    }),
  };
  return { svc: new PnlService({ client } as never), calls };
}

const RANGE = { dateFrom: '2026-05-01', dateTo: '2026-05-31', groupBy: 'none' as const };

describe("P&L — POS yashig'i xarajati (H3)", () => {
  it("yashiqdan chiqqan xarajat `expensesMinor` ga QO'SHILADI", async () => {
    const { svc } = makeService({
      demands: [{ currency: 'UZS', sum_minor: 1_000_000n, cost_minor: 200_000n }],
      cash_out: [{ currency: 'UZS', sum_minor: 300_000n, cost_minor: null }],
      retail_drawer_cash_out: [{ currency: 'UZS', sum_minor: 50_000n, cost_minor: null }],
    });

    const r = await svc.pnlReport('acc', RANGE);

    // xarajat = cash_out 300 000 + yashiq 50 000 = 350 000
    expect(r.totals.expensesMinor).toBe('350000');
    // sof foyda = (1 000 000 − 0) − 200 000 − 350 000
    expect(r.totals.netProfitMinor).toBe('450000');
  });

  it("🔴 yashiq so'rovi `kind` chegarasi bilan yuboriladi (инкассация sanalmaydi)", async () => {
    const { svc, calls } = makeService({ retail_drawer_cash_out: [] });

    await svc.pnlReport('acc', RANGE);

    const drawer = calls.filter((c) => c.sql.includes('FROM retail_drawer_cash_out'));
    expect(drawer.length).toBe(1);
    expect(drawer[0].sql).toContain('AND kind =');
    // Chegara qiymati sof funksiyadan keladi — bu yerda AYNAN o'sha qiymat
    // parametr bo'lib uzatilganini o'lchaymiz (literal ikkinchi manba emas).
    expect(drawer[0].values).toContain('expense');
  });

  it('yashiq xarajati ham baza valyutasiga konsolidatsiya qilinadi', async () => {
    const { svc } = makeService({
      // Ikki valyuta ATAYLAB: `mixedCurrency` bayrog'i ko'rilgan valyutalar
      // SONIga qaraydi — bitta USD qatori bilan u `false` bo'lardi va
      // tekshiruv konvertatsiya haqida hech nima demasdi.
      cash_out: [{ currency: 'UZS', sum_minor: 300_000n, cost_minor: null }],
      retail_drawer_cash_out: [{ currency: 'USD', sum_minor: 100n, cost_minor: null }],
    });

    const r = await svc.pnlReport('acc', RANGE);

    // yashiq 100 USD × 12 000 = 1 200 000 + cash_out 300 000
    expect(r.totals.expensesMinor).toBe('1500000');
    expect(r.mixedCurrency).toBe(true);
  });

  it('guruhlangan rejimda ham yashiq xarajati bucketga tushadi', async () => {
    const bucket = new Date('2026-05-01T00:00:00.000Z');
    const { svc } = makeService({
      demands: [{ bucket, currency: 'UZS', sum_minor: 1_000_000n, cost_minor: 200_000n }],
      retail_drawer_cash_out: [{ bucket, currency: 'UZS', sum_minor: 50_000n, cost_minor: null }],
    });

    const r = await svc.pnlReport('acc', { ...RANGE, groupBy: 'month' as const });

    expect(r.groups.length).toBe(1);
    expect(r.groups[0].expensesMinor).toBe('50000');
    expect(r.groups[0].netProfitMinor).toBe('750000');
  });

  it("yashiqda xarajat bo'lmasa jami O'ZGARMAYDI (regressiya yo'q)", async () => {
    const { svc } = makeService({
      demands: [{ currency: 'UZS', sum_minor: 1_000_000n, cost_minor: 200_000n }],
      payments_out: [{ currency: 'UZS', sum_minor: 400_000n, cost_minor: null }],
      cash_out: [{ currency: 'UZS', sum_minor: 300_000n, cost_minor: null }],
      retail_drawer_cash_out: [],
    });

    const r = await svc.pnlReport('acc', RANGE);

    expect(r.totals.expensesMinor).toBe('700000');
  });
});
