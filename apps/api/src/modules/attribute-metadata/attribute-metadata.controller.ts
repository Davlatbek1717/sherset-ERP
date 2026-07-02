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
import { type AttributeEntity, AttributeEntitySchema } from './attribute-metadata.schema.js';
import { AttributeMetadataService } from './attribute-metadata.service.js';

@Controller('attribute-metadata')
@UseGuards(JwtAuthGuard)
export class AttributeMetadataController {
  constructor(@Inject(AttributeMetadataService) private readonly svc: AttributeMetadataService) {}

  @Get()
  @RequirePermission({ entity: 'settings', action: 'view' })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.svc.list(user.accountId, query);
  }

  /** Convenience: definitions for a single entity (public for any logged-in user). */
  @Get('entity/:entity')
  @RequirePermission({ entity: 'settings', action: 'view' })
  async findForEntity(@CurrentUser() user: AuthenticatedUser, @Param('entity') entity: string) {
    const r = AttributeEntitySchema.safeParse(entity);
    if (!r.success) return { items: [] };
    return { items: await this.svc.findForEntity(user.accountId, r.data as AttributeEntity) };
  }

  @Get(':id')
  @RequirePermission({ entity: 'settings', action: 'view' })
  async findById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.findById(user.accountId, id);
  }

  @Post()
  @RequirePermission({ entity: 'settings', action: 'create' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.create(user.accountId, body);
  }

  @Patch(':id')
  @RequirePermission({ entity: 'settings', action: 'update' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.svc.update(user.accountId, id, body);
  }

  @Delete(':id')
  @RequirePermission({ entity: 'settings', action: 'delete' })
  async delete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.delete(user.accountId, id);
  }
}
