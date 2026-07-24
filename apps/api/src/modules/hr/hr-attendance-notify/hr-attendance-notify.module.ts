import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module.js';
import { AuthModule } from '../../auth/auth.module.js';
import { HrAuthModule } from '../hr-auth/hr-auth.module.js';
import { HrAttendanceNotifyController } from './hr-attendance-notify.controller.js';
import { HrAttendanceNotifyService } from './hr-attendance-notify.service.js';

@Module({
  imports: [PrismaModule, AuthModule, HrAuthModule],
  controllers: [HrAttendanceNotifyController],
  providers: [HrAttendanceNotifyService],
  exports: [HrAttendanceNotifyService],
})
export class HrAttendanceNotifyModule {}
