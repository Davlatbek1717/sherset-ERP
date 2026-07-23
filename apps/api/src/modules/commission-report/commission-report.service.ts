import { computePositionTotal } from '@moysklad/money';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { allocateDocumentNumber } from '../../prisma/document-number.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { tashkentRangeBounds } from '../report/report-date-bounds.util.js';
import { resolveCreatorGroupId } from '../shared/group-stamp.js';
import { assertMassEditRefsInTenant } from '../shared/mass-edit.js';
import {
  type CommissionReportCreateInput,
  CommissionReportCreateSchema,
  type CommissionReportInCreateInput,
  CommissionReportInCreateSchema,
  type CommissionReportListQuery,
  CommissionReportListQuerySchema,
} from './commission-report.schema.js';

/**
 * Unified «Отчёты комиссионера» read service (moysklad «Продажи → Отчёты
 * комиссионера»).
 *
 * moysklad shows ONE list of every commission report — «Выданный» (we are the
 * commissioner) and «Полученный» (we are the consigner) — with a «Тип документа»
 * column. We store the two as separate tables (commission_reports_out /
 * commission_reports_in), so this read-model UNIONs them into a normalized,
 * server-paginated feed with five money columns (Сумма · Сумма комиссии · Прочие
 * услуги · Сумма комитента · Оплачено). Read-only: the per-type create/post flow
 * lands with the consignment FSM sprint.
 *
 * UNION shape mirrors payments.service.ts (same positional-param builder, same
 * outer-filter / count / totals / hydrate split). No migration here beyond the
 * two money columns the list needs.
 */

const KINDS = ['out', 'in'] as const;
type Kind = (typeof KINDS)[number];

const TABLE: Record<Kind, string> = {
  out: 'commission_reports_out',
  in: 'commission_reports_in',
};

const SORT_COLUMN: Record<CommissionReportListQuery['sortBy'], string> = {
  moment: 'moment',
  name: 'name',
  sum: 'sum_minor',
  commission: 'reward_sum_minor',
  otherServices: 'other_services_sum_minor',
  commitentSum: 'commitent_sum_minor',
  payed: 'payed_sum_minor',
  agent: 'agent_name',
};

/** A row as returned by the UNION (snake_case, raw BigInt). */
interface RawReportRow {
  kind: Kind;
  id: string;
  name: string;
  moment: Date;
  organization_id: string;
  agent_id: string;
  contract_id: string | null;
  sum_minor: bigint;
  reward_sum_minor: bigint;
  other_services_sum_minor: bigint;
  commitent_sum_minor: bigint;
  payed_sum_minor: bigint;
  currency: string;
  comment: string | null;
  state: string;
  applicable: boolean;
  printed: boolean;
  published: boolean;
  owner_id: string | null;
  group_id: string | null;
  status_id: string | null;
  shared: boolean;
  updated_at: Date;
  agent_name: string | null;
}

export interface CommissionReportListItem {
  kind: Kind;
  id: string;
  name: string;
  moment: string;
  organization: { id: string; name: string } | null;
  agent: { id: string; name: string; legalTitle: string | null } | null;
  contract: { id: string; name: string } | null;
  sumMinor: string;
  rewardSumMinor: string;
  otherServicesSumMinor: string;
  commitentSumMinor: string;
  payedSumMinor: string;
  currency: string;
  comment: string | null;
  state: string;
  applicable: boolean;
  printed: boolean;
  published: boolean;
  // gear-optional columns (default-hidden) — moysklad column ⚙ parity.
  shared: boolean;
  updatedAt: string;
  owner: { id: string; name: string } | null;
  group: { id: string; name: string } | null;
  // moysklad «Статус» column = account-defined CUSTOM workflow status (coloured
  // pill), NOT the FSM `state`. Resolved from the State row via status_id.
  status: { id: string; name: string; color: string | null } | null;
}

export interface CommissionReportListResponse {
  items: CommissionReportListItem[];
  total: number;
  page: number;
  pageSize: number;
  /**
   * Footer «Итого» — sums across the WHOLE filtered set. `currencies` lets the
   * UI show «—» on a mixed-currency set (moysklad never sums unlike currencies).
   */
  totals: {
    sumMinor: string;
    rewardSumMinor: string;
    otherServicesSumMinor: string;
    commitentSumMinor: string;
    payedSumMinor: string;
    currencies: string[];
  };
}

