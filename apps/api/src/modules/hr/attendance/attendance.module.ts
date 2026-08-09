import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module.js';
import { AuthModule } from '../../auth/auth.module.js';
import { HrAttendanceNotifyModule } from '../hr-attendance-notify/hr-attendance-notify.module.js';
import { HrAuthModule } from '../hr-auth/hr-auth.module.js';
import { HrEventsModule } from '../hr-events/hr-events.module.js';
import { HrAttendanceController } from './hr-attendance.controller.js';
import { HrAttendanceService } from './hr-attendance.service.js';

@Module({
  // `HrAttendanceNotifyModule` — OSHKORA import (HR-3 `LateFineService` in'yeksiyasi).
  // Xotira `global-di-injection-unguarded.md`: @Inject qo'shilganda modulni ham ulash shart,
  // aks holda typecheck jim o'tadi-yu ilova ko'tarilishda yiqiladi.
  imports: [PrismaModule, AuthModule, HrAuthModule, HrEventsModule, HrAttendanceNotifyModule],
  controllers: [HrAttendanceController],
  providers: [HrAttendanceService],
  exports: [HrAttendanceService],
})
export class HrAttendanceModule {}
