import type { Prisma } from '@moysklad/db';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { resolveCreatorGroupId } from '../shared/group-stamp.js';
import { assertMassEditRefsInTenant } from '../shared/mass-edit.js';
import { mapVersionedUpdateError } from '../shared/optimistic-lock.js';
import {
  type CreateProjectInput,
  CreateProjectSchema,
  ProjectFilterSchema,
  type UpdateProjectInput,
  UpdateProjectSchema,
} from './project.schema.js';

@Injectable()
export class ProjectService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Cursor-paginated list. The customer-order detail picker only ever
   * shows non-archived projects, so an absent `archived` param defaults
   * to `false`. The Settings → Проекты catalog passes it explicitly to
   * toggle the archived view. Search matches name / code / description
   * (the moysklad list search placeholder is «Наименование, код или
   * описание»). `items` is preserved for the existing picker callers;
   * `nextCursor` / `total` are additive.
   */
  async list(accountId: string, raw: unknown) {
    const filter = ProjectFilterSchema.parse(raw);
    const where: Prisma.ProjectWhereInput = {
      accountId,
      archived: filter.archived ?? false,
      ...(filter.search
        ? {
            OR: [
              { name: { contains: filter.search, mode: 'insensitive' } },
              { code: { contains: filter.search, mode: 'insensitive' } },
              { description: { contains: filter.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const rows = await this.prisma.client.project.findMany({
      where,
      orderBy: { [filter.sortBy]: filter.sortDir },
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        name: true,
        code: true,
        description: true,
        archived: true,
      },
    });
    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    // Only the Settings catalog page asks for a count (withTotal); the
    // document pickers omit it and discard `total`, so skip the extra COUNT
    // on that hot, debounced-keystroke path.
    const total = filter.withTotal ? await this.prisma.client.project.count({ where }) : undefined;
    return { items, nextCursor, total };
  }

  async findById(accountId: string, id: string) {
    const project = await this.prisma.client.project.findFirst({
      where: { id, accountId },
    });
    if (!project) throw new NotFoundException(`Project ${id} not found`);
    return project;
  }

  /** Create — `ownerId` defaults to the creating employee (moysklad sets
   * Владелец = creator on new справочник rows). */
  async create(accountId: string, ownerId: string, raw: unknown) {
    const parsed = this.parseCreate(raw);
    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, ownerId);
    try {
      return await this.prisma.client.project.create({
        data: {
          accountId,
          ownerId,
          groupId: creatorGroupId,
          name: parsed.name,
          code: parsed.code,
          externalCode: parsed.externalCode,
          description: parsed.description,
        },
      });
    } catch (e) {
      this.handlePrisma(e);
    }
  }

  async update(accountId: string, id: string, raw: unknown) {
    const parsed = this.parseUpdate(raw);
    await this.findById(accountId, id);

    const data: Prisma.ProjectUpdateInput = {};
    if (parsed.name !== undefined) data.name = parsed.name;
    if (parsed.code !== undefined) data.code = parsed.code;
    if (parsed.externalCode !== undefined) data.externalCode = parsed.externalCode;
    if (parsed.description !== undefined) data.description = parsed.description;

    try {
      // Optimistic lock: version scalar predicate ensures the row is unchanged
      // since the form loaded. findById above proves the row exists, so P2025
      // here means a concurrent edit — surface it as 409.
      return await this.prisma.client.project.update({
        where: { id, accountId, version: parsed.version },
        data: { ...data, version: { increment: 1 } },
      });
    } catch (e) {
      mapVersionedUpdateError(e, 'Project');
      this.handlePrisma(e);
    }
  }

  async archive(accountId: string, id: string) {
    await this.findById(accountId, id);
    return this.prisma.client.project.update({
      where: { id, accountId },
      data: { archived: true },
    });
  }

  async restore(accountId: string, id: string) {
    await this.findById(accountId, id);
    return this.prisma.client.project.update({
      where: { id, accountId },
      data: { archived: false },
    });
  }

  /**
   * Hard delete. Every document FK to Project is `onDelete: SetNull`
   * (projectId is nullable everywhere), so deleting a project simply
   * detaches it from its documents — there is no FK-Restrict to catch
   * (unlike employees). Tenant-scoped via the findById guard + the
   * `accountId` in the delete where-clause.
   */
  async delete(accountId: string, id: string) {
    await this.findById(accountId, id);
    await this.prisma.client.project.delete({ where: { id, accountId } });
    return { ok: true };
  }

  /**
   * mass-edit single-row apply. Project has owner + description but
   * (obviously) no projectId, so the controller restricts the patch to
   * `ownerId` + `description`.
   */
  async massEditApply(
    accountId: string,
    id: string,
    patch: { ownerId?: string | null; description?: string | null },
  ) {
    await this.findById(accountId, id);
    // Scalar FK assignment (mirrors price-list.service massEditApply) —
    // `ownerId: null` clears the owner, a uuid re-points it.
    await assertMassEditRefsInTenant(this.prisma, accountId, patch);
    const data: Record<string, unknown> = {};
    if ('ownerId' in patch) data.ownerId = patch.ownerId;
    if ('description' in patch) data.description = patch.description;
    return this.prisma.client.project.update({ where: { id, accountId }, data });
  }

  // =====================================================================
  // helpers
  // =====================================================================

  private parseCreate(raw: unknown): CreateProjectInput {
    const r = CreateProjectSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private parseUpdate(raw: unknown): UpdateProjectInput {
    const r = UpdateProjectSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private handlePrisma(e: unknown): never {
    const err = e as { code?: string; meta?: { target?: string[] } };
    if (err.code === 'P2002') {
      throw new ConflictException('Bu kod bilan loyiha allaqachon mavjud');
    }
    throw e as Error;
  }
}
