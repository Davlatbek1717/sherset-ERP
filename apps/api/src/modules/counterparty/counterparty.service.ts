import { Prisma } from '@moysklad/db';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { allocateDocumentNumber } from '../../prisma/document-number.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { tashkentRangeBounds } from '../report/report-date-bounds.util.js';
import { type BulkResult, runBulk } from '../shared/bulk.js';
import { resolveCreatorGroupId } from '../shared/group-stamp.js';
import { mapVersionedUpdateError } from '../shared/optimistic-lock.js';
import {
  type BulkCreateTasksInput,
  BulkUpdateCounterpartySchema,
  CounterpartyFilterSchema,
  type CreateCounterpartyAccountInput,
  CreateCounterpartyAccountSchema,
  type CreateCounterpartyInput,
  CreateCounterpartySchema,
  type UpdateCounterpartyAccountInput,
  UpdateCounterpartyAccountSchema,
  type UpdateCounterpartyInput,
  UpdateCounterpartySchema,
} from './counterparty.schema.js';

// Account base currency. The whole counterparty list renders money as UZS
// (salesAmount, Баланс, Средний чек), so the list-level money aggregates are
// scoped to this currency for coherence. Multi-currency FX normalisation is a
// Phase-2 concern; centralised here so a future base-currency lookup is one edit.
const BASE_CURRENCY = 'UZS';

// moysklad custom-attribute («Доп. поле») types that reference another entity. Their
// stored value is a denormalized `{ id, name }` (e.g. «Усто» → a counterparty), so the
// list filters them on the `.id` path and renders the `.name`. Scalar types (string/
// text/long/…) store the raw value. Mirrors moysklad's attributemetadata `type`.
const REFERENCE_ATTR_TYPES = [
  // Native type (admin UI): type='reference' + referenceEntity names the target.
  'reference',
  // moysklad's API names the type by the target entity directly (e.g. «Усто»).
  'counterparty',
  'product',
  'employee',
  'project',
  'contract',
  'store',
  'organization',
  'customentity',
];

@Injectable()
export class CounterpartyService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string, rawFilter: unknown) {
    const filter = CounterpartyFilterSchema.parse(rawFilter);
    // «Создан» / «Когда изменен» — half-open day ranges (the To bound is widened
    // to 23:59:59.999 of that day so an inclusive end-date works). Same shape as
    // the products/cash-in updatedAt range; UTC day-boundary skew is the app-wide
    // convention (deferred, not a per-page bug).
    const createdAtRange =
      filter.createdFrom || filter.createdTo
        ? {
            createdAt: tashkentRangeBounds(filter.createdFrom, filter.createdTo),
          }
        : {};
    const updatedAtRange =
      filter.updatedFrom || filter.updatedTo
        ? {
            updatedAt: tashkentRangeBounds(filter.updatedFrom, filter.updatedTo),
          }
        : {};
    // AND-clause list — for filters that need their own nested OR (so they don't
    // collide with the top-level search OR key). Holds custom-attribute and
    // balance-range predicates.
    const andClauses: Prisma.CounterpartyWhereInput[] = [];

    // Dynamic custom «Дополнительные поля» filters (attr_<code>=<value>) →
    // AND-narrow on the attributes JSON path (e.g. the account's «Усто»/«tgid»).
    const attrKeys =
      rawFilter && typeof rawFilter === 'object'
        ? Object.keys(rawFilter as Record<string, unknown>).filter((k) => k.startsWith('attr_'))
        : [];
    if (attrKeys.length) {
      // Reference-type attrs store { id, name } → filter on the `.id` path; scalar
      // attrs filter on the value directly. One metadata lookup tells which codes
      // are references (only when an attr filter is actually present).
      const refCodes = new Set(
        (
          await this.prisma.client.attributeMetadata.findMany({
            where: { accountId, entity: 'Counterparty', type: { in: REFERENCE_ATTR_TYPES } },
            select: { code: true },
          })
        ).map((a) => a.code),
      );
      for (const k of attrKeys) {
        const v = (rawFilter as Record<string, unknown>)[k];
        if (typeof v === 'string' && v.trim()) {
          const code = k.slice(5);
          const path = refCodes.has(code) ? [code, 'id'] : [code];
          andClauses.push({ attributes: { path, string_contains: v.trim() } });
        }
      }
    }

    // «Баланс» от/до — base-currency (UZS) CounterpartyBalance range. A
    // counterparty whose UZS balance is 0 has NO balance row, so when the range
    // spans 0 we also match counterparties with no UZS row (else 0-balance rows
    // silently drop out — the «dead 0» class).
    if (filter.balanceFrom !== undefined || filter.balanceTo !== undefined) {
      const range: Prisma.BigIntFilter = {};
      if (filter.balanceFrom !== undefined)
        range.gte = BigInt(Math.round(filter.balanceFrom * 100));
      if (filter.balanceTo !== undefined) range.lte = BigInt(Math.round(filter.balanceTo * 100));
      const spansZero =
        (filter.balanceFrom === undefined || filter.balanceFrom <= 0) &&
        (filter.balanceTo === undefined || filter.balanceTo >= 0);
      const inRange: Prisma.CounterpartyWhereInput = {
        balances: { some: { currency: BASE_CURRENCY, balanceMinor: range } },
      };
      andClauses.push(
        spansZero
          ? { OR: [inRange, { balances: { none: { currency: BASE_CURRENCY } } }] }
          : inRange,
      );
    }

    // «Дата события» / «Текст события» — match counterparties with a Call in the
    // date range and/or whose summary contains the text (combined into one `some`).
    const callSome: Prisma.CallWhereInput = {};
    if (filter.eventFrom || filter.eventTo) {
      callSome.startedAt = tashkentRangeBounds(filter.eventFrom, filter.eventTo);
    }
    if (filter.eventText) {
      callSome.summary = { contains: filter.eventText, mode: 'insensitive' };
    }

