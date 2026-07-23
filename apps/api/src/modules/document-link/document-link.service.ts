import { Prisma } from '@moysklad/db';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  CreateDocumentLinkSchema,
  ListDocumentLinksSchema,
  SearchDocumentsSchema,
} from './document-link.schema.js';

/**
 * The doc types the «Привязка документа» modal can search+link. Each entry maps a
 * PascalCase type key to its table + whether it has an `agent_id` and which store
 * columns it carries (Move has source/target, others a single store_id).
 */
const SEARCHABLE_DOCS: Array<{
  type: string;
  table: string;
  hasAgent: boolean;
  /** Table carries a custom «Статус» (status_id → states). invoices_in/moves don't. */
  hasStatus: boolean;
  storeFrom: string | null;
  storeTo: string | null;
}> = [
  {
    type: 'PurchaseOrder',
    table: 'purchase_orders',
    hasAgent: true,
    hasStatus: true,
    storeFrom: 'store_id',
    storeTo: null,
  },
  {
    type: 'Supply',
    table: 'supplies',
    hasAgent: true,
    hasStatus: true,
    storeFrom: 'store_id',
    storeTo: null,
  },
  {
    type: 'PurchaseReturn',
    table: 'purchase_returns',
    hasAgent: true,
    hasStatus: true,
    storeFrom: 'store_id',
    storeTo: null,
  },
  {
    type: 'InvoiceIn',
    table: 'invoices_in',
    hasAgent: true,
    hasStatus: false,
    storeFrom: 'store_id',
    storeTo: null,
  },
  {
    type: 'Demand',
    table: 'demands',
    hasAgent: true,
    hasStatus: true,
    storeFrom: 'store_id',
    storeTo: null,
  },
  {
    type: 'CustomerOrder',
    table: 'customer_orders',
    hasAgent: true,
    hasStatus: true,
    storeFrom: 'store_id',
    storeTo: null,
  },
  {
    type: 'InvoiceOut',
    table: 'invoices_out',
    hasAgent: true,
    hasStatus: true,
    storeFrom: 'store_id',
    storeTo: null,
  },
  {
    type: 'SalesReturn',
    table: 'sales_returns',
    hasAgent: true,
    hasStatus: true,
    storeFrom: 'store_id',
    storeTo: null,
  },
  {
    type: 'Move',
    table: 'moves',
    hasAgent: false,
    hasStatus: false,
    storeFrom: 'source_store_id',
    storeTo: 'destination_store_id',
  },
];

/**
 * moysklad «Привязать документ» — manual document associations shown in the
 * «Связанные документы» tab (the auto-linked FK chain is computed per doc in each
 * module's `findRelated`). A link is bidirectional: querying by either endpoint
 * returns the OTHER endpoint's snapshot, so both documents show the association.
 */
