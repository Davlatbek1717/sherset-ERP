import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { TokenService } from './token.service.js';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(@Inject(TokenService) private readonly tokens: TokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const token = this.extractToken(req);
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

  /**
   * Bearer token extraction. Standard path is the Authorization header
   * (used by every fetch in the SPA). The fallback `?access_token=` query
   * param exists for clients that can't set headers — primarily the SSE
   * notification stream, where the browser's `EventSource` API has no
   * way to attach custom headers. Same token, same verification, only
   * the transport differs.
   */
  private extractToken(req: FastifyRequest): string | null {
    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) {
      return auth.slice('Bearer '.length);
    }
    const queryToken = (req.query as { access_token?: unknown } | undefined)?.access_token;
    if (typeof queryToken === 'string' && queryToken.length > 0) {
      return queryToken;
    }
    return null;
  }
}
