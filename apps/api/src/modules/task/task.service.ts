import type { Prisma } from '@moysklad/db';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { NotificationService } from '../notification/notification.service.js';
import { mapVersionedUpdateError } from '../shared/optimistic-lock.js';
import {
  type CreateTaskInput,
  CreateTaskSchema,
  TaskFilterSchema,
  TaskStatus,
  type TransitionStatusInput,
  TransitionStatusSchema,
  type UpdateTaskInput,
  UpdateTaskSchema,
} from './task.schema.js';

const TERMINAL_STATUSES = new Set(['done', 'cancelled']);

@Injectable()
export class TaskService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(NotificationService) private readonly notifications: NotificationService,
  ) {}

  async list(accountId: string, currentUserId: string, rawFilter: unknown) {
    const filter = TaskFilterSchema.parse(rawFilter);
    const teamAssigneeIds = await this.resolveTeamAssigneeIds(accountId, currentUserId, filter);
    const where = this.buildListWhere(accountId, currentUserId, filter, teamAssigneeIds);

    const rows = await this.prisma.client.task.findMany({
      where,
      orderBy: this.buildOrderBy(filter.sortBy, filter.sortDir),
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      include: {
        author: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true } },
        state: { select: { id: true, name: true, color: true } },
      },
    });

    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    const total = await this.prisma.client.task.count({ where });
    return { items, nextCursor, total };
  }

  /** Resolve the assignee-id set for the `ownership=team` («Командные») view.
   *  "Team" = everyone in MY department — the same OWN_GROUP scope the
   *  permission system already uses ("my department's records", see
   *  Employee.department). Only computed when ownership=team and the caller
   *  did not pin an explicit assigneeId. If I have no department on record,
   *  fall back to just my own tasks (the safe non-widening subset) rather
   *  than leaking the whole account. Returns undefined when not applicable
   *  (so buildListWhere keeps its `mine`/`all` behaviour untouched).
   *  NOTE: exact moysklad «Командные» semantics are not capture-grounded
   *  (no tasks filter capture) — department-membership is the best-grounded
   *  interpretation; confirm in Phase-2 QA. */
  private async resolveTeamAssigneeIds(
    accountId: string,
    currentUserId: string,
    filter: import('./task.schema.js').TaskFilterInput,
  ): Promise<string[] | undefined> {
    if (filter.ownership !== 'team' || filter.assigneeId) return undefined;
    const me = await this.prisma.client.employee.findFirst({
      where: { id: currentUserId, accountId },
      select: { department: true },
    });
    if (!me?.department) return [currentUserId];
    const mates = await this.prisma.client.employee.findMany({
      where: { accountId, department: me.department },
      select: { id: true },
    });
    // Guard against an empty IN () (Prisma turns [] into "false") — at minimum
    // I am in my own department, but be defensive if the row was just removed.
    return mates.length ? mates.map((m) => m.id) : [currentUserId];
  }

  /** Compose Prisma where-clause from a validated filter. Always anchors
   *  on accountId (tenant guard). `ownership=mine` → my tasks; `ownership=team`
   *  → my department's tasks (via `teamAssigneeIds`, resolved by
   *  resolveTeamAssigneeIds); both only when the caller did not pin an
   *  explicit assigneeId. Period→createdAt range; due range→dueAt; updated
   *  period→updatedAt; archived defaults to false unless explicit. */
  private buildListWhere(
    accountId: string,
    currentUserId: string,
    filter: import('./task.schema.js').TaskFilterInput,
    teamAssigneeIds?: string[],
  ): Prisma.TaskWhereInput {
    return {
      accountId,
      ...(filter.assigneeId
        ? { assigneeId: filter.assigneeId }
        : filter.ownership === 'mine'
          ? { assigneeId: currentUserId }
          : filter.ownership === 'team' && teamAssigneeIds
            ? { assigneeId: { in: teamAssigneeIds } }
            : {}),
      ...(filter.authorId ? { authorId: filter.authorId } : {}),
      ...(filter.typeId ? { typeId: filter.typeId } : {}),
      ...(filter.stateId ? { stateId: filter.stateId } : {}),
      ...(filter.agentId ? { agentId: filter.agentId } : {}),
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.priority ? { priority: filter.priority } : {}),
      ...(filter.archived !== undefined ? { archived: filter.archived } : { archived: false }),
      ...(filter.entity ? { entity: filter.entity } : {}),
      ...(filter.entityId ? { entityId: filter.entityId } : {}),
      // dueAt: combine dueBefore (legacy) with new dueFrom/dueTo range
      ...(filter.dueBefore || filter.dueFrom || filter.dueTo
        ? {
            dueAt: {
              ...(filter.dueFrom ? { gte: filter.dueFrom } : {}),
              ...(filter.dueTo
                ? { lte: filter.dueTo }
                : filter.dueBefore
                  ? { lte: filter.dueBefore }
                  : {}),
            },
          }
        : {}),
      ...(filter.dateFrom || filter.dateTo
        ? {
            createdAt: {
              ...(filter.dateFrom ? { gte: filter.dateFrom } : {}),
              ...(filter.dateTo ? { lte: filter.dateTo } : {}),
            },
          }
        : {}),
      ...(filter.updatedFrom || filter.updatedTo
        ? {
            updatedAt: {
              ...(filter.updatedFrom ? { gte: filter.updatedFrom } : {}),
              ...(filter.updatedTo ? { lte: filter.updatedTo } : {}),
            },
          }
        : {}),
      ...(filter.search
        ? {
            OR: [
              { title: { contains: filter.search, mode: 'insensitive' } },
              { description: { contains: filter.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }

  /** Translate sortBy into Prisma orderBy — `agent` is a relational sort
   *  (Counterparty.name) so it needs the special-case shape. */
  private buildOrderBy(
    sortBy: import('./task.schema.js').TaskFilterInput['sortBy'],
    sortDir: 'asc' | 'desc',
  ): Prisma.TaskOrderByWithRelationInput {
    if (sortBy === 'agent') return { agent: { name: sortDir } };
    return { [sortBy]: sortDir } as Prisma.TaskOrderByWithRelationInput;
  }

  async findById(accountId: string, id: string) {
    const row = await this.prisma.client.task.findFirst({
      where: { id, accountId },
      include: {
        author: { select: { id: true, name: true, email: true } },
        assignee: { select: { id: true, name: true, email: true } },
        state: { select: { id: true, name: true, color: true } },
      },
    });
    if (!row) throw new NotFoundException(`Task ${id} not found`);
    return row;
  }

  /**
   * Active-task count for the current user — drives the red number
   * badge on the navbar Задачи tab. "Active" = assigned to me, not in
   * a terminal status (done/cancelled), not archived. The narrower
   * dueAt-based "overdue" count we render only when > 0 so the badge
   * reflects what the user actually needs to act on.
   */
  async badgeCount(accountId: string, userId: string): Promise<number> {
    return this.prisma.client.task.count({
      where: {
        accountId,
        assigneeId: userId,
        archived: false,
        status: { notIn: Array.from(TERMINAL_STATUSES) },
      },
    });
  }

  async create(accountId: string, authorId: string, raw: unknown) {
    const parsed = this.parseCreate(raw);
    await this.validateAssignee(accountId, parsed.assigneeId ?? null);
    await this.validateTaskType(accountId, parsed.typeId ?? null);
    await this.validateState(accountId, parsed.stateId ?? null);
    await this.validateAgent(accountId, parsed.agentId ?? null);

    const task = await this.prisma.client.task.create({
      data: {
        accountId,
        authorId,
        assigneeId: parsed.assigneeId ?? null,
        typeId: parsed.typeId ?? null,
        stateId: parsed.stateId ?? null,
        agentId: parsed.agentId ?? null,
        title: parsed.title,
        description: parsed.description ?? null,
        entity: parsed.entity ?? null,
        entityId: parsed.entityId ?? null,
        status: parsed.status,
        // Keep the `done` mirror in sync at creation too (a task created already
        // «Выполнена» must carry done=true, not just status='done').
        done: parsed.status === 'done',
        priority: parsed.priority,
        dueAt: parsed.dueAt ?? null,
      },
      // Return the `state` relation so the create response matches list()/findById()
      // — the FE can render the «Тип задачи» coloured badge without an extra refetch.
      include: { state: { select: { id: true, name: true, color: true } } },
    });

    // Emit notification non-blocking — failure must never roll back the task
    if (parsed.assigneeId && parsed.assigneeId !== authorId) {
      this.notifications
        .emit(
          accountId,
          parsed.assigneeId,
          'task_assigned',
          parsed.title,
          parsed.description ?? null,
          'Task',
          task.id,
        )
        .catch(() => {});
    }

    await this.logAudit(accountId, authorId, 'create', task.id, null);

    return task;
  }

  async update(accountId: string, userId: string, id: string, raw: unknown) {
    const parsed = this.parseUpdate(raw);
    const before = await this.findById(accountId, id);
    await this.validateAssignee(accountId, parsed.assigneeId ?? null);
    if (parsed.typeId !== undefined) {
      await this.validateTaskType(accountId, parsed.typeId ?? null);
    }
    if (parsed.stateId !== undefined) {
      await this.validateState(accountId, parsed.stateId ?? null);
    }

    const data: Prisma.TaskUpdateInput = {};
    if (parsed.title !== undefined) data.title = parsed.title;
    if (parsed.description !== undefined) data.description = parsed.description;
    if (parsed.status !== undefined) data.status = parsed.status;
    if (parsed.priority !== undefined) data.priority = parsed.priority;
    if (parsed.dueAt !== undefined) data.dueAt = parsed.dueAt;
    if (parsed.entity !== undefined) data.entity = parsed.entity;
    if (parsed.entityId !== undefined) data.entityId = parsed.entityId;

    if (parsed.assigneeId !== undefined) {
      if (parsed.assigneeId === null) {
        data.assignee = { disconnect: true };
      } else {
        data.assignee = { connect: { id: parsed.assigneeId } };
      }
    }

    if (parsed.typeId !== undefined) {
      if (parsed.typeId === null) {
        data.type = { disconnect: true };
      } else {
        data.type = { connect: { id: parsed.typeId } };
      }
    }

    if (parsed.stateId !== undefined) {
      if (parsed.stateId === null) {
        data.state = { disconnect: true };
      } else {
        data.state = { connect: { id: parsed.stateId } };
      }
    }

    try {
      // Optimistic lock: the version filter matches only if no concurrent write
      // bumped the version since the form loaded. findById above proves the row
      // exists, so a P2025 here is a concurrency conflict, not a missing row.
      const after = await this.prisma.client.task.update({
        where: { id, accountId, version: parsed.version },
        data: { ...data, version: { increment: 1 } },
      });
      const diff = this.diff(
        before as unknown as Record<string, unknown>,
        after as unknown as Record<string, unknown>,
      );
      if (Object.keys(diff).length) {
        await this.logAudit(accountId, userId, 'update', id, diff);
      }
      return after;
    } catch (e) {
      mapVersionedUpdateError(e, 'Task');
      throw e;
    }
  }

  async transition(accountId: string, userId: string, id: string, raw: unknown) {
    const parsed = this.parseTransition(raw);
    const task = await this.findById(accountId, id);

    const entering = parsed.status;
    const isEnteringTerminal = TERMINAL_STATUSES.has(entering);
    const wasTerminal = TERMINAL_STATUSES.has(task.status);

    // Determine completedAt: set when entering terminal, clear when leaving
    let completedAt: Date | null;
    if (isEnteringTerminal) {
      completedAt = parsed.completedAtOverride ?? new Date();
    } else if (wasTerminal && !isEnteringTerminal) {
      completedAt = null;
    } else {
      completedAt = task.completedAt ?? null;
    }

    const updated = await this.prisma.client.task.update({
      where: { id, accountId },
      data: {
        status: entering,
        completedAt,
        // `done` is the documented mirror of (status === 'done'); the transition
        // writer previously left it stale, so completing a task never flipped the
        // boolean that reports (and the card's «Выполненные» filter) rely on.
        done: entering === 'done',
      },
    });
    // Diff shape mirrors the 26 other FSM-transition writers (cash-in.service.ts:499
    // et al.): `from: { before, after }`. The flat `{ from, to }` it used before was
    // filtered out by the History timeline's object-shape guard (each change must be
    // an object), so the Task transition row rendered its headline but NO status diff.
    // With the object shape, useAuditLabels.translateValue maps the before/after
    // through the grounded `states.task` vocabulary («Открыта → В работе»).
    await this.logAudit(accountId, userId, 'transition', id, {
      from: { before: task.status, after: entering },
    });
    return updated;
  }

  async archive(accountId: string, userId: string, id: string) {
    await this.findById(accountId, id);
    const updated = await this.prisma.client.task.update({
      where: { id, accountId },
      data: { archived: true },
    });
    await this.logAudit(accountId, userId, 'archived', id, null);
    return updated;
  }

  async restore(accountId: string, userId: string, id: string) {
    await this.findById(accountId, id);
    const updated = await this.prisma.client.task.update({
      where: { id, accountId },
      data: { archived: false },
    });
    await this.logAudit(accountId, userId, 'restored', id, null);
    return updated;
  }

  async delete(accountId: string, userId: string, id: string) {
    await this.findById(accountId, id);
    await this.prisma.client.task.delete({ where: { id, accountId } });
    await this.logAudit(accountId, userId, 'delete', id, null);
    return { ok: true };
  }

  // --- private helpers ---

  private async validateAssignee(accountId: string, assigneeId: string | null) {
    if (!assigneeId) return;
    const emp = await this.prisma.client.employee.findFirst({
      where: { id: assigneeId, accountId },
      select: { id: true },
    });
    if (!emp) throw new BadRequestException('Bajaruvchi topilmadi');
  }

  private async validateTaskType(accountId: string, typeId: string | null) {
    if (!typeId) return;
    const row = await this.prisma.client.taskType.findFirst({
      where: { id: typeId, accountId },
      select: { id: true },
    });
    if (!row) throw new BadRequestException('Vazifa turi topilmadi');
  }

  /** Tenant guard for «Тип задачи» — the state must belong to this account and
   *  be a task state (entityType="task"), mirroring moysklad's task.state. */
  private async validateState(accountId: string, stateId: string | null) {
    if (!stateId) return;
    const row = await this.prisma.client.state.findFirst({
      where: { id: stateId, accountId, entityType: 'task' },
      select: { id: true },
    });
    if (!row) throw new BadRequestException('Vazifa turi topilmadi');
  }

  /** Tenant guard for the «Контрагент» link — the agent must belong to this account. */
  private async validateAgent(accountId: string, agentId: string | null) {
    if (!agentId) return;
    const row = await this.prisma.client.counterparty.findFirst({
      where: { id: agentId, accountId },
      select: { id: true },
    });
    if (!row) throw new BadRequestException('Kontragent topilmadi');
  }

  private parseCreate(raw: unknown): CreateTaskInput {
    const r = CreateTaskSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private parseUpdate(raw: unknown): UpdateTaskInput {
    const r = UpdateTaskSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private parseTransition(raw: unknown): TransitionStatusInput {
    const r = TransitionStatusSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private diff(
    before: Record<string, unknown>,
    after: Record<string, unknown>,
  ): Record<string, { before: unknown; after: unknown }> {
    const d: Record<string, { before: unknown; after: unknown }> = {};
    for (const k of Object.keys(after)) {
      if (k === 'createdAt' || k === 'updatedAt' || k === 'version') continue;
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
        entity: 'Task',
        entityId,
        action,
        fieldChanges: fieldChanges as Prisma.InputJsonValue | undefined,
      },
    });
  }
}

// Re-export for use in controller (avoid circular import)
export { TaskStatus };