@Injectable()
export class CommissionReportService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string, rawQuery: unknown): Promise<CommissionReportListResponse> {
    const q = this.parseQuery(rawQuery);
    const client = this.prisma.client;

    // ---- positional-param builder (auto-numbers $1..$N) -------------------
    const params: unknown[] = [];
    const bind = (v: unknown): string => {
      params.push(v);
      return `$${params.length}`;
    };
    const accountPh = bind(accountId); // $1, reused by every UNION branch

    // Period push-down — Asia/Tashkent calendar-day half-open bounds [gte, lt),
    // bound once and embedded into every branch's WHERE. A naive `new Date(to)`
    // (UTC midnight) + `<= to` drops the whole last Tashkent day (see
    // report-date-bounds.util doc); tashkentRangeBounds returns the correct window.
    let periodClause = '';
    const mBounds = tashkentRangeBounds(q.momentFrom, q.momentTo);
    if (mBounds.gte) periodClause += ` AND t.moment >= ${bind(mBounds.gte)}`;
    if (mBounds.lt) periodClause += ` AND t.moment < ${bind(mBounds.lt)}`;

    // kind/table are server constants (never user input) → safe to inline.
    const branchSql = (kind: Kind): string =>
      `SELECT '${kind}'::text AS kind, t.id, t.name, t.moment, t.updated_at,
          t.organization_id, t.agent_id, t.owner_id, t.group_id, t.contract_id, t.shared,
          t.status_id,
          t.sum_minor, t.reward_sum_minor, t.other_services_sum_minor,
          t.commitent_sum_minor, t.payed_sum_minor,
          t.currency, t.description AS comment, t.state, t.applicable, t.printed, t.published,
          (SELECT cp.name FROM counterparties cp WHERE cp.id = t.agent_id) AS agent_name
        FROM ${TABLE[kind]} t
        WHERE t.account_id = ${accountPh}::uuid AND t.deleted_at IS NULL${periodClause}`;

    const kinds: Kind[] = q.kind ? [q.kind] : [...KINDS];
    const union = kinds.map(branchSql).join('\nUNION ALL\n');

