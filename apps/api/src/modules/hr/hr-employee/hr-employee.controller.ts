import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/auth.schema.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { BulkIdsSchema, runBulk } from '../../shared/bulk.js';
import { HrPermissionGuard } from '../hr-auth/hr-permission.guard.js';
import { RequireHrPermission } from '../hr-auth/require-hr-permission.decorator.js';
import {
  CreateHrEmployeeSchema,
  HrEmployeeFilterSchema,
  SetPasswordSchema,
  UpdateHrEmployeeSchema,
} from './hr-employee.schema.js';
import { HrEmployeeService } from './hr-employee.service.js';

@Controller('hr/employees')
@UseGuards(JwtAuthGuard, HrPermissionGuard)
export class HrEmployeeController {
  constructor(@Inject(HrEmployeeService) private readonly svc: HrEmployeeService) {}

  @Get()
  @RequireHrPermission('employees', 'read')
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown) {
    const filter = HrEmployeeFilterSchema.parse(query);
    return this.svc.list(user.accountId, filter);
  }

  @Get('moysklad-agents')
  @RequireHrPermission('employees', 'read')
  async agents(@CurrentUser() user: AuthenticatedUser, @Query('excludeId') excludeId?: string) {
    return this.svc.moyskladAgentsForDropdown(user.accountId, excludeId);
  }

  @Get(':id')
  @RequireHrPermission('employees', 'read')
  async findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.findOne(user.accountId, id);
  }

  @Post()
  @RequireHrPermission('employees', 'full')
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const input = CreateHrEmployeeSchema.parse(body);
    return this.svc.create(user.accountId, input);
  }

  @Put(':id')
  @RequireHrPermission('employees', 'full')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = UpdateHrEmployeeSchema.parse(body);
    return this.svc.update(user.accountId, id, input);
  }

  @Delete(':id')
  @RequireHrPermission('employees', 'full')
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.softDelete(user.accountId, id, user.sub);
  }

  // ─── Bulk «Изменить» (moysklad #employee toolbar) ────────────────────────
  // moysklad's employee «Изменить» menu = {Удалить, Поместить в архив,
  // Извлечь из архива}. Each runs per-id via runBulk (Promise.allSettled) so
  // one failure (e.g. an FK-restricted hard delete) reports as a partial
  // result rather than aborting the batch. user.sub is forwarded so the
  // service can block self-archive/self-delete (login filters archived).
  // NOTE: these static POST routes MUST stay declared BEFORE @Post(':id/...')
  // so 'bulk-archive' is never matched as an :id param.

  @Post('bulk-archive')
  @RequireHrPermission('employees', 'full')
  async bulkArchive(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids } = BulkIdsSchema.parse(body);
    return runBulk(ids, (id) => this.svc.setArchived(user.accountId, id, true, user.sub));
  }

  @Post('bulk-restore')
  @RequireHrPermission('employees', 'full')
  async bulkRestore(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids } = BulkIdsSchema.parse(body);
    return runBulk(ids, (id) => this.svc.setArchived(user.accountId, id, false, user.sub));
  }

  @Post('bulk-delete')
  @RequireHrPermission('employees', 'full')
  async bulkDelete(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids } = BulkIdsSchema.parse(body);
    return runBulk(ids, (id) => this.svc.hardDelete(user.accountId, id, user.sub));
  }

  @Post(':id/set-password')
  @RequireHrPermission('employees', 'full')
  async setPassword(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = SetPasswordSchema.parse(body);
    return this.svc.setPassword(user.accountId, id, input);
  }
}
