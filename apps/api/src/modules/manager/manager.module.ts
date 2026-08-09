import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { PermissionsModule } from '../permissions/permissions.module.js';
import { ManagerInventoryController } from './inventory/manager-inventory.controller.js';
import { ManagerInventoryService } from './inventory/manager-inventory.service.js';
import { DailyKpiAcceptanceService } from './kpi/daily-kpi-acceptance.service.js';
import { DailyKpiDrilldownService } from './kpi/daily-kpi-drilldown.service.js';
import { DataQualityService } from './kpi/data-quality.service.js';
import { EmployeeDailyKpiCron } from './kpi/employee-daily-kpi.cron.js';
import { EmployeeDailyKpiService } from './kpi/employee-daily-kpi.service.js';
import { KpiConfigController } from './kpi/kpi-config.controller.js';
import { KpiConfigService } from './kpi/kpi-config.service.js';
import { KpiMetricCatalogService } from './kpi/kpi-metric-catalog.service.js';
import { ManagerKpiController } from './kpi/manager-kpi.controller.js';
import { OwnerWeeklySummaryService } from './kpi/owner-weekly-summary.service.js';
import { LiveStatusService } from './live/live-status.service.js';

/**
 * Menejer bo'limi — 4-bo'lim TZ kengaytmasi.
 * `docs/superpowers/specs/2026-08-02-menejer-kunlik-kpi-tz-design.md`
 *
 * 4M.1 — o'lchov yadrosi (kunlik KPI hisoblanadi va saqlanadi).
 * 4M.2 — QABUL QILISH oqimi: FSM, append-only jurnal, drill-down, kompozit
 *        ball (qabulda MUZLATILADI), har-xodim KPI konfiguratsiyasi, HTTP sirt.
 * 4M.3 — oylikka ulanish (hali yo'q): faqat qabul qilingan kunlar hisobga
 *        kiradi, `daily-kpi-fsm.countsTowardPayroll()` shu shartning yagona
 *        manbai bo'ladi.
 *
 * ⚠️ 2026-08-04: bu modul IKKI mustaqil implementatsiyaning birlashmasi
 * (`wave4m-accept` branchi + `climart-adoption`). Yakuniy tanlov: FSM/servis/
 * drill-down/HTTP — `wave4m-accept` niki (optimistik da'vo va yopiq sabab
 * ro'yxatlari kuchliroq); kompozit ball, ball muzlatish, idempotent no-op va
 * «begona kun 404» — `climart-adoption` niki.
 *
 * `PermissionsModule` — `HrPermissionGuard` `PermissionsService` ni talab
 * qiladi. `ScheduleModule` bu yerda QAYTA ro'yxatdan o'tkazilmaydi — u
 * `app.module.ts` da global (`attendance-geo.module.ts` bilan bir xil).
 */
@Module({
  imports: [PrismaModule, AuthModule, PermissionsModule],
  controllers: [KpiConfigController, ManagerKpiController, ManagerInventoryController],
  providers: [
    EmployeeDailyKpiService,
    EmployeeDailyKpiCron,
    KpiConfigService,
    KpiMetricCatalogService,
    DailyKpiAcceptanceService,
    OwnerWeeklySummaryService,
    LiveStatusService,
    DailyKpiDrilldownService,
    DataQualityService,
    ManagerInventoryService,
  ],
  exports: [EmployeeDailyKpiService, DailyKpiAcceptanceService],
})
export class ManagerModule {}
