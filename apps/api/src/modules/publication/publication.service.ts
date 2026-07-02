import { randomBytes } from 'node:crypto';
import type { Prisma } from '@moysklad/db';
import {
  BadRequestException,
  ForbiddenException,
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../../prisma/prisma.service.js';
import { mapVersionedUpdateError } from '../shared/optimistic-lock.js';
import {
  CreatePublicationSchema,
  PublicationFilterSchema,
  UpdatePublicationSchema,
} from './publication.schema.js';

/**
 * Publication service.
 *
 * Token generation: 32 bytes random → base64url → 43 chars. That's
 * ~256 bits of entropy, well past what's needed for non-guessable URLs.
 *
 * Password handling: argon2id at the standard cost (same as
 * authentication password hashes). Public viewer calls `verifyPassword`
 * to check before serving content.
 *
 * Revoke vs delete: revoke keeps the row (analytics history preserved)
 * and starts returning 410 Gone. Soft-delete removes the link from the
 * UI list. Cascade delete from Account cleans up on tenant offboarding.
 */
@Injectable()
export class PublicationService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private generateToken(): string {
    // Use base64url (no padding) — URL-safe out of the box, 43 chars.
    return randomBytes(32).toString('base64url');
  }

  private async hashPassword(plain: string): Promise<string> {
    return argon2.hash(plain, { type: argon2.argon2id });
  }

  // ---------------------------------------------------------------------------
  // CRUD (authenticated, tenant-scoped)
  // ---------------------------------------------------------------------------

  async list(accountId: string, rawFilter: unknown) {
    const filter = PublicationFilterSchema.parse(rawFilter);
    const where: Prisma.PublicationWhereInput = {
      accountId,
      ...(filter.includeDeleted ? {} : { deletedAt: null }),
      ...(filter.targetType ? { targetType: filter.targetType } : {}),
      ...(filter.targetId ? { targetId: filter.targetId } : {}),
      ...(filter.ownerId ? { ownerId: filter.ownerId } : {}),
      ...(filter.revoked !== undefined
        ? filter.revoked
          ? { revokedAt: { not: null } }
          : { revokedAt: null }
        : {}),
      ...(filter.expired !== undefined
        ? filter.expired
          ? { expiresAt: { lt: new Date() } }
          : { OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }] }
        : {}),
      ...(filter.search ? { description: { contains: filter.search, mode: 'insensitive' } } : {}),
    };
    const rows = await this.prisma.client.publication.findMany({
      where,
      orderBy: { [filter.sortBy]: filter.sortDir },
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      include: {
        owner: { select: { id: true, name: true } },
      },
    });
    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    const total = await this.prisma.client.publication.count({ where });
    // Strip passwordHash from list responses — clerks see "Password set: yes/no"
    // but never the hash itself.
    const sanitized = items.map((r) => ({
      ...r,
      passwordHash: undefined,
      passwordProtected: r.passwordHash !== null,
    }));
    return { items: sanitized, nextCursor, total };
  }

  async findById(accountId: string, id: string) {
    const row = await this.prisma.client.publication.findFirst({
      where: { id, accountId, deletedAt: null },
      include: { owner: { select: { id: true, name: true, email: true } } },
    });
    if (!row) throw new NotFoundException(`Publication ${id} topilmadi`);
    return {
      ...row,
      passwordHash: undefined,
      passwordProtected: row.passwordHash !== null,
    };
  }

  async create(accountId: string, ownerId: string, raw: unknown) {
    const data = CreatePublicationSchema.parse(raw);
    const expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;
    if (expiresAt && expiresAt < new Date()) {
      throw new BadRequestException("expiresAt o'tmishda bo'lishi mumkin emas");
    }
    const passwordHash = data.password ? await this.hashPassword(data.password) : null;

    // Idempotent: re-publishing same doc returns the existing publication
    // (and updates its description/expiry if changed). Token + viewCount
    // are preserved across re-publishes.
    const existing = await this.prisma.client.publication.findFirst({
      where: {
        accountId,
        targetType: data.targetType,
        targetId: data.targetId,
        deletedAt: null,
      },
    });

    if (existing) {
      // If it was revoked, un-revoke on republish.
      await this.prisma.client.publication.update({
        where: { id: existing.id },
        data: {
          description: data.description ?? existing.description,
          expiresAt,
          ...(passwordHash !== null ? { passwordHash } : {}),
          revokedAt: null,
        },
      });
      return this.findById(accountId, existing.id);
    }

    const created = await this.prisma.client.publication.create({
      data: {
        accountId,
        ownerId,
        targetType: data.targetType,
        targetId: data.targetId,
        token: this.generateToken(),
        description: data.description,
        expiresAt,
        passwordHash,
      },
    });
    return this.findById(accountId, created.id);
  }

  async update(accountId: string, id: string, raw: unknown) {
    const parsed = UpdatePublicationSchema.parse(raw);
    await this.findById(accountId, id);
    const updateData: Prisma.PublicationUpdateInput = { version: { increment: 1 } };
    if (parsed.description !== undefined) updateData.description = parsed.description;
    if (parsed.expiresAt !== undefined) {
      if (parsed.expiresAt === null) {
        updateData.expiresAt = null;
      } else {
        const d = new Date(parsed.expiresAt);
        if (d < new Date()) {
          throw new BadRequestException("expiresAt o'tmishda bo'lishi mumkin emas");
        }
        updateData.expiresAt = d;
      }
    }
    if (parsed.password !== undefined) {
      updateData.passwordHash =
        parsed.password === null ? null : await this.hashPassword(parsed.password);
    }
    try {
      await this.prisma.client.publication.update({
        where: { id, accountId, version: parsed.version },
        data: updateData,
      });
    } catch (e) {
      mapVersionedUpdateError(e, 'Publication');
      throw e;
    }
    return this.findById(accountId, id);
  }

  /** Revoke (soft) — link returns 410 Gone. Idempotent. */
  async revoke(accountId: string, id: string) {
    await this.findById(accountId, id);
    await this.prisma.client.publication.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
    return this.findById(accountId, id);
  }

  /** Soft-delete (hides from UI list). */
  async softDelete(accountId: string, id: string) {
    await this.findById(accountId, id);
    await this.prisma.client.publication.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { ok: true };
  }

  /** Regenerate the token — invalidates any URLs already in the wild. */
  async rotateToken(accountId: string, id: string) {
    await this.findById(accountId, id);
    await this.prisma.client.publication.update({
      where: { id },
      data: { token: this.generateToken() },
    });
    return this.findById(accountId, id);
  }

  // ---------------------------------------------------------------------------
  // PUBLIC viewer endpoints (no auth, token-only)
  // ---------------------------------------------------------------------------

  /**
   * Fetch publication metadata by token. Used by the public viewer to
   * decide whether to show a password prompt and to display the doc name.
   * Throws 410 Gone if revoked / expired / deleted, 404 if token unknown.
   */
  async resolveByToken(token: string) {
    const row = await this.prisma.client.publication.findUnique({
      where: { token },
    });
    if (!row || row.deletedAt) throw new NotFoundException('Publikatsiya topilmadi');
    if (row.revokedAt) throw new GoneException('Bu havola bekor qilingan');
    if (row.expiresAt && row.expiresAt < new Date()) {
      throw new GoneException('Bu havolaning amal qilish muddati tugagan');
    }
    return {
      id: row.id,
      targetType: row.targetType,
      targetId: row.targetId,
      description: row.description,
      passwordProtected: row.passwordHash !== null,
      expiresAt: row.expiresAt,
      viewCount: row.viewCount,
    };
  }

  /**
   * Verify a password attempt against the stored hash. Returns true on
   * success; throws ForbiddenException on mismatch. The viewer flow:
   * resolve → (if password-protected) verify → recordView → fetch doc.
   */
  async verifyPassword(token: string, password: string): Promise<{ ok: true }> {
    const row = await this.prisma.client.publication.findUnique({
      where: { token },
    });
    if (!row || row.deletedAt) throw new NotFoundException('Publikatsiya topilmadi');
    if (row.revokedAt || (row.expiresAt && row.expiresAt < new Date())) {
      throw new GoneException('Havola amal qilmaydi');
    }
    if (!row.passwordHash) {
      // No password set — caller misuse; act as success so flow continues.
      return { ok: true };
    }
    const ok = await argon2.verify(row.passwordHash, password);
    if (!ok) throw new ForbiddenException("Notog'ri parol");
    return { ok: true };
  }

  /**
   * Atomic increment of viewCount + stamp lastViewedAt. Called from the
   * public viewer after the doc body is rendered. Best-effort: errors
   * here don't block the viewer (caller catches).
   */
  async recordView(token: string): Promise<void> {
    await this.prisma.client.publication.updateMany({
      where: { token, deletedAt: null, revokedAt: null },
      data: { viewCount: { increment: 1 }, lastViewedAt: new Date() },
    });
  }
}
