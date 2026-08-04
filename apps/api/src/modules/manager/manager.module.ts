import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { DailyKpiAcceptanceController } from './kpi/daily-kpi-acceptance.controller.js';
import { DailyKpiAcceptanceService } from './kpi/daily-kpi-acceptance.service.js';
import { EmployeeDailyKpiCron } from './kpi/employee-daily-kpi.cron.js';
import { EmployeeDailyKpiService } from './kpi/employee-daily-kpi.service.js';
import { KpiConfigController } from './kpi/kpi-config.controller.js';
import { KpiConfigService } from './kpi/kpi-config.service.js';
import { MyKpiController } from './kpi/my-kpi.controller.js';

/**
 * Menejer bo'limi — 4-bo'lim TZ kengaytmasi.
 * `docs/superpowers/specs/2026-08-02-menejer-kunlik-kpi-tz-design.md`
 *
 * 4M.1 — o'lchov yadrosi (kunlik xodim KPI hisoblanadi va saqlanadi).
 * 4M.2 — har-xodim KPI konfiguratsiyasi + **kunlik qabul qilish**: FSM,
 *        append-only hodisa jurnali, kompozit ball, tuzatma, rad etish
 *        halqasi va egaga eskalatsiya.
 * 4M.3 — qabulni oylikka ulash (bloklash · idempotent bonus/jarima).
 *
 * `ScheduleModule` bu yerda QAYTA ro'yxatdan o'tkazilmaydi — u `app.module.ts`
 * da global (`attendance-geo.module.ts` dagi izoh bilan bir xil konventsiya).
 */
@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [KpiConfigController, DailyKpiAcceptanceController, MyKpiController],
  providers: [
    EmployeeDailyKpiService,
    EmployeeDailyKpiCron,
    KpiConfigService,
    DailyKpiAcceptanceService,
  ],
  exports: [EmployeeDailyKpiService, DailyKpiAcceptanceService],
})
export class ManagerModule {}
