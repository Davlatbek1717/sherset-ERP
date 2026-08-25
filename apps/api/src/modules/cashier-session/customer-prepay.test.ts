import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { MoneyService } from '../money/money.service.js';
import { CashierSessionService } from './cashier-session.service.js';

/**
 * A1 — KASSADA MIJOZDAN AVANS (OLDINDAN TO'LOV) QABUL QILISH.
 *
 * Egasining shikoyati: «mijozlar bizga oldindan pul berib qo'yishadi, keyin
 * tovar olishadi — shu mijozlar bilan ishlay olmayapmiz».
 *
 * Qulflanadigan shartnomalar:
 *  1. hujjat `RetailDrawerCashIn` (`kind='customer_prepay'`, `agentId`)
 *     yozadi va kassa qoldig'ini OSHIRADI (pul daftari orqali) — hujjat shu
 *     jadvalda turgani uchun kutilgan-naqd formulasiga (§8.4) o'z-o'zidan
 *     kiradi;
 *  2. mijoz balansi `−summa` suriladi («biz mijozga qarzdormiz»);
 *  3. 🔴 **`Debt` reyestriga TEGILMAYDI** (reja invariant 4) — avans qarz
 *     emas, undirish ro'yxatiga tushmaydi;
 *  4. `CUSTOMER_PREPAY` audit hodisasi yoziladi (§9);
 *  5. yopiq/begona smena, so'm bo'lmagan kassa, nol/manfiy summa, noma'lum
 *     mijoz — hammasi OCHIQ rad etiladi va HECH NARSA yozilmaydi;
 *  6. poyga: ikki parallel avans — ikki hujjat, ikki delta, hisob to'g'ri.
 *
 * Harness `customer-payout.test.ts` naqshi: haqiqiy `MoneyService` (qoldiq
 * siljishi haqiqiy tekshiriladi), rollback halol.
 */

const ACC = 'acc-1';
const DESK = 'desk-1';
const SESSION = 'sess-1';
const CASHIER = 'cashier-1';
const CP = '55555555-5555-4555-8555-555555555555';

interface Store {
  deskBalanceMinor: bigint;
  moneyOps: Array<{ deltaMinor: bigint; documentKind: string; documentId: string }>;
  docsIn: Array<{
    id: string;
    name: string;
    sumMinor: bigint;
    kind: string;
    agentId: string | null;
  }>;
  auditEvents: Array<{ type: string; docId: string; payload: Record<string, unknown> }>;
  /** 🔴 Reyestrga tegilganini tutish uchun — bu ro'yxat BO'SH qolishi SHART. */
  debtWrites: string[];
}

function makeHarness(
  opts: {
    deskBalanceMinor?: bigint;
    deskCurrency?: string;
    sessionState?: string;
    sessionCashierId?: string;
    /** `null` — kontragent topilmaydi. */
    agentName?: string | null;
    /** `null` — balans qatori YO'Q (o'lchanmagan). */
    balanceBeforeMinor?: bigint | null;
  } = {},
) {
  const store: Store = {
    deskBalanceMinor: opts.deskBalanceMinor ?? 1_000_000n,
    moneyOps: [],
    docsIn: [],
    auditEvents: [],
    debtWrites: [],
  };
  let seq = 0;
  let docSeq = 0;
  const balance = { applyDelta: vi.fn(async () => undefined) };
  const deskCurrency = opts.deskCurrency ?? 'UZS';

  const debtTrap = (label: string) => async () => {
    store.debtWrites.push(label);
    return null;
  };

  const client = {
    cashierSession: {
      findFirst: async () => ({
        id: SESSION,
        accountId: ACC,
        state: opts.sessionState ?? 'open',
        cashierId: opts.sessionCashierId ?? CASHIER,
        cashDeskId: DESK,
        organizationId: 'org-1',
        openingCashMinor: 0n,
        cashDesk: { currency: deskCurrency },
      }),
    },
    counterparty: {
      findFirst: async () =>
        opts.agentName === null ? null : { id: CP, name: opts.agentName ?? 'Mijoz Testov' },
    },
    counterpartyBalance: {
      findFirst: async () =>
        opts.balanceBeforeMinor === undefined || opts.balanceBeforeMinor === null
          ? null
          : { balanceMinor: opts.balanceBeforeMinor },
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
    retailDrawerCashIn: {
      findFirst: async () => null,
      aggregate: async () => ({ _sum: { sumMinor: 0n } }),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        docSeq += 1;
        const doc = {
          id: `in-${docSeq}`,
          name: data.name as string,
          sumMinor: data.sumMinor as bigint,
          kind: data.kind as string,
          agentId: (data.agentId as string | null) ?? null,
          currency: data.currency as string,
          description: (data.description as string | null) ?? null,
          createdAt: new Date('2026-08-25T00:00:00Z'),
        };
        store.docsIn.push(doc);
        return doc;
      },
    },
    // 🔴 QARZ REYESTRI TUZOG'I: bu delegatlarning HAR chaqirig'i yoziladi.
    // Avans yo'li ularga tegmasligi SHART (reja invariant 4).
    debt: {
      create: debtTrap('debt.create'),
      createMany: debtTrap('debt.createMany'),
      update: debtTrap('debt.update'),
      updateMany: debtTrap('debt.updateMany'),
      findFirst: debtTrap('debt.findFirst'),
      findMany: debtTrap('debt.findMany'),
    },
    debtNote: { create: debtTrap('debtNote.create') },
    cashierAuditEvent: {
      createMany: async ({
        data,
      }: { data: Array<{ type: string; docId: string; payload: Record<string, unknown> }> }) => {
        for (const e of data)
          store.auditEvents.push({ type: e.type, docId: e.docId, payload: e.payload });
        return { count: data.length };
      },
    },
    cashDesk: {
      findUnique: async () => ({ accountId: ACC, currency: deskCurrency }),
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
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const snapshot = {
        deskBalanceMinor: store.deskBalanceMinor,
        moneyOps: store.moneyOps.length,
        docsIn: store.docsIn.length,
        auditEvents: store.auditEvents.length,
      };
      try {
        return await fn(client);
      } catch (e) {
        store.deskBalanceMinor = snapshot.deskBalanceMinor;
        store.moneyOps.length = snapshot.moneyOps;
        store.docsIn.length = snapshot.docsIn;
        store.auditEvents.length = snapshot.auditEvents;
        throw e;
      }
    },
  };

  const prisma = { client } as never;
  const svc = new CashierSessionService(prisma, new MoneyService(prisma), balance as never);
  return { svc, store, balance };
}

