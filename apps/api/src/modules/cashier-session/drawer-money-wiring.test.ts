import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { MoneyService } from '../money/money.service.js';
import { CashierSessionService } from './cashier-session.service.js';

/**
 * Faza 4 — YASHIQ AMALLARI PUL DAFTARIGA ULANGANINING XULQ ISBOTI.
 *
 * TUZATISHDAN OLDINGI holat (lokal `climart_adopt` da o'lchangan):
 *   `grep applyDeltas apps/api/src/modules/cashier-session/` → 0 natija.
 *   Внесение / Изъятие / xarajat / inkassatsiya `RetailDrawerCashIn|Out`
 *   qatorini yozardi-yu, `CashDesk.balanceMinor` ham, `MoneyOperation` ham
 *   qimirlamasdi. Kirim yo'llari (chek naqdi, qarz to'lovi, ПКО) esa yozardi
 *   ⇒ ustun MONOTON shishardi (11 810 000 tiyin qoldiq, 100 000 189 900 tiyin
 *   hisobga olinmagan chiqim).
 *
 * NEGA MOCK EMAS, HAQIQIY `MoneyService`: mock qilingan daftar «chaqirildimi»
 * degan savolga javob beradi, «qoldiq to'g'ri siljidimi» va «overdraft
 * qo'riqchisi ishladimi» degan savolga EMAS. Bu fazaning butun mavzusi —
 * aynan o'sha ikkinchi savol (242 yashil test bug'ni ko'rmagan edi).
 *
 * DOUBLE Postgres semantikasini modellaydi:
 *   · `cashDesk.update({ balanceMinor: { increment } })` — atomik o'sish;
 *   · `$transaction(fn)` — fn throw qilsa BUTUN yozuv rollback bo'ladi
 *     (aynan shunga tayanib `MoneyService` qo'riqchisi increment'dan KEYIN
 *     tekshiradi).
 */

interface Store {
  deskBalanceMinor: bigint;
  deskCurrency: string;
  moneyOps: Array<{
    cashDeskId: string | null;
    organizationAccountId: string | null;
    deltaMinor: bigint;
    currency: string;
    documentKind: string;
    documentId: string;
    description: string | null;
  }>;
  docsIn: Array<{ id: string; name: string; sumMinor: bigint }>;
  docsOut: Array<{ id: string; name: string; sumMinor: bigint; kind: string }>;
  auditEvents: Array<{ type: string; docId: string }>;
}

const ACC = 'acc-1';
const DESK = 'desk-1';
const SESSION = 'sess-1';
const CASHIER = 'cashier-1';

