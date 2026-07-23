import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service.js';

/**
 * Unified «Платежи» list (moysklad «Деньги → Платежи» tab).
 *
 * moysklad shows ONE list of every payment document — Входящий платеж /
 * Исходящий платеж / Приходный ордер / Расходный ордер — with a Приход and a
 * Расход money column. We store those four as separate tables (payments_in /
 * payments_out / cash_in / cash_out), so this read-model UNIONs them into one
 * normalized, server-paginated feed. Read-only: the per-type `/new` editors
 * still create the documents; this surface only lists + totals them.
 *
 * UNION shape mirrors cash-flow.service.ts (same four tables, same @@map
 * physical names). No migration — nothing here writes.
 */

const KINDS = ['paymentin', 'paymentout', 'cashin', 'cashout'] as const;
type Kind = (typeof KINDS)[number];

const ListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(100),
  sortBy: z.enum(['moment', 'name', 'income', 'expense']).default('moment'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
  search: z.string().trim().min(1).optional(),
  // «Тип документа» — one of the 4 payment kinds (empty = «Все»).
  kind: z.enum(KINDS).optional(),
  // Multi-value reference filters — comma-separated UUIDs → IN (...). Mirror the
  // invoices-in gold-standard (MultiCombobox sends `ids.map(x=>x.id).join(',')`).
  organizationIds: z.string().optional(),
  agentIds: z.string().optional(),
  agentGroupIds: z.string().optional(),
  agentOwnerIds: z.string().optional(),
  contractIds: z.string().optional(),
  projectIds: z.string().optional(),
  organizationAccountIds: z.string().optional(),
  ownerIds: z.string().optional(),
  groupIds: z.string().optional(),
  salesChannelIds: z.string().optional(),
  // «Статья расходов» — comma-separated free-text values (paymentout/cashout only).
  expenseItems: z.string().optional(),
  // Single-value enum + tri-state boolean filters.
  state: z.enum(['draft', 'posted', 'cancelled']).optional(),
  applicable: z.enum(['true', 'false']).optional(),
  printed: z.enum(['true', 'false']).optional(),
  shared: z.enum(['true', 'false']).optional(),
  noClosingDocs: z.enum(['true', 'false']).optional(),
  // Ranges (dates parsed via `new Date` — accepts ISO or YYYY-MM-DD).
  momentFrom: z.string().optional(),
  momentTo: z.string().optional(),
  updatedFrom: z.string().optional(),
  updatedTo: z.string().optional(),
  sumFrom: z.string().regex(/^\d+$/).optional(),
  sumTo: z.string().regex(/^\d+$/).optional(),
});

export type PaymentsListQuery = z.infer<typeof ListQuerySchema>;

/** A row as returned by the UNION (snake_case, raw BigInt). */
interface RawPaymentRow {
  kind: Kind;
  id: string;
  name: string;
  moment: Date;
  updated_at: Date;
  organization_id: string;
  org_account_id: string | null;
  cash_desk_id: string | null;
  agent_id: string;
  agent_account_id: string | null;
  contract_id: string | null;
  project_id: string | null;
  sales_channel_id: string | null;
  owner_id: string | null;
  group_id: string | null;
  shared: boolean;
  expense_item: string | null;
  incoming_number: string | null;
  incoming_date: Date | null;
  linked_minor: bigint;
  income_minor: bigint;
  expense_minor: bigint;
  sum_minor: bigint;
  currency: string;
  payment_purpose: string | null;
  comment: string | null;
  printed: boolean;
  state: string;
  applicable: boolean;
}

export interface PaymentsListItem {
  kind: Kind;
  id: string;
  name: string;
  moment: string;
  organization: { id: string; name: string } | null;
  organizationAccountName: string | null;
  agent: { id: string; name: string } | null;
  agentAccountName: string | null;
  incomeMinor: string;
  expenseMinor: string;
  currency: string;
  paymentPurpose: string | null;
  comment: string | null;
  /** moysklad «Отправлено» — emailed/EDI flag; not tracked yet (always null). */
  sent: null;
  printed: boolean;
  state: string;
  applicable: boolean;
  // ── extra column-settings fields (moysklad ⚙ list; hidden by default) ──
  contractName: string | null; // «Договор»
  projectName: string | null; // «Проект»
  salesChannelName: string | null; // «Канал продаж»
  ownerName: string | null; // «Владелец-сотрудник»
  groupName: string | null; // «Владелец-отдел»
  expenseItem: string | null; // «Статья расходов» (out docs only)
  shared: boolean; // «Общий доступ»
  incomingNumber: string | null; // «Входящий номер» (paymentin only)
  incomingDate: string | null; // «Входящая дата» (paymentin only)
  /** «Привязано» — sum allocated to linked docs; «Не привязано» = doc sum − linked. */
  linkedMinor: string;
  notLinkedMinor: string;
  updatedAt: string; // «Когда изменен»
}