    const where: Prisma.CounterpartyWhereInput = {
      accountId,
      // archived is undefined for the «Все» (all) tri-state → Prisma omits it.
      archived: filter.archived,
      ...(Object.keys(callSome).length ? { calls: { some: callSome } } : {}),
      ...(filter.companyType ? { companyType: filter.companyType } : {}),
      ...(filter.ownerId ? { ownerId: filter.ownerId } : {}),
      ...(filter.groupId ? { groupId: filter.groupId } : {}),
      // m2m counterparty-group membership (manual groups).
      ...(filter.cpGroupId ? { groups: { some: { id: filter.cpGroupId } } } : {}),
      // «Группы» multi-select (2026-07-21) — tanlangan guruhlarning birortасидаgi
      // kontragentlar (OR). cpGroupId'dan KEYIN — bir vaqtда ikkovi bo'lsa multi ustun.
      ...(filter.cpGroupIds?.length ? { groups: { some: { id: { in: filter.cpGroupIds } } } } : {}),
      // Auto-detected role tabs — customer = sold to (retailSale/demand),
      // supplier = bought from (supply). EXISTS subqueries, no manual tagging.
      ...(filter.role === 'customer'
        ? { OR: [{ retailSales: { some: {} } }, { demands: { some: {} } }] }
        : {}),
      ...(filter.role === 'supplier' ? { supplies: { some: {} } } : {}),
      ...(filter.stateId ? { stateId: filter.stateId } : {}),
      ...(filter.priceTypeId ? { priceTypeId: filter.priceTypeId } : {}),
      ...(filter.tags ? { tags: { has: filter.tags } } : {}),
      ...(andClauses.length ? { AND: andClauses } : {}),
      // moysklad-parity discrete Фильтр fields (see CounterpartyFilterSchema).
      ...(filter.name ? { name: { contains: filter.name, mode: 'insensitive' } } : {}),
      ...(filter.phone ? { phone: { contains: filter.phone, mode: 'insensitive' } } : {}),
      ...(filter.address
        ? { actualAddress: { contains: filter.address, mode: 'insensitive' } }
        : {}),
      ...(filter.code ? { code: { contains: filter.code, mode: 'insensitive' } } : {}),
      // ИНН lives in the uzRequisites JSON blob ({ inn: "STIR" }); query the
      // JSON path. string_contains is case-sensitive but INN is digits, so the
      // substring match is exact-enough; rows with null uzRequisites are excluded.
      ...(filter.inn ? { uzRequisites: { path: ['inn'], string_contains: filter.inn } } : {}),
      ...(filter.discountCard
        ? { discountCardNumber: { contains: filter.discountCard, mode: 'insensitive' } }
        : {}),
      ...(filter.shared !== undefined ? { shared: filter.shared } : {}),
      ...createdAtRange,
      ...updatedAtRange,
      ...(filter.search
        ? {
            OR: [
              { name: { contains: filter.search, mode: 'insensitive' } },
              { legalTitle: { contains: filter.search, mode: 'insensitive' } },
              { email: { contains: filter.search, mode: 'insensitive' } },
              { phone: { contains: filter.search, mode: 'insensitive' } },
              { externalCode: { contains: filter.search, mode: 'insensitive' } },
              // «коммент» — moysklad's counterparty search box covers the comment too.
              { description: { contains: filter.search, mode: 'insensitive' } },
              // «кс» (код) — the counterparty code.
              { code: { contains: filter.search, mode: 'insensitive' } },
              // «событ» — the latest call/event summary (moysklad searches events too).
              { calls: { some: { summary: { contains: filter.search, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };

    // 0-based offset of the requested page (offset mode); undefined → cursor mode.
    const offset = filter.page != null ? (filter.page - 1) * filter.limit : undefined;
    const rows = await this.prisma.client.counterparty.findMany({
      where,
      orderBy: { [filter.sortBy]: filter.sortDir },
      // Offset («page») paging when the list sends `page` (moysklad jump-to-any-
      // page); otherwise the legacy cursor look-ahead (other callers, unchanged).
      take: offset != null ? filter.limit : filter.limit + 1,
      ...(offset != null
        ? { skip: offset }
        : filter.cursor
          ? { cursor: { id: filter.cursor }, skip: 1 }
          : {}),
      include: {
        owner: { select: { id: true, name: true, email: true } },
        // «Кто изменил» — last employee to edit (stamped on update).
        modifiedBy: { select: { id: true, name: true } },
        group: { select: { id: true, name: true } },
        // «Группы» — moysklad's many-to-many counterparty grouping (the list column).
        // Distinct from `group`/«Отдел» (the access dept) above; flows out via ...rest.
        groups: { select: { id: true, name: true }, orderBy: { name: 'asc' } },
        state: { select: { id: true, name: true, color: true, stateType: true } },
        priceType: { select: { id: true, name: true, currency: true } },
        // «Банк» / «Расчетный счет» — the main bank account (moysklad shows the
        // primary one in the list). isMain first, else the earliest.
        bankAccounts: {
          orderBy: [{ isMain: 'desc' }, { createdAt: 'asc' }],
          take: 1,
          select: { bankName: true, accountNumber: true },
        },
        // «Баланс» — net counterparty balance (one row per currency, unique on
        // counterpartyId×currency). The list renders the base-currency (UZS)
        // figure; multi-currency conversion is a detail-card concern.
        balances: { select: { currency: true, balanceMinor: true } },
      },
    });
    const total = await this.prisma.client.counterparty.count({ where });
    // «Итого Баланс» — ALL-pages grand total (not just the page's 100/50): the sum of
    // the base-currency (UZS) net balance over EVERY counterparty matching the filter.
    // One aggregate over the same `where` (reused as a relation filter on the balance).
    const balanceAgg = await this.prisma.client.counterpartyBalance.aggregate({
      where: { currency: BASE_CURRENCY, counterparty: where },
      _sum: { balanceMinor: true },
    });
    const balanceTotalMinor = (balanceAgg._sum.balanceMinor ?? 0n).toString();
    // Offset mode: the rows ARE the page (skip/take applied); hasNext derives from
    // total. Cursor mode keeps the take=limit+1 look-ahead → hasMore + nextCursor.
    const usePage = offset != null;
    const hasMore = offset != null ? offset + filter.limit < total : rows.length > filter.limit;
    const items = usePage || !hasMore ? rows : rows.slice(0, filter.limit);
    const nextCursor = usePage ? undefined : hasMore ? items[items.length - 1]?.id : undefined;

    // moysklad CRM list columns «Последняя продажа» / «Количество продаж» /
    // «Средний чек» — derived from the counterparty's posted отгрузки (Demands),
    // moysklad's definition of a "sale". One groupBy over the page's ids keeps
    // this O(1) queries (no N+1).
    //   - state:'posted'  → drafts/cancelled are not sales.
    //   - deletedAt:null  → soft-deleted demands don't inflate the counts
    //                       (app-wide Demand-reader convention).
    //   - currency: BASE  → Demand.sumMinor is in the document's OWN currency, so
    //                       summing across currencies would be apples+oranges and
    //                       render a meaningless «Средний чек». We scope the money
    //                       aggregates to the base currency (UZS). Multi-currency
    //                       FX-normalised sales are a Phase-2 concern (no rate math
    //                       here) — non-base sales are intentionally excluded.
    const ids = items.map((r) => r.id);
    const saleAgg = ids.length
      ? await this.prisma.client.demand.groupBy({
          by: ['agentId'],
          where: {
            accountId,
            agentId: { in: ids },
            state: 'posted',
            deletedAt: null,
            currency: BASE_CURRENCY,
          },
          _count: { _all: true },
          // sumMinor → «Средний чек»/«Сумма продаж»; costSumMinor → «Прибыль»
          // (revenue − FIFO self-cost, both base-currency, posted demands only).
          _sum: { sumMinor: true, costSumMinor: true },
          _max: { moment: true },
          // «Первая продажа» — earliest posted-demand moment (free on this groupBy).
          _min: { moment: true },
        })
      : [];
    const saleByAgent = new Map(saleAgg.map((s) => [s.agentId, s]));

    // «Количество возвратов» / «Сумма возвратов» — posted sales returns (отгрузки
    // back), base-currency, soft-deletes excluded. One groupBy, mirrors the sales one.
    const returnAgg = ids.length
      ? await this.prisma.client.salesReturn.groupBy({
          by: ['agentId'],
          where: {
            accountId,
            agentId: { in: ids },
            state: 'posted',
            deletedAt: null,
            currency: BASE_CURRENCY,
          },
          _count: { _all: true },
          _sum: { sumMinor: true },
        })
      : [];
    const returnByAgent = new Map(returnAgg.map((r) => [r.agentId, r]));

    // «Дата события» / «Текст события» — last CRM event per counterparty. Our app's
    // only event-like model is Call, so the latest Call (startedAt desc) is the
    // event; its summary is the text. Fetch ordered, keep the first per agent.
    // One row per counterparty via Postgres DISTINCT ON — the DB returns only the
    // latest call each (≤ ids.length rows) instead of pulling the whole call
    // history into the API process to pick the newest in JS (the prior unbounded
    // findMany grew with every logged call). `DISTINCT ON (counterparty_id) … ORDER
    // BY counterparty_id, started_at DESC` is the canonical "latest row per group".
    const callRows = ids.length
      ? await this.prisma.client.$queryRaw<
          { counterpartyId: string; startedAt: Date; summary: string | null }[]
        >(Prisma.sql`
          SELECT DISTINCT ON (counterparty_id)
                 counterparty_id AS "counterpartyId",
                 started_at      AS "startedAt",
                 summary
          FROM calls
          WHERE account_id = ${accountId}::uuid
            AND counterparty_id IN (${Prisma.join(ids.map((i) => Prisma.sql`${i}::uuid`))})
          ORDER BY counterparty_id, started_at DESC
        `)
      : [];
    const lastCallByAgent = new Map<string, { startedAt: Date; summary: string | null }>();
    for (const c of callRows) {
      lastCallByAgent.set(c.counterpartyId, { startedAt: c.startedAt, summary: c.summary });
    }

    // «Сумма скидок» — total line discount (tiyin) over the posted demands'
    // positions: Σ(priceMinor × quantity × discount% / 100). The discount is
    // stored as a PERCENT, so the money sum must be computed per position. Done
    // in EXACT Decimal arithmetic (NOT float — money never touches Number) and
    // summed per agent; rounded to whole tiyin at the end.
    // Pushed into the DB as an exact-NUMERIC aggregate: Σ(price_minor × quantity ×
    // discount) / 100 per agent, ROUNDed to whole tiyin once at the end. Postgres
    // numeric is arbitrary-precision (no float drift — bigint × numeric stays
    // exact), and SUM-then-ROUND-half-away-from-zero matches the prior per-position
    // Decimal sum + .toFixed(0) to the tiyin. This replaces pulling EVERY
    // posted-demand position into the API process (the findMany was unbounded in
    // position history). Currency-agnostic, exactly as before (no currency filter).
    const discountRows = ids.length
      ? await this.prisma.client.$queryRaw<{ agentId: string; discount: string }[]>(Prisma.sql`
          SELECT d.agent_id AS "agentId",
                 ROUND(SUM(p.price_minor::numeric * p.quantity * p.discount) / 100, 0)::text AS discount
          FROM demand_positions p
          JOIN demands d ON d.id = p.demand_id
          WHERE p.account_id = ${accountId}::uuid
            AND d.agent_id IN (${Prisma.join(ids.map((i) => Prisma.sql`${i}::uuid`))})
            AND d.state = 'posted'
            AND d.deleted_at IS NULL
          GROUP BY d.agent_id
        `)
      : [];
    const discountByAgent = new Map(discountRows.map((r) => [r.agentId, r.discount]));

    const enriched = items.map((cp) => {
      const { balances, bankAccounts, ...rest } = cp;
      const mainBank = bankAccounts[0];
      const sale = saleByAgent.get(cp.id);
      const salesCount = sale?._count._all ?? 0;
      const salesSumMinor = sale?._sum.sumMinor ?? 0n;
      // Integer-domain mean of tiyin; sub-tiyin remainder is dropped (display).
      const averageCheckMinor =
        salesCount > 0 ? (salesSumMinor / BigInt(salesCount)).toString() : '0';
      // «Баланс» — net debt in the account base currency (UZS). CounterpartyBalance
      // holds one row per currency; we show the base-currency row. A counterparty
      // whose balances are entirely non-base would read 0 here — an accepted
      // base-currency-display limitation (the detail card shows every currency);
      // FX-converted multi-currency totals are deferred to Phase-2.
      const balanceMinor = (
        balances.find((b) => b.currency === BASE_CURRENCY)?.balanceMinor ?? 0n
      ).toString();
      // «Прибыль» = Σ revenue − Σ self-cost (posted, base currency). Can be negative.
      const profitMinor = (salesSumMinor - (sale?._sum.costSumMinor ?? 0n)).toString();
      const ret = returnByAgent.get(cp.id);
      const lastCall = lastCallByAgent.get(cp.id);
      return {
        ...rest,
        balanceMinor,
        salesCount,
        // «Сумма продаж» — the LIVE posted-demand total (base currency, string like
        // the other money fields), replacing the denormalized Counterparty.salesAmount
        // column the running app never writes (always 0; only import/sync set it).
        salesAmount: salesSumMinor.toString(),
        firstSaleDate: sale?._min.moment ?? null,
        lastSaleDate: sale?._max.moment ?? null,
        averageCheckMinor,
        profitMinor,
        returnsCount: ret?._count._all ?? 0,
        returnsSumMinor: (ret?._sum.sumMinor ?? 0n).toString(),
        bankName: mainBank?.bankName ?? null,
        bankAccountNumber: mainBank?.accountNumber ?? null,
        // «Дата события» / «Текст события» — last Call (the app's CRM event).
        eventDate: lastCall?.startedAt ?? null,
        eventText: lastCall?.summary ?? null,
        // «Сумма скидок» — whole-tiyin total from the DB NUMERIC aggregate above.
        discountSumMinor: discountByAgent.get(cp.id) ?? '0',
      };
    });

    return { items: enriched, nextCursor, total, balanceTotalMinor };
  }

  async findById(accountId: string, id: string) {
    const cp = await this.prisma.client.counterparty.findFirst({
      where: { id, accountId },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        group: { select: { id: true, name: true } },
        groups: { select: { id: true, name: true }, orderBy: { name: 'asc' } },
        state: { select: { id: true, name: true, color: true, stateType: true } },
        priceType: { select: { id: true, name: true, currency: true } },
        bonusProgram: { select: { id: true, name: true, currency: true } },
        bankAccounts: {
          where: { archived: false },
          orderBy: [{ isMain: 'desc' }, { createdAt: 'asc' }],
        },
        balances: {
          orderBy: { currency: 'asc' },
          select: { currency: true, balanceMinor: true, updatedAt: true },
        },
      },
    });
    if (!cp) throw new NotFoundException(`Counterparty ${id} not found`);
    return {
      ...cp,
      balances: cp.balances.map((b) => ({
        currency: b.currency,
        balanceMinor: b.balanceMinor.toString(),
        updatedAt: b.updatedAt,
      })),
    };
  }

  /**
   * «Показатели» tab — moysklad's counterparty analytics panel. GROUND:
   * docs/audits/cp-metrics-tab-2026-06-26/ (live screenshot) + the moysklad REST
   * report/counterparty endpoint (02-report-counterparty.json) confirms every field
   * semantics 1:1. All money is base-currency (UZS) tiyin, serialized as a string.
   *
   *   sales   — posted отгрузки (Demand): total / count / avgCheck / discounts /
   *             first / last / profit. profit = Σ sumMinor − Σ costSumMinor (revenue −
   *             FIFO self-cost) — the SAME definition the CRM list already uses
   *             (list() above) and exactly moysklad report/counterparty `profit`.
   *   returns — posted Возвраты покупателей (SalesReturn): total + count.
   *   balance — net «Взаиморасчёты» split PER ORGANIZATION (moysklad groups the balance
   *             by наша организация; the breakdown sums to the bold total). We
   *             reconstruct it from the 9 money docs that feed
   *             CounterpartyBalance.applyDelta, using each doc's POSTED sign — the
   *             `applicable` flag is the source of truth (applicable=true ⟺ the delta
   *             is currently applied, set on post / cleared on unpost+cancel):
   *               +InvoiceOut −InvoiceIn  −PaymentIn +PaymentOut  −CashIn +CashOut
   *               −Prepayment +PrepaymentReturn  CounterpartyAdjustment ±(direction)
   *             So Σ(byOrg) === the materialized CounterpartyBalance(UZS) — both derive
   *             from the same applied deltas (the cert asserts this invariant). Only
   *             non-zero orgs are shown, sorted by organization name (moysklad order).
   */
  async metrics(accountId: string, id: string) {
    const cp = await this.prisma.client.counterparty.findFirst({
      where: { id, accountId },
      select: { id: true },
    });
    if (!cp) throw new NotFoundException(`Counterparty ${id} not found`);
    const BASE = BASE_CURRENCY;
    const agent = { accountId, agentId: id };

    // --- «Продажи» — posted demands (base currency), one aggregate. ---
    const saleAgg = await this.prisma.client.demand.aggregate({
      where: { ...agent, state: 'posted', deletedAt: null, currency: BASE },
      _count: { _all: true },
      _sum: { sumMinor: true, costSumMinor: true },
      _min: { moment: true },
      _max: { moment: true },
    });
    const salesCount = saleAgg._count._all;
    const salesTotal = saleAgg._sum.sumMinor ?? 0n;
    const salesCost = saleAgg._sum.costSumMinor ?? 0n;
    const avgCheck = salesCount > 0 ? salesTotal / BigInt(salesCount) : 0n;
    const profit = salesTotal - salesCost;

    // «Сумма скидок» — Σ(price × qty × discount%/100) over posted-demand positions, in
    // EXACT Postgres NUMERIC (money never touches float); same query the list() uses,
    // scoped to this one agent. COALESCE so an agent with no demands reads 0 (not null).
    const discRows = await this.prisma.client.$queryRaw<{ discount: string }[]>(Prisma.sql`
      SELECT COALESCE(ROUND(SUM(p.price_minor::numeric * p.quantity * p.discount) / 100, 0), 0)::text AS discount
      FROM demand_positions p
      JOIN demands d ON d.id = p.demand_id
      WHERE p.account_id = ${accountId}::uuid
        AND d.agent_id = ${id}::uuid
        AND d.state = 'posted'
        AND d.deleted_at IS NULL
    `);
    const discountSum = BigInt(discRows[0]?.discount ?? '0');

    // --- «Возвраты» — posted sales returns (base currency). ---
    const retAgg = await this.prisma.client.salesReturn.aggregate({
      where: { ...agent, state: 'posted', deletedAt: null, currency: BASE },
      _count: { _all: true },
      _sum: { sumMinor: true },
    });

    // --- «Баланс по организациям» — signed Σ per org over the 9 balance docs. ---
    // `applicable: true` is the exact predicate CounterpartyBalance.applyDelta gates on
    // (NOT deletedAt — cancel sets applicable=false, so this captures the live delta set).
    const where = { ...agent, applicable: true, currency: BASE } as const;
    const sum = { sumMinor: true } as const;
    const c = this.prisma.client;
    const [io, ii, pi, po, ci, co, pp, ppr, adj] = await Promise.all([
      c.invoiceOut.groupBy({ by: ['organizationId'], where, _sum: sum }),
      c.invoiceIn.groupBy({ by: ['organizationId'], where, _sum: sum }),
      c.paymentIn.groupBy({ by: ['organizationId'], where, _sum: sum }),
      c.paymentOut.groupBy({ by: ['organizationId'], where, _sum: sum }),
      c.cashIn.groupBy({ by: ['organizationId'], where, _sum: sum }),
      c.cashOut.groupBy({ by: ['organizationId'], where, _sum: sum }),
      c.prepayment.groupBy({ by: ['organizationId'], where, _sum: sum }),
      c.prepaymentReturn.groupBy({ by: ['organizationId'], where, _sum: sum }),
      // adjustments carry their own +/− via `direction` (INCREASE | DECREASE).
      c.counterpartyAdjustment.groupBy({
        by: ['organizationId', 'direction'],
        where,
        _sum: sum,
      }),
    ]);
    const byOrg = new Map<string, bigint>();
    const acc = (orgId: string, signed: bigint) =>
      byOrg.set(orgId, (byOrg.get(orgId) ?? 0n) + signed);
    const apply = (
      rows: { organizationId: string; _sum: { sumMinor: bigint | null } }[],
      s: bigint,
    ) => {
      for (const r of rows) acc(r.organizationId, s * (r._sum.sumMinor ?? 0n));
    };
    apply(io, 1n);
    apply(ii, -1n);
    apply(pi, -1n);
    apply(po, 1n);
    apply(ci, -1n);
    apply(co, 1n);
    apply(pp, -1n);
    apply(ppr, 1n);
    for (const r of adj) {
      acc(r.organizationId, (r.direction === 'INCREASE' ? 1n : -1n) * (r._sum.sumMinor ?? 0n));
    }

    // Resolve org names for the orgs that actually have a balance contribution.
    const orgIds = [...byOrg.keys()];
    const orgs = orgIds.length
      ? await this.prisma.client.organization.findMany({
          where: { accountId, id: { in: orgIds } },
          select: { id: true, name: true },
        })
      : [];
    const orgName = new Map(orgs.map((o) => [o.id, o.name]));
    let balanceTotal = 0n;
    const byOrgRows: { organizationId: string; organizationName: string; amountMinor: string }[] =
      [];
    for (const [orgId, amount] of byOrg) {
      balanceTotal += amount;
      // moysklad hides zero-balance organizations from the breakdown.
      if (amount !== 0n) {
        byOrgRows.push({
          organizationId: orgId,
          organizationName: orgName.get(orgId) ?? '—',
          amountMinor: amount.toString(),
        });
      }
    }
    // moysklad lists the breakdown alphabetically by organization name.
    byOrgRows.sort((a, b) => a.organizationName.localeCompare(b.organizationName, 'ru'));

    return {
      currency: BASE,
      sales: {
        totalMinor: salesTotal.toString(),
        count: salesCount,
        avgCheckMinor: avgCheck.toString(),
        discountMinor: discountSum.toString(),
        firstAt: saleAgg._min.moment,
        lastAt: saleAgg._max.moment,
        profitMinor: profit.toString(),
      },
      returns: {
        totalMinor: (retAgg._sum.sumMinor ?? 0n).toString(),
        count: retAgg._count._all,
      },
      balance: {
        totalMinor: balanceTotal.toString(),
        byOrg: byOrgRows,
      },
    };
  }

  async create(accountId: string, userId: string, raw: unknown) {
    const parsed = this.parseCreate(raw);
    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, userId);
    if (parsed.groupIds?.length) await this.assertGroupsInAccount(accountId, parsed.groupIds);
    // Tenant guards — an EXPLICIT «Доступ»/«Цены»/«Статус» reference must belong to this
    // account (mirrors update + bulkUpdate; closes the create-side cross-tenant FK gap the
    // re-audit flagged). The trusted creator defaults (ownerId=userId, groupId=creator's
    // department) are not user-supplied, so they're left unguarded.
    if (parsed.ownerId)
      await this.assertRefInAccount('employee', accountId, parsed.ownerId, 'Owner');
    if (parsed.groupId) await this.assertRefInAccount('group', accountId, parsed.groupId, 'Group');
    if (parsed.priceTypeId)
      await this.assertRefInAccount('priceType', accountId, parsed.priceTypeId, 'Price type');
    if (parsed.stateId) await this.assertCounterpartyState(accountId, parsed.stateId);
    // «Код» + «Внешний код» — moysklad auto-assigns both on create (a per-account sequence);
    // ours left them empty. Allocate race-safely (atomic counter) only when the form didn't
    // supply a value, so a manual code/externalCode still wins. Seeded from the account's
    // current counterparty count → the first auto value is count+1.
    let code = parsed.code;
    let externalCode = parsed.externalCode;
    if (!code || !externalCode) {
      const n = await allocateDocumentNumber(this.prisma.client, accountId, 'counterparty', () =>
        this.prisma.client.counterparty.count({ where: { accountId } }),
      );
      code = code || String(n);
      externalCode = externalCode || String(n);
    }
    try {
      const created = await this.prisma.client.counterparty.create({
        data: {
          accountId,
          // «Сотрудник» (owner). moysklad defaults a new counterparty's owner to
          // the creator; an explicit ownerId from the «Доступ» editor overrides it.
          ownerId: parsed.ownerId ?? userId,
          // «Отдел» (group). Defaults to the creator's department (OWN_GROUP
          // scope); an explicit groupId from the «Доступ» editor overrides it.
          groupId: parsed.groupId ?? creatorGroupId,
          priceTypeId: parsed.priceTypeId,
          stateId: parsed.stateId,
          bonusProgramId: parsed.bonusProgramId,
          name: parsed.name,
          legalTitle: parsed.legalTitle,
          legalAddress: parsed.legalAddress,
          legalAddressFull: parsed.legalAddressFull as Prisma.InputJsonValue | undefined,
          actualAddress: parsed.actualAddress,
          actualAddressFull: parsed.actualAddressFull as Prisma.InputJsonValue | undefined,
          companyType: parsed.companyType,
          email: parsed.email || null,
          phone: parsed.phone,
          fax: parsed.fax,
          tags: parsed.tags,
          attributes: (parsed.attributes ?? {}) as Prisma.InputJsonValue,
          uzRequisites: parsed.uzRequisites as Prisma.InputJsonValue | undefined,
          description: parsed.description,
          code,
          externalCode,
          syncId: parsed.syncId,
          discountCardNumber: parsed.discountCardNumber,
          discounts: parsed.discounts as Prisma.InputJsonValue | undefined,
          shared: parsed.shared,
          // «Группы» (m2m) memberships from the form's multi-select.
          ...(parsed.groupIds?.length
            ? { groups: { connect: parsed.groupIds.map((gid) => ({ id: gid })) } }
            : {}),
        },
      });
      await this.logAudit(accountId, userId, 'create', created.id, null);
      return created;
    } catch (e) {
      this.handlePrisma(e);
    }
  }

  /** «N из ВСЕГО ‹ ›» — position in the default «Только обычные» list (newest-first by
   *  createdAt, within the current row's archived bucket). Mirrors CustomerOrder.findPosition. */
  async findPosition(accountId: string, id: string) {
    const current = await this.prisma.client.counterparty.findFirst({
      where: { id, accountId },
      select: { id: true, createdAt: true, archived: true },
    });
    if (!current) throw new NotFoundException(`Counterparty ${id} not found`);
    const where: Prisma.CounterpartyWhereInput = {
      accountId,
      archived: current.archived,
    };
    // Tuple comparisons for the default (createdAt desc, id desc) order.
    const above: Prisma.CounterpartyWhereInput = {
      OR: [
        { createdAt: { gt: current.createdAt } },
        { createdAt: current.createdAt, id: { gt: current.id } },
      ],
    };
    const below: Prisma.CounterpartyWhereInput = {
      OR: [
        { createdAt: { lt: current.createdAt } },
        { createdAt: current.createdAt, id: { lt: current.id } },
      ],
    };
    const [total, aboveCount, prev, next] = await Promise.all([
      this.prisma.client.counterparty.count({ where }),
      this.prisma.client.counterparty.count({ where: { AND: [where, above] } }),
      this.prisma.client.counterparty.findFirst({
        where: { AND: [where, above] },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true },
      }),
      this.prisma.client.counterparty.findFirst({
        where: { AND: [where, below] },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { id: true },
      }),
    ]);
    return { current: aboveCount + 1, total, prevId: prev?.id ?? null, nextId: next?.id ?? null };
  }

  /** moysklad «...» → «Копировать» — duplicate the counterparty (fresh code/externalCode,
   *  creator becomes owner). syncId is NOT copied (external-sync unique). */
  async clone(accountId: string, userId: string, id: string) {
    const source = await this.prisma.client.counterparty.findFirst({
      where: { id, accountId },
      include: { groups: { select: { id: true } } },
    });
    if (!source) throw new NotFoundException(`Counterparty ${id} not found`);
    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, userId);
    const n = await allocateDocumentNumber(this.prisma.client, accountId, 'counterparty', () =>
      this.prisma.client.counterparty.count({ where: { accountId } }),
    );
    const created = await this.prisma.client.counterparty.create({
      data: {
        accountId,
        ownerId: userId,
        groupId: creatorGroupId,
        priceTypeId: source.priceTypeId,
        stateId: source.stateId,
        bonusProgramId: source.bonusProgramId,
        name: source.name,
        legalTitle: source.legalTitle,
        legalAddress: source.legalAddress,
        legalAddressFull: source.legalAddressFull as Prisma.InputJsonValue | undefined,
        actualAddress: source.actualAddress,
        actualAddressFull: source.actualAddressFull as Prisma.InputJsonValue | undefined,
        companyType: source.companyType,
        email: source.email,
        phone: source.phone,
        fax: source.fax,
        tags: source.tags,
        attributes: (source.attributes ?? {}) as Prisma.InputJsonValue,
        uzRequisites: source.uzRequisites as Prisma.InputJsonValue | undefined,
        description: source.description,
        code: String(n),
        externalCode: String(n),
        discountCardNumber: source.discountCardNumber,
        discounts: source.discounts as Prisma.InputJsonValue | undefined,
        shared: source.shared,
        ...(source.groups.length
          ? { groups: { connect: source.groups.map((g) => ({ id: g.id })) } }
          : {}),
      },
    });
    await this.logAudit(accountId, userId, 'create', created.id, null);
    return { id: created.id };
  }

  async update(accountId: string, userId: string, id: string, raw: unknown) {
    const parsed = this.parseUpdate(raw);
    const existing = await this.findById(accountId, id);
    // Tenant guards — an EXPLICIT owner/group/priceType/state reference must belong to this
    // account (mirror create() + bulkUpdate(); the connect:{id} below has no composite-account
    // FK, so without this a PATCH could stamp a foreign-account id). null = disconnect → no ref.
    if (parsed.ownerId)
      await this.assertRefInAccount('employee', accountId, parsed.ownerId, 'Owner');
    if (parsed.groupId) await this.assertRefInAccount('group', accountId, parsed.groupId, 'Group');
    if (parsed.priceTypeId)
      await this.assertRefInAccount('priceType', accountId, parsed.priceTypeId, 'Price type');
    if (parsed.stateId) await this.assertCounterpartyState(accountId, parsed.stateId);
    const data: Prisma.CounterpartyUpdateInput = {};
    if (parsed.name !== undefined) data.name = parsed.name;
    if (parsed.legalTitle !== undefined) data.legalTitle = parsed.legalTitle;
    if (parsed.legalAddress !== undefined) data.legalAddress = parsed.legalAddress;
    if (parsed.legalAddressFull !== undefined) {
      data.legalAddressFull = parsed.legalAddressFull as Prisma.InputJsonValue;
    }
    if (parsed.actualAddress !== undefined) data.actualAddress = parsed.actualAddress;
    if (parsed.actualAddressFull !== undefined) {
      data.actualAddressFull = parsed.actualAddressFull as Prisma.InputJsonValue;
    }
    if (parsed.companyType !== undefined) data.companyType = parsed.companyType;
    if (parsed.email !== undefined) data.email = parsed.email || null;
    if (parsed.phone !== undefined) data.phone = parsed.phone;
    if (parsed.fax !== undefined) data.fax = parsed.fax;
    if (parsed.tags !== undefined) data.tags = parsed.tags;
    if (parsed.attributes !== undefined) {
      data.attributes = parsed.attributes as Prisma.InputJsonValue;
    }
    if (parsed.uzRequisites !== undefined) {
      data.uzRequisites = parsed.uzRequisites as Prisma.InputJsonValue;
    }
    if (parsed.description !== undefined) data.description = parsed.description;
    if (parsed.code !== undefined) data.code = parsed.code;
    if (parsed.externalCode !== undefined) data.externalCode = parsed.externalCode;
    if (parsed.syncId !== undefined) data.syncId = parsed.syncId;
    if (parsed.discountCardNumber !== undefined)
      data.discountCardNumber = parsed.discountCardNumber;
    if (parsed.discounts !== undefined) {
      data.discounts = parsed.discounts as Prisma.InputJsonValue;
    }
    if (parsed.ownerId !== undefined) {
      // «Сотрудник» — Counterparty.owner (named relation "CounterpartyOwner",
      // onDelete SetNull). Editor clear → null → disconnect (column is nullable).
      data.owner = parsed.ownerId ? { connect: { id: parsed.ownerId } } : { disconnect: true };
    }
    if (parsed.groupId !== undefined) {
      data.group = parsed.groupId ? { connect: { id: parsed.groupId } } : { disconnect: true };
    }
    if (parsed.priceTypeId !== undefined) {
      data.priceType = parsed.priceTypeId
        ? { connect: { id: parsed.priceTypeId } }
        : { disconnect: true };
    }
    if (parsed.stateId !== undefined) {
      data.state = parsed.stateId ? { connect: { id: parsed.stateId } } : { disconnect: true };
    }
    if (parsed.bonusProgramId !== undefined) {
      data.bonusProgram = parsed.bonusProgramId
        ? { connect: { id: parsed.bonusProgramId } }
        : { disconnect: true };
    }
    if (parsed.shared !== undefined) data.shared = parsed.shared;
    // «Группы» (m2m) — the form sends the FULL membership list, so `set` replaces it
    // (absent = leave unchanged; [] = clear all). Tenant-guarded like create.
    if (parsed.groupIds !== undefined) {
      await this.assertGroupsInAccount(accountId, parsed.groupIds);
      data.groups = { set: parsed.groupIds.map((gid) => ({ id: gid })) };
    }
    // «Кто изменил» — stamp the editing employee on every update.
    data.modifiedBy = { connect: { id: userId } };

    try {
      const updated = await this.prisma.client.counterparty.update({
        where: { id, accountId, version: parsed.version },
        data: { ...data, version: { increment: 1 } },
      });
      const diff = this.diff(existing, updated);
      if (Object.keys(diff).length) {
        await this.logAudit(accountId, userId, 'update', id, diff);
      }
      return updated;
    } catch (e) {
      mapVersionedUpdateError(e, 'Counterparty');
      this.handlePrisma(e);
    }
  }

  async archive(accountId: string, userId: string, id: string, archived: boolean) {
    await this.findById(accountId, id);
    const updated = await this.prisma.client.counterparty.update({
      where: { id, accountId },
      data: { archived },
    });
    await this.logAudit(accountId, userId, archived ? 'archived' : 'restored', id, null);
    return updated;
  }

  async delete(accountId: string, userId: string, id: string) {
    await this.findById(accountId, id);
    await this.prisma.client.counterparty.delete({ where: { id, accountId } });
    await this.logAudit(accountId, userId, 'delete', id, null);
    return { ok: true };
  }

  /**
   * Validate that a stateId is a counterparty-scoped CRM State of this account.
   * Called ONCE before a bulk set-state loop (not per row) to avoid N queries.
   */
  async assertCounterpartyState(accountId: string, stateId: string) {
    const state = await this.prisma.client.state.findFirst({
      where: { id: stateId, accountId, entityType: 'counterparty' },
      select: { id: true },
    });
    if (!state) {
      throw new BadRequestException(`State ${stateId} is not a counterparty status`);
    }
  }

  /**
   * «Статус ▾» bulk-set — set or clear (stateId=null) a counterparty's CRM State.
   * The state is validated once by the caller (assertCounterpartyState); this
   * just applies it per id under the account guard.
   */
  async setState(accountId: string, userId: string, id: string, stateId: string | null) {
    await this.findById(accountId, id);
    const updated = await this.prisma.client.counterparty.update({
      where: { id, accountId },
      data: { stateId },
    });
    await this.logAudit(accountId, userId, 'status_changed', id, null);
    return updated;
  }

  /**
   * «Массовое редактирование» — bulk-edit the selected counterparties. Only the
   * fields PRESENT in `patch` are applied (moysklad's per-field opt-in); a `null`
   * value clears that field. The cross-account FK refs (state/owner/group/price-
   * type) are validated ONCE against this account BEFORE the loop — a bulk op must
   * never stamp a foreign-account reference (the products bulk-update cross-tenant
   * FK class, session 18d). gender/birthDate (uzRequisites) and custom «Дополнительные
   * поля» (attributes) are MERGED into each row's existing JSON so the other keys
   * survive. The many-group «Добавить/Убрать группы» modes are NOT handled here —
   * they need a counterparty↔group many-to-many model (see the live spec).
   */
  async bulkUpdate(accountId: string, userId: string, raw: unknown): Promise<BulkResult> {
    const { ids, patch } = BulkUpdateCounterpartySchema.parse(raw);

    // Tenant guards — once each, not per row (mirrors bulk-set-state's single check).
    if (patch.stateId) await this.assertCounterpartyState(accountId, patch.stateId);
    if (patch.ownerId) await this.assertRefInAccount('employee', accountId, patch.ownerId, 'Owner');
    if (patch.groupId) await this.assertRefInAccount('group', accountId, patch.groupId, 'Group');
    if (patch.priceTypeId)
      await this.assertRefInAccount('priceType', accountId, patch.priceTypeId, 'Price type');
    // «Группы» (m2m) — every referenced group id (set/add/remove) must belong to this
    // account. One batch count instead of N per-id queries (tenant guard).
    const groupIds = [
      ...new Set([
        ...(patch.setGroupIds ?? []),
        ...(patch.addGroupIds ?? []),
        ...(patch.removeGroupIds ?? []),
      ]),
    ];
    if (groupIds.length) {
      const found = await this.prisma.client.counterpartyGroup.count({
        where: { accountId, id: { in: groupIds } },
      });
      if (found !== groupIds.length) {
        throw new BadRequestException('One or more groups do not belong to this account');
      }
    }

    // Shared top-level update data — identical connect/disconnect for every row.
    const baseData: Prisma.CounterpartyUpdateInput = { modifiedBy: { connect: { id: userId } } };
    // «Группы» m2m write — set (replace) / connect (add) / disconnect (remove). Prisma
    // applies set first, then connect/disconnect. Each mode is independently opt-in.
    const groupsWrite: Prisma.CounterpartyGroupUpdateManyWithoutCounterpartiesNestedInput = {};
    if (patch.setGroupIds !== undefined) groupsWrite.set = patch.setGroupIds.map((id) => ({ id }));
    if (patch.addGroupIds !== undefined)
      groupsWrite.connect = patch.addGroupIds.map((id) => ({ id }));
    if (patch.removeGroupIds !== undefined)
      groupsWrite.disconnect = patch.removeGroupIds.map((id) => ({ id }));
    if (Object.keys(groupsWrite).length) baseData.groups = groupsWrite;
    if (patch.archived !== undefined) baseData.archived = patch.archived;
    if (patch.companyType !== undefined) baseData.companyType = patch.companyType;
    if (patch.shared !== undefined) baseData.shared = patch.shared;
    if (patch.stateId !== undefined)
      baseData.state = patch.stateId ? { connect: { id: patch.stateId } } : { disconnect: true };
    if (patch.priceTypeId !== undefined)
      baseData.priceType = patch.priceTypeId
        ? { connect: { id: patch.priceTypeId } }
        : { disconnect: true };
    if (patch.ownerId !== undefined)
      baseData.owner = patch.ownerId ? { connect: { id: patch.ownerId } } : { disconnect: true };
    if (patch.groupId !== undefined)
      baseData.group = patch.groupId ? { connect: { id: patch.groupId } } : { disconnect: true };

    // Pre-fetch current JSON ONCE for the merge fields (so the per-row merge keeps
    // the other keys — a «set Усто» must not wipe a counterparty's other attrs).
    const mergesUz = patch.gender !== undefined || patch.birthDate !== undefined;
    const mergesAttrs = patch.attributes !== undefined;
    const current =
      mergesUz || mergesAttrs
        ? new Map(
            (
              await this.prisma.client.counterparty.findMany({
                where: { accountId, id: { in: ids } },
                select: { id: true, uzRequisites: true, attributes: true },
              })
            ).map((r) => [r.id, r]),
          )
        : new Map<string, { uzRequisites: Prisma.JsonValue; attributes: Prisma.JsonValue }>();

    return runBulk(ids, async (id) => {
      const data: Prisma.CounterpartyUpdateInput = { ...baseData };
      if (mergesUz) {
        const uz = { ...((current.get(id)?.uzRequisites as Record<string, unknown> | null) ?? {}) };
        if (patch.gender !== undefined) uz.gender = patch.gender;
        if (patch.birthDate !== undefined) uz.birthDate = patch.birthDate;
        data.uzRequisites = uz as Prisma.InputJsonValue;
      }
      if (mergesAttrs) {
        data.attributes = {
          ...((current.get(id)?.attributes as Record<string, unknown> | null) ?? {}),
          ...patch.attributes,
        } as Prisma.InputJsonValue;
      }
      // Account-scoped update — `where` tenant-guards; a non-existent id in this
      // account throws P2025 → counted as a per-row failure by runBulk.
      await this.prisma.client.counterparty.update({ where: { id, accountId }, data });
      return id;
    });
  }

  /** Account-scoped existence check for a bulk FK patch (tenant guard). */
  private async assertRefInAccount(
    model: 'employee' | 'group' | 'priceType',
    accountId: string,
    id: string,
    label: string,
  ): Promise<void> {
    const where = { id, accountId };
    const found =
      model === 'employee'
        ? await this.prisma.client.employee.findFirst({ where, select: { id: true } })
        : model === 'group'
          ? await this.prisma.client.group.findFirst({ where, select: { id: true } })
          : await this.prisma.client.priceType.findFirst({ where, select: { id: true } });
    if (!found) throw new BadRequestException(`${label} ${id} not found in this account`);
  }

  /** Tenant guard for a «Группы» membership list — every id must be in this account. */
  private async assertGroupsInAccount(accountId: string, ids: string[]) {
    const distinct = [...new Set(ids)];
    if (!distinct.length) return;
    const found = await this.prisma.client.counterpartyGroup.count({
      where: { accountId, id: { in: distinct } },
    });
    if (found !== distinct.length) {
      throw new BadRequestException('One or more groups do not belong to this account');
    }
  }

  /**
   * «Создать задачи» bulk drawer — create ONE task per selected counterparty,
   * each linked via Task.agentId and assigned to that counterparty's owner
   * («Владелец-сотрудник»). The shared description/dueAt/typeId apply to all.
   * Returns the number of tasks created (counterparties not in this account are
   * silently skipped — the account guard on findMany filters them out).
   */
  async bulkCreateTasks(accountId: string, authorId: string, input: BulkCreateTasksInput) {
    const { ids, description, dueAt, typeId, stateId } = input;
    if (typeId) {
      const tt = await this.prisma.client.taskType.findFirst({
        where: { id: typeId, accountId },
        select: { id: true },
      });
      if (!tt) throw new BadRequestException(`Task type ${typeId} not found`);
    }
    // moysklad «Тип задач» — the task `state` (State, entityType="task").
    if (stateId) {
      const st = await this.prisma.client.state.findFirst({
        where: { id: stateId, accountId, entityType: 'task' },
        select: { id: true },
      });
      if (!st) throw new BadRequestException(`Task state ${stateId} not found`);
    }
    const cps = await this.prisma.client.counterparty.findMany({
      where: { accountId, id: { in: ids } },
      select: { id: true, ownerId: true },
    });
    if (cps.length === 0) return { created: 0 };
    // Task.title is required; moysklad's drawer only collects «Описание задач»,
    // so derive the title from the description's first line (model max 255).
    const title = (description.split('\n')[0]?.trim() || description).slice(0, 255);
    await this.prisma.client.task.createMany({
      data: cps.map((cp) => ({
        accountId,
        authorId,
        agentId: cp.id,
        assigneeId: cp.ownerId,
        title,
        description,
        typeId: typeId ?? null,
        stateId: stateId ?? null,
        dueAt: dueAt ?? null,
        status: 'open',
        priority: 'normal',
      })),
    });
    return { created: cps.length };
  }

  // === Bank accounts (counterparty_accounts) ===

  async listBankAccounts(accountId: string, counterpartyId: string) {
    await this.findById(accountId, counterpartyId);
    return this.prisma.client.counterpartyAccount.findMany({
      where: { accountId, counterpartyId },
      orderBy: [{ isMain: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async createBankAccount(accountId: string, userId: string, counterpartyId: string, raw: unknown) {
    await this.findById(accountId, counterpartyId);
    const parsed = this.parseAccountCreate(raw);
    return this.prisma.client.$transaction(async (tx) => {
      // If marked main, demote previous main account.
      if (parsed.isMain) {
        await tx.counterpartyAccount.updateMany({
          where: { accountId, counterpartyId, isMain: true },
          data: { isMain: false },
        });
      }
      const created = await tx.counterpartyAccount.create({
        data: {
          accountId,
          counterpartyId,
          accountNumber: parsed.accountNumber,
          bankName: parsed.bankName,
          bankLocation: parsed.bankLocation,
          correspondentAccount: parsed.correspondentAccount,
          mfo: parsed.mfo,
          bankInn: parsed.bankInn,
          swift: parsed.swift,
          currency: parsed.currency,
          isMain: parsed.isMain,
        },
      });
      await tx.auditLog.create({
        data: {
          accountId,
          userId,
          // Logged under the PARENT counterparty's feed so it surfaces on the
          // counterparty detail page's History tab (entity='Counterparty',
          // entityId=<counterpartyId>). See bankAccountSummary() for the why.
          entity: 'Counterparty',
          entityId: counterpartyId,
          action: 'create-bank-account',
          fieldChanges: {
            bankAccount: { before: null, after: this.bankAccountSummary(created) },
          } as Prisma.InputJsonValue,
        },
      });
      return created;
    });
  }

  async updateBankAccount(
    accountId: string,
    userId: string,
    counterpartyId: string,
    bankAccountId: string,
    raw: unknown,
  ) {
    const parsed = this.parseAccountUpdate(raw);
    const existing = await this.prisma.client.counterpartyAccount.findFirst({
      where: { id: bankAccountId, accountId, counterpartyId },
    });
    if (!existing) throw new NotFoundException(`Bank account ${bankAccountId} not found`);

    return this.prisma.client.$transaction(async (tx) => {
      if (parsed.isMain === true && !existing.isMain) {
        await tx.counterpartyAccount.updateMany({
          where: { accountId, counterpartyId, isMain: true, id: { not: bankAccountId } },
          data: { isMain: false },
        });
      }
      const data: Prisma.CounterpartyAccountUpdateInput = {};
      if (parsed.accountNumber !== undefined) data.accountNumber = parsed.accountNumber;
      if (parsed.bankName !== undefined) data.bankName = parsed.bankName;
      if (parsed.bankLocation !== undefined) data.bankLocation = parsed.bankLocation;
      if (parsed.correspondentAccount !== undefined)
        data.correspondentAccount = parsed.correspondentAccount;
      if (parsed.mfo !== undefined) data.mfo = parsed.mfo;
      if (parsed.bankInn !== undefined) data.bankInn = parsed.bankInn;
      if (parsed.swift !== undefined) data.swift = parsed.swift;
      if (parsed.currency !== undefined) data.currency = parsed.currency;
      if (parsed.isMain !== undefined) data.isMain = parsed.isMain;

      const updated = await tx.counterpartyAccount.update({
        where: { id: bankAccountId },
        data,
      });
      await tx.auditLog.create({
        data: {
          accountId,
          userId,
          entity: 'Counterparty',
          entityId: counterpartyId,
          action: 'update-bank-account',
          fieldChanges: {
            bankAccount: {
              before: this.bankAccountSummary(existing),
              after: this.bankAccountSummary(updated),
            },
          } as Prisma.InputJsonValue,
        },
      });
      return updated;
    });
  }

  async deleteBankAccount(
    accountId: string,
    userId: string,
    counterpartyId: string,
    bankAccountId: string,
  ) {
    const existing = await this.prisma.client.counterpartyAccount.findFirst({
      where: { id: bankAccountId, accountId, counterpartyId },
    });
    if (!existing) throw new NotFoundException(`Bank account ${bankAccountId} not found`);
    await this.prisma.client.counterpartyAccount.delete({ where: { id: bankAccountId } });
    // entityId is the PARENT counterparty (logAudit writes entity='Counterparty')
    // so the row lands on the counterparty History feed — NOT bankAccountId,
    // which no page queries (the orphaned-audit bug this fixes).
    await this.logAudit(accountId, userId, 'delete-bank-account', counterpartyId, {
      bankAccount: { before: this.bankAccountSummary(existing), after: null },
    });
    return { ok: true };
  }

  private parseCreate(raw: unknown): CreateCounterpartyInput {
    const r = CreateCounterpartySchema.safeParse(raw);
    if (!r.success) {
      throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    }
    return r.data;
  }

  private parseUpdate(raw: unknown): UpdateCounterpartyInput {
    const r = UpdateCounterpartySchema.safeParse(raw);
    if (!r.success) {
      throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    }
    return r.data;
  }

  private parseAccountCreate(raw: unknown): CreateCounterpartyAccountInput {
    const r = CreateCounterpartyAccountSchema.safeParse(raw);
    if (!r.success) {
      throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    }
    return r.data;
  }

  private parseAccountUpdate(raw: unknown): UpdateCounterpartyAccountInput {
    const r = UpdateCounterpartyAccountSchema.safeParse(raw);
    if (!r.success) {
      throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    }
    return r.data;
  }

  /**
   * Human-readable identity of a counterparty bank account for the History
   * diff («<account number> · <bank>»). Bank-account create/update/delete are
   * logged under the PARENT counterparty's feed (entity='Counterparty',
   * entityId=<counterpartyId>) so they surface on the counterparty detail
   * page's History («Tarix») tab — mirroring the bundle component-list pattern
   * (a nested-child change shown in the parent's audit feed). Before this they
   * were written under entity='CounterpartyAccount' (create/update) or with
   * entityId=<bankAccountId> (delete); no page queries either, so the rows were
   * orphaned and never displayed at all.
   */
  private bankAccountSummary(acc: {
    accountNumber: string;
    bankName: string | null;
  }): string | null {
    return [acc.accountNumber, acc.bankName].filter(Boolean).join(' · ') || null;
  }

  private diff(
    before: Record<string, unknown>,
    after: Record<string, unknown>,
  ): Record<string, { before: unknown; after: unknown }> {
    const d: Record<string, { before: unknown; after: unknown }> = {};
    for (const k of Object.keys(after)) {
      if (k === 'createdAt' || k === 'updatedAt') continue;
      if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) {
        d[k] = { before: before[k], after: after[k] };
      }
    }
    return d;
  }

  private async logAudit(
    accountId: string,
    userId: string,
    action: string,
    entityId: string,
    fieldChanges: Record<string, unknown> | null,
  ): Promise<void> {
    await this.prisma.client.auditLog.create({
      data: {
        accountId,
        userId,
        entity: 'Counterparty',
        entityId,
        action,
        fieldChanges: fieldChanges as Prisma.InputJsonValue | undefined,
      },
    });
  }

  private handlePrisma(e: unknown): never {
    const err = e as { code?: string; meta?: { target?: string[] } };
    if (err.code === 'P2002') {
      throw new ConflictException(
        `Bu maydon bilan allaqachon mavjud: ${err.meta?.target?.join(', ')}`,
      );
    }
    throw e as Error;
  }
}
