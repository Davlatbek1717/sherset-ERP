import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module.js';
import { AuthModule } from '../../auth/auth.module.js';
import { HrAuthModule } from '../hr-auth/hr-auth.module.js';
import { HrEventsModule } from '../hr-events/hr-events.module.js';
import { HrAttendanceNotifier } from './attendance-notifier.service.js';
import { HrAttendanceNotifyController } from './hr-attendance-notify.controller.js';
import { HrAttendanceNotifyService } from './hr-attendance-notify.service.js';
import { LateFineService } from './late-fine.service.js';

@Module({
  imports: [PrismaModule, AuthModule, HrAuthModule, HrEventsModule],
  controllers: [HrAttendanceNotifyController],
  providers: [HrAttendanceNotifyService, LateFineService, HrAttendanceNotifier],
  exports: [HrAttendanceNotifyService],
})
export class HrAttendanceNotifyModule {}
