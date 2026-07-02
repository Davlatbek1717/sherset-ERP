import type { Prisma } from '@moysklad/db';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { type BundleComponentInput, SetBundleComponentsSchema } from './bundle.schema.js';

/**
 * BundleService — manages the BundleComponent rows attached to a
 * Product with kind='bundle'. The parent Product itself (name, code,
 * prices, VAT) is still managed via ProductService; this service only
 * handles the component list.
 */
@Injectable()
export class BundleService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Read the component list for a bundle. Includes nested
   * product/variant display info so the UI can render rows without
   * extra round-trips.
   */
  async listComponents(accountId: string, bundleId: string) {
    await this.assertBundle(accountId, bundleId);
    const rows = await this.prisma.client.bundleComponent.findMany({
      where: { accountId, bundleId },
      orderBy: { position: 'asc' },
      include: {
        componentProduct: {
          select: { id: true, name: true, code: true, uom: true, kind: true },
        },
        componentVariant: {
          select: { id: true, name: true, code: true, productId: true },
        },
      },
    });
    return {
      items: rows.map((r) => ({
        ...r,
        quantity: r.quantity.toString(),
      })),
      total: rows.length,
    };
  }

  /**
   * Replace the full component list for a bundle in one transaction —
   * the UI sends the entire edited list and we overwrite. Old rows that
   * were referenced by posted documents are onDelete: Restrict'd by
   * Prisma FKs, so the caller surfaces the error if any row is in use.
   */
  async setComponents(accountId: string, userId: string, bundleId: string, raw: unknown) {
    const parsed = SetBundleComponentsSchema.parse(raw);
    await this.assertBundle(accountId, bundleId);

    // Validate each component references an existing product/variant in
    // this tenant. A bundle can't include itself (direct self-reference)
    // — catch that specifically.
    await this.assertComponentsValid(accountId, bundleId, parsed.components);

    // Snapshot the prior list for the audit diff before we overwrite it.
    const before = await this.prisma.client.bundleComponent.findMany({
      where: { accountId, bundleId },
      orderBy: { position: 'asc' },
      select: { componentProductId: true, componentVariantId: true, quantity: true },
    });

    const result = await this.prisma.client.$transaction(async (tx) => {
      await tx.bundleComponent.deleteMany({ where: { accountId, bundleId } });
      const created = await tx.bundleComponent.createManyAndReturn({
        data: parsed.components.map((c, i) => ({
          accountId,
          bundleId,
          componentProductId: c.componentProductId ?? null,
          componentVariantId: c.componentVariantId ?? null,
          quantity: c.quantity,
          position: c.position ?? i,
        })),
      });
      return { items: created.map((r) => ({ ...r, quantity: r.quantity.toString() })) };
    });

    await this.logAudit(accountId, userId, 'update', bundleId, {
      components: {
        before: before.map((c) => ({
          productId: c.componentProductId,
          variantId: c.componentVariantId,
          quantity: c.quantity.toString(),
        })),
        after: parsed.components.map((c) => ({
          productId: c.componentProductId ?? null,
          variantId: c.componentVariantId ?? null,
          quantity: c.quantity,
        })),
      },
    });
    return result;
  }

  async removeComponent(accountId: string, userId: string, bundleId: string, componentId: string) {
    await this.assertBundle(accountId, bundleId);
    const row = await this.prisma.client.bundleComponent.findFirst({
      where: { id: componentId, accountId, bundleId },
    });
    if (!row) throw new NotFoundException('Component topilmadi');
    await this.prisma.client.bundleComponent.delete({ where: { id: componentId } });
    await this.logAudit(accountId, userId, 'update', bundleId, {
      components: {
        removed: {
          productId: row.componentProductId,
          variantId: row.componentVariantId,
          quantity: row.quantity.toString(),
        },
      },
    });
    return { ok: true };
  }

  // =====================================================================
  // helpers
  // =====================================================================

  private async assertBundle(accountId: string, productId: string): Promise<void> {
    const product = await this.prisma.client.product.findFirst({
      where: { id: productId, accountId, deletedAt: null },
      select: { id: true, kind: true },
    });
    if (!product) throw new NotFoundException('Product topilmadi');
    if (product.kind !== 'bundle') {
      throw new BadRequestException(
        `Bu mahsulot bundle emas (kind=${product.kind}). Avval kind='bundle' qiling.`,
      );
    }
  }

  private async assertComponentsValid(
    accountId: string,
    bundleId: string,
    components: BundleComponentInput[],
  ): Promise<void> {
    for (const c of components) {
      if (c.componentProductId === bundleId) {
        throw new BadRequestException('Bundle o\u2019zini component qila olmaydi');
      }
    }

    const productIds = components
      .map((c) => c.componentProductId)
      .filter((id): id is string => !!id);
    const variantIds = components
      .map((c) => c.componentVariantId)
      .filter((id): id is string => !!id);

    if (productIds.length > 0) {
      const found = await this.prisma.client.product.findMany({
        where: { id: { in: productIds }, accountId, deletedAt: null },
        select: { id: true, kind: true },
      });
      const foundMap = new Map(found.map((p) => [p.id, p]));
      for (const id of productIds) {
        const row = foundMap.get(id);
        if (!row) throw new BadRequestException(`Product ${id} topilmadi`);
        if (row.kind === 'bundle') {
          throw new BadRequestException(
            `Product ${id} bundle — nested bundles hozir qo'llab-quvvatlanmaydi`,
          );
        }
      }
    }
    if (variantIds.length > 0) {
      const count = await this.prisma.client.variant.count({
        where: { id: { in: variantIds }, accountId },
      });
      if (count !== variantIds.length) {
        throw new BadRequestException('Variant topilmadi (ba\u2019zilari)');
      }
    }
  }

  /**
   * Write a History (\u00abTarix\u00bb) row for a component-list change. The bundle
   * detail page's History tab is the PARENT Product's audit feed (the page
   * uses auditEntity="Product" \u2014 a bundle IS a Product), so component edits
   * are logged under entity='Product' with entityId=<bundleId>.
   * ProductService already logs the parent field edits (name/prices/VAT);
   * this closes the previously-silent component-list gap \u2014 before this,
   * editing a bundle's components produced no History entry at all.
   */
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
        entity: 'Product',
        entityId,
        action,
        fieldChanges: fieldChanges as Prisma.InputJsonValue | undefined,
      },
    });
  }
}
