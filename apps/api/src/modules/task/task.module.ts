import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationModule } from '../notification/notification.module.js';
import { TaskController } from './task.controller.js';
import { TaskService } from './task.service.js';

@Module({
  imports: [AuthModule, NotificationModule],
  controllers: [TaskController],
  providers: [TaskService],
  exports: [TaskService],
})
export class TaskModule {}
