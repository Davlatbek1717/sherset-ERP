import { Prisma } from '@moysklad/db';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { reportDateBounds } from './report-date-bounds.util.js';
import { loadRateContext } from './report-rate-ctx.util.js';
import { type TurnoverFilterInput, TurnoverFilterSchema } from './turnover.schema.js';

const DECIMAL_ZERO = new Prisma.Decimal(0);

/** One product/variant row of the turnover report. Money is minor units (string). */
export interface TurnoverRow {
  assortmentKind: string;
  assortmentId: string;
  productName: string;
  productCode: string | null;
  productArticle: string | null;
  productUom: string | null;
  openingQty: string;
  openingSumMinor: string;
  incomeQty: string;
  incomeSumMinor: string;
  outcomeQty: string;
  outcomeSumMinor: string;
  closingQty: string;
  closingSumMinor: string;
}

export interface TurnoverSummary {
  openingQty: string;
  openingSumMinor: string;
  incomeQty: string;
  incomeSumMinor: string;
  outcomeQty: string;
  outcomeSumMinor: string;
  closingQty: string;
  closingSumMinor: string;
}

export interface TurnoverReport {
  filter: { dateFrom: string; dateTo: string; storeId?: string; search?: string };
  items: TurnoverRow[];
  total: number;
  summaries: TurnoverSummary;
  /** Account base (валюта учёта) code — ledger cost is stored in base minor units. */
  currency: string;
}

/** Raw per-(store,assortment) measure columns from the aggregation SQL. */
interface RawMeasures {
  opening_qty: string | null;
  opening_sum: bigint | null;
  in_qty: string | null;
  in_sum: bigint | null;
  out_qty: string | null;
  out_sum: bigint | null;
}
interface RawRow extends RawMeasures {
  assortmentKind: string;
  assortmentId: string;
}

/**
 * «Обороты» — stock turnover report (moysklad Склад → Обороты, 1:1 live-grounded
 * 2026-06-20: columns Наименование · Код · Артикул · Ед. изм. | Начало периода ·
 * Приход · Расход · Конец периода, each with Кол-во + Сумма; grand-total «Итого»).
 *
 * Source of truth = the append-only `StockOperation` ledger (qtyDelta signed,
 * costDeltaMinor signed base-currency cost). For a period [from,to):
 *   Начало периода = Σ qtyDelta where occurred_at < from   (opening balance)
 *   Приход         = Σ qtyDelta>0 in [from,to)             (incoming)
 *   Расход         = Σ −qtyDelta<0 in [from,to)            (outgoing, shown +)
 *   Конец периода  = Начало + Приход − Расход              (closing balance)
 * Сумма mirrors each with costDeltaMinor (COALESCE 0 — null when FIFO cost not
 * yet captured). Identity Начало+Приход−Расход=Конец is asserted by the tests.
 */
