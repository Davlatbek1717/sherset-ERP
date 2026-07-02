import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { throwIfEmployeeUniqueViolation } from '../../shared/employee-unique.js';
import { mapVersionedUpdateError } from '../../shared/optimistic-lock.js';
import { normalizeTelegramPhone } from '../hr-shared/phone-normalize.util.js';
import type {
  CreateHrEmployeeInput,
  HrEmployeeFilter,
  SetPasswordInput,
  UpdateHrEmployeeInput,
} from './hr-employee.schema.js';

function safeNormalizePhone(raw: string | null | undefined): string | null | undefined {
  if (raw === undefined) return undefined; // unchanged on update
  try {
    return normalizeTelegramPhone(raw);
  } catch (e) {
    throw new BadRequestException((e as Error).message);
  }
}

@Injectable()
export class HrEmployeeService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string, filter: HrEmployeeFilter) {
    const where: Record<string, unknown> = {
      accountId,
      // moysklad «Состояние»: active list by default, archived view on demand.
      archived: filter.archived ?? false,
    };
    if (filter.search) {
      where.OR = [
        { name: { contains: filter.search, mode: 'insensitive' } },
        { phone: { contains: filter.search } },
        { telegramPhone: { contains: filter.search } },
        { email: { contains: filter.search, mode: 'insensitive' } },
        { username: { contains: filter.search, mode: 'insensitive' } },
      ];
    }
    if (filter.role) {
      where.hrRoles = { has: filter.role };
    }
    if (filter.department) {
      where.department = filter.department;
    }
    if (filter.isChecker !== undefined) {
      where.isChecker = filter.isChecker;
    }

