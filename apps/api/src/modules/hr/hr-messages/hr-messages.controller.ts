import { Controller, Get, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/auth.schema.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { HrPermissionGuard } from '../hr-auth/hr-permission.guard.js';
import { RequireHrPermission } from '../hr-auth/require-hr-permission.decorator.js';
import { ChatHistoryFilterSchema, ListHrMessagesFilterSchema } from './hr-messages.schema.js';
import { HrMessagesService } from './hr-messages.service.js';

@Controller('hr/messages')
@UseGuards(JwtAuthGuard, HrPermissionGuard)
export class HrMessagesController {
  constructor(@Inject(HrMessagesService) private readonly svc: HrMessagesService) {}

  @Get()
  @RequireHrPermission('messages', 'read')
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown) {
    const filter = ListHrMessagesFilterSchema.parse(query);
    return this.svc.list(user.accountId, filter);
  }

  @Get('status-counts')
  @RequireHrPermission('messages', 'read')
  async statusCounts(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.statusCounts(user.accountId);
  }

  @Get('chat-history')
  @RequireHrPermission('messages', 'read')
  async chatHistory(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown) {
    const filter = ChatHistoryFilterSchema.parse(query);
    return this.svc.chatHistory(user.accountId, filter);
  }

  /** Admin recovers a 'failed' row by sending it back to the worker queue. */
  @Post(':id/requeue')
  @RequireHrPermission('messages', 'full')
  async requeue(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.requeue(user.accountId, id);
  }
}
