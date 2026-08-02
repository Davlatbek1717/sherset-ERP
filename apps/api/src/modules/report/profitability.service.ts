import { Prisma } from '@moysklad/db';
import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service.js';
// Analitika TZ §4 — yagona formulalar qatlami.
import { percentText } from './metrics/index.js';
import { reportDateBounds } from './report-date-bounds.util.js';
import { type RateContext, consolidateToBase, loadRateContext } from './report-rate-ctx.util.js';

/**
 * «Прибыльность» (Profitability) report — full moysklad-parity engine.
 *
 * LIVE-grounded 2026-07-05 (online.moysklad.ru/app/#pnl). Four groupings
 * («По товарам / По сотрудникам / По покупателям / По каналам продаж»), a
 * 13-field filter panel, a time-bucketed chart series (+ optional comparison
 * period) and a Продажи/Возвраты/Рентабельность column model.
 *
 * PROFIT & PROFITABILITY (verified exact against the live footer totals):
 *   profit           = (salesSum − salesCost) − (returnSum − returnCost)
 *   Рентабельность товара = profit / (salesCost − returnCost) × 100   (markup on net cost)
 *   Рентабельность продаж = profit / (salesSum − returnSum) × 100      (margin on net revenue)
 *
 * DATA:
 *   Продажи = posted Demands (Отгрузка) + optionally posted RetailSales (Продажа).
 *   Возврат = posted SalesReturns.
 *   Демандs are FIFO-costed; retail carries the cost frozen at post() from the
 *   product card (`retail_sale_positions.cost_minor`, To'lqin 1.1).
 *
 * COST HONESTY (To'lqin 1.2, 2026-08-02) — «tan narx yig'ilmagan»:
 *   `cost_minor` is NULLABLE on every position table, and NULL means "never
 *   captured", NOT "free". Retail used to select a literal `0::bigint AS cost`
 *   and the demand/return queries used `COALESCE(cost_minor, 0)` — so any
 *   uncosted line was reported as pure profit and the report claimed **100%
 *   margin** on it. Owners priced against that number.
 *   Now: NULL lines are EXCLUDED from the cost SUM (arithmetically identical to
 *   coalescing them to zero — that was never the bug) and COUNTED into
 *   `costMissingLines`, which rides on every row, the totals and each chart
 *   bucket. `costIncomplete = costMissingLines > 0` tells the FE the cost column
 *   is an UNDER-count and profit / profitability are an UPPER bound, so it can
 *   label the figure instead of presenting it as fact.
 *   Old receipts are deliberately NOT backfilled: the cost at that moment was
 *   never recorded anywhere, and re-deriving it from today's product card would
 *   invent a number. They stay NULL and stay marked.
 *
 * KNOWN GAP (pre-existing, unchanged here): `chartBuckets` aggregates demands +
 * returns only — retail is absent from the chart while it IS in the table, so a
 * `documentType=retail` filter draws an empty/returns-only series. Separate fix.
 */
