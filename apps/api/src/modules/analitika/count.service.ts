import type { Prisma } from '@moysklad/db';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  BulkApproveSchema,
  CountFilterSchema,
  ReportFilterSchema,
  ResetSchema,
  ReviewActionSchema,
  type UpsertCountInput,
  UpsertCountSchema,
} from './count.schema.js';
import { VarianceConfigService } from './variance-config.service.js';
import { computeVarianceStatus } from './variance-status.util.js';

/** Shape returned to the client (BigInt → string, Decimal → number). */
export interface CountDto {
  id: string;
  productId: string;
  productName: string;
  productCode: string | null;
  storeId: string;
  expectedQty: number;
  kamQty: number;
  kopQty: number;
  netQty: number;
  salePriceMinor: string;
  status: 'green' | 'yellow' | 'red';
  decision: string | null;
  counterId: string;
  countedAt: string;
  reviewerId: string | null;
  reasonCodeId: string | null;
  note: string | null;
}

/** One row on the Sanab kiritish screen (product + stock + any current count). */
export interface CountProductRow {
  productId: string;
  name: string;
  code: string | null;
  expectedQty: number;
  salePriceMinor: string;
  kamQty: number;
  kopQty: number;
  status: 'green' | 'yellow' | 'red' | null;
  decision: string | null;
}

/** Bosh panel summary KPIs. Money fields are minor-unit strings. */
export interface CountSummary {
  total: number;
  green: number;
  yellow: number;
  red: number;
  pendingApproval: number;
  lossMinor: string;
  surplusMinor: string;
  netMinor: string;
}

/** A grouped report bucket (by counter / group / reason). Money is minor-string. */
export interface ReportBucket {
  key: string;
  label: string;
  count: number;
  moneyMinor: string;
}

/** One product row in the money report. moneyMinor is signed (loss negative). */
export interface ReportProductRow {
  productId: string;
  name: string;
  code: string | null;
  groupName: string | null;
  expectedQty: number;
  netQty: number;
  pct: number;
  salePriceMinor: string;
  moneyMinor: string;
  status: 'green' | 'yellow' | 'red';
  counterName: string;
  countedAt: string;
}

export interface CountReport {
  lossMinor: string;
  surplusMinor: string;
  netMinor: string;
  byProduct: ReportProductRow[];
  byCounter: ReportBucket[];
  byGroup: ReportBucket[];
  byReason: ReportBucket[];
  top10: ReportProductRow[];
}

/** One row in the "Sanash holati" snapshot. */
export interface SnapshotRow {
  productId: string;
  productName: string;
  productCode: string | null;
  groupName: string | null;
  expectedQty: number;
  netQty: number;
  variancePct: number;
  salePriceMinor: string;
  moneyMinor: string;
  status: 'green' | 'yellow' | 'red';
  decision: string | null;
  counterName: string;
  countedAt: string;
}

type SalePricesJson = Array<{ priceTypeId?: string; value?: string }> | null;

