import { describe, expect, it, vi } from 'vitest';
import { RetailSaleService } from './retail-sale.service.js';

/**
 * `GET /retail-sales` ro'yxat KONTRAKTI — `session.cashier` MAJBURIY.
 *
 * **Hodisa (2026-08-10).** POS «Sotuv» ekranidagi «Cheklar» tabi bosilganda
 * sahifa error-boundary'ga yiqilardi. Sabab: `list()` ning `include.session`
 * tanlovida `cashier` YO'Q edi, frontend esa ro'yxat qatorini
 * `sale.session.cashier.name` deb chizadi (`sotuv/page.tsx`) ⇒
 * `Cannot read properties of undefined (reading 'name')`.
 *
 * Bu — takroriy bug-klass: aynan shu ifoda 2026-06-08k da `/retail` ni
 * oq ekranga aylantirgan (qarang `apps/web/src/app/(app)/error.tsx` izohi).
 * Hech bir gate uni tutmadi: FE testlari o'z fixture'ida `cashier` ni O'ZI
 * to'qib beradi (`sotuv/__tests__/harness.tsx` → `SALE_ROW`), ya'ni yashil
 * test serverning haqiqiy javobi haqida HECH NARSA aytmaydi.
 *
 * Shuning uchun qo'riqchi server tomonida: `list()` yuboradigan `include`
 * shakli o'lchanadi. Bu `findById()` bilan bir xil qatorlar to'plami emas —
 * ro'yxatga faqat FE chizadigan minimal maydonlar kifoya, lekin ular
 * BO'LISHI shart.
 */

const ACC = 'acc-1';
const SESSION = '00000000-0000-0000-0000-0000000000a1';

function makeHarness() {
  const findMany = vi.fn(async () => [] as unknown[]);
  const count = vi.fn(async () => 0);
  const client = { retailSale: { findMany, count } };
  const svc = new RetailSaleService(
    { client } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    // F8: CustomerOrderService — zakazsiz chekda chaqirilmaydi.
    { applyPayment: async () => {} } as never,
  );
  return { svc, findMany };
}

type Select = Record<string, unknown>;

describe('retail-sale list() — FE chizadigan maydonlar kontrakti', () => {
  it('session.cashier {id,name} bilan birga qaytariladi (POS «Cheklar» tabi shuni o`qiydi)', async () => {
    const h = makeHarness();
    await h.svc.list(ACC, { sessionId: SESSION, limit: 100 });

    const args = h.findMany.mock.calls[0]?.[0] as
      | { include?: { session?: { select?: Select } } }
      | undefined;
    const sessionSelect = args?.include?.session?.select;

    expect(sessionSelect, '`include.session.select` topilmadi').toBeDefined();
    expect(
      sessionSelect?.cashier,
      '`session.cashier` tanlanmagan — POS «Cheklar» tabi `session.cashier.name` da yiqiladi',
    ).toEqual({ select: { id: true, name: true } });
  });

  it('session.cashDesk (nomi + valyutasi) ham qoladi — pul katakchasi shundan formatlanadi', async () => {
    const h = makeHarness();
    await h.svc.list(ACC, { sessionId: SESSION, limit: 100 });

    const args = h.findMany.mock.calls[0]?.[0] as
      | { include?: { session?: { select?: Select }; _count?: unknown; agent?: unknown } }
      | undefined;
    const sessionSelect = args?.include?.session?.select as
      | { cashDesk?: { select?: Record<string, boolean> } }
      | undefined;

    expect(sessionSelect?.cashDesk?.select?.name).toBe(true);
    expect(sessionSelect?.cashDesk?.select?.currency).toBe(true);
    // Qator «N dona» yozuvi va kontragent nomi ham ro'yxatdan chiziladi.
    expect(args?.include?._count).toEqual({ select: { positions: true } });
    expect(args?.include?.agent).toEqual({ select: { id: true, name: true } });
  });
});
