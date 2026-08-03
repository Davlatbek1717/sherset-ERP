import { Body, Controller, Get, Inject, Param, Put, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/auth.schema.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { SaveKpiConfigSchema } from './kpi-config.schema.js';
import { KpiConfigService } from './kpi-config.service.js';

/**
 * Menejer KPI konfiguratsiyasi (TZ 4M.2) — har-xodim ko'rsatkich + og'irlik +
 * kunlik maqsad. Barchasi JWT bilan himoyalangan.
 *
 * TODO(rol-gate): faqat menejer/admin roli sozlashi kerak (permissions tizimi
 * barqarorlashgach — driver-tracking.controller bilan bir xil konvention).
 */
@Controller('manager/kpi')
@UseGuards(JwtAuthGuard)
export class KpiConfigController {
  constructor(@Inject(KpiConfigService) private readonly kpi: KpiConfigService) {}

  /** Ko'rsatkich katalogi (tanlagich uchun). */
  @Get('metrics')
  metrics() {
    return this.kpi.listMetrics();
  }

  /** Xodimning joriy KPI konfiguratsiyasi. */
  @Get('employee/:employeeId/config')
  getConfig(@CurrentUser() user: AuthenticatedUser, @Param('employeeId') employeeId: string) {
    return this.kpi.getEmployeeConfig(user.accountId, employeeId);
  }

  /** Xodim KPI konfiguratsiyasini saqlash (yangi versiya). */
  @Put('employee/:employeeId/config')
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