function makeHarness(opts: { deskBalanceMinor: bigint; deskCurrency?: string }) {
  const store: Store = {
    deskBalanceMinor: opts.deskBalanceMinor,
    deskCurrency: opts.deskCurrency ?? 'UZS',
    moneyOps: [],
    docsIn: [],
    docsOut: [],
    auditEvents: [],
  };
  let seq = 0;
  let docSeq = 0;

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
        cashDesk: { currency: store.deskCurrency },
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
    employee: {
      findUnique: async () => ({ groupId: null, accountId: ACC }),
      findFirst: async () => ({ id: 'emp-1', name: 'Qabul qiluvchi' }),
    },
    expenseItem: {
      findFirst: async () => ({ id: 'exp-1', name: 'Kommunal' }),
    },
    // Kutilgan naqd manbalari — `posCashOut` `collectCashInputs` ni chaqiradi.
    retailSale: { aggregate: async () => ({ _sum: {} }) },
    debtPayment: { aggregate: async () => ({ _sum: {} }) },
    retailDrawerCashIn: {
      findFirst: async () => null,
      aggregate: async () => ({ _sum: { sumMinor: 0n } }),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        docSeq += 1;
        const doc = {
          id: `in-${docSeq}`,
          name: data.name as string,
          sumMinor: data.sumMinor as bigint,
        };
        store.docsIn.push(doc);
        return doc;
      },
    },
    retailDrawerCashOut: {
      findFirst: async () => null,
      aggregate: async () => ({ _sum: { sumMinor: 0n } }),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        docSeq += 1;
        const doc = {
          id: `out-${docSeq}`,
          name: data.name as string,
          sumMinor: data.sumMinor as bigint,
          currency: data.currency as string,
          kind: (data.kind as string) ?? 'other',
          description: (data.description as string | null) ?? null,
          createdAt: new Date('2026-08-12T00:00:00Z'),
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
      findUnique: async () => ({ accountId: ACC, currency: store.deskCurrency }),
      update: async ({ data }: { data: { balanceMinor: { increment: bigint } } }) => {
        store.deskBalanceMinor += data.balanceMinor.increment;
        return { balanceMinor: store.deskBalanceMinor };
      },
    },
    moneyOperation: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        store.moneyOps.push({
          cashDeskId: (data.cashDeskId as string | null) ?? null,
          organizationAccountId: (data.organizationAccountId as string | null) ?? null,
          deltaMinor: data.deltaMinor as bigint,
          currency: data.currency as string,
          documentKind: data.documentKind as string,
          documentId: data.documentId as string,
          description: (data.description as string | null) ?? null,
        });
        return { id: `mo-${store.moneyOps.length}` };
      },
    },
    // Rollback HALOL modellanadi: `MoneyService` qo'riqchisi qoldiqni
    // OSHIRIB bo'lib keyin throw qiladi va chaqiruvchining tranzaksiyasiga
    // orqaga qaytarishni ishonadi.
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const snapshot = {
        deskBalanceMinor: store.deskBalanceMinor,
        moneyOps: store.moneyOps.length,
        docsIn: store.docsIn.length,
        docsOut: store.docsOut.length,
        auditEvents: store.auditEvents.length,
      };
      try {
        return await fn(client);
      } catch (e) {
        store.deskBalanceMinor = snapshot.deskBalanceMinor;
        store.moneyOps.length = snapshot.moneyOps;
        store.docsIn.length = snapshot.docsIn;
        store.docsOut.length = snapshot.docsOut;
        store.auditEvents.length = snapshot.auditEvents;
        throw e;
      }
    },
  };

  const prisma = { client } as never;
  const svc = new CashierSessionService(prisma, new MoneyService(prisma));
  return { svc, store };
}

describe('Внесение — yashiqqa kirim daftarga MUSBAT yoziladi', () => {
  it('kassa qoldig`i summaga OSHADI', async () => {
    const { svc, store } = makeHarness({ deskBalanceMinor: 1_000_000n });
    await svc.drawerCashIn(ACC, CASHIER, SESSION, { sumMinor: '500000' });
    expect(store.deskBalanceMinor).toBe(1_500_000n);
  });

  it('daftarga `drawer_cash_in` qatori tushadi va hujjatga bog`lanadi', async () => {
    const { svc, store } = makeHarness({ deskBalanceMinor: 1_000_000n });
    const doc = (await svc.drawerCashIn(ACC, CASHIER, SESSION, { sumMinor: '500000' })) as {
      id: string;
    };
    expect(store.moneyOps).toHaveLength(1);
    expect(store.moneyOps[0]).toMatchObject({
      documentKind: 'drawer_cash_in',
      documentId: doc.id,
      cashDeskId: DESK,
      deltaMinor: 500_000n,
      currency: 'UZS',
    });
  });
});

