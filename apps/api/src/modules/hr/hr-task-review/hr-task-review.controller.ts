import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/auth.schema.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { HrPermissionGuard } from '../hr-auth/hr-permission.guard.js';
import { RequireHrPermission } from '../hr-auth/require-hr-permission.decorator.js';
import {
  RejectActionSchema,
  ReviewActionSchema,
  ReviewListFilterSchema,
} from './hr-task-review.schema.js';
import { HrTaskReviewService } from './hr-task-review.service.js';

@Controller('hr/review')
@UseGuards(JwtAuthGuard, HrPermissionGuard)
export class HrTaskReviewController {
  constructor(@Inject(HrTaskReviewService) private readonly svc: HrTaskReviewService) {}

  /** Pending review queue. Service-level scope: admin → all, checker → own queue only. */
  @Get()
  @RequireHrPermission('tasks', 'read')
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown) {
    const filter = ReviewListFilterSchema.parse(query);
    const isAdmin = user.hrRoles?.includes('admin') ?? false;
    return this.svc.listPending(user.accountId, user.sub, isAdmin, filter);
  }

  @Post(':id/approve')
  @RequireHrPermission('tasks', 'own_only')
  async approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = ReviewActionSchema.parse(body);
    const isAdmin = user.hrRoles?.includes('admin') ?? false;
    return this.svc.approve(user.accountId, id, user.sub, isAdmin, input.comment ?? null);
  }

  @Post(':id/reject')
  @RequireHrPermission('tasks', 'own_only')
  async reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = RejectActionSchema.parse(body);
    const isAdmin = user.hrRoles?.includes('admin') ?? false;
    return this.svc.reject(user.accountId, id, user.sub, isAdmin, input.comment);
  }
}
