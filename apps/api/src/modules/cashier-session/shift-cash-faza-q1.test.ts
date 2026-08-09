import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { RetailSaleService } from '../retail-sale/retail-sale.service.js';
import { CashierSessionService } from './cashier-session.service.js';

/**
 * Faza Q1 — smena naqdi paketi (`SALES-02`, `SALES-06`, `SALES-08`, creditAgg).
 *
 * Bu yerdagi testlar SOF FORMULA emas, **so'rov shakli** ustidan yuradi: barcha
 * to'rt bug ham `cashier-session-reconciliation.ts` formulasi TO'G'RI bo'la
 * turib, servis unga NOTO'G'RI kirish berayotgani sababli tug'ilgan. Shuning
 * uchun Prisma dublyori `where` ni haqiqiy qatorlar ustida BAHOLAYDI
 * (`in`/`not: null`/`null` semantikasi bilan) — sof mock `_sum` qaytarsa test
 * bo'sh bo'lardi (bug'ni ko'rmasdi).
 *
 * Bug'lar (fix'dan OLDIN jonli o'lchangan):
 *  1. `SALES-02a` — `salesCashMinor` qaytarish oyna cheklarini ham qo'shadi
 *     (ular `posted`), keyin `returnsCashMinor` o'sha summani ayiradi ⇒ qaytarish
 *     kutilgan naqdga UMUMAN ta'sir qilmaydi.
 *  2. `SALES-02b` — `cashAmountMinor` = BERILGAN naqd (qaytim bilan), kassaga
 *     esa `cashAmount − change` tushadi (`retail-sale.service.ts` money-ledger).
 *     Ya'ni kutilgan naqd har qaytim summasicha ko'p ⇒ soxta KAMOMAD.
 *  3. `SALES-08` — `close()` faqat `draft` cheklarni bloklaydi; `picking`/`ready`
 *     cheklar yopilgan smenada osilib qoladi (ularni endi post ham qilib
 *     bo'lmaydi — `post()` ochiq smena talab qiladi).
 *  4. `creditAgg` — `method: 'debt'` (kichik harf) bilan qidiradi, tender qiymati
 *     esa `TENDER.debt === 'DEBT'` ⇒ Z-hisobotda «qarzga sotildi» DOIM 0.
 */

const ACC = 'acc-1';
const SESSION = 'sess-1';
const CASHIER = 'emp-1';

// ---------------------------------------------------------------------------
// Prisma dublyori — `where` haqiqiy qatorlar ustida baholanadi.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

/** Prisma `where` ning shu testlarda ishlatiladigan qismi (skalyar/in/not). */
function matches(where: Row | undefined, row: Row): boolean {
  if (!where) return true;
  for (const [key, cond] of Object.entries(where)) {
    const value = row[key];
    if (cond === null) {
      if (value !== null && value !== undefined) return false;
      continue;
    }
    if (typeof cond === 'object' && cond !== null) {
      const c = cond as Record<string, unknown>;
      if ('in' in c) {
        if (!(c.in as unknown[]).includes(value)) return false;
        continue;
      }
      if ('not' in c) {
        if (c.not === null) {
          if (value === null || value === undefined) return false;
          continue;
        }
        if (value === c.not) return false;
        continue;
      }
      // Ichma-ich relyatsion filtr (`sale: { ... }`) — qator ichidagi obyekt.
      if (!matches(c, (value ?? {}) as Row)) return false;
      continue;
    }
    if (value !== cond) return false;
  }
  return true;
}

function sumOf(rows: Row[], fields: Row): Record<string, bigint> {
  const out: Record<string, bigint> = {};
  for (const f of Object.keys(fields)) {
    out[f] = rows.reduce((a, r) => a + ((r[f] as bigint | undefined) ?? 0n), 0n);
  }
  return out;
}

