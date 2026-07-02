import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { TaskTypeService } from './task-type.service.js';

@Controller('task-types')
@UseGuards(JwtAuthGuard)
export class TaskTypeController {
  constructor(@Inject(TaskTypeService) private readonly svc: TaskTypeService) {}

  @Get()
  @RequirePermission({ entity: 'tasktype', action: 'view' })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    await this.svc.seedDefaultsIfEmpty(user.accountId);
    return this.svc.list(user.accountId, query);
  }

  @Get(':id')
  @RequirePermission({ entity: 'tasktype', action: 'view' })
  async findById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.svc.findById(user.accountId, id);
  }

  @Post()
  @RequirePermission({ entity: 'tasktype', action: 'create' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.create(user.accountId, body);
  }

  @Patch(':id')
  @RequirePermission({ entity: 'tasktype', action: 'update' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
  ) {
    return this.svc.update(user.accountId, id, body);
  }

  @Post(':id/archive')
  @RequirePermission({ entity: 'tasktype', action: 'update' })
  async archive(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.svc.archive(user.accountId, id);
  }

  @Post(':id/restore')
  @RequirePermission({ entity: 'tasktype', action: 'update' })
  async restore(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.svc.restore(user.accountId, id);
  }

  @Delete(':id')
  @RequirePermission({ entity: 'tasktype', action: 'delete' })
  async delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.svc.delete(user.accountId, id);
  }
}
