import { Body, Controller, Get, Inject, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/auth.schema.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { HrPermissionGuard } from '../hr-auth/hr-permission.guard.js';
import { RequireHrPermission } from '../hr-auth/require-hr-permission.decorator.js';
import { EquipmentService } from './equipment.service.js';
import {
  AssignEquipmentSchema,
  CreateEquipmentSchema,
  EquipmentFilterSchema,
  ReturnEquipmentSchema,
  UpdateEquipmentSchema,
} from './hr-equipment.schema.js';

/**
 * Jihoz reyestri HTTP sirti (MK05).
 *
 * Ruxsat `employees` sahifasiga bog'langan: jihoz reyestri xodimlar
 * bo'limining bir qismi (kim nima olgani — xodim ma'lumoti). Yangi ruxsat
 * kaliti kiritilmadi — u barcha rollarda YOPIQ bo'lib qolib, funksiyani
 * jimgina o'lik qilardi.
 */
@Controller('hr/equipment')
@UseGuards(JwtAuthGuard, HrPermissionGuard)
export class HrEquipmentController {
  constructor(@Inject(EquipmentService) private readonly svc: EquipmentService) {}

  @Get()
  @RequireHrPermission('employees', 'read')
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown) {
    return this.svc.list(user.accountId, EquipmentFilterSchema.parse(query ?? {}));
  }

  // NOTE: statik yo'l `@Get(':id')` dan OLDIN turishi SHART — aks holda
  // «employee» `:id` deb ushlanardi.
  @Get('employee/:employeeId')
  @RequireHrPermission('employees', 'read')
  async forEmployee(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId') employeeId: string,
  ) {
    return this.svc.listForEmployee(user.accountId, employeeId);
  }

  @Get(':id')
  @RequireHrPermission('employees', 'read')
  async get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.get(user.accountId, id);
  }

  @Post()
  @RequireHrPermission('employees', 'full')
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.create(user.accountId, CreateEquipmentSchema.parse(body));
  }

  @Put(':id')
  @RequireHrPermission('employees', 'full')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.svc.update(user.accountId, id, UpdateEquipmentSchema.parse(body));
  }

  @Post(':id/assign')
  @RequireHrPermission('employees', 'full')
  async assign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.svc.assign(user.accountId, user.sub, id, AssignEquipmentSchema.parse(body));
  }

  @Post(':id/return')
  @RequireHrPermission('employees', 'full')
  async returnItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.svc.returnItem(
      user.accountId,
      user.sub,
      id,
      ReturnEquipmentSchema.parse(body ?? {}),
    );
  }
}
