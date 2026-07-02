import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { HrTemplateSchedulerService } from '../hr-scheduler/hr-template-scheduler.service.js';
import type {
  CreateHrTaskTemplateInput,
  HrTaskTemplateFilter,
  ScheduleConfig,
  UpdateHrTaskTemplateInput,
} from './hr-task-template.schema.js';

function toBigIntOrNull(v: string | number | bigint | null | undefined): bigint | null {
  if (v === null || v === undefined || v === '') return null;
  return typeof v === 'bigint' ? v : BigInt(v);
}

@Injectable()
export class HrTaskTemplateService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(HrTemplateSchedulerService)
    private readonly scheduler: HrTemplateSchedulerService,
  ) {}

  private syncCronRegistration(tpl: {
    id: string;
    accountId: string;
    triggerType: string;
    isActive: boolean;
    scheduleConfig: unknown;
  }): void {
    if (tpl.triggerType === 'scheduled' && tpl.isActive) {
      this.scheduler.register(tpl.id, tpl.accountId, tpl.scheduleConfig as ScheduleConfig | null);
    } else {
      this.scheduler.unregister(tpl.id);
    }
  }

  async list(accountId: string, filter: HrTaskTemplateFilter) {
    const where: Record<string, unknown> = { accountId };
    if (filter.search) {
      where.OR = [
        { title: { contains: filter.search, mode: 'insensitive' } },
        { description: { contains: filter.search, mode: 'insensitive' } },
      ];
    }
    if (filter.triggerType) where.triggerType = filter.triggerType;
    if (filter.priority) where.priority = filter.priority;
    if (filter.department) where.department = filter.department;
    if (filter.isActive !== undefined) where.isActive = filter.isActive;
    if (filter.checkerId) where.checkerId = filter.checkerId;

    const [rows, total] = await this.prisma.client.$transaction([
      this.prisma.client.hrTaskTemplate.findMany({
        where,
        orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
        skip: (filter.page - 1) * filter.limit,
        take: filter.limit,
        include: {
          assignedEmployee: { select: { id: true, name: true } },
          checker: { select: { id: true, name: true } },
          dependsOn: { select: { id: true, title: true } },
          _count: { select: { logs: true } },
        },
      }),
      this.prisma.client.hrTaskTemplate.count({ where }),
    ]);

    return { rows, total, page: filter.page, limit: filter.limit };
  }

  async findOne(accountId: string, id: string) {
    const tpl = await this.prisma.client.hrTaskTemplate.findFirst({
      where: { id, accountId },
      include: {
        assignedEmployee: { select: { id: true, name: true } },
        checker: { select: { id: true, name: true } },
        dependsOn: { select: { id: true, title: true } },
      },
    });
    if (!tpl) throw new NotFoundException('Vazifa shabloni topilmadi');
    return tpl;
  }

  async create(accountId: string, input: CreateHrTaskTemplateInput) {
    // Validate FK references all belong to this account
    await this.validateAssignee(accountId, input.assignedEmployeeId);
    await this.validateChecker(accountId, input.checkerId);
    await this.validateDependsOn(accountId, input.dependsOnId);

    const created = await this.prisma.client.hrTaskTemplate.create({
      data: {
        accountId,
        title: input.title,
        description: input.description ?? null,
        assignedEmployeeId: input.assignedEmployeeId ?? null,
        assignedRole: input.assignedRole ?? null,
        department: input.department ?? null,
        priority: input.priority,
        triggerType: input.triggerType,
        scheduleConfig: input.scheduleConfig ?? undefined,
        eventConfig: input.eventConfig ?? undefined,
        responseType: input.responseType,
        deadlineMinutes: input.deadlineMinutes ?? null,
        rewardMinor: toBigIntOrNull(input.rewardMinor),
        fineMinor: toBigIntOrNull(input.fineMinor),
        checkerId: input.checkerId ?? null,
        dependsOnId: input.dependsOnId ?? null,
        isActive: input.isActive,
      },
    });
    this.syncCronRegistration(created);
    return created;
  }

  async update(accountId: string, id: string, input: UpdateHrTaskTemplateInput) {
    const existing = await this.findOne(accountId, id);
    // Optimistic concurrency — if the client supplied the updatedAt it saw,
    // refuse the write when the row has moved on. Prevents lost-update when
    // two admins edit the same template in different tabs.
    if (input.expectedUpdatedAt) {
      const seen = input.expectedUpdatedAt.getTime();
      const current = existing.updatedAt.getTime();
      if (seen !== current) {
        throw new ConflictException(
          "Shablon boshqa foydalanuvchi tomonidan o'zgartirilgan. Sahifani yangilang.",
        );
      }
    }
    await this.validateAssignee(accountId, input.assignedEmployeeId);
    await this.validateChecker(accountId, input.checkerId);
    await this.validateDependsOn(accountId, input.dependsOnId, id); // exclude self

    const updated = await this.prisma.client.hrTaskTemplate.update({
      where: { id },
      data: {
        title: input.title,
        description: input.description ?? null,
        assignedEmployeeId: input.assignedEmployeeId ?? null,
        assignedRole: input.assignedRole ?? null,
        department: input.department ?? null,
        priority: input.priority,
        triggerType: input.triggerType,
        scheduleConfig: input.scheduleConfig ?? undefined,
        eventConfig: input.eventConfig ?? undefined,
        responseType: input.responseType,
        deadlineMinutes: input.deadlineMinutes ?? null,
        rewardMinor: toBigIntOrNull(input.rewardMinor),
        fineMinor: toBigIntOrNull(input.fineMinor),
        checkerId: input.checkerId ?? null,
        dependsOnId: input.dependsOnId ?? null,
        isActive: input.isActive,
      },
    });
    this.syncCronRegistration(updated);
    return updated;
  }

  async setActive(accountId: string, id: string, isActive: boolean) {
    await this.findOne(accountId, id);
    const updated = await this.prisma.client.hrTaskTemplate.update({
      where: { id },
      data: { isActive },
    });
    this.syncCronRegistration(updated);
    return updated;
  }

  async delete(accountId: string, id: string) {
    await this.findOne(accountId, id);
    // Hard-delete if no logs, soft (isActive=false) otherwise
    const logCount = await this.prisma.client.hrTaskLog.count({ where: { templateId: id } });
    if (logCount > 0) {
      await this.prisma.client.hrTaskTemplate.update({
        where: { id },
        data: { isActive: false },
      });
      this.scheduler.unregister(id);
      return { ok: true, mode: 'soft' as const };
    }
    await this.prisma.client.hrTaskTemplate.delete({ where: { id } });
    this.scheduler.unregister(id);
    return { ok: true, mode: 'hard' as const };
  }

  // ─── Validation helpers ─────────────────────────────────────────────

  private async validateAssignee(accountId: string, employeeId: string | null | undefined) {
    if (!employeeId) return;
    const emp = await this.prisma.client.employee.findFirst({
      where: { id: employeeId, accountId, archived: false },
      select: { id: true },
    });
    if (!emp) throw new BadRequestException('Tayinlangan xodim topilmadi');
  }

  private async validateChecker(accountId: string, checkerId: string | null | undefined) {
    if (!checkerId) return;
    const checker = await this.prisma.client.employee.findFirst({
      where: { id: checkerId, accountId, archived: false, isChecker: true },
      select: { id: true },
    });
    if (!checker) {
      throw new BadRequestException('Tekshiruvchi topilmadi yoki isChecker=true emas');
    }
  }

  private async validateDependsOn(
    accountId: string,
    dependsOnId: string | null | undefined,
    excludeSelfId?: string,
  ) {
    if (!dependsOnId) return;
    if (excludeSelfId && dependsOnId === excludeSelfId) {
      throw new BadRequestException("Vazifa o'ziga bog'liq bo'la olmaydi");
    }
    const parent = await this.prisma.client.hrTaskTemplate.findFirst({
      where: { id: dependsOnId, accountId },
      select: { id: true },
    });
    if (!parent) {
      throw new BadRequestException("Bog'liq vazifa shabloni topilmadi");
    }
    // Transitive cycle detection: walk dependsOn chain from `dependsOnId`
    // and bail if we ever hit `excludeSelfId` (edit mode) — that means
    // accepting this edge would close the cycle (A → B → … → A).
    if (excludeSelfId) {
      await this.assertNoCycle(accountId, dependsOnId, excludeSelfId);
    }
  }

  /**
   * Walks the dependsOn chain starting from `startId`. Throws if `forbiddenId`
   * is reachable (cycle would form). Bounded to MAX_DEPTH=64 iterations as a
   * defensive cap against orphaned cycles already in the DB.
   */
  private async assertNoCycle(accountId: string, startId: string, forbiddenId: string) {
    const MAX_DEPTH = 64;
    const visited = new Set<string>();
    let cursor: string | null = startId;
    for (let i = 0; i < MAX_DEPTH && cursor; i++) {
      if (cursor === forbiddenId) {
        throw new BadRequestException(
          "Bog'liqlik halqasi: shu shablon orqali aylanma zanjir hosil bo'ladi",
        );
      }
      if (visited.has(cursor)) {
        // Existing cycle in DB (shouldn't happen if we always validate).
        // Stop walking; further iterations would loop forever.
        return;
      }
      visited.add(cursor);
      const next: { dependsOnId: string | null } | null =
        await this.prisma.client.hrTaskTemplate.findFirst({
          where: { id: cursor, accountId },
          select: { dependsOnId: true },
        });
      cursor = next?.dependsOnId ?? null;
    }
  }
}
