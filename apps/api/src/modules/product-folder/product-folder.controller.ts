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
import { ProductFolderService } from './product-folder.service.js';

@Controller('product-folders')
@UseGuards(JwtAuthGuard)
export class ProductFolderController {
  constructor(@Inject(ProductFolderService) private readonly service: ProductFolderService) {}

  @Get()
  @RequirePermission({ entity: 'productfolder', action: 'view' })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.service.list(user.accountId, query);
  }

  @Get('tree')
  @RequirePermission({ entity: 'productfolder', action: 'view' })
  async tree(@CurrentUser() user: AuthenticatedUser) {
    return this.service.tree(user.accountId);
  }

  @Get(':id')
  @RequirePermission({ entity: 'productfolder', action: 'view' })
  async getOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.findById(user.accountId, id);
  }

  @Post()
  @RequirePermission({ entity: 'productfolder', action: 'create' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.service.create(user.accountId, user.sub, body);
  }

  @Patch(':id')
  @RequirePermission({ entity: 'productfolder', action: 'update' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.service.update(user.accountId, user.sub, id, body);
  }

  @Post(':id/archive')
  @RequirePermission({ entity: 'productfolder', action: 'create' })
  async archive(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.archive(user.accountId, user.sub, id, true);
  }

  @Post(':id/restore')
  @RequirePermission({ entity: 'productfolder', action: 'create' })
  async restore(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.archive(user.accountId, user.sub, id, false);
  }

  @Delete(':id')
  @RequirePermission({ entity: 'productfolder', action: 'delete' })
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.delete(user.accountId, user.sub, id);
  }

  @Post('bulk-delete')
  @RequirePermission({ entity: 'productfolder', action: 'delete' })
  async bulkDelete(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids } = BulkIdsSchema.parse(body);
    return runBulk(ids, (id) => this.service.delete(user.accountId, user.sub, id));
  }

  @Post('bulk-archive')
  @RequirePermission({ entity: 'productfolder', action: 'create' })
  async bulkArchive(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids } = BulkIdsSchema.parse(body);
    return runBulk(ids, (id) => this.service.archive(user.accountId, user.sub, id, true));
  }

  @Post('bulk-restore')
  @RequirePermission({ entity: 'productfolder', action: 'create' })
  async bulkRestore(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids } = BulkIdsSchema.parse(body);
    return runBulk(ids, (id) => this.service.archive(user.accountId, user.sub, id, false));
  }
}
