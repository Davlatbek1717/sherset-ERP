import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { MoneyService } from '../money/money.service.js';
import { CashierSessionService } from './cashier-session.service.js';

/**
 * A3 — MIJOZNING SARFLANMAGAN AVANSINI NAQD QAYTARISH.
 *
 * Egasining oqimi: mijoz avans qoldirgan (A1), bir qismini tovarga sarflagan
 * (A2), qolganini naqd olib ketmoqchi. A3 gacha kassirda bu yo'l YO'Q edi —
 * tuzatish admin ekranlaridan (`/cash-out` + `CounterpartyAdjustment`) ikki
 * hujjat bilan qilinardi (A1 hisobotining STORNO qarori).
 *
 * Qulflanadigan shartnomalar:
 *  1. hujjat `RetailDrawerCashOut` (`kind='prepay_refund'`, `agentId`) yozadi
 *     va kassa qoldig'ini KAMAYTIRADI (pul daftari orqali) — hujjat shu
 *     jadvalda turgani uchun kutilgan-naqd formulasiga (§8.4) o'z-o'zidan
 *     kiradi (`drawerOutMinor`);
 *  2. mijoz balansi `+summa` suriladi (A1 yozgan `−summa` ning teskarisi);
 *  3. 🔴 CAP — mijozning MAVJUD avansi (`prepayAvailable`), balans
 *     `FOR UPDATE` bilan QULFLANADI: bu yerda qaror balansning oldingi
 *     qiymatiga BOG'LIQ (A1 da bog'liq emas edi);
 *  4. 🔴 **`Debt` reyestriga TEGILMAYDI** (reja invariant 4);
 *  5. `PREPAY_REFUND` audit hodisasi (§9), yashiqda pul yetmasa qo'shimcha
 *     `CASH_OVERDRAWN` signali (G1 naqshi);
 *  6. avansi yo'q mijoz, avansdan ortiq summa, yopiq/begona smena, USD kassa,
 *     noma'lum mijoz — hammasi OCHIQ rad etiladi va HECH NARSA yozilmaydi.
 *
 * Harness `customer-prepay.test.ts` + `customer-payout.test.ts` naqshi:
 * haqiqiy `MoneyService`, balans HOLATLI (A2 sabog'i — statik mock qulf va
 * cap mantig'ini umuman o'lchamaydi).
 */

const ACC = 'acc-1';
const DESK = 'desk-1';
const SESSION = 'sess-1';
const CASHIER = 'cashier-1';
const CP = '55555555-5555-4555-8555-555555555555';

