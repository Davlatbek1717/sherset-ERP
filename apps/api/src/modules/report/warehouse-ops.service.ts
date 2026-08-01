import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service.js';
import { reportDateBounds } from './report-date-bounds.util.js';
import { consolidateToBase, loadRateContext } from './report-rate-ctx.util.js';

/**
 * «Ombor operatsiyalari» (Sherset custom) — the supply→putaway→picking chain
 * on one screen. Answers the operational questions the document lists can't:
 * how much was received in the window, how many placement/picking tasks are
 * waiting RIGHT NOW, how many were completed in the window, and how each
 * warehouse-keeper (omborchi) is doing.
 *
 * Source data:
 *  - inbound  = Supply (state='posted', !deletedAt, moment in window) — count
 *    + base-consolidated sum; drafts counted separately (created, not posted).
 *  - putaway  = RestockTask type='restock' (supply putaway + return putback).
 *  - picking  = RestockTask type='picking' (per-sklad collect tasks).
 *    Backlog (pending/in_progress) is CURRENT state — not window-bound: an old
 *    unplaced task is still work owed today. done is counted in-window by
 *    updatedAt (status is terminal, so updatedAt = completion moment).
 *  - outbound = Demand (posted, in window) — wholesale shipments.
 */
export const WarehouseOpsFilterSchema = z.object({
  /** Inclusive lower bound (Tashkent calendar day). */
  dateFrom: z.coerce.date(),
  /** Inclusive upper bound (rolled to end-of-day). */
  dateTo: z.coerce.date(),
});
export type WarehouseOpsFilter = z.infer<typeof WarehouseOpsFilterSchema>;

export interface KeeperRow {
  /** null = tasks whose sklad has no keeper assigned. */
  assigneeId: string | null;
  assigneeName: string;
  putawayBacklog: number;
  putawayDone: number;
  pickingBacklog: number;
  pickingDone: number;
}

export interface WarehouseOpsReport {
  inbound: { suppliesCount: number; suppliesSumMinor: string; draftCount: number };
  putaway: { pending: number; inProgress: number; doneInWindow: number };
  picking: { pending: number; inProgress: number; doneInWindow: number };
  outbound: { demandsCount: number; demandsSumMinor: string };
  keepers: KeeperRow[];
  /** Account base currency every sum is consolidated into. */
  currency: string;
  /** True when window documents span >1 currency. */
  mixedCurrency: boolean;
}

type TaskGroupRow = {
  type: string;
  status: string;
  assigneeId: string | null;
  assigneeName: string | null;
  _count: { _all: number };
};

@Injectable()
export class WarehouseOpsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async report(accountId: string, raw: unknown): Promise<WarehouseOpsReport> {
    const filter = WarehouseOpsFilterSchema.parse(raw);
    const { gte, lt } = reportDateBounds(filter.dateFrom, filter.dateTo);
    const window = { gte, lt };
    const ctx = await loadRateContext(this.prisma.client, accountId);
    const seen = new Set<string>();

    const [supplyByCur, supplyDrafts, demandByCur, backlogRows, doneRows] = await Promise.all([
      this.prisma.client.supply.groupBy({
        by: ['currency'],
        where: { accountId, deletedAt: null, state: 'posted', moment: window },
        _count: { _all: true },
        _sum: { sumMinor: true },
      }),
      this.prisma.client.supply.count({
        where: { accountId, deletedAt: null, state: 'draft', moment: window },
      }),
      this.prisma.client.demand.groupBy({
        by: ['currency'],
        where: { accountId, deletedAt: null, state: 'posted', moment: window },
        _count: { _all: true },
        _sum: { sumMinor: true },
      }),
      // Current backlog — deliberately NOT window-bound (see header comment).
      this.prisma.client.restockTask.groupBy({
        by: ['type', 'status', 'assigneeId', 'assigneeName'],
        where: { accountId, status: { in: ['pending', 'in_progress'] } },
        _count: { _all: true },
      }),
      this.prisma.client.restockTask.groupBy({
        by: ['type', 'status', 'assigneeId', 'assigneeName'],
        where: { accountId, status: 'done', updatedAt: window },
        _count: { _all: true },
      }),
    ]);

    let suppliesCount = 0;
    let suppliesSum = 0n;
    for (const r of supplyByCur) {
      suppliesCount += r._count._all;
      suppliesSum += consolidateToBase(r._sum.sumMinor ?? 0n, r.currency, ctx, seen);
    }
    let demandsCount = 0;
    let demandsSum = 0n;
    for (const r of demandByCur) {
      demandsCount += r._count._all;
      demandsSum += consolidateToBase(r._sum.sumMinor ?? 0n, r.currency, ctx, seen);
    }

    const putaway = { pending: 0, inProgress: 0, doneInWindow: 0 };
    const picking = { pending: 0, inProgress: 0, doneInWindow: 0 };
    const keepers = new Map<string, KeeperRow>();
    const keeperOf = (id: string | null, name: string | null): KeeperRow => {
      const key = id ?? '';
      let row = keepers.get(key);
      if (!row) {
        row = {
          assigneeId: id,
          assigneeName: name ?? '—',
          putawayBacklog: 0,
          putawayDone: 0,
          pickingBacklog: 0,
          pickingDone: 0,
        };
        keepers.set(key, row);
      }
      return row;
    };
    const tally = (rows: TaskGroupRow[]) => {
      for (const r of rows) {
        const bucket = r.type === 'picking' ? picking : putaway;
        const keeper = keeperOf(r.assigneeId, r.assigneeName);
        const isPicking = r.type === 'picking';
        if (r.status === 'pending') {
          bucket.pending += r._count._all;
          if (isPicking) keeper.pickingBacklog += r._count._all;
          else keeper.putawayBacklog += r._count._all;
        } else if (r.status === 'in_progress') {
          bucket.inProgress += r._count._all;
          if (isPicking) keeper.pickingBacklog += r._count._all;
          else keeper.putawayBacklog += r._count._all;
        } else {
          bucket.doneInWindow += r._count._all;
          if (isPicking) keeper.pickingDone += r._count._all;
          else keeper.putawayDone += r._count._all;
        }
      }
    };
    tally(backlogRows as TaskGroupRow[]);
    tally(doneRows as TaskGroupRow[]);

    const keeperRows = Array.from(keepers.values()).sort(
      (a, b) =>
        b.putawayBacklog + b.pickingBacklog - (a.putawayBacklog + a.pickingBacklog) ||
        b.putawayDone + b.pickingDone - (a.putawayDone + a.pickingDone) ||
        a.assigneeName.localeCompare(b.assigneeName),
    );

    return {
      inbound: {
        suppliesCount,
        suppliesSumMinor: suppliesSum.toString(),
        draftCount: supplyDrafts,
      },
      putaway,
      picking,
      outbound: { demandsCount, demandsSumMinor: demandsSum.toString() },
      keepers: keeperRows,
      currency: ctx.baseCode,
      mixedCurrency: seen.size > 1,
    };
  }
}
