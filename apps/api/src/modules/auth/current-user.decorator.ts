import { type ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { AuthenticatedUser } from './auth.schema.js';

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const req = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    if (!req.user) throw new Error('CurrentUser used without JwtAuthGuard');
    return req.user;
  },
);
