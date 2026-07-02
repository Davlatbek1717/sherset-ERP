import { Prisma } from '@moysklad/db';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AttributeMetadataService } from '../attribute-metadata/attribute-metadata.service.js';
import { mapVersionedUpdateError } from '../shared/optimistic-lock.js';
import {
  type CreateStoreInput,
  CreateStoreSchema,
  StoreFilterSchema,
  type UpdateStoreInput,
  UpdateStoreSchema,
} from './store.schema.js';

const PATH_SEP = ' / ';
const MAX_DEPTH = 8;

/**
 * StoreService — admin CRUD + warehouse hierarchy.
 *
 * Owns the cached `pathName` ("Main / Section A / Shelf 1"): recomputed
 * on every parent change (create + update). Cycle guard walks ancestors
 * up to MAX_DEPTH; rejects on self-reference or back-loop.
 *
 * Sprint 17.7 — full moysklad parity:
 *   • externalCode (1C / partner sync key)
 *   • addressFull (structured address bag — postcode/region/city/...)
 *   • attributes (validated via AttributeMetadata for entity='Store')
 */
@Injectable()
export class StoreService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AttributeMetadataService) private readonly attrs: AttributeMetadataService,
  ) {}

  async list(accountId: string, rawFilter: unknown) {
    const filter = StoreFilterSchema.parse(rawFilter);
    const where: Prisma.StoreWhereInput = {
      accountId,
      ...(filter.archived !== undefined ? { archived: filter.archived } : { archived: false }),
      ...(filter.parentId !== undefined ? { parentId: filter.parentId } : {}),
      ...(filter.search
        ? {
            OR: [
              { name: { contains: filter.search, mode: 'insensitive' } },
              { code: { contains: filter.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.client.store.findMany({
      where,
      orderBy: { [filter.sortBy]: filter.sortDir },
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    const total = await this.prisma.client.store.count({ where });
    return { items, nextCursor, total };
  }

  async findById(accountId: string, id: string) {
    const row = await this.prisma.client.store.findFirst({ where: { id, accountId } });
    if (!row) throw new NotFoundException(`Store ${id} not found`);
    return row;
  }

  async create(accountId: string, raw: unknown) {
    const parsed = this.parseCreate(raw);
    if (parsed.code) {
      const dup = await this.prisma.client.store.findFirst({
        where: { accountId, code: parsed.code },
        select: { id: true },
      });
      if (dup) {
        throw new BadRequestException(`Kod "${parsed.code}" allaqachon ishlatilgan`);
      }
    }

    const pathName = parsed.parentId
      ? await this.computePathName(accountId, parsed.parentId, parsed.name)
      : parsed.name;

    const validatedAttrs = await this.attrs.validateAndNormalize(
      accountId,
      'Store',
      parsed.attributes,
    );

    return this.prisma.client.store.create({
      data: {
        accountId,
        name: parsed.name,
        code: parsed.code ?? null,
        externalCode: parsed.externalCode ?? null,
        description: parsed.description ?? null,
        address: parsed.address ?? null,
        addressFull:
          parsed.addressFull == null
            ? Prisma.JsonNull
            : (parsed.addressFull as Prisma.InputJsonValue),
        attributes: validatedAttrs as Prisma.InputJsonValue,
        parentId: parsed.parentId ?? null,
        ownerId: parsed.ownerId ?? null,
        pathName,
        zones: parsed.zones,
        slots: parsed.slots,
        shared: parsed.shared,
        allowNegativeStock: parsed.allowNegativeStock,
      },
      include: { owner: { select: { id: true, name: true } } },
    });
  }

  async update(accountId: string, id: string, raw: unknown) {
    const parsed = this.parseUpdate(raw);
    const existing = await this.findById(accountId, id);
    if (parsed.code !== undefined && parsed.code !== null) {
      const dup = await this.prisma.client.store.findFirst({
        where: { accountId, code: parsed.code, NOT: { id } },
        select: { id: true },
      });
      if (dup) {
        throw new BadRequestException(`Kod "${parsed.code}" allaqachon ishlatilgan`);
      }
    }

    // Cycle guard — a store can't be its own ancestor.
    if (parsed.parentId !== undefined && parsed.parentId !== null) {
      if (parsed.parentId === id) {
        throw new BadRequestException("Ombor o'zining ota-ombori bo'la olmaydi");
      }
      await this.assertNotAncestor(accountId, id, parsed.parentId);
    }

    const data: Prisma.StoreUpdateInput = {};
    if (parsed.name !== undefined) data.name = parsed.name;
    if (parsed.code !== undefined) data.code = parsed.code;
    if (parsed.externalCode !== undefined) data.externalCode = parsed.externalCode;
    if (parsed.description !== undefined) data.description = parsed.description;
    if (parsed.address !== undefined) data.address = parsed.address;
    if (parsed.addressFull !== undefined) {
      data.addressFull =
        parsed.addressFull === null
          ? Prisma.JsonNull
          : (parsed.addressFull as Prisma.InputJsonValue);
    }
    if (parsed.attributes !== undefined) {
      const validated = await this.attrs.validateAndNormalize(
        accountId,
        'Store',
        parsed.attributes,
      );
      data.attributes = validated as Prisma.InputJsonValue;
    }
    if (parsed.allowNegativeStock !== undefined)
      data.allowNegativeStock = parsed.allowNegativeStock;
    if (parsed.shared !== undefined) data.shared = parsed.shared;
    if (parsed.zones !== undefined) data.zones = parsed.zones;
    if (parsed.slots !== undefined) data.slots = parsed.slots;
    if (parsed.parentId !== undefined) {
      data.parent =
        parsed.parentId === null ? { disconnect: true } : { connect: { id: parsed.parentId } };
    }
    if (parsed.ownerId !== undefined) {
      data.owner =
        parsed.ownerId === null ? { disconnect: true } : { connect: { id: parsed.ownerId } };
    }

    // Recompute pathName when name or parentId changed.
    const nameChanged = parsed.name !== undefined && parsed.name !== existing.name;
    const parentChanged = parsed.parentId !== undefined && parsed.parentId !== existing.parentId;
    if (nameChanged || parentChanged) {
      const newName = parsed.name ?? existing.name;
      const newParentId = parsed.parentId === undefined ? existing.parentId : parsed.parentId;
      data.pathName = newParentId
        ? await this.computePathName(accountId, newParentId, newName)
        : newName;
    }

    try {
      // Optimistic lock: the version filter matches only if no concurrent write
      // bumped the version since the form loaded. findById above proves the row
      // exists, so a P2025 here is a concurrency conflict, not a missing row.
      const updated = await this.prisma.client.store.update({
        where: { id, accountId, version: parsed.version },
        data: { ...data, version: { increment: 1 } },
      });

      // Cascade pathName refresh to descendants if the path changed.
      if (data.pathName !== undefined) {
        await this.refreshDescendantPaths(accountId, id);
      }

      return updated;
    } catch (e) {
      mapVersionedUpdateError(e, 'Store');
      throw e;
    }
  }

  async archive(accountId: string, id: string) {
    await this.findById(accountId, id);
    return this.prisma.client.store.update({
      where: { id, accountId },
      data: { archived: true },
    });
  }

  async restore(accountId: string, id: string) {
    await this.findById(accountId, id);
    return this.prisma.client.store.update({
      where: { id, accountId },
      data: { archived: false },
    });
  }

  async delete(accountId: string, id: string) {
    await this.findById(accountId, id);
    const usedIn = await this.prisma.client.stock.count({
      where: { accountId, storeId: id, qty: { not: 0 } },
    });
    if (usedIn > 0) {
      throw new BadRequestException(
        `Omborda ${usedIn} ta tovar qoldig'i bor — o'chirib bo'lmaydi (avval transferlang)`,
      );
    }
    const childCount = await this.prisma.client.store.count({
      where: { accountId, parentId: id },
    });
    if (childCount > 0) {
      throw new BadRequestException(
        `Omborda ${childCount} ta ichki ombor bor — avval ularni boshqasiga bog'lang yoki o'chiring`,
      );
    }
    await this.prisma.client.store.delete({ where: { id, accountId } });
    return { ok: true };
  }

  // -------------------------------------------------------------------
  // Path computation
  // -------------------------------------------------------------------

  private async computePathName(
    accountId: string,
    parentId: string,
    selfName: string,
  ): Promise<string> {
    const parent = await this.prisma.client.store.findFirst({
      where: { id: parentId, accountId },
      select: { pathName: true, name: true },
    });
    if (!parent) {
      throw new BadRequestException(`Ota ombor topilmadi: ${parentId}`);
    }
    const parentPath = parent.pathName ?? parent.name;
    return `${parentPath}${PATH_SEP}${selfName}`;
  }

  private async assertNotAncestor(
    accountId: string,
    selfId: string,
    candidateParentId: string,
  ): Promise<void> {
    let cursor: string | null = candidateParentId;
    for (let depth = 0; depth < MAX_DEPTH; depth++) {
      if (cursor === null) return;
      if (cursor === selfId) {
        throw new BadRequestException("Tsikl: bu ombor o'z avlodi bo'lishi mumkin emas");
      }
      const next: { parentId: string | null } | null = await this.prisma.client.store.findFirst({
        where: { id: cursor, accountId },
        select: { parentId: true },
      });
      if (!next) return;
      cursor = next.parentId;
    }
    throw new BadRequestException(`Hierarchy depth exceeded ${MAX_DEPTH}`);
  }

  private async refreshDescendantPaths(accountId: string, parentId: string): Promise<void> {
    const children = await this.prisma.client.store.findMany({
      where: { accountId, parentId },
      select: { id: true, name: true },
    });
    if (children.length === 0) return;
    const parent = await this.prisma.client.store.findFirst({
      where: { id: parentId, accountId },
      select: { pathName: true, name: true },
    });
    const parentPath = parent?.pathName ?? parent?.name ?? '';
    for (const child of children) {
      const childPath = `${parentPath}${PATH_SEP}${child.name}`;
      await this.prisma.client.store.update({
        where: { id: child.id, accountId },
        data: { pathName: childPath },
      });
      await this.refreshDescendantPaths(accountId, child.id);
    }
  }

  private parseCreate(raw: unknown): CreateStoreInput {
    const r = CreateStoreSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private parseUpdate(raw: unknown): UpdateStoreInput {
    const r = UpdateStoreSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }
}