interface Store {
  deskBalanceMinor: bigint;
  /** Kontragent balansi — HOLATLI: `applyDelta` uni siljitadi. */
  cpBalanceMinor: bigint | null;
  moneyOps: Array<{ deltaMinor: bigint; documentKind: string; documentId: string }>;
  docsOut: Array<{
    id: string;
    name: string;
    sumMinor: bigint;
    kind: string;
    agentId: string | null;
  }>;
  auditEvents: Array<{ type: string; docId: string; payload: Record<string, unknown> }>;
  /** 🔴 Reyestrga tegilganini tutish uchun — BO'SH qolishi SHART. */
  debtWrites: string[];
  /** Qulf so'rovlari — `FOR UPDATE` rostdan olinganini o'lchash uchun. */
  lockQueries: string[];
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
    /**
     * Smenaning KUTILGAN NAQDI (`collectCashInputs`). Kassa QOLDIG'IDAN
     * boshqa raqam: yashiqda o'tgan smenalardan pul turgan bo'lishi mumkin.
     * Berilmasa kassa qoldig'iga tenglashtiriladi.
     */
    shiftCashInMinor?: bigint;
  } = {},
) {
  const store: Store = {
    deskBalanceMinor: opts.deskBalanceMinor ?? 1_000_000n,
    cpBalanceMinor: opts.balanceBeforeMinor === undefined ? -100_000n : opts.balanceBeforeMinor,
    moneyOps: [],
    docsOut: [],
    auditEvents: [],
    debtWrites: [],
    lockQueries: [],
  };
  let seq = 0;
  let docSeq = 0;
  const deskCurrency = opts.deskCurrency ?? 'UZS';

  // Balans HOLATLI: qulf o'sha ondagi qiymatni ko'radi (Postgres qanday
  // qilsa, shunday). Statik mock cap'ni umuman o'lchamasdi — A2 sabog'i.
  const balance = {
    applyDelta: vi.fn(async (..._args: unknown[]) => {
      const delta = _args[4] as bigint;
      store.cpBalanceMinor = (store.cpBalanceMinor ?? 0n) + delta;
      return undefined;
    }),
  };

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
    // `collectCashInputs` (kutilgan naqd — «yashiqda yo'q pul» signali uchun).
    retailSale: { aggregate: async () => ({ _sum: {} }) },
    debtPayment: { aggregate: async () => ({ _sum: {} }) },
    retailDrawerCashIn: {
      aggregate: async () => ({
        _sum: { sumMinor: opts.shiftCashInMinor ?? store.deskBalanceMinor },
      }),
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
          agentId: (data.agentId as string | null) ?? null,
          currency: data.currency as string,
          description: (data.description as string | null) ?? null,
          createdAt: new Date('2026-08-25T00:00:00Z'),
        };
        store.docsOut.push(doc);
        return doc;
      },
    },
    // 🔴 QARZ REYESTRI TUZOG'I — avans yo'li bularga tegmasligi SHART.
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
    // `FOR UPDATE` qulfi — o'sha ondagi HOLATLI qiymatni qaytaradi.
    $queryRaw: async (strings: TemplateStringsArray) => {
      store.lockQueries.push(strings.join('?'));
      return store.cpBalanceMinor === null ? [] : [{ balance_minor: store.cpBalanceMinor }];
    },
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const snapshot = {
        deskBalanceMinor: store.deskBalanceMinor,
        cpBalanceMinor: store.cpBalanceMinor,
        moneyOps: store.moneyOps.length,
        docsOut: store.docsOut.length,
        auditEvents: store.auditEvents.length,
      };
      try {
        return await fn(client);
      } catch (e) {
        store.deskBalanceMinor = snapshot.deskBalanceMinor;
        store.cpBalanceMinor = snapshot.cpBalanceMinor;
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

describe('customerPrepayRefund — pul izi to`rt joyda birdan', () => {
  it('hujjat + kassa qoldig`i + mijoz balansi + audit', async () => {
    const { svc, store, balance } = makeHarness({
      deskBalanceMinor: 500_000n,
      balanceBeforeMinor: -100_000n,
    });
    const res = (await svc.customerPrepayRefund(ACC, CASHIER, SESSION, {
      counterpartyId: CP,
      sumMinor: '40000',
    })) as { id: string; name: string; remainingPrepayMinor: string; auditTypes: string[] };

    // Hujjat: prepay_refund, mijozga bog'langan, ВА- raqami (АВ- ning jufti).
    expect(store.docsOut).toHaveLength(1);
    expect(store.docsOut[0]).toMatchObject({ kind: 'prepay_refund', agentId: CP });
    expect(store.docsOut[0]?.name.startsWith('ВА-')).toBe(true);

    // Kassa qoldig'i KAMAYDI, daftar qatori hujjatga bog'liq.
    expect(store.deskBalanceMinor).toBe(460_000n);
    expect(store.moneyOps).toHaveLength(1);
    expect(store.moneyOps[0]).toMatchObject({
      documentKind: 'drawer_cash_out',
      deltaMinor: -40_000n,
      documentId: res.id,
    });

    // Mijoz balansi +summa: bizning qarzimiz kamaydi (−100k → −60k).
    expect(balance.applyDelta).toHaveBeenCalledTimes(1);
    const call = balance.applyDelta.mock.calls[0] as unknown[];
    expect(call[2]).toBe(CP);
    expect(call[3]).toBe('UZS');
    expect(call[4]).toBe(40_000n);
    expect(call[5]).toMatchObject({ docType: 'customerPrepayRefund', docId: res.id });
    expect(store.cpBalanceMinor).toBe(-60_000n);

    // Audit izi (§9) va kassirga qaytadigan qoldiq.
    expect(res.auditTypes).toEqual(['PREPAY_REFUND']);
    expect(store.auditEvents[0]?.payload).toMatchObject({
      agentId: CP,
      agentName: 'Mijoz Testov',
      sumMinor: '40000',
      balanceBeforeMinor: '-100000',
    });
    expect(res.remainingPrepayMinor).toBe('60000');
  });

  it('summa BERILMASA — avans TO`LIQ qaytariladi, balans NOLGA keladi', async () => {
    const { svc, store } = makeHarness({ balanceBeforeMinor: -250_000n });
    const res = (await svc.customerPrepayRefund(ACC, CASHIER, SESSION, {
      counterpartyId: CP,
    })) as { sumMinor: string; remainingPrepayMinor: string };
    expect(res.sumMinor).toBe('250000');
    expect(res.remainingPrepayMinor).toBe('0');
    expect(store.cpBalanceMinor).toBe(0n);
  });

  it('🔴 INVARIANT 4 — `Debt` reyestriga BIR MARTA ham tegilmaydi', async () => {
    const { svc, store } = makeHarness({ balanceBeforeMinor: -100_000n });
    await svc.customerPrepayRefund(ACC, CASHIER, SESSION, { counterpartyId: CP });
    expect(store.debtWrites).toEqual([]);
  });

  it('🔴 balans `FOR UPDATE` bilan QULFLANADI (cap qarori shundan)', async () => {
    const { svc, store } = makeHarness({ balanceBeforeMinor: -100_000n });
    await svc.customerPrepayRefund(ACC, CASHIER, SESSION, { counterpartyId: CP });
    expect(store.lockQueries).toHaveLength(1);
    expect(store.lockQueries[0]).toMatch(/FOR UPDATE/);
    expect(store.lockQueries[0]).toMatch(/counterparty_balances/);
  });

  it('izoh hujjatga ham, auditga ham tushadi', async () => {
    const { svc, store } = makeHarness({ balanceBeforeMinor: -100_000n });
    await svc.customerPrepayRefund(ACC, CASHIER, SESSION, {
      counterpartyId: CP,
      sumMinor: '10000',
      description: 'mijoz fikridan qaytdi',
    });
    expect(store.docsOut[0]?.description).toBe('mijoz fikridan qaytdi');
    expect(store.auditEvents[0]?.payload.description).toBe('mijoz fikridan qaytdi');
  });

  it('yashiqda pul YETMASA — TO`XTATILMAYDI, lekin `CASH_OVERDRAWN` yoziladi', async () => {
    // G1 bilan AYNI munosabat (Q10: kassir erkin, anomaliya KO'RINADI).
    // ⚠️ Kassa QOLDIG'I yetarli (aks holda pul daftarining overdraft
    // qo'riqchisi tranzaksiyani orqaga qaytaradi — bu BOSHQA himoya);
    // yetmayotgani — SMENANING kutilgan naqdi.
    const { svc, store } = makeHarness({
      deskBalanceMinor: 1_000_000n,
      shiftCashInMinor: 10_000n,
      balanceBeforeMinor: -90_000n,
    });
    const res = (await svc.customerPrepayRefund(ACC, CASHIER, SESSION, {
      counterpartyId: CP,
      sumMinor: '90000',
    })) as { auditTypes: string[] };
    expect(res.auditTypes).toContain('PREPAY_REFUND');
    expect(res.auditTypes).toContain('CASH_OVERDRAWN');
    expect(store.docsOut).toHaveLength(1);
  });

  it('🔴 kassa QOLDIG`I yetmasa — pul daftari TO`XTATADI (hech narsa qolmaydi)', async () => {
    // Bu `CASH_OVERDRAWN` signalidan BOSHQA himoya: u ogohlantiradi, bu esa
    // rad etadi. Yashiqda jismonan yo'q pulni qaytarib bo'lmaydi (G1 naqshi).
    const { svc, store } = makeHarness({ deskBalanceMinor: 10_000n, balanceBeforeMinor: -90_000n });
    await expect(
      svc.customerPrepayRefund(ACC, CASHIER, SESSION, { counterpartyId: CP, sumMinor: '90000' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(store.deskBalanceMinor).toBe(10_000n);
    expect(store.docsOut).toHaveLength(0);
    expect(store.debtWrites).toEqual([]);
  });
});

describe('customerPrepayRefund — CAP (invariant 5 ning ko`zgusi)', () => {
  const nothingWritten = (store: Store, deskBefore: bigint) => {
    expect(store.docsOut).toHaveLength(0);
    expect(store.moneyOps).toHaveLength(0);
    expect(store.auditEvents).toHaveLength(0);
    expect(store.deskBalanceMinor).toBe(deskBefore);
    expect(store.debtWrites).toEqual([]);
  };

  it('🔴 avansdan ORTIQ so`ralsa 400 — ANIQ son bilan', async () => {
    const { svc, store, balance } = makeHarness({ balanceBeforeMinor: -40_000n });
    await expect(
      svc.customerPrepayRefund(ACC, CASHIER, SESSION, { counterpartyId: CP, sumMinor: '50000' }),
    ).rejects.toThrow(/avansi atigi 400 so'm/);
    nothingWritten(store, 1_000_000n);
    expect(balance.applyDelta).not.toHaveBeenCalled();
  });

  it('avansi YO`Q mijoz (balans musbat — qarzdor) → 400, qarz TEGILMAYDI', async () => {
    const { svc, store } = makeHarness({ balanceBeforeMinor: 300_000n });
    await expect(
      svc.customerPrepayRefund(ACC, CASHIER, SESSION, { counterpartyId: CP, sumMinor: '10000' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    nothingWritten(store, 1_000_000n);
  });

  it('balans NOL → 400 (qaytariladigan avans yo`q)', async () => {
    const { svc, store } = makeHarness({ balanceBeforeMinor: 0n });
    await expect(
      svc.customerPrepayRefund(ACC, CASHIER, SESSION, { counterpartyId: CP }),
    ).rejects.toBeInstanceOf(BadRequestException);
    nothingWritten(store, 1_000_000n);
  });

  it('🔴 balans O`LCHANMAGAN (qator yo`q) → 400, yo`q pul qaytarilmaydi', async () => {
    // `prepayAvailable(null) = 0` — A2 ning ehtiyotkor tomoni. Qulf ham
    // hech nimani ushlamaydi (qator yo'q), ya'ni yo'l shu yerda tugaydi.
    const { svc, store } = makeHarness({ balanceBeforeMinor: null });
    await expect(
      svc.customerPrepayRefund(ACC, CASHIER, SESSION, { counterpartyId: CP }),
    ).rejects.toBeInstanceOf(BadRequestException);
    nothingWritten(store, 1_000_000n);
  });

  it('avansning AYNAN hammasi (chegara qiymati) o`tadi', async () => {
    const { svc, store } = makeHarness({ balanceBeforeMinor: -70_000n });
    await svc.customerPrepayRefund(ACC, CASHIER, SESSION, {
      counterpartyId: CP,
      sumMinor: '70000',
    });
    expect(store.docsOut).toHaveLength(1);
    expect(store.cpBalanceMinor).toBe(0n);
  });

  it('🔴 KETMA-KET ikki qaytarish — ikkinchisi QOLDIQDAN oshib keta olmaydi', async () => {
    // Qulf HOLATLI balans ustida ishlaydi: birinchi qaytarishdan keyin
    // avans 40k qoladi va 50k so'rovi 400 bilan rad etiladi. Statik mock
    // buni ko'rsatmasdi (A2 sabog'i).
    const { svc, store } = makeHarness({ balanceBeforeMinor: -100_000n });
    await svc.customerPrepayRefund(ACC, CASHIER, SESSION, {
      counterpartyId: CP,
      sumMinor: '60000',
    });
    expect(store.cpBalanceMinor).toBe(-40_000n);
    await expect(
      svc.customerPrepayRefund(ACC, CASHIER, SESSION, { counterpartyId: CP, sumMinor: '50000' }),
    ).rejects.toThrow(/avansi atigi 400 so'm/);
    expect(store.docsOut).toHaveLength(1);
  });
});

describe('customerPrepayRefund — qo`riqchilar (hech narsa yozilmaydi)', () => {
  const nothingWritten = (store: Store, deskBefore: bigint) => {
    expect(store.docsOut).toHaveLength(0);
    expect(store.moneyOps).toHaveLength(0);
    expect(store.auditEvents).toHaveLength(0);
    expect(store.deskBalanceMinor).toBe(deskBefore);
    expect(store.debtWrites).toEqual([]);
  };

  it('YOPIQ smenaga 400', async () => {
    const { svc, store, balance } = makeHarness({ sessionState: 'closed' });
    await expect(
      svc.customerPrepayRefund(ACC, CASHIER, SESSION, { counterpartyId: CP }),
    ).rejects.toBeInstanceOf(BadRequestException);
    nothingWritten(store, 1_000_000n);
    expect(balance.applyDelta).not.toHaveBeenCalled();
  });

  it('BEGONA smenaga 400 (smenani ochgan kassir emas)', async () => {
    const { svc, store } = makeHarness({ sessionCashierId: 'boshqa-kassir' });
    await expect(
      svc.customerPrepayRefund(ACC, CASHIER, SESSION, { counterpartyId: CP }),
    ).rejects.toBeInstanceOf(BadRequestException);
    nothingWritten(store, 1_000_000n);
  });

  it('A3 chegarasi: SO`M bo`lmagan kassada OCHIQ 400', async () => {
    const { svc, store } = makeHarness({ deskCurrency: 'USD' });
    await expect(
      svc.customerPrepayRefund(ACC, CASHIER, SESSION, { counterpartyId: CP }),
    ).rejects.toBeInstanceOf(BadRequestException);
    nothingWritten(store, 1_000_000n);
  });

  it('noma`lum mijoz — 404', async () => {
    const { svc, store } = makeHarness({ agentName: null });
    await expect(
      svc.customerPrepayRefund(ACC, CASHIER, SESSION, { counterpartyId: CP }),
    ).rejects.toBeInstanceOf(NotFoundException);
    nothingWritten(store, 1_000_000n);
  });

  it('NOL va MANFIY summa schema darajasida rad etiladi', async () => {
    for (const sumMinor of ['0', '-100', '000']) {
      const { svc, store } = makeHarness({ balanceBeforeMinor: -100_000n });
      await expect(
        svc.customerPrepayRefund(ACC, CASHIER, SESSION, { counterpartyId: CP, sumMinor }),
      ).rejects.toThrow();
      nothingWritten(store, 1_000_000n);
    }
  });

  it('mijozsiz so`rov rad etiladi (schema darajasida)', async () => {
    const { svc, store } = makeHarness();
    await expect(svc.customerPrepayRefund(ACC, CASHIER, SESSION, {})).rejects.toThrow();
    nothingWritten(store, 1_000_000n);
  });
});

// ── KOD SHAKLI QO'RIQCHILARI (`customer-prepay.test.ts` uslubi) ────────────

const SERVICE_SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'cashier-session.service.ts'),
  'utf8',
);

/** Izohlar olib tashlangan kod — «izohda yozilgan» dalil bo'lmasin. */
const CODE = SERVICE_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

function bodyOf(method: string): string {
  const start = CODE.indexOf(`async ${method}(`);
  expect(start, `${method} topilmadi`).toBeGreaterThan(-1);
  const rest = CODE.slice(start + 1);
  const next = rest.search(/\n {2}(?:async |private |\/\*\*)/);
  return next === -1 ? rest : rest.slice(0, next);
}

describe('kod shakli — avansni qaytarish yo`li nimaga TEGMAYDI', () => {
  it('`customerPrepayRefund` tanasida `debt`/`debtNote` yozuvchisi YO`Q', () => {
    const body = bodyOf('customerPrepayRefund');
    expect(body).not.toMatch(/\btx\.debt\b/);
    expect(body).not.toMatch(/\btx\.debtNote\b/);
    expect(body).not.toMatch(/writeSaleDebtRegistryRow|moveSaleDebtRegistryRow/);
  });

  it('🔴 qulf `applyDelta` DAN OLDIN olinadi (cap qarori eskirmasin)', () => {
    const body = bodyOf('customerPrepayRefund');
    const lock = body.indexOf('lockCounterpartyBalance');
    const delta = body.indexOf('balance.applyDelta');
    expect(lock).toBeGreaterThan(-1);
    expect(delta).toBeGreaterThan(-1);
    expect(lock).toBeLessThan(delta);
  });

  it('cap A2 ning SOF qoidasidan (`prepayAvailable`), qayta hisoblanmaydi', () => {
    const body = bodyOf('customerPrepayRefund');
    expect(body).toMatch(/prepayAvailable\(/);
    // Ikkinchi formula (`-balanceMinor`) yozilib qolmasin.
    expect(body).not.toMatch(/-\s*balanceBeforeMinor/);
  });

  it('balansga MUSBAT delta yozadi (ishora chalkashmasin)', () => {
    const body = bodyOf('customerPrepayRefund');
    expect(body).toMatch(/\bbalance\s*\.\s*applyDelta\(/);
    expect(body).toMatch(/applyDelta\([^)]*,\s*requested\s*,/);
  });

  it("yashiq daftariga `kind: 'out'` bilan yozadi", () => {
    expect(bodyOf('customerPrepayRefund')).toMatch(/drawerMoneyDeltas\(\{\s*kind: 'out'/);
  });

  it('hujjat AYNAN `retailDrawerCashOut` jadvaliga tushadi (§8.4 formulasi)', () => {
    // Yangi jadval ochilsa kutilgan naqd formulasi uni ko'rmasdi — §100 bug'i.
    expect(bodyOf('customerPrepayRefund')).toMatch(/tx\.retailDrawerCashOut\.create/);
  });

  it('🔴 `source` BERILMAYDI — mijozga yolg`on «qarz» xabari ketmasin', () => {
    const body = bodyOf('customerPrepayRefund');
    expect(body).toMatch(/docType: BALANCE_DOC_TYPE\.customerPrepayRefund/);
    expect(body).not.toMatch(/source:/);
  });
});
