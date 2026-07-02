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
import { resolveCreatorGroupId } from '../shared/group-stamp.js';
import { assertMassEditRefsInTenant } from '../shared/mass-edit.js';
import { mapVersionedUpdateError } from '../shared/optimistic-lock.js';
import {
  type CreatePayrollInput,
  CreatePayrollSchema,
  PayrollFilterSchema,
  type PayrollLineInput,
  PayrollTransitionSchema,
  type PayrollTransitionTarget,
  type UpdatePayrollInput,
  UpdatePayrollSchema,
} from './payroll.schema.js';

/**
 * Payroll service.
 *
 * No financial side effects — Payroll is a planning + record-keeping
 * doc. Posting commits the figures but does NOT auto-create a CashOut
 * or PaymentOut (accountant does that separately, referencing this
 * payroll in the payment doc's `description`).
 *
 * Line math: header.sumMinor = SUM(line.sumMinor signed).
 * Earnings are positive, deductions are negative. Recomputed inside the
 * transaction on every create/update so the header never drifts from
 * the line aggregate.
 *
 * State guards:
 *   - update + delete blocked on posted (must unpost first)
 *   - post requires draft; unpost requires posted; cancel from any
 *     non-cancelled
 */
@Injectable()
export class PayrollService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  // ----- List ---------------------------------------------------------------

  async list(accountId: string, rawFilter: unknown) {
    const filter = PayrollFilterSchema.parse(rawFilter);
    const where: Prisma.PayrollWhereInput = {
      accountId,
      ...(filter.includeDeleted ? {} : { deletedAt: null }),
      ...(filter.state ? { state: filter.state } : {}),
      ...(filter.organizationId ? { organizationId: filter.organizationId } : {}),
      ...(filter.employeeId ? { employeeId: filter.employeeId } : {}),
      ...(filter.ownerId ? { ownerId: filter.ownerId } : {}),
      ...(filter.applicable !== undefined ? { applicable: filter.applicable } : {}),
      ...(filter.currency ? { currency: filter.currency } : {}),
      ...(filter.search
        ? {
            OR: [
              { name: { contains: filter.search, mode: 'insensitive' } },
              { description: { contains: filter.search, mode: 'insensitive' } },
              { employee: { name: { contains: filter.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
      ...(filter.periodFrom || filter.periodTo
        ? {
            periodStart: tashkentRangeBounds(filter.periodFrom, filter.periodTo),
          }
        : {}),
      ...(filter.sumMinorFrom !== undefined || filter.sumMinorTo !== undefined
        ? {
            sumMinor: {
              ...(filter.sumMinorFrom !== undefined ? { gte: BigInt(filter.sumMinorFrom) } : {}),
              ...(filter.sumMinorTo !== undefined ? { lte: BigInt(filter.sumMinorTo) } : {}),
            },
          }
        : {}),
    };

    const rows = await this.prisma.client.payroll.findMany({
      where,
      orderBy: { [filter.sortBy]: filter.sortDir },
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      include: {
        organization: { select: { id: true, name: true } },
        employee: { select: { id: true, name: true, position: true, fullName: true } },
        owner: { select: { id: true, name: true } },
        _count: { select: { lines: true } },
      },
    });

    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    const total = await this.prisma.client.payroll.count({ where });
    return { items, nextCursor, total };
  }

  // ----- FindById -----------------------------------------------------------

  async findById(accountId: string, id: string) {
    const row = await this.prisma.client.payroll.findFirst({
      where: { id, accountId, deletedAt: null },
      include: {
        organization: true,
        employee: { select: { id: true, name: true, fullName: true, position: true, inn: true } },
        owner: { select: { id: true, name: true, email: true } },
        lines: { orderBy: { position: 'asc' } },
      },
    });
    if (!row) throw new NotFoundException(`Payroll ${id} topilmadi`);
    return row;
  }

  // ----- Create -------------------------------------------------------------

  /** Sum the signed lines into a BigInt header total. */
  private computeSum(lines: PayrollLineInput[]): bigint {
    return lines.reduce((acc, l) => acc + BigInt(l.sumMinor), 0n);
  }

  async create(accountId: string, ownerId: string, raw: unknown) {
    const data = this.parseCreate(raw);
    await this.ensureRefs(accountId, data.organizationId, data.employeeId);

    const name = await this.nextName(accountId);
    const periodStart = new Date(data.periodStart);
    const periodEnd = new Date(data.periodEnd);
    if (periodStart > periodEnd) {
      throw new BadRequestException(
        "Period boshlanish sanasi tugash sanasidan keyin bo'lishi mumkin emas",
      );
    }
    const moment = data.moment ? new Date(data.moment) : new Date();
    const applicable = data.applicable ?? false;
    const state = applicable ? 'posted' : 'draft';
    const postedAt = applicable ? new Date() : null;
    const sumMinor = this.computeSum(data.lines);
    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, ownerId);

    try {
      const created = await this.prisma.client.$transaction(async (tx) => {
        const row = await tx.payroll.create({
          data: {
            accountId,
            ownerId,
            groupId: creatorGroupId,
            name,
            organizationId: data.organizationId,
            employeeId: data.employeeId,
            periodStart,
            periodEnd,
            moment,
            applicable,
            state,
            postedAt,
            sumMinor,
            currency: data.currency,
            rateValue: BigInt(data.rateValue),
            description: data.description,
            externalCode: data.externalCode,
          },
        });
        await tx.payrollLine.createMany({
          data: data.lines.map((l, idx) => ({
            accountId,
            payrollId: row.id,
            position: idx + 1,
            itemType: l.itemType,
            itemName: l.itemName,
            sumMinor: BigInt(l.sumMinor),
            meta: (l.meta as Prisma.InputJsonValue | undefined) ?? undefined,
          })),
        });
        await tx.auditLog.create({
          data: {
            accountId,
            userId: ownerId,
            entity: 'Payroll',
            entityId: row.id,
            action: 'create',
            fieldChanges: {
              sumMinor: sumMinor.toString(),
              lineCount: data.lines.length,
            } as Prisma.InputJsonValue,
          },
        });
        return row;
      });
      return this.findById(accountId, created.id);
    } catch (e) {
      this.handlePrisma(e);
    }
  }

  // ----- Update -------------------------------------------------------------

  async update(accountId: string, userId: string, id: string, raw: unknown) {
    const data = this.parseUpdate(raw);
    const existing = await this.findById(accountId, id);
    if (existing.applicable) {
      throw new BadRequestException(
        'Provedeno hujjatni tahrirlash mumkin emas — avval unpost qiling',
      );
    }

    try {
      await this.prisma.client.$transaction(async (tx) => {
        // Optimistic lock: ALWAYS bump the version. The version filter (on the
        // payroll.update below) 409s on a stale save and aborts the tx, rolling
        // back the lines rewrite. findById above proves the row exists.
        const updateData: Prisma.PayrollUpdateInput = { version: { increment: 1 } };
        if (data.organizationId) {
          updateData.organization = { connect: { id: data.organizationId } };
        }
        if (data.employeeId) {
          updateData.employee = { connect: { id: data.employeeId } };
        }
        if (data.periodStart) updateData.periodStart = new Date(data.periodStart);
        if (data.periodEnd) updateData.periodEnd = new Date(data.periodEnd);
        if (data.moment) updateData.moment = new Date(data.moment);
        if (data.currency) updateData.currency = data.currency;
        if (data.rateValue) updateData.rateValue = BigInt(data.rateValue);
        if (data.description !== undefined) updateData.description = data.description;
        if (data.externalCode !== undefined) updateData.externalCode = data.externalCode;

        // Replace-all line semantics + recompute header sum
        if (data.lines !== undefined) {
          if (data.lines.length === 0) {
            throw new BadRequestException("Kamida 1 ta satr bo'lishi shart");
          }
          await tx.payrollLine.deleteMany({ where: { payrollId: id } });
          await tx.payrollLine.createMany({
            data: data.lines.map((l, idx) => ({
              accountId,
              payrollId: id,
              position: idx + 1,
              itemType: l.itemType,
              itemName: l.itemName,
              sumMinor: BigInt(l.sumMinor),
              meta: (l.meta as Prisma.InputJsonValue | undefined) ?? undefined,
            })),
          });
          updateData.sumMinor = this.computeSum(data.lines);
        }

        // Date validation when both are updated
        const nextStart =
          updateData.periodStart instanceof Date ? updateData.periodStart : existing.periodStart;
        const nextEnd =
          updateData.periodEnd instanceof Date ? updateData.periodEnd : existing.periodEnd;
        if (nextStart > nextEnd) {
          throw new BadRequestException(
            "Period boshlanish sanasi tugash sanasidan keyin bo'lishi mumkin emas",
          );
        }

        await tx.payroll.update({
          where: { id, accountId, version: data.version },
          data: updateData,
        });
        await tx.auditLog.create({
          data: {
            accountId,
            userId,
            entity: 'Payroll',
            entityId: id,
            action: 'update',
            fieldChanges: Prisma.JsonNull,
          },
        });
      });
    } catch (e) {
      mapVersionedUpdateError(e, 'Payroll');
      throw e;
    }
    // Read AFTER the tx commits so the response reflects the bumped version + the
    // rewritten lines — a findById via the non-tx client INSIDE the tx reads the
    // pre-commit snapshot (returns stale version/lines).
    return this.findById(accountId, id);
  }

  // ----- Soft delete --------------------------------------------------------

  async softDelete(accountId: string, userId: string, id: string) {
    const row = await this.findById(accountId, id);
    if (row.applicable) {
      throw new BadRequestException(
        "Provedeno hujjatni o'chirish mumkin emas — avval unpost yoki cancel qiling",
      );
    }
    await this.prisma.client.payroll.update({
      where: { id, accountId },
      data: { deletedAt: new Date(), state: 'cancelled' },
    });
    await this.prisma.client.auditLog.create({
      data: {
        accountId,
        userId,
        entity: 'Payroll',
        entityId: id,
        action: 'delete',
        fieldChanges: Prisma.JsonNull,
      },
    });
    return { ok: true };
  }

  /** mass-edit single-row apply. Payroll lacks projectId. */
  async massEditApply(
    accountId: string,
    userId: string,
    id: string,
    patch: { ownerId?: string | null; description?: string | null },
  ) {
    await this.findById(accountId, id);
    await assertMassEditRefsInTenant(this.prisma, accountId, patch);
    const data: Record<string, unknown> = {};
    if ('ownerId' in patch) data.ownerId = patch.ownerId;
    if ('description' in patch) data.description = patch.description;
    const updated = await this.prisma.client.payroll.update({ where: { id, accountId }, data });
    await this.prisma.client.auditLog.create({
      data: {
        accountId,
        userId,
        entity: 'Payroll',
        entityId: id,
        action: 'mass-edit',
        fieldChanges: patch as Prisma.InputJsonValue,
      },
    });
    return updated;
  }

  async markPrinted(accountId: string, userId: string, id: string, printed: boolean) {
    await this.findById(accountId, id);
    const updated = await this.prisma.client.payroll.update({
      where: { id, accountId },
      data: { printed },
    });
    await this.prisma.client.auditLog.create({
      data: {
        accountId,
        userId,
        entity: 'Payroll',
        entityId: id,
        action: printed ? 'mark-printed' : 'unmark-printed',
        fieldChanges: Prisma.JsonNull,
      },
    });
    return updated;
  }

  // ----- Clone --------------------------------------------------------------

  async clone(accountId: string, ownerId: string, sourceId: string) {
    const src = await this.findById(accountId, sourceId);
    return this.create(accountId, ownerId, {
      organizationId: src.organizationId,
      employeeId: src.employeeId,
      periodStart: src.periodStart.toISOString(),
      periodEnd: src.periodEnd.toISOString(),
      currency: src.currency,
      rateValue: src.rateValue.toString(),
      description: src.description ?? undefined,
      externalCode: src.externalCode ?? undefined,
      applicable: false,
      lines: src.lines.map((l) => ({
        itemType: l.itemType,
        itemName: l.itemName,
        sumMinor: l.sumMinor.toString(),
        meta: l.meta as Record<string, unknown> | undefined,
      })),
    });
  }

  // ----- Transition (post / unpost / cancel) -------------------------------

  async transition(accountId: string, userId: string, id: string, targetRaw: unknown) {
    const r = PayrollTransitionSchema.safeParse(targetRaw);
    if (!r.success) {
      throw new BadRequestException(`Notog'ri transition: ${String(targetRaw)}`);
    }
    const target: PayrollTransitionTarget = r.data;
    const existing = await this.findById(accountId, id);

    if (target === 'post') {
      if (existing.state !== 'draft') {
        throw new BadRequestException(`Faqat 'draft' → 'posted' (hozir: ${existing.state})`);
      }
      if (existing.lines.length === 0) {
        throw new BadRequestException("Pozitsiyalar yo'q");
      }
      await this.prisma.client.payroll.update({
        where: { id, accountId },
        data: { state: 'posted', applicable: true, postedAt: new Date() },
      });
    } else if (target === 'unpost') {
      if (existing.state !== 'posted') {
        throw new BadRequestException(`Faqat 'posted' → 'draft' (hozir: ${existing.state})`);
      }
      await this.prisma.client.payroll.update({
        where: { id, accountId },
        data: { state: 'draft', applicable: false, postedAt: null },
      });
    } else if (target === 'cancel') {
      if (existing.state === 'cancelled') {
        throw new BadRequestException('Hujjat oldin bekor qilingan');
      }
      await this.prisma.client.payroll.update({
        where: { id, accountId },
        data: { state: 'cancelled', applicable: false },
      });
    }

    await this.prisma.client.auditLog.create({
      data: {
        accountId,
        userId,
        entity: 'Payroll',
        entityId: id,
        action: `transition:${target}`,
        fieldChanges: Prisma.JsonNull,
      },
    });
    return this.findById(accountId, id);
  }

  // ----- Helpers ------------------------------------------------------------

  private parseCreate(raw: unknown): CreatePayrollInput {
    const r = CreatePayrollSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private parseUpdate(raw: unknown): UpdatePayrollInput {
    const r = UpdatePayrollSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private async ensureRefs(
    accountId: string,
    organizationId: string,
    employeeId: string,
  ): Promise<void> {
    const [org, emp] = await Promise.all([
      this.prisma.client.organization.findFirst({ where: { id: organizationId, accountId } }),
      this.prisma.client.employee.findFirst({ where: { id: employeeId, accountId } }),
    ]);
    if (!org) throw new BadRequestException('Tashkilot topilmadi');
    if (!emp) throw new BadRequestException('Xodim topilmadi');
  }

  private async nextName(accountId: string): Promise<string> {
    const n = await allocateDocumentNumber(this.prisma.client, accountId, 'payroll', async () => {
      // moysklad-parity: plain 5-digit zero-padded «Номер» (no prefix). Seed = highest
      // TRAILING number across all names (handles legacy prefixed + new plain) → continues.
      const rows = await this.prisma.client.payroll.findMany({
        where: { accountId },
        select: { name: true },
      });
      let max = 0;
      for (const r of rows) {
        const m = r.name.match(/\d+$/);
        if (m) max = Math.max(max, Number.parseInt(m[0], 10) || 0);
      }
      return max;
    });
    return String(n).padStart(5, '0');
  }

  private handlePrisma(e: unknown): never {
    const err = e as { code?: string; meta?: { target?: string[] } };
    if (err.code === 'P2002') {
      throw new ConflictException(
        `Bu nom bilan payroll allaqachon mavjud: ${err.meta?.target?.join(', ')}`,
      );
    }
    throw e as Error;
  }
}
