import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationModule } from '../notification/notification.module.js';
import { RestockTaskController } from './restock-task.controller.js';
import { RestockTaskService } from './restock-task.service.js';

@Module({
  imports: [AuthModule, NotificationModule],
  controllers: [RestockTaskController],
  providers: [RestockTaskService],
  exports: [RestockTaskService],
})
export class RestockTaskModule {}
