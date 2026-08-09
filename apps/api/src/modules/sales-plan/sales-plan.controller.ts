import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { HrPermissionGuard } from '../hr/hr-auth/hr-permission.guard.js';
import { RequireHrPermission } from '../hr/hr-auth/require-hr-permission.decorator.js';
import { SalesPlanBodySchema, SalesPlanReportQuerySchema } from './sales-plan.schema.js';
import { SalesPlanService } from './sales-plan.service.js';

/**
 * MK37 — sotuv rejasining HTTP sirti.
 *
 * Ruxsat: `employees:read` (ko'rish) va `employees:full` (reja yozish) —
 * `manager/queue` va `manager/kpi` bilan AYNAN bir xil darvoza. Yangi
 * `PermissionEntity` kiritilmadi: u seed matritsasini ham talab qilardi va
 * MK26–MK30 ruxsat to'lqinining qamrovida (MK06/MK12 da ham shu qaror).
 *
 * 🔴 Bu yerda hech bir endpoint hujjat yaratmaydi va hech qanday amalni
 * to'xtatmaydi.
 */
@Controller('sales-plan')
@UseGuards(JwtAuthGuard, HrPermissionGuard)
export class SalesPlanController {
  constructor(@Inject(SalesPlanService) private readonly svc: SalesPlanService) {}

  /** Oy kesimidagi reja/fakt/bajarilish (xodimlar × plan turlari). */
  @Get()
  @RequireHrPermission('employees', 'read')
  async report(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown) {
    return this.svc.report(user.accountId, SalesPlanReportQuerySchema.parse(query ?? {}));
  }

  /** Reja kiritish/yangilash (xodim × oy × tur = bitta qator). */
  @Post()
  @RequireHrPermission('employees', 'full')
  async upsert(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.upsertPlan(user.accountId, user.sub, SalesPlanBodySchema.parse(body));
  }

  /** Rejani olib tashlash — «reja qo'yilmagan» holatiga qaytadi (0 EMAS). */
  @Delete(':id')
  @RequireHrPermission('employees', 'full')
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.deletePlan(user.accountId, id);
  }
}
