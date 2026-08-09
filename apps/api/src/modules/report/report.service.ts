import { Prisma } from '@moysklad/db';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { reportDateBounds } from './report-date-bounds.util.js';
import {
  CurrencyTally,
  type RateContext,
  type UnconvertedAmount,
  consolidateToBase,
  loadRateContext,
} from './report-rate-ctx.util.js';
import {
  type ProductMovementQueryInput,
  ProductMovementQuerySchema,
  type SalesGroupByValue,
  type SalesReportFilterInput,
  SalesReportFilterSchema,
} from './report.schema.js';

export interface SalesReportRow {
  key: string;
  label: string;
  salesCount: number;
  returnsCount: number;
  sumMinor: string;
  returnsSumMinor: string;
  netSumMinor: string;
  vatSumMinor: string;
  costSumMinor: string;
  profitMinor: string;
  ref?: { id: string; name: string } | null;
}

export interface SalesReport {
  filter: SalesReportFilterInput;
  totals: SalesReportRow;
  groups: SalesReportRow[];
  /** Account base (валюта учёта) — revenue consolidated; COGS already base. */
  currency: string;
  /** True when source docs span >1 currency (revenue is converted). */
  mixedCurrency: boolean;
  /**
   * M-12: rates-siz valyuta jamiga QO'SHILMAYDI — shu yerda o'z valyutasida
   * alohida qaytadi («konvertatsiya qilinmagan» qatori). Bo'sh = hammasi
   * konsolidatsiya qilindi.
   */
  unconvertedByCurrency: UnconvertedAmount[];
}

/**
 * One purchase or sale line for the products/[id] «История» widget.
 * BigInt fields serialized to string (JSON-safe, parity with the rest of
 * this module). `quantityMilli` = quantity × 1000 (the line's Decimal(20,6)
 * qty scaled to integer milli-units so the FE recovers it via /1000).
 */
export interface MovementRow {
  docId: string;
  docType: 'supply' | 'demand';
  docRoute: 'supplies' | 'demands';
  name: string;
  moment: string;
  counterpartyId: string | null;
  counterpartyName: string | null;
  quantityMilli: string;
  priceMinor: string;
  currency: string;
}

export interface ProductMovement {
  purchases: MovementRow[];
  sales: MovementRow[];
}

const DATE_TRUNC_UNIT: Record<'day' | 'week' | 'month' | 'quarter' | 'year', string> = {
  day: 'day',
  week: 'week',
  month: 'month',
  quarter: 'quarter',
  year: 'year',
};

@Injectable()
export class ReportService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async salesReport(accountId: string, raw: unknown): Promise<SalesReport> {
    const filter = this.parseFilter(raw);
    const ctx = await loadRateContext(this.prisma.client, accountId);
    const seen = new CurrencyTally();

    // 1. Totals row — same regardless of grouping.
    const totals = await this.computeTotals(accountId, filter, ctx, seen);

    // 2. Grouped rows — empty for groupBy='none'.
    let groups: SalesReportRow[] = [];
    if (filter.groupBy !== 'none') {
      groups = await this.computeGroups(accountId, filter, ctx, seen);
    }

