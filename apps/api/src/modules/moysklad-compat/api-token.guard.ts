import { createHash } from 'node:crypto';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { PrismaService } from '../../prisma/prisma.service.js';
import { TokenService } from '../auth/token.service.js';

/**
 * Auth guard for the moysklad-compat router. Accepts EITHER:
 *   1. A long-lived API token (ApiToken model) — moysklad's standard
 *      pattern, used by 1C / partner integrations / the CLIMART proxy.
 *   2. A regular JWT access token — so our own UI can call the compat
 *      endpoints without minting a separate token.
 *
 * Both authenticate the same way at the wire level (`Authorization:
 * Bearer <token>`). We try ApiToken first because the typical client
 * is an integration; falls back to JWT for our own UI.
 *
 * Side effect: bumps `lastUsedAt` and `ipAddress` on the ApiToken row
 * so admins can see "this token was last used 5 minutes ago from
 * 1.2.3.4" in the tokens admin page.
 */
@Injectable()
export class ApiTokenGuard implements CanActivate {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TokenService) private readonly tokens: TokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Bearer token required');
    }
    const token = auth.slice('Bearer '.length);

    // Try API token first
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const apiToken = await this.prisma.client.apiToken.findUnique({
      where: { tokenHash },
      include: { account: true, employee: true },
    });
    if (
      apiToken &&
      !apiToken.revokedAt &&
      (!apiToken.expiresAt || apiToken.expiresAt > new Date())
    ) {
      // Bump lastUsedAt + ipAddress (fire-and-forget; failure shouldn't block req)
      this.prisma.client.apiToken
        .update({
          where: { id: apiToken.id },
          data: {
            lastUsedAt: new Date(),
            ipAddress: req.ip ?? null,
          },
        })
        .catch(() => undefined);

      (req as FastifyRequest & { user?: unknown }).user = {
        accountId: apiToken.accountId,
        sub: apiToken.employeeId ?? apiToken.id,
        email: apiToken.employee?.email ?? `apitoken-${apiToken.id}`,
        name: apiToken.name,
        roles: [],
        permissions: ['*'],
        viaApiToken: true,
        apiTokenId: apiToken.id,
      };
      return true;
    }

    // Fall through: try JWT
    try {
      const user = await this.tokens.verifyAccessToken(token);
      (req as FastifyRequest & { user?: unknown }).user = user;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
