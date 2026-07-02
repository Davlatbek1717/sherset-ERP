import { Body, Controller, Delete, Get, Inject, Param, Put, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { BundleService } from './bundle.service.js';

@Controller('bundles')
@UseGuards(JwtAuthGuard)
export class BundleController {
  constructor(@Inject(BundleService) private readonly svc: BundleService) {}

  /**
   * GET /bundles/:id/components — list the current component rows for a
   * bundle product. Returns empty items[] for freshly-created bundles.
   */
  @Get(':id/components')
  @RequirePermission({ entity: 'bundle', action: 'view' })
  async listComponents(@CurrentUser() user: AuthenticatedUser, @Param('id') bundleId: string) {
    return this.svc.listComponents(user.accountId, bundleId);
  }

  /**
   * PUT /bundles/:id/components — replace the entire component list in
   * one shot (moysklad send-whole-list UX). Use DELETE below for
   * single-row removal outside of a save.
   */
  @Put(':id/components')
  @RequirePermission({ entity: 'bundle', action: 'update' })
  async setComponents(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') bundleId: string,
    @Body() body: unknown,
  ) {
    return this.svc.setComponents(user.accountId, user.sub, bundleId, body);
  }

  @Delete(':id/components/:componentId')
  @RequirePermission({ entity: 'bundle', action: 'delete' })
  async removeComponent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') bundleId: string,
    @Param('componentId') componentId: string,
  ) {
    return this.svc.removeComponent(user.accountId, user.sub, bundleId, componentId);
  }
}
