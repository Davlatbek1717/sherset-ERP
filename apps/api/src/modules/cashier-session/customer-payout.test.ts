import { BadRequestException, ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { MoneyService } from '../money/money.service.js';
import { CashierSessionService } from './cashier-session.service.js';
import {
  CASH_OUT_KIND,
  cashOutPrefix,
  planCashOutAuditEvents,
  summarizeCashOut,
} from './pos-cash-out.js';

/**
 * G1 — VOZVRAT PULINI KASSADAN QAYTARISH.
 *
 * Qulflanadigan shartnomalar:
 *  1. to'lov `RetailDrawerCashOut` (`kind='return_payout'`, `salesReturnId`)
 *     yozadi va kassa qoldig'ini KAMAYTIRADI (pul daftari orqali, overdraft
 *     qo'riqchisi bilan) — hujjat shu jadvalda turgani uchun kutilgan-naqd
 *     formulasiga (§8.4) o'z-o'zidan kiradi;
 *  2. CAP: jami to'lovlar `SalesReturn.sumMinor` dan OSHMAYDI — to'liq
 *     to'langan vozvratga ikkinchi to'lov 400, parallel to'lov 409 oladi
 *     (optimistik `payedSumMinor` qulfi); qisman to'lash mumkin;
 *  3. mijoz balansi `+summa` suriladi (post()dagi `−sumMinor` kreditning naqd
 *     bilan yopilishi) — aks holda mijoz IKKI marta olardi;
 *  4. `RETURN_PAYOUT` audit hodisasi yoziladi (§9);
 *  5. faqat POSTED va faqat UZS vozvrat to'lanadi (G1 chegarasi).
 *
 * Harness `drawer-money-wiring.test.ts` naqshi: haqiqiy `MoneyService`
 * (qoldiq siljishi va overdraft haqiqiy tekshiriladi), rollback halol.
 */

const ACC = 'acc-1';
const DESK = 'desk-1';
const SESSION = 'sess-1';
const CASHIER = 'cashier-1';
const RETURN_ID = '33333333-3333-4333-8333-333333333333';

interface ReturnRow {
  id: string;
  name: string;
  state: string;
  currency: string;
  sumMinor: bigint;
  payedSumMinor: bigint;
  agentId: string;
}

interface Store {
  deskBalanceMinor: bigint;
  ret: ReturnRow;
  moneyOps: Array<{ deltaMinor: bigint; documentKind: string; documentId: string }>;
  docsOut: Array<{
    id: string;
    name: string;
    sumMinor: bigint;
    kind: string;
    salesReturnId: string | null;
    agentId: string | null;
  }>;
  auditEvents: Array<{ type: string; docId: string }>;
}

function makeHarness(opts: {
  deskBalanceMinor: bigint;
  ret?: Partial<ReturnRow>;
  /** Poyga simulyatsiyasi: claim har doim 0 qaytaradi. */
  claimAlwaysLoses?: boolean;
}) {
  const store: Store = {
    deskBalanceMinor: opts.deskBalanceMinor,
    ret: {
      id: RETURN_ID,
      name: 'ВП-2026-00007',
      state: 'posted',
      currency: 'UZS',
      sumMinor: 500_000n,
      payedSumMinor: 0n,
      agentId: 'agent-1',
      ...(opts.ret ?? {}),
    },
    moneyOps: [],
    docsOut: [],
    auditEvents: [],
  };
  let seq = 0;
  let docSeq = 0;
  const balance = { applyDelta: vi.fn(async () => undefined) };

  const client = {
    cashierSession: {
      findFirst: async () => ({
        id: SESSION,
        accountId: ACC,
        state: 'open',
        cashierId: CASHIER,
        cashDeskId: DESK,
        organizationId: 'org-1',
        openingCashMinor: 0n,
        cashDesk: { currency: 'UZS' },
      }),
    },
    salesReturn: {
      findFirst: async () => ({
        id: store.ret.id,
        name: store.ret.name,
        state: store.ret.state,
        currency: store.ret.currency,
        sumMinor: store.ret.sumMinor,
        payedSumMinor: store.ret.payedSumMinor,
        agentId: store.ret.agentId,
        agent: { id: store.ret.agentId, name: 'Mijoz Testov' },
      }),
      // Optimistik cap-qulf: `payedSumMinor` AYNAN where'dagi qiymatda
      // bo'lsagina increment o'tadi (Postgres updateMany semantikasi).
      updateMany: async ({
        where,
        data,
      }: {
        where: { payedSumMinor: bigint; state: string };
        data: { payedSumMinor: { increment: bigint } };
      }) => {
        if (
          opts.claimAlwaysLoses ||
          where.payedSumMinor !== store.ret.payedSumMinor ||
          where.state !== store.ret.state
        ) {
          return { count: 0 };
        }
        store.ret.payedSumMinor += data.payedSumMinor.increment;
        return { count: 1 };
      },
    },
    documentSequence: {
      findUnique: async () => ({ value: seq }),
      createMany: async () => ({ count: 1 }),
      update: async () => {
        seq += 1;
        return { value: seq };
      },
    },
    employee: { findUnique: async () => ({ groupId: null, accountId: ACC }) },
    retailSale: { aggregate: async () => ({ _sum: {} }) },
    debtPayment: { aggregate: async () => ({ _sum: {} }) },
    retailDrawerCashIn: { aggregate: async () => ({ _sum: { sumMinor: 0n } }) },
    retailDrawerCashOut: {
      findFirst: async () => null,
      aggregate: async () => ({ _sum: { sumMinor: 0n } }),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        docSeq += 1;
        const doc = {
          id: `out-${docSeq}`,
          name: data.name as string,
          sumMinor: data.sumMinor as bigint,
          kind: data.kind as string,
          salesReturnId: (data.salesReturnId as string | null) ?? null,
          agentId: (data.agentId as string | null) ?? null,
          currency: data.currency as string,
          description: (data.description as string | null) ?? null,
          createdAt: new Date('2026-08-24T00:00:00Z'),
        };
        store.docsOut.push(doc);
        return doc;
      },
    },
    cashierAuditEvent: {
      createMany: async ({ data }: { data: Array<{ type: string; docId: string }> }) => {
        for (const e of data) store.auditEvents.push({ type: e.type, docId: e.docId });
        return { count: data.length };
      },
    },
    cashDesk: {
      findUnique: async () => ({ accountId: ACC, currency: 'UZS' }),
      update: async ({ data }: { data: { balanceMinor: { increment: bigint } } }) => {
        store.deskBalanceMinor += data.balanceMinor.increment;
        return { balanceMinor: store.deskBalanceMinor };
      },
    },
    moneyOperation: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        store.moneyOps.push({
          deltaMinor: data.deltaMinor as bigint,
          documentKind: data.documentKind as string,
          documentId: data.documentId as string,
        });
        return { id: `mo-${store.moneyOps.length}` };
      },
    },
    // Rollback HALOL: vozvratning payedSumMinor holati ham qaytadi.
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const snapshot = {
        deskBalanceMinor: store.deskBalanceMinor,
        payed: store.ret.payedSumMinor,
        moneyOps: store.moneyOps.length,
        docsOut: store.docsOut.length,
        auditEvents: store.auditEvents.length,
        balanceCalls: balance.applyDelta.mock.calls.length,
      };
      try {
        return await fn(client);
      } catch (e) {
        store.deskBalanceMinor = snapshot.deskBalanceMinor;
        store.ret.payedSumMinor = snapshot.payed;
        store.moneyOps.length = snapshot.moneyOps;
        store.docsOut.length = snapshot.docsOut;
        store.auditEvents.length = snapshot.auditEvents;
        throw e;
      }
    },
  };

  const prisma = { client } as never;
  const svc = new CashierSessionService(prisma, new MoneyService(prisma), balance as never);
  return { svc, store, balance };
}