describe('customerPrepay — pul izi to`rt joyda birdan', () => {
  it('hujjat + kassa qoldig`i + mijoz balansi + audit', async () => {
    const { svc, store, balance } = makeHarness({
      deskBalanceMinor: 500_000n,
      balanceBeforeMinor: 0n,
    });
    const res = (await svc.customerPrepay(ACC, CASHIER, SESSION, {
      counterpartyId: CP,
      sumMinor: '100000',
    })) as { id: string; name: string; balanceAfterMinor: string | null; auditTypes: string[] };

    // Hujjat: customer_prepay, mijozga bog'langan, АВ- raqami.
    expect(store.docsIn).toHaveLength(1);
    expect(store.docsIn[0]).toMatchObject({ kind: 'customer_prepay', agentId: CP });
    expect(store.docsIn[0]?.name.startsWith('АВ-')).toBe(true);

    // Kassa qoldig'i OSHDI, daftar qatori hujjatga bog'liq.
    expect(store.deskBalanceMinor).toBe(600_000n);
    expect(store.moneyOps).toHaveLength(1);
    expect(store.moneyOps[0]).toMatchObject({
      documentKind: 'drawer_cash_in',
      deltaMinor: 100_000n,
      documentId: res.id,
    });

    // Mijoz balansi −summa: biz unga qarzdormiz.
    expect(balance.applyDelta).toHaveBeenCalledTimes(1);
    const call = balance.applyDelta.mock.calls[0] as unknown[];
    expect(call[2]).toBe(CP);
    expect(call[3]).toBe('UZS');
    expect(call[4]).toBe(-100_000n);
    expect(call[5]).toMatchObject({ docType: 'customerPrepay', docId: res.id });

    // Audit izi (§9) va kassirga qaytadigan yakuniy qoldiq.
    expect(res.auditTypes).toEqual(['CUSTOMER_PREPAY']);
    expect(store.auditEvents[0]?.payload).toMatchObject({
      counterpartyId: CP,
      counterpartyName: 'Mijoz Testov',
      sumMinor: '100000',
      balanceBeforeMinor: '0',
    });
    expect(res.balanceAfterMinor).toBe('-100000');
  });

  it('🔴 INVARIANT 4 — `Debt` reyestriga BIR MARTA ham tegilmaydi', async () => {
    const { svc, store } = makeHarness({ balanceBeforeMinor: 0n });
    await svc.customerPrepay(ACC, CASHIER, SESSION, { counterpartyId: CP, sumMinor: '100000' });
    expect(store.debtWrites).toEqual([]);
  });

  it('QARZDOR mijozning avansi ham qabul qilinadi — balans qarzni yeydi', async () => {
    // Balans +300k (mijoz qarzdor), avans 100k ⇒ qarz 200k ga tushadi.
    const { svc, store, balance } = makeHarness({ balanceBeforeMinor: 300_000n });
    const res = (await svc.customerPrepay(ACC, CASHIER, SESSION, {
      counterpartyId: CP,
      sumMinor: '100000',
    })) as { balanceAfterMinor: string | null };
    expect((balance.applyDelta.mock.calls[0] as unknown[])[4]).toBe(-100_000n);
    expect(res.balanceAfterMinor).toBe('200000');
    // Qarz kamaygani REYESTRDA emas, BALANSDA aks etadi (invariant 4).
    expect(store.debtWrites).toEqual([]);
  });

  it('balans O`LCHANMAGAN (qator yo`q) — `null`, 0 EMAS', async () => {
    const { svc, store } = makeHarness({ balanceBeforeMinor: null });
    const res = (await svc.customerPrepay(ACC, CASHIER, SESSION, {
      counterpartyId: CP,
      sumMinor: '100000',
    })) as { balanceAfterMinor: string | null };
    expect(res.balanceAfterMinor).toBeNull();
    expect(store.auditEvents[0]?.payload.balanceBeforeMinor).toBeNull();
    // Pul yo'li BARIBIR to'liq ishlaydi — o'lchanmagan balans to'siq emas.
    expect(store.deskBalanceMinor).toBe(1_100_000n);
  });

  it('izoh hujjatga ham, auditga ham tushadi', async () => {
    const { svc, store } = makeHarness({ balanceBeforeMinor: 0n });
    await svc.customerPrepay(ACC, CASHIER, SESSION, {
      counterpartyId: CP,
      sumMinor: '100000',
      description: 'ertaga kabel oladi',
    });
    expect(store.auditEvents[0]?.payload.description).toBe('ertaga kabel oladi');
  });
});

