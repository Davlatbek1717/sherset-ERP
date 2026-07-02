import { Prisma } from '@moysklad/db';
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { type AbcClass, DEFAULT_INTERVALS, classifyAbc } from './abc.js';

export type CyclePriority = 'overdue' | 'due_today' | 'due_soon';

export interface CycleScheduleItem {
  productId: string;
  productCode: string | null;
  productName: string;
  groupName: string | null;
  abcClass: AbcClass;
  /** Sales value over the window, formatted as tiyin string. */
  salesValueMinor: string;
  intervalDays: number;
  lastCountedAt: string | null;
  dueAt: string;
  overdueDays: number;
  priority: CyclePriority;
}

export interface CycleSchedule {
  total: number;
  overdue: number;
  dueToday: number;
  dueSoon: number;
  items: CycleScheduleItem[];
  /** Window the sales aggregation was computed over (ISO). */
  windowFrom: string;
  windowTo: string;
}

const SALES_WINDOW_DAYS = 90;
const DUE_SOON_WINDOW_DAYS = 7;

function startOfDay(d: Date): Date {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  return s;
}

function diffDays(later: Date, earlier: Date): number {
  return Math.floor((later.getTime() - earlier.getTime()) / (1000 * 60 * 60 * 24));
}

@Injectable()
export class CycleService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getTodaySchedule(
    accountId: string,
    options: { now?: Date; limit?: number } = {},
  ): Promise<CycleSchedule> {
    const now = options.now ?? new Date();
    const limit = options.limit ?? 200;
    const today = startOfDay(now);

    const salesFrom = new Date(now);
    salesFrom.setDate(salesFrom.getDate() - SALES_WINDOW_DAYS);

    // Aggregate sales value per product over the window. quantity is Decimal,
    // priceMinor is BigInt — multiply in app code to avoid PG bigint/decimal
    // coercion gotchas, and to keep tiyin precision exact.
    const lines = await this.prisma.client.demandPosition.findMany({
      where: {
        accountId,
        productId: { not: null },
        demand: { accountId, state: 'posted', moment: { gte: salesFrom } },
      },
      select: { productId: true, quantity: true, priceMinor: true },
    });

    if (lines.length === 0) {
      return this.empty(salesFrom, now);
    }

    const salesByProduct = new Map<string, Prisma.Decimal>();
    for (const ln of lines) {
      if (!ln.productId) continue;
      const value = ln.quantity.times(new Prisma.Decimal(ln.priceMinor.toString()));
      const ex = salesByProduct.get(ln.productId);
      salesByProduct.set(ln.productId, ex ? ex.plus(value) : value);
    }

    const productIds = [...salesByProduct.keys()];
    if (productIds.length === 0) {
      return this.empty(salesFrom, now);
    }

    const products = await this.prisma.client.product.findMany({
      where: { accountId, id: { in: productIds }, archived: false },
      select: {
        id: true,
        name: true,
        code: true,
        productFolderId: true,
        productFolder: { select: { name: true } },
      },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    const lastCounts = await this.prisma.client.analitikaCount.groupBy({
      by: ['productId'],
      where: { accountId, productId: { in: productIds }, decision: 'accepted' },
      _max: { reviewedAt: true },
    });
    const lastByProduct = new Map(lastCounts.map((lc) => [lc.productId, lc._max.reviewedAt]));

    const abcInput = productIds
      .filter((id) => productMap.has(id))
      .map((id) => ({
        productId: id,
        salesValue: salesByProduct.get(id) ?? new Prisma.Decimal(0),
      }));
    const abc = classifyAbc(abcInput);
    const classByProduct = new Map(abc.items.map((r) => [r.productId, r.class] as const));

    const scheduleItems: CycleScheduleItem[] = [];
    for (const product of products) {
      const cls = classByProduct.get(product.id);
      if (!cls) continue;
      const intervalDays = DEFAULT_INTERVALS[cls];
      const lastCountedAt = lastByProduct.get(product.id) ?? null;

      const dueAt = lastCountedAt
        ? (() => {
            const d = new Date(lastCountedAt);
            d.setDate(d.getDate() + intervalDays);
            d.setHours(0, 0, 0, 0);
            return d;
          })()
        : today;

      const overdueDays = Math.max(0, diffDays(today, dueAt));
      const dueDelta = diffDays(dueAt, today);

      let priority: CyclePriority;
      if (overdueDays > 0) priority = 'overdue';
      else if (dueDelta === 0) priority = 'due_today';
      else if (dueDelta <= DUE_SOON_WINDOW_DAYS) priority = 'due_soon';
      else continue;

      const salesValue = salesByProduct.get(product.id) ?? new Prisma.Decimal(0);
      scheduleItems.push({
        productId: product.id,
        productCode: product.code,
        productName: product.name,
        groupName: product.productFolder?.name ?? null,
        abcClass: cls,
        salesValueMinor: salesValue.toFixed(0),
        intervalDays,
        lastCountedAt: lastCountedAt ? lastCountedAt.toISOString() : null,
        dueAt: dueAt.toISOString(),
        overdueDays,
        priority,
      });
    }

    const classRank: Record<AbcClass, number> = { A: 0, B: 1, C: 2 };
    scheduleItems.sort((a, b) => {
      if (a.overdueDays !== b.overdueDays) return b.overdueDays - a.overdueDays;
      if (a.abcClass !== b.abcClass) return classRank[a.abcClass] - classRank[b.abcClass];
      return a.productId.localeCompare(b.productId);
    });

    const trimmed = scheduleItems.slice(0, limit);
    return {
      total: trimmed.length,
      overdue: trimmed.filter((i) => i.priority === 'overdue').length,
      dueToday: trimmed.filter((i) => i.priority === 'due_today').length,
      dueSoon: trimmed.filter((i) => i.priority === 'due_soon').length,
      items: trimmed,
      windowFrom: salesFrom.toISOString(),
      windowTo: now.toISOString(),
    };
  }

  private empty(from: Date, to: Date): CycleSchedule {
    return {
      total: 0,
      overdue: 0,
      dueToday: 0,
      dueSoon: 0,
      items: [],
      windowFrom: from.toISOString(),
      windowTo: to.toISOString(),
    };
  }
}
