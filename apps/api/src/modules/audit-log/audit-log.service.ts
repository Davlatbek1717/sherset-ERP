import type { Prisma } from '@moysklad/db';
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AdminAuditLogFilterSchema, AuditLogFilterSchema } from './audit-log.schema.js';

/**
 * Read-only service for the AuditLog table. Every domain service writes
 * entries directly via `tx.auditLog.create`; this service exposes a
 * cursor-paginated read path keyed on (entity, entityId).
 */
@Injectable()
export class AuditLogService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string, rawFilter: unknown) {
    const filter = AuditLogFilterSchema.parse(rawFilter);

    const items = await this.prisma.client.auditLog.findMany({
      where: {
        accountId,
        entity: filter.entity,
        entityId: filter.entityId,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { at: 'desc' },
      take: filter.limit + 1,
      ...(filter.cursor
        ? {
            skip: 1,
            cursor: { id: filter.cursor },
          }
        : {}),
    });

    const hasMore = items.length > filter.limit;
    const rows = hasMore ? items.slice(0, -1) : items;

    return {
      items: rows,
      nextCursor: hasMore ? rows[rows.length - 1]?.id : undefined,
      total: rows.length,
    };
  }

  /**
   * Admin-side broad browse — combines entity / user / action / date-range
   * filters. Used by the /settings/audit-log admin page (Sprint 11.8).
   * Field-level diff (`fieldChanges`) is included so the UI can surface
   * what changed without a separate fetch.
   */
  async adminList(accountId: string, rawFilter: unknown) {
    const filter = AdminAuditLogFilterSchema.parse(rawFilter);

    const where: Prisma.AuditLogWhereInput = {
      accountId,
      ...(filter.entity ? { entity: filter.entity } : {}),
      ...(filter.entityId ? { entityId: filter.entityId } : {}),
      ...(filter.userId ? { userId: filter.userId } : {}),
      // Employee activity feed: acts-by OR done-to (see schema comment).
      // Wrapped in AND so it can't collide with the `search` OR below.
      ...(filter.aboutEmployee
        ? {
            AND: [
              {
                OR: [
                  { userId: filter.aboutEmployee },
                  { entity: 'employee', entityId: filter.aboutEmployee },
                ],
              },
            ],
          }
        : {}),
      ...(filter.action ? { action: filter.action } : {}),
      ...(filter.dateFrom || filter.dateTo
        ? {
            at: {
              ...(filter.dateFrom ? { gte: filter.dateFrom } : {}),
              ...(filter.dateTo ? { lte: filter.dateTo } : {}),
            },
          }
        : {}),
      ...(filter.search
        ? {
            OR: [
              { entity: { contains: filter.search, mode: 'insensitive' } },
              { action: { contains: filter.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const items = await this.prisma.client.auditLog.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { at: 'desc' },
      take: filter.limit + 1,
      ...(filter.cursor
        ? {
            skip: 1,
            cursor: { id: filter.cursor },
          }
        : {}),
    });

    const hasMore = items.length > filter.limit;
    const rows = hasMore ? items.slice(0, -1) : items;
    // Total count is expensive on the audit-log table — defer to a count(*)
    // only when the user explicitly asks (no cursor). Cursor-paginated
    // results report the visible-page count instead.
    const total = filter.cursor ? rows.length : await this.prisma.client.auditLog.count({ where });

    return {
      items: rows,
      nextCursor: hasMore ? rows[rows.length - 1]?.id : undefined,
      total,
    };
  }
}
