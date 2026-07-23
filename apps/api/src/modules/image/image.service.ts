import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  type ReorderImagesInput,
  ReorderImagesSchema,
  type UploadImageInput,
  UploadImageSchema,
} from './image.schema.js';

/** Max images per product — mirrors the web MAX_IMAGES (user 2026-07-07). The
 *  server is the source of truth: a bypassed client still can't exceed this. */
const MAX_PRODUCT_IMAGES = 5;

interface ImageDescriptor {
  id: string;
  filename: string;
  mime: string;
  sizeBytes: number;
  position: number;
  isMain: boolean;
  createdAt: Date;
}

@Injectable()
export class ImageService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listForProduct(
    accountId: string,
    productId: string,
  ): Promise<{ items: ImageDescriptor[] }> {
    await this.assertProduct(accountId, productId);
    const rows = await this.prisma.client.productImage.findMany({
      where: { accountId, productId },
      orderBy: [{ isMain: 'desc' }, { position: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        filename: true,
        mime: true,
        sizeBytes: true,
        position: true,
        isMain: true,
        createdAt: true,
      },
    });
    return { items: rows };
  }

  /**
   * Decode + persist an uploaded image. If `isMain=true`, the previous
   * main is demoted in the same transaction so we never have two mains.
   */
  async upload(accountId: string, productId: string, raw: unknown): Promise<ImageDescriptor> {
    const parsed = this.parseUpload(raw);
    await this.assertProduct(accountId, productId);

    const buffer = this.decodeBase64(parsed.dataBase64);
    if (buffer.length === 0) {
      throw new BadRequestException('Bo\u2019sh fayl yuklab bo\u2019lmaydi');
    }
    // Cap decoded binary at 4 MB — base64 inflates ~33%, so the 5 MB encoded
    // limit lands here.
    const MAX_BYTES = 4_000_000;
    if (buffer.length > MAX_BYTES) {
      throw new BadRequestException(
        `Rasm hajmi ${(buffer.length / 1_000_000).toFixed(1)} MB — chegara 4 MB`,
      );
    }

    return this.prisma.client.$transaction(async (tx) => {
      // Demote any existing main if this upload claims main.
      if (parsed.isMain) {
        await tx.productImage.updateMany({
          where: { accountId, productId, isMain: true },
          data: { isMain: false },
        });
      }

      // Pick the next available position if not provided.
      let position = parsed.position;
      if (position === undefined) {
        const last = await tx.productImage.findFirst({
          where: { accountId, productId },
          orderBy: { position: 'desc' },
          select: { position: true },
        });
        position = (last?.position ?? -1) + 1;
      }

      // First image of a product is auto-main even if caller didn't ask.
      const existingCount = await tx.productImage.count({ where: { accountId, productId } });
      // Enforce the per-product image cap inside the tx (server source of truth).
      if (existingCount >= MAX_PRODUCT_IMAGES) {
        throw new BadRequestException(
          `Bitta mahsulotga ko’pi bilan ${MAX_PRODUCT_IMAGES} ta rasm yuklash mumkin`,
        );
      }
      const isMain = parsed.isMain || existingCount === 0;

      const created = await tx.productImage.create({
        data: {
          accountId,
          productId,
          filename: parsed.filename,
          mime: parsed.mime,
          content: buffer,
          sizeBytes: buffer.length,
          position,
          isMain,
        },
        select: {
          id: true,
          filename: true,
          mime: true,
          sizeBytes: true,
          position: true,
          isMain: true,
          createdAt: true,
        },
      });
      return created;
    });
  }

  /**
   * Stream the binary content for a single image — called by the
   * controller's GET /images/:id/raw endpoint with the right
   * Content-Type header.
   */
  async getRaw(
    accountId: string,
    imageId: string,
  ): Promise<{ buffer: Buffer; mime: string; filename: string }> {
    const row = await this.prisma.client.productImage.findFirst({
      where: { id: imageId, accountId },
      select: { content: true, mime: true, filename: true },
    });
    if (!row) throw new NotFoundException(`Image ${imageId} not found`);
    return {
      buffer: Buffer.from(row.content),
      mime: row.mime,
      filename: row.filename,
    };
  }

  async setMain(accountId: string, productId: string, imageId: string): Promise<void> {
    await this.assertProduct(accountId, productId);
    const row = await this.prisma.client.productImage.findFirst({
      where: { id: imageId, accountId, productId },
    });
    if (!row) throw new NotFoundException(`Image ${imageId} not found for product ${productId}`);

    await this.prisma.client.$transaction(async (tx) => {
      await tx.productImage.updateMany({
        where: { accountId, productId, isMain: true, id: { not: imageId } },
        data: { isMain: false },
      });
      await tx.productImage.update({
        where: { id: imageId },
        data: { isMain: true },
      });
    });
  }

  async delete(accountId: string, productId: string, imageId: string): Promise<{ ok: true }> {
    await this.assertProduct(accountId, productId);
    const row = await this.prisma.client.productImage.findFirst({
      where: { id: imageId, accountId, productId },
      select: { id: true, isMain: true },
    });
    if (!row) throw new NotFoundException(`Image ${imageId} not found`);

    await this.prisma.client.$transaction(async (tx) => {
      await tx.productImage.delete({ where: { id: imageId } });
      // If we deleted the main image, promote the next-positioned image.
      if (row.isMain) {
        const next = await tx.productImage.findFirst({
          where: { accountId, productId },
          orderBy: { position: 'asc' },
          select: { id: true },
        });
        if (next) {
          await tx.productImage.update({
            where: { id: next.id },
            data: { isMain: true },
          });
        }
      }
    });

    return { ok: true };
  }

  async reorder(accountId: string, productId: string, raw: unknown): Promise<void> {
    const parsed = this.parseReorder(raw);
    await this.assertProduct(accountId, productId);

    const owned = await this.prisma.client.productImage.findMany({
      where: { accountId, productId, id: { in: parsed.imageIds } },
      select: { id: true },
    });
    if (owned.length !== parsed.imageIds.length) {
      throw new BadRequestException('Ba\u2019zi rasm IDlari ushbu mahsulotga tegishli emas');
    }

    await this.prisma.client.$transaction(
      parsed.imageIds.map((id, position) =>
        this.prisma.client.productImage.update({
          where: { id },
          data: { position },
        }),
      ),
    );
  }

  // =====================================================================
  // helpers
  // =====================================================================

  private parseUpload(raw: unknown): UploadImageInput {
    const r = UploadImageSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private parseReorder(raw: unknown): ReorderImagesInput {
    const r = ReorderImagesSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private async assertProduct(accountId: string, productId: string): Promise<void> {
    const ok = await this.prisma.client.product.findFirst({
      where: { id: productId, accountId, deletedAt: null },
      select: { id: true },
    });
    if (!ok) throw new NotFoundException(`Product ${productId} not found`);
  }

  /**
   * Strip the `data:image/png;base64,` prefix if present, then base64-decode.
   * Throws on invalid base64 (Buffer.from with 'base64' returns a partially
   * decoded buffer for garbage; we re-encode and compare lengths to detect).
   */
  private decodeBase64(input: string): Buffer {
    const commaIdx = input.indexOf(',');
    const body = commaIdx >= 0 && input.startsWith('data:') ? input.slice(commaIdx + 1) : input;
    const cleaned = body.replace(/\s+/g, '');
    const buf = Buffer.from(cleaned, 'base64');
    // Validate by re-encoding (Buffer.from doesn't throw on garbage).
    if (buf.toString('base64').replace(/=+$/, '') !== cleaned.replace(/=+$/, '')) {
      throw new BadRequestException('Yaroqsiz base64 ma\u2019lumot');
    }
    return buf;
  }
}