export interface PaymentsListResponse {
  items: PaymentsListItem[];
  total: number;
  page: number;
  pageSize: number;
  /**
   * `currencies` — distinct doc currencies in the filtered set. The list
   * footer never sums unlike currencies (moysklad parity): >1 ⇒ «—» guard.
   */
  totals: { incomeMinor: string; expenseMinor: string; currencies: string[] };
}

// Physical table per kind — must match @@map() in schema.prisma (cash_in /
// cash_out singular, payments_in / payments_out plural). See cash-flow.service.
const TABLE: Record<Kind, string> = {
  paymentin: 'payments_in',
  paymentout: 'payments_out',
  cashin: 'cash_in',
  cashout: 'cash_out',
};
const DIRECTION: Record<Kind, 'in' | 'out'> = {
  paymentin: 'in',
  paymentout: 'out',
  cashin: 'in',
  cashout: 'out',
};
const IS_CASH: Record<Kind, boolean> = {
  paymentin: false,
  paymentout: false,
  cashin: true,
  cashout: true,
};
// «Привязано» — sum of the doc's allocation operations (one op table per kind).
const OP_TABLE: Record<Kind, string> = {
  paymentin: 'payment_in_operations',
  paymentout: 'payment_out_operations',
  cashin: 'cash_in_operations',
  cashout: 'cash_out_operations',
};
const OP_FK: Record<Kind, string> = {
  paymentin: 'payment_in_id',
  paymentout: 'payment_out_id',
  cashin: 'cash_in_id',
  cashout: 'cash_out_id',
};
const SORT_COLUMN: Record<PaymentsListQuery['sortBy'], string> = {
  moment: 'moment',
  name: 'name',
  income: 'income_minor',
  expense: 'expense_minor',
};

@Injectable()
export class PaymentsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string, rawQuery: unknown): Promise<PaymentsListResponse> {
    const q = this.parseQuery(rawQuery);
    const client = this.prisma.client;

    // ---- positional-param builder (auto-numbers $1..$N) -------------------
    const params: unknown[] = [];
    const bind = (v: unknown): string => {
      params.push(v);
      return `$${params.length}`;
    };

    const accountPh = bind(accountId); // $1, reused by every UNION branch

    // Tolerant date parse (ISO or YYYY-MM-DD); ignore unparseable values.
    const asDate = (v: string | undefined): Date | null => {
      if (!v) return null;
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? null : d;
    };

    // Period push-down — bound once, embedded into every branch's WHERE
    // (the big reducer; keeps the materialized union small for a date range).
    let periodClause = '';
    const mFrom = asDate(q.momentFrom);
    const mTo = asDate(q.momentTo);
    if (mFrom) periodClause += ` AND moment >= ${bind(mFrom)}`;
    if (mTo) periodClause += ` AND moment <= ${bind(mTo)}`;

