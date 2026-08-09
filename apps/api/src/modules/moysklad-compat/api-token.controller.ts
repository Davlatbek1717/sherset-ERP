import { Body, Controller, Delete, Get, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import type { CompatAction } from './api-token.scope.js';
import { ApiTokenService } from './api-token.service.js';
import { COMPAT_SLUGS } from './compat-slugs.js';

const CreateTokenSchema = z.object({
  name: z.string().min(1).max(255),
  scopes: z.array(z.string()).default([]),
  expiresAt: z
    .union([z.string(), z.date(), z.null()])
    .optional()
    .transform((v) => (v == null ? null : v instanceof Date ? v : new Date(v))),
});

/**
 * Admin endpoints for managing ApiToken — long-lived integration tokens.
 * Distinct from /auth (JWT login flow). Surfaced under /admin so it sits
 * alongside the other tenant-administration endpoints.
 *
 * UI: /settings/api-tokens (admin-only).
 */
@Controller('admin/api-tokens')
@UseGuards(JwtAuthGuard)
export class ApiTokenController {
  constructor(@Inject(ApiTokenService) private readonly svc: ApiTokenService) {}

  @Get()
  @RequirePermission({ entity: 'settings', action: 'view' })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.list(user.accountId);
  }

  /**
   * Scope vocabulary for the UI's checkbox matrix (Faza Q14).
   *
   * The compat router's own `_compat/slugs` discovery endpoint sits behind
   * `ApiTokenGuard` (Bearer api-token) — an admin holding only a JWT cannot
   * read it, and hardcoding the list in the frontend would drift. Same
   * registry the create-time validator uses, so what the UI offers is
   * exactly what the server accepts.
   */
  @Get('scopes')
  @RequirePermission({ entity: 'settings', action: 'view' })
  scopes(): { slugs: string[]; actions: CompatAction[] } {
    return { slugs: [...COMPAT_SLUGS], actions: ['read', 'write'] };
  }

  @Post()
  @RequirePermission({ entity: 'settings', action: 'create' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const input = CreateTokenSchema.parse(body);
    return this.svc.create(user.accountId, user.sub, input);
  }

  @Delete(':id')
  @RequirePermission({ entity: 'settings', action: 'delete' })
  revoke(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.revoke(user.accountId, id);
  }
}
