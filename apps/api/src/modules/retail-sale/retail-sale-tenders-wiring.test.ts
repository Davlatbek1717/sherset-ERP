import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { mockDocumentSequence } from '../../prisma/document-sequence.mock.js';
import { RetailSaleService } from './retail-sale.service.js';

/**
 * Kassa TZ §6/§7 — aralash to'lovning SERVIS darajasidagi ulanishi.
 *
 * Qoidalarning o'zi `retail-tenders.test.ts` da (sof). Bu yerda faqat ulanish
 * tekshiriladi, va aynan uchta narsa — ular buzilsa PUL noto'g'ri bo'ladi:
 *   1. terminal to'lovi qabul qilinadi (prodda 400 berardi);
 *   2. qaytim kassaga tushadigan naqddan CHEGIRILADI;
 *   3. qarz mijoz balansiga yoziladi va audit izini qoldiradi.
 */

const ACCOUNT = 'acc-1';
const USER_ID = 'user-1';
const SALE_ID = 'sale-1';
const SESSION_ID = 'sess-1';
const CASHDESK_ID = 'cd-1';
const AGENT_ID = '11111111-1111-4111-8111-111111111111';
const TOTAL = 100_000n;

function makeHarness(opts: { agentId?: string | null; balanceAfter?: bigint } = {}) {
  const retailSalePayment = { createMany: vi.fn().mockResolvedValue({ count: 1 }) };
  const counterpartyBalance = {
    findFirst: vi
      .fn()
      .mockResolvedValue(
        opts.balanceAfter === undefined ? null : { balanceMinor: opts.balanceAfter },
      ),
  };
  const cashierAuditEvent = { createMany: vi.fn().mockResolvedValue({ count: 1 }) };
  const tx = {
    retailSale: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: vi
        .fn()
        .mockResolvedValue({ id: SALE_ID, state: 'posted', agentId: null, sumMinor: TOTAL }),
    },
    retailSalePosition: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    retailSalePayment,
    cashierAuditEvent,
    counterpartyBalance,
    cashDesk: { update: vi.fn().mockResolvedValue({}) },
    cashierSession: { update: vi.fn().mockResolvedValue({}) },
  };
  const client = {
    documentSequence: mockDocumentSequence(),
    employee: { findUnique: vi.fn(async () => null) },
    loyaltyProgram: { findFirst: vi.fn(async () => null) },
    product: { findMany: vi.fn().mockResolvedValue([]) },
    priceType: { findMany: vi.fn().mockResolvedValue([]) },
    retailSale: {
      findFirst: vi.fn().mockResolvedValue({
        id: SALE_ID,
        name: 'ТРН-1',
        state: 'draft',
        sumMinor: TOTAL,
        sessionId: SESSION_ID,
        agentId: opts.agentId ?? null,
        session: {
          id: SESSION_ID,
          state: 'open',
          cashDeskId: CASHDESK_ID,
          storeId: 'store-1',
          salesCount: 0,
          salesSumMinor: 0n,
          store: { allowNegativeStock: true },
          cashDesk: { currency: 'UZS' },
        },
        positions: [],
      }),
    },
    $transaction: vi
      .fn()
      .mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const money = { applyDeltas: vi.fn().mockResolvedValue(undefined) };
  const balanceService = { applyDelta: vi.fn().mockResolvedValue(undefined) };
  const svc = new RetailSaleService(
    { client } as never,
    {
      lockBalances: vi.fn().mockResolvedValue(new Map()),
      assertAvailable: vi.fn(),
      applyDeltas: vi.fn(),
    } as never,
    money as never,
    { computeEarnedPoints: vi.fn(), createOperation: vi.fn() } as never,
    { emit: vi.fn().mockResolvedValue(undefined) } as never,
    balanceService as never,
  );
  return { svc, tx, money, balanceService, retailSalePayment, cashierAuditEvent };
}

const PAY = (over: Record<string, string> = {}) => ({
  cashAmountMinor: '0',
  cardAmountMinor: '0',
  expectedSumMinor: TOTAL.toString(),
  ...over,
});

describe('post() — terminal to`lovi (prodda 400 berardi)', () => {
  it('terminal bilan to`liq to`langan chek RASMIYLASHADI', async () => {
    const { svc, retailSalePayment } = makeHarness();
    await expect(
      svc.post(ACCOUNT, USER_ID, SALE_ID, PAY({ terminalAmountMinor: TOTAL.toString() })),
    ).resolves.toBeTruthy();

    const rows = retailSalePayment.createMany.mock.calls[0][0].data;
    expect(rows).toEqual([
      expect.objectContaining({ method: 'TERMINAL', amountMinor: TOTAL, amountBaseMinor: TOTAL }),
    ]);
  });

  it('terminal `cardAmountMinor` ustuniga yig`iladi (orqaga moslik)', async () => {
    const { svc, tx } = makeHarness();
    await svc.post(ACCOUNT, USER_ID, SALE_ID, PAY({ terminalAmountMinor: TOTAL.toString() }));
    expect(tx.retailSale.updateMany.mock.calls[0][0].data).toMatchObject({
      cashAmountMinor: 0n,
      cardAmountMinor: TOTAL,
    });
  });
});

