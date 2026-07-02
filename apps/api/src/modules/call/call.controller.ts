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
import { CallService } from './call.service.js';

@Controller('calls')
@UseGuards(JwtAuthGuard)
export class CallController {
  constructor(@Inject(CallService) private readonly svc: CallService) {}

  @Get()
  @RequirePermission({ entity: 'call', action: 'view' })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.svc.list(user.accountId, query);
  }

  @Get(':id')
  @RequirePermission({ entity: 'call', action: 'view' })
  async findById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.findById(user.accountId, id);
  }

  @Post()
  @RequirePermission({ entity: 'call', action: 'create' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.create(user.accountId, user.sub, body);
  }

  @Patch(':id')
  @RequirePermission({ entity: 'call', action: 'update' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.svc.update(user.accountId, id, body);
  }

  @Post(':id/archive')
  @RequirePermission({ entity: 'call', action: 'create' })
  async archive(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.archive(user.accountId, id);
  }

  @Post(':id/restore')
  @RequirePermission({ entity: 'call', action: 'create' })
  async restore(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.restore(user.accountId, id);
  }

  @Delete(':id')
  @RequirePermission({ entity: 'call', action: 'delete' })
  async delete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.delete(user.accountId, id);
  }

  @Post('bulk-delete')
  @RequirePermission({ entity: 'call', action: 'delete' })
  async bulkDelete(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids } = BulkIdsSchema.parse(body);
    return runBulk(ids, (id) => this.svc.delete(user.accountId, id));
  }

  @Post('bulk-archive')
  @RequirePermission({ entity: 'call', action: 'create' })
  async bulkArchive(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids } = BulkIdsSchema.parse(body);
    return runBulk(ids, (id) => this.svc.archive(user.accountId, id));
  }

  @Post('bulk-restore')
  @RequirePermission({ entity: 'call', action: 'create' })
  async bulkRestore(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids } = BulkIdsSchema.parse(body);
    return runBulk(ids, (id) => this.svc.restore(user.accountId, id));
  }
}
