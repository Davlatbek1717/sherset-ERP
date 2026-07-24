import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module.js';
import { AuthModule } from '../../auth/auth.module.js';
import { HrAuthModule } from '../hr-auth/hr-auth.module.js';
import { HrScheduleController } from './hr-schedule.controller.js';
import { HrScheduleService } from './hr-schedule.service.js';

@Module({
  imports: [PrismaModule, AuthModule, HrAuthModule],
  controllers: [HrScheduleController],
  providers: [HrScheduleService],
  exports: [HrScheduleService],
})
export class HrScheduleModule {}
