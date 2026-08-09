import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { BUDGET_STATUS } from './budget-variance.js';
import { ExpenseBudgetService } from './expense-budget.service.js';

/**
 * MK12 servis darajasidagi qulflar (4M TZ §8).
 *
 * Pure qatlam (`expense-fact` / `budget-variance`) o'z testlariga ega; bu
 * yerda YIG'ISH tekshiriladi: qaysi jadval, qaysi shart, qaysi oy chegarasi
 * va javob shakli. Bu uch narsa buzilsa pure testlar YASHIL qolaveradi.
 */

interface Captured {
  cashOut?: Record<string, unknown>;
  paymentOut?: Record<string, unknown>;
  drawer?: Record<string, unknown>;
  budgetWhere?: Record<string, unknown>;
}

interface StubData {
  items?: Array<{ id: string; name: string; archived: boolean }>;
  budgets?: Array<{
    id: string;
    expenseItemId: string;
    plannedMinor: bigint;
    currency: string;
    note: string | null;
  }>;
  cashOut?: Array<Record<string, unknown>>;
  paymentOut?: Array<Record<string, unknown>>;
  drawer?: Array<Record<string, unknown>>;
  currencies?: Array<Record<string, unknown>>;
}

function stub(data: StubData): { svc: ExpenseBudgetService; captured: Captured } {
  const captured: Captured = {};
  const client = {
    currency: { findMany: async () => data.currencies ?? [] },
    expenseItem: { findMany: async () => data.items ?? [] },
    expenseBudget: {
      findMany: async (args: { where: Record<string, unknown> }) => {
        captured.budgetWhere = args.where;
        return data.budgets ?? [];
      },
    },
    cashOut: {
      groupBy: async (args: Record<string, unknown>) => {
        captured.cashOut = args;
        return data.cashOut ?? [];
      },
    },
    paymentOut: {
      groupBy: async (args: Record<string, unknown>) => {
        captured.paymentOut = args;
        return data.paymentOut ?? [];
      },
    },
    retailDrawerCashOut: {
      groupBy: async (args: Record<string, unknown>) => {
        captured.drawer = args;
        return data.drawer ?? [];
      },
    },
  };
  return {
    svc: new ExpenseBudgetService({ client } as unknown as PrismaService),
    captured,
  };
}

const RENT = { id: 'item-rent', name: 'Аренда', archived: false };

function money(over: Record<string, unknown>) {
  return {
    expenseItem: null,
    expenseItemId: null,
    currency: 'UZS',
    rateValue: 100_000_000n,
    _sum: { sumMinor: 0n },
    ...over,
  };
}

describe('ExpenseBudgetService.report — manba so`rovlari', () => {
  it('yashiq jadvalidan FAQAT `kind=expense` olinadi (inkassatsiya emas)', async () => {
    const { svc, captured } = stub({ items: [RENT] });
    await svc.report('acc', { yearMonth: '2026-08' });

    expect(captured.drawer?.where).toMatchObject({ kind: 'expense' });
  });

  it('uchala manba ham `posted` va o`chirilmagan hujjat bilan cheklanadi', async () => {
    const { svc, captured } = stub({ items: [RENT] });
    await svc.report('acc', { yearMonth: '2026-08' });

    for (const q of [captured.cashOut, captured.paymentOut, captured.drawer]) {
      expect(q?.where).toMatchObject({ accountId: 'acc', state: 'posted', deletedAt: null });
    }
  });

  it('oy chegarasi Toshkent yarim tuni (UTC yarim tuni EMAS)', async () => {
    const { svc, captured } = stub({ items: [RENT] });
    await svc.report('acc', { yearMonth: '2026-08' });

    const where = captured.cashOut?.where as { moment: { gte: Date; lt: Date } };
    // Toshkent UTC+05 ⇒ 1-avgust 00:00 = 31-iyul 19:00 UTC.
    expect(where.moment.gte.toISOString()).toBe('2026-07-31T19:00:00.000Z');
    expect(where.moment.lt.toISOString()).toBe('2026-08-31T19:00:00.000Z');
  });

  it('faktga YOZUV yo`q — servis hech qanday hujjat yaratmaydi', () => {
    const src = readFileSync(join(import.meta.dirname, 'expense-budget.service.ts'), 'utf8');
    // Byudjet ekrani xarajat hujjatiga TEGMAYDI (TZ §8).
    for (const table of ['cashOut', 'paymentOut', 'retailDrawerCashOut']) {
      expect(src).not.toMatch(new RegExp(`${table}\\.(create|update|upsert|delete)`));
    }
  });
});