    const branchSql = (kind: Kind): string => {
      const isCash = IS_CASH[kind];
      const hasExpenseItem = kind === 'paymentout' || kind === 'cashout';
      const income = DIRECTION[kind] === 'in' ? 'sum_minor' : '0::bigint';
      const expense = DIRECTION[kind] === 'out' ? 'sum_minor' : '0::bigint';
      const orgAccount = isCash ? 'NULL::uuid' : 'organization_account_id';
      const cashDesk = isCash ? 'cash_desk_id' : 'NULL::uuid';
      const agentAccount = isCash ? 'NULL::uuid' : 'agent_account_id';
      // «Статья расходов» / «Без закрывающих документов» exist only on the
      // expense docs (payments_out / cash_out); inbound docs project NULL/false.
      const expenseItem = hasExpenseItem ? 'expense_item' : 'NULL::text';
      const noClosing = hasExpenseItem ? 'no_closing_docs' : 'false';
      // «Входящий номер» / «Входящая дата» exist only on the incoming bank payment.
      const hasIncoming = kind === 'paymentin';
      const incNum = hasIncoming ? 'incoming_number' : 'NULL::text';
      const incDate = hasIncoming ? 'incoming_date' : 'NULL::timestamptz';
      // «Привязано» — total allocated to linked docs (correlated sum over the op table).
      const linked = `(SELECT COALESCE(SUM(amount_minor), 0) FROM ${OP_TABLE[kind]} WHERE ${OP_FK[kind]} = ${TABLE[kind]}.id)`;
      // kind/table are server constants (never user input) → safe to inline.
      return `SELECT '${kind}'::text AS kind, id, name, moment, updated_at,
          organization_id, ${orgAccount} AS org_account_id, ${cashDesk} AS cash_desk_id,
          agent_id, ${agentAccount} AS agent_account_id,
          owner_id, group_id, contract_id, project_id, sales_channel_id, shared,
          ${expenseItem} AS expense_item, ${noClosing} AS no_closing_docs,
          ${incNum} AS incoming_number, ${incDate} AS incoming_date,
          ${linked}::bigint AS linked_minor,
          ${income} AS income_minor, ${expense} AS expense_minor, sum_minor,
          currency, payment_purpose, description AS comment, printed, state, applicable
        FROM ${TABLE[kind]}
        WHERE account_id = ${accountPh}::uuid AND deleted_at IS NULL${periodClause}`;
    };

    const kinds = q.kind ? [q.kind] : [...KINDS];
    const union = kinds.map(branchSql).join('\nUNION ALL\n');

    // ---- outer filters (on the unioned alias `p`) ------------------------
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
    const inText = (col: string, s: string | undefined): void => {
      const vals = csv(s);
      if (vals.length) outer.push(`${col} IN (${vals.map((v) => bind(v)).join(', ')})`);
    };
    const boolEq = (col: string, v: 'true' | 'false' | undefined): void => {
      if (v) outer.push(`${col} = ${bind(v === 'true')}`);
    };

    if (q.search) {
      const s = bind(`%${q.search}%`);
      outer.push(`(p.name ILIKE ${s} OR p.payment_purpose ILIKE ${s} OR p.comment ILIKE ${s})`);
    }
    inUuid('p.organization_id', q.organizationIds);
    inUuid('p.agent_id', q.agentIds);
    inUuid('p.contract_id', q.contractIds);
    inUuid('p.project_id', q.projectIds);
    inUuid('p.org_account_id', q.organizationAccountIds);
    inUuid('p.owner_id', q.ownerIds);
    inUuid('p.group_id', q.groupIds);
    inUuid('p.sales_channel_id', q.salesChannelIds);
    inText('p.expense_item', q.expenseItems);
    // «Группа контрагента» / «Владелец контрагента» — filter on the agent's own
    // group/owner via a tenant-scoped subquery on counterparties.
    const agentGroupIds = csv(q.agentGroupIds);
    if (agentGroupIds.length)
      outer.push(
        `p.agent_id IN (SELECT id FROM counterparties WHERE account_id = ${accountPh}::uuid AND group_id IN (${agentGroupIds
          .map((id) => `${bind(id)}::uuid`)
          .join(', ')}))`,
      );
    const agentOwnerIds = csv(q.agentOwnerIds);
    if (agentOwnerIds.length)
      outer.push(
        `p.agent_id IN (SELECT id FROM counterparties WHERE account_id = ${accountPh}::uuid AND owner_id IN (${agentOwnerIds
          .map((id) => `${bind(id)}::uuid`)
          .join(', ')}))`,
      );
    if (q.state) outer.push(`p.state = ${bind(q.state)}`);
    boolEq('p.applicable', q.applicable);
    boolEq('p.printed', q.printed);
    boolEq('p.shared', q.shared);
    boolEq('p.no_closing_docs', q.noClosingDocs);
    // «Сумма платежа» — the doc's own sum (income XOR expense; one is always 0).
    if (q.sumFrom) outer.push(`(p.income_minor + p.expense_minor) >= ${bind(q.sumFrom)}::bigint`);
    if (q.sumTo) outer.push(`(p.income_minor + p.expense_minor) <= ${bind(q.sumTo)}::bigint`);
    const uFrom = asDate(q.updatedFrom);
    const uTo = asDate(q.updatedTo);
    if (uFrom) outer.push(`p.updated_at >= ${bind(uFrom)}`);
    if (uTo) outer.push(`p.updated_at <= ${bind(uTo)}`);
    const whereOuter = outer.length ? `WHERE ${outer.join(' AND ')}` : '';

