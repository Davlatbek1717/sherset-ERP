import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../../../prisma/prisma.module.js';
import { AuthModule } from '../../auth/auth.module.js';
import { HrAuthModule } from '../hr-auth/hr-auth.module.js';
import { HrSalaryModule } from '../hr-salary/hr-salary.module.js';
import { HrKpiCron } from './hr-kpi-cron.service.js';
import { HrKpiController } from './hr-kpi.controller.js';
import { HrKpiService } from './hr-kpi.service.js';

@Module({
  imports: [ScheduleModule.forRoot(), PrismaModule, AuthModule, HrAuthModule, HrSalaryModule],
  controllers: [HrKpiController],
  providers: [HrKpiService, HrKpiCron],
  exports: [HrKpiService],
})
export class HrKpiModule {}
