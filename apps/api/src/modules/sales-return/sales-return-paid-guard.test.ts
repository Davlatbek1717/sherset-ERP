import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { SalesReturnService } from './sales-return.service.js';

/**
 * G3 — «TO'LANGAN vozvratni orqaga qaytarib bo'lmaydi» (G1 hisobotidagi ochiq band).
 *
 * G1 kassadan naqd chiqishini `SalesReturn.payedSumMinor` bilan cheklaydi,
 * lekin `unpost`/`cancel` bu ustunga QARAMASDI. Ya'ni mijozga pul berilgan
 * vozvratni bekor qilish qoldiqni ham, mijoz balansidagi `−sumMinor`
 * kreditini ham qaytarib tashlardi — kassadan chiqqan pul esa hech qanday
 * hujjat bilan qoplanmay qolardi. FK RESTRICT to'lov hujjatining O'ZINI
 * himoya qiladi, lekin bu hisobni himoya qilmaydi.
 */

const ACCOUNT = 'acc-1';
const USER = 'emp-1';
const ID = 'sr-1';

interface HarnessOpts {
  state: 'posted' | 'draft';
  payedSumMinor: bigint;
}

function makeHarness(opts: HarnessOpts) {
  const applyDeltas = vi.fn().mockResolvedValue(undefined);
  const applyBalanceDelta = vi.fn().mockResolvedValue(undefined);
  const claims: Array<Record<string, unknown>> = [];

  const tx = {
    salesReturn: {
      updateMany: vi.fn(async (args: { where: Record<string, unknown> }) => {
        claims.push(args.where);
        return { count: 1 };
      }),
      findFirst: vi.fn().mockResolvedValue({ payedSumMinor: opts.payedSumMinor }),
      update: vi.fn().mockResolvedValue({ id: ID, state: 'draft' }),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    demandPosition: { findFirst: vi.fn().mockResolvedValue(null) },
  };

  const existing = {
    id: ID,
    state: opts.state,
    applicable: opts.state === 'posted',
    storeId: 'store-1',
    agentId: 'agent-1',
    currency: 'UZS',
    organizationId: 'org-1',
    customerOrderId: null,
    sumMinor: 100000n,
    positions: [
      {
        id: 'pos-1',
        assortmentKind: 'product',
        assortmentId: 'prod-1',
        quantity: '2',
        cellId: 'cell-1',
        costMinor: 5000n,
      },
    ],
  };

  const prisma = {
    client: {
      $transaction: vi.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(tx)),
    },
  };

  const service = new SalesReturnService(
    prisma as never,
    { applyDeltas } as never,
    {} as never,
    {} as never,
    { fireForEvent: vi.fn() } as never,
    { emit: vi.fn() } as never,
    { applyDelta: applyBalanceDelta } as never,
  );
  // `transition()` har urinishda holatni QAYTA o'qiydi — testda o'sha
  // o'qishni belgilangan snapshot bilan almashtiramiz.
  vi.spyOn(service, 'findById').mockResolvedValue(existing as never);

  return { service, tx, applyDeltas, applyBalanceDelta };
}

describe("to'langan vozvrat — cancel", () => {
  it("payedSumMinor > 0 bo'lsa 400 va HECH NARSA qaytarilmaydi", async () => {
    const { service, applyDeltas, applyBalanceDelta } = makeHarness({
      state: 'posted',
      payedSumMinor: 50000n,
    });
    await expect(service.transition(ACCOUNT, USER, ID, 'cancel')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    // Qo'riqchi claim'dan KEYIN, lekin delta yozilishidan OLDIN ishlaydi —
    // tranzaksiya orqaga qaytadi, qoldiq va balansga tegilmaydi.
    expect(applyDeltas).not.toHaveBeenCalled();
    expect(applyBalanceDelta).not.toHaveBeenCalled();
  });

  it('xato matni nima qilish kerakligini aytadi (avval to‘lovni bekor qil)', async () => {
    const { service } = makeHarness({ state: 'posted', payedSumMinor: 1n });
    await expect(service.transition(ACCOUNT, USER, ID, 'cancel')).rejects.toThrow(
      /to'lov hujjatini bekor qiling/,
    );
  });

  it("to'lanmagan (0) vozvrat oldingidek bekor qilinadi", async () => {
    const { service, applyDeltas, applyBalanceDelta } = makeHarness({
      state: 'posted',
      payedSumMinor: 0n,
    });
    await service.transition(ACCOUNT, USER, ID, 'cancel');
    expect(applyDeltas).toHaveBeenCalledTimes(1);
    expect(applyBalanceDelta).toHaveBeenCalledTimes(1);
  });
});

describe("to'langan vozvrat — unpost", () => {
  it("payedSumMinor > 0 bo'lsa 400", async () => {
    const { service, applyDeltas } = makeHarness({ state: 'posted', payedSumMinor: 50000n });
    await expect(service.transition(ACCOUNT, USER, ID, 'unpost')).rejects.toThrow(
      /o'tkazishni bekor qilib bo'lmaydi/,
    );
    expect(applyDeltas).not.toHaveBeenCalled();
  });

  it("to'lanmagan vozvrat unpost bo'ladi", async () => {
    const { service, applyDeltas } = makeHarness({ state: 'posted', payedSumMinor: 0n });
    await service.transition(ACCOUNT, USER, ID, 'unpost');
    expect(applyDeltas).toHaveBeenCalledTimes(1);
  });

  /**
   * Qo'riqchi TRANZAKSIYA ICHIDA, holat claim'idan KEYIN o'qiydi: parallel
   * ketayotgan `customer-payout` ham `payedSumMinor`ni optimistik qulf bilan
   * yozadi, ya'ni tranzaksiyadan tashqarida o'qilgan qiymat eskirgan bo'lardi.
   */
  it('qo‘riqchi tranzaksiya ichida, claim‘dan keyin o‘qiydi', async () => {
    const { service, tx } = makeHarness({ state: 'posted', payedSumMinor: 7n });
    await expect(service.transition(ACCOUNT, USER, ID, 'unpost')).rejects.toThrow();
    expect(tx.salesReturn.updateMany).toHaveBeenCalled();
    expect(tx.salesReturn.findFirst).toHaveBeenCalledWith({
      where: { id: ID, accountId: ACCOUNT },
      select: { payedSumMinor: true },
    });
    const claimOrder = tx.salesReturn.updateMany.mock.invocationCallOrder[0] ?? 0;
    const readOrder = tx.salesReturn.findFirst.mock.invocationCallOrder[0] ?? 0;
    expect(readOrder).toBeGreaterThan(claimOrder);
  });
});
