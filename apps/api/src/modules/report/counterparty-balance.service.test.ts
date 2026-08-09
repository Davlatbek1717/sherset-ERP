import { describe, expect, it, vi } from 'vitest';
import { CounterpartyBalanceService } from './counterparty-balance.service.js';

/**
 * Unit coverage for the multi-currency consolidation fix (commit abb78ece).
 *
 * The bug: computeSummaries + collapseByCounterparty summed `balanceMinor`
 * across currencies (USD cents + UZS tiyin). These tests stub the prisma
 * boundary with canned multi-currency balances and assert the service folds
 * each row to the account base (валюта учёта) before summing.
 *
 * Rate fixture: base UZS (1e8), USD @ 12 000 (rateValue = 12000 * 1e8).
 * So a USD minor amount → base = amount * 12000.
 */

const E8 = 100_000_000n;

function currencyRows() {
  return [
    { code: 'UZS', default: true, rateValue: E8, multiplicity: 1, indirect: false },
    { code: 'USD', default: false, rateValue: 12_000n * E8, multiplicity: 1, indirect: false },
  ];
}

interface CannedBalance {
  counterpartyId: string;
  currency: string;
  balanceMinor: bigint;
  name: string;
  archived?: boolean;
}

type CannedRow = ReturnType<typeof toCanned>;

function toCanned(b: CannedBalance) {
  return {
    counterpartyId: b.counterpartyId,
    currency: b.currency,
    balanceMinor: b.balanceMinor,
    updatedAt: new Date('2026-05-20T00:00:00Z'),
    counterparty: {
      id: b.counterpartyId,
      name: b.name,
      legalTitle: null as string | null,
      companyType: 'legal',
      archived: b.archived ?? false,
    },
  };
}

/**
 * Prisma `where` ni qator ustida BAHOLAYDI — dubl DB semantikasini taqlid
 * qilishi shart, aks holda «jami sahifadanmi yoki butun filtrdanmi» farqi
 * testda ko'rinmaydi (`PERF-04`).
 */
// biome-ignore lint/suspicious/noExplicitAny: test-dubl Prisma where shaklini dinamik o'qiydi
function rowMatches(row: CannedRow, where: any): boolean {
  if (!where) return true;
  if (where.AND) {
    const list = Array.isArray(where.AND) ? where.AND : [where.AND];
    // biome-ignore lint/suspicious/noExplicitAny: yuqoridagi bilan bir sabab
    if (!list.every((w: any) => rowMatches(row, w))) return false;
  }
  if (where.counterpartyId) {
    const f = where.counterpartyId;
    if (typeof f === 'string') {
      if (row.counterpartyId !== f) return false;
    } else if (Array.isArray(f.in) && !f.in.includes(row.counterpartyId)) return false;
  }
  if (where.currency && row.currency !== where.currency) return false;
  if (where.balanceMinor) {
    const f = where.balanceMinor;
    if (f.gt !== undefined && !(row.balanceMinor > BigInt(f.gt))) return false;
    if (f.lt !== undefined && !(row.balanceMinor < BigInt(f.lt))) return false;
    if (f.not !== undefined && row.balanceMinor === BigInt(f.not)) return false;
  }
  if (where.counterparty) {
    const cp = where.counterparty;
    if (cp.archived !== undefined && row.counterparty.archived !== cp.archived) return false;
    if (cp.OR) {
      // biome-ignore lint/suspicious/noExplicitAny: yuqoridagi bilan bir sabab
      const hit = cp.OR.some((o: any) => {
        const [field, cond] = Object.entries(o)[0] as [string, { contains?: string }];
        const v = (row.counterparty as Record<string, unknown>)[field];
        return (
          typeof v === 'string' &&
          typeof cond.contains === 'string' &&
          v.toLowerCase().includes(cond.contains.toLowerCase())
        );
      });
      if (!hit) return false;
    }
  }
  return true;
}

/** Build a PrismaService double whose counterpartyBalance delegate mirrors the
 *  DB: `where` filtering, `balanceMinor desc` order, `take` paging, and a
 *  `groupBy` that aggregates over the WHOLE matching set. */