    // Snapshot params before list-only LIMIT/OFFSET so count/totals (which do
    // not reference those placeholders) get exactly the params they use — pg
    // rejects a bind with more params than the statement references.
    const baseParams = [...params];
    const countSql = `SELECT COUNT(*)::int AS n FROM (${union}) p ${whereOuter}`;
    const totalsSql = `SELECT COALESCE(SUM(p.income_minor), 0)::bigint AS income,
        COALESCE(SUM(p.expense_minor), 0)::bigint AS expense,
        COALESCE(array_agg(DISTINCT p.currency), '{}'::text[]) AS currencies
      FROM (${union}) p ${whereOuter}`;

    const sortCol = SORT_COLUMN[q.sortBy];
    const dir = q.sortDir === 'asc' ? 'ASC' : 'DESC';
    const limitPh = bind(q.pageSize);
    const offsetPh = bind((q.page - 1) * q.pageSize);
    const listSql = `SELECT * FROM (${union}) p ${whereOuter}
      ORDER BY p.${sortCol} ${dir}, p.id DESC
      LIMIT ${limitPh} OFFSET ${offsetPh}`;
    const listParams = [...params];

    const [rows, countRows, totalsRows] = await Promise.all([
      client.$queryRawUnsafe<RawPaymentRow[]>(listSql, ...listParams),
      client.$queryRawUnsafe<Array<{ n: number }>>(countSql, ...baseParams),
      client.$queryRawUnsafe<Array<{ income: bigint; expense: bigint; currencies: string[] }>>(
        totalsSql,
        ...baseParams,
      ),
    ]);

    const items = await this.hydrate(rows);
    const total = countRows[0]?.n ?? 0;
    const totals = totalsRows[0] ?? { income: 0n, expense: 0n, currencies: [] };

