import { randomBytes } from 'node:crypto';
import { Prisma } from '@moysklad/db';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AttributeMetadataService } from '../attribute-metadata/attribute-metadata.service.js';
import { mapVersionedUpdateError } from '../shared/optimistic-lock.js';
import {
  type BulkMoveInput,
  BulkMoveSchema,
  type BulkUpdateInput,
  BulkUpdateSchema,
  type CreateStoreInput,
  CreateStoreSchema,
  StoreFilterSchema,
  type UpdateStoreInput,
  UpdateStoreSchema,
} from './store.schema.js';

const PATH_SEP = ' / ';
const MAX_DEPTH = 8;

// «Проводить инвентаризацию по ячейкам» lives inside the attributes JSON under
// this reserved key (adding a real column needs a migration — forbidden on this
// box, see NEXT.md). validateAndNormalize() strips unknown codes, so the service
// merges the flag back in after validation and lifts it on every read.
const CELL_INVENTORY_KEY = '__cellInventory';

/** moysklad autogenerates a random externalCode for every new store. */
function generateExternalCode(): string {
  // 22 url-safe chars — same shape as moysklad's generated codes.
  return randomBytes(18).toString('base64url').slice(0, 22);
}

const OWNER_INCLUDE = {
  owner: { select: { id: true, name: true } },
  group: { select: { id: true, name: true } },
  parent: { select: { id: true, name: true } },
} satisfies Prisma.StoreInclude;

type StoreRow =
  | Prisma.StoreGetPayload<{ include: typeof OWNER_INCLUDE }>
  | Prisma.StoreGetPayload<Record<string, never>>;

