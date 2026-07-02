import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../../../prisma/prisma.module.js';
import { HrTaskSendModule } from '../hr-task-send/hr-task-send.module.js';
import { HrDeadlineExpireService } from './hr-deadline-expire.service.js';
import { HrTemplateSchedulerService } from './hr-template-scheduler.service.js';

@Module({
  imports: [ScheduleModule.forRoot(), PrismaModule, HrTaskSendModule],
  providers: [HrTemplateSchedulerService, HrDeadlineExpireService],
  exports: [HrTemplateSchedulerService, HrDeadlineExpireService],
})
export class HrSchedulerModule {}
