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
import { DiscountService } from './discount.service.js';

@Controller('discounts')
@UseGuards(JwtAuthGuard)
export class DiscountController {
  constructor(@Inject(DiscountService) private readonly svc: DiscountService) {}

  @Get()
  @RequirePermission({ entity: 'discount', action: 'view' })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.svc.list(user.accountId, query);
  }

  @Get(':id')
  @RequirePermission({ entity: 'discount', action: 'view' })
  async findById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.findById(user.accountId, id);
  }

  @Post()
  @RequirePermission({ entity: 'discount', action: 'create' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.create(user.accountId, body);
  }

  @Patch(':id')
  @RequirePermission({ entity: 'discount', action: 'update' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.svc.update(user.accountId, id, body);
  }

  @Post(':id/archive')
  @RequirePermission({ entity: 'discount', action: 'update' })
  async archive(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.softArchive(user.accountId, id);
  }

  @Delete(':id')
  @RequirePermission({ entity: 'discount', action: 'delete' })
  async delete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.delete(user.accountId, id);
  }

  @Post('bulk-delete')
  @RequirePermission({ entity: 'discount', action: 'delete' })
  async bulkDelete(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids } = BulkIdsSchema.parse(body);
    return runBulk(ids, (id) => this.svc.delete(user.accountId, id));
  }

  @Post('bulk-archive')
  @RequirePermission({ entity: 'discount', action: 'update' })
  async bulkArchive(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids } = BulkIdsSchema.parse(body);
    return runBulk(ids, (id) => this.svc.softArchive(user.accountId, id));
  }
}
