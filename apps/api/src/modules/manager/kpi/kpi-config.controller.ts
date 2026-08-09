import { Body, Controller, Get, Inject, Param, Put, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/auth.schema.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { HrPermissionGuard } from '../../hr/hr-auth/hr-permission.guard.js';
import { RequireHrPermission } from '../../hr/hr-auth/require-hr-permission.decorator.js';
import { SaveKpiConfigSchema } from './kpi-config.schema.js';
import { KpiConfigService } from './kpi-config.service.js';

/**
 * Menejer KPI konfiguratsiyasi (TZ 4M.2) — har-xodim ko'rsatkich + og'irlik +
 * kunlik maqsad.
 *
 * AUTH-07 (faza 23) — eski `TODO(rol-gate)` yopildi: **yozuv** (`PUT .../config`)
 * endi `employees:full` talab qiladi. Bu konfiguratsiya oylik formulasiga kiradi
 * (4M.3), ya'ni rol-tekshiruvsiz har autentifikatsiyalangan xodim O'ZIGA qulay
 * maqsad/og'irlik qo'yib olishi mumkin edi. O'qish (`GET`) ochiq qoladi — sahifa
 * ko'rish HR-navbat ekranlari bilan bir xil darajada.
 */
@Controller('manager/kpi')
@UseGuards(JwtAuthGuard, HrPermissionGuard)
export class KpiConfigController {
  constructor(@Inject(KpiConfigService) private readonly kpi: KpiConfigService) {}

  /** Ko'rsatkich katalogi (tanlagich uchun): built-in + hisobning O'Z KPI'lari. */
  @Get('metrics')
  metrics(@CurrentUser() user: AuthenticatedUser) {
    return this.kpi.listMetrics(user.accountId);
  }

  /** Xodimning joriy KPI konfiguratsiyasi. */
  @Get('employee/:employeeId/config')
  getConfig(@CurrentUser() user: AuthenticatedUser, @Param('employeeId') employeeId: string) {
    return this.kpi.getEmployeeConfig(user.accountId, employeeId);
  }

  /** Xodim KPI konfiguratsiyasini saqlash (yangi versiya). */
  @Put('employee/:employeeId/config')
  @RequireHrPermission('employees', 'full')
  saveConfig(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId') employeeId: string,
    @Body() body: unknown,
  ) {
    return this.kpi.saveEmployeeConfig(
      user.accountId,
      user.sub,
      employeeId,
      SaveKpiConfigSchema.parse(body),
    );
  }

  /** Xodimning hisoblangan kunlik KPI natijasi (fakt vs maqsad). */
  @Get('employee/:employeeId/daily')
  daily(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId') employeeId: string,
    @Query('date') date?: string,
  ) {
    return this.kpi.getEmployeeDaily(user.accountId, employeeId, date);
  }
}
