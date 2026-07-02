import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MarkingController } from './marking.controller.js';
import { MarkingService } from './marking.service.js';

@Module({
  imports: [AuthModule],
  controllers: [MarkingController],
  providers: [MarkingService],
  exports: [MarkingService],
})
export class MarkingModule {}