    const [rows, total] = await this.prisma.client.$transaction([
      this.prisma.client.employee.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (filter.page - 1) * filter.limit,
        take: filter.limit,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          username: true,
          telegramPhone: true,
          department: true,
          hrRoles: true,
          isChecker: true,
          moyskladAgentId: true,
          archived: true,
          // Optimistic-lock token — the edit modal opens off a list row, so the
          // row must carry the version it will round-trip on Save.
          version: true,
          // moysklad #employee «Вход» + «Должность» columns — surfaced by the
          // Settings → Users list (settings/users). Harmless extra fields for
          // the HR dashboard projection.
          lastLoginAt: true,
          position: true,
        },
      }),
      this.prisma.client.employee.count({ where }),
    ]);

    return { rows, total, page: filter.page, limit: filter.limit };
  }

  async findOne(accountId: string, id: string) {
    const emp = await this.prisma.client.employee.findFirst({
      where: { id, accountId, archived: false },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        username: true,
        telegramPhone: true,
        department: true,
        hrRoles: true,
        isChecker: true,
        moyskladAgentId: true,
        salaryConfig: true,
        createdAt: true,
        lastLoginAt: true,
        // Optimistic-lock token for the detail-page edit modal.
        version: true,
      },
    });
    if (!emp) throw new NotFoundException('Xodim topilmadi');
    return emp;
  }

  async create(accountId: string, input: CreateHrEmployeeInput) {
    const telegramPhone = safeNormalizePhone(input.telegramPhone);

    if (input.username) {
      const dup = await this.prisma.client.employee.findFirst({
        where: { accountId, username: input.username },
        select: { id: true },
      });
      if (dup) throw new ConflictException('Bu username allaqachon ishlatilgan');
    }

    const passwordHash =
      input.username && input.password ? await argon2.hash(input.password) : undefined;

    try {
      return await this.prisma.client.employee.create({
        data: {
          accountId,
          name: input.name,
          // email shart Prisma'da; agar foydalanuvchi bermasa fallback unique placeholder.
          email: input.email ?? `${Date.now()}@hr.local`,
          phone: input.phone ?? undefined,
          telegramPhone: telegramPhone ?? undefined,
          department: input.department ?? undefined,
          hrRoles: input.hrRoles,
          isChecker: input.isChecker,
          moyskladAgentId: input.moyskladAgentId ?? undefined,
          ...(input.username && { username: input.username }),
          ...(passwordHash && { passwordHash }),
        },
      });
    } catch (e) {
      // No app pre-check here, so a duplicate email (the DB enforces
      // @@unique([accountId, email])) arrives as a raw P2002 → map to 409.
      throwIfEmployeeUniqueViolation(e);
      throw e;
    }
  }

  async update(accountId: string, id: string, input: UpdateHrEmployeeInput) {
    // findOne proves existence (and tenant ownership) BEFORE the versioned
    // update, so a P2025 from the update below can only be a version mismatch
    // (a concurrent write bumped the version) — i.e. an optimistic-lock
    // conflict, not a missing row.
    await this.findOne(accountId, id);
    const telegramPhone = safeNormalizePhone(input.telegramPhone);
    try {
      return await this.prisma.client.employee.update({
        // Optimistic lock: WHERE id = ? AND version = ?  → 0 rows (P2025) if a
        // concurrent edit (HR form, /analitika/staff or /auth/me) already moved
        // the version on. version: { increment } bumps it so other open forms
        // detect this save.
        where: { id, version: input.version },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.email !== undefined && { email: input.email }),
          ...(input.phone !== undefined && { phone: input.phone }),
          ...(telegramPhone !== undefined && { telegramPhone }),
          ...(input.department !== undefined && { department: input.department }),
          ...(input.hrRoles !== undefined && { hrRoles: input.hrRoles }),
          ...(input.isChecker !== undefined && { isChecker: input.isChecker }),
          ...(input.moyskladAgentId !== undefined && { moyskladAgentId: input.moyskladAgentId }),
          version: { increment: 1 },
        },
      });
    } catch (e) {
      mapVersionedUpdateError(e, 'Employee');
      // No app pre-check here either; a changed-to-duplicate email arrives as a
      // raw P2002 → map to 409 (lock check above wins for the P2025 case).
      throwIfEmployeeUniqueViolation(e);
      throw e;
    }
  }

  /**
   * Tenant-scoped lookup that IGNORES the archived flag — needed by
   * archive/restore/delete, which must operate on archived rows too
   * (findOne filters archived=false and would 404 on an archived row
   * during «Извлечь из архива»). Returns minimal shape; throws if missing
   * or owned by another account.
   */
  private async findRawOrThrow(accountId: string, id: string) {
    const emp = await this.prisma.client.employee.findFirst({
      where: { id, accountId },
      select: { id: true, archived: true },
    });
    if (!emp) throw new NotFoundException('Xodim topilmadi');
    return emp;
  }

  /** Per-row «delete» icon — soft archive (moysklad keeps the row, hides it). */
  async softDelete(accountId: string, id: string, currentUserId?: string) {
    await this.findRawOrThrow(accountId, id);
    if (currentUserId && id === currentUserId) {
      // Archiving disables login (auth filters archived=false) → self-lockout.
      throw new BadRequestException("O'zingizni arxivlay olmaysiz");
    }
    await this.prisma.client.employee.update({
      where: { id },
      // Bump version so an open staff/HR edit-form (which can edit `archived`)
      // 409s on a stale save instead of silently resurrecting this row.
      data: { archived: true, version: { increment: 1 } },
    });
    return { ok: true };
  }

  /**
   * Bulk «Поместить в архив» (archived=true) / «Извлечь из архива»
   * (archived=false). Archiving disables the employee's login, so a user
   * may never archive themselves — that would be a self-lockout. Restore is
   * always safe.
   */
  async setArchived(accountId: string, id: string, archived: boolean, currentUserId?: string) {
    await this.findRawOrThrow(accountId, id);
    if (archived && currentUserId && id === currentUserId) {
      throw new BadRequestException("O'zingizni arxivlay olmaysiz");
    }
    await this.prisma.client.employee.update({
      where: { id },
      // Bump version (see softDelete) — keeps the staff/HR edit-form lock sound.
      data: { archived, version: { increment: 1 } },
    });
    return { ok: true };
  }

  /**
   * Bulk «Удалить» — hard delete. Blocked by FK Restrict relations (Payroll,
   * CashierSession, LabelPrintJob, Publication) and the required HR-log
   * relations; Prisma surfaces those as P2003/P2014, which we translate to a
   * clear "has linked records — archive instead" message so the partial-result
   * toast is actionable. Cannot delete yourself (self-lockout). Tenant
   * ownership is verified first, so deleting by unique id is safe.
   */
  async hardDelete(accountId: string, id: string, currentUserId?: string) {
    await this.findRawOrThrow(accountId, id);
    if (currentUserId && id === currentUserId) {
      throw new BadRequestException("O'zingizni o'chira olmaysiz");
    }
    try {
      // accountId in the where is defence-in-depth — ownership is already
      // verified by findRawOrThrow above, but scoping the delete keeps it
      // tenant-safe even if that check is ever refactored away.
      await this.prisma.client.employee.delete({ where: { id, accountId } });
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === 'P2003' || code === 'P2014') {
        throw new ConflictException(
          "Bog'liq yozuvlar bor — xodimni o'chirib bo'lmaydi, avval arxivga oling",
        );
      }
      throw e;
    }
    return { ok: true };
  }

  async setPassword(accountId: string, id: string, input: SetPasswordInput) {
    await this.findOne(accountId, id);

    const existing = await this.prisma.client.employee.findFirst({
      where: { accountId, username: input.username, NOT: { id } },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('Bu username allaqachon ishlatilgan');
    }

    const passwordHash = await argon2.hash(input.password);
    try {
      await this.prisma.client.employee.update({
        where: { id },
        // username IS a staff-form field → bump version so a stale staff edit-form
        // save 409s rather than clobbering the freshly-set login. (passwordHash is
        // not an edit-form field, but it rides along the same write.)
        data: { username: input.username, passwordHash, version: { increment: 1 } },
      });
    } catch (e) {
      // The pre-check above is a TOCTOU window: a concurrent setPassword/create
      // can claim the same username first, then this update hits the partial
      // unique index → P2002. Map it to the same friendly 409.
      throwIfEmployeeUniqueViolation(e);
      throw e;
    }
    return { ok: true };
  }

  /**
   * Dropdown for "MoySklad agent" linking on the employee form.
   * In this codebase the "MoySklad agent" is itself an Employee (we are
   * moysklad) — so we return all archived=false employees of this account
   * minus the current one.
   */
  async moyskladAgentsForDropdown(accountId: string, excludeId?: string) {
    return this.prisma.client.employee.findMany({
      where: {
        accountId,
        archived: false,
        ...(excludeId && { NOT: { id: excludeId } }),
      },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, email: true },
    });
  }
}
