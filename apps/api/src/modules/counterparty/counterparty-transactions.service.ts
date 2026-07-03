import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

export type TxnType = 'sale' | 'supply' | 'payment_in' | 'payment_out';

export interface TxnRow {
  id: string;
  type: TxnType;
  number: string;
  counterpartyId: string | null;
  counterpartyName: string | null;
  moment: string;
  sumMinor: string;
  /** +1 = money/goods toward us (sale, incoming payment); -1 = away (supply, outgoing payment). */
  sign: 1 | -1;
}

/**
 * Unified counterparty transaction feed — merges the posted sale (retail-sale +
 * demand), supply, and payment (in/out) documents into one time-ordered list.
 * Powers the «Tranzaksiyalar» tab and a per-counterparty history. Each source is
 * capped and the merge is paginated in-memory (a recent-activity feed, not a
 * deep ledger export).
 */
@Injectable()
export class CounterpartyTransactionsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(
    accountId: string,
    opts: { counterpartyId?: string; limit: number; page: number },
  ): Promise<{ items: TxnRow[]; total: number }> {
    const { counterpartyId, limit, page } = opts;
    const CAP = 300; // per-source cap for the merged feed
    const base = { accountId, ...(counterpartyId ? { agentId: counterpartyId } : {}) };
    const select = {
      id: true,
      name: true,
      agentId: true,
      moment: true,
      sumMinor: true,
      agent: { select: { name: true } },
    } as const;
    const q = { select, orderBy: { moment: 'desc' as const }, take: CAP };

    const [sales, demands, supplies, pIn, pOut] = await Promise.all([
      this.prisma.client.retailSale.findMany({ where: { ...base, state: 'posted' }, ...q }),
      this.prisma.client.demand.findMany({ where: { ...base, state: 'posted' }, ...q }),
      this.prisma.client.supply.findMany({ where: { ...base, state: 'posted' }, ...q }),
      this.prisma.client.paymentIn.findMany({ where: base, ...q }),
      this.prisma.client.paymentOut.findMany({ where: base, ...q }),
    ]);

    type Raw = {
      id: string;
      name: string;
      agentId: string | null;
      moment: Date;
      sumMinor: bigint;
      agent: { name: string } | null;
    };
    const map = (rows: Raw[], type: TxnType, sign: 1 | -1): TxnRow[] =>
      rows.map((r) => ({
        id: r.id,
        type,
        number: r.name,
        counterpartyId: r.agentId,
        counterpartyName: r.agent?.name ?? null,
        moment: r.moment.toISOString(),
        sumMinor: r.sumMinor.toString(),
        sign,
      }));

    const all = [
      ...map(sales, 'sale', 1),
      ...map(demands, 'sale', 1),
      ...map(supplies, 'supply', -1),
      ...map(pIn, 'payment_in', 1),
      ...map(pOut, 'payment_out', -1),
    ].sort((a, b) => (a.moment < b.moment ? 1 : a.moment > b.moment ? -1 : 0));

    const total = all.length;
    const items = all.slice((page - 1) * limit, page * limit);
    return { items, total };
  }
}
