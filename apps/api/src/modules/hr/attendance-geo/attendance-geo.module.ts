import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module.js';
import { AuthModule } from '../../auth/auth.module.js';
import { HrAuthModule } from '../hr-auth/hr-auth.module.js';
import { HrEventsModule } from '../hr-events/hr-events.module.js';
import { HrDavomatAdminController } from './davomat-admin.controller.js';
import { HrDavomatAutoCheckoutCron } from './davomat-autocheckout.cron.js';
import { HrDavomatExportService } from './davomat-export.service.js';
import { HrDavomatPingCleanupCron } from './davomat-ping-cleanup.cron.js';
import { HrDavomatReportService } from './davomat-report.service.js';
import { HrDavomatStatusService } from './davomat-status.service.js';
import { HrEmployeeScheduleController } from './employee-schedule.controller.js';
import { HrEmployeeScheduleService } from './employee-schedule.service.js';
import { HrMonitoringController } from './monitoring.controller.js';
import { HrMonitoringService } from './monitoring.service.js';
import { HrPingIngestService } from './ping-ingest.service.js';
import { HrDavomatPingController } from './ping.controller.js';
import { HrWorkLocationController } from './work-location.controller.js';
import { HrWorkLocationService } from './work-location.service.js';

/**
 * HR GPS-davomat (avtomatik keldi/ketdi). New sibling of the manual-attendance
 * module — shares the HrAttendance table. Crons are auto-discovered by the
 * globally-registered ScheduleModule (do NOT re-register it here).
 *
 * TZ: docs/superpowers/specs/2026-07-23-hr-gps-attendance-design.md
 */
@Module({
  imports: [PrismaModule, AuthModule, HrAuthModule, HrEventsModule],
  controllers: [
    HrDavomatPingController,
    HrDavomatAdminController,
    HrWorkLocationController,
    HrEmployeeScheduleController,
    HrMonitoringController,
  ],
  providers: [
    HrPingIngestService,
    HrDavomatStatusService,
    HrDavomatReportService,
    HrDavomatExportService,
    HrWorkLocationService,
    HrEmployeeScheduleService,
    HrMonitoringService,
    HrDavomatAutoCheckoutCron,
    HrDavomatPingCleanupCron,
  ],
})
export class AttendanceGeoModule {}