    return {
      items,
      total,
      page: q.page,
      pageSize: q.pageSize,
      totals: {
        incomeMinor: totals.income.toString(),
        expenseMinor: totals.expense.toString(),
        currencies: totals.currencies ?? [],
      },
    };
  }

  /** Batch-resolve the FK names referenced by the page of rows. */
  private async hydrate(rows: RawPaymentRow[]): Promise<PaymentsListItem[]> {
    if (rows.length === 0) return [];
    const client = this.prisma.client;
    const uniq = (xs: Array<string | null>): string[] => [
      ...new Set(xs.filter((x): x is string => !!x)),
    ];

    const orgIds = uniq(rows.map((r) => r.organization_id));
    const agentIds = uniq(rows.map((r) => r.agent_id));
    const orgAccIds = uniq(rows.map((r) => r.org_account_id));
    const cashDeskIds = uniq(rows.map((r) => r.cash_desk_id));
    const agentAccIds = uniq(rows.map((r) => r.agent_account_id));
    // extra column-settings refs (Договор / Проект / Канал продаж / Владелец-отдел /
    // Владелец-сотрудник) — only queried when at least one row carries the id.
    const contractIds = uniq(rows.map((r) => r.contract_id));
    const projectIds = uniq(rows.map((r) => r.project_id));
    const channelIds = uniq(rows.map((r) => r.sales_channel_id));
    const groupIds = uniq(rows.map((r) => r.group_id));
    const ownerIds = uniq(rows.map((r) => r.owner_id));

    const [
      orgs,
      agents,
      orgAccs,
      cashDesks,
      agentAccs,
      contracts,
      projects,
      channels,
      groups,
      owners,
    ] = await Promise.all([
      client.organization.findMany({
        where: { id: { in: orgIds } },
        select: { id: true, name: true },
      }),
      client.counterparty.findMany({
        where: { id: { in: agentIds } },
        select: { id: true, name: true },
      }),
      orgAccIds.length
        ? client.organizationAccount.findMany({
            where: { id: { in: orgAccIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      cashDeskIds.length
        ? client.cashDesk.findMany({
            where: { id: { in: cashDeskIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      agentAccIds.length
        ? client.counterpartyAccount.findMany({
            where: { id: { in: agentAccIds } },
            select: { id: true, accountNumber: true },
          })
        : Promise.resolve([]),
      contractIds.length
        ? client.contract.findMany({
            where: { id: { in: contractIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      projectIds.length
        ? client.project.findMany({
            where: { id: { in: projectIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      channelIds.length
        ? client.salesChannel.findMany({
            where: { id: { in: channelIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      groupIds.length
        ? client.group.findMany({
            where: { id: { in: groupIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      ownerIds.length
        ? client.employee.findMany({
            where: { id: { in: ownerIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
    ]);

    const orgMap = new Map(orgs.map((o) => [o.id, o.name]));
    const agentMap = new Map(agents.map((a) => [a.id, a.name]));
    const orgAccMap = new Map(orgAccs.map((a) => [a.id, a.name]));
    const cashDeskMap = new Map(cashDesks.map((c) => [c.id, c.name]));
    const agentAccMap = new Map(agentAccs.map((a) => [a.id, a.accountNumber]));
    const contractMap = new Map(contracts.map((c) => [c.id, c.name]));
    const projectMap = new Map(projects.map((p) => [p.id, p.name]));
    const channelMap = new Map(channels.map((c) => [c.id, c.name]));
    const groupMap = new Map(groups.map((g) => [g.id, g.name]));
    const ownerMap = new Map(owners.map((e) => [e.id, e.name]));

    return rows.map((r) => {
      // «Счёт организации» — for bank payments the org bank account; for cash
      // documents the cash desk (касса). One column, two sources.
      const organizationAccountName = r.cash_desk_id
        ? (cashDeskMap.get(r.cash_desk_id) ?? null)
        : r.org_account_id
          ? (orgAccMap.get(r.org_account_id) ?? null)
          : null;
      const orgName = orgMap.get(r.organization_id);
      const agentName = agentMap.get(r.agent_id);
      // «Не привязано» = the doc's own sum − what's already allocated, floored at 0.
      const docSum = r.sum_minor ?? r.income_minor + r.expense_minor;
      const linked = r.linked_minor ?? 0n;
      const notLinked = docSum > linked ? docSum - linked : 0n;
      return {
        kind: r.kind,
        id: r.id,
        name: r.name,
        moment: r.moment.toISOString(),
        organization: orgName != null ? { id: r.organization_id, name: orgName } : null,
        organizationAccountName,
        agent: agentName != null ? { id: r.agent_id, name: agentName } : null,
        agentAccountName: r.agent_account_id ? (agentAccMap.get(r.agent_account_id) ?? null) : null,
        incomeMinor: r.income_minor.toString(),
        expenseMinor: r.expense_minor.toString(),
        currency: r.currency,
        paymentPurpose: r.payment_purpose,
        comment: r.comment,
        sent: null,
        printed: r.printed,
        state: r.state,
        applicable: r.applicable,
        contractName: r.contract_id ? (contractMap.get(r.contract_id) ?? null) : null,
        projectName: r.project_id ? (projectMap.get(r.project_id) ?? null) : null,
        salesChannelName: r.sales_channel_id ? (channelMap.get(r.sales_channel_id) ?? null) : null,
        ownerName: r.owner_id ? (ownerMap.get(r.owner_id) ?? null) : null,
        groupName: r.group_id ? (groupMap.get(r.group_id) ?? null) : null,
        expenseItem: r.expense_item,
        shared: r.shared,
        incomingNumber: r.incoming_number,
        incomingDate: r.incoming_date ? r.incoming_date.toISOString() : null,
        linkedMinor: linked.toString(),
        notLinkedMinor: notLinked.toString(),
        updatedAt: r.updated_at.toISOString(),
      };
    });
  }

  private parseQuery(raw: unknown): PaymentsListQuery {
    const r = ListQuerySchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }
}
