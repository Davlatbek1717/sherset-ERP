import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ProcessingStageController } from './processing-stage.controller.js';
import { ProcessingStageService } from './processing-stage.service.js';

@Module({
  imports: [AuthModule],
  controllers: [ProcessingStageController],
  providers: [ProcessingStageService],
  exports: [ProcessingStageService],
})
export class ProcessingStageModule {}