function tableOf(rows: Row[]) {
  return {
    rows,
    findMany: vi.fn(async (args?: { where?: Row }) =>
      rows.filter((r) => matches(args?.where, r)).map((r) => ({ ...r })),
    ),
    count: vi.fn(
      async (args?: { where?: Row }) => rows.filter((r) => matches(args?.where, r)).length,
    ),
    aggregate: vi.fn(async (args: { where?: Row; _sum?: Row; _count?: Row }) => {
      const hit = rows.filter((r) => matches(args.where, r));
      return {
        _sum: args._sum ? sumOf(hit, args._sum) : undefined,
        _count: args._count ? { id: hit.length } : undefined,
      };
    }),
    groupBy: vi.fn(async (args: { by: string[]; where?: Row; _sum?: Row }) => {
      const hit = rows.filter((r) => matches(args.where, r));
      const keys = [...new Set(hit.map((r) => String(r[args.by[0] as string])))];
      return keys.map((k) => ({
        [args.by[0] as string]: k,
        _sum: sumOf(
          hit.filter((r) => String(r[args.by[0] as string]) === k),
          args._sum ?? {},
        ),
      }));
    }),
  };
}

interface Fixture {
  openingCashMinor?: bigint;
  sales?: Row[];
  payments?: Row[];
  drawerIn?: Row[];
  drawerOut?: Row[];
  debtPayments?: Row[];
}

function makeClient(f: Fixture = {}) {
  const session: Row = {
    id: SESSION,
    accountId: ACC,
    cashierId: CASHIER,
    state: 'open',
    openedAt: new Date('2026-08-09T08:00:00Z'),
    closedAt: null,
    openingCashMinor: f.openingCashMinor ?? 0n,
    closingCashMinor: null,
    organizationId: 'org-1',
    cashier: { id: CASHIER, name: 'Kassir' },
    cashDesk: { id: 'cd-1', name: 'Kassa', currency: 'UZS' },
    store: { id: 'st-1', name: 'Do`kon' },
    organization: { id: 'org-1', name: 'Tashkilot', legalTitle: null },
  };

  const retailSale = tableOf(f.sales ?? []);
  const retailSalePayment = tableOf(f.payments ?? []);
  const client = {
    cashierSession: {
      findFirst: vi.fn(async () => ({ ...session })),
      findUniqueOrThrow: vi.fn(async () => ({ ...session })),
      updateMany: vi.fn(async (args: { where: Row; data: Row }) => {
        if (!matches(args.where, session)) return { count: 0 };
        Object.assign(session, args.data);
        return { count: 1 };
      }),
      update: vi.fn(async (args: { data: Row }) => {
        Object.assign(session, args.data);
        return { ...session };
      }),
    },
    retailSale,
    retailSalePayment,
    debtPayment: tableOf(f.debtPayments ?? []),
    retailDrawerCashIn: tableOf(f.drawerIn ?? []),
    retailDrawerCashOut: tableOf(f.drawerOut ?? []),
    cashierSessionVariance: {
      createMany: vi.fn(async () => ({ count: 1 })),
      findMany: vi.fn(async () => []),
    },
    // MK08 — yopish AYNI tranzaksiyada smenani menejer navbatiga qo'yadi
    // (`open_for_review`) va jurnalning birinchi qatorini yozadi.
    cashierSessionAcceptanceEvent: { create: vi.fn(async () => ({ id: 'ae-1' })) },
    hrTelegramOutbox: { create: vi.fn(async () => ({ id: 'ob-1' })) },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(client)),
  };
  return { client, session };
}

const svcOf = (client: unknown) => new CashierSessionService({ client } as never);

/** Sotuv cheki (asl) — `refundedFromId: null`. */
function sale(over: Row = {}): Row {
  return {
    id: 'sale-1',
    accountId: ACC,
    sessionId: SESSION,
    state: 'posted',
    refundedFromId: null,
    sumMinor: 0n,
    cashAmountMinor: 0n,
    cardAmountMinor: 0n,
    changeMinor: 0n,
    positions: [],
    ...over,
  };
}

// ---------------------------------------------------------------------------
// 1. Kutilgan naqd — qaytim + qaytarish (SALES-02)
// ---------------------------------------------------------------------------

