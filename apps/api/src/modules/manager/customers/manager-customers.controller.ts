import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/auth.schema.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { HrPermissionGuard } from '../../hr/hr-auth/hr-permission.guard.js';
import { RequireHrPermission } from '../../hr/hr-auth/require-hr-permission.decorator.js';
import { LostCustomerQuerySchema, MarkLostReasonSchema } from './lost-customers.schema.js';
import { LostCustomersService } from './lost-customers.service.js';
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
  constructor(
    @Inject(ManagerCustomersService) private readonly svc: ManagerCustomersService,
    @Inject(LostCustomersService) private readonly lost: LostCustomersService,
  ) {}

  /** Mijozlar + havza manzarasi (kim nechta mijozga javobgar). */
  @Get()
  @RequireHrPermission('employees', 'read')
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown) {
    return this.svc.list(user.accountId, CustomerListQuerySchema.parse(query ?? {}));
  }

  /**
   * MK17 — yo'qolgan mijozlar signali. ATAYLAB shu kontrollerda: mijoz
   * taqsimoti bilan bir sirt, ikkinchi `manager/customers` prefiksli
   * kontroller ochilsa Fastify marshrutlari to'qnashardi
   * ([[duplicate-route-prod-502]]).
   */
  @Get('lost')
  @RequireHrPermission('employees', 'read')
  async lostList(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown) {
    return this.lost.list(user.accountId, LostCustomerQuerySchema.parse(query ?? {}));
  }

  /** MK17 — ketish sababini belgilash (`counterparty_notes` jurnaliga). */
  @Post('lost-reason')
  @RequireHrPermission('employees', 'full')
  async markLostReason(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.lost.markReason(user.accountId, user.sub, MarkLostReasonSchema.parse(body ?? {}));
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
