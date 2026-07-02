import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { BulkIdsSchema, runBulk } from '../shared/bulk.js';
import { TaskService } from './task.service.js';

@Controller('tasks')
@UseGuards(JwtAuthGuard)
export class TaskController {
  constructor(@Inject(TaskService) private readonly svc: TaskService) {}

  @Get()
  @RequirePermission({ entity: 'task', action: 'view' })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.svc.list(user.accountId, user.sub, query);
  }

  /**
   * Returns the count of tasks the current user "owes" — assigned to
   * them, not done/cancelled, dueAt in the past or not set. Drives the
   * red badge on the navbar Задачи tab (moysklad parity).
   */
  // Personal navbar counter (the current user's own overdue/active tasks) —
  // shown on every page, so no module permission is required.
  @Get('badge-count')
  async badgeCount(@CurrentUser() user: AuthenticatedUser) {
    return { count: await this.svc.badgeCount(user.accountId, user.sub) };
  }

  @Get(':id')
  @RequirePermission({ entity: 'task', action: 'view' })
  async findById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.findById(user.accountId, id);
  }

  @Post()
  @RequirePermission({ entity: 'task', action: 'create' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.create(user.accountId, user.sub, body);
  }

  @Patch(':id')
  @RequirePermission({ entity: 'task', action: 'update' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.svc.update(user.accountId, user.sub, id, body);
  }

  @Post(':id/transition')
  @RequirePermission({ entity: 'task', action: 'approve' })
  async transition(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.svc.transition(user.accountId, user.sub, id, body);
  }

  @Post(':id/archive')
  @RequirePermission({ entity: 'task', action: 'create' })
  async archive(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.archive(user.accountId, user.sub, id);
  }

  @Post(':id/restore')
  @RequirePermission({ entity: 'task', action: 'create' })
  async restore(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.restore(user.accountId, user.sub, id);
  }

  @Delete(':id')
  @RequirePermission({ entity: 'task', action: 'delete' })
  async delete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.delete(user.accountId, user.sub, id);
  }

  @Post('bulk-delete')
  @RequirePermission({ entity: 'task', action: 'delete' })
  async bulkDelete(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids } = BulkIdsSchema.parse(body);
    return runBulk(ids, (id) => this.svc.delete(user.accountId, user.sub, id));
  }

  @Post('bulk-archive')
  @RequirePermission({ entity: 'task', action: 'create' })
  async bulkArchive(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids } = BulkIdsSchema.parse(body);
    return runBulk(ids, (id) => this.svc.archive(user.accountId, user.sub, id));
  }

  @Post('bulk-restore')
  @RequirePermission({ entity: 'task', action: 'create' })
  async bulkRestore(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids } = BulkIdsSchema.parse(body);
    return runBulk(ids, (id) => this.svc.restore(user.accountId, user.sub, id));
  }
}
