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
import { StateService } from './state.service.js';

/**
 * Workflow-state CRUD — tenant-defined labels + colours for FSM-backed
 * entities (customerorder, demand, invoiceout, ...). Used by the
 * <StatusChangeDropdown> on every list/detail page.
 *
 * Permission scope is generic ('settings' / 'view' for read,
 * 'settings' / 'create' for write) since states are configured by
 * admins from the global Settings → Workflow page.
 */
@Controller('states')
@UseGuards(JwtAuthGuard)
export class StateController {
  constructor(@Inject(StateService) private readonly svc: StateService) {}

  @Get()
  @RequirePermission({ entity: 'settings', action: 'view' })
  list(@CurrentUser() user: AuthenticatedUser, @Query() q: Record<string, unknown>) {
    return this.svc.list(user.accountId, q);
  }

  @Get(':id')
  @RequirePermission({ entity: 'settings', action: 'view' })
  findById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.findById(user.accountId, id);
  }

  @Post()
  @RequirePermission({ entity: 'settings', action: 'create' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.create(user.accountId, body);
  }

  @Patch(':id')
  @RequirePermission({ entity: 'settings', action: 'update' })
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: unknown) {
    return this.svc.update(user.accountId, id, body);
  }

  @Post(':id/archive')
  @RequirePermission({ entity: 'settings', action: 'update' })
  archive(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.archive(user.accountId, id);
  }

  @Post(':id/restore')
  @RequirePermission({ entity: 'settings', action: 'update' })
  restore(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.restore(user.accountId, id);
  }

  @Delete(':id')
  @RequirePermission({ entity: 'settings', action: 'delete' })
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.remove(user.accountId, id);
  }

  @Post('bulk-delete')
  @RequirePermission({ entity: 'settings', action: 'delete' })
  async bulkDelete(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids } = BulkIdsSchema.parse(body);
    return runBulk(ids, (id) => this.svc.remove(user.accountId, id));
  }

  @Post('bulk-archive')
  @RequirePermission({ entity: 'settings', action: 'update' })
  async bulkArchive(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids } = BulkIdsSchema.parse(body);
    return runBulk(ids, (id) => this.svc.archive(user.accountId, id));
  }

  @Post('bulk-restore')
  @RequirePermission({ entity: 'settings', action: 'update' })
  async bulkRestore(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids } = BulkIdsSchema.parse(body);
    return runBulk(ids, (id) => this.svc.restore(user.accountId, id));
  }
}
