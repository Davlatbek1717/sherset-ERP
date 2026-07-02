import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  AccountAttachmentsFilterSchema,
  type AttachmentEntity,
  type ListAttachmentsInput,
  ListAttachmentsSchema,
  type UploadAttachmentInput,
  UploadAttachmentSchema,
} from './attachment.schema.js';

interface AttachmentDescriptor {
  id: string;
  filename: string;
  mime: string;
  sizeBytes: number;
  description: string | null;
  createdAt: Date;
  uploader: { id: string; name: string } | null;
}

/** Account-wide descriptor — adds the host entity so «Файлы» can show
 *  which document each file belongs to and link back to it. */
interface AccountAttachmentDescriptor extends AttachmentDescriptor {
  entity: string;
  entityId: string;
}

const MAX_BYTES = 10_000_000;

@Injectable()
export class AttachmentService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string, raw: unknown): Promise<{ items: AttachmentDescriptor[] }> {
    const parsed = this.parseList(raw);
    const rows = await this.prisma.client.attachment.findMany({
      where: { accountId, entity: parsed.entity, entityId: parsed.entityId },
      orderBy: { createdAt: 'desc' },
      take: parsed.limit,
      select: {
        id: true,
        filename: true,
        mime: true,
        sizeBytes: true,
        description: true,
        createdAt: true,
        uploader: { select: { id: true, name: true } },
      },
    });
    return { items: rows };
  }

  /**
   * Account-wide file repository (moysklad «Файлы»). Cross-entity,
   * cursor-paginated, optional host-type / filename filter. Always
   * tenant-scoped by accountId. Never returns the blob.
   */
  async listAccountWide(
    accountId: string,
    raw: unknown,
  ): Promise<{ items: AccountAttachmentDescriptor[]; nextCursor: string | null }> {
    const r = AccountAttachmentsFilterSchema.safeParse(raw);
    if (!r.success) {
      throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    }
    const p = r.data;
    const rows = await this.prisma.client.attachment.findMany({
      where: {
        accountId,
        ...(p.entity ? { entity: p.entity } : {}),
        ...(p.search ? { filename: { contains: p.search, mode: 'insensitive' } } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: p.limit + 1,
      ...(p.cursor ? { cursor: { id: p.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        entity: true,
        entityId: true,
        filename: true,
        mime: true,
        sizeBytes: true,
        description: true,
        createdAt: true,
        uploader: { select: { id: true, name: true } },
      },
    });
    const hasMore = rows.length > p.limit;
    const items = hasMore ? rows.slice(0, p.limit) : rows;
    const last = items.at(-1);
    return { items, nextCursor: hasMore && last ? last.id : null };
  }

  async upload(accountId: string, userId: string, raw: unknown): Promise<AttachmentDescriptor> {
    const parsed = this.parseUpload(raw);
    const buffer = this.decodeBase64(parsed.dataBase64);
    return this.createFromBuffer(accountId, userId, {
      entity: parsed.entity,
      entityId: parsed.entityId,
      filename: parsed.filename,
      mime: parsed.mime,
      buffer,
      description: parsed.description ?? null,
    });
  }

  /**
   * Create an attachment straight from an in-memory buffer — e.g. a
   * server-rendered print-form PDF for the «Отправить» email flow, which renders
   * the document through a print template and attaches it. Bypasses the base64
   * upload path but shares the same 10 MB cap + blob-in-DB storage as {@link upload}.
   */
  async createFromBuffer(
    accountId: string,
    userId: string,
    params: {
      entity: AttachmentEntity;
      entityId: string;
      filename: string;
      mime: string;
      buffer: Buffer;
      description?: string | null;
    },
  ): Promise<AttachmentDescriptor> {
    if (params.buffer.length === 0) {
      throw new BadRequestException("Bo'sh fayl yuklab bo'lmaydi");
    }
    if (params.buffer.length > MAX_BYTES) {
      throw new BadRequestException(
        `Fayl hajmi ${(params.buffer.length / 1_000_000).toFixed(1)} MB — chegara 10 MB`,
      );
    }

    return this.prisma.client.attachment.create({
      data: {
        accountId,
        uploaderId: userId,
        entity: params.entity,
        entityId: params.entityId,
        filename: params.filename,
        mime: params.mime,
        sizeBytes: params.buffer.length,
        content: params.buffer,
        description: params.description ?? null,
      },
      select: {
        id: true,
        filename: true,
        mime: true,
        sizeBytes: true,
        description: true,
        createdAt: true,
        uploader: { select: { id: true, name: true } },
      },
    });
  }

  async getRaw(
    accountId: string,
    attachmentId: string,
  ): Promise<{ buffer: Buffer; mime: string; filename: string }> {
    const row = await this.prisma.client.attachment.findFirst({
      where: { id: attachmentId, accountId },
      select: { content: true, mime: true, filename: true },
    });
    if (!row) throw new NotFoundException(`Attachment ${attachmentId} not found`);
    return {
      buffer: Buffer.from(row.content),
      mime: row.mime,
      filename: row.filename,
    };
  }

  async delete(accountId: string, attachmentId: string): Promise<{ ok: true }> {
    const exists = await this.prisma.client.attachment.findFirst({
      where: { id: attachmentId, accountId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException(`Attachment ${attachmentId} not found`);
    await this.prisma.client.attachment.delete({ where: { id: attachmentId } });
    return { ok: true };
  }

  // =====================================================================
  // helpers
  // =====================================================================

  private parseUpload(raw: unknown): UploadAttachmentInput {
    const r = UploadAttachmentSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private parseList(raw: unknown): ListAttachmentsInput {
    const r = ListAttachmentsSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  /**
   * Strip the `data:application/pdf;base64,` prefix if present, then
   * base64-decode. Validates by round-trip re-encoding to detect garbage
   * (Buffer.from doesn't throw on invalid base64).
   */
  private decodeBase64(input: string): Buffer {
    const commaIdx = input.indexOf(',');
    const body = commaIdx >= 0 && input.startsWith('data:') ? input.slice(commaIdx + 1) : input;
    const cleaned = body.replace(/\s+/g, '');
    const buf = Buffer.from(cleaned, 'base64');
    if (buf.toString('base64').replace(/=+$/, '') !== cleaned.replace(/=+$/, '')) {
      throw new BadRequestException("Yaroqsiz base64 ma'lumot");
    }
    return buf;
  }
}
