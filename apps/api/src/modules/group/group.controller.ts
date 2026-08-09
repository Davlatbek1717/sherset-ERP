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
import { GroupService } from './group.service.js';

/**
 * «Отделы» (departments / owner-groups) CRUD — moysklad's `Group` reference that
 * sits behind every document's «Доступ» widget and each employee's «Владелец-отдел».
 * The list (GET /groups) was already read by many pickers (previously served by
 * ReferenceController); it now lives here alongside create/rename/delete so the
 * settings UI can manage departments (they were seed-only before).
 *
 * Tenant-scoped via user.accountId. AUTH-07 (faza 23): mutatsiyalar endi
 * `settings` entity ruxsati ostida — ilgari faqat `JwtAuthGuard` bor edi va
 * PermissionsGuard `@RequirePermission`siz handler'ni JIM o'tkazib yuborardi,
 * ya'ni har autentifikatsiyalangan xodim bo'lim yaratib/o'chira olardi.
 * GET ataylab ochiq: bo'lim ro'yxatini ko'plab picker'lar o'qiydi.
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
  @RequirePermission({ entity: 'settings', action: 'create' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.create(user.accountId, body);
  }

  @Patch(':id')
  @RequirePermission({ entity: 'settings', action: 'update' })
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: unknown) {
    return this.svc.update(user.accountId, id, body);
  }

  @Delete(':id')
  @RequirePermission({ entity: 'settings', action: 'delete' })
  delete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.delete(user.accountId, id);
  }
}
