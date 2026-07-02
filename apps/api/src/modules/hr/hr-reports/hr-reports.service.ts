import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { startOfLocalDay } from '../hr-shared/tz.util.js';
import type { ReportPeriodInput } from './hr-reports.schema.js';

export interface ReportSeriesPoint {
  date: string;
  /** sales metric → BigInt-as-string (tiyin); messages metric → count-as-string. */
  value: string;
}

export interface TopCounterparty {
  counterpartyId: string;
  name: string;
  /** sales → total tiyin (string); messages → message count (string). */
  value: string;
}

export interface HrReport {
  metric: 'sales' | 'messages';
  series: ReportSeriesPoint[];
  topCounterparties: TopCounterparty[];
  /** Grand total over the period (string — tiyin or count). */
  total: string;
}

/**
 * HR Reports read model. Two metrics:
 *   • sales    — posted Demand.sumMinor bucketed by local day + top agents
 *   • messages — HrTelegramOutbox sent count bucketed + top recipients
 *
 * Day bucketing uses Asia/Tashkent local midnight so the BarChart x-axis
 * matches the admin calendar. Money stays BigInt → string.
 */
@Injectable()
export class HrReportsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async report(accountId: string, input: ReportPeriodInput): Promise<HrReport> {
    const fromStart = startOfLocalDay(input.dateFrom);
    const toStart = startOfLocalDay(input.dateTo);
    const toEnd = new Date(toStart.getTime() + 24 * 60 * 60 * 1000);

    return input.metric === 'sales'
      ? this.salesReport(accountId, fromStart, toEnd)
      : this.messagesReport(accountId, fromStart, toEnd);
  }

  private async salesReport(accountId: string, from: Date, toEnd: Date): Promise<HrReport> {
    const demands = await this.prisma.client.demand.findMany({
      where: { accountId, state: 'posted', postedAt: { gte: from, lt: toEnd } },
      select: { sumMinor: true, postedAt: true, agentId: true, agent: { select: { name: true } } },
    });

    const byDay = new Map<string, bigint>();
    const byAgent = new Map<string, { name: string; total: bigint }>();
    let total = 0n;
    for (const d of demands) {
      total += d.sumMinor;
      if (d.postedAt) {
        const key = isoDate(startOfLocalDay(d.postedAt));
        byDay.set(key, (byDay.get(key) ?? 0n) + d.sumMinor);
      }
      if (d.agentId) {
        const cur = byAgent.get(d.agentId) ?? { name: d.agent?.name ?? '—', total: 0n };
        cur.total += d.sumMinor;
        byAgent.set(d.agentId, cur);
      }
    }

    return {
      metric: 'sales',
      series: denseSeries(byDay, from, toEnd),
      topCounterparties: topN(byAgent, 5),
      total: total.toString(),
    };
  }

  private async messagesReport(accountId: string, from: Date, toEnd: Date): Promise<HrReport> {
    const rows = await this.prisma.client.hrTelegramOutbox.findMany({
      where: { accountId, status: 'sent', sentAt: { gte: from, lt: toEnd } },
      select: {
        sentAt: true,
        counterpartyId: true,
        counterparty: { select: { name: true } },
      },
    });

    const byDay = new Map<string, bigint>();
    const byCp = new Map<string, { name: string; total: bigint }>();
    let total = 0n;
    for (const r of rows) {
      total += 1n;
      if (r.sentAt) {
        const key = isoDate(startOfLocalDay(r.sentAt));
        byDay.set(key, (byDay.get(key) ?? 0n) + 1n);
      }
      if (r.counterpartyId) {
        const cur = byCp.get(r.counterpartyId) ?? { name: r.counterparty?.name ?? '—', total: 0n };
        cur.total += 1n;
        byCp.set(r.counterpartyId, cur);
      }
    }

    return {
      metric: 'messages',
      series: denseSeries(byDay, from, toEnd),
      topCounterparties: topN(byCp, 5),
      total: total.toString(),
    };
  }
}

/** Zero-filled day series from `from` (inclusive) to the day before `toEnd`. */
function denseSeries(byDay: Map<string, bigint>, from: Date, toEnd: Date): ReportSeriesPoint[] {
  const out: ReportSeriesPoint[] = [];
  const dayMs = 24 * 60 * 60 * 1000;
  for (let t = from.getTime(); t < toEnd.getTime(); t += dayMs) {
    const key = isoDate(new Date(t));
    out.push({ date: key, value: (byDay.get(key) ?? 0n).toString() });
  }
  return out;
}

function topN(map: Map<string, { name: string; total: bigint }>, n: number): TopCounterparty[] {
  return [...map.entries()]
    .sort((a, b) => (b[1].total > a[1].total ? 1 : b[1].total < a[1].total ? -1 : 0))
    .slice(0, n)
    .map(([counterpartyId, v]) => ({
      counterpartyId,
      name: v.name,
      value: v.total.toString(),
    }));
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
