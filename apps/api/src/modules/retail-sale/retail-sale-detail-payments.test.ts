import { describe, expect, it, vi } from 'vitest';
import { RetailSaleService } from './retail-sale.service.js';

/**
 * F5 — chek to'lov qatlami `RetailSalePayment` qatorlaridan o'qiladi.
 *
 * NEGA SERVER TOMONDA QO'RIQCHI (xotira: «FE fixture server maydonini o'zi
 * to'qiydi»): uchala chek renderer'i (`buildReceiptText`, `buildReceiptHtml`,
 * `/print/retail-sale`) endi `sale.payments` ni o'qiydi. Agar bu `include`
 * bir kun tushib qolsa, FE testlari O'Z fikstura'sida yashil qolaveradi va
 * chek jimgina to'lov qatorsiz bosilardi (aynan auditda topilgan holat:
 * «Terminal» qatori hech qachon chiqmasdi, «Qarz» qatori o'lik edi).
 *
 * Shuning uchun shartnoma manba tomonda qulflanadi: `findById` `payments` ni
 * — dollar qatorini o'qish uchun kerak bo'lgan HAMMA maydoni bilan — beradi.
 */

const ACCOUNT = 'acc-1';
const SALE_ID = '11111111-1111-4111-8111-111111111111';

function makeService() {
  const findFirst = vi.fn(async () => ({ id: SALE_ID, payments: [] }));
  const prisma = { client: { retailSale: { findFirst } } };
  const svc = new RetailSaleService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    // F8: CustomerOrderService — zakazsiz chekda chaqirilmaydi.
    { applyPayment: async () => {} } as never,
  );
  return { svc, findFirst };
}

describe('RetailSaleService.findById — to‘lov qatorlari', () => {
  it('`payments` ni include qiladi (chek renderer’lari uchun yagona manba)', async () => {
    const { svc, findFirst } = makeService();
    await svc.findById(ACCOUNT, SALE_ID);
    const args = findFirst.mock.calls[0]?.[0] as unknown as {
      include: { payments?: unknown };
    };
    expect(args.include.payments).toBeDefined();
  });

  it('dollar qatorini o‘qish uchun kerakli HAMMA maydon so‘raladi', async () => {
    const { svc, findFirst } = makeService();
    await svc.findById(ACCOUNT, SALE_ID);
    const args = findFirst.mock.calls[0]?.[0] as unknown as {
      include: { payments: { select: Record<string, boolean> } };
    };
    const select = args.include.payments.select;
    // `method` — qaysi qator; `amountMinor`+`currency` — asl valyutadagi summa
    // ($ sent); `rateMinor` — chekka muzlatilgan kurs; `amountBaseMinor` —
    // so'mdagi ekvivalenti. Bittasi tushsa dollar qatori chala bosiladi.
    for (const field of [
      'method',
      'amountMinor',
      'currency',
      'rateMinor',
      'amountBaseMinor',
    ] as const) {
      expect(select[field], `«${field}» maydoni so‘ralmagan`).toBe(true);
    }
  });
});
