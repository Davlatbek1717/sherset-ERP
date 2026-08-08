import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { extractToken } from './extract-token.js';
import { TokenService } from './token.service.js';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(@Inject(TokenService) private readonly tokens: TokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    // Header first; `?access_token=` faqat allowlist marshrutlarda
    // (SSE/media) — batafsil: extract-token.ts (AUTH-04).
    const token = extractToken(req);
    if (!token) {
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
