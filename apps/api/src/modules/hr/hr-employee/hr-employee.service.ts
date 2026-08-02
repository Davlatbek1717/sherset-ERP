import type { Prisma } from '@moysklad/db';
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
  SetEmployeeImageInput,
  SetPasswordInput,
  UpdateHrEmployeeInput,
} from './hr-employee.schema.js';
import { summarizeSchedule } from './schedule-summary.util.js';

function safeNormalizePhone(raw: string | null | undefined): string | null | undefined {
  if (raw === undefined) return undefined; // unchanged on update
  try {
    return normalizeTelegramPhone(raw);
  } catch (e) {
    throw new BadRequestException((e as Error).message);
  }
}

/**
 * Reserved key inside Employee.attributes for the moysklad employee-card
 * extras that have no dedicated column (no schema migration on this box):
 * `{ loginAllowed, allowedIps, allowedNetworks, notifications }`.
 * The HR module never touches other attribute keys, and custom-field code
 * must skip keys with the `__` prefix.
 */
export const EMPLOYEE_SYSTEM_KEY = '__employee_system';

export interface EmployeeSystemAttrs {
  loginAllowed?: boolean;
  allowedIps?: string[];
  allowedNetworks?: string[];
  notifications?: Record<
    string,
    { enabled?: boolean; web?: boolean; email?: boolean; phone?: boolean }
  >;
  /** Original filename of the card «Изображение» (bytes live in imageContent). */
  imageName?: string;
}

export function readEmployeeSystemAttrs(attributes: unknown): EmployeeSystemAttrs {
  if (attributes && typeof attributes === 'object' && !Array.isArray(attributes)) {
    const raw = (attributes as Record<string, unknown>)[EMPLOYEE_SYSTEM_KEY];
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as EmployeeSystemAttrs;
  }
  return {};
}

/** Merge card extras into the attributes JSON without clobbering other keys. */
function mergeEmployeeSystemAttrs(
  currentAttributes: unknown,
  patch: Partial<EmployeeSystemAttrs>,
): Record<string, unknown> {
  const base =
    currentAttributes && typeof currentAttributes === 'object' && !Array.isArray(currentAttributes)
      ? { ...(currentAttributes as Record<string, unknown>) }
      : {};
  base[EMPLOYEE_SYSTEM_KEY] = { ...readEmployeeSystemAttrs(base), ...patch };
  return base;
}

