import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module.js';
import { AuthModule } from '../../auth/auth.module.js';
import { HrAuthModule } from '../hr-auth/hr-auth.module.js';
import { HrEventsModule } from '../hr-events/hr-events.module.js';
import { HrTaskSendController } from './hr-task-send.controller.js';
import { HrTaskSendService } from './hr-task-send.service.js';

@Module({
  imports: [PrismaModule, AuthModule, HrAuthModule, HrEventsModule],
  controllers: [HrTaskSendController],
  providers: [HrTaskSendService],
  exports: [HrTaskSendService],
})
export class HrTaskSendModule {}