describe('Faza Q1 · kutilgan naqd — qaytim va qaytarish', () => {
  it('qaytim (сдача) kutilgan naqddan AYIRILADI — soxta kamomad yo`q', async () => {
    // Mijoz 150 000 berdi, 100 000 lik tovar oldi, 50 000 qaytim.
    // Yashiqqa tushgan pul = 100 000 (money-ledger AYNAN shuni yozadi).
    const { client, session } = makeClient({
      openingCashMinor: 100_000n,
      sales: [sale({ sumMinor: 100_000n, cashAmountMinor: 150_000n, changeMinor: 50_000n })],
    });

    await svcOf(client).close(ACC, CASHIER, SESSION, { closingCashMinor: '200000' });

    expect(session.expectedCashMinor).toBe(200_000n); // 100 000 + 100 000
    expect(session.discrepancyMinor).toBe(0n);
  });

  it('qaytarish oyna cheki kutilgan naqdni KAMAYTIRADI (bir marta)', async () => {
    // Sotuv 100 000 naqd (qaytimsiz) + 30 000 naqd qaytarish.
    const { client, session } = makeClient({
      openingCashMinor: 100_000n,
      sales: [
        sale({ id: 'sale-1', sumMinor: 100_000n, cashAmountMinor: 100_000n }),
        sale({
          id: 'sale-2',
          sumMinor: 30_000n,
          cashAmountMinor: 30_000n,
          refundedFromId: 'sale-1',
        }),
      ],
    });

    await svcOf(client).close(ACC, CASHIER, SESSION, { closingCashMinor: '170000' });

    expect(session.expectedCashMinor).toBe(170_000n); // 100 000 + 100 000 − 30 000
    expect(session.discrepancyMinor).toBe(0n);
  });

  it('to`liq qaytarilgan chek (`refunded`) baribir sotuv sifatida sanaladi', async () => {
    // Faza 7 semantikasi: to'liq qaytarishda ASL chek `refunded` bo'ladi.
    // Uning naqdi yashiqqa TUSHGAN edi, ya'ni formuladan tushib qolmasligi kerak.
    const { client, session } = makeClient({
      openingCashMinor: 0n,
      sales: [
        sale({ id: 'sale-1', state: 'refunded', sumMinor: 50_000n, cashAmountMinor: 50_000n }),
        sale({
          id: 'sale-2',
          sumMinor: 50_000n,
          cashAmountMinor: 50_000n,
          refundedFromId: 'sale-1',
        }),
      ],
    });

    await svcOf(client).close(ACC, CASHIER, SESSION, { closingCashMinor: '0' });

    expect(session.expectedCashMinor).toBe(0n); // +50 000 −50 000
  });
});

// ---------------------------------------------------------------------------
// 2. `close()` — yig'ilayotgan cheklar (SALES-08)
// ---------------------------------------------------------------------------

