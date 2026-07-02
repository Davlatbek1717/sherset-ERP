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
import { GroupService } from './group.service.js';

/**
 * «Отделы» (departments / owner-groups) CRUD — moysklad's `Group` reference that
 * sits behind every document's «Доступ» widget and each employee's «Владелец-отдел».
 * The list (GET /groups) was already read by many pickers (previously served by
 * ReferenceController); it now lives here alongside create/rename/delete so the
 * settings UI can manage departments (they were seed-only before).
 *
 * Tenant-scoped via user.accountId. NOTE (Phase-1): mutations are gated only by
 * auth, not by an admin permission — when the full «Сотрудники» access-admin lands
 * this should move behind an admin/settings permission.
 */
@Controller('groups')
@UseGuards(JwtAuthGuard)
export class GroupController {
  constructor(@Inject(GroupService) private readonly svc: GroupService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.list(user.accountId, search, limit);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.create(user.accountId, body);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: unknown) {
    return this.svc.update(user.accountId, id, body);
  }

  @Delete(':id')
  delete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.delete(user.accountId, id);
  }
}
