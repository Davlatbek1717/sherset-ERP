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
import {
  type CreateProductFolderInput,
  CreateProductFolderSchema,
  ProductFolderFilterSchema,
  UpdateProductFolderSchema,
} from './product-folder.schema.js';

@Injectable()
export class ProductFolderService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string, rawFilter: unknown) {
    const filter = ProductFolderFilterSchema.parse(rawFilter);
    const where: Prisma.ProductFolderWhereInput = {
      accountId,
      archived: filter.archived,
      ...(filter.parentId !== undefined ? { parentId: filter.parentId } : {}),
      ...(filter.search
        ? {
            OR: [
              { name: { contains: filter.search, mode: 'insensitive' } },
              { code: { contains: filter.search, mode: 'insensitive' } },
              { pathName: { contains: filter.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const items = await this.prisma.client.productFolder.findMany({
      where,
      orderBy: [{ pathName: 'asc' }, { name: 'asc' }],
      take: filter.limit,
      include: {
        parent: { select: { id: true, name: true, pathName: true } },
        _count: { select: { children: true, products: true } },
      },
    });
    const total = await this.prisma.client.productFolder.count({ where });

    return { items, total };
  }

  /** Full tree (up to a reasonable depth). */
  async tree(accountId: string) {
    // Load all folders for this account, build tree in memory (simple for
    // Sprint 2; revisit with CTE for > 10k folders in future).
    const flat = await this.prisma.client.productFolder.findMany({
      where: { accountId, archived: false },
      orderBy: [{ pathName: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        parentId: true,
        name: true,
        code: true,
        externalCode: true,
        pathName: true,
        vat: true,
        vatEnabled: true,
        useParentVat: true,
      },
    });

    // attach _count for children and products in single aggregated query
    const counts = await this.prisma.client.product.groupBy({
      by: ['productFolderId'],
      where: { accountId, deletedAt: null, archived: false },
      _count: { _all: true },
    });
    const productCountByFolder = new Map<string, number>(
      counts
        .filter((c) => c.productFolderId)
        .map((c) => [c.productFolderId as string, c._count._all]),
    );

    type Node = (typeof flat)[number] & {
      children: Node[];
      productCount: number;
    };
    const map = new Map<string, Node>();
    for (const f of flat) {
      map.set(f.id, { ...f, children: [], productCount: productCountByFolder.get(f.id) ?? 0 });
    }
    const roots: Node[] = [];
    for (const node of map.values()) {
      if (node.parentId && map.has(node.parentId)) {
        map.get(node.parentId)?.children.push(node);
      } else {
        roots.push(node);
      }
    }
    return { items: roots, total: flat.length };
  }

  async findById(accountId: string, id: string) {
    const folder = await this.prisma.client.productFolder.findFirst({
      where: { id, accountId },
      include: {
        parent: { select: { id: true, name: true, pathName: true } },
        children: {
          where: { archived: false },
          orderBy: { name: 'asc' },
          select: { id: true, name: true, code: true, pathName: true },
        },
      },
    });
    if (!folder) throw new NotFoundException(`Folder ${id} not found`);
    return folder;
  }

  async create(accountId: string, userId: string, raw: unknown) {
    const input = this.parseCreate(raw);
    await this.validateParent(accountId, input.parentId);
    const pathName = await this.computePathName(accountId, input.parentId ?? null, input.name);
    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, userId);

    try {
      const created = await this.prisma.client.productFolder.create({
        data: {
          accountId,
          groupId: creatorGroupId,
          name: input.name,
          code: input.code,
          externalCode: input.externalCode,
          description: input.description,
          parentId: input.parentId,
          pathName,
          vat: input.vat ?? null,
          vatEnabled: input.vatEnabled,
          useParentVat: input.useParentVat,
          taxSystem: input.taxSystem,
        },
      });
      await this.logAudit(accountId, userId, 'create', created.id, null);
      return created;
    } catch (e) {
      this.handlePrismaError(e);
    }
  }

  async update(accountId: string, userId: string, id: string, raw: unknown) {
    const input = UpdateProductFolderSchema.parse(raw);
    const existing = await this.findById(accountId, id);

    if (input.parentId !== undefined && input.parentId !== existing.parentId) {
      if (input.parentId === id) {
        throw new BadRequestException("Guruh o'zini ota guruh qila olmaydi");
      }
      await this.validateParent(accountId, input.parentId, id);
    }

    const data: Prisma.ProductFolderUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.code !== undefined) data.code = input.code;
    if (input.externalCode !== undefined) data.externalCode = input.externalCode;
    if (input.description !== undefined) data.description = input.description;
    if (input.parentId !== undefined) {
      data.parent = input.parentId ? { connect: { id: input.parentId } } : { disconnect: true };
    }
    if (input.vat !== undefined) data.vat = input.vat;
    if (input.vatEnabled !== undefined) data.vatEnabled = input.vatEnabled;
    if (input.useParentVat !== undefined) data.useParentVat = input.useParentVat;
    if (input.taxSystem !== undefined) data.taxSystem = input.taxSystem;

    // If name or parent changed, recompute pathName for this + descendants
    if (input.name !== undefined || input.parentId !== undefined) {
      const newName = input.name ?? existing.name;
      const newParentId = input.parentId !== undefined ? input.parentId : existing.parentId;
      data.pathName = await this.computePathName(accountId, newParentId ?? null, newName);
    }

    try {
      const updated = await this.prisma.client.productFolder.update({
        where: { id, accountId },
        data,
      });
      // Recompute descendants' pathNames if name/parent changed
      if (input.name !== undefined || input.parentId !== undefined) {
        await this.recomputeDescendantPaths(accountId, id);
      }
      const diff = this.computeDiff(existing, updated);
      if (Object.keys(diff).length) {
        await this.logAudit(accountId, userId, 'update', id, diff);
      }
      return updated;
    } catch (e) {
      this.handlePrismaError(e);
    }
  }

  async archive(accountId: string, userId: string, id: string, archived: boolean) {
    await this.findById(accountId, id);
    const updated = await this.prisma.client.productFolder.update({
      where: { id, accountId },
      data: { archived },
    });
    await this.logAudit(accountId, userId, archived ? 'archived' : 'restored', id, null);
    return updated;
  }

  async delete(accountId: string, userId: string, id: string) {
    const folder = await this.prisma.client.productFolder.findFirst({
      where: { id, accountId },
      include: { _count: { select: { children: true, products: true } } },
    });
    if (!folder) throw new NotFoundException(`Folder ${id} not found`);
    if (folder._count.children > 0) {
      throw new ConflictException(
        `Guruh ichida ${folder._count.children} ta sub-guruh bor \u2014 avval ularni o'chiring`,
      );
    }
    if (folder._count.products > 0) {
      throw new ConflictException(
        `Guruh ichida ${folder._count.products} ta tovar bor \u2014 avval ularni boshqa guruhga ko'chiring`,
      );
    }
    await this.prisma.client.productFolder.delete({ where: { id, accountId } });
    await this.logAudit(accountId, userId, 'delete', id, null);
    return { ok: true };
  }

  // --- helpers ---

  private parseCreate(raw: unknown): CreateProductFolderInput {
    const parsed = CreateProductFolderSchema.safeParse(raw);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(', '));
    }
    return parsed.data;
  }

  private async validateParent(
    accountId: string,
    parentId: string | null | undefined,
    excludeId?: string,
  ): Promise<void> {
    if (!parentId) return;
    const parent = await this.prisma.client.productFolder.findFirst({
      where: { id: parentId, accountId },
    });
    if (!parent) throw new BadRequestException('Ota guruh topilmadi');

    // Prevent cycles: walk ancestors and ensure excludeId isn't in chain
    if (excludeId) {
      let cur: string | null = parentId;
      const seen = new Set<string>();
      while (cur) {
        if (cur === excludeId) {
          throw new BadRequestException("Sikl hosil bo'ladi: guruh o'z nasliga ota bo'la olmaydi");
        }
        if (seen.has(cur)) break;
        seen.add(cur);
        const nextRow: { parentId: string | null } | null =
          await this.prisma.client.productFolder.findFirst({
            where: { id: cur, accountId },
            select: { parentId: true },
          });
        cur = nextRow?.parentId ?? null;
      }
    }
  }

  private async computePathName(
    accountId: string,
    parentId: string | null,
    name: string,
  ): Promise<string> {
    if (!parentId) return name;
    const parent = await this.prisma.client.productFolder.findFirst({
      where: { id: parentId, accountId },
      select: { pathName: true, name: true },
    });
    if (!parent) return name;
    return `${parent.pathName ?? parent.name}/${name}`;
  }

  private async recomputeDescendantPaths(accountId: string, rootId: string): Promise<void> {
    // BFS from rootId, update each descendant's pathName
    const queue: string[] = [rootId];
    while (queue.length) {
      const parentId = queue.shift();
      if (parentId === undefined) break;
      const parent = await this.prisma.client.productFolder.findFirst({
        where: { id: parentId, accountId },
        select: { pathName: true, name: true },
      });
      if (!parent) continue;
      const children = await this.prisma.client.productFolder.findMany({
        where: { parentId, accountId },
        select: { id: true, name: true },
      });
      for (const c of children) {
        const newPath = `${parent.pathName ?? parent.name}/${c.name}`;
        await this.prisma.client.productFolder.update({
          where: { id: c.id, accountId },
          data: { pathName: newPath },
        });
        queue.push(c.id);
      }
    }
  }

  private computeDiff(
    before: Record<string, unknown>,
    after: Record<string, unknown>,
  ): Record<string, { before: unknown; after: unknown }> {
    const diff: Record<string, { before: unknown; after: unknown }> = {};
    for (const key of Object.keys(after)) {
      if (key === 'updatedAt' || key === 'createdAt') continue;
      const b = before[key];
      const a = after[key];
      if (JSON.stringify(b) !== JSON.stringify(a)) {
        diff[key] = { before: b, after: a };
      }
    }
    return diff;
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
        entity: 'ProductFolder',
        entityId,
        action,
        fieldChanges: fieldChanges as Prisma.InputJsonValue | undefined,
      },
    });
  }

  private handlePrismaError(e: unknown): never {
    const err = e as { code?: string; meta?: { target?: string[] } };
    if (err.code === 'P2002') {
      throw new ConflictException(
        `Bu kod bilan guruh allaqachon mavjud: ${err.meta?.target?.join(', ')}`,
      );
    }
    throw e as Error;
  }
}