function makeService(balances: CannedBalance[]) {
  const rows = balances.map(toCanned);

  // biome-ignore lint/suspicious/noExplicitAny: Prisma args shakli testda dinamik
  const findMany = vi.fn(async (args: any) => {
    const src = rows
      .filter((r) => rowMatches(r, args?.where))
      .sort((a, b) =>
        a.balanceMinor > b.balanceMinor ? -1 : a.balanceMinor < b.balanceMinor ? 1 : 0,
      );
    return args?.take != null ? src.slice(0, args.take) : src;
  });
  // biome-ignore lint/suspicious/noExplicitAny: Prisma args shakli testda dinamik
  const count = vi.fn(async (args: any) => rows.filter((r) => rowMatches(r, args?.where)).length);
  // biome-ignore lint/suspicious/noExplicitAny: Prisma args shakli testda dinamik
  const groupBy = vi.fn(async (args: any) => {
    const by: string[] = args.by;
    const acc = new Map<string, { key: Record<string, string>; sum: bigint; n: number }>();
    for (const r of rows.filter((x) => rowMatches(x, args.where))) {
      const key: Record<string, string> = {};
      for (const f of by) key[f] = (r as unknown as Record<string, string>)[f] ?? '';
      const k = by.map((f) => key[f]).join('|');
      const cur = acc.get(k) ?? { key, sum: 0n, n: 0 };
      cur.sum += r.balanceMinor;
      cur.n += 1;
      acc.set(k, cur);
    }
    return [...acc.values()].map((g) => ({
      ...g.key,
      _sum: { balanceMinor: g.sum },
      _count: { _all: g.n },
    }));
  });
  const cpFindMany = vi.fn(async () => rows.map((r) => ({ id: r.counterpartyId })));

  const client = {
    currency: { findMany: vi.fn(async () => currencyRows()) },
    counterpartyBalance: { findMany, count, groupBy },
    counterparty: { findMany: cpFindMany },
  };
  return {
    svc: new CounterpartyBalanceService({ client } as never),
    findMany,
    groupBy,
    cpFindMany,
  };
}

// Pass includeArchived=true + no search ⇒ service skips the counterparty
// pre-resolve query, so only the two stubs above are exercised.
const BASE_FILTER = { signFilter: 'all' as const, includeArchived: true };

describe('CounterpartyBalanceService — multi-currency consolidation', () => {
  it('flat summaries: USD balance is base-consolidated, not added raw to UZS', async () => {
    const { svc } = makeService([
      { counterpartyId: 'cp-a', currency: 'UZS', balanceMinor: 1_000_000n, name: 'A' },
      { counterpartyId: 'cp-b', currency: 'USD', balanceMinor: 100_00n, name: 'B' },
    ]);
    const r = await svc.counterpartyBalanceReport('acc', { ...BASE_FILTER, groupBy: 'none' });
    // 1_000_000 (UZS) + 100_00 * 12000 (USD→base 120_000_000) = 121_000_000
    expect(r.summaries.totalDebtMinor).toBe('121000000');
    expect(r.summaries.netMinor).toBe('121000000');
    expect(r.summaries.debtorCount).toBe(2);
    expect(r.summaries.currency).toBe('UZS');
    expect(r.summaries.mixedCurrency).toBe(true);
    // per-row display keeps each row's own currency
    expect(r.items.find((i) => i.counterpartyId === 'cp-b')?.currency).toBe('USD');
  });

  it('groupBy=counterparty: a CP holding USD+UZS collapses to a base total', async () => {
    const { svc } = makeService([
      { counterpartyId: 'cp-c', currency: 'UZS', balanceMinor: 500_000n, name: 'C' },
      { counterpartyId: 'cp-c', currency: 'USD', balanceMinor: 10_00n, name: 'C' },
    ]);
    const r = await svc.counterpartyBalanceReport('acc', {
      ...BASE_FILTER,
      groupBy: 'counterparty',
    });
    const cpC = r.items.find((i) => i.counterpartyId === 'cp-c');
    // 500_000 + 10_00 * 12000 (12_000_000) = 12_500_000
    expect(cpC?.balanceMinor).toBe('12500000');
    expect(cpC?.currency).toBe('UZS'); // base code, never the legacy "MIX"
    expect(r.summaries.mixedCurrency).toBe(true);
  });

  it('creditor (negative) sign survives base conversion', async () => {
    const { svc } = makeService([
      { counterpartyId: 'cp-d', currency: 'USD', balanceMinor: -50_00n, name: 'D' },
    ]);
    const r = await svc.counterpartyBalanceReport('acc', { ...BASE_FILTER, groupBy: 'none' });
    // -50_00 * 12000 = -60_000_000 ⇒ credit
    expect(r.summaries.totalCreditMinor).toBe('60000000');
    expect(r.summaries.creditorCount).toBe(1);
    expect(r.summaries.netMinor).toBe('-60000000');
  });

  it('single-currency tenant: consolidation is the identity (no drift)', async () => {
    const { svc } = makeService([
      { counterpartyId: 'cp-a', currency: 'UZS', balanceMinor: 1_000_000n, name: 'A' },
      { counterpartyId: 'cp-b', currency: 'UZS', balanceMinor: 2_500_000n, name: 'B' },
    ]);
    const r = await svc.counterpartyBalanceReport('acc', { ...BASE_FILTER, groupBy: 'none' });
    expect(r.summaries.totalDebtMinor).toBe('3500000');
    expect(r.summaries.mixedCurrency).toBe(false);
  });
});

