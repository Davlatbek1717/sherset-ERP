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
import { SavedFilterService } from './saved-filter.service.js';

/**
 * Per-user saved-filter pills shown under list-page sub-navs.
 * Mirrors moysklad's account-defined chips ("ипадром", "Фаррухбек
 * касса"). Scoped per-(user, entity) — no cross-user leakage.
 *
 * No RequirePermission — these are personal preferences, not
 * tenant-scoped business data. Auth (JwtAuthGuard) is sufficient.
 */
@Controller('saved-filters')
@UseGuards(JwtAuthGuard)
export class SavedFilterController {
  constructor(@Inject(SavedFilterService) private readonly svc: SavedFilterService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() q: Record<string, unknown>) {
    return this.svc.list(user.accountId, user.sub, q);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.create(user.accountId, user.sub, body);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: unknown) {
    return this.svc.update(user.accountId, user.sub, id, body);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.remove(user.accountId, user.sub, id);
  }
}