    // ---- outer filters (on the unioned alias `c`) ------------------------
    const outer: string[] = [];
    const csv = (s: string | undefined): string[] =>
      s
        ? s
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean)
        : [];
    const inUuid = (col: string, s: string | undefined): void => {
      const ids = csv(s);
      if (ids.length) outer.push(`${col} IN (${ids.map((id) => `${bind(id)}::uuid`).join(', ')})`);
    };
    const boolEq = (col: string, v: 'true' | 'false' | undefined): void => {
      if (v) outer.push(`${col} = ${bind(v === 'true')}`);
    };

    if (q.search) {
      const s = bind(`%${q.search}%`);
      outer.push(`(c.name ILIKE ${s} OR c.comment ILIKE ${s} OR c.agent_name ILIKE ${s})`);
    }
    inUuid('c.organization_id', q.organizationIds);
    inUuid('c.agent_id', q.agentIds);
    inUuid('c.contract_id', q.contractIds);
    inUuid('c.owner_id', q.ownerIds);
    inUuid('c.group_id', q.groupIds);
    // «Группа контрагента» / «Владелец контрагента» — filter on the agent's own
    // group/owner via a tenant-scoped subquery on counterparties.
    const agentGroupIds = csv(q.agentGroupIds);
    if (agentGroupIds.length)
      outer.push(
        `c.agent_id IN (SELECT id FROM counterparties WHERE account_id = ${accountPh}::uuid AND group_id IN (${agentGroupIds
          .map((id) => `${bind(id)}::uuid`)
          .join(', ')}))`,
      );
    const agentOwnerIds = csv(q.agentOwnerIds);
    if (agentOwnerIds.length)
      outer.push(
        `c.agent_id IN (SELECT id FROM counterparties WHERE account_id = ${accountPh}::uuid AND owner_id IN (${agentOwnerIds
          .map((id) => `${bind(id)}::uuid`)
          .join(', ')}))`,
      );
    if (q.state) outer.push(`c.state = ${bind(q.state)}`);
    // «Статус» — the account-defined CUSTOM workflow status (State row). The
    // UNION exposes c.status_id; a null `statusId` of '' means «без статуса»
    // (grey pill), filtered as IS NULL. Mirrors the demands statusIds filter.
    if (q.statusId) outer.push(`c.status_id = ${bind(q.statusId)}::uuid`);
    boolEq('c.applicable', q.applicable);
    boolEq('c.printed', q.printed);
    boolEq('c.published', q.published);
    boolEq('c.shared', q.shared);
    const uBounds = tashkentRangeBounds(q.updatedFrom, q.updatedTo);
    if (uBounds.gte) outer.push(`c.updated_at >= ${bind(uBounds.gte)}`);
    if (uBounds.lt) outer.push(`c.updated_at < ${bind(uBounds.lt)}`);
    const whereOuter = outer.length ? `WHERE ${outer.join(' AND ')}` : '';

    // Snapshot params before list-only LIMIT/OFFSET so count/totals get exactly
    // the params they reference (pg rejects extra binds).
    const baseParams = [...params];
    const countSql = `SELECT COUNT(*)::int AS n FROM (${union}) c ${whereOuter}`;
    const totalsSql = `SELECT
        COALESCE(SUM(c.sum_minor), 0)::bigint AS sum,
        COALESCE(SUM(c.reward_sum_minor), 0)::bigint AS reward,
        COALESCE(SUM(c.other_services_sum_minor), 0)::bigint AS other_services,
        COALESCE(SUM(c.commitent_sum_minor), 0)::bigint AS commitent,
        COALESCE(SUM(c.payed_sum_minor), 0)::bigint AS payed,
        COALESCE(array_agg(DISTINCT c.currency), '{}'::text[]) AS currencies
      FROM (${union}) c ${whereOuter}`;

    const sortCol = SORT_COLUMN[q.sortBy];
    const dir = q.sortDir === 'asc' ? 'ASC' : 'DESC';
    const limitPh = bind(q.pageSize);
    const offsetPh = bind((q.page - 1) * q.pageSize);
    // NULLS LAST keeps un-named agents from floating to the top when sorting by
    // «Контрагент»; id tiebreak makes pagination deterministic.
    const listSql = `SELECT * FROM (${union}) c ${whereOuter}
      ORDER BY c.${sortCol} ${dir} NULLS LAST, c.id DESC
      LIMIT ${limitPh} OFFSET ${offsetPh}`;
    const listParams = [...params];

    const [rows, countRows, totalsRows] = await Promise.all([
      client.$queryRawUnsafe<RawReportRow[]>(listSql, ...listParams),
      client.$queryRawUnsafe<Array<{ n: number }>>(countSql, ...baseParams),
      client.$queryRawUnsafe<
        Array<{
          sum: bigint;
          reward: bigint;
          other_services: bigint;
          commitent: bigint;
          payed: bigint;
          currencies: string[];
        }>
      >(totalsSql, ...baseParams),
    ]);

    const items = await this.hydrate(rows);
    const total = countRows[0]?.n ?? 0;
    const t = totalsRows[0] ?? {
      sum: 0n,
      reward: 0n,
      other_services: 0n,
      commitent: 0n,
      payed: 0n,
      currencies: [],
    };

    return {
      items,
      total,
      page: q.page,
      pageSize: q.pageSize,
      totals: {
        sumMinor: t.sum.toString(),
        rewardSumMinor: t.reward.toString(),
        otherServicesSumMinor: t.other_services.toString(),
        commitentSumMinor: t.commitent.toString(),
        payedSumMinor: t.payed.toString(),
        currencies: t.currencies ?? [],
      },
    };
  }

  /** Batch-resolve the FK names referenced by the page of rows. */
  private async hydrate(rows: RawReportRow[]): Promise<CommissionReportListItem[]> {
    if (rows.length === 0) return [];
    const client = this.prisma.client;
    const uniq = (xs: Array<string | null>): string[] => [
      ...new Set(xs.filter((x): x is string => !!x)),
    ];

    const orgIds = uniq(rows.map((r) => r.organization_id));
    const agentIds = uniq(rows.map((r) => r.agent_id));
    const contractIds = uniq(rows.map((r) => r.contract_id));
    const ownerIds = uniq(rows.map((r) => r.owner_id));
    const groupIds = uniq(rows.map((r) => r.group_id));
    const statusIds = uniq(rows.map((r) => r.status_id));

    const [orgs, agents, contracts, owners, groups, statuses] = await Promise.all([
      client.organization.findMany({
        where: { id: { in: orgIds } },
        select: { id: true, name: true },
      }),
      client.counterparty.findMany({
        where: { id: { in: agentIds } },
        select: { id: true, name: true, legalTitle: true },
      }),
      contractIds.length
        ? client.contract.findMany({
            where: { id: { in: contractIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      ownerIds.length
        ? client.employee.findMany({
            where: { id: { in: ownerIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      groupIds.length
        ? client.group.findMany({
            where: { id: { in: groupIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      statusIds.length
        ? client.state.findMany({
            where: { id: { in: statusIds } },
            select: { id: true, name: true, color: true },
          })
        : Promise.resolve([]),
    ]);

    const orgMap = new Map(orgs.map((o) => [o.id, o.name]));
    const agentMap = new Map(agents.map((a) => [a.id, a]));
    const contractMap = new Map(contracts.map((c) => [c.id, c.name]));
    const ownerMap = new Map(owners.map((e) => [e.id, e.name]));
    const groupMap = new Map(groups.map((g) => [g.id, g.name]));
    const statusMap = new Map(statuses.map((s) => [s.id, s]));

    return rows.map((r) => {
      const orgName = orgMap.get(r.organization_id);
      const agent = agentMap.get(r.agent_id);
      const contractName = r.contract_id ? contractMap.get(r.contract_id) : undefined;
      const ownerName = r.owner_id ? ownerMap.get(r.owner_id) : undefined;
      const groupName = r.group_id ? groupMap.get(r.group_id) : undefined;
      const status = r.status_id ? statusMap.get(r.status_id) : undefined;
      return {
        kind: r.kind,
        id: r.id,
        name: r.name,
        moment: r.moment.toISOString(),
        organization: orgName != null ? { id: r.organization_id, name: orgName } : null,
        agent: agent ? { id: agent.id, name: agent.name, legalTitle: agent.legalTitle } : null,
        contract:
          r.contract_id && contractName != null ? { id: r.contract_id, name: contractName } : null,
        sumMinor: r.sum_minor.toString(),
        rewardSumMinor: r.reward_sum_minor.toString(),
        otherServicesSumMinor: r.other_services_sum_minor.toString(),
        commitentSumMinor: r.commitent_sum_minor.toString(),
        payedSumMinor: r.payed_sum_minor.toString(),
        currency: r.currency,
        comment: r.comment,
        state: r.state,
        applicable: r.applicable,
        printed: r.printed,
        published: r.published,
        shared: r.shared,
        updatedAt: r.updated_at.toISOString(),
        owner: r.owner_id && ownerName != null ? { id: r.owner_id, name: ownerName } : null,
        group: r.group_id && groupName != null ? { id: r.group_id, name: groupName } : null,
        status: status ? { id: status.id, name: status.name, color: status.color } : null,
      };
    });
  }

  /**
   * «Удалить» — soft-delete the selected reports across BOTH union tables. A row
   * lives in exactly one table; `id IN (...)` on each makes the dispatch implicit.
   * Read-only docs (never posted via our app) so there is no balance/stock to
   * reverse — a plain `deletedAt` stamp is correct.
   */
  async bulkSoftDelete(accountId: string, ids: string[]): Promise<{ deleted: number }> {
    const now = new Date();
    const where = { accountId, id: { in: ids }, deletedAt: null } as const;
    const [out, inn] = await Promise.all([
      this.prisma.client.commissionReportOut.updateMany({ where, data: { deletedAt: now } }),
      this.prisma.client.commissionReportIn.updateMany({ where, data: { deletedAt: now } }),
    ]);
    return { deleted: out.count + inn.count };
  }

  /**
   * «Массовое редактирование» — apply ownerId / description to many reports. The
   * `ownerId` is tenant-guarded (a hand-crafted request must not point it at an
   * employee from another account — a dangling FK; no cross-tenant read leak).
   */
  async massEdit(
    accountId: string,
    ids: string[],
    patch: { ownerId?: string | null; description?: string | null },
  ): Promise<{ updated: number }> {
    if (patch.ownerId) {
      const owner = await this.prisma.client.employee.findFirst({
        where: { id: patch.ownerId, accountId },
        select: { id: true },
      });
      if (!owner) throw new BadRequestException('ownerId not found in this account');
    }
    const data: { ownerId?: string | null; description?: string | null } = {};
    if (patch.ownerId !== undefined) data.ownerId = patch.ownerId;
    if (patch.description !== undefined) data.description = patch.description;
    const where = { accountId, id: { in: ids }, deletedAt: null } as const;
    const [out, inn] = await Promise.all([
      this.prisma.client.commissionReportOut.updateMany({ where, data }),
      this.prisma.client.commissionReportIn.updateMany({ where, data }),
    ]);
    return { updated: out.count + inn.count };
  }

  /** №-link detail fetch — out side («Выданный»). */
  async findByIdOut(accountId: string, id: string) {
    const row = await this.prisma.client.commissionReportOut.findFirst({
      where: { id, accountId, deletedAt: null },
      include: {
        agent: true,
        organization: true,
        owner: { select: { id: true, name: true, email: true } },
        contract: true,
        status: { select: { id: true, name: true, color: true } },
      },
    });
    if (!row) throw new NotFoundException(`CommissionReportOut ${id} not found`);
    return row;
  }

  /** №-link detail fetch — in side («Полученный»). */
  async findByIdIn(accountId: string, id: string) {
    const row = await this.prisma.client.commissionReportIn.findFirst({
      where: { id, accountId, deletedAt: null },
      include: {
        agent: true,
        organization: true,
        owner: { select: { id: true, name: true, email: true } },
        contract: true,
      },
    });
    if (!row) throw new NotFoundException(`CommissionReportIn ${id} not found`);
    return row;
  }

  /**
   * «Выданный отчёт комиссионера» create (the «+ Отчёт комиссионера → Выданный»
   * editor). The model is header-only, so the server computes the document totals
   * from the posted positions and stores the header + sums as a `draft`. Position
   * ROWS are not persisted yet (no positions table — joins the FSM sprint with
   * /[id]); the draft still surfaces in the unified list with the correct
   * Сумма / Комиссия / Сумма комитента. Every ref id is tenant-validated.
   */
  async createOut(accountId: string, userId: string, raw: unknown) {
    const parsed = this.parseCreate(raw);

    // Tenant-validate refs — a hand-crafted body must not point organizationId /
    // agentId / contractId at another account (dangling FK / cross-tenant leak).
    const [org, agent] = await Promise.all([
      this.prisma.client.organization.findFirst({
        where: { id: parsed.organizationId, accountId },
        select: { id: true },
      }),
      this.prisma.client.counterparty.findFirst({
        where: { id: parsed.agentId, accountId },
        select: { id: true },
      }),
    ]);
    if (!org) throw new BadRequestException('organizationId not found in this account');
    if (!agent) throw new BadRequestException('agentId not found in this account');
    if (parsed.contractId) {
      const contract = await this.prisma.client.contract.findFirst({
        where: { id: parsed.contractId, accountId },
        select: { id: true },
      });
      if (!contract) throw new BadRequestException('contractId not found in this account');
    }
    if (parsed.ownerId) {
      await assertMassEditRefsInTenant(this.prisma, accountId, { ownerId: parsed.ownerId });
    }
    if (parsed.groupId) {
      const grp = await this.prisma.client.group.findFirst({
        where: { id: parsed.groupId, accountId },
        select: { id: true },
      });
      if (!grp) throw new BadRequestException('groupId not found in this account');
    }
    // «Статус» — the picked custom status must be an active State of THIS account
    // scoped to entityType="commissionreportout" (never another doc type's status).
    if (parsed.statusId) {
      const st = await this.prisma.client.state.findFirst({
        where: {
          id: parsed.statusId,
          accountId,
          entityType: 'commissionreportout',
          archived: false,
        },
        select: { id: true },
      });
      if (!st) throw new BadRequestException('statusId not found in this account');
    }

    // Server-authoritative totals (never trust client money). «Сумма» = Σ line
    // gross; «НДС» = Σ line VAT; «Комиссия» = Σ per-line reward; «Сумма комитента»
    // = Сумма − Комиссия (the amount payable to the consigner).
    let sumMinor = 0n;
    let vatSumMinor = 0n;
    let rewardSumMinor = 0n;
    for (const p of parsed.positions) {
      const assortmentOk = await this.prisma.client.product.findFirst({
        where: { id: p.assortmentId, accountId },
        select: { id: true },
      });
      if (!assortmentOk) throw new BadRequestException('position assortmentId not in this account');
      const { totalMinor, vatAmountMinor } = computePositionTotal(
        { quantity: p.quantity, priceMinor: p.priceMinor, discount: p.discount, vat: p.vat },
        parsed.vatEnabled && p.vatEnabled,
        parsed.vatIncluded,
      );
      sumMinor += totalMinor;
      vatSumMinor += vatAmountMinor;
      rewardSumMinor += BigInt(p.commissionMinor || '0');
    }
    if (rewardSumMinor > sumMinor) {
      throw new BadRequestException('Комиссия не может превышать сумму отчёта');
    }
    const commitentSumMinor = sumMinor - rewardSumMinor;

    const momentDate = parsed.moment ? new Date(parsed.moment) : new Date();
    if (Number.isNaN(momentDate.getTime())) throw new BadRequestException('Invalid moment');

    // moysklad-parity plain zero-padded sequence (mirrors customer-order / payment).
    const n = await allocateDocumentNumber(
      this.prisma.client,
      accountId,
      'commissionreportout',
      async () => {
        const rows = await this.prisma.client.commissionReportOut.findMany({
          where: { accountId },
          select: { name: true },
        });
        let max = 0;
        for (const r of rows) {
          if (/^\d+$/.test(r.name)) max = Math.max(max, Number.parseInt(r.name, 10));
        }
        return max;
      },
    );
    const name = String(n).padStart(5, '0');

    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, userId);

    // «Проведено» — header-only model, so posting is a pure state flag (no stock /
    // money ledger): applicable ⇒ state=posted + postedAt stamp; else a draft.
    const created = await this.prisma.client.commissionReportOut.create({
      data: {
        accountId,
        ownerId: parsed.ownerId ?? userId,
        groupId: parsed.groupId ?? creatorGroupId,
        shared: parsed.shared ?? false,
        name,
        agentId: parsed.agentId,
        organizationId: parsed.organizationId,
        contractId: parsed.contractId ?? null,
        statusId: parsed.statusId ?? null,
        moment: momentDate,
        applicable: parsed.applicable,
        state: parsed.applicable ? 'posted' : 'draft',
        postedAt: parsed.applicable ? momentDate : null,
        currency: parsed.currency,
        rateValue: BigInt(parsed.rateValue),
        vatEnabled: parsed.vatEnabled,
        vatIncluded: parsed.vatIncluded,
        description: parsed.description ?? null,
        sumMinor,
        vatSumMinor,
        rewardSumMinor,
        commitentSumMinor,
      },
      select: { id: true, name: true, state: true },
    });
    return created;
  }

  /**
   * «Полученный отчёт комиссионера» create — mirror of createOut for the IN table.
   * `organizationId` = «Организация-продавец», `agentId` = «Контрагент-комиссионер».
   * Adds «Входящий номер»/date + «Прочие услуги». Header-only; server-computed totals
   * from `positions` (= «Реализовано комиссионером»). «Проведено» flips state→posted.
   */
  async createIn(accountId: string, userId: string, raw: unknown) {
    const parsed = this.parseCreateIn(raw);

    const [org, agent] = await Promise.all([
      this.prisma.client.organization.findFirst({
        where: { id: parsed.organizationId, accountId },
        select: { id: true },
      }),
      this.prisma.client.counterparty.findFirst({
        where: { id: parsed.agentId, accountId },
        select: { id: true },
      }),
    ]);
    if (!org) throw new BadRequestException('organizationId not found in this account');
    if (!agent) throw new BadRequestException('agentId not found in this account');
    if (parsed.contractId) {
      const contract = await this.prisma.client.contract.findFirst({
        where: { id: parsed.contractId, accountId },
        select: { id: true },
      });
      if (!contract) throw new BadRequestException('contractId not found in this account');
    }
    if (parsed.ownerId) {
      await assertMassEditRefsInTenant(this.prisma, accountId, { ownerId: parsed.ownerId });
    }
    if (parsed.groupId) {
      const grp = await this.prisma.client.group.findFirst({
        where: { id: parsed.groupId, accountId },
        select: { id: true },
      });
      if (!grp) throw new BadRequestException('groupId not found in this account');
    }
    if (parsed.statusId) {
      const st = await this.prisma.client.state.findFirst({
        where: {
          id: parsed.statusId,
          accountId,
          entityType: 'commissionreportin',
          archived: false,
        },
        select: { id: true },
      });
      if (!st) throw new BadRequestException('statusId not found in this account');
    }

    let sumMinor = 0n;
    let vatSumMinor = 0n;
    let rewardSumMinor = 0n;
    for (const p of parsed.positions) {
      const assortmentOk = await this.prisma.client.product.findFirst({
        where: { id: p.assortmentId, accountId },
        select: { id: true },
      });
      if (!assortmentOk) throw new BadRequestException('position assortmentId not in this account');
      const { totalMinor, vatAmountMinor } = computePositionTotal(
        { quantity: p.quantity, priceMinor: p.priceMinor, discount: p.discount, vat: p.vat },
        parsed.vatEnabled && p.vatEnabled,
        parsed.vatIncluded,
      );
      sumMinor += totalMinor;
      vatSumMinor += vatAmountMinor;
      rewardSumMinor += BigInt(p.commissionMinor || '0');
    }
    if (rewardSumMinor > sumMinor) {
      throw new BadRequestException('Комиссия не может превышать сумму отчёта');
    }
    const otherServicesSumMinor = BigInt(parsed.otherServicesMinor || '0');
    const commitentSumMinor = sumMinor - rewardSumMinor;

    const momentDate = parsed.moment ? new Date(parsed.moment) : new Date();
    if (Number.isNaN(momentDate.getTime())) throw new BadRequestException('Invalid moment');
    let incomingDate: Date | null = null;
    if (parsed.incomingDate) {
      incomingDate = new Date(parsed.incomingDate);
      if (Number.isNaN(incomingDate.getTime()))
        throw new BadRequestException('Invalid incomingDate');
    }

    const n = await allocateDocumentNumber(
      this.prisma.client,
      accountId,
      'commissionreportin',
      async () => {
        const rows = await this.prisma.client.commissionReportIn.findMany({
          where: { accountId },
          select: { name: true },
        });
        let max = 0;
        for (const r of rows) {
          if (/^\d+$/.test(r.name)) max = Math.max(max, Number.parseInt(r.name, 10));
        }
        return max;
      },
    );
    const name = String(n).padStart(5, '0');
    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, userId);

    const created = await this.prisma.client.commissionReportIn.create({
      data: {
        accountId,
        ownerId: parsed.ownerId ?? userId,
        groupId: parsed.groupId ?? creatorGroupId,
        shared: parsed.shared ?? false,
        name,
        agentId: parsed.agentId,
        organizationId: parsed.organizationId,
        contractId: parsed.contractId ?? null,
        statusId: parsed.statusId ?? null,
        incomingNumber: parsed.incomingNumber ?? null,
        incomingDate,
        moment: momentDate,
        applicable: parsed.applicable,
        state: parsed.applicable ? 'posted' : 'draft',
        postedAt: parsed.applicable ? momentDate : null,
        currency: parsed.currency,
        rateValue: BigInt(parsed.rateValue),
        vatEnabled: parsed.vatEnabled,
        vatIncluded: parsed.vatIncluded,
        description: parsed.description ?? null,
        sumMinor,
        vatSumMinor,
        rewardSumMinor,
        otherServicesSumMinor,
        commitentSumMinor,
      },
      select: { id: true, name: true, state: true },
    });
    return created;
  }

  private parseCreateIn(raw: unknown): CommissionReportInCreateInput {
    const r = CommissionReportInCreateSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private parseCreate(raw: unknown): CommissionReportCreateInput {
    const r = CommissionReportCreateSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private parseQuery(raw: unknown): CommissionReportListQuery {
    const r = CommissionReportListQuerySchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }
}
