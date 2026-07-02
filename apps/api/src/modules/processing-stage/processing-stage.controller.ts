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
import { ProcessingStageService } from './processing-stage.service.js';

@Controller('processing-stages')
@UseGuards(JwtAuthGuard)
export class ProcessingStageController {
  constructor(@Inject(ProcessingStageService) private readonly svc: ProcessingStageService) {}

  @Get()
  @RequirePermission({ entity: 'processingstage', action: 'view' })
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown) {
    return this.svc.list(user.accountId, query);
  }

  @Get(':id')
  @RequirePermission({ entity: 'processingstage', action: 'view' })
  findById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.findById(user.accountId, id);
  }

  @Post()
  @RequirePermission({ entity: 'processingstage', action: 'create' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.create(user.accountId, user.sub, body);
  }

  @Patch(':id')
  @RequirePermission({ entity: 'processingstage', action: 'update' })
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: unknown) {
    return this.svc.update(user.accountId, user.sub, id, body);
  }

  @Delete(':id/archive')
  @RequirePermission({ entity: 'processingstage', action: 'delete' })
  archive(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.archive(user.accountId, user.sub, id);
  }

  @Post(':id/restore')
  @RequirePermission({ entity: 'processingstage', action: 'create' })
  restore(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.restore(user.accountId, user.sub, id);
  }
}