export const ProfitabilityFilterSchema = z.object({
  /** Which dimension to group rows by (the 4 tabs). */
  groupBy: z.enum(['product', 'employee', 'counterparty', 'saleschannel']).default('product'),
  /** Window lower bound (inclusive). Defaults to today − 1 month. */
  dateFrom: z.coerce.date().optional(),
  /** Window upper bound (inclusive; end-of-day for date-only). Defaults to today. */
  dateTo: z.coerce.date().optional(),
  /** «Учитывать» — assortment kinds included. */
  accountedType: z.enum(['all', 'products', 'services', 'bundles']).default('all'),
  /** «Товар или группа» — a single product (matches product or its variant lines). */
  productId: z.string().uuid().optional(),
  /** «Товар или группа» — a product folder (all products inside it). */
  productFolderId: z.string().uuid().optional(),
  /** «Склад» */
  storeId: z.string().uuid().optional(),
  /** «Точка продаж» — retail store (applies to retail «Продажа» docs). */
  retailStoreId: z.string().uuid().optional(),
  /** «Проект» */
  projectId: z.string().uuid().optional(),
  /** «Контрагент» */
  counterpartyId: z.string().uuid().optional(),
  /** «Группа контрагента» */
  counterpartyGroupId: z.string().uuid().optional(),
  /** «Договор» */
  contractId: z.string().uuid().optional(),
  /** «Поставщик» — products whose default supplier = X. */
  supplierId: z.string().uuid().optional(),
  /** «Организация» */
  organizationId: z.string().uuid().optional(),
  /** «Тип документа»: Все | Отгрузка (demands) | Продажа (retail). */
  documentType: z.enum(['all', 'demand', 'retail']).default('all'),
  /** «Канал продаж» */
  salesChannelId: z.string().uuid().optional(),
  /** «Разбить по модификациям» — split variant rows (product tab only). */
  splitByVariants: z.coerce.boolean().default(false),
  /** «Количество строк» — page size. */
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  /** Pagination offset. */
  offset: z.coerce.number().int().min(0).default(0),
  /** Sort column. */
  sortBy: z
    .enum([
      'name',
      'salesDocuments',
      'salesQuantity',
      'salesSum',
      'salesSumCost',
      'returnSum',
      'profit',
      'profitGoodsPct',
      'profitSalesPct',
    ])
    .default('profit'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
  /** Chart bucket granularity. */
  granularity: z.enum(['hour', 'day', 'week', 'month']).default('day'),
  /** «Сравнить»: none | previous period | same period last year | custom range. */
  compare: z.enum(['none', 'prev', 'year', 'custom']).default('none'),
  /** Explicit comparison-window bounds (moysklad «Настроить»); when present they
   *  override the prev/year computation for the second chart line. */
  compareFrom: z.coerce.date().optional(),
  compareTo: z.coerce.date().optional(),
});
export type ProfitabilityFilter = z.infer<typeof ProfitabilityFilterSchema>;

export interface ProfitabilityRow {
  id: string;
  name: string;
  code: string | null;
  article: string | null;
  uom: string | null;
  /** По каналам продаж only — SalesChannel.type label. */
  channelType?: string | null;
  salesDocuments: number;
  salesQuantity: string;
  salesSumMinor: string;
  salesSumCostMinor: string;
  returnDocuments: number;
  returnQuantity: string;
  returnSumMinor: string;
  returnSumCostMinor: string;
  profitMinor: string;
  /** Рентабельность товара, 2dp string; '' when net cost = 0. */
  profitGoodsPct: string;
  /** Рентабельность продаж, 2dp string; '' when net revenue = 0. */
  profitSalesPct: string;
  /**
   * Lines behind this row whose cost was never captured («tan narx yig'ilmagan»).
   * > 0 means the cost columns are an UNDER-count and profit/profitability are an
   * OVER-count — the FE must mark the row instead of presenting the figure as fact.
   */
  costMissingLines: number;
  /** Convenience mirror of `costMissingLines > 0`. */
  costIncomplete: boolean;
}

export interface ProfitabilityTotals {
  salesDocuments: number;
  salesQuantity: string;
  salesSumMinor: string;
  salesSumCostMinor: string;
  returnDocuments: number;
  returnQuantity: string;
  returnSumMinor: string;
  returnSumCostMinor: string;
  profitMinor: string;
  profitGoodsPct: string;
  profitSalesPct: string;
  /** Same contract as ProfitabilityRow — counted over ALL groups, not just the page. */
  costMissingLines: number;
  costIncomplete: boolean;
}

export interface ProfitabilityChartBucket {
  /** Bucket start, ISO (Tashkent-local calendar start). */
  start: string;
  salesDocuments: number;
  salesQuantity: string;
  salesSumMinor: string;
  salesSumCostMinor: string;
  returnDocuments: number;
  returnQuantity: string;
  returnSumMinor: string;
  returnSumCostMinor: string;
  profitMinor: string;
  profitGoodsPct: string;
  profitSalesPct: string;
  avgCheckMinor: string;
  /** Same contract as ProfitabilityRow — the bucket's cost is an UNDER-count when > 0. */
  costMissingLines: number;
  costIncomplete: boolean;
}

export interface ProfitabilityReport {
  groupBy: ProfitabilityFilter['groupBy'];
  filter: {
    dateFrom: string;
    dateTo: string;
    granularity: ProfitabilityFilter['granularity'];
    compare: ProfitabilityFilter['compare'];
    documentType: ProfitabilityFilter['documentType'];
    accountedType: ProfitabilityFilter['accountedType'];
  };
  rows: ProfitabilityRow[];
  totals: ProfitabilityTotals;
  /** Total group count (for pagination). */
  count: number;
  chart: {
    granularity: ProfitabilityFilter['granularity'];
    buckets: ProfitabilityChartBucket[];
    compareBuckets: ProfitabilityChartBucket[] | null;
  };
  /** По каналам продаж — posted docs missing a channel (drive the yellow banner). */
  channelBanner: { unsetDemands: number; unsetReturns: number } | null;
  currency: string;
  mixedCurrency: boolean;
}

/** Aggregate per group key, split by currency (for base consolidation). */
type SalesRow = {
  gid: string | null;
  currency: string;
  documents: bigint;
  qty: string;
  sum: bigint;
  cost: bigint;
  /**
   * Lines in this bucket whose `cost_minor` is NULL — cost was never captured.
   * NOT folded into `cost` as zero: that is the 100%-margin lie. Optional so a
   * legacy caller/fixture that predates the column degrades to "0 missing".
   */
  costMissing?: bigint;
};
type ReturnRow = SalesRow;

type Agg = {
  name: string | null;
  code: string | null;
  article: string | null;
  uom: string | null;
  channelType: string | null;
  salesDocuments: number;
  salesQty: number;
  salesSum: bigint;
  salesCost: bigint;
  returnDocuments: number;
  returnQty: number;
  returnSum: bigint;
  returnCost: bigint;
  /** Sold/returned lines with no captured cost — makes `*Cost` an UNDER-count. */
  costMissingLines: number;
};

@Injectable()
export class ProfitabilityService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async report(accountId: string, raw: unknown): Promise<ProfitabilityReport> {
    const filter = ProfitabilityFilterSchema.parse(raw);
    const now = new Date();
    const dateTo = filter.dateTo ?? now;
    const dateFrom =
      filter.dateFrom ?? new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    const { gte, lt } = reportDateBounds(dateFrom, dateTo);

    const ctx = await loadRateContext(this.prisma.client, accountId);
    const seen = new Set<string>();

    // Resolve indirect filters (folder / supplier / counterparty-group) → id lists
    // via the ORM so the raw SQL stays free of implicit-m2m table names.
    const [folderProductIds, supplierProductIds, groupCounterpartyIds] = await Promise.all([
      filter.productFolderId
        ? this.prisma.client.product
            .findMany({
              where: { accountId, productFolderId: filter.productFolderId },
              select: { id: true },
            })
            .then((r) => r.map((x) => x.id))
        : Promise.resolve(null),
      filter.supplierId
        ? this.prisma.client.product
            .findMany({
              where: { accountId, supplierId: filter.supplierId },
              select: { id: true },
            })
            .then((r) => r.map((x) => x.id))
        : Promise.resolve(null),
      filter.counterpartyGroupId
        ? this.prisma.client.counterparty
            .findMany({
              where: { accountId, groups: { some: { id: filter.counterpartyGroupId } } },
              select: { id: true },
            })
            .then((r) => r.map((x) => x.id))
        : Promise.resolve(null),
    ]);

    const includeDemands = filter.documentType !== 'retail';
    // Retail carries no per-line cost + no channel — only meaningful for the
    // product/employee/counterparty tabs and never when a channel/contract/
    // project/retail-store-incompatible filter is active. Kept honest & bounded.
    const includeRetail =
      filter.documentType !== 'demand' &&
      filter.groupBy !== 'saleschannel' &&
      !filter.salesChannelId &&
      !filter.contractId &&
      !filter.projectId;

    // ---- WHERE builders -------------------------------------------------
    const inUuid = (ids: string[]) =>
      ids.length === 0 ? Prisma.sql`(NULL)` : Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`));

    // Position-level predicate (accountedType + product scoping). `a` = position alias.
    const posWhere = (a: string): Prisma.Sql => {
      const parts: Prisma.Sql[] = [];
      if (filter.accountedType === 'products')
        parts.push(Prisma.sql`AND ${Prisma.raw(a)}.assortment_kind IN ('product','variant')`);
      else if (filter.accountedType === 'services')
        parts.push(Prisma.sql`AND ${Prisma.raw(a)}.assortment_kind = 'service'`);
      else if (filter.accountedType === 'bundles')
        parts.push(Prisma.sql`AND ${Prisma.raw(a)}.assortment_kind = 'bundle'`);
      if (filter.productId)
        parts.push(
          Prisma.sql`AND (${Prisma.raw(a)}.product_id = ${filter.productId}::uuid OR ${Prisma.raw(a)}.assortment_id = ${filter.productId}::uuid)`,
        );
      if (folderProductIds)
        parts.push(Prisma.sql`AND ${Prisma.raw(a)}.product_id IN (${inUuid(folderProductIds)})`);
      if (supplierProductIds)
        parts.push(Prisma.sql`AND ${Prisma.raw(a)}.product_id IN (${inUuid(supplierProductIds)})`);
      return parts.length ? Prisma.join(parts, ' ') : Prisma.empty;
    };

    // Document-level predicate on demands. `d` alias.
    const demandWhere = (): Prisma.Sql => {
      const parts: Prisma.Sql[] = [
        Prisma.sql`d.account_id = ${accountId}::uuid`,
        Prisma.sql`AND d.state = 'posted'`,
        Prisma.sql`AND d.deleted_at IS NULL`,
        Prisma.sql`AND d.moment >= ${gte} AND d.moment < ${lt}`,
      ];
      if (filter.storeId) parts.push(Prisma.sql`AND d.store_id = ${filter.storeId}::uuid`);
      if (filter.projectId) parts.push(Prisma.sql`AND d.project_id = ${filter.projectId}::uuid`);
      if (filter.contractId) parts.push(Prisma.sql`AND d.contract_id = ${filter.contractId}::uuid`);
      if (filter.organizationId)
        parts.push(Prisma.sql`AND d.organization_id = ${filter.organizationId}::uuid`);
      if (filter.salesChannelId)
        parts.push(Prisma.sql`AND d.sales_channel_id = ${filter.salesChannelId}::uuid`);
      if (filter.counterpartyId)
        parts.push(Prisma.sql`AND d.agent_id = ${filter.counterpartyId}::uuid`);
      if (groupCounterpartyIds)
        parts.push(Prisma.sql`AND d.agent_id IN (${inUuid(groupCounterpartyIds)})`);
      return Prisma.join(parts, ' ');
    };

    // Document-level predicate on sales_returns. `sr` alias.
    const returnWhere = (): Prisma.Sql => {
      const parts: Prisma.Sql[] = [
        Prisma.sql`sr.account_id = ${accountId}::uuid`,
        Prisma.sql`AND sr.state = 'posted'`,
        Prisma.sql`AND sr.deleted_at IS NULL`,
        Prisma.sql`AND sr.moment >= ${gte} AND sr.moment < ${lt}`,
      ];
      if (filter.storeId) parts.push(Prisma.sql`AND sr.store_id = ${filter.storeId}::uuid`);
      if (filter.projectId) parts.push(Prisma.sql`AND sr.project_id = ${filter.projectId}::uuid`);
      if (filter.contractId)
        parts.push(Prisma.sql`AND sr.contract_id = ${filter.contractId}::uuid`);
      if (filter.organizationId)
        parts.push(Prisma.sql`AND sr.organization_id = ${filter.organizationId}::uuid`);
      if (filter.salesChannelId)
        parts.push(Prisma.sql`AND sr.sales_channel_id = ${filter.salesChannelId}::uuid`);
      if (filter.counterpartyId)
        parts.push(Prisma.sql`AND sr.agent_id = ${filter.counterpartyId}::uuid`);
      if (groupCounterpartyIds)
        parts.push(Prisma.sql`AND sr.agent_id IN (${inUuid(groupCounterpartyIds)})`);
      return Prisma.join(parts, ' ');
    };

    // ---- Group-key + label joins per tab --------------------------------
    const isProduct = filter.groupBy === 'product';
    // demand group key + returns group key + label select/join fragments.
    let demandKey: Prisma.Sql;
    let returnKey: Prisma.Sql;
    let excludeNullKey = false;

    if (isProduct) {
      demandKey = filter.splitByVariants
        ? Prisma.sql`dp.assortment_id`
        : Prisma.sql`COALESCE(dp.product_id, dp.assortment_id)`;
      returnKey = filter.splitByVariants
        ? Prisma.sql`srp.assortment_id`
        : Prisma.sql`COALESCE(srp.product_id, srp.assortment_id)`;
    } else if (filter.groupBy === 'employee') {
      demandKey = Prisma.sql`d.owner_id`;
      returnKey = Prisma.sql`sr.owner_id`;
      excludeNullKey = true;
    } else if (filter.groupBy === 'counterparty') {
      demandKey = Prisma.sql`d.agent_id`;
      returnKey = Prisma.sql`sr.agent_id`;
    } else {
      // saleschannel
      demandKey = Prisma.sql`d.sales_channel_id`;
      returnKey = Prisma.sql`sr.sales_channel_id`;
      excludeNullKey = true;
    }

    // ---- Aggregate queries (key + currency only; labels resolved after) ---
    const salesRows: SalesRow[] = includeDemands
      ? await this.prisma.client.$queryRaw<SalesRow[]>`
          SELECT
            ${demandKey}::text AS gid,
            d.currency AS currency,
            COUNT(DISTINCT d.id)::bigint AS documents,
            COALESCE(SUM(dp.quantity), 0)::text AS qty,
            COALESCE(SUM((dp.quantity * dp.price_minor * (100 - dp.discount) / 100)::numeric), 0)::bigint AS sum,
            COALESCE(SUM((dp.quantity * dp.cost_minor)::numeric), 0)::bigint AS cost,
            COUNT(*) FILTER (WHERE dp.cost_minor IS NULL)::bigint AS "costMissing"
          FROM demand_positions dp
          JOIN demands d ON d.id = dp.demand_id AND ${demandWhere()}
          WHERE dp.assortment_id IS NOT NULL ${posWhere('dp')}
          GROUP BY ${demandKey}, d.currency
        `
      : [];

    const retailRows: SalesRow[] =
      includeRetail && filter.groupBy !== 'saleschannel'
        ? await this.queryRetailSales(accountId, filter, gte, lt)
        : [];

    const returnRows: ReturnRow[] = await this.prisma.client.$queryRaw<ReturnRow[]>`
      SELECT
        ${returnKey}::text AS gid,
        sr.currency AS currency,
        COUNT(DISTINCT sr.id)::bigint AS documents,
        COALESCE(SUM(srp.quantity), 0)::text AS qty,
        COALESCE(SUM((srp.quantity * srp.price_minor * (100 - srp.discount) / 100)::numeric), 0)::bigint AS sum,
        COALESCE(SUM((srp.quantity * srp.cost_minor)::numeric), 0)::bigint AS cost,
        COUNT(*) FILTER (WHERE srp.cost_minor IS NULL)::bigint AS "costMissing"
      FROM sales_return_positions srp
      JOIN sales_returns sr ON sr.id = srp.sales_return_id AND ${returnWhere()}
      WHERE srp.assortment_id IS NOT NULL ${posWhere('srp')}
      GROUP BY ${returnKey}, sr.currency
    `;

    // ---- Merge into per-group aggregates --------------------------------
    const byGroup = new Map<string, Agg>();
    const ensure = (gid: string): Agg => {
      let a = byGroup.get(gid);
      if (!a) {
        a = {
          name: null,
          code: null,
          article: null,
          uom: null,
          channelType: null,
          salesDocuments: 0,
          salesQty: 0,
          salesSum: 0n,
          salesCost: 0n,
          returnDocuments: 0,
          returnQty: 0,
          returnSum: 0n,
          returnCost: 0n,
          costMissingLines: 0,
        };
        byGroup.set(gid, a);
      }
      return a;
    };

    for (const r of [...salesRows, ...retailRows]) {
      if (r.gid == null && excludeNullKey) continue;
      const gid = r.gid ?? '__none__';
      const a = ensure(gid);
      a.salesDocuments += Number(r.documents);
      a.salesQty += Number(r.qty || '0');
      a.salesSum += consolidateToBase(r.sum, r.currency, ctx, seen);
      a.salesCost += r.cost; // already base
      a.costMissingLines += Number(r.costMissing ?? 0n);
    }
    for (const r of returnRows) {
      if (r.gid == null && excludeNullKey) continue;
      const gid = r.gid ?? '__none__';
      const a = ensure(gid);
      a.returnDocuments += Number(r.documents);
      a.returnQty += Number(r.qty || '0');
      a.returnSum += consolidateToBase(r.sum, r.currency, ctx, seen);
      a.returnCost += r.cost;
      a.costMissingLines += Number(r.costMissing ?? 0n);
    }

    // ---- Resolve labels for the surviving group ids ---------------------
    await this.resolveLabels(accountId, filter, byGroup);

    // ---- Shape rows -----------------------------------------------------
    let rows: ProfitabilityRow[] = [...byGroup.entries()].map(([gid, a]) => {
      const netCost = a.salesCost - a.returnCost;
      const netRev = a.salesSum - a.returnSum;
      const profit = netRev - netCost;
      return {
        id: gid,
        name: a.name ?? '—',
        code: a.code,
        article: a.article,
        uom: a.uom,
        channelType: a.channelType,
        salesDocuments: a.salesDocuments,
        salesQuantity: trimNum(a.salesQty),
        salesSumMinor: a.salesSum.toString(),
        salesSumCostMinor: a.salesCost.toString(),
        returnDocuments: a.returnDocuments,
        returnQuantity: trimNum(a.returnQty),
        returnSumMinor: a.returnSum.toString(),
        returnSumCostMinor: a.returnCost.toString(),
        profitMinor: profit.toString(),
        profitGoodsPct: pct(profit, netCost),
        profitSalesPct: pct(profit, netRev),
        costMissingLines: a.costMissingLines,
        costIncomplete: a.costMissingLines > 0,
      };
    });

    // ---- Sort + totals + paginate ---------------------------------------
    rows.sort(rowComparator(filter.sortBy, filter.sortDir));
    const count = rows.length;
    const totals = computeTotals(rows);
    rows = rows.slice(filter.offset, filter.offset + filter.limit);

    // ---- Chart ----------------------------------------------------------
    const buckets = await this.chartBuckets(accountId, filter, gte, lt, ctx, seen, {
      posWhere,
      includeDemands,
    });
    let compareBuckets: ProfitabilityChartBucket[] | null = null;
    if (filter.compare !== 'none') {
      let cGte: Date;
      let cLt: Date;
      if (filter.compareFrom && filter.compareTo) {
        // «Настроить» — explicit comparison window from the FE.
        ({ gte: cGte, lt: cLt } = reportDateBounds(filter.compareFrom, filter.compareTo));
      } else if (filter.compare === 'year') {
        cGte = new Date(gte);
        cGte.setUTCFullYear(gte.getUTCFullYear() - 1);
        cLt = new Date(lt);
        cLt.setUTCFullYear(lt.getUTCFullYear() - 1);
      } else {
        // previous period of the same length, immediately before the window.
        const span = lt.getTime() - gte.getTime();
        cGte = new Date(gte.getTime() - span);
        cLt = new Date(gte.getTime());
      }
      compareBuckets = await this.chartBuckets(accountId, filter, cGte, cLt, ctx, seen, {
        posWhere,
        includeDemands,
      });
    }

    // ---- Channel banner -------------------------------------------------
    let channelBanner: ProfitabilityReport['channelBanner'] = null;
    if (filter.groupBy === 'saleschannel') {
      const [d, r] = await Promise.all([
        this.prisma.client.demand.count({
          where: {
            accountId,
            state: 'posted',
            deletedAt: null,
            moment: { gte, lt },
            salesChannelId: null,
          },
        }),
        this.prisma.client.salesReturn.count({
          where: {
            accountId,
            state: 'posted',
            deletedAt: null,
            moment: { gte, lt },
            salesChannelId: null,
          },
        }),
      ]);
      channelBanner = { unsetDemands: d, unsetReturns: r };
    }

    return {
      groupBy: filter.groupBy,
      filter: {
        dateFrom: dateFrom.toISOString(),
        dateTo: dateTo.toISOString(),
        granularity: filter.granularity,
        compare: filter.compare,
        documentType: filter.documentType,
        accountedType: filter.accountedType,
      },
      rows,
      totals,
      count,
      chart: { granularity: filter.granularity, buckets, compareBuckets },
      channelBanner,
      currency: ctx.baseCode,
      mixedCurrency: seen.size > 1,
    };
  }

  /**
   * Retail «Продажа» sales aggregate — revenue/qty/documents + FROZEN per-line cost.
   *
   * 2026-08-02 (To'lqin 1.2): this used to select a literal `0::bigint AS cost`,
   * so every POS receipt was reported at **100% margin** and owners made pricing
   * decisions on that number. To'lqin 1.1 added `retail_sale_positions.cost_minor`
   * (frozen at post()), so the real cost is now available.
   *
   * NULL ≠ 0 — the whole point. `SUM(quantity * cost_minor)` SKIPS NULL lines
   * rather than COALESCE-ing them to zero, and `costMissing` counts them so the
   * caller can label the row «tan narx yig'ilmagan». Coalescing here would just
   * change the shape of the same lie: pre-1.1 receipts would read as free goods.
   */
  private async queryRetailSales(
    accountId: string,
    filter: ProfitabilityFilter,
    gte: Date,
    lt: Date,
  ): Promise<SalesRow[]> {
    // Retail positions have product_id but no assortment_kind — treat as products.
    if (filter.accountedType === 'services' || filter.accountedType === 'bundles') return [];
    let key: Prisma.Sql;
    if (filter.groupBy === 'product') key = Prisma.sql`rsp.product_id`;
    else if (filter.groupBy === 'employee') key = Prisma.sql`rs.owner_id`;
    else key = Prisma.sql`rs.agent_id`;

    const rsParts: Prisma.Sql[] = [
      Prisma.sql`rs.account_id = ${accountId}::uuid`,
      Prisma.sql`AND rs.state = 'posted'`,
      Prisma.sql`AND rs.moment >= ${gte} AND rs.moment < ${lt}`,
    ];
    if (filter.storeId) rsParts.push(Prisma.sql`AND rs.store_id = ${filter.storeId}::uuid`);
    // «Точка продаж» — retail-only, filters retail receipts by their store.
    if (filter.retailStoreId)
      rsParts.push(Prisma.sql`AND rs.store_id = ${filter.retailStoreId}::uuid`);
    if (filter.organizationId)
      rsParts.push(Prisma.sql`AND rs.organization_id = ${filter.organizationId}::uuid`);
    if (filter.counterpartyId)
      rsParts.push(Prisma.sql`AND rs.agent_id = ${filter.counterpartyId}::uuid`);
    const rspPos = filter.productId
      ? Prisma.sql`AND rsp.product_id = ${filter.productId}::uuid`
      : Prisma.empty;
    const rows = await this.prisma.client.$queryRaw<SalesRow[]>`
      SELECT
        ${key}::text AS gid,
        'UZS' AS currency,
        COUNT(DISTINCT rs.id)::bigint AS documents,
        COALESCE(SUM(rsp.quantity), 0)::text AS qty,
        COALESCE(SUM(rsp.sum_minor), 0)::bigint AS sum,
        COALESCE(SUM((rsp.quantity * rsp.cost_minor)::numeric), 0)::bigint AS cost,
        COUNT(*) FILTER (WHERE rsp.cost_minor IS NULL)::bigint AS "costMissing"
      FROM retail_sale_positions rsp
      JOIN retail_sales rs ON rs.id = rsp.retail_sale_id AND ${Prisma.join(rsParts, ' ')}
      WHERE rsp.product_id IS NOT NULL ${rspPos}
      GROUP BY ${key}
    `;
    return filter.groupBy === 'product' ? rows : rows.filter((r) => r.gid != null);
  }

  /**
   * Batch-resolve display labels for the surviving group ids (products +
   * variants for the product tab, else employees / counterparties / channels).
   * Kept out of the aggregate SQL so the GROUP BY never touches ambiguous
   * table columns (both `demands` and `employees` have a `name` column).
   */
  private async resolveLabels(
    accountId: string,
    filter: ProfitabilityFilter,
    byGroup: Map<string, Agg>,
  ): Promise<void> {
    const ids = [...byGroup.keys()].filter((k) => k !== '__none__');
    if (ids.length === 0) return;

    if (filter.groupBy === 'product') {
      const [products, variants] = await Promise.all([
        this.prisma.client.product.findMany({
          where: { accountId, id: { in: ids } },
          select: { id: true, name: true, code: true, article: true, uom: true },
        }),
        filter.splitByVariants
          ? this.prisma.client.variant.findMany({
              where: { accountId, id: { in: ids } },
              select: {
                id: true,
                name: true,
                code: true,
                product: { select: { article: true, uom: true } },
              },
            })
          : Promise.resolve([]),
      ]);
      for (const p of products) {
        const a = byGroup.get(p.id);
        if (a) {
          a.name = p.name;
          a.code = p.code;
          a.article = p.article;
          a.uom = p.uom;
        }
      }
      for (const v of variants) {
        const a = byGroup.get(v.id);
        if (a) {
          a.name = v.name;
          a.code = v.code;
          a.article = v.product?.article ?? null;
          a.uom = v.product?.uom ?? null;
        }
      }
    } else if (filter.groupBy === 'employee') {
      const emps = await this.prisma.client.employee.findMany({
        where: { accountId, id: { in: ids } },
        select: { id: true, name: true, fullName: true },
      });
      for (const e of emps) {
        const a = byGroup.get(e.id);
        if (a) a.name = e.fullName || e.name;
      }
    } else if (filter.groupBy === 'counterparty') {
      const cps = await this.prisma.client.counterparty.findMany({
        where: { accountId, id: { in: ids } },
        select: { id: true, name: true, code: true },
      });
      for (const c of cps) {
        const a = byGroup.get(c.id);
        if (a) {
          a.name = c.name;
          a.code = c.code;
        }
      }
    } else {
      const chs = await this.prisma.client.salesChannel.findMany({
        where: { accountId, id: { in: ids } },
        select: { id: true, name: true, code: true, type: true },
      });
      for (const c of chs) {
        const a = byGroup.get(c.id);
        if (a) {
          a.name = c.name;
          a.code = c.code;
          a.channelType = c.type;
        }
      }
    }
  }

  /** Compute time-bucketed chart series for [gte,lt) at the chosen granularity. */
  private async chartBuckets(
    accountId: string,
    filter: ProfitabilityFilter,
    gte: Date,
    lt: Date,
    ctx: RateContext,
    seen: Set<string>,
    q: {
      posWhere: (a: string) => Prisma.Sql;
      includeDemands: boolean;
    },
  ): Promise<ProfitabilityChartBucket[]> {
    const gran = filter.granularity;
    // Truncate in Tashkent-local time, then convert BACK to timestamptz so
    // Prisma reads an unambiguous absolute instant (the true UTC moment of the
    // Tashkent bucket start). A bare `date_trunc(... AT TIME ZONE ...)` returns
    // a naive timestamp whose JS Date is TZ-of-process-dependent and would NOT
    // line up with enumerateBuckets' keys (chart flat-lined at 0 otherwise).
    const trunc = (col: string) =>
      Prisma.sql`(date_trunc(${gran}, (${Prisma.raw(col)} AT TIME ZONE 'Asia/Tashkent')) AT TIME ZONE 'Asia/Tashkent')`;

    type BucketRow = {
      bucket: Date;
      currency: string;
      documents: bigint;
      qty: string;
      sum: bigint;
      cost: bigint;
      costMissing?: bigint;
    };
    // The chart carries the SAME (non-date) filters but its own [gte,lt) — passed
    // explicitly so the compare period reuses this method with shifted bounds.
    const salesBuckets: BucketRow[] = q.includeDemands
      ? await this.prisma.client.$queryRaw<BucketRow[]>`
          SELECT ${trunc('d.moment')} AS bucket, d.currency AS currency,
            COUNT(DISTINCT d.id)::bigint AS documents,
            COALESCE(SUM(dp.quantity), 0)::text AS qty,
            COALESCE(SUM((dp.quantity * dp.price_minor * (100 - dp.discount) / 100)::numeric), 0)::bigint AS sum,
            COALESCE(SUM((dp.quantity * dp.cost_minor)::numeric), 0)::bigint AS cost,
            COUNT(*) FILTER (WHERE dp.cost_minor IS NULL)::bigint AS "costMissing"
          FROM demand_positions dp
          JOIN demands d ON d.id = dp.demand_id AND ${this.windowedDemandWhere(accountId, filter, gte, lt)}
          WHERE dp.assortment_id IS NOT NULL ${q.posWhere('dp')}
          GROUP BY 1, d.currency
        `
      : [];
    const returnBuckets: BucketRow[] = await this.prisma.client.$queryRaw<BucketRow[]>`
      SELECT ${trunc('sr.moment')} AS bucket, sr.currency AS currency,
        COUNT(DISTINCT sr.id)::bigint AS documents,
        COALESCE(SUM(srp.quantity), 0)::text AS qty,
        COALESCE(SUM((srp.quantity * srp.price_minor * (100 - srp.discount) / 100)::numeric), 0)::bigint AS sum,
        COALESCE(SUM((srp.quantity * srp.cost_minor)::numeric), 0)::bigint AS cost,
        COUNT(*) FILTER (WHERE srp.cost_minor IS NULL)::bigint AS "costMissing"
      FROM sales_return_positions srp
      JOIN sales_returns sr ON sr.id = srp.sales_return_id AND ${this.windowedReturnWhere(accountId, filter, gte, lt)}
      WHERE srp.assortment_id IS NOT NULL ${q.posWhere('srp')}
      GROUP BY 1, sr.currency
    `;

    const map = new Map<string, ProfitabilityChartBucket>();
    const keyOf = (d: Date) => d.toISOString();
    const ensure = (d: Date): ProfitabilityChartBucket => {
      const k = keyOf(d);
      let b = map.get(k);
      if (!b) {
        b = {
          start: k,
          salesDocuments: 0,
          salesQuantity: '0',
          salesSumMinor: '0',
          salesSumCostMinor: '0',
          returnDocuments: 0,
          returnQuantity: '0',
          returnSumMinor: '0',
          returnSumCostMinor: '0',
          profitMinor: '0',
          profitGoodsPct: '',
          profitSalesPct: '',
          avgCheckMinor: '0',
          costMissingLines: 0,
          costIncomplete: false,
        };
        map.set(k, b);
      }
      return b;
    };
    for (const r of salesBuckets) {
      const b = ensure(r.bucket);
      b.salesDocuments += Number(r.documents);
      b.salesQuantity = trimNum(Number(b.salesQuantity) + Number(r.qty || '0'));
      b.salesSumMinor = (
        BigInt(b.salesSumMinor) + consolidateToBase(r.sum, r.currency, ctx, seen)
      ).toString();
      b.salesSumCostMinor = (BigInt(b.salesSumCostMinor) + r.cost).toString();
      b.costMissingLines += Number(r.costMissing ?? 0n);
    }
    for (const r of returnBuckets) {
      const b = ensure(r.bucket);
      b.returnDocuments += Number(r.documents);
      b.returnQuantity = trimNum(Number(b.returnQuantity) + Number(r.qty || '0'));
      b.returnSumMinor = (
        BigInt(b.returnSumMinor) + consolidateToBase(r.sum, r.currency, ctx, seen)
      ).toString();
      b.returnSumCostMinor = (BigInt(b.returnSumCostMinor) + r.cost).toString();
      b.costMissingLines += Number(r.costMissing ?? 0n);
    }
    // Finalise derived series + fill empty buckets across the whole range.
    const out: ProfitabilityChartBucket[] = [];
    for (const start of enumerateBuckets(gte, lt, gran)) {
      const b = map.get(start.toISOString()) ?? ensure(start);
      const netCost = BigInt(b.salesSumCostMinor) - BigInt(b.returnSumCostMinor);
      const netRev = BigInt(b.salesSumMinor) - BigInt(b.returnSumMinor);
      const profit = netRev - netCost;
      b.profitMinor = profit.toString();
      b.profitGoodsPct = pct(profit, netCost);
      b.profitSalesPct = pct(profit, netRev);
      b.avgCheckMinor = (
        b.salesDocuments > 0 ? BigInt(b.salesSumMinor) / BigInt(b.salesDocuments) : 0n
      ).toString();
      b.costIncomplete = b.costMissingLines > 0;
      out.push(b);
    }
    return out;
  }

  private windowedDemandWhere(
    accountId: string,
    filter: ProfitabilityFilter,
    gte: Date,
    lt: Date,
  ): Prisma.Sql {
    const parts: Prisma.Sql[] = [
      Prisma.sql`d.account_id = ${accountId}::uuid`,
      Prisma.sql`AND d.state = 'posted'`,
      Prisma.sql`AND d.deleted_at IS NULL`,
      Prisma.sql`AND d.moment >= ${gte} AND d.moment < ${lt}`,
    ];
    if (filter.storeId) parts.push(Prisma.sql`AND d.store_id = ${filter.storeId}::uuid`);
    if (filter.projectId) parts.push(Prisma.sql`AND d.project_id = ${filter.projectId}::uuid`);
    if (filter.contractId) parts.push(Prisma.sql`AND d.contract_id = ${filter.contractId}::uuid`);
    if (filter.organizationId)
      parts.push(Prisma.sql`AND d.organization_id = ${filter.organizationId}::uuid`);
    if (filter.salesChannelId)
      parts.push(Prisma.sql`AND d.sales_channel_id = ${filter.salesChannelId}::uuid`);
    if (filter.counterpartyId)
      parts.push(Prisma.sql`AND d.agent_id = ${filter.counterpartyId}::uuid`);
    return Prisma.join(parts, ' ');
  }

  private windowedReturnWhere(
    accountId: string,
    filter: ProfitabilityFilter,
    gte: Date,
    lt: Date,
  ): Prisma.Sql {
    const parts: Prisma.Sql[] = [
      Prisma.sql`sr.account_id = ${accountId}::uuid`,
      Prisma.sql`AND sr.state = 'posted'`,
      Prisma.sql`AND sr.deleted_at IS NULL`,
      Prisma.sql`AND sr.moment >= ${gte} AND sr.moment < ${lt}`,
    ];
    if (filter.storeId) parts.push(Prisma.sql`AND sr.store_id = ${filter.storeId}::uuid`);
    if (filter.projectId) parts.push(Prisma.sql`AND sr.project_id = ${filter.projectId}::uuid`);
    if (filter.contractId) parts.push(Prisma.sql`AND sr.contract_id = ${filter.contractId}::uuid`);
    if (filter.organizationId)
      parts.push(Prisma.sql`AND sr.organization_id = ${filter.organizationId}::uuid`);
    if (filter.salesChannelId)
      parts.push(Prisma.sql`AND sr.sales_channel_id = ${filter.salesChannelId}::uuid`);
    if (filter.counterpartyId)
      parts.push(Prisma.sql`AND sr.agent_id = ${filter.counterpartyId}::uuid`);
    return Prisma.join(parts, ' ');
  }
}

// ---- pure helpers -----------------------------------------------------
function trimNum(n: number): string {
  // Decimal-ish quantity → trimmed string (avoid "3.0000000000000004").
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 1e6) / 1e6);
}

// Foiz endi yagona qatlamdan (`report/metrics/`) keladi. Ilgari bu yerda
// `Number(numer) / Number(denom)` turardi — BigInt'ni Float orqali bo'lish
// 2^53 tiyindan katta yig'indida aniqlikni jimgina yo'qotadi, va boshqa
// hisobotlar shu ratio'ni boshqacha yaxlitlardi (analitika TZ §4, X4).
const pct = percentText;

function computeTotals(rows: ProfitabilityRow[]): ProfitabilityTotals {
  let salesDocuments = 0;
  let salesQty = 0;
  let salesSum = 0n;
  let salesCost = 0n;
  let returnDocuments = 0;
  let returnQty = 0;
  let returnSum = 0n;
  let returnCost = 0n;
  let costMissingLines = 0;
  for (const r of rows) {
    costMissingLines += r.costMissingLines;
    salesDocuments += r.salesDocuments;
    salesQty += Number(r.salesQuantity);
    salesSum += BigInt(r.salesSumMinor);
    salesCost += BigInt(r.salesSumCostMinor);
    returnDocuments += r.returnDocuments;
    returnQty += Number(r.returnQuantity);
    returnSum += BigInt(r.returnSumMinor);
    returnCost += BigInt(r.returnSumCostMinor);
  }
  const netCost = salesCost - returnCost;
  const netRev = salesSum - returnSum;
  const profit = netRev - netCost;
  return {
    salesDocuments,
    salesQuantity: trimNum(salesQty),
    salesSumMinor: salesSum.toString(),
    salesSumCostMinor: salesCost.toString(),
    returnDocuments,
    returnQuantity: trimNum(returnQty),
    returnSumMinor: returnSum.toString(),
    returnSumCostMinor: returnCost.toString(),
    profitMinor: profit.toString(),
    profitGoodsPct: pct(profit, netCost),
    profitSalesPct: pct(profit, netRev),
    costMissingLines,
    costIncomplete: costMissingLines > 0,
  };
}

function rowComparator(
  sortBy: ProfitabilityFilter['sortBy'],
  dir: ProfitabilityFilter['sortDir'],
): (a: ProfitabilityRow, b: ProfitabilityRow) => number {
  const s = dir === 'asc' ? 1 : -1;
  const bi = (v: string) => BigInt(v || '0');
  return (a, b) => {
    switch (sortBy) {
      case 'name':
        return a.name.localeCompare(b.name) * s;
      case 'salesDocuments':
        return (a.salesDocuments - b.salesDocuments) * s;
      case 'salesQuantity':
        return (Number(a.salesQuantity) - Number(b.salesQuantity)) * s;
      case 'salesSum':
        return cmpBig(bi(a.salesSumMinor), bi(b.salesSumMinor)) * s;
      case 'salesSumCost':
        return cmpBig(bi(a.salesSumCostMinor), bi(b.salesSumCostMinor)) * s;
      case 'returnSum':
        return cmpBig(bi(a.returnSumMinor), bi(b.returnSumMinor)) * s;
      case 'profitGoodsPct':
        return (num(a.profitGoodsPct) - num(b.profitGoodsPct)) * s;
      case 'profitSalesPct':
        return (num(a.profitSalesPct) - num(b.profitSalesPct)) * s;
      default:
        return cmpBig(bi(a.profitMinor), bi(b.profitMinor)) * s;
    }
  };
}

function num(v: string): number {
  return v === '' ? Number.NEGATIVE_INFINITY : Number.parseFloat(v);
}
function cmpBig(a: bigint, b: bigint): number {
  return a > b ? 1 : a < b ? -1 : 0;
}

const HOUR_MS = 3600_000;
const DAY_MS = 86_400_000;
const TASHKENT_MS = 5 * HOUR_MS;

/**
 * Enumerate Tashkent-aligned bucket starts across [gte,lt). Buckets are
 * emitted as UTC Dates whose ISO matches Postgres `date_trunc(gran, moment AT
 * TIME ZONE 'Asia/Tashkent')` — i.e. Tashkent-local truncation re-expressed as
 * UTC midnight of that local instant. We compute in Tashkent-local space then
 * subtract the offset so the ISO keys line up with the SQL grouping.
 */
function enumerateBuckets(gte: Date, lt: Date, gran: ProfitabilityFilter['granularity']): Date[] {
  const out: Date[] = [];
  // Work in Tashkent-local ms (shift +5h), truncate, then shift back for the key.
  const localStart = gte.getTime() + TASHKENT_MS;
  const localEnd = lt.getTime() + TASHKENT_MS;
  let cur = truncLocal(localStart, gran);
  let guard = 0;
  while (cur < localEnd && guard++ < 2000) {
    // key = local truncated instant re-expressed as if UTC (subtract offset)
    out.push(new Date(cur - TASHKENT_MS));
    cur = advanceLocal(cur, gran);
  }
  return out;
}

function truncLocal(ms: number, gran: ProfitabilityFilter['granularity']): number {
  const d = new Date(ms);
  if (gran === 'hour')
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours());
  if (gran === 'month') return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  if (gran === 'week') {
    // Postgres date_trunc('week') → Monday 00:00.
    const day = d.getUTCDay(); // 0=Sun..6=Sat
    const backToMon = (day + 6) % 7;
    const mon = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - backToMon);
    return mon;
  }
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function advanceLocal(ms: number, gran: ProfitabilityFilter['granularity']): number {
  const d = new Date(ms);
  if (gran === 'hour') return ms + HOUR_MS;
  if (gran === 'week') return ms + 7 * DAY_MS;
  if (gran === 'month') return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  return ms + DAY_MS;
}
