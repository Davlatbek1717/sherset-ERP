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
import { HelpService } from './help.service.js';

@Controller('help')
@UseGuards(JwtAuthGuard)
export class HelpController {
  constructor(@Inject(HelpService) private readonly svc: HelpService) {}

  /** GET /help/articles?route=&locale=uz — context drawer feed. */
  @Get('articles')
  async articles(
    @CurrentUser() user: AuthenticatedUser,
    @Query('route') route?: string,
    @Query('locale') locale?: string,
  ) {
    if (route) {
      return this.svc.findForRoute(user.accountId, route, locale ?? 'uz');
    }
    return this.svc.list(user.accountId, { locale: locale ?? 'uz', enabled: 'true' });
  }

  @Get('articles/by-slug/:slug')
  async bySlug(
    @CurrentUser() user: AuthenticatedUser,
    @Param('slug') slug: string,
    @Query('locale') locale?: string,
  ) {
    return this.svc.findBySlug(user.accountId, slug, locale ?? 'uz');
  }

  @Get('articles/admin')
  @RequirePermission({ entity: 'settings', action: 'view' })
  async listAdmin(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.svc.list(user.accountId, query);
  }

  @Get('articles/:id')
  @RequirePermission({ entity: 'settings', action: 'view' })
  async findById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.findById(user.accountId, id);
  }

  @Post('articles')
  @RequirePermission({ entity: 'settings', action: 'create' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.create(user.accountId, body);
  }

  @Patch('articles/:id')
  @RequirePermission({ entity: 'settings', action: 'update' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.svc.update(user.accountId, id, body);
  }

  @Post('articles/:id/archive')
  @RequirePermission({ entity: 'settings', action: 'update' })
  async archive(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.archive(user.accountId, id);
  }

  @Post('articles/:id/restore')
  @RequirePermission({ entity: 'settings', action: 'update' })
  async restore(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.restore(user.accountId, id);
  }

  @Delete('articles/:id')
  @RequirePermission({ entity: 'settings', action: 'delete' })
  async delete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.delete(user.accountId, id);
  }
}
