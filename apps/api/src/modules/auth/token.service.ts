import * as crypto from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthenticatedUser } from './auth.schema.js';

/**
 * Rotation grace window. The refresh cookie is shared by every tab of the
 * browser profile, but tabs are separate JS contexts — the web auth-store
 * single-flight cannot dedupe ACROSS tabs, so two tabs can legitimately
 * send the SAME refresh token concurrently. Within this window a
 * rotation-revoked token is honoured once more (a sibling successor is
 * minted) instead of logging the loser out. Re-use BEYOND the window is
 * treated as replay of a stolen token → the whole rotation family is
 * revoked (OWASP refresh-token reuse detection).
 */
const ROTATION_GRACE_MS = 60_000;

/**
 * `revokeAllForEmployee` uchun minimal klient-shakli: oddiy Prisma klient ham,
 * `$transaction` ichidagi `tx` ham shu shartnomani qanoatlantiradi.
 */
type RevokeClient = {
  refreshToken: {
    updateMany: (args: {
      where: { employeeId: string; revokedAt: null };
      data: { revokedAt: Date };
    }) => Promise<unknown>;
  };
};

@Injectable()
export class TokenService {
  private readonly refreshTtlDays = 7;

  constructor(
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  /** Sign short-lived access JWT with user claims (incl. HR snapshot). */
  signAccessToken(user: AuthenticatedUser): string {
    return this.jwt.sign({
      sub: user.sub,
      accountId: user.accountId,
      email: user.email,
      name: user.name,
      username: user.username,
      hrRoles: user.hrRoles,
      isChecker: user.isChecker,
      uiMode: user.uiMode,
      hrPermissions: user.hrPermissions,
    });
  }

  async verifyAccessToken(token: string): Promise<AuthenticatedUser> {
    return this.jwt.verifyAsync<AuthenticatedUser>(token);
  }

  /**
   * Create opaque refresh token + hashed persist. Return plain token
   * to set as HttpOnly cookie; store only sha256 hash in DB.
   * Without `familyId` the token roots a NEW rotation family (login);
   * rotation passes the existing family through.
   */
  async createRefreshToken(
    employeeId: string,
    meta: { userAgent?: string; ipAddress?: string },
    familyId?: string,
  ): Promise<string> {
    const { raw } = await this.createRefreshTokenRecord(employeeId, meta, familyId);
    return raw;
  }

  private async createRefreshTokenRecord(
    employeeId: string,
    meta: { userAgent?: string; ipAddress?: string },
    familyId?: string,
  ): Promise<{ raw: string; id: string }> {
    const raw = crypto.randomBytes(48).toString('base64url');
    const hash = this.hashToken(raw);
    // App-generated id so familyId can self-reference on family roots.
    const id = crypto.randomUUID();

    await this.prisma.client.refreshToken.create({
      data: {
        id,
        employeeId,
        tokenHash: hash,
        userAgent: meta.userAgent?.slice(0, 500),
        ipAddress: meta.ipAddress?.slice(0, 45),
        expiresAt: new Date(Date.now() + this.refreshTtlDays * 86_400_000),
        familyId: familyId ?? id,
      },
    });

    return { raw, id };
  }

  async rotateRefreshToken(
    oldRaw: string,
    meta: { userAgent?: string; ipAddress?: string },
  ): Promise<{ raw: string; employeeId: string } | null> {
    const oldHash = this.hashToken(oldRaw);
    const existing = await this.prisma.client.refreshToken.findUnique({
      where: { tokenHash: oldHash },
    });
    if (!existing || existing.expiresAt < new Date()) {
      return null;
    }
    const familyId = existing.familyId ?? existing.id;

    if (existing.revokedAt) {
      // Not rotation-revoked (logout / family revocation) → no grace.
      if (!existing.replacedById) return null;

      if (Date.now() - existing.revokedAt.getTime() <= ROTATION_GRACE_MS) {
        // Benign cross-tab race: the token was consumed moments ago by a
        // sibling tab. Mint another successor in the same family instead of
        // logging this tab out. (The original successor's raw value is not
        // recoverable — only its hash is stored — so an idempotent re-issue
        // is impossible by design.)
        const { raw } = await this.createRefreshTokenRecord(existing.employeeId, meta, familyId);
        return { raw, employeeId: existing.employeeId };
      }

      // Replay of a long-consumed token = reuse detection: someone (or a
      // very stale client) holds a copy. Kill the whole rotation lineage —
      // scoped to this family, other devices/browsers stay logged in.
      await this.prisma.client.refreshToken.updateMany({
        where: { familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return null;
    }

    // Active token: mint the successor FIRST, then revoke the old row
    // pointing at it. If the conditional revoke loses a concurrent rotation
    // (count 0), the successor is still a valid grace sibling — return it.
    const successor = await this.createRefreshTokenRecord(existing.employeeId, meta, familyId);
    await this.prisma.client.refreshToken.updateMany({
      where: { id: existing.id, revokedAt: null },
      data: { revokedAt: new Date(), replacedById: successor.id },
    });
    return { raw: successor.raw, employeeId: existing.employeeId };
  }

  async revokeRefreshToken(raw: string): Promise<void> {
    const hash = this.hashToken(raw);
    await this.prisma.client.refreshToken.updateMany({
      where: { tokenHash: hash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Xodimning BARCHA faol refresh-tokenlarini bekor qiladi (offboarding,
   * majburiy chiqarish). `client` — ixtiyoriy tranzaksiya klienti: chaqiruvchi
   * (masalan `OffboardingService.complete`) arxivlash bilan BIR tranzaksiyada
   * uzishi uchun (AUTH-05). Berilmasa oddiy klient ishlatiladi.
   */
  async revokeAllForEmployee(
    employeeId: string,
    client: RevokeClient = this.prisma.client,
  ): Promise<void> {
    await client.refreshToken.updateMany({
      where: { employeeId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private hashToken(raw: string): string {
    return crypto.createHash('sha256').update(raw).digest('hex');
  }
}
