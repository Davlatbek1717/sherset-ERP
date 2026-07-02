import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module.js';
import { AuthModule } from '../../auth/auth.module.js';
import { HrAuthModule } from '../hr-auth/hr-auth.module.js';
import { HrTaskSendModule } from '../hr-task-send/hr-task-send.module.js';
import { HrTaskReviewController } from './hr-task-review.controller.js';
import { HrTaskReviewService } from './hr-task-review.service.js';

@Module({
  imports: [PrismaModule, AuthModule, HrAuthModule, HrTaskSendModule],
  controllers: [HrTaskReviewController],
  providers: [HrTaskReviewService],
  exports: [HrTaskReviewService],
})
export class HrTaskReviewModule {}