/** Pick the card-extra fields out of a create/update payload (undefined = untouched). */
function systemAttrsPatch(input: {
  loginAllowed?: boolean;
  allowedIps?: string[];
  allowedNetworks?: string[];
  notifications?: EmployeeSystemAttrs['notifications'];
}): Partial<EmployeeSystemAttrs> {
  const patch: Partial<EmployeeSystemAttrs> = {};
  if (input.loginAllowed !== undefined) patch.loginAllowed = input.loginAllowed;
  if (input.allowedIps !== undefined) patch.allowedIps = input.allowedIps;
  if (input.allowedNetworks !== undefined) patch.allowedNetworks = input.allowedNetworks;
  if (input.notifications !== undefined) patch.notifications = input.notifications;
  return patch;
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
    if (filter.position) {
      where.position = filter.position;
    }
    // TimePay catalog filters (by FK id).
    if (filter.positionId) where.positionId = filter.positionId;
    if (filter.departmentId) where.departmentId = filter.departmentId;
    if (filter.scheduleId) where.scheduleId = filter.scheduleId;
    if (filter.branchId) {
      // `search` may already own `where.OR`, so scope the branch match under a
      // separate AND. Match the primary geofence (workLocationId) OR the
      // many-to-many join, so pre-join single-branch employees still surface.
      where.AND = [
        {
          OR: [
            { workLocationId: filter.branchId },
            { branches: { some: { workLocationId: filter.branchId } } },
          ],
        },
      ];
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
          trackingMode: true,
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
          // moysklad Настройки → Сотрудники list columns: Фамилия/Имя/Отчество,
          // Описание, Роль, Вход (loginAllowed lives in attributes JSON).
          firstName: true,
          lastName: true,
          middleName: true,
          description: true,
          attributes: true,
          // avatar thumbnail flag (bytes NEVER ride the list payload)
          imageMime: true,
          roles: { select: { role: { select: { id: true, name: true, isSystem: true } } } },
          // TimePay catalog projections (Lavozim / Bo'lim / Jadval / Filial columns).
          positionId: true,
          departmentId: true,
          scheduleId: true,
          position2: { select: { id: true, name: true } },
          department2: { select: { id: true, name: true } },
          workLocation: { select: { id: true, name: true } },
          schedule: {
            select: {
              id: true,
              name: true,
              type: true,
              cycleDays: true,
              days: { select: { isWorkday: true, startTime: true, endTime: true } },
            },
          },
        },
      }),
      this.prisma.client.employee.count({ where }),
    ]);

    return {
      rows: rows.map(
        ({ attributes, imageMime, position2, department2, workLocation, schedule, ...row }) => ({
          ...row,
          loginAllowed: readEmployeeSystemAttrs(attributes).loginAllowed !== false,
          hasImage: imageMime != null,
          positionRef: position2 ?? null,
          departmentRef: department2 ?? null,
          primaryBranch: workLocation ?? null,
          scheduleRef: schedule ? summarizeSchedule(schedule) : null,
        }),
      ),
      total,
      page: filter.page,
      limit: filter.limit,
    };
  }

  async findOne(accountId: string, id: string, opts?: { includeArchived?: boolean }) {
    const emp = await this.prisma.client.employee.findFirst({
      // The moysklad employee card must open archived rows too («Извлечь из
      // архива» lives on the card) — list default stays active-only.
      where: { id, accountId, ...(opts?.includeArchived ? {} : { archived: false }) },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        username: true,
        telegramPhone: true,
        // Faza D1 — «Telegram ulash» holati (chat_id bor/yo'q kartochkada ko'rinadi).
        telegramChatId: true,
        department: true,
        hrRoles: true,
        isChecker: true,
        moyskladAgentId: true,
        salaryConfig: true,
        createdAt: true,
        lastLoginAt: true,
        // GPS-davomat config (schedule tab)
        attendanceOptIn: true,
        workLocationId: true,
        workLocation: { select: { id: true, name: true } },
        // Optimistic-lock token for the detail-page edit modal.
        version: true,
        // moysklad employee card (Настройки → Сотрудники → карточка).
        firstName: true,
        lastName: true,
        middleName: true,
        position: true,
        salaryMinor: true,
        inn: true,
        description: true,
        archived: true,
        updatedAt: true,
        imageMime: true,
        // NOTE: Employee has no `group` RELATION (only the scalar groupId used
        // by OWN_GROUP scope) — the card resolves the department name from the
        // /groups catalog it already loads.
        groupId: true,
        attributes: true,
        roles: { select: { role: { select: { id: true, name: true, isSystem: true } } } },
        // TimePay catalog assignment — so the edit modal can pre-select them.
        positionId: true,
        departmentId: true,
        scheduleId: true,
      },
    });
    if (!emp) throw new NotFoundException('Xodim topilmadi');
    const { attributes, imageMime, ...rest } = emp;
    const sys = readEmployeeSystemAttrs(attributes);
    return {
      ...rest,
      loginAllowed: sys.loginAllowed !== false,
      allowedIps: sys.allowedIps ?? [],
      allowedNetworks: sys.allowedNetworks ?? [],
      notifications: sys.notifications ?? {},
      hasImage: imageMime != null,
      imageName: sys.imageName ?? null,
    };
  }

  /**
   * moysklad employee «История изменений»: every mutation on the employee
   * card writes an audit row (entity='employee') so the card's history panel
   * shows changes made TO the employee alongside actions made BY them.
   * Non-fatal: an audit failure must never roll back the actual change.
   */
  private async writeAudit(
    accountId: string,
    entityId: string,
    action: string,
    actorId?: string,
    fieldChanges?: Record<string, { before?: unknown; after?: unknown }>,
  ) {
    try {
      await this.prisma.client.auditLog.create({
        data: {
          accountId,
          userId: actorId ?? null,
          entity: 'employee',
          entityId,
          action,
          fieldChanges:
            fieldChanges && Object.keys(fieldChanges).length > 0
              ? (fieldChanges as Prisma.InputJsonValue)
              : undefined,
        },
      });
    } catch {
      // best-effort — the mutation itself already succeeded
    }
  }

  /**
   * When a catalog FK (positionId/departmentId) is set, resolve its name so the
   * legacy free-text position/department strings stay in sync — the Faza-2
   * position drill and HrTaskTemplate.department filter read those strings.
   */
  private async resolveCatalogMirror(
    accountId: string,
    input: { positionId?: string | null; departmentId?: string | null },
  ): Promise<{ position?: string; department?: string }> {
    const out: { position?: string; department?: string } = {};
    if (input.positionId) {
      const p = await this.prisma.client.hrPosition.findFirst({
        where: { id: input.positionId, accountId },
        select: { name: true },
      });
      if (p) out.position = p.name;
    }
    if (input.departmentId) {
      const d = await this.prisma.client.hrDepartment.findFirst({
        where: { id: input.departmentId, accountId },
        select: { name: true },
      });
      if (d) out.department = d.name;
    }
    return out;
  }

  async create(accountId: string, input: CreateHrEmployeeInput, actorId?: string) {
    const telegramPhone = safeNormalizePhone(input.telegramPhone);
    const sysPatch = systemAttrsPatch(input);
    const mirror = await this.resolveCatalogMirror(accountId, input);
    try {
      const created = await this.prisma.client.employee.create({
        data: {
          accountId,
          name: input.name,
          // email shart Prisma'da; agar foydalanuvchi bermasa fallback unique placeholder.
          email: input.email ?? `${Date.now()}@hr.local`,
          phone: input.phone ?? undefined,
          telegramPhone: telegramPhone ?? undefined,
          department: mirror.department ?? input.department ?? undefined,
          hrRoles: input.hrRoles,
          isChecker: input.isChecker,
          moyskladAgentId: input.moyskladAgentId ?? undefined,
          // moysklad employee card fields (all columns already existed).
          firstName: input.firstName ?? undefined,
          lastName: input.lastName ?? undefined,
          middleName: input.middleName ?? undefined,
          position: mirror.position ?? input.position ?? undefined,
          // TimePay catalog FKs.
          positionId: input.positionId ?? undefined,
          departmentId: input.departmentId ?? undefined,
          scheduleId: input.scheduleId ?? undefined,
          salaryMinor: input.salaryMinor != null ? BigInt(input.salaryMinor) : undefined,
          inn: input.inn ?? undefined,
          description: input.description ?? undefined,
          groupId: input.groupId ?? undefined,
          ...(Object.keys(sysPatch).length > 0 && {
            attributes: mergeEmployeeSystemAttrs(undefined, sysPatch) as object,
          }),
        },
        // Never echo passwordHash/imageContent back; reuse the card shape.
        select: { id: true, version: true },
      });
      await this.writeAudit(accountId, created.id, 'create', actorId);
      return this.findOne(accountId, created.id, { includeArchived: true });
    } catch (e) {
      // No app pre-check here, so a duplicate email (the DB enforces
      // @@unique([accountId, email])) arrives as a raw P2002 → map to 409.
      throwIfEmployeeUniqueViolation(e);
      throw e;
    }
  }

  async update(accountId: string, id: string, input: UpdateHrEmployeeInput, actorId?: string) {
    // Existence + tenant check BEFORE the versioned update, so a P2025 from
    // the update below can only be a version mismatch (a concurrent write
    // bumped the version) — i.e. an optimistic-lock conflict, not a missing
    // row. Raw row (not findOne): the card edits archived employees too, and
    // the attributes JSON is needed for the __employee_system merge.
    const current = await this.prisma.client.employee.findFirst({
      where: { id, accountId },
      select: {
        id: true,
        attributes: true,
        // Diff base for the «История изменений» fieldChanges (Поле/Было/Стало).
        name: true,
        email: true,
        phone: true,
        department: true,
        firstName: true,
        lastName: true,
        middleName: true,
        position: true,
        salaryMinor: true,
        inn: true,
        description: true,
        groupId: true,
      },
    });
    if (!current) throw new NotFoundException('Xodim topilmadi');
    const telegramPhone = safeNormalizePhone(input.telegramPhone);
    const sysPatch = systemAttrsPatch(input);
    const mirror = await this.resolveCatalogMirror(accountId, input);

    // moysklad-style audit diff: only fields present in the payload AND
    // actually different. Salary compares/records via the string wire format.
    const fieldChanges: Record<string, { before?: unknown; after?: unknown }> = {};
    const diffScalar = (field: keyof typeof current, next: unknown) => {
      const before = current[field];
      const beforeCmp = typeof before === 'bigint' ? before.toString() : (before ?? null);
      const nextCmp = next ?? null;
      if (beforeCmp !== nextCmp)
        fieldChanges[field as string] = { before: beforeCmp, after: nextCmp };
    };
    if (input.name !== undefined) diffScalar('name', input.name);
    if (input.email !== undefined) diffScalar('email', input.email);
    if (input.phone !== undefined) diffScalar('phone', input.phone);
    if (input.department !== undefined) diffScalar('department', input.department);
    if (input.firstName !== undefined) diffScalar('firstName', input.firstName);
    if (input.lastName !== undefined) diffScalar('lastName', input.lastName);
    if (input.middleName !== undefined) diffScalar('middleName', input.middleName);
    if (input.position !== undefined) diffScalar('position', input.position);
    if (input.salaryMinor !== undefined) diffScalar('salaryMinor', input.salaryMinor);
    if (input.inn !== undefined) diffScalar('inn', input.inn);
    if (input.description !== undefined) diffScalar('description', input.description);
    if (input.groupId !== undefined) diffScalar('groupId', input.groupId);
    const sysBefore = readEmployeeSystemAttrs(current.attributes);
    if (
      input.loginAllowed !== undefined &&
      (sysBefore.loginAllowed !== false) !== input.loginAllowed
    ) {
      fieldChanges.loginAllowed = {
        before: sysBefore.loginAllowed !== false,
        after: input.loginAllowed,
      };
    }
    if (
      input.allowedIps !== undefined &&
      JSON.stringify(sysBefore.allowedIps ?? []) !== JSON.stringify(input.allowedIps)
    ) {
      fieldChanges.allowedIps = {
        before: (sysBefore.allowedIps ?? []).join(', '),
        after: input.allowedIps.join(', '),
      };
    }
    if (
      input.allowedNetworks !== undefined &&
      JSON.stringify(sysBefore.allowedNetworks ?? []) !== JSON.stringify(input.allowedNetworks)
    ) {
      fieldChanges.allowedNetworks = {
        before: (sysBefore.allowedNetworks ?? []).join(', '),
        after: input.allowedNetworks.join(', '),
      };
    }
    try {
      await this.prisma.client.employee.update({
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
          ...(mirror.department !== undefined
            ? { department: mirror.department }
            : input.department !== undefined && { department: input.department }),
          ...(input.hrRoles !== undefined && { hrRoles: input.hrRoles }),
          ...(input.isChecker !== undefined && { isChecker: input.isChecker }),
          ...(input.moyskladAgentId !== undefined && { moyskladAgentId: input.moyskladAgentId }),
          ...(input.firstName !== undefined && { firstName: input.firstName }),
          ...(input.lastName !== undefined && { lastName: input.lastName }),
          ...(input.middleName !== undefined && { middleName: input.middleName }),
          ...(mirror.position !== undefined
            ? { position: mirror.position }
            : input.position !== undefined && { position: input.position }),
          ...(input.salaryMinor !== undefined && {
            salaryMinor: input.salaryMinor != null ? BigInt(input.salaryMinor) : null,
          }),
          ...(input.inn !== undefined && { inn: input.inn }),
          ...(input.description !== undefined && { description: input.description }),
          ...(input.groupId !== undefined && { groupId: input.groupId }),
          // TimePay catalog FKs (plain scalars — ride the same optimistic-lock update).
          ...(input.positionId !== undefined && { positionId: input.positionId }),
          ...(input.departmentId !== undefined && { departmentId: input.departmentId }),
          ...(input.scheduleId !== undefined && { scheduleId: input.scheduleId }),
          // «Haydovchi (jonli-iz)» — geofence↔field (driver-tracking designation).
          ...(input.trackingMode !== undefined && { trackingMode: input.trackingMode }),
          ...(Object.keys(sysPatch).length > 0 && {
            attributes: mergeEmployeeSystemAttrs(current.attributes, sysPatch) as object,
          }),
          version: { increment: 1 },
        },
        select: { id: true },
      });
      await this.writeAudit(accountId, id, 'update', actorId, fieldChanges);
      return this.findOne(accountId, id, { includeArchived: true });
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
    await this.writeAudit(accountId, id, 'archive', currentUserId);
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
    await this.writeAudit(accountId, id, archived ? 'archive' : 'restore', currentUserId);
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

  async setPassword(accountId: string, id: string, input: SetPasswordInput, actorId?: string) {
    const before = await this.prisma.client.employee.findFirst({
      where: { id, accountId },
      select: { id: true, username: true },
    });
    if (!before) throw new NotFoundException('Xodim topilmadi');

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
    // Audit the login change + password reset — NEVER the password itself.
    await this.writeAudit(accountId, id, 'password-reset', actorId, {
      username: { before: before.username, after: input.username },
    });
    return { ok: true };
  }

  // ── moysklad employee card «Изображение» ──────────────────────────────────

  /** Raw bytes for <img src> / download. 404 when the employee has no photo. */
  async getImageRaw(accountId: string, id: string) {
    const emp = await this.prisma.client.employee.findFirst({
      where: { id, accountId },
      select: { imageContent: true, imageMime: true, attributes: true },
    });
    if (!emp) throw new NotFoundException('Xodim topilmadi');
    if (!emp.imageContent || !emp.imageMime) throw new NotFoundException('Rasm yuklanmagan');
    return {
      buffer: Buffer.from(emp.imageContent),
      mime: emp.imageMime,
      filename: readEmployeeSystemAttrs(emp.attributes).imageName ?? 'photo',
    };
  }

  /**
   * Upload/replace the card photo. Deliberately does NOT bump `version`:
   * the photo is uploaded immediately (outside the card's Сохранить flow),
   * so bumping would 409 the form's later save for no data reason.
   */
  async setImage(accountId: string, id: string, input: SetEmployeeImageInput, actorId?: string) {
    const current = await this.prisma.client.employee.findFirst({
      where: { id, accountId },
      select: { id: true, attributes: true },
    });
    if (!current) throw new NotFoundException('Xodim topilmadi');

    // data:image/png;base64,xxx URL yoki yalang'och base64 — ikkalasi ham.
    const b64 = input.dataBase64.includes(',')
      ? input.dataBase64.slice(input.dataBase64.indexOf(',') + 1)
      : input.dataBase64;
    const buffer = Buffer.from(b64, 'base64');
    if (buffer.length === 0) throw new BadRequestException("Bo'sh fayl yuklab bo'lmaydi");
    const MAX_BYTES = 4_000_000;
    if (buffer.length > MAX_BYTES) {
      throw new BadRequestException(
        `Rasm hajmi ${(buffer.length / 1_000_000).toFixed(1)} MB — chegara 4 MB`,
      );
    }

    const beforeName = readEmployeeSystemAttrs(current.attributes).imageName ?? null;
    await this.prisma.client.employee.update({
      where: { id },
      data: {
        imageContent: buffer,
        imageMime: input.mime,
        attributes: mergeEmployeeSystemAttrs(current.attributes, {
          imageName: input.filename,
        }) as object,
      },
      select: { id: true },
    });
    await this.writeAudit(accountId, id, 'update', actorId, {
      image: { before: beforeName, after: input.filename },
    });
    return { ok: true };
  }

  /** Remove the card photo (moysklad ⊗). No version bump — see setImage. */
  async removeImage(accountId: string, id: string, actorId?: string) {
    const current = await this.prisma.client.employee.findFirst({
      where: { id, accountId },
      select: { id: true, attributes: true, imageMime: true },
    });
    if (!current) throw new NotFoundException('Xodim topilmadi');
    if (!current.imageMime) return { ok: true }; // idempotent

    const beforeName = readEmployeeSystemAttrs(current.attributes).imageName ?? null;
    // Drop the key explicitly — an `undefined` property inside a Prisma Json
    // payload is not a reliable delete (and biome bans the delete operator).
    const nextAttrs = mergeEmployeeSystemAttrs(current.attributes, {});
    const { imageName: _dropped, ...sysRest } = nextAttrs[EMPLOYEE_SYSTEM_KEY] as Record<
      string,
      unknown
    >;
    nextAttrs[EMPLOYEE_SYSTEM_KEY] = sysRest;
    await this.prisma.client.employee.update({
      where: { id },
      data: {
        imageContent: null,
        imageMime: null,
        attributes: nextAttrs as object,
      },
      select: { id: true },
    });
    await this.writeAudit(accountId, id, 'update', actorId, {
      image: { before: beforeName, after: null },
    });
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
