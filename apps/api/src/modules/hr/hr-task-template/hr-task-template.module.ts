import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module.js';
import { AuthModule } from '../../auth/auth.module.js';
import { HrAuthModule } from '../hr-auth/hr-auth.module.js';
import { HrSchedulerModule } from '../hr-scheduler/hr-scheduler.module.js';
import { HrTaskTemplateController } from './hr-task-template.controller.js';
import { HrTaskTemplateService } from './hr-task-template.service.js';

@Module({
  imports: [PrismaModule, AuthModule, HrAuthModule, HrSchedulerModule],
  controllers: [HrTaskTemplateController],
  providers: [HrTaskTemplateService],
  exports: [HrTaskTemplateService],
})
export class HrTaskTemplateModule {}
