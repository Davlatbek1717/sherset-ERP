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
import { PublicationVerifyPasswordSchema } from './publication.schema.js';
import { PublicationService } from './publication.service.js';

/**
 * Authenticated CRUD endpoints (tenant-scoped).
 */
@Controller('publications')
@UseGuards(JwtAuthGuard)
export class PublicationController {
  constructor(@Inject(PublicationService) private readonly service: PublicationService) {}

  @Get()
  @RequirePermission({ entity: 'publication', action: 'view' })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.service.list(user.accountId, query);
  }

  @Get(':id')
  @RequirePermission({ entity: 'publication', action: 'view' })
  async findById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.findById(user.accountId, id);
  }

  @Post()
  @RequirePermission({ entity: 'publication', action: 'create' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.service.create(user.accountId, user.sub, body);
  }

  @Patch(':id')
  @RequirePermission({ entity: 'publication', action: 'update' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.service.update(user.accountId, id, body);
  }

  @Post(':id/revoke')
  @RequirePermission({ entity: 'publication', action: 'update' })
  async revoke(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.revoke(user.accountId, id);
  }

  @Post(':id/rotate-token')
  @RequirePermission({ entity: 'publication', action: 'update' })
  async rotateToken(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.rotateToken(user.accountId, id);
  }

  @Delete(':id')
  @RequirePermission({ entity: 'publication', action: 'delete' })
  async delete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.softDelete(user.accountId, id);
  }
}

/**
 * PUBLIC endpoints — no auth, token-only. Mounted at /p/* so the URL
 * shape stays human-friendly: https://app.uz/p/<token>.
 */
@Controller('p')
export class PublicViewController {
  constructor(@Inject(PublicationService) private readonly service: PublicationService) {}

  @Get(':token')
  async resolve(@Param('token') token: string) {
    return this.service.resolveByToken(token);
  }

  @Post(':token/verify')
  async verify(@Param('token') token: string, @Body() body: unknown) {
    const { password } = PublicationVerifyPasswordSchema.parse(body);
    return this.service.verifyPassword(token, password);
  }

  @Post(':token/view')
  async view(@Param('token') token: string) {
    await this.service.recordView(token);
    return { ok: true };
  }
}
