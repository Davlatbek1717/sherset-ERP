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
import { CustomEntityService } from './custom-entity.service.js';

@Controller('custom-entities')
@UseGuards(JwtAuthGuard)
export class CustomEntityController {
  constructor(@Inject(CustomEntityService) private readonly svc: CustomEntityService) {}

  // =====================================================================
  // Parent CRUD
  // =====================================================================

  @Get()
  @RequirePermission({ entity: 'customentity', action: 'view' })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.svc.list(user.accountId, query);
  }

  @Get(':id')
  @RequirePermission({ entity: 'customentity', action: 'view' })
  async findById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.findById(user.accountId, id);
  }

  @Post()
  @RequirePermission({ entity: 'customentity', action: 'create' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.create(user.accountId, body);
  }

  @Patch(':id')
  @RequirePermission({ entity: 'customentity', action: 'update' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.svc.update(user.accountId, id, body);
  }

  @Delete(':id')
  @RequirePermission({ entity: 'customentity', action: 'delete' })
  async delete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.delete(user.accountId, id);
  }

  // =====================================================================
  // Child (values) CRUD
  // =====================================================================

  @Get(':id/values')
  @RequirePermission({ entity: 'customentity', action: 'view' })
  async listValues(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.listValues(user.accountId, id);
  }

  @Post(':id/values')
  @RequirePermission({ entity: 'customentity', action: 'create' })
  async createValue(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.svc.createValue(user.accountId, id, body);
  }

  @Patch(':id/values/:valueId')
  @RequirePermission({ entity: 'customentity', action: 'update' })
  async updateValue(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('valueId') valueId: string,
    @Body() body: unknown,
  ) {
    return this.svc.updateValue(user.accountId, id, valueId, body);
  }

  @Delete(':id/values/:valueId')
  @RequirePermission({ entity: 'customentity', action: 'delete' })
  async deleteValue(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('valueId') valueId: string,
  ) {
    return this.svc.deleteValue(user.accountId, id, valueId);
  }
}