@Injectable()
export class DocumentLinkService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** All manual links touching (entityType, entityId), resolved to the OTHER side. */
  async listFor(accountId: string, rawQuery: unknown) {
    const { entityType, entityId } = ListDocumentLinksSchema.parse(rawQuery);
    const rows = await this.prisma.client.documentLink.findMany({
      where: {
        accountId,
        OR: [
          { sourceType: entityType, sourceId: entityId },
          { targetType: entityType, targetId: entityId },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });
    const others = rows.map((r) => {
      // Return the endpoint that is NOT the queried document.
      const isSource = r.sourceType === entityType && r.sourceId === entityId;
      const other = isSource
        ? {
            type: r.targetType,
            id: r.targetId,
            name: r.targetName,
            moment: r.targetMoment,
            sumMinor: r.targetSumMinor,
            state: r.targetState,
          }
        : {
            type: r.sourceType,
            id: r.sourceId,
            name: r.sourceName,
            moment: r.sourceMoment,
            sumMinor: r.sourceSumMinor,
            state: r.sourceState,
          };
      return {
        linkId: r.id,
        type: other.type,
        id: other.id,
        name: other.name,
        moment: other.moment.toISOString(),
        sumMinor: other.sumMinor.toString(),
        state: other.state,
        statusName: null as string | null,
        statusColor: null as string | null,
      };
    });

    // moysklad cards carry the LIVE «Проведено» check + custom «Статус» strip of the
    // linked doc (e.g. the orange «Киритилди» bar). The snapshot's state can go
    // stale (posted after linking) — refresh both from the doc tables per type.
    const byType = new Map<string, string[]>();
    for (const o of others) {
      const list = byType.get(o.type) ?? [];
      list.push(o.id);
      byType.set(o.type, list);
    }
    for (const [type, ids] of byType) {
      const meta = SEARCHABLE_DOCS.find((d) => d.type === type);
      if (!meta) continue;
      const statusExpr = meta.hasStatus ? Prisma.raw('d.status_id') : Prisma.raw('NULL::uuid');
      const live = await this.prisma.client.$queryRaw<
        Array<{
          id: string;
          state: string;
          status_name: string | null;
          status_color: string | null;
        }>
      >(Prisma.sql`
        SELECT d.id, d.state, s.name AS status_name, s.color AS status_color
        FROM ${Prisma.raw(meta.table)} d
        LEFT JOIN states s ON s.id = ${statusExpr}
        WHERE d.account_id = ${accountId}::uuid AND d.id = ANY(${ids}::uuid[])`);
      const map = new Map(live.map((l) => [l.id, l]));
      for (const o of others) {
        const hit = o.type === type ? map.get(o.id) : undefined;
        if (hit) {
          o.state = hit.state;
          o.statusName = hit.status_name;
          o.statusColor = hit.status_color;
        }
      }
    }
    return others;
  }

  async create(accountId: string, raw: unknown) {
    const p = CreateDocumentLinkSchema.parse(raw);
    if (p.sourceType === p.targetType && p.sourceId === p.targetId) {
      throw new BadRequestException('Hujjatni o‘ziga bog‘lab bo‘lmaydi');
    }
    try {
      const link = await this.prisma.client.documentLink.create({
        data: {
          accountId,
          sourceType: p.sourceType,
          sourceId: p.sourceId,
          sourceName: p.sourceName,
          sourceMoment: new Date(p.sourceMoment),
          sourceSumMinor: BigInt(p.sourceSumMinor),
          sourceState: p.sourceState,
          targetType: p.targetType,
          targetId: p.targetId,
          targetName: p.targetName,
          targetMoment: new Date(p.targetMoment),
          targetSumMinor: BigInt(p.targetSumMinor),
          targetState: p.targetState,
        },
        select: { id: true },
      });
      return { id: link.id };
    } catch (e) {
      // Unique(account, source, target) → the pair is already linked.
      if ((e as { code?: string }).code === 'P2002') {
        throw new BadRequestException('Hujjatlar allaqachon bog‘langan');
      }
      throw e;
    }
  }

  async remove(accountId: string, id: string) {
    const res = await this.prisma.client.documentLink.deleteMany({ where: { id, accountId } });
    if (res.count === 0) throw new NotFoundException(`Document link ${id} not found`);
    return { deleted: true };
  }

  /**
   * «Привязка документа» modal — unified cross-document search. UNIONs the doc
   * tables (excluding self), applies the moysklad filters (number/period/agent/
   * org/type/status/stores), resolves org+agent+store names, paginates.
   */
  async search(accountId: string, rawQuery: unknown) {
    const q = SearchDocumentsSchema.parse(rawQuery);
    const types = q.types.length ? new Set(q.types) : null;

    const branches: Prisma.Sql[] = [];
    for (const d of SEARCHABLE_DOCS) {
      if (types && !types.has(d.type)) continue;
      // agent filter present but this table has no agent → cannot match.
      if (q.agentIds.length && !d.hasAgent) continue;
      // «На склад» filter present but this table has no target store → cannot match.
      if (q.storeToId && !d.storeTo) continue;

      const where: Prisma.Sql[] = [
        Prisma.sql`account_id = ${accountId}::uuid`,
        Prisma.sql`deleted_at IS NULL`,
      ];
      if (q.number) where.push(Prisma.sql`name ILIKE ${`%${q.number}%`}`);
      if (q.organizationIds.length)
        where.push(Prisma.sql`organization_id = ANY(${q.organizationIds}::uuid[])`);
      if (q.state) where.push(Prisma.sql`state = ${q.state}`);
      if (q.dateFrom) where.push(Prisma.sql`moment >= ${new Date(q.dateFrom)}`);
      if (q.dateTo) where.push(Prisma.sql`moment <= ${new Date(q.dateTo)}`);
      if (q.agentIds.length && d.hasAgent)
        where.push(Prisma.sql`agent_id = ANY(${q.agentIds}::uuid[])`);
      if (q.storeFromId)
        where.push(Prisma.sql`${Prisma.raw(d.storeFrom ?? 'store_id')} = ${q.storeFromId}::uuid`);
      if (q.storeToId && d.storeTo)
        where.push(Prisma.sql`${Prisma.raw(d.storeTo)} = ${q.storeToId}::uuid`);
      // exclude self
      if (q.selfType === d.type && q.selfId) where.push(Prisma.sql`id <> ${q.selfId}::uuid`);

      const agentExpr = d.hasAgent ? Prisma.raw('agent_id') : Prisma.raw('NULL::uuid');
      const storeFromExpr = Prisma.raw(d.storeFrom ?? 'NULL::uuid');
      const storeToExpr = Prisma.raw(d.storeTo ?? 'NULL::uuid');
      const statusExpr = d.hasStatus ? Prisma.raw('status_id') : Prisma.raw('NULL::uuid');
      branches.push(
        Prisma.sql`
          SELECT ${d.type} AS type_key, id, name, moment, organization_id,
                 ${agentExpr} AS agent_id, state, sum_minor,
                 ${statusExpr} AS status_id,
                 ${storeFromExpr} AS store_from, ${storeToExpr} AS store_to
          FROM ${Prisma.raw(d.table)}
          WHERE ${Prisma.join(where, ' AND ')}`,
      );
    }

    if (branches.length === 0) return { items: [], total: 0, page: q.page, limit: q.limit };

    const union = Prisma.join(branches, ' UNION ALL ');
    const offset = (q.page - 1) * q.limit;

    const [rows, countRows] = await Promise.all([
      this.prisma.client.$queryRaw<
        Array<{
          type_key: string;
          id: string;
          name: string;
          moment: Date;
          state: string;
          sum_minor: bigint;
          org_name: string | null;
          agent_name: string | null;
          status_name: string | null;
          status_color: string | null;
          store_from_name: string | null;
          store_to_name: string | null;
        }>
      >(Prisma.sql`
        SELECT u.type_key, u.id, u.name, u.moment, u.state, u.sum_minor,
               o.name AS org_name, c.name AS agent_name,
               stt.name AS status_name, stt.color AS status_color,
               sf.name AS store_from_name, st.name AS store_to_name
        FROM (${union}) u
        LEFT JOIN organizations o ON o.id = u.organization_id
        LEFT JOIN counterparties c ON c.id = u.agent_id
        LEFT JOIN states stt ON stt.id = u.status_id
        LEFT JOIN stores sf ON sf.id = u.store_from
        LEFT JOIN stores st ON st.id = u.store_to
        ORDER BY u.moment DESC
        LIMIT ${q.limit} OFFSET ${offset}`),
      this.prisma.client.$queryRaw<Array<{ n: bigint }>>(
        Prisma.sql`SELECT count(*)::bigint AS n FROM (${union}) u`,
      ),
    ]);

    return {
      items: rows.map((r) => ({
        type: r.type_key,
        id: r.id,
        name: r.name,
        moment: r.moment.toISOString(),
        state: r.state,
        sumMinor: r.sum_minor.toString(),
        organizationName: r.org_name,
        agentName: r.agent_name,
        statusName: r.status_name,
        statusColor: r.status_color,
        storeFromName: r.store_from_name,
        storeToName: r.store_to_name,
      })),
      total: Number(countRows[0]?.n ?? 0n),
      page: q.page,
      limit: q.limit,
    };
  }
}
