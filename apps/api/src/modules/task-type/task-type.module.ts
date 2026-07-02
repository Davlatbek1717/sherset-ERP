import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { TaskTypeController } from './task-type.controller.js';
import { TaskTypeService } from './task-type.service.js';

@Module({
  imports: [AuthModule],
  controllers: [TaskTypeController],
  providers: [TaskTypeService],
  exports: [TaskTypeService],
})
export class TaskTypeModule {}