describe('customerPayout — pul izi to`rt joyda birdan', () => {
  it('to`liq to`lov: hujjat + kassa qoldig`i + payedSumMinor + balans + audit', async () => {
    const { svc, store, balance } = makeHarness({ deskBalanceMinor: 1_000_000n });
    const res = (await svc.customerPayout(ACC, CASHIER, SESSION, {
      salesReturnId: RETURN_ID,
    })) as { id: string; name: string; remainingMinor: string; auditTypes: string[] };

    // Hujjat: return_payout, vozvratga va mijozga bog'langan, ВВ- raqami.
    expect(store.docsOut).toHaveLength(1);
    expect(store.docsOut[0]).toMatchObject({
      kind: 'return_payout',
      salesReturnId: RETURN_ID,
      agentId: 'agent-1',
    });
    expect(store.docsOut[0]?.name.startsWith('ВВ-')).toBe(true);

    // Kassa qoldig'i kamaydi, daftar qatori hujjatga bog'liq.
    expect(store.deskBalanceMinor).toBe(500_000n);
    expect(store.moneyOps[0]).toMatchObject({
      documentKind: 'drawer_cash_out',
      deltaMinor: -500_000n,
      documentId: res.id,
    });

    // Cap manbasi: vozvrat to'liq to'landi, qolgani 0.
    expect(store.ret.payedSumMinor).toBe(500_000n);
    expect(res.remainingMinor).toBe('0');

    // Mijoz balansi +summa (post()dagi −sumMinor kredit yopildi).
    expect(balance.applyDelta).toHaveBeenCalledTimes(1);
    const call = balance.applyDelta.mock.calls[0] as unknown[];
    expect(call[2]).toBe('agent-1');
    expect(call[3]).toBe('UZS');
    expect(call[4]).toBe(500_000n);
    expect(call[5]).toMatchObject({ docType: 'returnPayout', docId: res.id });

    // Audit izi (§9).
    expect(store.auditEvents.map((e) => e.type)).toContain('RETURN_PAYOUT');
  });

  it('QISMAN to`lash mumkin — qolgani aniq qaytadi', async () => {
    const { svc, store } = makeHarness({ deskBalanceMinor: 1_000_000n });
    const res = (await svc.customerPayout(ACC, CASHIER, SESSION, {
      salesReturnId: RETURN_ID,
      sumMinor: '200000',
    })) as { remainingMinor: string };
    expect(store.ret.payedSumMinor).toBe(200_000n);
    expect(res.remainingMinor).toBe('300000');
    expect(store.deskBalanceMinor).toBe(800_000n);
  });

  it('CAP: to`liq to`langan vozvratga ikkinchi to`lov 400 oladi', async () => {
    const { svc, store } = makeHarness({
      deskBalanceMinor: 1_000_000n,
      ret: { payedSumMinor: 500_000n },
    });
    await expect(
      svc.customerPayout(ACC, CASHIER, SESSION, { salesReturnId: RETURN_ID }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(store.docsOut).toHaveLength(0);
    expect(store.deskBalanceMinor).toBe(1_000_000n);
  });

  it('CAP: qolgan qaytimdan KATTA summa 400 oladi', async () => {
    const { svc } = makeHarness({
      deskBalanceMinor: 1_000_000n,
      ret: { payedSumMinor: 400_000n },
    });
    await expect(
      svc.customerPayout(ACC, CASHIER, SESSION, { salesReturnId: RETURN_ID, sumMinor: '200000' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('POYGA: parallel to`lov 409 oladi va HECH NARSA yozilmaydi', async () => {
    const { svc, store, balance } = makeHarness({
      deskBalanceMinor: 1_000_000n,
      claimAlwaysLoses: true,
    });
    await expect(
      svc.customerPayout(ACC, CASHIER, SESSION, { salesReturnId: RETURN_ID }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(store.docsOut).toHaveLength(0);
    expect(store.moneyOps).toHaveLength(0);
    expect(store.deskBalanceMinor).toBe(1_000_000n);
    expect(balance.applyDelta).not.toHaveBeenCalled();
  });

  it('post bo`lmagan (draft) vozvrat uchun pul berilmaydi', async () => {
    const { svc } = makeHarness({ deskBalanceMinor: 1_000_000n, ret: { state: 'draft' } });
    await expect(
      svc.customerPayout(ACC, CASHIER, SESSION, { salesReturnId: RETURN_ID }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('G1 chegarasi: valyutali (USD) vozvrat OCHIQ 400 oladi', async () => {
    const { svc } = makeHarness({ deskBalanceMinor: 1_000_000n, ret: { currency: 'USD' } });
    await expect(
      svc.customerPayout(ACC, CASHIER, SESSION, { salesReturnId: RETURN_ID }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('yashiqda YO`Q pulni qaytarib bo`lmaydi — rollback payedSumMinor`ni ham qaytaradi', async () => {
    const { svc, store, balance } = makeHarness({ deskBalanceMinor: 100_000n });
    await expect(
      svc.customerPayout(ACC, CASHIER, SESSION, { salesReturnId: RETURN_ID }),
    ).rejects.toBeInstanceOf(BadRequestException);
    // «Yozildi-yu daftarda yo'q» kasalligi yo'q: hammasi orqaga qaytdi.
    expect(store.ret.payedSumMinor).toBe(0n);
    expect(store.docsOut).toHaveLength(0);
    expect(store.moneyOps).toHaveLength(0);
    expect(store.deskBalanceMinor).toBe(100_000n);
    void balance;
  });
});

describe('unpaidReturns — POS mijoz profili bloki', () => {
  it('faqat to`lanmagan qoladi; valyutali ko`rinadi lekin jamiga kirmaydi', async () => {
    const rows = [
      // to'liq to'langan — ro'yxatga TUSHMAYDI
      {
        id: 'r1',
        name: 'ВП-1',
        moment: new Date(),
        currency: 'UZS',
        sumMinor: 100n,
        payedSumMinor: 100n,
      },
      // qisman — qolgan 300
      {
        id: 'r2',
        name: 'ВП-2',
        moment: new Date(),
        currency: 'UZS',
        sumMinor: 500n,
        payedSumMinor: 200n,
      },
      // umuman to'lanmagan — 1000
      {
        id: 'r3',
        name: 'ВП-3',
        moment: new Date(),
        currency: 'UZS',
        sumMinor: 1000n,
        payedSumMinor: 0n,
      },
      // valyutali — ko'rinadi, payable=false, jamiga kirmaydi
      {
        id: 'r4',
        name: 'ВП-4',
        moment: new Date(),
        currency: 'USD',
        sumMinor: 700n,
        payedSumMinor: 0n,
      },
    ];
    const client = { salesReturn: { findMany: async () => rows } };
    const svc = new CashierSessionService(
      { client } as never,
      undefined as never,
      undefined as never,
    );
    const res = await svc.unpaidReturns(ACC, {
      agentId: '44444444-4444-4444-8444-444444444444',
    });
    expect(res.items.map((i) => i.id)).toEqual(['r2', 'r3', 'r4']);
    expect(res.items[0]).toMatchObject({ remainingMinor: '300', payable: true });
    expect(res.items[2]).toMatchObject({ payable: false });
    expect(res.totalRemainingMinor).toBe('1300');
  });
});

describe('pos-cash-out sof moduli — return_payout tasnifi', () => {
  it('Z-hisobot guruhlashda vozvrat puli O`Z qatori (xarajatga aralashmaydi)', () => {
    const s = summarizeCashOut([
      { kind: 'expense', sumMinor: 100n, expenseItemId: 'e1', expenseItemName: 'Kommunal' },
      { kind: 'collection', sumMinor: 200n },
      { kind: 'return_payout', sumMinor: 300n },
      { kind: 'other', sumMinor: 400n },
    ]);
    expect(s.returnPayoutMinor).toBe(300n);
    expect(s.expenseMinor).toBe(100n);
    expect(s.collectionMinor).toBe(200n);
    expect(s.otherMinor).toBe(400n);
    // Jami — smena naqdidan chiqqan HAMMA pul (§8.4 formulasi bilan mos).
    expect(s.totalMinor).toBe(1000n);
  });

  it('hujjat raqami ВВ- prefiksi bilan (turi nomidan ko`rinadi)', () => {
    expect(cashOutPrefix(CASH_OUT_KIND.returnPayout, 2026)).toBe('ВВ-2026-');
  });

  it('RETURN_PAYOUT audit hodisasi vozvrat va mijoz nomini MUZLATIB yozadi', () => {
    const events = planCashOutAuditEvents({
      docId: 'd1',
      docName: 'ВВ-2026-00001',
      kind: CASH_OUT_KIND.returnPayout,
      sumMinor: 500n,
      salesReturnId: 'r1',
      salesReturnName: 'ВП-2026-00007',
      agentId: 'a1',
      agentName: 'Mijoz Testov',
      cashBeforeMinor: 1_000n,
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'RETURN_PAYOUT', docId: 'd1' });
    expect(events[0]?.payload).toMatchObject({
      salesReturnName: 'ВП-2026-00007',
      agentName: 'Mijoz Testov',
    });
  });

  it('kutilgan naqddan ORTIQ to`lovda CASH_OVERDRAWN ham rejalanadi', () => {
    const events = planCashOutAuditEvents({
      docId: 'd1',
      docName: 'ВВ-2026-00001',
      kind: CASH_OUT_KIND.returnPayout,
      sumMinor: 2_000n,
      cashBeforeMinor: 1_000n,
    });
    expect(events.map((e) => e.type)).toEqual(['RETURN_PAYOUT', 'CASH_OVERDRAWN']);
  });
});
