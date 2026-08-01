import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { ShiftScheduleController } from './shift-schedule.controller.js';
import { ShiftScheduleService } from './shift-schedule.service.js';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [ShiftScheduleController],
  providers: [ShiftScheduleService],
  exports: [ShiftScheduleService],
})
export class ShiftScheduleModule {}
