import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { HrAttendanceModule } from './attendance/attendance.module.js';
import { HrAuthModule } from './hr-auth/hr-auth.module.js';
import { HrBonusFineModule } from './hr-bonus-fine/hr-bonus-fine.module.js';
import { HrDashboardModule } from './hr-dashboard/hr-dashboard.module.js';
import { HrEmployeePermissionModule } from './hr-employee-permission/hr-employee-permission.module.js';
import { HrEmployeeModule } from './hr-employee/hr-employee.module.js';
import { HrEventsModule } from './hr-events/hr-events.module.js';
import { HrKpiModule } from './hr-kpi/hr-kpi.module.js';
import { HrMessagesModule } from './hr-messages/hr-messages.module.js';
import { HrNotificationTemplateModule } from './hr-notification-template/hr-notification-template.module.js';
import { HrReportsModule } from './hr-reports/hr-reports.module.js';
import { HrRoleModule } from './hr-role/hr-role.module.js';
import { HrSalaryModule } from './hr-salary/hr-salary.module.js';
import { HrSchedulerModule } from './hr-scheduler/hr-scheduler.module.js';
import { HrSettingsModule } from './hr-settings/hr-settings.module.js';
import { HrActivityInterceptor } from './hr-shared/hr-activity.interceptor.js';
import { HrTaskReviewModule } from './hr-task-review/hr-task-review.module.js';
import { HrTaskSendModule } from './hr-task-send/hr-task-send.module.js';
import { HrTaskTemplateModule } from './hr-task-template/hr-task-template.module.js';
import { HrTelegramAccountModule } from './hr-telegram-account/hr-telegram-account.module.js';
import { HrTelegramBridgeModule } from './hr-telegram-bridge/hr-telegram-bridge.module.js';
import { HrWebsocketModule } from './hr-websocket/hr-websocket.module.js';

/**
 * HR module — top-level aggregator. "Yechimlardan keyin" yangi top-menu.
 *
 * Sub-modules:
 *   - hr-auth: permission guard + decorator (P0 placeholder, P1 enforce)
 *   - hr-events: NestJS EventEmitter wiring (domain hooks from existing
 *     services like Demand, PaymentIn → HR Telegram bridge listeners)
 *   - hr-scheduler: cron + interval registry (queue 5s, deadline 60s,
 *     KPI 23:30, telegram health 5min, per-template dynamic cron)
 *   - hr-websocket: gateways for /ws/hr/sync (admin) and /ws/hr/tasks/:id
 *   - Operational: attendance, hr-task-template, hr-task-review,
 *     hr-task-send, hr-kpi, hr-bonus-fine, hr-salary
 *   - Telegram: hr-telegram-account (MTProto session, DB encrypted),
 *     hr-telegram-bridge (outbox worker + listeners), hr-messages
 *   - Read models: hr-dashboard, hr-reports, hr-settings
 *
 * Source spec: docs/superpowers/specs/2026-05-20-hr-module-master-design.md
 * Implementation plan: docs/superpowers/plans/2026-05-20-p0-hr-foundation.md
 */
@Module({
  imports: [
    HrAuthModule,
    HrEventsModule,
    HrAttendanceModule,
    HrEmployeeModule,
    HrEmployeePermissionModule,
    HrRoleModule,
    HrTaskTemplateModule,
    HrTaskReviewModule,
    HrTaskSendModule,
    HrKpiModule,
    HrBonusFineModule,
    HrSalaryModule,
    HrTelegramBridgeModule,
    HrTelegramAccountModule,
    HrMessagesModule,
    HrDashboardModule,
    HrReportsModule,
    HrNotificationTemplateModule,
    HrSettingsModule,
    HrSchedulerModule,
    HrWebsocketModule,
  ],
  providers: [{ provide: APP_INTERCEPTOR, useClass: HrActivityInterceptor }],
})
export class HrModule {}