@Injectable()
export class TurnoverService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async turnoverReport(accountId: string, raw: unknown): Promise<TurnoverReport> {
    const filter = this.parseFilter(raw);
    const to = filter.dateTo ?? new Date();
    const from = filter.dateFrom ?? new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));
    const { gte, lt } = reportDateBounds(from, to);

    const ctx = await loadRateContext(this.prisma.client, accountId);

    // Optional search → resolve matching product ids first (the ledger has no
    // product name/code). Empty match short-circuits to an empty report.
    let productIds: string[] | undefined;
    if (filter.search) {
      const matches = await this.prisma.client.product.findMany({
        where: {
          accountId,
          deletedAt: null,
          OR: [
            { name: { contains: filter.search, mode: 'insensitive' } },
            { code: { contains: filter.search, mode: 'insensitive' } },
            { article: { contains: filter.search, mode: 'insensitive' } },
          ],
        },
        select: { id: true },
        take: 1000,
      });
      productIds = matches.map((m) => m.id);
      if (productIds.length === 0) {
        return this.emptyReport(from, to, filter, ctx.baseCode);
      }
    }

    // Shared WHERE: everything that occurred before the period END contributes
    // (opening uses < from inside the CASE; in/out use >= from). $1 acct, $2 gte,
    // $3 lt, then optional store / kind / product-ids.
    const params: unknown[] = [accountId, gte, lt];
    let where = 'account_id = $1::uuid AND occurred_at < $3';
    if (filter.storeId) {
      params.push(filter.storeId);
      where += ` AND store_id = $${params.length}::uuid`;
    }
    if (filter.assortmentKind) {
      params.push(filter.assortmentKind);
      where += ` AND assortment_kind = $${params.length}`;
    }
    if (productIds) {
      params.push(productIds);
      where += ` AND assortment_id = ANY($${params.length}::uuid[])`;
    }

    // Measure expressions reused by the totals + rows queries. $2 = period start
    // (gte). Upper bound (< $3) is already enforced by the WHERE clause.
    const measures = `
      SUM(CASE WHEN occurred_at < $2 THEN qty_delta ELSE 0 END) AS opening_qty,
      SUM(CASE WHEN occurred_at < $2 THEN COALESCE(cost_delta_minor, 0) ELSE 0 END)::bigint AS opening_sum,
      SUM(CASE WHEN occurred_at >= $2 AND qty_delta > 0 THEN qty_delta ELSE 0 END) AS in_qty,
      SUM(CASE WHEN occurred_at >= $2 AND qty_delta > 0 THEN COALESCE(cost_delta_minor, 0) ELSE 0 END)::bigint AS in_sum,
      SUM(CASE WHEN occurred_at >= $2 AND qty_delta < 0 THEN -qty_delta ELSE 0 END) AS out_qty,
      SUM(CASE WHEN occurred_at >= $2 AND qty_delta < 0 THEN -COALESCE(cost_delta_minor, 0) ELSE 0 END)::bigint AS out_sum`;

    // 1) Grand totals — over ALL matching assortments (so «Итого» reflects the
    // whole report, not just the visible page).
    const totalsSql = `SELECT ${measures} FROM stock_operations WHERE ${where}`;
    const totalsRows = await this.prisma.client.$queryRawUnsafe<RawMeasures[]>(
      totalsSql,
      ...params,
    );
    const summaries = this.toSummary(totalsRows[0]);

    // 2) Per-assortment rows, hide-empty in SQL, ordered by period activity, capped.
    const having = filter.hideEmpty
      ? `HAVING SUM(CASE WHEN occurred_at < $2 THEN qty_delta ELSE 0 END) <> 0
           OR SUM(CASE WHEN occurred_at >= $2 AND qty_delta > 0 THEN qty_delta ELSE 0 END) <> 0
           OR SUM(CASE WHEN occurred_at >= $2 AND qty_delta < 0 THEN qty_delta ELSE 0 END) <> 0`
      : '';
    params.push(filter.limit);
    const rowsSql = `
      SELECT assortment_kind AS "assortmentKind", assortment_id AS "assortmentId",
        ${measures},
        SUM(CASE WHEN occurred_at >= $2 THEN ABS(qty_delta) ELSE 0 END) AS movement
      FROM stock_operations
      WHERE ${where}
      GROUP BY assortment_kind, assortment_id
      ${having}
      ORDER BY movement DESC, assortment_id ASC
      LIMIT $${params.length}`;
    const rawRows = await this.prisma.client.$queryRawUnsafe<RawRow[]>(rowsSql, ...params);

    const items = await this.resolveRows(accountId, rawRows);
    // Display order: alphabetical by product name (matches moysklad).
    items.sort((a, b) => a.productName.localeCompare(b.productName, 'ru'));

    return {
      filter: {
        dateFrom: from.toISOString().slice(0, 10),
        dateTo: to.toISOString().slice(0, 10),
        ...(filter.storeId ? { storeId: filter.storeId } : {}),
        ...(filter.search ? { search: filter.search } : {}),
      },
      items,
      total: items.length,
      summaries,
      currency: ctx.baseCode,
    };
  }

  // -------------------------------------------------------------------
  // helpers
  // -------------------------------------------------------------------

  /** Compute closing = opening + income − outcome for both qty (Decimal) and sum (BigInt). */
  private computeClosing(m: Partial<RawMeasures>): {
    openingQty: Prisma.Decimal;
    incomeQty: Prisma.Decimal;
    outcomeQty: Prisma.Decimal;
    closingQty: Prisma.Decimal;
    openingSum: bigint;
    incomeSum: bigint;
    outcomeSum: bigint;
    closingSum: bigint;
  } {
    const openingQty = new Prisma.Decimal(m.opening_qty ?? 0);
    const incomeQty = new Prisma.Decimal(m.in_qty ?? 0);
    const outcomeQty = new Prisma.Decimal(m.out_qty ?? 0);
    const openingSum = m.opening_sum ?? 0n;
    const incomeSum = m.in_sum ?? 0n;
    const outcomeSum = m.out_sum ?? 0n;
    return {
      openingQty,
      incomeQty,
      outcomeQty,
      closingQty: openingQty.plus(incomeQty).minus(outcomeQty),
      openingSum,
      incomeSum,
      outcomeSum,
      closingSum: openingSum + incomeSum - outcomeSum,
    };
  }

  private toSummary(m: RawMeasures | undefined): TurnoverSummary {
    const c = this.computeClosing(m ?? {});
    return {
      openingQty: c.openingQty.toString(),
      openingSumMinor: c.openingSum.toString(),
      incomeQty: c.incomeQty.toString(),
      incomeSumMinor: c.incomeSum.toString(),
      outcomeQty: c.outcomeQty.toString(),
      outcomeSumMinor: c.outcomeSum.toString(),
      closingQty: c.closingQty.toString(),
      closingSumMinor: c.closingSum.toString(),
    };
  }

  private async resolveRows(accountId: string, rawRows: RawRow[]): Promise<TurnoverRow[]> {
    const productIds = rawRows
      .filter((r) => r.assortmentKind === 'product')
      .map((r) => r.assortmentId);
    const products = await this.prisma.client.product.findMany({
      where: { id: { in: productIds }, accountId },
      select: { id: true, name: true, code: true, article: true, uom: true },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    return rawRows.map((r) => {
      const product = productMap.get(r.assortmentId);
      const c = this.computeClosing(r);
      return {
        assortmentKind: r.assortmentKind,
        assortmentId: r.assortmentId,
        productName: product?.name ?? '—',
        productCode: product?.code ?? null,
        productArticle: product?.article ?? null,
        productUom: product?.uom ?? null,
        openingQty: c.openingQty.toString(),
        openingSumMinor: c.openingSum.toString(),
        incomeQty: c.incomeQty.toString(),
        incomeSumMinor: c.incomeSum.toString(),
        outcomeQty: c.outcomeQty.toString(),
        outcomeSumMinor: c.outcomeSum.toString(),
        closingQty: c.closingQty.toString(),
        closingSumMinor: c.closingSum.toString(),
      };
    });
  }

  private emptyReport(
    from: Date,
    to: Date,
    filter: TurnoverFilterInput,
    baseCode: string,
  ): TurnoverReport {
    const zero = DECIMAL_ZERO.toString();
    return {
      filter: {
        dateFrom: from.toISOString().slice(0, 10),
        dateTo: to.toISOString().slice(0, 10),
        ...(filter.storeId ? { storeId: filter.storeId } : {}),
        ...(filter.search ? { search: filter.search } : {}),
      },
      items: [],
      total: 0,
      summaries: {
        openingQty: zero,
        openingSumMinor: '0',
        incomeQty: zero,
        incomeSumMinor: '0',
        outcomeQty: zero,
        outcomeSumMinor: '0',
        closingQty: zero,
        closingSumMinor: '0',
      },
      currency: baseCode,
    };
  }

  private parseFilter(raw: unknown): TurnoverFilterInput {
    const r = TurnoverFilterSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }
}
