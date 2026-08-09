import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { extractMediaToken, extractToken } from './extract-token.js';
import { TokenService } from './token.service.js';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(@Inject(TokenService) private readonly tokens: TokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    // Header first; `?access_token=` faqat SSE marshrutida — batafsil:
    // extract-token.ts (AUTH-04, Faza Q13).
    const token = extractToken(req);
    if (!token) {
      // Media yo'llari (`<img>`, `<a download>`, top-level PDF) — HttpOnly
      // `ms_mt` cookie'sidagi imzolangan media-token (Faza Q13). Boshqa
      // marshrutda `extractMediaToken` null qaytaradi ⇒ verify ham bo'lmaydi.
      const mediaRaw = extractMediaToken(req);
      if (mediaRaw) {
        const mediaUser = this.tokens.verifyMediaToken(mediaRaw);
        if (mediaUser) {
          (req as FastifyRequest & { user?: unknown }).user = mediaUser;
          return true;
        }
      }
      throw new UnauthorizedException('Avtorizatsiya kerak');
    }
    try {
      const user = await this.tokens.verifyAccessToken(token);
      (req as FastifyRequest & { user?: unknown }).user = user;
      return true;
    } catch {
      throw new UnauthorizedException('Yaroqsiz token');
    }
  }
}
