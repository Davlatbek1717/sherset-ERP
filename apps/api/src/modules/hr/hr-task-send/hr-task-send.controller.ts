import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/auth.schema.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { HrPermissionGuard } from '../hr-auth/hr-permission.guard.js';
import { RequireHrPermission } from '../hr-auth/require-hr-permission.decorator.js';
import {
  AnswerTaskSchema,
  DispatchTemplateSchema,
  ListLogsFilterSchema,
} from './hr-task-send.schema.js';
import { HrTaskSendService } from './hr-task-send.service.js';

@Controller('hr/tasks')
@UseGuards(JwtAuthGuard, HrPermissionGuard)
export class HrTaskSendController {
  constructor(@Inject(HrTaskSendService) private readonly svc: HrTaskSendService) {}

  /** Admin manually triggers a template. */
  @Post('send')
  @RequireHrPermission('tasks', 'full')
  async send(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const input = DispatchTemplateSchema.parse(body);
    return this.svc.dispatch(user.accountId, input);
  }

  /** Xodim javob beradi. Service enforces own-task ownership. */
  @Post('logs/:id/answer')
  @RequireHrPermission('tasks', 'own_only')
  async answer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = AnswerTaskSchema.parse(body);
    return this.svc.recordAnswer(user.accountId, id, user.sub, input);
  }

  /** List logs. Admin sees all; non-admin scoped to own logs. */
  @Get('logs')
  @RequireHrPermission('tasks', 'read')
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown) {
    const filter = ListLogsFilterSchema.parse(query);
    const isAdmin = user.hrRoles?.includes('admin') ?? false;
    return this.svc.listLogs(user.accountId, isAdmin ? null : user.sub, filter);
  }
}
