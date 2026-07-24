import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module.js';
import { AuthModule } from '../../auth/auth.module.js';
import { HrAuthModule } from '../hr-auth/hr-auth.module.js';
import { HrEventsModule } from '../hr-events/hr-events.module.js';
import { HrAttendanceController } from './hr-attendance.controller.js';
import { HrAttendanceService } from './hr-attendance.service.js';

@Module({
  imports: [PrismaModule, AuthModule, HrAuthModule, HrEventsModule],
  controllers: [HrAttendanceController],
  providers: [HrAttendanceService],
  exports: [HrAttendanceService],
})
export class HrAttendanceModule {}