/** Lift the reserved attributes key to a top-level `cellInventory` boolean. */
function serializeStore<T extends StoreRow>(row: T) {
  const attrs = (row.attributes ?? {}) as Record<string, unknown>;
  const { [CELL_INVENTORY_KEY]: cellInventory, ...rest } = attrs;
  return { ...row, attributes: rest, cellInventory: cellInventory === true };
}

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
    // «Показывать»: 'all' disables the archived filter entirely (moysklad shows
    // active + archived mixed); default = active only. Legacy `archived` param
    // (settings list / older callers) still honoured when `show` is absent.
    const archivedWhere =
      filter.show === 'all'
        ? {}
        : filter.show === 'active'
          ? { archived: false }
          : filter.archived !== undefined
            ? { archived: filter.archived }
            : { archived: false };
    const where: Prisma.StoreWhereInput = {
      accountId,
      ...archivedWhere,
      ...(filter.parentId !== undefined
        ? { parentId: filter.parentId === 'root' ? null : filter.parentId }
        : {}),
      ...(filter.name ? { name: { contains: filter.name, mode: 'insensitive' } } : {}),
      ...(filter.code ? { code: { contains: filter.code, mode: 'insensitive' } } : {}),
      ...(filter.address ? { address: { contains: filter.address, mode: 'insensitive' } } : {}),
      ...(filter.ownerId ? { ownerId: filter.ownerId } : {}),
      ...(filter.groupId ? { groupId: filter.groupId } : {}),
      ...(filter.shared !== undefined ? { shared: filter.shared } : {}),
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
      include: OWNER_INCLUDE,
      orderBy: { [filter.sortBy]: filter.sortDir },
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    const total = await this.prisma.client.store.count({ where });
    return { items: items.map(serializeStore), nextCursor, total };
  }

  async findById(accountId: string, id: string) {
    const row = await this.prisma.client.store.findFirst({
      where: { id, accountId },
      include: OWNER_INCLUDE,
    });
    if (!row) throw new NotFoundException(`Store ${id} not found`);
    return serializeStore(row);
  }

  async create(accountId: string, raw: unknown, creatorEmployeeId?: string) {
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
    if (parsed.cellInventory !== undefined) {
      validatedAttrs[CELL_INVENTORY_KEY] = parsed.cellInventory;
    }

    const row = await this.prisma.client.store.create({
      data: {
        accountId,
        name: parsed.name,
        code: parsed.code ?? null,
        // moysklad always autogenerates an external code for a new store.
        externalCode: parsed.externalCode ?? generateExternalCode(),
        description: parsed.description ?? null,
        address: parsed.address ?? null,
        addressFull:
          parsed.addressFull == null
            ? Prisma.JsonNull
            : (parsed.addressFull as Prisma.InputJsonValue),
        attributes: validatedAttrs as Prisma.InputJsonValue,
        parentId: parsed.parentId ?? null,
        // moysklad: owner defaults to the creating employee when not chosen.
        ownerId: parsed.ownerId ?? creatorEmployeeId ?? null,
        groupId: parsed.groupId ?? null,
        pathName,
        zones: parsed.zones,
        slots: parsed.slots,
        shared: parsed.shared,
        allowNegativeStock: parsed.allowNegativeStock,
      },
      include: OWNER_INCLUDE,
    });
    return serializeStore(row);
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
    if (parsed.attributes !== undefined || parsed.cellInventory !== undefined) {
      // Re-validate custom attrs when sent; otherwise start from the stored bag
      // (minus the lifted flag) so a cellInventory-only PATCH can't wipe attrs.
      const base =
        parsed.attributes !== undefined
          ? await this.attrs.validateAndNormalize(accountId, 'Store', parsed.attributes)
          : { ...(existing.attributes as Record<string, unknown>) };
      const cellInventory =
        parsed.cellInventory !== undefined ? parsed.cellInventory : existing.cellInventory;
      if (cellInventory !== undefined) base[CELL_INVENTORY_KEY] = cellInventory;
      data.attributes = base as Prisma.InputJsonValue;
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
    if (parsed.groupId !== undefined) {
      data.group =
        parsed.groupId === null ? { disconnect: true } : { connect: { id: parsed.groupId } };
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
        include: OWNER_INCLUDE,
      });

      // Cascade pathName refresh to descendants if the path changed.
      if (data.pathName !== undefined) {
        await this.refreshDescendantPaths(accountId, id);
      }

      return serializeStore(updated);
    } catch (e) {
      mapVersionedUpdateError(e, 'Store');
      throw e;
    }
  }

  /**
   * «Копировать» — clone the card (fields + address-storage zones/cells).
   * `code` is NOT copied (unique per account); externalCode is regenerated.
   * Name gets a « (копия)» suffix. Not verified against live moysklad naming
   * (no writes were made to the reference account) — see GROUND.md.
   */
  async clone(accountId: string, id: string) {
    const src = await this.prisma.client.store.findFirst({
      where: { id, accountId },
      include: { addressZones: true, cells: true },
    });
    if (!src) throw new NotFoundException(`Store ${id} not found`);

    return this.prisma.client.$transaction(async (tx) => {
      const copy = await tx.store.create({
        data: {
          accountId,
          name: `${src.name} (копия)`,
          code: null,
          externalCode: generateExternalCode(),
          description: src.description,
          address: src.address,
          addressFull:
            src.addressFull === null ? Prisma.JsonNull : (src.addressFull as Prisma.InputJsonValue),
          attributes: (src.attributes ?? {}) as Prisma.InputJsonValue,
          parentId: src.parentId,
          ownerId: src.ownerId,
          groupId: src.groupId,
          pathName:
            src.parentId && src.pathName
              ? src.pathName.replace(/[^/]+$/, `${src.name} (копия)`)
              : `${src.name} (копия)`,
          zones: src.zones,
          slots: src.slots,
          shared: src.shared,
          allowNegativeStock: src.allowNegativeStock,
        },
      });
      // Address-storage structure: zones first (id remap), then cells.
      const zoneMap = new Map<string, string>();
      for (const z of src.addressZones) {
        const nz = await tx.storeZone.create({
          data: { accountId, storeId: copy.id, name: z.name, sortOrder: z.sortOrder },
        });
        zoneMap.set(z.id, nz.id);
      }
      for (const c of src.cells) {
        await tx.storeCell.create({
          data: {
            accountId,
            storeId: copy.id,
            name: c.name,
            barcode: c.barcode,
            sortOrder: c.sortOrder,
            zoneId: c.zoneId ? (zoneMap.get(c.zoneId) ?? null) : null,
          },
        });
      }
      return copy;
    });
  }

  /** «Переместить» — bulk re-parent with cycle guard + pathName cascade. */
  async bulkMove(accountId: string, raw: unknown) {
    const parsed: BulkMoveInput = BulkMoveSchema.parse(raw);
    const succeeded: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];
    for (const id of parsed.ids) {
      try {
        const existing = await this.prisma.client.store.findFirst({ where: { id, accountId } });
        if (!existing) throw new NotFoundException(`Store ${id} not found`);
        if (parsed.parentId !== null) {
          if (parsed.parentId === id) {
            throw new BadRequestException("Ombor o'zining ota-ombori bo'la olmaydi");
          }
          await this.assertNotAncestor(accountId, id, parsed.parentId);
        }
        const pathName = parsed.parentId
          ? await this.computePathName(accountId, parsed.parentId, existing.name)
          : existing.name;
        await this.prisma.client.store.update({
          where: { id, accountId },
          data: { parentId: parsed.parentId, pathName },
        });
        await this.refreshDescendantPaths(accountId, id);
        succeeded.push(id);
      } catch (e) {
        failed.push({ id, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return { total: parsed.ids.length, succeeded, failed };
  }

  /** «Массовое редактирование» — apply the opt-in patch to every selected store. */
  async bulkUpdate(accountId: string, raw: unknown) {
    const parsed: BulkUpdateInput = BulkUpdateSchema.parse(raw);
    const succeeded: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];
    for (const id of parsed.ids) {
      try {
        const existing = await this.prisma.client.store.findFirst({
          where: { id, accountId },
          select: { id: true },
        });
        if (!existing) throw new NotFoundException(`Store ${id} not found`);
        const data: Prisma.StoreUpdateInput = {};
        if (parsed.set.archived !== undefined) data.archived = parsed.set.archived;
        if (parsed.set.shared !== undefined) data.shared = parsed.set.shared;
        if (parsed.set.ownerId !== undefined) {
          data.owner =
            parsed.set.ownerId === null
              ? { disconnect: true }
              : { connect: { id: parsed.set.ownerId } };
        }
        if (parsed.set.groupId !== undefined) {
          data.group =
            parsed.set.groupId === null
              ? { disconnect: true }
              : { connect: { id: parsed.set.groupId } };
        }
        await this.prisma.client.store.update({ where: { id, accountId }, data });
        succeeded.push(id);
      } catch (e) {
        failed.push({ id, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return { total: parsed.ids.length, succeeded, failed };
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