@Injectable()
export class CountService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(VarianceConfigService) private readonly variance: VarianceConfigService,
  ) {}

  /** List the current-period counts, newest first, enriched with product info. */
  async list(accountId: string, rawFilter: unknown): Promise<{ items: CountDto[]; total: number }> {
    const filter = CountFilterSchema.parse(rawFilter);
    const where: Prisma.AnalitikaCountWhereInput = {
      accountId,
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.storeId ? { storeId: filter.storeId } : {}),
      ...this.viewWhere(filter.view),
    };
    const rows = await this.prisma.client.analitikaCount.findMany({
      where,
      orderBy: { countedAt: 'desc' },
      take: 500,
    });
    const products = await this.loadProducts(
      accountId,
      rows.map((r) => r.productId),
    );
    let items = rows.map((r) => this.toDto(r, products.get(r.productId)));
    if (filter.search) {
      const q = filter.search.toLowerCase();
      items = items.filter(
        (i) =>
          i.productName.toLowerCase().includes(q) ||
          (i.productCode ?? '').toLowerCase().includes(q),
      );
    }
    return { items, total: items.length };
  }

  /**
   * Upsert one product's count. Snapshots the system stock (expectedQty) and
   * sale price at count time, derives net + status, and persists. Both
   * quantities zero clears (deletes) the count. Re-counting an already-reviewed
   * row resets its decision so it re-enters the approval flow.
   *
   * Concurrency: the (accountId, productId, storeId) unique key guarantees a
   * single row; a P2002 race (two counters create simultaneously) falls back to
   * an update — last write wins, matching the spec.
   */
  async upsert(
    accountId: string,
    counterId: string,
    raw: unknown,
  ): Promise<{ cleared: true } | CountDto> {
    const input = this.parse(raw);

    // Clear: both zero → remove any existing row (idempotent).
    if (input.kamQty === 0 && input.kopQty === 0) {
      await this.prisma.client.analitikaCount.deleteMany({
        where: { accountId, productId: input.productId, storeId: input.storeId },
      });
      return { cleared: true };
    }

    const expectedQty = await this.loadStockQty(accountId, input.storeId, input.productId);
    const salePriceMinor = await this.loadSalePriceMinor(accountId, input.productId);
    const netQty = input.kopQty - input.kamQty;
    const thresholds = await this.variance.get(accountId);
    const status = computeVarianceStatus({
      expectedQty,
      netQty,
      greenMaxPct: thresholds.greenMaxPct,
      yellowMaxPct: thresholds.yellowMaxPct,
    });

    const createData: Prisma.AnalitikaCountUncheckedCreateInput = {
      accountId,
      productId: input.productId,
      storeId: input.storeId,
      expectedQty,
      kamQty: input.kamQty,
      kopQty: input.kopQty,
      netQty,
      salePriceMinor,
      status,
      counterId,
      countedAt: new Date(),
      // re-count resets review state
      decision: null,
      reviewerId: null,
      reviewedAt: null,
      reasonCodeId: null,
      note: input.note ?? null,
    };
    const updateData: Prisma.AnalitikaCountUncheckedUpdateInput = {
      expectedQty,
      kamQty: input.kamQty,
      kopQty: input.kopQty,
      netQty,
      salePriceMinor,
      status,
      counterId,
      countedAt: new Date(),
      decision: null,
      reviewerId: null,
      reviewedAt: null,
      reasonCodeId: null,
      note: input.note ?? null,
    };
    const whereUnique: Prisma.AnalitikaCountWhereUniqueInput = {
      accountId_productId_storeId: {
        accountId,
        productId: input.productId,
        storeId: input.storeId,
      },
    };

    let row: Awaited<ReturnType<typeof this.prisma.client.analitikaCount.upsert>>;
    try {
      row = await this.prisma.client.analitikaCount.upsert({
        where: whereUnique,
        create: createData,
        update: updateData,
      });
    } catch (e) {
      // Concurrent create race → fall back to update (last write wins).
      if ((e as { code?: string }).code === 'P2002') {
        row = await this.prisma.client.analitikaCount.update({
          where: whereUnique,
          data: updateData,
        });
      } else {
        throw e;
      }
    }

    const product = (await this.loadProducts(accountId, [row.productId])).get(row.productId);
    return this.toDto(row, product);
  }

  /**
   * Rows for the "Sanab kiritish" screen: every active product with its system
   * stock ("REGOS qoldig'i"), default sale price, and any existing count for
   * the resolved store. Store defaults to the account's first active store.
   */
  async listProductsForCounting(
    accountId: string,
    opts: { storeId?: string; search?: string },
  ): Promise<{ storeId: string | null; items: CountProductRow[] }> {
    const storeId = await this.resolveStoreId(accountId, opts.storeId);
    if (!storeId) return { storeId: null, items: [] };

    const search = opts.search?.trim().toLowerCase();
    const products = await this.prisma.client.product.findMany({
      where: {
        accountId,
        archived: false,
        deletedAt: null,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { code: { contains: search, mode: 'insensitive' } },
                { article: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: { id: true, name: true, code: true, salePrices: true },
      orderBy: { name: 'asc' },
      take: 500,
    });
    const ids = products.map((p) => p.id);

    const [stocks, counts, defaultType] = await Promise.all([
      this.prisma.client.stock.findMany({
        where: { accountId, storeId, assortmentKind: 'product', assortmentId: { in: ids } },
        select: { assortmentId: true, qty: true },
      }),
      this.prisma.client.analitikaCount.findMany({
        where: { accountId, storeId, productId: { in: ids } },
      }),
      this.prisma.client.priceType.findFirst({
        where: { accountId, isDefault: true },
        select: { id: true },
      }),
    ]);
    const stockByProduct = new Map(stocks.map((s) => [s.assortmentId, Number(s.qty)]));
    const countByProduct = new Map(counts.map((c) => [c.productId, c]));

    const items: CountProductRow[] = products.map((p) => {
      const c = countByProduct.get(p.id);
      return {
        productId: p.id,
        name: p.name,
        code: p.code,
        expectedQty: stockByProduct.get(p.id) ?? 0,
        salePriceMinor: this.pickSalePrice(p.salePrices, defaultType?.id).toString(),
        kamQty: c ? Number(c.kamQty) : 0,
        kopQty: c ? Number(c.kopQty) : 0,
        status: c ? (c.status as 'green' | 'yellow' | 'red') : null,
        decision: c?.decision ?? null,
      };
    });
    return { storeId, items };
  }

  /** Bosh panel KPIs over the current-period counts (optionally per store). */
  async summary(accountId: string, opts: { storeId?: string }): Promise<CountSummary> {
    const where: Prisma.AnalitikaCountWhereInput = {
      accountId,
      ...(opts.storeId ? { storeId: opts.storeId } : {}),
    };
    const counts = await this.prisma.client.analitikaCount.findMany({ where });
    let green = 0;
    let yellow = 0;
    let red = 0;
    let pendingApproval = 0;
    let lossMinor = 0n;
    let surplusMinor = 0n;
    for (const c of counts) {
      if (c.status === 'green') green++;
      else if (c.status === 'yellow') yellow++;
      else red++;
      if (c.status !== 'green' && c.decision === null) pendingApproval++;
      const net = Number(c.netQty);
      const money = BigInt(Math.round(Math.abs(net) * Number(c.salePriceMinor)));
      if (net < 0) lossMinor += money;
      else if (net > 0) surplusMinor += money;
    }
    return {
      total: counts.length,
      green,
      yellow,
      red,
      pendingApproval,
      lossMinor: lossMinor.toString(),
      surplusMinor: surplusMinor.toString(),
      netMinor: (surplusMinor - lossMinor).toString(),
    };
  }

  /**
   * Money report over the current (non-rejected) counts. All valuation is at
   * sale price. moneyMinor is signed (shortage = negative = loss). Rejected
   * counts are excluded (they await a recount). Aggregates by product, counter,
   * group (product folder), reason code, plus the top-10 by absolute money.
   */
  async report(accountId: string, raw: unknown): Promise<CountReport> {
    const filter = ReportFilterSchema.parse(raw);
    const since = this.periodSince(filter.period);
    const where: Prisma.AnalitikaCountWhereInput = {
      accountId,
      decision: { not: 'rejected' },
      ...(filter.storeId ? { storeId: filter.storeId } : {}),
      ...(since ? { countedAt: { gte: since } } : {}),
    };
    const counts = await this.prisma.client.analitikaCount.findMany({ where });

    const productIds = [...new Set(counts.map((c) => c.productId))];
    const counterIds = [...new Set(counts.map((c) => c.counterId))];
    const reasonIds = [
      ...new Set(counts.map((c) => c.reasonCodeId).filter((x): x is string => !!x)),
    ];

    const [products, employees, reasons] = await Promise.all([
      this.prisma.client.product.findMany({
        where: { accountId, id: { in: productIds } },
        select: { id: true, name: true, code: true, productFolderId: true },
      }),
      this.prisma.client.employee.findMany({
        where: { accountId, id: { in: counterIds } },
        select: { id: true, name: true, fullName: true },
      }),
      reasonIds.length
        ? this.prisma.client.analitikaReasonCode.findMany({
            where: { accountId, id: { in: reasonIds } },
            select: { id: true, label: true },
          })
        : Promise.resolve([]),
    ]);
    const folderIds = [
      ...new Set(products.map((p) => p.productFolderId).filter((x): x is string => !!x)),
    ];
    const folders = folderIds.length
      ? await this.prisma.client.productFolder.findMany({
          where: { accountId, id: { in: folderIds } },
          select: { id: true, name: true },
        })
      : [];

    const productMap = new Map(products.map((p) => [p.id, p]));
    const folderMap = new Map(folders.map((f) => [f.id, f.name]));
    const empMap = new Map(employees.map((e) => [e.id, e.fullName ?? e.name]));
    const reasonMap = new Map(reasons.map((r) => [r.id, r.label]));

    const rows: ReportProductRow[] = [];
    let lossMinor = 0n;
    let surplusMinor = 0n;
    const byCounter = new Map<string, { label: string; count: number; money: bigint }>();
    const byGroup = new Map<string, { label: string; count: number; money: bigint }>();
    const byReason = new Map<string, { label: string; count: number; money: bigint }>();

    for (const c of counts) {
      const net = Number(c.netQty);
      const expected = Number(c.expectedQty);
      const money = BigInt(Math.round(net * Number(c.salePriceMinor))); // signed
      if (money < 0n) lossMinor += -money;
      else surplusMinor += money;

      const product = productMap.get(c.productId);
      const groupName = product?.productFolderId
        ? (folderMap.get(product.productFolderId) ?? null)
        : null;
      const counterName = empMap.get(c.counterId) ?? '—';
      rows.push({
        productId: c.productId,
        name: product?.name ?? '—',
        code: product?.code ?? null,
        groupName,
        expectedQty: expected,
        netQty: net,
        pct: expected > 0 ? Math.round((Math.abs(net) / expected) * 100) : net !== 0 ? 100 : 0,
        salePriceMinor: c.salePriceMinor.toString(),
        moneyMinor: money.toString(),
        status: c.status as 'green' | 'yellow' | 'red',
        counterName,
        countedAt: c.countedAt.toISOString(),
      });

      this.bump(byCounter, c.counterId, counterName, money);
      this.bump(byGroup, product?.productFolderId ?? 'none', groupName ?? '—', money);
      this.bump(
        byReason,
        c.reasonCodeId ?? 'none',
        c.reasonCodeId ? (reasonMap.get(c.reasonCodeId) ?? '—') : '—',
        money,
      );
    }

    const top10 = [...rows]
      .sort((a, b) => Math.abs(Number(b.moneyMinor)) - Math.abs(Number(a.moneyMinor)))
      .slice(0, 10);

    return {
      lossMinor: lossMinor.toString(),
      surplusMinor: surplusMinor.toString(),
      netMinor: (surplusMinor - lossMinor).toString(),
      byProduct: rows,
      byCounter: this.bucketList(byCounter),
      byGroup: this.bucketList(byGroup),
      byReason: this.bucketList(byReason),
      top10,
    };
  }

  /**
   * Current state snapshot — every accepted-or-pending count for the account
   * (rejected counts excluded since they've been recounted/superseded).
   * One row per (product, store). Optional `groupName` filter scopes to a
   * single product folder; useful for partial-store snapshots.
   */
  async snapshot(
    accountId: string,
    opts: { groupName?: string; storeId?: string } = {},
  ): Promise<SnapshotRow[]> {
    const counts = await this.prisma.client.analitikaCount.findMany({
      where: {
        accountId,
        // Prisma's `not: 'rejected'` excludes nulls (three-valued logic) —
        // we want pending (null) + accepted, so spell it out.
        OR: [{ decision: null }, { decision: 'accepted' }],
        ...(opts.storeId ? { storeId: opts.storeId } : {}),
      },
      orderBy: { countedAt: 'desc' },
    });
    if (counts.length === 0) return [];

    const productIds = [...new Set(counts.map((c) => c.productId))];
    const counterIds = [...new Set(counts.map((c) => c.counterId))];

    const [products, employees] = await Promise.all([
      this.prisma.client.product.findMany({
        where: { accountId, id: { in: productIds } },
        select: {
          id: true,
          name: true,
          code: true,
          productFolder: { select: { name: true } },
        },
      }),
      this.prisma.client.employee.findMany({
        where: { accountId, id: { in: counterIds } },
        select: { id: true, name: true, fullName: true },
      }),
    ]);
    const productMap = new Map(products.map((p) => [p.id, p]));
    const empMap = new Map(employees.map((e) => [e.id, e.fullName ?? e.name]));

    const rows: SnapshotRow[] = [];
    for (const c of counts) {
      const product = productMap.get(c.productId);
      const groupName = product?.productFolder?.name ?? null;
      if (opts.groupName && groupName !== opts.groupName) continue;

      const expected = Number(c.expectedQty);
      const net = Number(c.netQty);
      const money = BigInt(Math.round(net * Number(c.salePriceMinor)));
      rows.push({
        productId: c.productId,
        productName: product?.name ?? '—',
        productCode: product?.code ?? null,
        groupName,
        expectedQty: expected,
        netQty: net,
        variancePct:
          expected > 0 ? Math.round((Math.abs(net) / expected) * 100) : net !== 0 ? 100 : 0,
        salePriceMinor: c.salePriceMinor.toString(),
        moneyMinor: money.toString(),
        status: c.status as 'green' | 'yellow' | 'red',
        decision: c.decision,
        counterName: empMap.get(c.counterId) ?? '—',
        countedAt: c.countedAt.toISOString(),
      });
    }

    // Largest |moneyMinor| first — most material rows surface at the top.
    rows.sort((a, b) => Math.abs(Number(b.moneyMinor)) - Math.abs(Number(a.moneyMinor)));
    return rows;
  }

  /** Clear the current-period counts (yangi inventerizatsiya boshlash). */
  async reset(accountId: string, raw: unknown): Promise<{ count: number }> {
    const parsed = ResetSchema.safeParse(raw);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(', '));
    }
    const res = await this.prisma.client.analitikaCount.deleteMany({
      where: { accountId, ...(parsed.data.storeId ? { storeId: parsed.data.storeId } : {}) },
    });
    return { count: res.count };
  }

  /** Accept a count (boshliq tasdiqlaydi) — records reviewer + optional reason. */
  async approve(
    accountId: string,
    reviewerId: string,
    id: string,
    raw: unknown,
  ): Promise<CountDto> {
    return this.review(accountId, reviewerId, id, raw, 'accepted');
  }

  /** Reject a count — flags it for recount; recording reviewer + optional reason. */
  async reject(accountId: string, reviewerId: string, id: string, raw: unknown): Promise<CountDto> {
    return this.review(accountId, reviewerId, id, raw, 'rejected');
  }

  /** Revert an already-decided count back to the pending queue. */
  async cancel(accountId: string, id: string): Promise<CountDto> {
    await this.requireCount(accountId, id);
    const row = await this.prisma.client.analitikaCount.update({
      where: { id },
      data: { decision: null, reviewerId: null, reviewedAt: null, reasonCodeId: null },
    });
    const product = (await this.loadProducts(accountId, [row.productId])).get(row.productId);
    return this.toDto(row, product);
  }

  /** Accept many counts at once (vaqt tejaydi). Returns how many were updated. */
  async bulkApprove(
    accountId: string,
    reviewerId: string,
    raw: unknown,
  ): Promise<{ count: number }> {
    const parsed = BulkApproveSchema.safeParse(raw);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(', '));
    }
    const res = await this.prisma.client.analitikaCount.updateMany({
      where: { accountId, id: { in: parsed.data.ids }, decision: null },
      data: {
        decision: 'accepted',
        reviewerId,
        reviewedAt: new Date(),
        reasonCodeId: parsed.data.reasonCodeId ?? null,
      },
    });
    return { count: res.count };
  }

  private async review(
    accountId: string,
    reviewerId: string,
    id: string,
    raw: unknown,
    decision: 'accepted' | 'rejected',
  ): Promise<CountDto> {
    const parsed = ReviewActionSchema.safeParse(raw);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(', '));
    }
    await this.requireCount(accountId, id);
    const row = await this.prisma.client.analitikaCount.update({
      where: { id },
      data: {
        decision,
        reviewerId,
        reviewedAt: new Date(),
        reasonCodeId: parsed.data.reasonCodeId ?? null,
        ...(parsed.data.note !== undefined ? { note: parsed.data.note } : {}),
      },
    });
    const product = (await this.loadProducts(accountId, [row.productId])).get(row.productId);
    return this.toDto(row, product);
  }

  // =====================================================================
  // helpers
  // =====================================================================

  /** Translate an approval-inbox view into a where fragment. */
  private viewWhere(
    view: 'pending' | 'accepted' | 'rejected' | 'all' | undefined,
  ): Prisma.AnalitikaCountWhereInput {
    switch (view) {
      case 'pending':
        return { decision: null, status: { in: ['yellow', 'red'] } };
      case 'accepted':
        return { decision: 'accepted' };
      case 'rejected':
        return { decision: 'rejected' };
      default:
        return {};
    }
  }

  private async requireCount(accountId: string, id: string) {
    const row = await this.prisma.client.analitikaCount.findFirst({ where: { id, accountId } });
    if (!row) throw new NotFoundException(`Count ${id} not found`);
    return row;
  }

  private parse(raw: unknown): UpsertCountInput {
    const r = UpsertCountSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  /** Start-of-window Date for a report period, or null for "all". */
  private periodSince(period: 'today' | '7d' | '30d' | 'all'): Date | null {
    const now = new Date();
    switch (period) {
      case 'today': {
        const d = new Date(now);
        d.setHours(0, 0, 0, 0);
        return d;
      }
      case '7d':
        return new Date(now.getTime() - 7 * 86_400_000);
      case '30d':
        return new Date(now.getTime() - 30 * 86_400_000);
      default:
        return null;
    }
  }

  private bump(
    map: Map<string, { label: string; count: number; money: bigint }>,
    key: string,
    label: string,
    money: bigint,
  ): void {
    const cur = map.get(key) ?? { label, count: 0, money: 0n };
    cur.count += 1;
    cur.money += money;
    map.set(key, cur);
  }

  private bucketList(
    map: Map<string, { label: string; count: number; money: bigint }>,
  ): ReportBucket[] {
    return [...map.entries()]
      .map(([key, v]) => ({ key, label: v.label, count: v.count, moneyMinor: v.money.toString() }))
      .sort((a, b) => Math.abs(Number(b.moneyMinor)) - Math.abs(Number(a.moneyMinor)));
  }

  /** System stock ("REGOS qoldig'i") for a product in a store; 0 if no row. */
  private async loadStockQty(
    accountId: string,
    storeId: string,
    productId: string,
  ): Promise<number> {
    const stock = await this.prisma.client.stock.findUnique({
      where: {
        accountId_storeId_assortmentKind_assortmentId: {
          accountId,
          storeId,
          assortmentKind: 'product',
          assortmentId: productId,
        },
      },
      select: { qty: true },
    });
    return stock ? Number(stock.qty) : 0;
  }

  /** Default sale price (minor) for a product; first price as fallback; 0 if none. */
  private async loadSalePriceMinor(accountId: string, productId: string): Promise<bigint> {
    const product = await this.prisma.client.product.findFirst({
      where: { id: productId, accountId },
      select: { salePrices: true },
    });
    const defaultType = await this.prisma.client.priceType.findFirst({
      where: { accountId, isDefault: true },
      select: { id: true },
    });
    return this.pickSalePrice(product?.salePrices, defaultType?.id);
  }

  /** Pick the default price-type's value from a salePrices JSON; first as fallback. */
  private pickSalePrice(salePrices: unknown, defaultTypeId?: string): bigint {
    const prices = (salePrices as SalePricesJson) ?? [];
    const chosen =
      (defaultTypeId ? prices.find((p) => p.priceTypeId === defaultTypeId) : undefined) ??
      prices[0];
    return BigInt(chosen?.value ?? '0');
  }

  /** Resolve a store: the given id (must belong to the account) or the first active store. */
  private async resolveStoreId(accountId: string, storeId?: string): Promise<string | null> {
    if (storeId) {
      const store = await this.prisma.client.store.findFirst({
        where: { id: storeId, accountId },
        select: { id: true },
      });
      return store?.id ?? null;
    }
    const first = await this.prisma.client.store.findFirst({
      where: { accountId, archived: false },
      orderBy: { name: 'asc' },
      select: { id: true },
    });
    return first?.id ?? null;
  }

  private async loadProducts(
    accountId: string,
    productIds: string[],
  ): Promise<Map<string, { name: string; code: string | null }>> {
    const unique = [...new Set(productIds)];
    if (unique.length === 0) return new Map();
    const products = await this.prisma.client.product.findMany({
      where: { accountId, id: { in: unique } },
      select: { id: true, name: true, code: true },
    });
    return new Map(products.map((p) => [p.id, { name: p.name, code: p.code }]));
  }

  private toDto(
    row: {
      id: string;
      productId: string;
      storeId: string;
      expectedQty: unknown;
      kamQty: unknown;
      kopQty: unknown;
      netQty: unknown;
      salePriceMinor: bigint;
      status: string;
      decision: string | null;
      counterId: string;
      countedAt: Date;
      reviewerId: string | null;
      reasonCodeId: string | null;
      note: string | null;
    },
    product?: { name: string; code: string | null },
  ): CountDto {
    return {
      id: row.id,
      productId: row.productId,
      productName: product?.name ?? '—',
      productCode: product?.code ?? null,
      storeId: row.storeId,
      expectedQty: Number(row.expectedQty),
      kamQty: Number(row.kamQty),
      kopQty: Number(row.kopQty),
      netQty: Number(row.netQty),
      salePriceMinor: row.salePriceMinor.toString(),
      status: row.status as 'green' | 'yellow' | 'red',
      decision: row.decision,
      counterId: row.counterId,
      countedAt: row.countedAt.toISOString(),
      reviewerId: row.reviewerId,
      reasonCodeId: row.reasonCodeId,
      note: row.note,
    };
  }
}