describe('Faza Q1 · close() yig`ilayotgan cheklarni bloklaydi', () => {
  for (const state of ['draft', 'picking', 'ready'] as const) {
    it(`'${state}' holatidagi chek smenani yopishga yo'l qo'ymaydi`, async () => {
      const { client } = makeClient({
        sales: [sale({ id: 'sale-9', state })],
      });

      await expect(
        svcOf(client).close(ACC, CASHIER, SESSION, { closingCashMinor: '0' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  }

  it('`posted`/`cancelled` cheklar yopishni to`smaydi', async () => {
    const { client, session } = makeClient({
      sales: [sale({ id: 'a', state: 'posted' }), sale({ id: 'b', state: 'cancelled' })],
    });

    await svcOf(client).close(ACC, CASHIER, SESSION, { closingCashMinor: '0' });
    expect(session.state).toBe('closed');
  });
});

// ---------------------------------------------------------------------------
// 2b. MK08 — yopish MENEJER qabuli navbatini ochadi
// ---------------------------------------------------------------------------

describe('MK08 · close() smenani qabul navbatiga qo`yadi', () => {
  it('yopilgan smena `pending` bo`ladi va vaqti muhrlanadi', async () => {
    const { client, session } = makeClient({ sales: [sale({ id: 'a', state: 'posted' })] });

    await svcOf(client).close(ACC, CASHIER, SESSION, { closingCashMinor: '0' });

    // Busiz yopilgan smena hech kimning stolida ko'rinmasdi: `state='closed'`
    // «hal bo'ldi» degani EMAS.
    expect(session.acceptanceState).toBe('pending');
    expect(session.acceptanceChangedAt).toBeInstanceOf(Date);
  });

  it('jurnalning BIRINCHI qatori — tizimning `open_for_review` hodisasi', async () => {
    const { client } = makeClient({ sales: [sale({ id: 'a', state: 'posted' })] });

    await svcOf(client).close(ACC, CASHIER, SESSION, { closingCashMinor: '0' });

    const create = client.cashierSessionAcceptanceEvent.create;
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data).toMatchObject({
      sessionId: SESSION,
      fromState: 'open',
      toState: 'pending',
      action: 'open_for_review',
      actorType: 'system',
      actorId: null,
    });
  });
});

// ---------------------------------------------------------------------------
// 3. Z-hisobot — «qarzga sotildi» ko'rsatkichi (creditAgg 'DEBT')
// ---------------------------------------------------------------------------

describe('Faza Q1 · Z-hisobot «qarzga sotildi»', () => {
  it('DEBT to`lov qatorini KO`RADI (tender qiymati katta harfda)', async () => {
    const { client } = makeClient({
      sales: [sale({ id: 'sale-1', sumMinor: 90_000n })],
      payments: [
        {
          method: 'DEBT',
          amountMinor: 90_000n,
          sale: { accountId: ACC, sessionId: SESSION, state: 'posted' },
        },
      ],
    });

    const z = (await svcOf(client).zReport(ACC, SESSION)) as { creditSoldMinor: string };
    expect(z.creditSoldMinor).toBe('90000');
  });

  it('naqd chek «qarzga sotildi» ga tushmaydi', async () => {
    const { client } = makeClient({
      sales: [sale({ id: 'sale-1', sumMinor: 90_000n, cashAmountMinor: 90_000n })],
      payments: [
        {
          method: 'CASH_UZS',
          amountMinor: 90_000n,
          sale: { accountId: ACC, sessionId: SESSION, state: 'posted' },
        },
      ],
    });

    const z = (await svcOf(client).zReport(ACC, SESSION)) as { creditSoldMinor: string };
    expect(z.creditSoldMinor).toBe('0');
  });
});

// ---------------------------------------------------------------------------
// 4. Legacy Z-hisobot (`/retail-sales/z-report`) — SALES-06
// ---------------------------------------------------------------------------

function legacyService(client: unknown): RetailSaleService {
  return new RetailSaleService(
    { client } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
}

describe('Faza Q1 · legacy z-report netSum (SALES-06)', () => {
  it('to`liq qaytarilgan chek netSum ni IKKI marta kamaytirmaydi', async () => {
    const { client } = makeClient({
      sales: [
        sale({ id: 'sale-1', state: 'refunded', sumMinor: 100_000n, cashAmountMinor: 100_000n }),
        sale({
          id: 'sale-2',
          sumMinor: 100_000n,
          cashAmountMinor: 100_000n,
          refundedFromId: 'sale-1',
        }),
      ],
    });

    const z = (await legacyService(client).zReport(ACC, SESSION)) as {
      netSumMinor: string;
      salesSumMinor: string;
    };
    expect(z.salesSumMinor).toBe('100000');
    expect(z.netSumMinor).toBe('0');
  });

  it('qisman qaytarish netSum ni faqat qaytarilgan ulushga kamaytiradi', async () => {
    const { client } = makeClient({
      sales: [
        sale({ id: 'sale-1', state: 'posted', sumMinor: 100_000n, cashAmountMinor: 100_000n }),
        sale({
          id: 'sale-2',
          sumMinor: 40_000n,
          cashAmountMinor: 40_000n,
          refundedFromId: 'sale-1',
        }),
      ],
    });

    const z = (await legacyService(client).zReport(ACC, SESSION)) as { netSumMinor: string };
    expect(z.netSumMinor).toBe('60000');
  });
});
