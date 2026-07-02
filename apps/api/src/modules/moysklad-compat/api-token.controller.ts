import { Body, Controller, Delete, Get, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { ApiTokenService } from './api-token.service.js';

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
