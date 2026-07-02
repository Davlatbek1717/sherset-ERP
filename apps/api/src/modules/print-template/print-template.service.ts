import { Prisma } from '@moysklad/db';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  type CreatePrintTemplateInput,
  CreatePrintTemplateSchema,
  type PrintEntity,
  type PrintFormat,
  PrintTemplateFilterSchema,
  type UpdatePrintTemplateInput,
  UpdatePrintTemplateSchema,
} from './print-template.schema.js';

/**
 * PrintTemplateService — per-account custom print templates.
 *
 * One row per (entity, format, name). At most one row per (entity,format)
 * may have isDefault=true; toggling a new default automatically un-defaults
 * the previous one inside a transaction.
 *
 * Render path lives in PrintService elsewhere; this service is pure CRUD.
 */
@Injectable()
export class PrintTemplateService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string, rawFilter: unknown) {
    const filter = PrintTemplateFilterSchema.parse(rawFilter);
    const where: Prisma.PrintTemplateWhereInput = {
      accountId,
      ...(filter.entity ? { entity: filter.entity } : {}),
      ...(filter.format ? { format: filter.format } : {}),
      ...(filter.enabled !== undefined ? { enabled: filter.enabled } : {}),
      ...(filter.archived !== undefined ? { archived: filter.archived } : { archived: false }),
      ...(filter.search
        ? {
            OR: [
              { name: { contains: filter.search, mode: 'insensitive' } },
              { description: { contains: filter.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      deletedAt: null,
    };
    const rows = await this.prisma.client.printTemplate.findMany({
      where,
      orderBy: { [filter.sortBy]: filter.sortDir },
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      select: this.publicSelect(),
    });
    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    const total = await this.prisma.client.printTemplate.count({ where });
    return { items, nextCursor, total };
  }

  async findById(accountId: string, id: string) {
    const row = await this.prisma.client.printTemplate.findFirst({
      where: { id, accountId, deletedAt: null },
      select: { ...this.publicSelect(), bodyHtml: true },
    });
    if (!row) throw new NotFoundException(`PrintTemplate ${id} not found`);
    return row;
  }

  /**
   * Fetch the raw uploaded Word/Excel file for download («Скачать» → right-click
   * → Save as), scoped to the account. 404s when the template has no uploaded
   * file (HTML-body template). Returns the original bytes + a name/extension so
   * the controller can set Content-Type and a sensible filename.
   */
  async getFileForDownload(accountId: string, id: string) {
    const row = await this.prisma.client.printTemplate.findFirst({
      where: { id, accountId, deletedAt: null },
      select: { name: true, format: true, bodyDocx: true },
    });
    if (!row) throw new NotFoundException(`PrintTemplate ${id} not found`);
    if (!row.bodyDocx) throw new NotFoundException('Bu shablonda yuklangan fayl yo‘q');
    const ext = row.format === 'xlsx' ? 'xlsx' : 'docx';
    return { name: row.name, ext, bytes: Buffer.from(row.bodyDocx) };
  }

  async create(accountId: string, userId: string, raw: unknown) {
    const parsed = this.parseCreate(raw);
    return this.prisma.client.$transaction(async (tx) => {
      if (parsed.isDefault) {
        await this.unsetExistingDefault(tx, accountId, parsed.entity, parsed.format);
      }
      try {
        return await tx.printTemplate.create({
          data: {
            accountId,
            ownerId: userId,
            entity: parsed.entity,
            format: parsed.format,
            name: parsed.name,
            description: parsed.description ?? null,
            bodyHtml: parsed.bodyHtml ?? '',
            bodyDocx: parsed.bodyDocxBase64 ? Buffer.from(parsed.bodyDocxBase64, 'base64') : null,
            pageSize: parsed.pageSize,
            marginTop: parsed.marginTop,
            marginRight: parsed.marginRight,
            marginBottom: parsed.marginBottom,
            marginLeft: parsed.marginLeft,
            isDefault: parsed.isDefault,
            enabled: parsed.enabled,
          },
          select: { ...this.publicSelect(), bodyHtml: true },
        });
      } catch (e) {
        this.handlePrisma(e);
      }
    });
  }

  async update(accountId: string, id: string, raw: unknown) {
    const parsed = this.parseUpdate(raw);
    const existing = await this.findById(accountId, id);
    return this.prisma.client.$transaction(async (tx) => {
      const targetEntity = (parsed.entity ?? existing.entity) as PrintEntity;
      const targetFormat = (parsed.format ?? existing.format) as PrintFormat;
      if (parsed.isDefault === true && !existing.isDefault) {
        await this.unsetExistingDefault(tx, accountId, targetEntity, targetFormat);
      }
      const data: Prisma.PrintTemplateUpdateInput = {};
      if (parsed.entity !== undefined) data.entity = parsed.entity;
      if (parsed.format !== undefined) data.format = parsed.format;
      if (parsed.name !== undefined) data.name = parsed.name;
      if (parsed.description !== undefined) data.description = parsed.description;
      if (parsed.bodyHtml !== undefined) data.bodyHtml = parsed.bodyHtml;
      if (parsed.bodyDocxBase64 !== undefined) {
        data.bodyDocx = parsed.bodyDocxBase64 ? Buffer.from(parsed.bodyDocxBase64, 'base64') : null;
      }
      if (parsed.pageSize !== undefined) data.pageSize = parsed.pageSize;
      if (parsed.marginTop !== undefined) data.marginTop = parsed.marginTop;
      if (parsed.marginRight !== undefined) data.marginRight = parsed.marginRight;
      if (parsed.marginBottom !== undefined) data.marginBottom = parsed.marginBottom;
      if (parsed.marginLeft !== undefined) data.marginLeft = parsed.marginLeft;
      if (parsed.isDefault !== undefined) data.isDefault = parsed.isDefault;
      if (parsed.enabled !== undefined) data.enabled = parsed.enabled;
      try {
        return await tx.printTemplate.update({
          where: { id, accountId },
          data,
          select: { ...this.publicSelect(), bodyHtml: true },
        });
      } catch (e) {
        this.handlePrisma(e);
      }
    });
  }

  async archive(accountId: string, id: string) {
    await this.findById(accountId, id);
    return this.prisma.client.printTemplate.update({
      where: { id, accountId },
      data: { archived: true, isDefault: false },
      select: this.publicSelect(),
    });
  }

  async restore(accountId: string, id: string) {
    await this.findById(accountId, id);
    return this.prisma.client.printTemplate.update({
      where: { id, accountId },
      data: { archived: false },
      select: this.publicSelect(),
    });
  }

  async delete(accountId: string, id: string) {
    await this.findById(accountId, id);
    await this.prisma.client.printTemplate.update({
      where: { id, accountId },
      data: { deletedAt: new Date(), enabled: false, isDefault: false },
    });
    return { ok: true };
  }

  /**
   * Resolve the active template for a given (entity, format). Used by
   * PrintService at render time. Picks the enabled+isDefault row first,
   * then falls back to the most recently updated enabled row, then null.
   */
  async resolveDefault(accountId: string, entity: string, format: string) {
    return this.prisma.client.printTemplate.findFirst({
      where: {
        accountId,
        entity,
        format,
        enabled: true,
        archived: false,
        deletedAt: null,
      },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  /**
   * Resolve ONE specific template by id, scoped to the account + entity and
   * gated on enabled/non-archived. Used by the bulk-print path when the user
   * picks a named template from a document's «Печать» menu (vs the default).
   * Returns null when the id doesn't resolve to a usable template — the
   * render path then falls back to the account default / built-in.
   */
  async resolveById(accountId: string, id: string, entity: string, format: string) {
    return this.prisma.client.printTemplate.findFirst({
      where: { id, accountId, entity, format, enabled: true, archived: false, deletedAt: null },
    });
  }

  /**
   * Lightweight {id,name} list of an account's printable templates for a
   * document «Печать» menu (enabled, non-archived, isDefault first). Unlike
   * {@link list} this carries no permission/pagination weight — it is meant
   * to be exposed through a doc-scoped endpoint (e.g. purchaseorder:view) so
   * a non-settings-admin can still see the print forms on a document list.
   */
  async listPrintable(accountId: string, entity: string, format = 'pdf') {
    return this.prisma.client.printTemplate.findMany({
      where: { accountId, entity, format, enabled: true, archived: false, deletedAt: null },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      select: { id: true, name: true },
    });
  }

  // ----- helpers --------------------------------------------------------

  private async unsetExistingDefault(
    tx: Prisma.TransactionClient,
    accountId: string,
    entity: string,
    format: string,
  ): Promise<void> {
    await tx.printTemplate.updateMany({
      where: { accountId, entity, format, isDefault: true, deletedAt: null },
      data: { isDefault: false },
    });
  }

  private publicSelect() {
    return {
      id: true,
      entity: true,
      format: true,
      name: true,
      description: true,
      pageSize: true,
      marginTop: true,
      marginRight: true,
      marginBottom: true,
      marginLeft: true,
      isDefault: true,
      enabled: true,
      archived: true,
      createdAt: true,
      updatedAt: true,
    } as const;
  }

  private parseCreate(raw: unknown): CreatePrintTemplateInput {
    const r = CreatePrintTemplateSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private parseUpdate(raw: unknown): UpdatePrintTemplateInput {
    const r = UpdatePrintTemplateSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private handlePrisma(e: unknown): never {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002') {
        throw new ConflictException('Bu nom allaqachon ishlatilgan');
      }
    }
    throw e;
  }
}
