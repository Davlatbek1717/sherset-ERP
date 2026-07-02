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
import { TaxRateService } from './tax-rate.service.js';

@Controller('tax-rates')
@UseGuards(JwtAuthGuard)
export class TaxRateController {
  constructor(@Inject(TaxRateService) private readonly svc: TaxRateService) {}

  @Get()
  @RequirePermission({ entity: 'taxrate', action: 'view' })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    await this.svc.seedDefaultsIfEmpty(user.accountId);
    return this.svc.list(user.accountId, query);
  }

  @Get(':id')
  @RequirePermission({ entity: 'taxrate', action: 'view' })
  async findById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.findById(user.accountId, id);
  }

  @Post()
  @RequirePermission({ entity: 'taxrate', action: 'create' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.create(user.accountId, body);
  }

  @Patch(':id')
  @RequirePermission({ entity: 'taxrate', action: 'update' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.svc.update(user.accountId, id, body);
  }

  @Post(':id/archive')
  @RequirePermission({ entity: 'taxrate', action: 'update' })
  async archive(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.archive(user.accountId, id);
  }

  @Post(':id/restore')
  @RequirePermission({ entity: 'taxrate', action: 'update' })
  async restore(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.restore(user.accountId, id);
  }

  @Delete(':id')
  @RequirePermission({ entity: 'taxrate', action: 'delete' })
  async delete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.delete(user.accountId, id);
  }

  @Post('bulk-delete')
  @RequirePermission({ entity: 'taxrate', action: 'delete' })
  async bulkDelete(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids } = BulkIdsSchema.parse(body);
    return runBulk(ids, (id) => this.svc.delete(user.accountId, id));
  }

  @Post('bulk-archive')
  @RequirePermission({ entity: 'taxrate', action: 'update' })
  async bulkArchive(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids } = BulkIdsSchema.parse(body);
    return runBulk(ids, (id) => this.svc.archive(user.accountId, id));
  }

  @Post('bulk-restore')
  @RequirePermission({ entity: 'taxrate', action: 'update' })
  async bulkRestore(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids } = BulkIdsSchema.parse(body);
    return runBulk(ids, (id) => this.svc.restore(user.accountId, id));
  }
}
