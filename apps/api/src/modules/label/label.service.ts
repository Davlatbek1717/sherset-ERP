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
  CreateLabelTemplateSchema,
  LabelTemplateFilterSchema,
  RenderLabelsSchema,
  UpdateLabelTemplateSchema,
} from './label.schema.js';

/**
 * Compose the Sherset warehouse home location «NN-NN-NN-NN» from 4 numeric
 * segments (sklad-polka-qavat-yacheyka). '' when ALL segments are unset;
 * partial locations render with unset segments as «00». Mirrors the FE helper
 * `apps/web/src/lib/bin-location.ts` (kept in sync by eye — both trivial).
 */
function formatBin(s: number | null, p: number | null, q: number | null, y: number | null): string {
  if (s == null && p == null && q == null && y == null) return '';
  const pad = (n: number | null) => String(n ?? 0).padStart(2, '0');
  return [s, p, q, y].map(pad).join('-');
}

/**
 * LabelService — templates (CRUD) + print rendering.
 *
 * Templates are configs only (no balance/stock effect). Render endpoint
 * computes per-product display data and (optionally) records a
 * LabelPrintJob row for audit.
 */
@Injectable()
export class LabelService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  // ----- Template CRUD ------------------------------------------------------

  async listTemplates(accountId: string, rawFilter: unknown) {
    const filter = LabelTemplateFilterSchema.parse(rawFilter);
    const where: Prisma.LabelTemplateWhereInput = {
      accountId,
      deletedAt: null,
      ...(filter.archived !== undefined ? { archived: filter.archived } : { archived: false }),
      ...(filter.pageSize ? { pageSize: filter.pageSize } : {}),
      ...(filter.search
        ? {
            OR: [
              { name: { contains: filter.search, mode: 'insensitive' } },
              { description: { contains: filter.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const items = await this.prisma.client.labelTemplate.findMany({
      where,
      orderBy: { [filter.sortBy]: filter.sortDir },
      take: filter.limit,
    });
    return { items, total: items.length };
  }

  async findTemplateById(accountId: string, id: string) {
    const row = await this.prisma.client.labelTemplate.findFirst({
      where: { id, accountId, deletedAt: null },
    });
    if (!row) throw new NotFoundException(`LabelTemplate ${id} topilmadi`);
    return row;
  }

  async createTemplate(accountId: string, raw: unknown) {
    const parsed = CreateLabelTemplateSchema.safeParse(raw);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(', '));
    }
    const data = parsed.data;
    try {
      return await this.prisma.client.labelTemplate.create({
        data: {
          accountId,
          name: data.name,
          description: data.description,
          pageSize: data.pageSize,
          pageWidthMm: data.pageWidthMm,
          pageHeightMm: data.pageHeightMm,
          cols: data.cols,
          rows: data.rows,
          marginTopMm: data.marginTopMm,
          marginLeftMm: data.marginLeftMm,
          columnGapMm: data.columnGapMm,
          rowGapMm: data.rowGapMm,
          labelWidthMm: data.labelWidthMm,
          labelHeightMm: data.labelHeightMm,
          includeName: data.includeName,
          includePrice: data.includePrice,
          includeBarcode: data.includeBarcode,
          includeArticle: data.includeArticle,
          includeLocation: data.includeLocation,
          headerText: data.headerText,
          barcodeFormat: data.barcodeFormat,
        },
      });
    } catch (e) {
      this.handlePrisma(e);
    }
  }

  async updateTemplate(accountId: string, id: string, raw: unknown) {
    const parsed = UpdateLabelTemplateSchema.safeParse(raw);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(', '));
    }
    const { version, ...fields } = parsed.data;
    await this.findTemplateById(accountId, id);
    try {
      return await this.prisma.client.labelTemplate.update({
        where: { id, accountId, version },
        data: { ...fields, version: { increment: 1 } },
      });
    } catch (e) {
      mapVersionedUpdateError(e, 'LabelTemplate');
      this.handlePrisma(e);
    }
  }

  async archiveTemplate(accountId: string, id: string) {
    await this.findTemplateById(accountId, id);
    return this.prisma.client.labelTemplate.update({
      where: { id },
      data: { archived: true },
    });
  }

  async softDeleteTemplate(accountId: string, id: string) {
    await this.findTemplateById(accountId, id);
    await this.prisma.client.labelTemplate.update({
      where: { id },
      data: { deletedAt: new Date(), archived: true },
    });
    return { ok: true };
  }

  // ----- Render / Print -----------------------------------------------------

  /**
   * Compute label-print data: pull product info, fan out by quantity,
   * package with layout for the client to render.
   *
   * When `recordJob=true`, persist a LabelPrintJob audit row. The
   * snapshot ensures the audit stays stable even if products are
   * subsequently edited.
   */
  async render(accountId: string, ownerId: string, raw: unknown) {
    const parsed = RenderLabelsSchema.safeParse(raw);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(', '));
    }
    const data = parsed.data;

    const template = await this.findTemplateById(accountId, data.templateId);
    if (template.archived) {
      throw new BadRequestException(
        'Arxivlangan shablonni ishlatib boʻlmaydi — avval arxivdan chiqaring',
      );
    }

    // Fetch product details — name, code, barcodes (first barcode used as
    // the label barcode). Filter to this tenant only.
    const productIds = data.items.map((i) => i.productId);
    const products = await this.prisma.client.product.findMany({
      where: { id: { in: productIds }, accountId, deletedAt: null },
      select: {
        id: true,
        name: true,
        code: true,
        article: true,
        barcodes: true,
        salePrices: true,
        locSklad: true,
        locPolka: true,
        locQavat: true,
        locYacheyka: true,
      },
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    // Identify missing products — return clear error if any IDs are wrong.
    const missing = productIds.filter((id) => !byId.has(id));
    if (missing.length > 0) {
      throw new BadRequestException(
        `Mahsulotlar topilmadi: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '…' : ''}`,
      );
    }

    // Build per-item label data. Quantity → fan-out a list of `quantity`
    // identical label records so the client can place them in the grid
    // without knowing about the grid math.
    const labels = data.items.flatMap((item) => {
      const p = byId.get(item.productId);
      if (!p) return [];
      // salePrices is JSON; we just pluck the first price's value for display.
      // (Future: support price-type selection per template.)
      const prices = (p.salePrices as Array<{ value: string }> | null) ?? [];
      const firstPrice = prices[0]?.value ?? '0';
      // First barcode from the barcodes string[] — or fall back to product code.
      const barcode = (p.barcodes?.[0] as string | undefined) ?? p.code ?? p.id.slice(0, 13);
      const labelData = {
        productId: p.id,
        productName: p.name,
        article: p.article ?? p.code ?? '',
        priceMinor: firstPrice,
        barcode,
        // Sherset custom — warehouse home location «NN-NN-NN-NN» (empty when unset).
        binLocation: formatBin(p.locSklad, p.locPolka, p.locQavat, p.locYacheyka),
      };
      return Array.from({ length: item.quantity }, () => labelData);
    });

    const totalLabels = labels.length;
    const labelsPerPage = template.cols * template.rows;
    const pageCount = Math.ceil(totalLabels / labelsPerPage);

    // Optionally record an audit job.
    if (data.recordJob) {
      await this.prisma.client.labelPrintJob.create({
        data: {
          accountId,
          ownerId,
          templateId: template.id,
          itemsSnapshot: {
            items: data.items.map((i) => {
              const p = byId.get(i.productId)!;
              return {
                productId: i.productId,
                productName: p.name,
                qty: i.quantity,
                barcode: (p.barcodes?.[0] as string | undefined) ?? p.code ?? p.id.slice(0, 13),
              };
            }),
          } as unknown as Prisma.InputJsonValue,
          totalLabels,
          pageCount,
        },
      });
    }

    return {
      template: {
        id: template.id,
        name: template.name,
        pageSize: template.pageSize,
        pageWidthMm: template.pageWidthMm,
        pageHeightMm: template.pageHeightMm,
        cols: template.cols,
        rows: template.rows,
        marginTopMm: template.marginTopMm,
        marginLeftMm: template.marginLeftMm,
        columnGapMm: template.columnGapMm,
        rowGapMm: template.rowGapMm,
        labelWidthMm: template.labelWidthMm,
        labelHeightMm: template.labelHeightMm,
        includeName: template.includeName,
        includePrice: template.includePrice,
        includeBarcode: template.includeBarcode,
        includeArticle: template.includeArticle,
        includeLocation: template.includeLocation,
        headerText: template.headerText,
        barcodeFormat: template.barcodeFormat,
      },
      labels,
      totalLabels,
      labelsPerPage,
      pageCount,
    };
  }

  // ----- Print job history --------------------------------------------------

  async listJobs(accountId: string, limit = 50) {
    const items = await this.prisma.client.labelPrintJob.findMany({
      where: { accountId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        template: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
      },
    });
    return { items };
  }

  // ----- Helpers ------------------------------------------------------------

  private handlePrisma(e: unknown): never {
    const err = e as { code?: string; meta?: { target?: string[] } };
    if (err.code === 'P2002') {
      throw new ConflictException('Bu nom bilan shablon allaqachon mavjud');
    }
    throw e as Error;
  }
}