describe('ExpenseBudgetService.report — reja/fakt/og`ish', () => {
  it('reja yo`q oyda og`ish «plan qo`yilmagan», 100% ham 0% ham emas', async () => {
    const { svc } = stub({
      items: [RENT],
      budgets: [],
      cashOut: [money({ expenseItem: 'Аренда', _sum: { sumMinor: 500_00n } })],
    });
    const r = await svc.report('acc', { yearMonth: '2026-08' });

    const row = r.rows.find((x) => x.expenseItemId === 'item-rent');
    expect(row?.status).toBe(BUDGET_STATUS.noPlan);
    expect(row?.usedPercent).toBeNull();
    expect(row?.varianceMinor).toBeNull();
    expect(row?.actualMinor).toBe('50000');
    // Jamlar faqat rejasi bor qatorlardan — rejasiz pul alohida ko'rinadi.
    expect(r.totals.plannedMinor).toBe('0');
    expect(r.unplannedActualMinor).toBe('50000');
  });

  it('reja bor: og`ish va foiz hisoblanadi', async () => {
    const { svc } = stub({
      items: [RENT],
      budgets: [
        {
          id: 'b1',
          expenseItemId: 'item-rent',
          plannedMinor: 1_000_00n,
          currency: 'UZS',
          note: null,
        },
      ],
      cashOut: [money({ expenseItem: 'Аренда', _sum: { sumMinor: 400_00n } })],
      drawer: [money({ expenseItemId: 'item-rent', _sum: { sumMinor: 200_00n } })],
    });
    const r = await svc.report('acc', { yearMonth: '2026-08' });

    const row = r.rows[0];
    expect(row?.actualMinor).toBe('60000'); // 400.00 + 200.00
    expect(row?.varianceMinor).toBe('-40000');
    expect(row?.usedPercent).toBe('60.00');
    expect(row?.status).toBe(BUDGET_STATUS.within);
    expect(r.totals.usedPercent).toBe('60.00');
  });

  it('kursi yo`q valyutadagi REJA 0 deb o`qilmaydi — NULL va bayroq', async () => {
    const { svc } = stub({
      items: [RENT],
      budgets: [
        {
          id: 'b1',
          expenseItemId: 'item-rent',
          plannedMinor: 100_00n,
          currency: 'USD',
          note: null,
        },
      ],
      cashOut: [money({ expenseItem: 'Аренда', _sum: { sumMinor: 500_00n } })],
    });
    const r = await svc.report('acc', { yearMonth: '2026-08' });

    const row = r.rows[0];
    // 0 deb o'qilsa status «over» bo'lardi — mavjud bo'lmagan muammo.
    expect(row?.plannedMinor).toBeNull();
    expect(row?.planUnconvertible).toBe(true);
    expect(row?.status).toBe(BUDGET_STATUS.noPlan);
  });

  it('kursi yo`q valyutadagi FAKT jamiga qo`shilmaydi, alohida qatorda', async () => {
    const { svc } = stub({
      items: [RENT],
      budgets: [
        {
          id: 'b1',
          expenseItemId: 'item-rent',
          plannedMinor: 1_000_00n,
          currency: 'UZS',
          note: null,
        },
      ],
      cashOut: [
        money({ expenseItem: 'Аренда', _sum: { sumMinor: 100_00n } }),
        money({ expenseItem: 'Аренда', currency: 'USD', _sum: { sumMinor: 100_00n } }),
      ],
    });
    const r = await svc.report('acc', { yearMonth: '2026-08' });

    expect(r.rows[0]?.actualMinor).toBe('10000');
    expect(r.unconvertedByCurrency).toEqual([{ currency: 'USD', amountMinor: '10000' }]);
  });

  it('moddasiz pul alohida qatorda ko`rinadi (yo`qolmaydi)', async () => {
    const { svc } = stub({
      items: [RENT],
      cashOut: [money({ expenseItem: null, _sum: { sumMinor: 33_00n } })],
    });
    const r = await svc.report('acc', { yearMonth: '2026-08' });

    expect(r.untaggedMinor).toBe('3300');
    expect(r.rows.at(-1)?.expenseItemId).toBeNull();
    expect(r.rows.at(-1)?.actualMinor).toBe('3300');
  });

  it('tartib: oshib ketgan qator tepada', async () => {
    const { svc } = stub({
      items: [RENT, { id: 'item-ads', name: 'Реклама', archived: false }],
      budgets: [
        {
          id: 'b1',
          expenseItemId: 'item-rent',
          plannedMinor: 1_000_00n,
          currency: 'UZS',
          note: null,
        },
        {
          id: 'b2',
          expenseItemId: 'item-ads',
          plannedMinor: 100_00n,
          currency: 'UZS',
          note: null,
        },
      ],
      cashOut: [
        money({ expenseItem: 'Аренда', _sum: { sumMinor: 100_00n } }),
        money({ expenseItem: 'Реклама', _sum: { sumMinor: 500_00n } }),
      ],
    });
    const r = await svc.report('acc', { yearMonth: '2026-08' });

    expect(r.rows[0]?.expenseItemId).toBe('item-ads');
    expect(r.rows[0]?.status).toBe(BUDGET_STATUS.over);
  });

  it('reja so`rovi AYNAN so`ralgan oyni oladi', async () => {
    const { svc, captured } = stub({ items: [RENT] });
    await svc.report('acc', { yearMonth: '2026-08' });
    expect(captured.budgetWhere).toEqual({ accountId: 'acc', yearMonth: '2026-08' });
  });
});