describe('customerPrepay — qo`riqchilar (hech narsa yozilmaydi)', () => {
  const nothingWritten = (store: Store, deskBefore: bigint) => {
    expect(store.docsIn).toHaveLength(0);
    expect(store.moneyOps).toHaveLength(0);
    expect(store.auditEvents).toHaveLength(0);
    expect(store.deskBalanceMinor).toBe(deskBefore);
    expect(store.debtWrites).toEqual([]);
  };

  it('YOPIQ smenaga 400', async () => {
    const { svc, store, balance } = makeHarness({ sessionState: 'closed' });
    await expect(
      svc.customerPrepay(ACC, CASHIER, SESSION, { counterpartyId: CP, sumMinor: '100000' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    nothingWritten(store, 1_000_000n);
    expect(balance.applyDelta).not.toHaveBeenCalled();
  });

  it('BEGONA smenaga 400 (smenani ochgan kassir emas)', async () => {
    const { svc, store } = makeHarness({ sessionCashierId: 'boshqa-kassir' });
    await expect(
      svc.customerPrepay(ACC, CASHIER, SESSION, { counterpartyId: CP, sumMinor: '100000' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    nothingWritten(store, 1_000_000n);
  });

  it('A1 chegarasi: SO`M bo`lmagan kassada OCHIQ 400', async () => {
    const { svc, store } = makeHarness({ deskCurrency: 'USD' });
    await expect(
      svc.customerPrepay(ACC, CASHIER, SESSION, { counterpartyId: CP, sumMinor: '100000' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    nothingWritten(store, 1_000_000n);
  });

  it('noma`lum mijoz — 404', async () => {
    const { svc, store } = makeHarness({ agentName: null });
    await expect(
      svc.customerPrepay(ACC, CASHIER, SESSION, { counterpartyId: CP, sumMinor: '100000' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    nothingWritten(store, 1_000_000n);
  });

  it('NOL va MANFIY summa rad etiladi', async () => {
    for (const sumMinor of ['0', '-100', '000']) {
      const { svc, store } = makeHarness({ balanceBeforeMinor: 0n });
      await expect(
        svc.customerPrepay(ACC, CASHIER, SESSION, { counterpartyId: CP, sumMinor }),
      ).rejects.toThrow();
      nothingWritten(store, 1_000_000n);
    }
  });

  it('mijozsiz so`rov rad etiladi (schema darajasida)', async () => {
    const { svc, store } = makeHarness();
    await expect(
      svc.customerPrepay(ACC, CASHIER, SESSION, { sumMinor: '100000' }),
    ).rejects.toThrow();
    nothingWritten(store, 1_000_000n);
  });
});

describe('customerPrepay — POYGA (ikki parallel so`rov)', () => {
  it('ikki hujjat, ikki delta, kassa qoldig`i AYNAN yig`indisiga oshadi', async () => {
    const { svc, store, balance } = makeHarness({
      deskBalanceMinor: 0n,
      balanceBeforeMinor: 0n,
    });
    await Promise.all([
      svc.customerPrepay(ACC, CASHIER, SESSION, { counterpartyId: CP, sumMinor: '100000' }),
      svc.customerPrepay(ACC, CASHIER, SESSION, { counterpartyId: CP, sumMinor: '250000' }),
    ]);
    expect(store.docsIn).toHaveLength(2);
    // Hujjat raqamlari TAKRORLANMAYDI (allocateDocumentNumber).
    expect(new Set(store.docsIn.map((d) => d.name)).size).toBe(2);
    expect(store.moneyOps).toHaveLength(2);
    expect(store.deskBalanceMinor).toBe(350_000n);
    expect(balance.applyDelta).toHaveBeenCalledTimes(2);
    const deltas = balance.applyDelta.mock.calls.map((c) => (c as unknown[])[4]);
    expect(deltas.reduce((a, b) => (a as bigint) + (b as bigint), 0n)).toBe(-350_000n);
    expect(store.debtWrites).toEqual([]);
  });
});

describe('drawerCashIn — «Внесение» tasniflandi, xulqi O`ZGARMADI', () => {
  it('kind=topup, kontragent YO`Q, balansga TEGILMAYDI', async () => {
    const { svc, store, balance } = makeHarness({ deskBalanceMinor: 0n });
    await svc.drawerCashIn(ACC, CASHIER, SESSION, { sumMinor: '70000' });
    expect(store.docsIn).toHaveLength(1);
    expect(store.docsIn[0]).toMatchObject({ kind: 'topup', agentId: null });
    expect(store.docsIn[0]?.name.startsWith('ВН-')).toBe(true);
    expect(store.deskBalanceMinor).toBe(70_000n);
    // 🔴 Bu A1 ning ASOSIY regressiya-qo'riqchisi: «Внесение» hech qachon
    // kontragent balansiga tegmagan va tegmasligi kerak.
    expect(balance.applyDelta).not.toHaveBeenCalled();
    expect(store.auditEvents).toHaveLength(0);
  });
});

// ── KOD SHAKLI QO'RIQCHILARI (`foreign-cash-desk-guard.test.ts` uslubi) ─────

const SERVICE_SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'cashier-session.service.ts'),
  'utf8',
);

/** Izohlar olib tashlangan kod — «izohda yozilgan» dalil bo'lmasin. */
const CODE = SERVICE_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

function bodyOf(method: string): string {
  const start = CODE.indexOf(`async ${method}(`);
  expect(start, `${method} topilmadi`).toBeGreaterThan(-1);
  // Keyingi metod e'lonigacha — «tanasi» sifatida yetarli tor oyna.
  const rest = CODE.slice(start + 1);
  const next = rest.search(/\n {2}(?:async |private |\/\*\*)/);
  return next === -1 ? rest : rest.slice(0, next);
}

describe('kod shakli — avans yo`li nimaga TEGMAYDI', () => {
  it('`customerPrepay` tanasida `debt` yoki `debtNote` yozuvchisi YO`Q', () => {
    const body = bodyOf('customerPrepay');
    expect(body).not.toMatch(/\btx\.debt\b/);
    expect(body).not.toMatch(/\btx\.debtNote\b/);
    expect(body).not.toMatch(/writeSaleDebtRegistryRow|moveSaleDebtRegistryRow/);
  });

  it('`customerPrepay` balansga MANFIY delta yozadi (ishora chalkashmasin)', () => {
    const body = bodyOf('customerPrepay');
    expect(body).toMatch(/\bbalance\s*\.\s*applyDelta\(/);
    expect(body).toMatch(/applyDelta\([^)]*,\s*-sumMinor\s*,/);
  });

  it("`customerPrepay` yashiq daftariga `kind: 'in'` bilan yozadi", () => {
    const body = bodyOf('customerPrepay');
    expect(body).toMatch(/drawerMoneyDeltas\(\{\s*kind: 'in'/);
  });

  it('`drawerCashIn` («Внесение») kontragent balansiga UMUMAN tegmaydi', () => {
    // ⚠️ `applyDeltas` (pul daftari) BOR va bo'lishi ham kerak — taqiq
    // faqat KONTRAGENT balansiga: `this.balance.applyDelta`.
    const body = bodyOf('drawerCashIn');
    expect(body).not.toMatch(/\bbalance\s*\.\s*applyDelta\b/);
    expect(body).toMatch(/money\s*\.\s*applyDeltas\b/);
  });

  it('avans hujjati AYNAN `retailDrawerCashIn` jadvaliga tushadi (§8.4 formulasi)', () => {
    // Yangi jadval ochilsa kutilgan naqd formulasi uni ko'rmasdi — §100 bug'i.
    expect(bodyOf('customerPrepay')).toMatch(/tx\.retailDrawerCashIn\.create/);
  });
});