describe('Изъятие — yashiqdan chiqim daftarga MANFIY yoziladi', () => {
  it('kassa qoldig`i summaga KAMAYADI', async () => {
    const { svc, store } = makeHarness({ deskBalanceMinor: 1_000_000n });
    await svc.drawerCashOut(ACC, CASHIER, SESSION, { sumMinor: '300000' });
    expect(store.deskBalanceMinor).toBe(700_000n);
  });

  it('daftarga `drawer_cash_out` qatori MANFIY delta bilan tushadi', async () => {
    const { svc, store } = makeHarness({ deskBalanceMinor: 1_000_000n });
    const doc = (await svc.drawerCashOut(ACC, CASHIER, SESSION, { sumMinor: '300000' })) as {
      id: string;
    };
    expect(store.moneyOps).toHaveLength(1);
    expect(store.moneyOps[0]).toMatchObject({
      documentKind: 'drawer_cash_out',
      documentId: doc.id,
      deltaMinor: -300_000n,
    });
  });

  it('yashiqda YO`Q pulni chiqarib bo`lmaydi (overdraft qo`riqchisi)', async () => {
    const { svc, store } = makeHarness({ deskBalanceMinor: 100_000n });
    await expect(
      svc.drawerCashOut(ACC, CASHIER, SESSION, { sumMinor: '300000' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    // Hujjat ham, qoldiq ham rollback bo'ldi — «yozildi-yu daftarda yo'q»
    // holati aynan shu fazada tuzatilayotgan kasallik.
    expect(store.deskBalanceMinor).toBe(100_000n);
    expect(store.docsOut).toHaveLength(0);
    expect(store.moneyOps).toHaveLength(0);
  });
});

describe('Xarajat (RKO) / inkassatsiya — ular ham daftarga yoziladi', () => {
  it('xarajat kassa qoldig`ini KAMAYTIRADI va `drawer_cash_out` yozadi', async () => {
    const { svc, store } = makeHarness({ deskBalanceMinor: 1_000_000n });
    const res = (await svc.posCashOut(ACC, CASHIER, SESSION, {
      kind: 'expense',
      sumMinor: '200000',
      expenseItemId: '11111111-1111-1111-1111-111111111111',
    })) as { id: string };
    expect(store.deskBalanceMinor).toBe(800_000n);
    expect(store.moneyOps).toHaveLength(1);
    expect(store.moneyOps[0]).toMatchObject({
      documentKind: 'drawer_cash_out',
      documentId: res.id,
      deltaMinor: -200_000n,
    });
  });

  it('inkassatsiya ham AYNI yo`ldan o`tadi', async () => {
    const { svc, store } = makeHarness({ deskBalanceMinor: 1_000_000n });
    await svc.posCashOut(ACC, CASHIER, SESSION, {
      kind: 'collection',
      sumMinor: '400000',
      recipientId: '22222222-2222-2222-2222-222222222222',
    });
    expect(store.deskBalanceMinor).toBe(600_000n);
    expect(store.moneyOps[0]?.deltaMinor).toBe(-400_000n);
  });

  it('qoldiqdan ORTIQ xarajat endi 400 beradi (ATAYLAB o`zgargan xulq)', async () => {
    // Ilgari bu yo'l qo'riqchini butunlay chetlab o'tardi: hujjat yozilar,
    // qoldiq qimirlamas edi. Endi tranzaksiya orqaga qaytadi.
    const { svc, store } = makeHarness({ deskBalanceMinor: 100_000n });
    await expect(
      svc.posCashOut(ACC, CASHIER, SESSION, {
        kind: 'expense',
        sumMinor: '200000',
        expenseItemId: '11111111-1111-1111-1111-111111111111',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(store.deskBalanceMinor).toBe(100_000n);
    expect(store.docsOut).toHaveLength(0);
    expect(store.moneyOps).toHaveLength(0);
    expect(store.auditEvents).toHaveLength(0);
  });

  it('audit izi HAMON yoziladi (CASH_OVERDRAWN o`chirilmagan)', async () => {
    // Yashiqda 0 kutilgan naqd (agregatlar bo'sh), lekin qoldiq yetarli —
    // ya'ni ogohlantirish hodisasi yozilishi kerak, hujjat esa o'tadi.
    const { svc, store } = makeHarness({ deskBalanceMinor: 1_000_000n });
    await svc.posCashOut(ACC, CASHIER, SESSION, {
      kind: 'expense',
      sumMinor: '200000',
      expenseItemId: '11111111-1111-1111-1111-111111111111',
    });
    expect(store.auditEvents.map((e) => e.type)).toContain('CASH_OVERDRAWN');
  });
});

describe('DI qulfi — `MoneyModule` OSHKORA import qilingan', () => {
  it('modul MoneyModule ni import qiladi (yetim in`yeksiya = prod 502)', () => {
    const mod = readFileSync(join(import.meta.dirname, 'cashier-session.module.ts'), 'utf8');
    expect(mod).toContain('MoneyModule');
    const imports = mod.match(/imports:\s*\[([^\]]*)\]/)?.[1] ?? '';
    expect(imports).toContain('MoneyModule');
  });
});