/**
 * FAZA 27a — `PERF-04` (jami faqat sahifadagi top-N ustida) va `DUP-14`
 * (5000 lik kontragent IN-ro'yxati).
 *
 * Ikkalasi ham JIM kesardi: dashborddagi «Задолженность» kichik qarzlarni
 * yo'qotardi, 5000 dan ortiq kontragentli akkauntda esa qarzdorlar
 * ro'yxatidan qarzdorlar ogohlantirishsiz tushib qolardi.
 */
describe('CounterpartyBalanceService — PERF-04 / DUP-14', () => {
  it('jami sahifadan emas, BUTUN filtr bo‘yicha agregatdan keladi', async () => {
    const { svc } = makeService([
      { counterpartyId: 'cp-1', currency: 'UZS', balanceMinor: 100n, name: 'A' },
      { counterpartyId: 'cp-2', currency: 'UZS', balanceMinor: 200n, name: 'B' },
      { counterpartyId: 'cp-3', currency: 'UZS', balanceMinor: 300n, name: 'C' },
      { counterpartyId: 'cp-4', currency: 'UZS', balanceMinor: -50n, name: 'D' },
      { counterpartyId: 'cp-5', currency: 'UZS', balanceMinor: -25n, name: 'E' },
    ]);
    const r = await svc.counterpartyBalanceReport('acc', { ...BASE_FILTER, limit: 2 });
    expect(r.items).toHaveLength(2); // sahifa top-2
    expect(r.total).toBe(5);
    expect(r.truncated).toBe(true);
    expect(r.summaries.totalDebtMinor).toBe('600'); // 100+200+300, sahifadagi 500 emas
    expect(r.summaries.totalCreditMinor).toBe('75'); // 50+25, sahifada umuman yo'q
    expect(r.summaries.debtorCount).toBe(3);
    expect(r.summaries.creditorCount).toBe(2);
    expect(r.summaries.rowCount).toBe(5);
    expect(r.summaries.netMinor).toBe('525');
  });

  it('qidiruv kontragent-JOIN bilan ketadi — 5000 lik ID pre-fetch YO‘Q', async () => {
    const { svc, findMany, cpFindMany } = makeService([
      { counterpartyId: 'cp-1', currency: 'UZS', balanceMinor: 100n, name: 'Akme MChJ' },
      { counterpartyId: 'cp-2', currency: 'UZS', balanceMinor: 200n, name: 'Beta LLC' },
    ]);
    const r = await svc.counterpartyBalanceReport('acc', { signFilter: 'all', search: 'akme' });
    expect(cpFindMany).not.toHaveBeenCalled();
    expect(findMany.mock.calls[0]?.[0]?.where?.counterparty).toBeDefined();
    expect(r.items.map((i) => i.counterpartyName)).toEqual(['Akme MChJ']);
    expect(r.summaries.totalDebtMinor).toBe('100');
    expect(r.total).toBe(1);
  });

  it('arxivlangan kontragent JOIN-filtri bilan chiqarib tashlanadi', async () => {
    const { svc, cpFindMany } = makeService([
      { counterpartyId: 'cp-1', currency: 'UZS', balanceMinor: 100n, name: 'Faol' },
      {
        counterpartyId: 'cp-2',
        currency: 'UZS',
        balanceMinor: 900n,
        name: 'Arxiv',
        archived: true,
      },
    ]);
    const r = await svc.counterpartyBalanceReport('acc', { signFilter: 'all' });
    expect(cpFindMany).not.toHaveBeenCalled();
    expect(r.items.map((i) => i.counterpartyName)).toEqual(['Faol']);
    expect(r.summaries.totalDebtMinor).toBe('100');
  });

  it('signFilter=creditors: agregat debitorlarni OQIZMAYDI (AND-birikma)', async () => {
    const { svc } = makeService([
      { counterpartyId: 'cp-1', currency: 'UZS', balanceMinor: -50n, name: 'A' },
      { counterpartyId: 'cp-2', currency: 'UZS', balanceMinor: -30n, name: 'B' },
      { counterpartyId: 'cp-3', currency: 'UZS', balanceMinor: -20n, name: 'C' },
      { counterpartyId: 'cp-4', currency: 'UZS', balanceMinor: 100n, name: 'D' },
    ]);
    const r = await svc.counterpartyBalanceReport('acc', {
      signFilter: 'creditors',
      includeArchived: true,
      limit: 1,
    });
    expect(r.items).toHaveLength(1);
    expect(r.summaries.totalCreditMinor).toBe('100'); // 50+30+20 — sahifadagi 20 emas
    expect(r.summaries.totalDebtMinor).toBe('0'); // +100 sign-filtrdan o'tmaydi
    expect(r.summaries.creditorCount).toBe(3);
    expect(r.summaries.debtorCount).toBe(0);
  });

  it('mixedCurrency butun scope’dan — sahifada bitta valyuta qolsa ham', async () => {
    const { svc } = makeService([
      { counterpartyId: 'cp-1', currency: 'UZS', balanceMinor: 1_000_000n, name: 'A' },
      { counterpartyId: 'cp-2', currency: 'USD', balanceMinor: 100_00n, name: 'B' },
    ]);
    const r = await svc.counterpartyBalanceReport('acc', { ...BASE_FILTER, limit: 1 });
    expect(r.items).toHaveLength(1);
    expect(r.items[0]?.currency).toBe('UZS');
    expect(r.summaries.mixedCurrency).toBe(true);
    expect(r.summaries.totalDebtMinor).toBe('121000000');
  });

  it('kursi yo‘q valyuta (M-12) sahifa tashqarisida bo‘lsa ham hisobga olinadi', async () => {
    const { svc } = makeService([
      { counterpartyId: 'cp-1', currency: 'UZS', balanceMinor: 1_000_000n, name: 'A' },
      { counterpartyId: 'cp-2', currency: 'EUR', balanceMinor: 500n, name: 'B' },
    ]);
    const r = await svc.counterpartyBalanceReport('acc', { ...BASE_FILTER, limit: 1 });
    expect(r.summaries.totalDebtMinor).toBe('1000000'); // EUR jamiga QO'SHILMAYDI
    expect(r.summaries.unconvertedByCurrency).toEqual([{ currency: 'EUR', amountMinor: '500' }]);
  });

  it('groupBy=counterparty ko‘p-valyutada net-per-kontragent bo‘yicha sanaydi', async () => {
    const { svc } = makeService([
      // cp-x: +1 200 000 UZS va −100 USD (= −1 200 000 base) ⇒ net NOL
      { counterpartyId: 'cp-x', currency: 'UZS', balanceMinor: 1_200_000n, name: 'X' },
      { counterpartyId: 'cp-x', currency: 'USD', balanceMinor: -100n, name: 'X' },
      { counterpartyId: 'cp-y', currency: 'UZS', balanceMinor: 700n, name: 'Y' },
    ]);
    const r = await svc.counterpartyBalanceReport('acc', {
      ...BASE_FILTER,
      groupBy: 'counterparty',
      limit: 1,
    });
    // Qator-kesim bo'yicha sanalsa debt 1 200 700 / credit 1 200 000 chiqardi;
    // kontragent-kesimda cp-x nolga tushadi va faqat cp-y qoladi.
    expect(r.summaries.totalDebtMinor).toBe('700');
    expect(r.summaries.totalCreditMinor).toBe('0');
    expect(r.summaries.debtorCount).toBe(1);
    expect(r.summaries.creditorCount).toBe(0);
  });
});
