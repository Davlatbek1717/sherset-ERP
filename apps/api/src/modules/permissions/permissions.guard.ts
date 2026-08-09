import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { extractMediaToken, extractToken } from '../auth/extract-token.js';
import { TokenService } from '../auth/token.service.js';
import { PermissionsService } from './permissions.service.js';
import { PERMISSION_META, type RequiredPermission } from './require-permission.decorator.js';

/**
 * Reads @RequirePermission metadata from the handler + enforces it.
 *
 * Runtime ordering: NestJS executes APP_GUARD entries BEFORE controller-
 * level @UseGuards. That means by the time this guard runs, the
 * controller-level JwtAuthGuard has not yet populated `req.user`. To
 * keep this guard safe regardless of ordering, we re-verify the JWT
 * here when `req.user` is missing — same TokenService, same secret.
 * If the controller does run JwtAuthGuard later, it overwrites our
 * (identical) `req.user`; harmless.
 *
 * Endpoints without @RequirePermission opt out entirely: the guard
 * returns `true` immediately, so unauthenticated public routes
 * (login, payment-gateway webhooks, telegram callback, etc.) keep
 * working without further configuration.
 *
 * For list endpoints that need per-row filtering, use PermissionsService
 * directly in the service layer with `scopedWhere()`.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(PermissionsService) private readonly permissions: PermissionsService,
    @Inject(TokenService) private readonly tokens: TokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.get<RequiredPermission>(PERMISSION_META, context.getHandler());
    if (!required) return true; // no permission requirement

    const req = context.switchToHttp().getRequest<FastifyRequest & { user?: AuthenticatedUser }>();
    let user = req.user;

    // Backfill the user from the bearer token if the controller-level
    // JwtAuthGuard has not run yet. Shared extractToken: header first,
    // `?access_token=` faqat SSE marshrutida (AUTH-04, Faza Q13).
    if (!user) {
      const token = extractToken(req);
      if (!token) {
        // Media yo'llari: HttpOnly `ms_mt` media-cookie'si. JwtAuthGuard bilan
        // AYNAN bir mantiq — aks holda APP_GUARD bu yerda media so'rovini
        // 401 qilib, kontroller-guardgacha yetkazmasdi.
        const mediaRaw = extractMediaToken(req);
        const mediaUser = mediaRaw ? this.tokens.verifyMediaToken(mediaRaw) : null;
        if (!mediaUser) {
          throw new UnauthorizedException('Avtorizatsiya kerak');
        }
        user = mediaUser;
        req.user = user;
      } else {
        try {
          user = await this.tokens.verifyAccessToken(token);
        } catch {
          throw new UnauthorizedException('Yaroqsiz token');
        }
        req.user = user;
      }
    }

    await this.permissions.require(
      user.sub,
      required.entity,
      required.action,
      required.minScope ?? 'OWN',
    );

    return true;
  }
}
