import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { EmployeeDailyKpiCron } from './kpi/employee-daily-kpi.cron.js';
import { EmployeeDailyKpiService } from './kpi/employee-daily-kpi.service.js';
import { KpiConfigController } from './kpi/kpi-config.controller.js';
import { KpiConfigService } from './kpi/kpi-config.service.js';

/**
 * Menejer bo'limi — 4-bo'lim TZ kengaytmasi.
 * `docs/superpowers/specs/2026-08-02-menejer-kunlik-kpi-tz-design.md`
 *
 * 4M.1 bosqichida faqat O'LCHOV yadrosi bor: kunlik xodim KPI hisoblanadi va
 * saqlanadi. HTTP sirt, qabul qilish oqimi va oylikka ulanish — 4M.2 / 4M.3.
 *
 * `ScheduleModule` bu yerda QAYTA ro'yxatdan o'tkazilmaydi — u `app.module.ts`
 * da global (`attendance-geo.module.ts` dagi izoh bilan bir xil konventsiya).
 */
@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [KpiConfigController],
  providers: [EmployeeDailyKpiService, EmployeeDailyKpiCron, KpiConfigService],
  exports: [EmployeeDailyKpiService],
})
export class ManagerModule {}
