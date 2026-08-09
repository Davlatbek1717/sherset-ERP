import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/auth.schema.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { HrPermissionGuard } from '../../hr/hr-auth/hr-permission.guard.js';
import { RequireHrPermission } from '../../hr/hr-auth/require-hr-permission.decorator.js';
import { CustomerListQuerySchema, ReassignBodySchema } from './manager-customers.schema.js';
import { ManagerCustomersService } from './manager-customers.service.js';

/**
 * MK38 / 4-bo'lim TZ §6 — mijoz taqsimotining HTTP sirti.
 *
 * Ruxsat: `employees:read` / `employees:full` — menejer bo'limining qolgan
 * sirtlari bilan bir xil darvoza (MK06/MK37 bilan izchil).
 */
@Controller('manager/customers')
@UseGuards(JwtAuthGuard, HrPermissionGuard)
export class ManagerCustomersController {
  constructor(@Inject(ManagerCustomersService) private readonly svc: ManagerCustomersService) {}

  /** Mijozlar + havza manzarasi (kim nechta mijozga javobgar). */
  @Get()
  @RequireHrPermission('employees', 'read')
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown) {
    return this.svc.list(user.accountId, CustomerListQuerySchema.parse(query ?? {}));
  }

  /** Bitta mijozning egalik tarixi. */
  @Get(':id/owner-history')
  @RequireHrPermission('employees', 'read')
  async history(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.ownerHistory(user.accountId, id);
  }

  /** Egalikni o'zgartirish — tarix `audit_log` ga yoziladi. */
  @Post('reassign')
  @RequireHrPermission('employees', 'full')
  async reassign(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.reassign(user.accountId, user.sub, ReassignBodySchema.parse(body ?? {}));
  }
}