describe('post() — qaytim kassadan chegiriladi', () => {
  it('120 000 naqd, 100 000 chek → kassaga 100 000 tushadi (120 000 EMAS)', async () => {
    // Ilgari to'liq berilgan naqd yozilardi: smena yopilishida kutilgan naqd
    // har qaytim summasicha ko'p chiqib, SOXTA KAMOMAD berardi (TZ §8.4).
    const { svc, money } = makeHarness();
    await svc.post(ACCOUNT, USER_ID, SALE_ID, PAY({ cashAmountMinor: '120000' }));
    const deltas = money.applyDeltas.mock.calls[0][2];
    expect(deltas).toEqual([expect.objectContaining({ deltaMinor: 100_000n })]);
  });

  it('aniq to`lovda kassaga to`liq summa tushadi', async () => {
    const { svc, money } = makeHarness();
    await svc.post(ACCOUNT, USER_ID, SALE_ID, PAY({ cashAmountMinor: TOTAL.toString() }));
    expect(money.applyDeltas.mock.calls[0][2]).toEqual([
      expect.objectContaining({ deltaMinor: TOTAL }),
    ]);
  });

  it('karta ortiqcha o`tkazilsa BLOKLANADI (qaytim faqat naqddan)', async () => {
    const { svc, money } = makeHarness();
    await expect(
      svc.post(ACCOUNT, USER_ID, SALE_ID, PAY({ cardAmountMinor: '120000' })),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(money.applyDeltas).not.toHaveBeenCalled();
  });
});

describe('post() — ekrandagi summa bazadagisi bilan solishtiriladi', () => {
  it('summa o`zgargan bo`lsa 409 — kassir boshqa summaga pul olmaydi', async () => {
    // Ilgari `expectedSumMinor` qabul qilinardi-yu solishtirilmasdi: chek
    // yuklangan va to'lov olingan on orasida hujjat o'zgarsa, kassir
    // ekrandagidan boshqa summaga pul olardi.
    const { svc, money } = makeHarness();
    await expect(
      svc.post(ACCOUNT, USER_ID, SALE_ID, {
        cashAmountMinor: '90000',
        cardAmountMinor: '0',
        expectedSumMinor: '90000', // ekranda 90 000, bazada 100 000
      }),
    ).rejects.toThrow(/summasi o'zgargan/);
    expect(money.applyDeltas).not.toHaveBeenCalled();
  });
});

describe('post() — qarzga sotish (TZ §7.1)', () => {
  it('mijozsiz qarzga sotib bo`lmaydi', async () => {
    const { svc, balanceService } = makeHarness({ agentId: null });
    await expect(
      svc.post(ACCOUNT, USER_ID, SALE_ID, PAY({ debtAmountMinor: TOTAL.toString() })),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(balanceService.applyDelta).not.toHaveBeenCalled();
  });

  it('qarz mijoz balansiga MUSBAT delta bo`lib yoziladi', async () => {
    const { svc, balanceService } = makeHarness({ agentId: AGENT_ID });
    await svc.post(ACCOUNT, USER_ID, SALE_ID, PAY({ debtAmountMinor: TOTAL.toString() }));
    expect(balanceService.applyDelta).toHaveBeenCalledTimes(1);
    const [, acc, cp, cur, delta] = balanceService.applyDelta.mock.calls[0];
    expect({ acc, cp, cur, delta }).toEqual({
      acc: ACCOUNT,
      cp: AGENT_ID,
      cur: 'UZS',
      delta: TOTAL,
    });
  });

  it('qarz audit jurnaliga YANGI BALANS bilan tushadi', async () => {
    const { svc, cashierAuditEvent } = makeHarness({
      agentId: AGENT_ID,
      balanceAfter: 250_000n,
    });
    await svc.post(
      ACCOUNT,
      USER_ID,
      SALE_ID,
      PAY({ cashAmountMinor: '40000', debtAmountMinor: '60000' }),
    );
    const rows = cashierAuditEvent.createMany.mock.calls.flatMap((c) => c[0].data);
    const credit = rows.find((r: { type: string }) => r.type === 'SOLD_ON_CREDIT');
    expect(credit).toBeTruthy();
    expect(credit.payload).toMatchObject({
      agentId: AGENT_ID,
      debtMinor: '60000',
      totalMinor: '100000',
      newBalanceMinor: '250000',
    });
  });

  it('to`lov oynasida tanlangan mijoz CHEKKA YOZILADI (SALES-04 ga shart)', async () => {
    // `/sotuv` mijozni chek yaratilganda emas, to'lov paytida yuboradi:
    // qarz `parsed.agentId` balansiga yozilardi-yu chek qatorida `agentId`
    // NULL qolardi. Natijada qaytarishda qarz kimniki ekani NOMA'LUM bo'lib,
    // uni qaytarib bo'lmasdi (SALES-04 fix'i shu maydonga tayanadi).
    const { svc, tx, balanceService } = makeHarness({ agentId: null });
    await svc.post(ACCOUNT, USER_ID, SALE_ID, {
      ...PAY({ debtAmountMinor: TOTAL.toString() }),
      agentId: AGENT_ID,
    });
    expect(balanceService.applyDelta.mock.calls[0][2]).toBe(AGENT_ID);
    expect(tx.retailSale.updateMany.mock.calls[0][0].data).toMatchObject({ agentId: AGENT_ID });
  });

  it('chekdagi mijozni to`lov oynasi QAYTA YOZMAYDI', async () => {
    const { svc, tx } = makeHarness({ agentId: AGENT_ID });
    await svc.post(ACCOUNT, USER_ID, SALE_ID, PAY({ debtAmountMinor: TOTAL.toString() }));
    expect(tx.retailSale.updateMany.mock.calls[0][0].data.agentId).toBeUndefined();
  });

  it('qarz `cardAmountMinor` ga QO`SHILMAYDI — u pul emas', async () => {
    const { svc, tx } = makeHarness({ agentId: AGENT_ID });
    await svc.post(
      ACCOUNT,
      USER_ID,
      SALE_ID,
      PAY({ cashAmountMinor: '40000', debtAmountMinor: '60000' }),
    );
    expect(tx.retailSale.updateMany.mock.calls[0][0].data).toMatchObject({
      cashAmountMinor: 40_000n,
      cardAmountMinor: 0n,
    });
  });
});
