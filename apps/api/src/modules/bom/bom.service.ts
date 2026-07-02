import type { Prisma } from '@moysklad/db';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { mapVersionedUpdateError } from '../shared/optimistic-lock.js';
import {
  type BomComponentInput,
  BomFilterSchema,
  CreateBomSchema,
  SetBomComponentsSchema,
  UpdateBomSchema,
} from './bom.schema.js';

/**
 * BomService — full CRUD for BillOfMaterials + BomComponent management.
 *
 * standardCostMinor is recomputed on every create / update / setComponents
 * by summing (component.qty × product.buyPrice). Products without a buyPrice
 * contribute 0 to the cost.
 *
 * V1: No stock cascades. WorkOrder transitions are purely FSM.
 */
@Injectable()
export class BomService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  // =========================================================================
  // List
  // =========================================================================

  async list(accountId: string, rawFilter: unknown) {
    const filter = BomFilterSchema.parse(rawFilter);
    const where: Prisma.BillOfMaterialsWhereInput = {
      accountId,
      ...(filter.archived !== undefined ? { archived: filter.archived } : {}),
      ...(filter.search
        ? {
            OR: [
              { name: { contains: filter.search, mode: 'insensitive' } },
              { product: { name: { contains: filter.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const rows = await this.prisma.client.billOfMaterials.findMany({
      where,
      orderBy: { [filter.sortBy]: filter.sortDir },
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      include: {
        product: { select: { id: true, name: true, code: true, uom: true } },
        _count: { select: { components: true } },
      },
    });

    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    const total = await this.prisma.client.billOfMaterials.count({ where });

    return {
      items: items.map((r) => this.serializeBom(r)),
      nextCursor,
      total,
    };
  }

  // =========================================================================
  // Find by id
  // =========================================================================

  async findById(accountId: string, id: string) {
    const bom = await this.prisma.client.billOfMaterials.findFirst({
      where: { id, accountId },
      include: {
        product: { select: { id: true, name: true, code: true, uom: true } },
        components: {
          orderBy: { position: 'asc' },
          include: {
            product: { select: { id: true, name: true, code: true, uom: true, buyPrice: true } },
          },
        },
        _count: { select: { components: true } },
      },
    });
    if (!bom) throw new NotFoundException(`BOM ${id} topilmadi`);
    return this.serializeBomDetail(bom);
  }

  // =========================================================================
  // Create
  // =========================================================================

  async create(accountId: string, userId: string, raw: unknown) {
    const parsed = CreateBomSchema.parse(raw);
    await this.ensureProduct(accountId, parsed.productId);

    const standardCostMinor =
      parsed.components.length > 0
        ? await this.computeStandardCost(accountId, parsed.components)
        : 0n;

    try {
      const bom = await this.prisma.client.billOfMaterials.create({
        data: {
          accountId,
          name: parsed.name,
          productId: parsed.productId,
          outputQty: parsed.outputQty,
          description: parsed.description,
          externalCode: parsed.externalCode ?? null,
          standardCostMinor,
          components: {
            create: parsed.components.map((c, i) => ({
              accountId,
              productId: c.productId,
              qty: c.qty,
              position: c.position ?? i,
            })),
          },
        },
        include: {
          product: { select: { id: true, name: true, code: true, uom: true } },
          components: {
            orderBy: { position: 'asc' },
            include: {
              product: { select: { id: true, name: true, code: true, uom: true, buyPrice: true } },
            },
          },
          _count: { select: { components: true } },
        },
      });
      await this.logAudit(accountId, userId, 'create', bom.id);
      return this.serializeBomDetail(bom);
    } catch (e) {
      this.handlePrisma(e);
    }
  }

  // =========================================================================
  // Update
  // =========================================================================

  async update(accountId: string, userId: string, id: string, raw: unknown) {
    const parsed = UpdateBomSchema.parse(raw);
    const existing = await this.findById(accountId, id);

    if (parsed.productId && parsed.productId !== existing.productId) {
      await this.ensureProduct(accountId, parsed.productId);
    }

    const data: Prisma.BillOfMaterialsUpdateInput = {};
    if (parsed.name !== undefined) data.name = parsed.name;
    if (parsed.productId !== undefined) data.product = { connect: { id: parsed.productId } };
    if (parsed.outputQty !== undefined) data.outputQty = parsed.outputQty;
    if (parsed.description !== undefined) data.description = parsed.description;
    if (parsed.externalCode !== undefined) data.externalCode = parsed.externalCode ?? null;

    if (parsed.components !== undefined) {
      const standardCostMinor = await this.computeStandardCost(accountId, parsed.components);
      data.standardCostMinor = standardCostMinor;
      data.components = {
        deleteMany: { bomId: id },
        create: parsed.components.map((c, i) => ({
          accountId,
          productId: c.productId,
          qty: c.qty,
          position: c.position ?? i,
        })),
      };
    }

    try {
      const updated = await this.prisma.client.billOfMaterials.update({
        // Optimistic-lock: the version filter makes the update touch zero rows
        // if someone else saved since this form loaded → P2025 → 409 below. The
        // `components` deleteMany+create is nested in this same update, so a lost
        // race rolls it back atomically (the components are NOT destroyed).
        where: { id, accountId, version: parsed.version },
        data: { ...data, version: { increment: 1 } },
        include: {
          product: { select: { id: true, name: true, code: true, uom: true } },
          components: {
            orderBy: { position: 'asc' },
            include: {
              product: { select: { id: true, name: true, code: true, uom: true, buyPrice: true } },
            },
          },
          _count: { select: { components: true } },
        },
      });
      await this.logAudit(accountId, userId, 'update', id);
      return this.serializeBomDetail(updated);
    } catch (e) {
      // Lock's 409 must win over handlePrisma's P2025→404 map: existence was just
      // confirmed by findById, so a P2025 here means the version filter missed.
      mapVersionedUpdateError(e, 'BillOfMaterials');
      this.handlePrisma(e);
    }
  }

  // =========================================================================
  // Archive / Restore
  // =========================================================================

  async archive(accountId: string, userId: string, id: string) {
    await this.findById(accountId, id);
    await this.prisma.client.billOfMaterials.update({
      where: { id, accountId },
      data: { archived: true },
    });
    await this.logAudit(accountId, userId, 'delete', id);
    return { ok: true };
  }

  async restore(accountId: string, userId: string, id: string) {
    await this.findById(accountId, id);
    await this.prisma.client.billOfMaterials.update({
      where: { id, accountId },
      data: { archived: false },
    });
    await this.logAudit(accountId, userId, 'restore', id);
    return { ok: true };
  }

  // =========================================================================
  // Set components (replace-all pattern)
  // =========================================================================

  async setComponents(accountId: string, userId: string, bomId: string, raw: unknown) {
    const parsed = SetBomComponentsSchema.parse(raw);
    await this.findById(accountId, bomId);
    await this.assertComponentsValid(accountId, bomId, parsed.components);

    const standardCostMinor = await this.computeStandardCost(accountId, parsed.components);

    const result = await this.prisma.client.$transaction(async (tx) => {
      await tx.bomComponent.deleteMany({ where: { accountId, bomId } });
      await tx.bomComponent.createMany({
        data: parsed.components.map((c, i) => ({
          accountId,
          bomId,
          productId: c.productId,
          qty: c.qty,
          position: c.position ?? i,
        })),
      });
      const updated = await tx.billOfMaterials.update({
        where: { id: bomId, accountId },
        data: { standardCostMinor },
        include: {
          components: {
            orderBy: { position: 'asc' },
            include: {
              product: { select: { id: true, name: true, code: true, uom: true, buyPrice: true } },
            },
          },
        },
      });
      return {
        items: updated.components.map((c) => ({
          ...c,
          qty: c.qty.toString(),
        })),
        standardCostMinor: updated.standardCostMinor.toString(),
      };
    });
    await this.logAudit(accountId, userId, 'update', bomId);
    return result;
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  private async ensureProduct(accountId: string, productId: string): Promise<void> {
    const p = await this.prisma.client.product.findFirst({
      where: { id: productId, accountId, deletedAt: null },
      select: { id: true },
    });
    if (!p) throw new BadRequestException(`Mahsulot ${productId} topilmadi`);
  }

  private async assertComponentsValid(
    accountId: string,
    bomId: string,
    components: BomComponentInput[],
  ): Promise<void> {
    const bom = await this.prisma.client.billOfMaterials.findFirst({
      where: { id: bomId, accountId },
      select: { productId: true },
    });
    if (!bom) throw new NotFoundException('BOM topilmadi');

    for (const c of components) {
      if (c.productId === bom.productId) {
        throw new BadRequestException("BOM output mahsuloti komponent bo'la olmaydi (sikl)");
      }
    }

    const ids = components.map((c) => c.productId);
    const found = await this.prisma.client.product.findMany({
      where: { id: { in: ids }, accountId, deletedAt: null },
      select: { id: true },
    });
    if (found.length !== ids.length) {
      throw new BadRequestException("Ba'zi komponent mahsulotlar topilmadi");
    }
  }

  /**
   * Compute standardCostMinor = Σ(component.qty × product.buyPrice).
   * Products without buyPrice contribute 0 to the sum.
   */
  private async computeStandardCost(
    accountId: string,
    components: BomComponentInput[],
  ): Promise<bigint> {
    if (components.length === 0) return 0n;

    const ids = components.map((c) => c.productId);
    const products = await this.prisma.client.product.findMany({
      where: { id: { in: ids }, accountId, deletedAt: null },
      select: { id: true, buyPrice: true },
    });
    const priceMap = new Map(products.map((p) => [p.id, p.buyPrice ?? 0n]));

    let total = 0n;
    for (const c of components) {
      const price = priceMap.get(c.productId) ?? 0n;
      // qty is a decimal string like "2.5"; multiply via float then round to bigint
      const qty = Math.round(Number(c.qty) * 1_000_000);
      total += (price * BigInt(qty)) / 1_000_000n;
    }
    return total;
  }

  private serializeBom(r: {
    id: string;
    name: string;
    productId: string;
    outputQty: unknown;
    standardCostMinor: bigint;
    archived: boolean;
    createdAt: Date;
    updatedAt: Date;
    product: { id: string; name: string; code: string | null; uom: string | null };
    _count: { components: number };
  }) {
    return {
      ...r,
      outputQty: r.outputQty?.toString() ?? '1',
      standardCostMinor: r.standardCostMinor.toString(),
    };
  }

  private serializeBomDetail(
    r: Parameters<typeof this.serializeBom>[0] & {
      components: Array<{
        id: string;
        bomId: string;
        productId: string;
        qty: unknown;
        position: number;
        product: {
          id: string;
          name: string;
          code: string | null;
          uom: string | null;
          buyPrice: bigint | null;
        };
      }>;
    },
  ) {
    return {
      ...this.serializeBom(r),
      components: r.components.map((c) => ({
        ...c,
        qty: c.qty?.toString() ?? '0',
        product: {
          ...c.product,
          buyPrice: c.product.buyPrice?.toString() ?? null,
        },
      })),
    };
  }

  private handlePrisma(e: unknown): never {
    const err = e as { code?: string; meta?: { target?: string[] } };
    if (err.code === 'P2002') {
      const target = err.meta?.target?.join(', ') ?? '';
      if (target.includes('product_id')) {
        throw new ConflictException('Bu mahsulot uchun BOM allaqachon mavjud');
      }
      throw new ConflictException('Noyob qiymat xatosi');
    }
    if (err.code === 'P2025') throw new NotFoundException('Yozuv topilmadi');
    throw e;
  }

  /**
   * Write an audit-trail row for the document's «Tarix» / History tab.
   * Mirrors prepayment.service — the plain client commits the audit row after
   * the DB write succeeds. The `entity` string MUST equal the web page's
   * `auditEntity="bom"` (production/boms/[id]/page.tsx), or the History tab
   * (GET /audit-logs?entity=bom&entityId=<id>) stays empty.
   */
  private async logAudit(
    accountId: string,
    userId: string,
    action: string,
    entityId: string,
  ): Promise<void> {
    await this.prisma.client.auditLog.create({
      data: { accountId, userId, entity: 'bom', entityId, action },
    });
  }
}