    return {
      filter,
      totals,
      groups,
      currency: ctx.baseCode,
      mixedCurrency: seen.mixed,
      unconvertedByCurrency: seen.unconvertedRows(),
    };
  }

  // -------------------------------------------------------------------
  // Product movement («История» widget) — purchases + sales for one product
  // -------------------------------------------------------------------

  /**
   * Read-only purchase/sale line feed for a single product. Each list holds
   * the most-recent ~`limit` lines (by parent-doc moment DESC). Used by the
   * products/[id] «История» tab (Закупки + Продажи tables).
   *
   * Purchases = SupplyPosition rows joined to their parent Supply; sales =
   * DemandPosition rows joined to their parent Demand. Both scoped by
   * accountId (tenant guard) on BOTH the position and the parent doc.
   *
   * NOTE: only Supply/Demand are sourced here — InvoiceIn/InvoiceOut are
   * money-side documents that don't post inventory and have no per-product
   * position join to this product on the same axis (see RETURN notes).
   */
  async productMovement(accountId: string, raw: unknown): Promise<ProductMovement> {
    const query = this.parseMovementQuery(raw);
    const [purchases, sales] = await Promise.all([
      this.movementPurchases(accountId, query),
      this.movementSales(accountId, query),
    ]);
    return { purchases, sales };
  }

  private async movementPurchases(
    accountId: string,
    query: ProductMovementQueryInput,
  ): Promise<MovementRow[]> {
    const rows = await this.prisma.client.supplyPosition.findMany({
      where: { accountId, productId: query.productId, supply: { accountId, deletedAt: null } },
      select: {
        quantity: true,
        priceMinor: true,
        supply: {
          select: {
            id: true,
            name: true,
            moment: true,
            currency: true,
            agent: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { supply: { moment: 'desc' } },
      take: query.limit,
    });
    return rows.map((r) => ({
      docId: r.supply.id,
      docType: 'supply' as const,
      docRoute: 'supplies' as const,
      name: r.supply.name,
      moment: r.supply.moment.toISOString(),
      counterpartyId: r.supply.agent?.id ?? null,
      counterpartyName: r.supply.agent?.name ?? null,
      quantityMilli: this.qtyToMilli(r.quantity),
      priceMinor: r.priceMinor.toString(),
      currency: r.supply.currency,
    }));
  }

  private async movementSales(
    accountId: string,
    query: ProductMovementQueryInput,
  ): Promise<MovementRow[]> {
    const rows = await this.prisma.client.demandPosition.findMany({
      where: { accountId, productId: query.productId, demand: { accountId, deletedAt: null } },
      select: {
        quantity: true,
        priceMinor: true,
        demand: {
          select: {
            id: true,
            name: true,
            moment: true,
            currency: true,
            agent: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { demand: { moment: 'desc' } },
      take: query.limit,
    });
    return rows.map((r) => ({
      docId: r.demand.id,
      docType: 'demand' as const,
      docRoute: 'demands' as const,
      name: r.demand.name,
      moment: r.demand.moment.toISOString(),
      counterpartyId: r.demand.agent?.id ?? null,
      counterpartyName: r.demand.agent?.name ?? null,
      quantityMilli: this.qtyToMilli(r.quantity),
      priceMinor: r.priceMinor.toString(),
      currency: r.demand.currency,
    }));
  }

  /**
   * Decimal(20,6) quantity → integer milli-unit string (×1000). Done via
   * Prisma.Decimal so we don't lose precision through JS float (the FE
   * recovers the real qty with `Number(quantityMilli) / 1000`).
   */
  private qtyToMilli(qty: Prisma.Decimal): string {
    return qty.mul(1000).toFixed(0);
  }

  private parseMovementQuery(raw: unknown): ProductMovementQueryInput {
    const r = ProductMovementQuerySchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  // -------------------------------------------------------------------
  // Totals
  // -------------------------------------------------------------------

  private async computeTotals(
    accountId: string,
    filter: SalesReportFilterInput,
    ctx: RateContext,
    seen: CurrencyTally,
  ): Promise<SalesReportRow> {
    // Group by currency so document-currency revenue/VAT can be
    // base-consolidated; COGS (cost_sum_minor) is already base
    // (normalized at supply-post) and is summed directly.
    //
    // M-11 (Faza Q8): `rate_value` joins the key so each slice is valued at
    // the rate its own documents carry — a closed period is not restated when
    // the Currency table moves.
    const orgC = filter.organizationId
      ? Prisma.sql`AND organization_id = ${filter.organizationId}::uuid`
      : Prisma.empty;
    const agentC = filter.counterpartyId
      ? Prisma.sql`AND agent_id = ${filter.counterpartyId}::uuid`
      : Prisma.empty;
    const storeC = filter.storeId
      ? Prisma.sql`AND store_id = ${filter.storeId}::uuid`
      : Prisma.empty;
    const { gte, lt } = reportDateBounds(filter.dateFrom, filter.dateTo);
    const win = Prisma.sql`
      AND state = 'posted' AND deleted_at IS NULL
      AND moment >= ${gte} AND moment < ${lt}`;

    type Row = {
      currency: string;
      /** M-11: hujjatning muzlatilgan kursi (×10^8). */
      rate_value: bigint | null;
      cnt: bigint;
      sum_minor: bigint | null;
      vat_minor: bigint | null;
      cost_minor: bigint | null;
    };
    const [demandRows, returnRows] = await Promise.all([
      this.prisma.client.$queryRaw<Row[]>`
        SELECT currency, rate_value, COUNT(*)::bigint AS cnt,
          SUM(sum_minor)::bigint AS sum_minor,
          SUM(vat_sum_minor)::bigint AS vat_minor,
          SUM(cost_sum_minor)::bigint AS cost_minor
        FROM demands WHERE account_id = ${accountId}::uuid ${win} ${agentC} ${orgC} ${storeC}
        GROUP BY currency, rate_value`,
      this.prisma.client.$queryRaw<Row[]>`
        SELECT currency, rate_value, COUNT(*)::bigint AS cnt,
          SUM(sum_minor)::bigint AS sum_minor,
          NULL::bigint AS vat_minor, NULL::bigint AS cost_minor
        FROM sales_returns WHERE account_id = ${accountId}::uuid ${win} ${agentC} ${orgC} ${storeC}
        GROUP BY currency, rate_value`,
    ]);

    let salesCount = 0;
    let sales = 0n;
    let vat = 0n;
    let cost = 0n;
    for (const r of demandRows) {
      salesCount += Number(r.cnt);
      const docRate = r.rate_value ?? undefined;
      sales += consolidateToBase(r.sum_minor ?? 0n, r.currency, ctx, seen, docRate);
      vat += consolidateToBase(r.vat_minor ?? 0n, r.currency, ctx, seen, docRate);
      cost += r.cost_minor ?? 0n; // already base
    }
    let returnsCount = 0;
    let returns = 0n;
    for (const r of returnRows) {
      returnsCount += Number(r.cnt);
      returns += consolidateToBase(
        r.sum_minor ?? 0n,
        r.currency,
        ctx,
        seen,
        r.rate_value ?? undefined,
      );
    }
    const net = sales - returns;
    const profit = net - cost;

    return {
      key: 'totals',
      label: 'Итого',
      salesCount,
      returnsCount,
      sumMinor: sales.toString(),
      returnsSumMinor: returns.toString(),
      netSumMinor: net.toString(),
      vatSumMinor: vat.toString(),
      costSumMinor: cost.toString(),
      profitMinor: profit.toString(),
    };
  }

  // -------------------------------------------------------------------
  // Grouped rows
  // -------------------------------------------------------------------

  private async computeGroups(
    accountId: string,
    filter: SalesReportFilterInput,
    ctx: RateContext,
    seen: CurrencyTally,
  ): Promise<SalesReportRow[]> {
    switch (filter.groupBy) {
      case 'day':
      case 'week':
      case 'month':
      case 'quarter':
      case 'year':
        return this.groupByDate(accountId, filter, filter.groupBy, ctx, seen);
      case 'counterparty':
        return this.groupByFk(accountId, filter, 'agentId', ctx, seen);
      case 'organization':
        return this.groupByFk(accountId, filter, 'organizationId', ctx, seen);
      case 'store':
        return this.groupByFk(accountId, filter, 'storeId', ctx, seen);
      case 'owner':
        return this.groupByFk(accountId, filter, 'ownerId', ctx, seen);
      case 'product':
        return this.groupByProduct(accountId, filter, ctx, seen);
      default:
        return [];
    }
  }

  private async groupByDate(
    accountId: string,
    filter: SalesReportFilterInput,
    unit: 'day' | 'week' | 'month' | 'quarter' | 'year',
    ctx: RateContext,
    seen: CurrencyTally,
  ): Promise<SalesReportRow[]> {
    const truncUnit = DATE_TRUNC_UNIT[unit];
    const { gte, lt } = reportDateBounds(filter.dateFrom, filter.dateTo);
    const optionalAnd = (col: string, val: string | undefined) =>
      val ? Prisma.sql`AND ${Prisma.raw(col)} = ${val}::uuid` : Prisma.empty;

    // Group by (bucket, currency, rate_value); revenue/VAT base-consolidated
    // per slice in TS at the DOCUMENT's own rate (M-11, Faza Q8), COGS summed
    // directly (already base).
    const demandRows = await this.prisma.client.$queryRaw<
      Array<{
        bucket: Date;
        currency: string;
        rate_value: bigint | null;
        cnt: bigint;
        sum_minor: bigint | null;
        vat_minor: bigint | null;
        cost_minor: bigint | null;
      }>
    >`
      SELECT
        date_trunc(${truncUnit}, moment AT TIME ZONE 'UTC') AS bucket,
        currency,
        rate_value,
        COUNT(*)::bigint AS cnt,
        SUM(sum_minor)::bigint AS sum_minor,
        SUM(vat_sum_minor)::bigint AS vat_minor,
        SUM(cost_sum_minor)::bigint AS cost_minor
      FROM demands
      WHERE account_id = ${accountId}::uuid
        AND state = 'posted'
        AND deleted_at IS NULL
        AND moment >= ${gte}
        AND moment < ${lt}
        ${optionalAnd('agent_id', filter.counterpartyId)}
        ${optionalAnd('organization_id', filter.organizationId)}
        ${optionalAnd('store_id', filter.storeId)}
      GROUP BY bucket, currency, rate_value
      ORDER BY bucket ASC
    `;

    const returnRows = await this.prisma.client.$queryRaw<
      Array<{
        bucket: Date;
        currency: string;
        rate_value: bigint | null;
        cnt: bigint;
        sum_minor: bigint | null;
      }>
    >`
      SELECT
        date_trunc(${truncUnit}, moment AT TIME ZONE 'UTC') AS bucket,
        currency,
        rate_value,
        COUNT(*)::bigint AS cnt,
        SUM(sum_minor)::bigint AS sum_minor
      FROM sales_returns
      WHERE account_id = ${accountId}::uuid
        AND state = 'posted'
        AND deleted_at IS NULL
        AND moment >= ${gte}
        AND moment < ${lt}
        ${optionalAnd('agent_id', filter.counterpartyId)}
        ${optionalAnd('organization_id', filter.organizationId)}
        ${optionalAnd('store_id', filter.storeId)}
      GROUP BY bucket, currency, rate_value
      ORDER BY bucket ASC
    `;

    const returnsByBucket = new Map<string, { cnt: number; sum: bigint }>();
    for (const r of returnRows) {
      const key = r.bucket.toISOString();
      const acc = returnsByBucket.get(key) ?? { cnt: 0, sum: 0n };
      acc.cnt += Number(r.cnt);
      acc.sum += consolidateToBase(
        r.sum_minor ?? 0n,
        r.currency,
        ctx,
        seen,
        r.rate_value ?? undefined,
      );
      returnsByBucket.set(key, acc);
    }

    // Fold demand rows per bucket (insertion order = chronological).
    const byBucket = new Map<
      string,
      { date: Date; cnt: number; sales: bigint; vat: bigint; cost: bigint }
    >();
    for (const d of demandRows) {
      const key = d.bucket.toISOString();
      const acc = byBucket.get(key) ?? { date: d.bucket, cnt: 0, sales: 0n, vat: 0n, cost: 0n };
      acc.cnt += Number(d.cnt);
      const docRate = d.rate_value ?? undefined;
      acc.sales += consolidateToBase(d.sum_minor ?? 0n, d.currency, ctx, seen, docRate);
      acc.vat += consolidateToBase(d.vat_minor ?? 0n, d.currency, ctx, seen, docRate);
      acc.cost += d.cost_minor ?? 0n; // already base
      byBucket.set(key, acc);
    }

    const out: SalesReportRow[] = [];
    for (const [key, d] of byBucket) {
      const ret = returnsByBucket.get(key) ?? { cnt: 0, sum: 0n };
      const net = d.sales - ret.sum;
      out.push({
        key,
        label: this.formatDateLabel(d.date, unit),
        salesCount: d.cnt,
        returnsCount: ret.cnt,
        sumMinor: d.sales.toString(),
        returnsSumMinor: ret.sum.toString(),
        netSumMinor: net.toString(),
        vatSumMinor: d.vat.toString(),
        costSumMinor: d.cost.toString(),
        profitMinor: (net - d.cost).toString(),
      });
      if (out.length >= filter.limit) break;
    }
    return out;
  }

  private async groupByFk(
    accountId: string,
    filter: SalesReportFilterInput,
    fkField: 'agentId' | 'organizationId' | 'storeId' | 'ownerId',
    ctx: RateContext,
    seen: CurrencyTally,
  ): Promise<SalesReportRow[]> {
    const demandWhere = this.demandWhere(accountId, filter);
    const returnWhere = this.returnWhere(accountId, filter);

    // Group by (fk, currency, rateValue); fold per fk in TS so revenue can be
    // base-consolidated and the top-N rank runs on the CONSOLIDATED sales
    // (the SQL `take` is dropped — GROUP BY collapses to #fk × #currency
    // rows, bounded; rank+slice happens after folding).
    //
    // M-11 (Faza Q8): `rateValue` is part of the key so each slice keeps the
    // rate its own documents were booked with — a closed period is not
    // restated when the Currency table moves.
    const [demandGroups, returnGroups] = await Promise.all([
      this.prisma.client.demand.groupBy({
        by: [fkField, 'currency', 'rateValue'],
        where: demandWhere,
        _count: { _all: true },
        _sum: { sumMinor: true, vatSumMinor: true, costSumMinor: true },
      }),
      this.prisma.client.salesReturn.groupBy({
        by: [fkField, 'currency', 'rateValue'],
        where: returnWhere,
        _count: { _all: true },
        _sum: { sumMinor: true },
      }),
    ]);

    const returnsByFk = new Map<string, { cnt: number; sum: bigint }>();
    for (const r of returnGroups) {
      const id = r[fkField] as string | null;
      if (!id) continue;
      const acc = returnsByFk.get(id) ?? { cnt: 0, sum: 0n };
      acc.cnt += r._count._all;
      acc.sum += consolidateToBase(
        (r._sum.sumMinor as bigint | null) ?? 0n,
        r.currency,
        ctx,
        seen,
        r.rateValue ?? undefined,
      );
      returnsByFk.set(id, acc);
    }

    // Fold demand groups per fk (revenue/VAT converted, COGS direct).
    const byFk = new Map<string, { cnt: number; sales: bigint; vat: bigint; cost: bigint }>();
    for (const g of demandGroups) {
      const id = g[fkField] as string | null;
      if (!id) continue; // nullable ownerId: drop unassigned (parity with prior)
      const acc = byFk.get(id) ?? { cnt: 0, sales: 0n, vat: 0n, cost: 0n };
      acc.cnt += g._count._all;
      const docRate = g.rateValue ?? undefined;
      acc.sales += consolidateToBase(
        (g._sum.sumMinor as bigint | null) ?? 0n,
        g.currency,
        ctx,
        seen,
        docRate,
      );
      acc.vat += consolidateToBase(
        (g._sum.vatSumMinor as bigint | null) ?? 0n,
        g.currency,
        ctx,
        seen,
        docRate,
      );
      acc.cost += (g._sum.costSumMinor as bigint | null) ?? 0n; // already base
      byFk.set(id, acc);
    }

    const ranked = [...byFk.entries()]
      .sort((a, b) => (b[1].sales > a[1].sales ? 1 : b[1].sales < a[1].sales ? -1 : 0))
      .slice(0, filter.limit);

    const refs = await this.resolveRefs(
      fkField,
      ranked.map(([id]) => id),
    );

    return ranked.map(([id, d]) => {
      const ret = returnsByFk.get(id) ?? { cnt: 0, sum: 0n };
      const net = d.sales - ret.sum;
      const ref = refs.get(id) ?? null;
      return {
        key: id,
        label: ref?.name ?? '—',
        salesCount: d.cnt,
        returnsCount: ret.cnt,
        sumMinor: d.sales.toString(),
        returnsSumMinor: ret.sum.toString(),
        netSumMinor: net.toString(),
        vatSumMinor: d.vat.toString(),
        costSumMinor: d.cost.toString(),
        profitMinor: (net - d.cost).toString(),
        ref: ref ? { id: ref.id, name: ref.name } : null,
      };
    });
  }

  private async groupByProduct(
    accountId: string,
    filter: SalesReportFilterInput,
    ctx: RateContext,
    seen: CurrencyTally,
  ): Promise<SalesReportRow[]> {
    const { gte, lt } = reportDateBounds(filter.dateFrom, filter.dateTo);
    const optionalAnd = (col: string, val: string | undefined) =>
      val ? Prisma.sql`AND ${Prisma.raw(col)} = ${val}::uuid` : Prisma.empty;

    // Aggregate quantities + prices over demand_positions joined to demands.
    // qty * price - discount → revenue per position. We use the position's
    // already-computed totals stored on the demand row would be cleaner but
    // demand_positions doesn't materialize per-line totalMinor; we reconstruct
    // it as qty * (1 - discount/100) * price + vat (if vat-excluded).
    //
    // For simplicity we report qty + price-sum (without VAT / discount math
    // here — the print-template-grade math is in @moysklad/money/position
    // and would need to be ported to SQL for an exact match). The doc-level
    // sumMinor is what the user trusts; this view shows volume + raw price
    // sum to identify best-sellers. Per-line totals would require a server
    // SQL function, scoped for a follow-up.
    // Group by (product, demand currency, doc rate); price_sum (gross qty×price
    // in the demand's currency) is base-consolidated per slice at the DOCUMENT's
    // own rate (M-11, Faza Q8), then products are ranked by consolidated revenue
    // (SQL LIMIT dropped → JS rank+slice).
    const productRows = await this.prisma.client.$queryRaw<
      Array<{
        product_id: string | null;
        currency: string;
        rate_value: bigint | null;
        qty: string;
        price_sum: bigint | null;
        cnt: bigint;
      }>
    >`
      SELECT
        dp.product_id AS product_id,
        d.currency AS currency,
        d.rate_value AS rate_value,
        SUM(dp.quantity)::text AS qty,
        SUM(dp.price_minor * dp.quantity)::numeric::bigint AS price_sum,
        COUNT(*)::bigint AS cnt
      FROM demand_positions dp
      JOIN demands d ON d.id = dp.demand_id
      WHERE d.account_id = ${accountId}::uuid
        AND d.state = 'posted'
        AND d.deleted_at IS NULL
        AND d.moment >= ${gte}
        AND d.moment < ${lt}
        AND dp.product_id IS NOT NULL
        ${optionalAnd('d.agent_id', filter.counterpartyId)}
        ${optionalAnd('d.organization_id', filter.organizationId)}
        ${optionalAnd('d.store_id', filter.storeId)}
        ${filter.productId ? Prisma.sql`AND dp.product_id = ${filter.productId}::uuid` : Prisma.empty}
      GROUP BY dp.product_id, d.currency, d.rate_value
    `;

    // Fold per product: revenue consolidated to base, qty (currency-independent) + count summed.
    const byProduct = new Map<string, { qty: number; revenue: bigint; cnt: number }>();
    for (const r of productRows) {
      if (!r.product_id) continue;
      const acc = byProduct.get(r.product_id) ?? { qty: 0, revenue: 0n, cnt: 0 };
      acc.qty += Number(r.qty);
      acc.revenue += consolidateToBase(
        r.price_sum ?? 0n,
        r.currency,
        ctx,
        seen,
        r.rate_value ?? undefined,
      );
      acc.cnt += Number(r.cnt);
      byProduct.set(r.product_id, acc);
    }

    const ranked = [...byProduct.entries()]
      .sort((a, b) => (b[1].revenue > a[1].revenue ? 1 : b[1].revenue < a[1].revenue ? -1 : 0))
      .slice(0, filter.limit);

    const products = await this.prisma.client.product.findMany({
      where: { id: { in: ranked.map(([id]) => id) }, accountId },
      select: { id: true, name: true, code: true },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    return ranked.map(([id, d]) => {
      const product = productMap.get(id) ?? null;
      return {
        key: id,
        label: product ? (product.code ? `${product.code} — ${product.name}` : product.name) : '—',
        salesCount: d.cnt,
        returnsCount: 0,
        // Per-product report uses the sum of qty × price (gross before discount/VAT),
        // base-consolidated. Doc-level totals stay authoritative on the totals row;
        // this column is for relative ranking ("best-sellers"), not a tax declaration.
        sumMinor: d.revenue.toString(),
        returnsSumMinor: '0',
        netSumMinor: d.revenue.toString(),
        vatSumMinor: '0',
        costSumMinor: '0',
        profitMinor: '0',
        ref: product ? { id: product.id, name: product.name } : null,
      };
    });
  }

  // -------------------------------------------------------------------
  // helpers
  // -------------------------------------------------------------------

  private demandWhere(accountId: string, filter: SalesReportFilterInput): Prisma.DemandWhereInput {
    const { gte, lt } = reportDateBounds(filter.dateFrom, filter.dateTo);
    return {
      accountId,
      state: 'posted',
      deletedAt: null,
      moment: { gte, lt },
      ...(filter.counterpartyId ? { agentId: filter.counterpartyId } : {}),
      ...(filter.organizationId ? { organizationId: filter.organizationId } : {}),
      ...(filter.storeId ? { storeId: filter.storeId } : {}),
    };
  }

  private returnWhere(
    accountId: string,
    filter: SalesReportFilterInput,
  ): Prisma.SalesReturnWhereInput {
    const { gte, lt } = reportDateBounds(filter.dateFrom, filter.dateTo);
    return {
      accountId,
      state: 'posted',
      deletedAt: null,
      moment: { gte, lt },
      ...(filter.counterpartyId ? { agentId: filter.counterpartyId } : {}),
      ...(filter.organizationId ? { organizationId: filter.organizationId } : {}),
      ...(filter.storeId ? { storeId: filter.storeId } : {}),
    };
  }

  private async resolveRefs(
    field: 'agentId' | 'organizationId' | 'storeId' | 'ownerId',
    ids: string[],
  ): Promise<Map<string, { id: string; name: string }>> {
    if (ids.length === 0) return new Map();
    if (field === 'agentId') {
      const rows = await this.prisma.client.counterparty.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true },
      });
      return new Map(rows.map((r) => [r.id, r]));
    }
    if (field === 'organizationId') {
      const rows = await this.prisma.client.organization.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true },
      });
      return new Map(rows.map((r) => [r.id, r]));
    }
    if (field === 'ownerId') {
      const rows = await this.prisma.client.employee.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true },
      });
      return new Map(rows.map((r) => [r.id, r]));
    }
    const rows = await this.prisma.client.store.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    return new Map(rows.map((r) => [r.id, r]));
  }

  private formatDateLabel(d: Date, unit: SalesGroupByValue): string {
    const iso = d.toISOString();
    if (unit === 'day') return iso.slice(0, 10);
    if (unit === 'week') return `Week of ${iso.slice(0, 10)}`;
    if (unit === 'month') return iso.slice(0, 7);
    if (unit === 'quarter') {
      const month = d.getUTCMonth();
      const q = Math.floor(month / 3) + 1;
      return `${d.getUTCFullYear()}-Q${q}`;
    }
    if (unit === 'year') return String(d.getUTCFullYear());
    return iso;
  }

  private parseFilter(raw: unknown): SalesReportFilterInput {
    const r = SalesReportFilterSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }
}
