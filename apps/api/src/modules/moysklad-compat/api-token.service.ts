import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

/**
 * Service for managing ApiToken (long-lived integration tokens).
 *
 * Token format: 40 hex chars. moysklad's tokens are also 40-char hex
 * — keeping wire shape identical means consumer integrations don't
 * need to special-case our system.
 *
 * On creation we return the plaintext ONCE, then store SHA-256 hash.
 */
@Injectable()
export class ApiTokenService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string) {
    return this.prisma.client.apiToken.findMany({
      where: { accountId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        scopes: true,
        expiresAt: true,
        lastUsedAt: true,
        ipAddress: true,
        createdAt: true,
        employee: { select: { id: true, name: true, email: true } },
      },
    });
  }

  /** Creates a token, returns plaintext for one-time display. */
  async create(
    accountId: string,
    employeeId: string | null,
    input: { name: string; scopes?: string[]; expiresAt?: Date | null },
  ): Promise<{ id: string; token: string; name: string }> {
    const plaintext = randomBytes(20).toString('hex'); // 40 hex chars, like moysklad
    const tokenHash = createHash('sha256').update(plaintext).digest('hex');
    const row = await this.prisma.client.apiToken.create({
      data: {
        accountId,
        employeeId,
        tokenHash,
        name: input.name,
        scopes: input.scopes ?? [],
        expiresAt: input.expiresAt ?? null,
      },
    });
    return { id: row.id, token: plaintext, name: row.name };
  }

  async revoke(accountId: string, id: string) {
    const row = await this.prisma.client.apiToken.findFirst({
      where: { id, accountId },
    });
    if (!row) throw new NotFoundException('Token not found');
    await this.prisma.client.apiToken.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }
}
