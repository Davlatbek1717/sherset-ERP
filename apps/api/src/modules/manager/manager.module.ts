import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { DebtModule } from '../debt/debt.module.js';
import { DriverTrackingModule } from '../hr/driver-tracking/driver-tracking.module.js';
import { MoneyModule } from '../money/money.module.js';
import { PermissionsModule } from '../permissions/permissions.module.js';
import { ReportModule } from '../report/report.module.js';
import { StockModule } from '../stock/stock.module.js';
import { DebtCollectionService } from './collection/debt-collection.service.js';
import { ManagerCollectionController } from './collection/manager-collection.controller.js';
import { ManagerCommentTemplateController } from './comments/manager-comment-template.controller.js';
import { ManagerCommentTemplateService } from './comments/manager-comment-template.service.js';
import { ManagerInventoryController } from './inventory/manager-inventory.controller.js';
import { ManagerInventoryService } from './inventory/manager-inventory.service.js';
import { DecisionJournalService } from './journal/decision-journal.service.js';
import { ManagerJournalController } from './journal/manager-journal.controller.js';
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
import { MoneyMapController } from './money-map/money-map.controller.js';
import { MoneyMapService } from './money-map/money-map.service.js';
import { ManagerQueueController } from './queue/manager-queue.controller.js';
import { ManagerQueueService } from './queue/manager-queue.service.js';
import { ManagerSlaController } from './sla/manager-sla.controller.js';
import { ManagerSlaService } from './sla/manager-sla.service.js';

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
  // MK16 — `DebtModule` OSHKORA import qilinadi: `DebtCollectionService`
  // eslatmani `DebtService.sendBulkReminders` ga topshiradi (yangi jo'natgich
  // qurilmadi). Hech bir test DI grafini qurmaydi ⇒ modulni import qilishni
  // unutish faqat runtime'da chiqardi.
  //
  // MK15 — `MoneyMapService` TO'RTTA begona modul servisidan o'qiydi, shuning
  // uchun ularning hammasi OSHKORA import qilinadi: `MoneyModule` (kassa/bank
  // qoldig'i), `ReportModule` (kontragent saldosi), `StockModule` (yo'ldagi
  // tovar), `DriverTrackingModule` (haydovchi naqdi). Bu yerda ham o'sha
  // qoida: DI grafini hech bir unit test qurmaydi ⇒ import unutilsa faqat
  // runtime'da chiqadi (`app-boot.test.ts` shuning uchun bor).
  imports: [
    PrismaModule,
    AuthModule,
    PermissionsModule,
    DebtModule,
    MoneyModule,
    ReportModule,
    StockModule,
    DriverTrackingModule,
  ],
  controllers: [
    KpiConfigController,
    ManagerKpiController,
    ManagerInventoryController,
    ManagerQueueController,
    ManagerCollectionController,
    ManagerSlaController,
    ManagerCommentTemplateController,
    ManagerJournalController,
    MoneyMapController,
  ],
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
    ManagerQueueService,
    DebtCollectionService,
    ManagerSlaService,
    // MK20 — `ManagerQueueService` va `DailyKpiAcceptanceService` shu servisni
    // @Inject qiladi. Provayder unutilsa DI faqat RUNTIME'da yiqilardi
    // (`@Global` in'yeksiya qo'riqsiz — `app-boot.test.ts` shu uchun bor).
    ManagerCommentTemplateService,
    DecisionJournalService,
    MoneyMapService,
  ],
  exports: [EmployeeDailyKpiService, DailyKpiAcceptanceService],
})
export class ManagerModule {}
